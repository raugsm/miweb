-- 20261029172500_frp_saldo_patch.sql — Ari-Web, 29-oct-2026
-- Pedido de Peter: (1) pagar_con_saldo no puede aceptar un cobro vivo; (2) devolver saldo en TRABADO sin gasto;
-- (3) validar el wrapper sop_frp.saldo_servicio (sop_credito no está expuesto). No publica 1.1.23.
-- Aprobado por Peter en su chat (29-oct).

-- 1) pagar_con_saldo: cancelar/rechazar cobro vivo + marcar pago:saldo en el lote.
create or replace function sop_frp.pagar_con_saldo(p_lote_id uuid)
returns jsonb language plpgsql security definer
set search_path to 'sop_frp', 'sop_credito', 'negocio', 'pago', 'public' as $fn$
declare
  v_uid    uuid := auth.uid();
  v_taller uuid;
  v_lote   sop_frp.lote;
  v_cent   integer;
  v_res    jsonb;
  v_n      integer := 0;
  v_cobro  uuid;
  v_estado text;
  v_cancel jsonb;
begin
  if v_uid is null then raise exception 'sin_sesion'; end if;
  v_taller := sop_credito.taller_actual();
  if v_taller is null then raise exception 'sin_taller'; end if;

  select * into v_lote
    from sop_frp.lote
   where id = p_lote_id and taller_uid = v_uid and estado = 'activo'
   for update;
  if v_lote.id is null then raise exception 'lote_inexistente'; end if;

  -- NUEVO: si hay un cobro vivo, cancelarlo (si está a tiempo) o rechazar. Nunca doble pago.
  v_cobro := coalesce(v_lote.cobro_id, sop_frp.cobro_del_lote(p_lote_id));
  if v_cobro is not null then
    select e.estado::text into v_estado
      from pago.cobro_estado e
     where e.cobro_id = v_cobro
     order by e.desde desc limit 1;
    if v_estado = 'confirmado' then
      return jsonb_build_object('ok', false, 'motivo', 'pago_ya_resuelto', 'cobro_id', v_cobro);
    elsif v_estado in ('retenido', 'en_revision') then
      raise exception 'pago_en_curso: hay un cobro vivo (%)', v_estado;
    elsif v_estado in ('creado', 'en_espera') then
      begin
        v_cancel := pago.cobro_cancelar(v_uid, v_cobro);
      exception when others then
        raise exception 'pago_en_curso: %', sqlerrm;
      end;
      if not coalesce((v_cancel ->> 'ok')::boolean, false) then
        raise exception 'pago_en_curso: %', coalesce(v_cancel ->> 'motivo', 'no_se_pudo_cancelar');
      end if;
    end if;
  end if;

  -- Idempotente: si ya hay un caso activo pagado, no vuelve a cobrar.
  if exists (select 1 from sop_frp.caso
              where lote_id = p_lote_id and estado = 'activo' and pago_situacion = 'confirmado') then
    select coalesce(saldo, 0) into v_cent from negocio.credito_cuenta where usuario_ref = v_taller;
    return jsonb_build_object('ok', true, 'repetido', true, 'lote_id', p_lote_id,
                              'casos', 0, 'saldo_centavos', v_cent, 'metodo', 'saldo');
  end if;

  if not exists (select 1 from sop_frp.caso
                  where lote_id = p_lote_id and estado = 'activo'
                    and situacion in ('pendiente_conexion', 'en_proceso')
                    and pago_situacion in ('pendiente', 'sin_pago', 'en_revision')) then
    raise exception 'sin_casos_por_pagar';
  end if;

  v_cent := round(coalesce(v_lote.total_usd, 0) * 100)::int;
  if v_cent <= 0 then raise exception 'precio_invalido'; end if;

  v_res := sop_credito.consumir(v_taller, v_cent, 'frp', p_lote_id::text,
                                'FRP ' || coalesce(v_lote.codigo, ''), v_uid, v_lote.pais);
  if not coalesce((v_res ->> 'ok')::boolean, false) then
    return jsonb_build_object(
      'ok', false,
      'motivo', coalesce(v_res ->> 'motivo', 'saldo_insuficiente'),
      'saldo_centavos', coalesce((v_res ->> 'saldo_centavos')::int, 0),
      'faltan_centavos', coalesce((v_res ->> 'faltan_centavos')::int, 0),
      'precio_centavos', v_cent);
  end if;

  update sop_frp.caso
     set pago_situacion = 'confirmado',
         pagado_en = now(),
         pagado_por = v_uid,
         pago_motivo = null
   where lote_id = p_lote_id and estado = 'activo'
     and situacion in ('pendiente_conexion', 'en_proceso')
     and pago_situacion in ('pendiente', 'sin_pago', 'en_revision');
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'sin_casos_por_pagar'; end if;

  insert into sop_frp.historial (caso_id, situacion, nota, creado_por)
    select c.id, c.situacion, 'pago con saldo · ' || v_cent || ' centavos', v_uid
      from sop_frp.caso c
     where c.lote_id = p_lote_id and c.estado = 'activo'
       and c.pago_situacion = 'confirmado';

  update sop_frp.lote
     set actualizado_en = now(),
         cobro_id = null,
         info_adicional = case
           when coalesce(info_adicional, '') ilike '%pago:saldo%' then info_adicional
           else nullif(concat_ws('·', nullif(info_adicional, ''), 'pago:saldo'), '')
         end
   where id = p_lote_id;

  perform sop_auditoria.registro('sop_frp.pagar_con_saldo', 'sop_frp', 'lote', p_lote_id::text,
    jsonb_build_object('casos', v_n, 'centavos', v_cent, 'taller', v_taller,
                       'saldo_despues', (v_res ->> 'saldo_centavos')::int,
                       'cobro_cancelado', v_cobro));

  return jsonb_build_object('ok', true, 'repetido', false, 'lote_id', p_lote_id,
    'casos', v_n, 'centavos', v_cent, 'saldo_centavos', (v_res ->> 'saldo_centavos')::int,
    'metodo', 'saldo');
