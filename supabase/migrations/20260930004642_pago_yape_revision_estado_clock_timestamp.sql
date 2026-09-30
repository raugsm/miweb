-- Alinear con la convencion del esquema (cobro_estado/pago_visto_estado usan clock_timestamp,
-- que avanza dentro de una misma transaccion -> permite varias transiciones sin chocar el PK).
alter table pago.yape_revision_estado alter column desde set default clock_timestamp();