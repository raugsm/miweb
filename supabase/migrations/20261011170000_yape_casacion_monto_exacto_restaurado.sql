-- 2026-10-11 (17:00): RESTAURA CASACION YAPE CON MONTO EXACTO (revert de 20261011160000).
-- DECISION DE PETER (2026-10-11): lo que se muestra en la app es dinero; no se puede
-- perder ni un centimo. El cliente DEBE mandar el monto exacto (8.88). La tolerancia
-- +-10 centimos aplicada horas antes queda REVERTIDA: vuelven las funciones originales
-- con pm.monto_unidad = v_monto (comparacion exacta).
-- El problema de fondo (app del taller mostrando 1 decimal) se corrige en la app, no
-- aflojando el dinero. ADITIVO: create or replace, no toca tablas ni datos.

-- =====================================================================
-- yape_casar_cobro: version ORIGINAL exacta (sin tolerancia).
-- =====================================================================
create or replace function pago.yape_casar_cobro(p_cobro uuid)
returns jsonb language plpgsql security definer set search_path to 'pago','public'
as $function$
declare v_codn text; v_monto bigint; v_creado timestamptz; v_estado public.estado_cobro;
  v_txids text[]; v_n int; t text; v_rev uuid; v_distintos int; v_rest int; v_gracia interval := interval '10 minutes';
begin
  perform pg_advisory_xact_lock(hashtext('yape_cobro:' || p_cobro::text));
  select estado into v_estado from pago.cobro_estado where cobro_id = p_cobro order by desde desc limit 1;
  if v_estado = 'confirmado' then return jsonb_build_object('ok', true, 'ya', true); end if;
  if v_estado = 'en_revision' then return jsonb_build_object('ok', false, 'motivo', 'en_revision'); end if;
  if v_estado in ('anulado','revertido','caducado') then
    return jsonb_build_object('ok', false, 'motivo', 'cobro_' || v_estado::text); end if;

  select codigo into v_codn from pago.cobro_yape_codigo where cobro_id = p_cobro;
  if v_codn is null then return jsonb_build_object('ok', false, 'motivo', 'sin_codigo'); end if;
  select monto_unidad into v_monto from pago.cobro_monto where cobro_id = p_cobro;
  select creado_en into v_creado from pago.cobro where id = p_cobro;

  select array_agg(pv.txid) into v_txids
    from pago.pago_visto pv
    join pago.pago_visto_fuente   pf on pf.txid = pv.txid and pf.fuente = 'yape'
    join pago.pago_visto_monto    pm on pm.txid = pv.txid
    join pago.pago_visto_nota     pn on pn.txid = pv.txid
    join pago.pago_visto_ocurrido po on po.txid = pv.txid
    where pm.monto_unidad = v_monto
      and regexp_replace(pn.nota, '[^0-9]', '', 'g') = v_codn
      and po.ocurrido >= v_creado - v_gracia
      and po.ocurrido <= v_creado + interval '2 hours'
      and not exists (select 1 from pago.acreditacion a where a.pago_txid = pv.txid)
      and (select estado from pago.pago_visto_estado e where e.txid = pv.txid order by desde desc limit 1)
          not in ('casado','reverso','ignorado','revision');

  v_n := coalesce(array_length(v_txids, 1), 0);
  if v_n = 1 then return pago.yape_acreditar_par(p_cobro, v_txids[1]); end if;

  if v_n = 0 then
    select greatest(0, 3 - count(distinct ed.detalle->>'yape_declara'))::int into v_rest
      from pago.evento e
      join pago.evento_cobro   ec on ec.evento_id = e.id
      join pago.evento_tipo    et on et.evento_id = e.id
      join pago.evento_detalle ed on ed.evento_id = e.id
      where ec.cobro_id = p_cobro and et.tipo = 'observacion' and ed.detalle ? 'yape_declara'
        and e.ocurrido_en > now() - interval '15 minutes';

    if exists (
      select 1 from pago.pago_visto pv
      join pago.pago_visto_fuente   pf on pf.txid = pv.txid and pf.fuente = 'yape'
      join pago.pago_visto_monto    pm on pm.txid = pv.txid
      join pago.pago_visto_nota     pn on pn.txid = pv.txid
      join pago.pago_visto_ocurrido po on po.txid = pv.txid
      where pm.monto_unidad = v_monto
        and po.ocurrido >= v_creado - v_gracia and po.ocurrido <= v_creado + interval '2 hours'
        and not exists (select 1 from pago.acreditacion a where a.pago_txid = pv.txid)
        and (select estado from pago.pago_visto_estado e where e.txid = pv.txid order by desde desc limit 1)
            not in ('casado','reverso','ignorado','revision')
        and regexp_replace(pn.nota, '[^0-9]', '', 'g') <> v_codn
    ) then
      return jsonb_build_object('ok', false, 'motivo', 'codigo_incorrecto', 'intentos_restantes', v_rest);
    end if;
    return jsonb_build_object('ok', false, 'motivo', 'esperando', 'intentos_restantes', v_rest);
  end if;

  v_rev := gen_random_uuid();
  insert into pago.yape_revision(id) values (v_rev);
  insert into pago.yape_revision_motivo(revision_id, motivo)      values (v_rev, 'cobro_ambiguo');
  insert into pago.yape_revision_monto(revision_id, monto_unidad) values (v_rev, v_monto);
  insert into pago.yape_revision_codigo(revision_id, codigo)      values (v_rev, v_codn);
  insert into pago.yape_revision_estado(revision_id, estado)      values (v_rev, 'pendiente');
  insert into pago.yape_revision_candidato(revision_id, cobro_id) values (v_rev, p_cobro);
  foreach t in array v_txids loop
    insert into pago.yape_revision_pago(revision_id, txid) values (v_rev, t);
  end loop;
  insert into pago.cobro_estado(cobro_id, estado) values (p_cobro, 'en_revision');
  perform pago.evento_registrar(p_cobro, 'observacion',
    jsonb_build_object('yape_ambiguo', true, 'lado','pago','revision', v_rev, 'monto', v_monto, 'codigo', v_codn, 'pagos', to_jsonb(v_txids)));
  return jsonb_build_object('ok', false, 'motivo', 'en_revision');
