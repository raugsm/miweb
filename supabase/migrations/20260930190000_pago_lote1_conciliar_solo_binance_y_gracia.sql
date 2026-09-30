-- LOTE 1 — Blindaje del vigía Binance y del barredor.
-- A1: conciliar() dejaba 'ignorado' a TODO pago no-USDT, incluidos los Yape ('pen'),
--     que quedaban huérfanos permanentes. Ahora conciliar() SOLO procesa la fuente
--     Binance ('pay_c2c'); jamás toca filas Yape (las posee el subsistema Yape).
-- A2: un pago tardío/segundo pago contra un cobro CERRADO se marcaba 'duplicado' sin
--     mirar si ese txid ya se había acreditado -> dinero real perdido y mal etiquetado.
--     Ahora: si el txid ya está en acreditacion -> 'duplicado' (real); si NO -> 'revision'
--     (dinero nuevo contra cobro cerrado, visible/accionable) + evento 'observacion'.
--     Además se saca 'caducado' de la lista de cerrados: un cobro caducado cuyo pago
--     llega con código+monto correctos se ACREDITA igual (gracia; el código ARI es único
--     por cobro y el exactly-once de acreditacion sigue impidiendo doble crédito).
-- A4: yape_barrer() caducaba también los cobros 'retenido' (plata grande ya recibida,
--     en revisión). Se quita 'retenido' de la caducidad: un hold no vence por el reloj
--     del pago. (El resolver de holds llega en el Lote 3.)
-- Aditivo, sin cambios de enum. No altera la vía feliz de Binance.

create or replace function pago.conciliar()
 returns jsonb language plpgsql security definer set search_path to 'pago','negocio','public'
as $function$
declare r record; v_cobro uuid; v_monto bigint; v_cred int; v_creado timestamptz; v_estado public.estado_cobro;
        v_es_recarga boolean;
        v_umbral int := coalesce(current_setting('pago.umbral_hold', true)::int, 200); v_acred int := 0;
