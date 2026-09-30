-- REGLA 3 (100% español): device -> dispositivo, version_code -> version_codigo.
-- Columnas (PK/indice/NOT NULL siguen la renombrada automaticamente).
alter table pago.yape_dispositivo rename column device to dispositivo;
alter table pago.yape_dispositivo rename column version_code to version_codigo;

-- Recrear las 3 funciones con param p_dispositivo (no se puede renombrar param via OR REPLACE).
drop function if exists pago.yape_ingerir(text, text, bigint, text, text, timestamptz);
drop function if exists pago.yape_latido(text, bigint, bigint);
drop function if exists pago.yape_dispositivo_estado(text);

create function pago.yape_dispositivo_estado(p_dispositivo text)
returns text language plpgsql security definer set search_path to 'pago','public'
as $function$
declare v_activo boolean;
begin
  select activo into v_activo from pago.yape_dispositivo where dispositivo = p_dispositivo;
  if v_activo is null then
    insert into pago.yape_dispositivo(dispositivo, etiqueta, activo)
      values (p_dispositivo, 'auto', false) on conflict (dispositivo) do nothing;
    return 'pendiente';
  end if;
  return case when v_activo then 'activo' else 'inactivo' end;
end $function$;

create function pago.yape_latido(p_dispositivo text, p_pendientes bigint, p_version bigint)
returns jsonb language plpgsql security definer set search_path to 'pago','public'
as $function$
declare v_estado text;
begin
  v_estado := pago.yape_dispositivo_estado(p_dispositivo);
  update pago.yape_dispositivo
     set ultimo_latido  = now(),
         pendientes     = coalesce(p_pendientes, pendientes),
         version_codigo = coalesce(p_version, version_codigo)
   where dispositivo = p_dispositivo;
  return jsonb_build_object('ok', true, 'estado', v_estado);
end $function$;

create function pago.yape_ingerir(p_dispositivo text, p_huella text, p_monto_centimos bigint, p_codigo text, p_pagador text, p_ocurrido timestamptz)
returns jsonb language plpgsql security definer set search_path to 'pago','public'
as $function$
declare v_estado text; v_nuevo boolean;
begin
  v_estado := pago.yape_dispositivo_estado(p_dispositivo);
  if v_estado <> 'activo' then return jsonb_build_object('ok', false, 'motivo', 'dispositivo_' || v_estado); end if;
  update pago.yape_dispositivo set ultimo_visto = now() where dispositivo = p_dispositivo;
  v_nuevo := pago.pago_ingerir(p_txid => p_huella, p_monto => coalesce(p_monto_centimos, 0), p_moneda => 'pen',
    p_nota => coalesce(p_codigo, ''), p_pagador => coalesce(p_pagador, ''),
    p_ocurrido => coalesce(p_ocurrido, now()), p_tipo => 'yape_recibido', p_fuente => 'yape');
  begin perform pago.yape_casar_pago(p_huella); exception when others then null; end;
  return jsonb_build_object('ok', true, 'nuevo', v_nuevo);
end $function$;

-- Re-blindar (DROP+CREATE resetea ACL a PUBLIC por defecto)
revoke execute on function pago.yape_dispositivo_estado(text) from public, anon, authenticated;
grant  execute on function pago.yape_dispositivo_estado(text) to service_role;
revoke execute on function pago.yape_latido(text, bigint, bigint) from public, anon, authenticated;
grant  execute on function pago.yape_latido(text, bigint, bigint) to service_role;
revoke execute on function pago.yape_ingerir(text, text, bigint, text, text, timestamptz) from public, anon, authenticated;
grant  execute on function pago.yape_ingerir(text, text, bigint, text, text, timestamptz) to service_role;