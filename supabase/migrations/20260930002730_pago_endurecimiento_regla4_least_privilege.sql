-- REGLA 4 (least-privilege): funciones SECURITY DEFINER de dinero/mantenimiento
-- NO deben ser ejecutables por anon/authenticated via /rest/v1/rpc. Revocar PUBLIC y
-- dejar solo service_role (el backend/edge). Reversible con GRANT.
revoke execute on function pago.yape_revision_resolver(uuid, uuid, text) from public, anon, authenticated;
grant  execute on function pago.yape_revision_resolver(uuid, uuid, text) to service_role;

revoke execute on function pago.yape_barrer() from public, anon, authenticated;
grant  execute on function pago.yape_barrer() to service_role;

revoke execute on function pago.cobro_confirmar_servicio(uuid, text) from public, anon, authenticated;
grant  execute on function pago.cobro_confirmar_servicio(uuid, text) to service_role;

revoke execute on function pago.cobro_crear_servicio(uuid, numeric, text) from public, anon, authenticated;
grant  execute on function pago.cobro_crear_servicio(uuid, numeric, text) to service_role;

-- yape_revision era la UNICA tabla del esquema pago sin RLS. Activar (deny-all sin policy:
-- solo alcanzable por funciones SECURITY DEFINER / service_role bypassrls) y alinear grants.
alter table pago.yape_revision enable row level security;
grant select, insert, update on pago.yape_revision to service_role;