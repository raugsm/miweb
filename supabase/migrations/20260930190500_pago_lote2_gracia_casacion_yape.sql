-- LOTE 2 — Gracia de casación Yape (A3). Espejo de la gracia Binance del Lote 1.
-- Problema: la caducidad Yape es dura a 20 min y los 3 caminos de casación excluyen
--   'caducado'. Un pago Yape legítimo cuya notificación/declaración cruza el umbral se
--   perdía, contradiciendo la promesa de la UI ("si ya pagaste, se acreditará igual").
-- Arreglo: permitir casar contra cobros 'caducado' SIEMPRE que el pago haya ocurrido
--   dentro de la ventana de vida del cobro [creado-10min, creado+2h]. Cota superior atada
--   a la CREACIÓN del cobro (no a now()) para que un pago reciente no revive un cobro
--   caducado antiguo con el mismo código de 3 dígitos + monto (los códigos Yape se reusan).
--   El exactly-once (acreditacion) y la retención por ambigüedad (>=2 candidatos -> revision)
--   siguen intactos. Aditivo, sin cambios de enum.

-- 1) Ingesta (APK): incluir 'caducado' como candidato + acotar ventana superior.
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
      and v_ocurrido <= c.creado_en + interval '2 hours'          -- A3: cota de gracia
      and (select estado from pago.cobro_estado e where e.cobro_id = cd.cobro_id order by desde desc limit 1)
          not in ('confirmado','anulado','revertido','en_revision');   -- A3: 'caducado' YA casa (gracia)

  v_n := coalesce(array_length(v_cands, 1), 0);
  if v_n = 0 then return; end if;
  if v_n = 1 then perform pago.yape_acreditar_par(v_cands[1], p_txid); return; end if;

  -- AMBIGUO: retener el pago + congelar candidatos + alertar (nunca misrutear)
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

-- 2) Declaración (web): permitir declarar sobre 'caducado' + acotar ventana superior a creado+2h.
create or replace function pago.yape_casar_cobro(p_cobro uuid)
 returns jsonb language plpgsql security definer set search_path to 'pago','public'
as $function$
declare v_codn text; v_monto bigint; v_creado timestamptz; v_estado public.estado_cobro;
  v_txids text[]; v_n int; t text; v_rev uuid; v_rest int; v_gracia interval := interval '10 minutes';
begin
  perform pg_advisory_xact_lock(hashtext('yape_cobro:' || p_cobro::text));
  select estado into v_estado from pago.cobro_estado where cobro_id = p_cobro order by desde desc limit 1;
  if v_estado = 'confirmado' then return jsonb_build_object('ok', true, 'ya', true); end if;
  if v_estado = 'en_revision' then return jsonb_build_object('ok', false, 'motivo', 'en_revision'); end if;
  if v_estado in ('anulado','revertido') then                    -- A3: 'caducado' YA no se rechaza (gracia)
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
      and po.ocurrido <= v_creado + interval '2 hours'            -- A3: cota de gracia (antes now()+5min)
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

  -- v_n >= 2: ambiguo por el lado del pago -> retener
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

-- 3) Puerta de declaración (web): permitir que el cliente declare su código sobre un cobro 'caducado'.
create or replace function pago.yape_declarar(p_usuario uuid, p_cobro uuid, p_codigo text)
 returns jsonb language plpgsql security definer set search_path to 'pago','public'
as $function$
declare v_owner uuid; v_codn text; v_estado public.estado_cobro; v_user_intentos int;
  v_distintos int; v_primero timestamptz; v_ya_declarado boolean;