end $function$;

-- =====================================================================
-- yape_casar_pago: version ORIGINAL exacta (sin tolerancia).
-- =====================================================================
create or replace function pago.yape_casar_pago(p_txid text)
returns void language plpgsql security definer set search_path to 'pago','public'
as $function$
declare v_monto bigint; v_codn text; v_ocurrido timestamptz; v_cands uuid[]; v_n int; c uuid; v_rev uuid;
begin
  perform pg_advisory_xact_lock(hashtext('yape_pago:' || p_txid));
  if exists (select 1 from pago.acreditacion a where a.pago_txid = p_txid) then return; end if;

  select pm.monto_unidad, regexp_replace(pn.nota, '[^0-9]', '', 'g'), po.ocurrido
    into v_monto, v_codn, v_ocurrido
    from pago.pago_visto pv
    join pago.pago_visto_monto    pm on pm.txid = pv.txid
    join pago.pago_visto_nota     pn on pn.txid = pv.txid
    join pago.pago_visto_ocurrido po on po.txid = pv.txid
    where pv.txid = p_txid;
  if v_monto is null then return; end if;

  select array_agg(cd.cobro_id) into v_cands
    from pago.cobro_yape_codigo cd
    join pago.cobro_monto cm on cm.cobro_id = cd.cobro_id and cm.monto_unidad = v_monto
    join pago.cobro c on c.id = cd.cobro_id
    where cd.codigo = v_codn
      and v_ocurrido >= c.creado_en - interval '10 minutes'
      and v_ocurrido <= c.creado_en + interval '2 hours'
      and (select estado from pago.cobro_estado e where e.cobro_id = cd.cobro_id order by desde desc limit 1)
          not in ('confirmado','anulado','revertido','en_revision');

  v_n := coalesce(array_length(v_cands, 1), 0);
  if v_n = 0 then return; end if;
  if v_n = 1 then perform pago.yape_acreditar_par(v_cands[1], p_txid); return; end if;

  insert into pago.pago_visto_estado(txid, estado) values (p_txid, 'revision');
  v_rev := gen_random_uuid();
  insert into pago.yape_revision(id) values (v_rev);
  insert into pago.yape_revision_motivo(revision_id, motivo)        values (v_rev, 'pago_ambiguo');
  insert into pago.yape_revision_monto(revision_id, monto_unidad)   values (v_rev, v_monto);
  insert into pago.yape_revision_codigo(revision_id, codigo)        values (v_rev, v_codn);
  insert into pago.yape_revision_estado(revision_id, estado)        values (v_rev, 'pendiente');
  insert into pago.yape_revision_pago(revision_id, txid)            values (v_rev, p_txid);
  foreach c in array v_cands loop
    insert into pago.yape_revision_candidato(revision_id, cobro_id) values (v_rev, c);
    insert into pago.cobro_estado(cobro_id, estado)                 values (c, 'en_revision');
    perform pago.evento_registrar(c, 'observacion',
      jsonb_build_object('yape_ambiguo', true, 'lado','cobro','revision', v_rev, 'txid', p_txid, 'monto', v_monto, 'codigo', v_codn));
  end loop;
end $function$;

revoke execute on function pago.yape_casar_cobro(uuid) from public, anon, authenticated;
grant  execute on function pago.yape_casar_cobro(uuid) to service_role;
revoke execute on function pago.yape_casar_pago(text)  from public, anon, authenticated;
grant  execute on function pago.yape_casar_pago(text)  to service_role;
