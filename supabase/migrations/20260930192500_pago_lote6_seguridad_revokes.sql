-- LOTE 6 (A7) — Endurecimiento de privilegios (defensa en profundidad).
-- El frontend NO lee tablas directo (solo auth + edge functions) y los edges usan
-- service_role, así que quitar los grants a anon/authenticated no rompe nada y cierra
-- dos footguns reales:
--   1) DML de anon/authenticated sobre negocio.* — incluye negocio.parametro, que guarda
--      binance_pay_id / yape_destino / precios (la config de RUTEO del dinero). Hoy no es
--      alcanzable (sin USAGE + RLS deny-all), pero el grant estaba puesto: se retira.
--   2) USAGE del schema pago para anon/authenticated + EXECUTE por defecto a PUBLIC en
--      funciones nuevas — para que una función futura mal configurada no quede invocable
--      por cualquiera vía /rest/v1/rpc. service_role conserva todo.
-- (pg_net no expone funciones alcanzables aquí, no se toca.) Aditivo, reversible.

revoke all privileges on all tables in schema negocio from anon, authenticated;
alter default privileges in schema negocio revoke all on tables from anon, authenticated;

revoke usage on schema pago from anon, authenticated;
alter default privileges in schema pago revoke execute on functions from public;
