-- LOTE 5 (B7) — Inmutabilidad append-only del lado del DINERO.
-- Hoy el trigger evitar_cambio solo protege pago.evento / pago.evento_hash. Las tablas
-- que registran plata aplicada (acreditacion, reverso) y el historial de estados
-- (pago_visto_estado, cobro_estado) admitían UPDATE/DELETE con service_role, así que una
-- alteración silenciosa no rompía cadena_integra(). Se vuelven append-only (solo INSERT).
-- Todas se escriben SOLO con INSERT (acreditacion/reverso usan ON CONFLICT DO NOTHING,
-- que no dispara UPDATE), así que el trigger no rompe ningún flujo. Aditivo.

drop trigger if exists acreditacion_inmutable      on pago.acreditacion;
drop trigger if exists reverso_inmutable           on pago.reverso;
drop trigger if exists pago_visto_estado_inmutable on pago.pago_visto_estado;
drop trigger if exists cobro_estado_inmutable      on pago.cobro_estado;

create trigger acreditacion_inmutable
  before delete or update on pago.acreditacion
  for each row execute function pago.evitar_cambio();
create trigger reverso_inmutable
  before delete or update on pago.reverso
  for each row execute function pago.evitar_cambio();
create trigger pago_visto_estado_inmutable
  before delete or update on pago.pago_visto_estado
  for each row execute function pago.evitar_cambio();
create trigger cobro_estado_inmutable
  before delete or update on pago.cobro_estado
  for each row execute function pago.evitar_cambio();
