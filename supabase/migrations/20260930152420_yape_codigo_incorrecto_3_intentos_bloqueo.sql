-- 3 intentos por cobro ante CODIGO INCORRECTO (probado: hay un pago del mismo monto en
-- ventana con otro codigo). Al 4to codigo distinto malo -> bloqueo 15 min + a soporte.
-- Esperar a que llegue el pago NO cuenta como intento (no penaliza al cliente honesto).

create or replace function pago.yape_declarar(p_usuario uuid, p_cobro uuid, p_codigo text)
returns jsonb language plpgsql security definer set search_path to 'pago','public'
as $function$
declare v_owner uuid; v_codn text; v_estado public.estado_cobro; v_user_intentos int;
  v_malos int; v_primero timestamptz;
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
  if v_estado in ('anulado','revertido','caducado') then
    return jsonb_build_object('ok', false, 'motivo', 'cobro_' || v_estado::text); end if;

  -- BLOQUEO por 3 codigos DISTINTOS incorrectos en 15 min (por cobro) -> a soporte.
  select count(distinct ed.detalle->>'yape_codigo_malo'), min(e.ocurrido_en)
    into v_malos, v_primero
    from pago.evento e
    join pago.evento_cobro   ec on ec.evento_id = e.id
    join pago.evento_tipo    et on et.evento_id = e.id
    join pago.evento_detalle ed on ed.evento_id = e.id
    where ec.cobro_id = p_cobro and et.tipo = 'observacion'
      and ed.detalle ? 'yape_codigo_malo'
      and e.ocurrido_en > now() - interval '15 minutes';
  if v_malos >= 3 then
    return jsonb_build_object('ok', false, 'motivo', 'bloqueado', 'soporte', true,
      'minutos', greatest(1, ceil(extract(epoch from (v_primero + interval '15 minutes' - now())) / 60))::int);
  end if;

  -- Rate-limit por USUARIO (anti fuerza bruta): 12 declaraciones/hora sobre cobros no confirmados.
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

  perform pago.evento_registrar(p_cobro, 'observacion', jsonb_build_object('yape_declara', v_codn));
  return pago.yape_casar_cobro(p_cobro);
end $function$;

create or replace function pago.yape_casar_cobro(p_cobro uuid)
returns jsonb language plpgsql security definer set search_path to 'pago','public'
as $function$
declare v_codn text; v_monto bigint; v_creado timestamptz; v_estado public.estado_cobro;
  v_txids text[]; v_n int; t text; v_rev uuid; v_malos int; v_gracia interval := interval '10 minutes';
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
      and po.ocurrido <= now() + interval '5 minutes'
      and not exists (select 1 from pago.acreditacion a where a.pago_txid = pv.txid)
      and (select estado from pago.pago_visto_estado e where e.txid = pv.txid order by desde desc limit 1)
          not in ('casado','reverso','ignorado','revision');

  v_n := coalesce(array_length(v_txids, 1), 0);
  if v_n = 1 then return pago.yape_acreditar_par(p_cobro, v_txids[1]); end if;

  if v_n = 0 then
    -- ¿hay un pago del MISMO monto en ventana pero con OTRO codigo? -> codigo mal tipeado.
    if exists (
      select 1 from pago.pago_visto pv
      join pago.pago_visto_fuente   pf on pf.txid = pv.txid and pf.fuente = 'yape'
      join pago.pago_visto_monto    pm on pm.txid = pv.txid
      join pago.pago_visto_nota     pn on pn.txid = pv.txid
      join pago.pago_visto_ocurrido po on po.txid = pv.txid
      where pm.monto_unidad = v_monto
        and po.ocurrido >= v_creado - v_gracia and po.ocurrido <= now() + interval '5 minutes'
        and not exists (select 1 from pago.acreditacion a where a.pago_txid = pv.txid)
        and (select estado from pago.pago_visto_estado e where e.txid = pv.txid order by desde desc limit 1)
            not in ('casado','reverso','ignorado','revision')
        and regexp_replace(pn.nota, '[^0-9]', '', 'g') <> v_codn
    ) then
      perform pago.evento_registrar(p_cobro, 'observacion', jsonb_build_object('yape_codigo_malo', v_codn));
      select count(distinct ed.detalle->>'yape_codigo_malo') into v_malos
        from pago.evento e
        join pago.evento_cobro   ec on ec.evento_id = e.id
        join pago.evento_tipo    et on et.evento_id = e.id
        join pago.evento_detalle ed on ed.evento_id = e.id
        where ec.cobro_id = p_cobro and et.tipo = 'observacion' and ed.detalle ? 'yape_codigo_malo'
          and e.ocurrido_en > now() - interval '15 minutes';
      return jsonb_build_object('ok', false, 'motivo', 'codigo_incorrecto',
        'intentos_restantes', greatest(0, 3 - v_malos));
    end if;
    return jsonb_build_object('ok', false, 'motivo', 'esperando');
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

revoke execute on function pago.yape_declarar(uuid,uuid,text)  from public, anon, authenticated;
grant  execute on function pago.yape_declarar(uuid,uuid,text)  to service_role;
revoke execute on function pago.yape_casar_cobro(uuid)         from public, anon, authenticated;
grant  execute on function pago.yape_casar_cobro(uuid)         to service_role;