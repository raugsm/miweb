-- 2026-10-12: MEJORA FUERTE DE CASACION YAPE (lunes, con OK de Peter).
-- P-01: monto_distinto con detalle (codigo exacto + monto distinto -> respuesta visible).
-- P-02: nada silencioso en yape_ingerir (el error de casacion queda en el log).
-- P-03: yape_barrer YA NO marca 'ignorado' pagos reales automaticamente: solo caduca
--       cobros; los huerfanos quedan 'nuevo' (visibles) hasta decision humana.
-- ADITIVO: create or replace de 3 funciones del motor. No toca tablas ni datos.

-- =====================================================================
-- yape_barrer: solo caduca cobros. El barrido de huerfanos se elimina
-- (la plata real NUNCA se marca ignorado sin humano).
-- =====================================================================
create or replace function pago.yape_barrer()
returns jsonb
language plpgsql security definer set search_path to 'pago','negocio','public'
as $function$
declare v_cad int := 0; r record;
begin
  for r in
    select c.id
    from pago.cobro c
    join pago.cobro_vencimiento cv on cv.cobro_id = c.id
    where cv.vence_en < now()
      and (select estado from pago.cobro_estado e where e.cobro_id = c.id order by desde desc limit 1)
          in ('creado','en_espera')
  loop
    insert into pago.cobro_estado(cobro_id, estado) values (r.id, 'caducado');
    v_cad := v_cad + 1;
  end loop;

  return jsonb_build_object('ok', true, 'caducados', v_cad, 'huerfanos', 0);
end $function$;

-- =====================================================================
-- yape_casar_cobro: suma 'monto_distinto' con detalle (P-01). Cuando el
-- tecnico declara el codigo EXACTO pero el monto del pago difiere del cobro,
-- responde monto_distinto + monto_pagado/monto_cobro (la app puede avisar
-- "falta S/ 0.08"). La regla de casar SOLO monto exacto NO cambia.
-- =====================================================================
create or replace function pago.yape_casar_cobro(p_cobro uuid)
returns jsonb language plpgsql security definer set search_path to 'pago','public'
as $function$
declare v_codn text; v_monto bigint; v_creado timestamptz; v_estado public.estado_cobro;
  v_txids text[]; v_n int; t text; v_rev uuid; v_rest int; v_gracia interval := interval '10 minutes';
  v_otro_monto bigint;
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

    -- P-01: mismo codigo pero monto distinto -> aviso util (no es esperando a ciegas).
    select pm.monto_unidad into v_otro_monto
      from pago.pago_visto pv
      join pago.pago_visto_fuente   pf on pf.txid = pv.txid and pf.fuente = 'yape'
      join pago.pago_visto_monto    pm on pm.txid = pv.txid
      join pago.pago_visto_nota     pn on pn.txid = pv.txid
      join pago.pago_visto_ocurrido po on po.txid = pv.txid
      where regexp_replace(pn.nota, '[^0-9]', '', 'g') = v_codn
        and po.ocurrido >= v_creado - v_gracia and po.ocurrido <= v_creado + interval '2 hours'
        and not exists (select 1 from pago.acreditacion a where a.pago_txid = pv.txid)
        and (select estado from pago.pago_visto_estado e where e.txid = pv.txid order by desde desc limit 1)
            not in ('casado','reverso','ignorado','revision')
      order by po.ocurrido desc limit 1;
    if v_otro_monto is not null and v_otro_monto <> v_monto then
      return jsonb_build_object('ok', false, 'motivo', 'monto_distinto',
        'intentos_restantes', v_rest,
        'monto_cobro', v_monto, 'monto_pagado', v_otro_monto,
        'falta', greatest(v_monto - v_otro_monto, 0));
    end if;

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
-- yape_ingerir: el error de casacion ya no es silencioso (P-02): queda
-- como WARNING en el log de Postgres con el detalle.
-- =====================================================================
create or replace function pago.yape_ingerir(p_dispositivo text, p_huella text, p_monto_centimos bigint, p_codigo text, p_pagador text, p_ocurrido timestamp with time zone)
returns jsonb
language plpgsql security definer set search_path to 'pago','public'
as $function$
declare v_estado text; v_nuevo boolean;
begin
  v_estado := pago.yape_dispositivo_estado(p_dispositivo);
  if v_estado <> 'activo' then return jsonb_build_object('ok', false, 'motivo', 'dispositivo_' || v_estado); end if;
  update pago.yape_dispositivo set ultimo_visto = now() where dispositivo = p_dispositivo;
  v_nuevo := pago.pago_ingerir(p_txid => p_huella, p_monto => coalesce(p_monto_centimos, 0), p_moneda => 'pen',
    p_nota => coalesce(p_codigo, ''), p_pagador => coalesce(p_pagador, ''),
    p_ocurrido => coalesce(p_ocurrido, now()), p_tipo => 'yape_recibido', p_fuente => 'yape');
  begin
    perform pago.yape_casar_pago(p_huella);
  exception when others then
    raise warning 'yape_casar_pago fallo para huella "%" (pago ya ingresado): %', p_huella, sqlerrm;
  end;
  return jsonb_build_object('ok', true, 'nuevo', v_nuevo);
end $function$;

revoke execute on function pago.yape_barrer()                                       from public, anon, authenticated;
grant  execute on function pago.yape_barrer()                                       to service_role;
revoke execute on function pago.yape_casar_cobro(uuid)                              from public, anon, authenticated;
grant  execute on function pago.yape_casar_cobro(uuid)                              to service_role;
revoke execute on function pago.yape_ingerir(text,text,bigint,text,text,timestamptz) from public, anon, authenticated;
grant  execute on function pago.yape_ingerir(text,text,bigint,text,text,timestamptz) to service_role;
