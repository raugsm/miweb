-- 2026-10-11: reporte publico de precios FRP + Cuentas MI para la WEB.
-- FUENTE DE VERDAD = las tablas que escribe el PANEL (Ari-Master) en el gateway:
--   sop_config.ajuste           -> frp_costo_usd / frp_precio_usd (precio unico USD)
--   sop_config.precio_servicio  -> cuenta_mi por pais (costo_usd, precio_usd)
--   sop_config.tasa_cambio      -> tasa por pais
-- La edge publica precio_publico llama esta funcion por RPC (service_role); las
-- tablas sop_config no estan expuestas por REST, por eso todo via funcion.
-- El shape devuelto espeja las claves historicas del builder de la web
-- (frp_cost_usdt/frp_profit_usdt/cuenta_mi_cost_usdt[_xx]/cuenta_mi_profit_usdt[_xx]).
-- ADITIVO: no escribe nada, solo lee.

create or replace function negocio.precio_publico_report()
returns jsonb
language sql stable security definer set search_path to 'negocio','sop_config','public'
as $$
  with frp as (
    select coalesce((select nullif(valor,'')::numeric from sop_config.ajuste where clave = 'frp_costo_usd'), 0) as costo,
           coalesce((select nullif(valor,'')::numeric from sop_config.ajuste where clave = 'frp_precio_usd'), 0) as precio
  ), settings_frp as (
    select jsonb_build_array(
      jsonb_build_object('key', 'frp_cost_usdt',   'value', f.costo::text),
      jsonb_build_object('key', 'frp_profit_usdt', 'value', greatest(f.precio - f.costo, 0)::text)
    ) as arr from frp f where f.precio > 0
  ), settings_mi as (
    select coalesce(jsonb_agg(s.item), '[]'::jsonb) as arr from (
      select jsonb_build_object('key', 'cuenta_mi_cost_usdt_' || lower(pais), 'value', costo_usd::text) as item
        from sop_config.precio_servicio
       where servicio_clave = 'cuenta_mi' and estado = 'activo' and coalesce(precio_usd, 0) > 0
      union all
      select jsonb_build_object('key', 'cuenta_mi_profit_usdt_' || lower(pais), 'value', greatest(coalesce(precio_usd,0) - coalesce(costo_usd,0), 0)::text)
        from sop_config.precio_servicio
       where servicio_clave = 'cuenta_mi' and estado = 'activo' and coalesce(precio_usd, 0) > 0
    ) s
  ), tasas as (
    select coalesce(jsonb_agg(
      jsonb_build_object('country_code', upper(pais), 'currency', upper(coalesce(moneda::text, 'usdt')), 'rate', tasa::text)
    ), '[]'::jsonb) as arr
    from sop_config.tasa_cambio
    where estado = 'activo' and lower(pais) <> 'base'
  )
  select jsonb_build_object(
    'settings', coalesce((select arr from settings_frp), '[]'::jsonb)
                 || coalesce((select arr from settings_mi), '[]'::jsonb),
    'tasas', coalesce((select arr from tasas), '[]'::jsonb)
             || '[{"country_code":"USDT","currency":"USDT","rate":"1"}]'::jsonb,
    'actualizado_en', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );
$$;

revoke execute on function negocio.precio_publico_report() from public, anon, authenticated;
grant  execute on function negocio.precio_publico_report() to service_role;
