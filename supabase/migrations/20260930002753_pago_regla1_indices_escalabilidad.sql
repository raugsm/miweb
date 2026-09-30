-- REGLA 1 (escalable): el casado y el barrido filtraban por columnas sin indice (seq scan
-- O(n) en el camino caliente de cada pago). Indices btree, aditivo, sin bloqueo real (tablas chicas).
create index if not exists cobro_yape_codigo_codigo_ix on pago.cobro_yape_codigo (codigo);
create index if not exists cobro_monto_monto_ix          on pago.cobro_monto (monto_unidad);
create index if not exists cobro_vencimiento_vence_ix    on pago.cobro_vencimiento (vence_en);
create index if not exists pago_visto_ocurrido_ix        on pago.pago_visto_ocurrido (ocurrido);