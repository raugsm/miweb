# AriadGSM Fase B.3 - Runbook auth granular

## Deuda tecnica conocida

La migracion `003_portal_rate_limits_indices.sql` queda archivada en `migrations/pending/` y no se aplica en el rollout inicial de B.3.

Razon: los indices compuestos de `portal_rate_limits` son una optimizacion opcional. `CREATE INDEX IF NOT EXISTS` es idempotente, pero puede bloquear escrituras durante la creacion. La alternativa correcta para tablas con trafico es `CREATE INDEX CONCURRENTLY IF NOT EXISTS`, pero el runner actual ejecuta migraciones dentro de `BEGIN/COMMIT` y Postgres no permite `CONCURRENTLY` dentro de una transaccion.

Condiciones para aplicarla despues:

- medir tamano real de `portal_rate_limits` en produccion; o
- adaptar el migration runner para soportar migraciones sin transaccion; y
- cambiar la migracion a `CREATE INDEX CONCURRENTLY IF NOT EXISTS` si el tamano o trafico lo justifican.