end $fn$;
revoke all on function sop_frp.pagar_con_saldo(uuid) from public, anon;
grant execute on function sop_frp.pagar_con_saldo(uuid) to authenticated, service_role;

-- 2) proceso_clasificar: devolver=true solo en TRABADO sin gasto (proveedor, sin cobro, sin llave).
--    Exitoso/cancelado/terminal/post-llave: NO devuelven.
create or replace function frp.proceso_clasificar(p_lote uuid)
returns jsonb language sql stable security definer
set search_path to 'frp', 'sop_frp', 'negocio', 'public' as $fn$
  with ult0 as (
    select coalesce(a.motivo_clave,
                    (select c.codigo from frp.clasificar_texto(a.respuesta) c limit 1)) as motivo_clave
      from frp.auth_intento a
     where a.lote_id = p_lote
       and (a.motivo_clave is not null or a.respuesta is not null)
     order by a.fecha_registro desc limit 1
  ), ult as (
    select u.motivo_clave, m.clasificacion, m.ambito, m.devolver, m.reintentable
      from ult0 u
      left join frp.motivo_terminal m on m.codigo = u.motivo_clave
  ), llv as (
    select coalesce(a.llave_solicitada_en,
                    case when a.ruta ilike '%requestAuth%' or a.aceptado is true then a.fecha_registro end) as llave_en
      from frp.auth_intento a
     where a.lote_id = p_lote
       and (a.llave_solicitada_en is not null or a.ruta ilike '%requestAuth%' or a.aceptado is true)
     order by a.fecha_registro desc limit 1
  ), ev as (
    select e.etapa || coalesce(':' || e.resultado, '') as ultimo_evento,
           e.motivo as evento_motivo, e.resultado as evento_resultado
      from frp.evento e
     where e.lote_id = p_lote
     order by e.creado_en desc limit 1
  ), cnt as (
    select count(*) as intentos_proveedor
      from frp.auth_intento a2
     where a2.lote_id = p_lote
       and a2.fecha_registro > now() - interval '24 hours'
       and coalesce(
             (select m2.ambito from frp.motivo_terminal m2 where m2.codigo = a2.motivo_clave),
             (select c.ambito from frp.clasificar_texto(a2.respuesta) c limit 1)
           ) = 'proveedor'
  ), cas as (
    select c.situacion, c.pago_situacion
      from sop_frp.caso c
     where c.lote_id = p_lote and c.estado = 'activo'
     order by c.creado_en desc limit 1
  ), cob as (
    select coalesce(bool_or(a.aceptado is true), false) as hubo_cobro
      from frp.auth_intento a
     where a.lote_id = p_lote
  )
  select jsonb_build_object(
    'lote_id', p_lote,
    'situacion', cas.situacion,
    'pago_situacion', cas.pago_situacion,
    'motivo', coalesce(ev.evento_motivo, ult.motivo_clave),
    'clasificacion', case
                       when ev.evento_resultado in ('terminal','soporte') then 'terminal'
                       when ev.evento_resultado = 'reintentable' then 'retryable'
                       else ult.clasificacion end,
    'ambito', case
                when ev.evento_resultado in ('terminal','soporte') then 'equipo'
                when ev.evento_resultado = 'reintentable' then coalesce(ult.ambito, 'red')
                else ult.ambito end,
    'devolver', case
                  when cas.situacion in ('exitoso', 'cancelado') then false
                  when llv.llave_en is not null then false
                  when cob.hubo_cobro then false
                  when ult.motivo_clave in ('retry_daily_limit','retry_limit_service','blocked_account','blocked_credit','blocked_not_enough') then true
                  else false end,
    'hubo_cobro', cob.hubo_cobro,
    'reintentable', case when llv.llave_en is not null then false
                         when ev.evento_resultado = 'reintentable' then true
                         else coalesce(ult.reintentable, false) end,
    'llave_solicitada_en', llv.llave_en,
    'post_llave', llv.llave_en is not null,
    'requiere_soporte', (llv.llave_en is not null and cas.situacion in ('pendiente_conexion', 'en_proceso')),
    'ultimo_evento', ev.ultimo_evento,
    'evento_motivo', ev.evento_motivo,
    'evento_resultado', ev.evento_resultado,
    'intentos_proveedor', cnt.intentos_proveedor,
    'proveedor_sugerido', frp.proveedor_sugerido()
  )
  from (select 1) b
  left join ult on true
  left join llv on true
  left join ev on true
  left join cas on true
  cross join cnt
  cross join cob;
