-- YAPE (Peru) — paso 1 de 2: ETIQUETAS DE ENUM (100% aditivo, no rompe nada).
-- Van SOLAS en su propia migracion a proposito: Postgres no permite USAR un valor
-- de enum en la misma transaccion en que se agrega. La migracion 2 (engine) ya los
-- usa, por eso deben ir en migraciones/transacciones distintas.
--
-- REGLA DE ORO: solo suma etiquetas nuevas. Binance (usd/usdt, binance_pay_c2c) y
-- todo lo existente queda intacto. conciliar() de Binance ya ignora lo que no es
-- 'USDT', asi que los pagos Yape (moneda 'pen') nunca entran a su casacion.

alter type public.metodo_cobro add value if not exists 'yape';
alter type public.moneda      add value if not exists 'pen';
