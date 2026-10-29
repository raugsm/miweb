-- 20261029235000_liberacion_reservar_auth.sql — Ari-Web, 29-oct-2026
-- Evita que un usuario autenticado reserve/libere un lote de otro taller.
begin;

CREATE OR REPLACE FUNCTION sop_frp.liberacion_reservar(p_taller_uid uuid, p_lote_id uuid, p_idempotencia uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'sop_frp', 'public'
AS $function$
declare
  v_lote sop_frp.lote;
  v_caso sop_frp.caso;
  v_cache jsonb;
  v_resp jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' and auth.uid() is distinct from p_taller_uid then
    raise exception 'no_autorizado: el lote no es de tu taller';
  end if;
  if p_taller_uid is null then raise exception 'sin_sesion'; end if;
  select * into v_lote from sop_frp.lote where id = p_lote_id and estado = 'activo' for update;
  if v_lote.id is null or v_lote.taller_uid is distinct from p_taller_uid then raise exception 'lote_ajeno'; end if;

  if p_idempotencia is not null then
    select respuesta into v_cache from sop_frp.idempotencia
      where clave = p_idempotencia and operacion = 'frp_reserva';
    if v_cache is not null then return v_cache; end if;
  end if;

  select * into v_caso from sop_frp.caso
   where lote_id = p_lote_id and estado = 'activo'
     and situacion not in ('exitoso','fallido','cancelado')
     and coalesce(conexion_estado,'') not in ('autorizado','servido')
   order by orden limit 1 for update;
  if v_caso.id is null then raise exception 'sin_cupo'; end if;
  if v_caso.pago_situacion <> 'confirmado' then raise exception 'pago_no_confirmado'; end if;

  update sop_frp.caso
     set conexion_estado = 'autorizado',
         conexion_en = now(),
         situacion = case when situacion = 'pendiente_conexion' then 'en_proceso'::sop_frp.situacion else situacion end
   where id = v_caso.id;
  insert into sop_frp.historial (caso_id, situacion, nota)
    select c.id, c.situacion, 'liberaciÃ³n autorizada (pago confirmado Â· candado server)'
      from sop_frp.caso c where c.id = v_caso.id;

  v_resp := jsonb_build_object('ok', true, 'lote_id', p_lote_id,
    'caso_id', v_caso.id, 'orden', v_caso.orden, 'codigo', v_caso.codigo);
  if p_idempotencia is not null then
    insert into sop_frp.idempotencia (clave, operacion, device_id, respuesta)
    values (p_idempotencia, 'frp_reserva', v_lote.device_id, v_resp) on conflict (clave) do nothing;
  end if;
  perform sop_auditoria.registro('sop_frp.liberacion_reservar', 'sop_frp', 'caso', v_caso.id::text,
    jsonb_build_object('lote', p_lote_id, 'orden', v_caso.orden, 'codigo', v_caso.codigo));
  return v_resp;
end $function$
;

commit;
