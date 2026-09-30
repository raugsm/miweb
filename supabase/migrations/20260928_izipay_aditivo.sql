-- Integracion Izipay (pasarela Peru, cobro en SOLES/PEN con Yape) — TODO ADITIVO.
-- No rompe Binance/MixPay ni clientes viejos. Reusa negocio.recarga y la funcion
-- idempotente negocio.recarga_acreditar (candado por estado + despacho credito/licencia).
--
-- IMPORTANTE: NO aplicar todavia. Revisar primero. Aplicar con apply_migration
-- (usuario postgres) cuando lleguen las credenciales sandbox de Izipay.

-- 1) Columnas aditivas en negocio.recarga. Nullable => las filas viejas quedan igual.
alter table negocio.recarga add column if not exists monto_pen numeric;  -- soles cobrados por Izipay
alter table negocio.recarga add column if not exists pasarela  text;     -- 'izipay' | 'binance' | 'mixpay' | ...

-- 2) Parametros de precio en soles y el interruptor de activacion.
--    Ajustables por el dueno sin tocar codigo (negocio.parametro).
insert into negocio.parametro (clave, valor) values
  ('izipay_precio_credito_pen',  '3.50'),   -- 1 credito = 1 USD ~ S/3.50
  ('izipay_precio_licencia_pen', '157.50'), -- licencia anual = 45 USD ~ S/157.50
  ('izipay_activo',              'false')   -- se pone 'true' al terminar las pruebas sandbox
on conflict (clave) do nothing;
