-- 2026-10-11: TOLERANCIA DE MONTO +-10 CENTIMOS EN LA CASACION YAPE.
-- PROBLEMA REAL (2026-10-11): los talleres pagan por Yape tecleando UNA sola decimal
-- (ej. cobro S/ 8.88 -> pagan S/ 8.8). El lector capta fielmente "8.8" (880 centimos),
-- pero la casacion exigia monto EXACTO (880 <> 888) -> el pago quedaba 'nuevo', el
-- cobro caducaba y el taller pagaba una SEGUNDA vez el monto exacto (friccion real,
-- 3 casos seguidos: Gilder, Erik, Miguel). El tecnico declaraba BIEN el codigo.
--
-- FIX: casar cuando el CODIGO de seguridad coincide EXACTO (identificador fuerte de
-- Yape, lo genera Yape por transaccion) y el monto difiere a lo sumo 10 centimos
-- (0.10 PEN). Preferencia al monto exacto si existe. Lo demas queda intacto
-- (gracia, cap duro, revisiones, exactly-once, append-only).
--
-- ADITIVO: create or replace de las 2 funciones del motor de casacion. No toca
-- tablas, no borra nada, no cambia acreditacion.

-- =====================================================================
-- yape_casar_cobro: cobro -> pago. Tolerancia +-10 centimos, exacto primero.
-- =====================================================================
create or replace function pago.yape_casar_cobro(p_cobro uuid)
returns jsonb language plpgsql security definer set search_path to 'pago','public'
as $function$
declare v_codn text; v_monto bigint; v_creado timestamptz; v_estado public.estado_cobro;
  v_txids text[]; v_n int; t text; v_rev uuid; v_distintos int; v_rest int; v_gracia interval := interval '10 minutes';
  v_tol bigint := 10; -- tolerancia de monto: +-10 centimos (0.10 PEN)
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

  -- Pasada 1: monto EXACTO + codigo exacto (comportamiento original).
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

  -- Pasada 2 (solo si la exacta no encontro nada): tolerancia +-10 centimos + codigo exacto.
  if v_txids is null then
    select array_agg(pv.txid) into v_txids
      from pago.pago_visto pv
      join pago.pago_visto_fuente   pf on pf.txid = pv.txid and pf.fuente = 'yape'
      join pago.pago_visto_monto    pm on pm.txid = pv.txid
      join pago.pago_visto_nota     pn on pn.txid = pv.txid
      join pago.pago_visto_ocurrido po on po.txid = pv.txid
      where pm.monto_unidad between v_monto - v_tol and v_monto + v_tol
        and regexp_replace(pn.nota, '[^0-9]', '', 'g') = v_codn
        and po.ocurrido >= v_creado - v_gracia
        and po.ocurrido <= v_creado + interval '2 hours'
        and not exists (select 1 from pago.acreditacion a where a.pago_txid = pv.txid)
        and (select estado from pago.pago_visto_estado e where e.txid = pv.txid order by desde desc limit 1)
            not in ('casado','reverso','ignorado','revision');
  end if;

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
      where pm.monto_unidad between v_monto - v_tol and v_monto + v_tol
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

  -- v_n >= 2: ambiguo por el lado del pago -> retener (sin cambios).
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
-- yape_casar_pago: pago -> cobro. Tolerancia +-10 centimos, exacto primero.
-- =====================================================================
create or replace function pago.yape_casar_pago(p_txid text)
returns void language plpgsql security definer set search_path to 'pago','public'
as $function$
declare v_monto bigint; v_codn text; v_ocurrido timestamptz; v_cands uuid[]; v_n int; c uuid; v_rev uuid;
  v_tol bigint := 10; -- tolerancia de monto: +-10 centimos (0.10 PEN)
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

  -- Pasada 1: monto EXACTO + codigo exacto (comportamiento original).
  select array_agg(cd.cobro_id) into v_cands
    from pago.cobro_yape_codigo cd
    join pago.cobro_monto cm on cm.cobro_id = cd.cobro_id and cm.monto_unidad = v_monto
    join pago.cobro c on c.id = cd.cobro_id
    where cd.codigo = v_codn
      and v_ocurrido >= c.creado_en - interval '10 minutes'
      and v_ocurrido <= c.creado_en + interval '2 hours'
      and (select estado from pago.cobro_estado e where e.cobro_id = cd.cobro_id order by desde desc limit 1)
          not in ('confirmado','anulado','revertido','en_revision');

  -- Pasada 2 (solo si la exacta no encontro nada): tolerancia +-10 centimos + codigo exacto.
  if v_cands is null then
    select array_agg(cd.cobro_id) into v_cands
      from pago.cobro_yape_codigo cd
      join pago.cobro_monto cm on cm.cobro_id = cd.cobro_id
        and cm.monto_unidad between v_monto - v_tol and v_monto + v_tol
      join pago.cobro c on c.id = cd.cobro_id
      where cd.codigo = v_codn
        and v_ocurrido >= c.creado_en - interval '10 minutes'
        and v_ocurrido <= c.creado_en + interval '2 hours'
        and (select estado from pago.cobro_estado e where e.cobro_id = cd.cobro_id order by desde desc limit 1)
            not in ('confirmado','anulado','revertido','en_revision');
  end if;

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