begin
  v_codn := regexp_replace(coalesce(p_codigo,''),'[^0-9]','','g');
  if length(v_codn) < 3 then return jsonb_build_object('ok', false, 'motivo', 'codigo_invalido'); end if;

  select cu.usuario_id into v_owner from pago.cobro_usuario cu where cu.cobro_id = p_cobro;
  if v_owner is null then return jsonb_build_object('ok', false, 'motivo', 'cobro_desconocido'); end if;
  if v_owner <> p_usuario then raise exception 'no_autorizado'; end if;
  if not exists (select 1 from pago.cobro_metodo where cobro_id = p_cobro and metodo = 'yape') then
    return jsonb_build_object('ok', false, 'motivo', 'no_yape'); end if;

  select estado into v_estado from pago.cobro_estado where cobro_id = p_cobro order by desde desc limit 1;
  if v_estado = 'confirmado' then return jsonb_build_object('ok', true, 'ya', true); end if;
  if v_estado = 'en_revision' then return jsonb_build_object('ok', false, 'motivo', 'en_revision'); end if;
  if v_estado in ('anulado','revertido') then                   -- A3: 'caducado' YA acepta declaración (gracia)
    return jsonb_build_object('ok', false, 'motivo', 'cobro_' || v_estado::text); end if;

  select count(distinct ed.detalle->>'yape_declara'), min(e.ocurrido_en)
    into v_distintos, v_primero
    from pago.evento e
    join pago.evento_cobro   ec on ec.evento_id = e.id
    join pago.evento_tipo    et on et.evento_id = e.id
    join pago.evento_detalle ed on ed.evento_id = e.id
    where ec.cobro_id = p_cobro and et.tipo = 'observacion'
      and ed.detalle ? 'yape_declara'
      and e.ocurrido_en > now() - interval '15 minutes';

  v_ya_declarado := exists (
    select 1 from pago.evento e
    join pago.evento_cobro ec on ec.evento_id = e.id
    join pago.evento_tipo et on et.evento_id = e.id
    join pago.evento_detalle ed on ed.evento_id = e.id
    where ec.cobro_id = p_cobro and et.tipo = 'observacion'
      and ed.detalle->>'yape_declara' = v_codn
      and e.ocurrido_en > now() - interval '15 minutes');

  if v_distintos >= 3 then
    return jsonb_build_object('ok', false, 'motivo', 'bloqueado', 'soporte', true,
      'minutos', greatest(1, ceil(extract(epoch from (v_primero + interval '15 minutes' - now())) / 60))::int);
  end if;

  select count(*) into v_user_intentos
    from pago.evento e
    join pago.evento_cobro   ec on ec.evento_id = e.id
    join pago.evento_tipo    et on et.evento_id = e.id
    join pago.evento_detalle ed on ed.evento_id = e.id
    join pago.cobro_usuario  cu on cu.cobro_id = ec.cobro_id
    where cu.usuario_id = p_usuario and et.tipo = 'observacion'
      and ed.detalle ? 'yape_declara' and e.ocurrido_en > now() - interval '1 hour'
      and (select estado from pago.cobro_estado ce where ce.cobro_id = ec.cobro_id order by ce.desde desc limit 1) <> 'confirmado';
  if v_user_intentos >= 12 then
    return jsonb_build_object('ok', false, 'motivo', 'bloqueo_temporal', 'minutos', 60);
  end if;

  insert into pago.cobro_yape_codigo(cobro_id, codigo, intentos) values (p_cobro, v_codn, 1)
    on conflict (cobro_id) do update
      set codigo = excluded.codigo,
          intentos = pago.cobro_yape_codigo.intentos
                     + case when pago.cobro_yape_codigo.codigo <> excluded.codigo then 1 else 0 end,
          declarado_en = now();

  if not v_ya_declarado then
    perform pago.evento_registrar(p_cobro, 'observacion', jsonb_build_object('yape_declara', v_codn));
  end if;

  return pago.yape_casar_cobro(p_cobro);
end $function$;

revoke execute on function pago.yape_casar_pago(text)          from public, anon, authenticated;
grant  execute on function pago.yape_casar_pago(text)          to service_role;
revoke execute on function pago.yape_casar_cobro(uuid)         from public, anon, authenticated;
grant  execute on function pago.yape_casar_cobro(uuid)         to service_role;
revoke execute on function pago.yape_declarar(uuid,uuid,text)  from public, anon, authenticated;
grant  execute on function pago.yape_declarar(uuid,uuid,text)  to service_role;