$fn$;
revoke all on function frp.proceso_clasificar(uuid) from public, anon, authenticated;
grant execute on function frp.proceso_clasificar(uuid) to service_role;

-- 3) Devolución de saldo para TRABADO sin gasto (solo service_role / pg_cron).
create or replace function sop_frp.devolver_saldo_lote(p_lote_id uuid, p_motivo text default null)
returns jsonb language plpgsql security definer
set search_path to 'sop_frp', 'sop_credito', 'negocio', 'frp', 'public' as $fn$
declare
  v_lote   sop_frp.lote;
  v_taller uuid;
  v_cent   integer;
  v_clas   jsonb;
  v_res    jsonb;
begin
  select * into v_lote from sop_frp.lote where id = p_lote_id for update;
  if v_lote.id is null then raise exception 'lote_inexistente'; end if;

  -- Solo si el lote se pagó con saldo (hay consumo 'frp' con esta referencia).
  select coalesce(-sum(cantidad), 0) into v_cent
    from negocio.credito_movimiento
   where tipo = 'consumo' and servicio = 'frp' and referencia = p_lote_id::text;
  if v_cent <= 0 then
    return jsonb_build_object('ok', false, 'motivo', 'no_pagado_con_saldo');
  end if;

  v_clas := frp.proceso_clasificar(p_lote_id);
  if not coalesce((v_clas ->> 'devolver')::boolean, false) then
    return jsonb_build_object('ok', false, 'motivo', 'no_corresponde_devolucion', 'clasificacion', v_clas);
  end if;

  v_taller := sop_credito.taller_de(v_lote.taller_uid);
  if v_taller is null then
    return jsonb_build_object('ok', false, 'motivo', 'sin_taller');
  end if;

  v_res := sop_credito.devolver(v_taller, v_cent, 'frp', p_lote_id::text,
             coalesce(nullif(btrim(p_motivo), ''), 'devolucion por trabado sin gasto'), null);

  perform sop_auditoria.registro('sop_frp.devolver_saldo_lote', 'sop_frp', 'lote', p_lote_id::text,
    jsonb_build_object('centavos', v_cent, 'resultado', v_res, 'clasificacion', v_clas));

  return v_res || jsonb_build_object('lote_id', p_lote_id, 'centavos', v_cent);
end $fn$;
revoke all on function sop_frp.devolver_saldo_lote(uuid, text) from public, anon, authenticated;
grant execute on function sop_frp.devolver_saldo_lote(uuid, text) to service_role;

-- 4) Wrapper de saldo: sop_credito no está expuesto; solo authenticated/service_role.
revoke all on function sop_frp.saldo_servicio() from public, anon;
grant execute on function sop_frp.saldo_servicio() to authenticated, service_role;

-- Rollback: restaurar sop_frp.pagar_con_saldo desde AriTool_Recursos/sql/20261029-frp-pagar-saldo.sql;
-- restaurar frp.proceso_clasificar desde miweb/supabase/migrations/20261028233100_orquestador_frp_fix_multiprotool.sql;
-- drop function if exists sop_frp.devolver_saldo_lote(uuid,text);
-- grant execute on function sop_frp.saldo_servicio() to anon; (estado previo)