begin
  for r in
    select pv.txid, pm.monto_unidad, pmo.moneda, pn.nota, pv.visto_en, pt.tipo
    from pago.pago_visto pv
    join pago.pago_visto_estado pe on pe.txid = pv.txid
      and pe.desde = (select max(desde) from pago.pago_visto_estado x where x.txid = pv.txid)
    left join pago.pago_visto_fuente pf on pf.txid = pv.txid
    left join pago.pago_visto_monto pm on pm.txid = pv.txid
    left join pago.pago_visto_moneda pmo on pmo.txid = pv.txid
    left join pago.pago_visto_nota pn on pn.txid = pv.txid
    left join pago.pago_visto_tipo pt on pt.txid = pv.txid
    where pe.estado = 'nuevo'
      and coalesce(pf.fuente, 'pay_c2c') = 'pay_c2c'   -- A1: solo Binance; nunca Yape ni otras fuentes
  loop
    if upper(coalesce(r.moneda,'')) <> 'USDT' then
      insert into pago.pago_visto_estado(txid, estado) values (r.txid, 'ignorado'); continue;
    end if;
    if r.tipo ~* 'REFUND|REVERS|_RF' or coalesce(r.monto_unidad,0) <= 0 then
      insert into pago.pago_visto_estado(txid, estado) values (r.txid, 'reverso'); continue;
    end if;
    select cc.cobro_id into v_cobro from pago.cobro_codigo cc where cc.codigo = pago.codigo_normalizar(r.nota) limit 1;
    if v_cobro is null then
      insert into pago.pago_visto_estado(txid, estado) values (r.txid, 'sin_codigo'); continue;
    end if;
    select cm.monto_unidad, cb.creado_en, rec.creditos, (cr.cobro_id is not null)
      into v_monto, v_creado, v_cred, v_es_recarga
      from pago.cobro_monto cm join pago.cobro cb on cb.id = cm.cobro_id
      left join pago.cobro_recarga cr on cr.cobro_id = cm.cobro_id
      left join negocio.recarga rec on rec.codigo = cr.recarga_id
      where cm.cobro_id = v_cobro;
    select estado into v_estado from pago.cobro_estado where cobro_id = v_cobro order by desde desc limit 1;
    -- A2: cobro cerrado de verdad. 'caducado' YA NO entra acá (recibe gracia más abajo).
    if v_estado in ('confirmado','revertido','anulado') then
      if exists (select 1 from pago.acreditacion a where a.pago_txid = r.txid) then
        insert into pago.pago_visto_estado(txid, estado) values (r.txid, 'duplicado');   -- mismo txid ya acreditado
      else
        insert into pago.pago_visto_estado(txid, estado) values (r.txid, 'revision');    -- dinero nuevo contra cobro cerrado
        perform pago.evento_registrar(v_cobro, 'observacion',
          jsonb_build_object('motivo','pago_contra_cobro_cerrado','txid', r.txid, 'cobro_estado', v_estado::text, 'monto_unidad', r.monto_unidad));
      end if;
      continue;
    end if;
    if r.monto_unidad <> v_monto then
      insert into pago.pago_visto_estado(txid, estado) values (r.txid, 'monto_distinto'); continue;
    end if;
    if v_creado > r.visto_en then
      insert into pago.pago_visto_estado(txid, estado) values (r.txid, 'revision'); continue;
    end if;
    if coalesce(v_es_recarga, false) and v_cred > v_umbral then
      insert into pago.cobro_estado(cobro_id, estado) values (v_cobro, 'retenido');
      insert into pago.pago_visto_estado(txid, estado) values (r.txid, 'revision');
      perform pago.evento_registrar(v_cobro, 'retencion', jsonb_build_object('txid', r.txid, 'creditos', v_cred)); continue;
    end if;
    if coalesce(v_es_recarga, false) then
      if pago.cobro_acreditar(v_cobro, r.txid) then           -- gracia: revive cobro 'caducado' con pago correcto
        insert into pago.pago_visto_estado(txid, estado) values (r.txid, 'casado'); v_acred := v_acred + 1;
      else
        insert into pago.pago_visto_estado(txid, estado) values (r.txid, 'duplicado');
      end if;
    else
      if pago.cobro_confirmar_servicio(v_cobro, r.txid) then
        insert into pago.pago_visto_estado(txid, estado) values (r.txid, 'casado'); v_acred := v_acred + 1;
      else
        insert into pago.pago_visto_estado(txid, estado) values (r.txid, 'duplicado');
      end if;
    end if;
  end loop;
  return jsonb_build_object('acreditados', v_acred);
end $function$;

create or replace function pago.yape_barrer()
 returns jsonb language plpgsql security definer set search_path to 'pago','negocio','public'
as $function$
declare v_cad int := 0; v_orf int := 0; r record;
begin
  for r in
    select c.id
    from pago.cobro c
    join pago.cobro_vencimiento cv on cv.cobro_id = c.id
    where cv.vence_en < now()
      and (select estado from pago.cobro_estado e where e.cobro_id = c.id order by desde desc limit 1)
          in ('creado','en_espera')   -- A4: 'retenido' ya no se caduca
  loop
    insert into pago.cobro_estado(cobro_id, estado) values (r.id, 'caducado');
    v_cad := v_cad + 1;
  end loop;

  for r in
    select pv.txid
    from pago.pago_visto pv
    join pago.pago_visto_fuente   pf on pf.txid = pv.txid and pf.fuente = 'yape'
    join pago.pago_visto_ocurrido po on po.txid = pv.txid
    where po.ocurrido < now() - interval '24 hours'
      and not exists (select 1 from pago.acreditacion a where a.pago_txid = pv.txid)
      and (select estado from pago.pago_visto_estado e where e.txid = pv.txid order by desde desc limit 1)
          in ('nuevo','sin_codigo')
  loop
    insert into pago.pago_visto_estado(txid, estado) values (r.txid, 'ignorado');
    v_orf := v_orf + 1;
  end loop;

  return jsonb_build_object('ok', true, 'caducados', v_cad, 'huerfanos', v_orf);
end $function$;

revoke execute on function pago.conciliar()   from public, anon, authenticated;
grant  execute on function pago.conciliar()   to service_role;
revoke execute on function pago.yape_barrer()  from public, anon, authenticated;
grant  execute on function pago.yape_barrer()  to service_role;
