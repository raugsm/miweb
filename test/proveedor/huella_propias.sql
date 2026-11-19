-- Huella de las 6 herramientas PROPIAS con opción enlazada (solo lectura). Se corre ANTES y DESPUÉS de aplicar algo del
-- proveedor: tiene que dar igual («las propias mantienen su lógica», Peter 18-nov). Incluye sus filas y el texto de TODAS
-- las funciones de sop_alquiler (precio, catálogo, crear, cobro, Soporte, devolución…), que nada de lo mío toca.
select json_build_object(
  'herramientas', (select json_agg(json_build_object('clave', clave, 'precio_usdt', precio_usdt, 'recargo_usdt', recargo_usdt, 'visible', visible,
                     'horas', horas, 'modo_cambio', modo_cambio) order by clave)
                   from sop_alquiler.herramienta
                   where clave in ('android_multi_tool','dft_pro','tfm_tool_pro','tr_tools_pro','tsm_tool_pro','unlock_tool')),
  'config_proveedor', (select json_agg(herramienta order by herramienta) from sop_proveedor.producto_config
                   where herramienta in ('android_multi_tool','dft_pro','tfm_tool_pro','tr_tools_pro','tsm_tool_pro','unlock_tool')),
  'funciones_sop_alquiler', (select json_object_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', md5(pg_get_functiondef(p.oid)))
                   from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'sop_alquiler'),
  'disparadores_sop_alquiler', (select json_agg(tgname order by tgname) from pg_trigger t join pg_class c on c.oid = t.tgrelid
                   join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'sop_alquiler' and not t.tgisinternal)
);
