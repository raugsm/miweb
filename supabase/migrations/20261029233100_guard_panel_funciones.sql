-- 20261029233100_guard_panel_funciones.sql — Ari-Web, 29-oct-2026
-- Defensa en profundidad: estas funciones las usa el panel con JWT authenticated.
-- Antes no validaban capacidad; ahora exigen sop_frp.gestion/config.gestion.
-- service_role sigue pasando para edge/automatizacion.
-- No cambia la logica de negocio.

begin;

-- pago.validar_confirmar(text,uuid) (plpgsql)
CREATE OR REPLACE FUNCTION pago.validar_confirmar(p_txid text, p_cobro uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pago', 'public'
AS $function$
declare v_ok boolean; v_chk jsonb;
begin
  -- Guard de capacidad: panel/operador con sop_frp.gestion o config.gestion.
  -- service_role (edge/automatizacion) pasa sin JWT de usuario.
  if coalesce(auth.role(), '') <> 'service_role'
     and not (sop_acceso.tiene_capacidad('sop_frp.gestion') or sop_acceso.tiene_capacidad('config.gestion')) then
    raise exception 'sin_capacidad: sop_frp.gestion';
  end if;
  if p_txid is null or p_cobro is null then return jsonb_build_object('ok', false, 'motivo', 'faltan_datos'); end if;
  if not exists (select 1 from pago.pago_visto where txid = p_txid) then return jsonb_build_object('ok', false, 'motivo', 'pago_desconocido'); end if;
  if exists (select 1 from pago.acreditacion where pago_txid = p_txid) then return jsonb_build_object('ok', false, 'motivo', 'pago_ya_acreditado'); end if;
  -- [2026-10-23] el pago ya fue asignado a un taller como huÃ©rfano (FRP): no se acredita dos veces
  if (select e.estado::text from pago.pago_visto_estado e where e.txid = p_txid order by e.desde desc limit 1) = 'asignado' then
    return jsonb_build_object('ok', false, 'motivo', 'pago_ya_asignado'); end if;
  if not exists (select 1 from pago.cobro where id = p_cobro) then return jsonb_build_object('ok', false, 'motivo', 'cobro_desconocido'); end if;
  -- [2026-10-26] pagÃ³ de menos: no se acredita (misma regla que los hooks del 20-oct)
  v_chk := pago.monto_insuficiente(p_cobro, p_txid);
  if v_chk is not null then return jsonb_build_object('ok', false) || v_chk; end if;
  perform pg_advisory_xact_lock(hashtext('validar:' || p_txid));
  v_ok := pago.cobro_confirmar_servicio(p_cobro, p_txid);
  if not v_ok then return jsonb_build_object('ok', false, 'motivo', 'no_acreditable'); end if;
  insert into pago.pago_visto_estado(txid, estado) values (p_txid, 'casado');
  perform pago.evento_registrar(p_cobro, 'recuperacion', jsonb_build_object('motivo', 'validacion_manual', 'txid', p_txid));
  return jsonb_build_object('ok', true, 'casado', true, 'cobro', p_cobro, 'txid', p_txid);
end $function$
;

-- sop_frp.pago_ficha(text) (sql)
CREATE OR REPLACE FUNCTION sop_frp.pago_ficha(p_txid text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'sop_frp', 'pago', 'sop_comun', 'negocio', 'seguridad', 'public'
AS $function$
begin
  -- Guard de capacidad: panel/operador con sop_frp.gestion o config.gestion.
  -- service_role (edge/automatizacion) pasa sin JWT de usuario.
  if coalesce(auth.role(), '') <> 'service_role'
     and not (sop_acceso.tiene_capacidad('sop_frp.gestion') or sop_acceso.tiene_capacidad('config.gestion')) then
    raise exception 'sin_capacidad: sop_frp.gestion';
  end if;
  return (
select jsonb_build_object(
    'codigo_notificacion', coalesce((select pn.nota from pago.pago_visto_nota pn where pn.txid = p_txid), ''),
    'codigo_cliente', coalesce((select cyc.codigo from pago.acreditacion a
                                join pago.cobro_yape_codigo cyc on cyc.cobro_id = a.cobro_id
                                where a.pago_txid = p_txid), ''),
    'taller', coalesce((select sop_comun.taller_nombre(cu.usuario_id) from pago.acreditacion a
                        join pago.cobro_usuario cu on cu.cobro_id = a.cobro_id
                        where a.pago_txid = p_txid), ''),
    'correo', coalesce((select sc.correo::text from pago.acreditacion a
                        join pago.cobro_usuario cu on cu.cobro_id = a.cobro_id
                        join negocio.usuario_taller ut on ut.codigo = cu.usuario_id
                        join seguridad.cuenta sc on sc.codigo = ut.cuenta_ref
                        where a.pago_txid = p_txid), ''),
    'pagador', coalesce((select pa.pagador from pago.pago_visto_pagador pa where pa.txid = p_txid), ''),
    'pagador_baneado', exists (select 1 from pago.pagador_baneado b
                               join pago.pago_visto_pagador pa on pa.txid = p_txid
                               where pa.pagador = b.pagador)
  )
  );
end
$function$;

-- sop_frp.pago_candidatos(text) (sql)
CREATE OR REPLACE FUNCTION sop_frp.pago_candidatos(p_txid text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'sop_frp', 'pago', 'sop_comun', 'negocio', 'seguridad', 'public'
AS $function$
begin
  -- Guard de capacidad: panel/operador con sop_frp.gestion o config.gestion.
  -- service_role (edge/automatizacion) pasa sin JWT de usuario.
  if coalesce(auth.role(), '') <> 'service_role'
     and not (sop_acceso.tiene_capacidad('sop_frp.gestion') or sop_acceso.tiene_capacidad('config.gestion')) then
    raise exception 'sin_capacidad: sop_frp.gestion';
  end if;
  return (
with abiertos as (
    select distinct on (cobro_id) cobro_id, estado
      from pago.cobro_estado e
     order by cobro_id, desde desc
  )
  select coalesce((
    select jsonb_agg(jsonb_build_object(
      'revision', r.id,
      'cobro_id', rc.cobro_id,
      'codigo', cc.codigo,
      'codigo_yape', cyc.codigo,
      'coincide_codigo', coalesce(cyc.codigo, '') = coalesce(regexp_replace(pn.nota, '[^0-9]', '', 'g'), ''),
      'monto', round(cm.monto_unidad / 100.0, 2),
      'moneda', cmo.moneda,
      'servicio', cs.servicio,
      'at', coalesce(
         (select l.codigo from sop_frp.lote l where l.id::text = cs.referencia_externa limit 1),
         (select pm.codigo from sop_cuenta_mi.pedido pm where pm.cobro_id = c.id limit 1)),
      'creado', c.creado_en,
      'minutos_antes', greatest(0, round(extract(epoch from (po.ocurrido - c.creado_en)) / 60.0))::int,
      'estado', a.estado,
      'dueno', coalesce(sop_comun.taller_nombre(cu.usuario_id), 'â'),
      'correo', coalesce(sc.correo::text, '')
    ) order by (coalesce(cyc.codigo, '') = coalesce(regexp_replace(pn.nota, '[^0-9]', '', 'g'), '')) desc,
               abs(extract(epoch from (c.creado_en - po.ocurrido))))
    from pago.yape_revision r
    join pago.yape_revision_pago rp on rp.revision_id = r.id and rp.txid = p_txid
    join pago.yape_revision_candidato rc on rc.revision_id = r.id
    join pago.cobro c on c.id = rc.cobro_id
    join pago.pago_visto_ocurrido po on po.txid = rp.txid
    left join pago.pago_visto_nota pn on pn.txid = rp.txid
    left join abiertos a on a.cobro_id = c.id
    left join pago.cobro_codigo cc on cc.cobro_id = c.id
    left join pago.cobro_yape_codigo cyc on cyc.cobro_id = c.id
    left join pago.cobro_monto cm on cm.cobro_id = c.id
    left join pago.cobro_moneda cmo on cmo.cobro_id = c.id
    left join pago.cobro_servicio cs on cs.cobro_id = c.id
    left join pago.cobro_usuario cu on cu.cobro_id = c.id
    left join negocio.usuario_taller ut on ut.codigo = cu.usuario_id
    left join seguridad.cuenta sc on sc.codigo = ut.cuenta_ref
    where (select estado from pago.yape_revision_estado e where e.revision_id = r.id order by desde desc limit 1) = 'pendiente'
      and coalesce(a.estado, 'creado') not in ('confirmado','revertido','anulado')
  ), '[]'::jsonb)
  );
end
$function$;

-- sop_frp.pagador_banear(text,text) (plpgsql)
CREATE OR REPLACE FUNCTION sop_frp.pagador_banear(p_pagador text, p_motivo text DEFAULT 'estafa_intento'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'sop_frp', 'pago', 'public'
AS $function$
begin
  -- Guard de capacidad: panel/operador con sop_frp.gestion o config.gestion.
  -- service_role (edge/automatizacion) pasa sin JWT de usuario.
  if coalesce(auth.role(), '') <> 'service_role'
     and not (sop_acceso.tiene_capacidad('sop_frp.gestion') or sop_acceso.tiene_capacidad('config.gestion')) then
    raise exception 'sin_capacidad: sop_frp.gestion';
  end if;
  if coalesce(btrim(p_pagador), '') = '' then
    return jsonb_build_object('ok', false, 'motivo', 'pagador_vacio');
  end if;
  insert into pago.pagador_baneado(pagador, motivo, baneado_por)
  values (p_pagador, coalesce(p_motivo, 'estafa_intento'), 'panel')
  on conflict (pagador) do update set motivo = excluded.motivo;
  perform pago.fraude_registrar(null, p_pagador, null, null, 'baneo_manual_panel');
  return jsonb_build_object('ok', true, 'pagador', p_pagador);
end $function$
;

-- sop_frp.conciliacion_auditoria(text) (sql)
CREATE OR REPLACE FUNCTION sop_frp.conciliacion_auditoria(p_txid text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'sop_frp', 'pago', 'sop_comun', 'public'
AS $function$
begin
  -- Guard de capacidad: panel/operador con sop_frp.gestion o config.gestion.
  -- service_role (edge/automatizacion) pasa sin JWT de usuario.
  if coalesce(auth.role(), '') <> 'service_role'
     and not (sop_acceso.tiene_capacidad('sop_frp.gestion') or sop_acceso.tiene_capacidad('config.gestion')) then
    raise exception 'sin_capacidad: sop_frp.gestion';
  end if;
  return (
select jsonb_build_object(
    'estados', coalesce((
      select jsonb_agg(jsonb_build_object('estado', e.estado, 'desde', e.desde) order by e.desde)
      from pago.pago_visto_estado e where e.txid = p_txid
    ), '[]'::jsonb),
    'eventos', coalesce((
      select jsonb_agg(jsonb_build_object('tipo', et.tipo, 'ocurrido', e.ocurrido_en, 'detalle', ed.detalle) order by e.ocurrido_en)
      from pago.evento e
      join pago.evento_tipo et on et.evento_id = e.id
      join pago.evento_detalle ed on ed.evento_id = e.id
      where ed.detalle->>'txid' = p_txid
    ), '[]'::jsonb),
    'asignaciones', coalesce((
      select jsonb_agg(jsonb_build_object('codigo', l.codigo, 'creado', l.creado_en,
                                          'cliente', sop_comun.taller_nombre(l.taller_uid)) order by l.creado_en desc)
      from sop_frp.lote l
      where l.info_adicional like 'asignacion-manual:' || p_txid || '%'
    ), '[]'::jsonb)
  )
  );
end
$function$;

-- sop_frp.pendientes_de_servir(integer) (plpgsql)
CREATE OR REPLACE FUNCTION sop_frp.pendientes_de_servir(p_horas integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'sop_frp', 'frp', 'negocio', 'seguridad', 'public'
AS $function$
declare v_horas int := greatest(coalesce(p_horas, 1), 0);
begin
  -- Guard de capacidad: panel/operador con sop_frp.gestion o config.gestion.
  -- service_role (edge/automatizacion) pasa sin JWT de usuario.
  if coalesce(auth.role(), '') <> 'service_role'
     and not (sop_acceso.tiene_capacidad('sop_frp.gestion') or sop_acceso.tiene_capacidad('config.gestion')) then
    raise exception 'sin_capacidad: sop_frp.gestion';
  end if;
  perform sop_frp.exigir_gestion();
  return (
    with v as materialized (select * from sop_frp.frp_lote_ventana()),
    q as (
      select l.id as lote_id, l.codigo, l.pais, l.cantidad,
             count(*)                                                     as pendientes,
             min(c.pagado_en)                                             as pagado_en,
             floor(extract(epoch from (now() - min(c.pagado_en))) / 60.0)::int as minutos,
             (select count(*) from frp.auth_intento ai where ai.lote_id = l.id)                               as intentos,
             (select count(*) from frp.auth_intento ai where ai.lote_id = l.id and ai.aceptado is true)       as aceptados,
             (select coalesce(sum(ai.costo),0) from frp.auth_intento ai where ai.lote_id = l.id and ai.aceptado is true) as creditos,
             bool_or(c.cierre_pago = 'guardado')                          as guardado,
             min(c.situacion::text)                                       as caso,
             min(c.pago_situacion::text)                                  as pago,
             -- corridas de la app atribuidas al pedido (exacto por lote_id o heurÃ­stico por usuario + ventana, como el Registro)
             (select count(*) from frp.trabajo t, v
               where v.lote_id = l.id
                 and (t.lote_id = l.id
                      or (t.lote_id is null and t.usuario_ref = v.usuario
                          and t.fecha_registro >= v.creado_en - interval '2 minutes'
                          and t.fecha_registro < coalesce(v.siguiente, v.creado_en + interval '12 hours')))) as corridas,
             (select bool_or(t.estado = 'exitoso') from frp.trabajo t, v
               where v.lote_id = l.id
                 and (t.lote_id = l.id
                      or (t.lote_id is null and t.usuario_ref = v.usuario
                          and t.fecha_registro >= v.creado_en - interval '2 minutes'
                          and t.fecha_registro < coalesce(v.siguiente, v.creado_en + interval '12 hours')))) as hay_exitosa
      from sop_frp.caso c
      join sop_frp.lote l on l.id = c.lote_id
      where c.pago_situacion = 'confirmado'
        and c.situacion in ('pendiente_conexion', 'en_proceso')
        and c.estado = 'activo'
        and l.estado = 'activo'
        and c.pagado_en is not null
        and c.pagado_en < now() - make_interval(hours => v_horas)
      group by l.id, l.codigo, l.pais, l.cantidad
    )
    select jsonb_build_object(
      'horas', v_horas,
      'total', count(*),
      'items', coalesce(jsonb_agg(jsonb_build_object(
          'codigo',     q.codigo,
          'lote_id',    q.lote_id,
          'pais',       q.pais,
          'cantidad',   q.cantidad,
          'pendientes', q.pendientes,
          'pagado_en',  q.pagado_en,
          'minutos',    q.minutos,
          'frenado',    coalesce((g.r->>'ok')::boolean, true) = false,
          'motivo',     case when coalesce((g.r->>'ok')::boolean, true) then null else g.r->>'motivo' end,
          'intentos',   q.intentos,
          'aceptados',  q.aceptados,
          'creditos',   q.creditos,
          'guardado',   q.guardado,
          'corridas',   q.corridas,
          'resultado',  sop_frp.frp_pedido_resultado(q.caso, q.pago, null, case when q.guardado then 'guardado' else null end,
                                                     coalesce(q.hay_exitosa, false), q.intentos, q.aceptados, q.guardado, q.corridas)
        ) order by q.pagado_en asc), '[]'::jsonb)
    )
    from q
    cross join lateral (select frp.equipo_autorizar_permitido(q.lote_id, null, '') as r) g
  );
end
$function$
;

commit;
