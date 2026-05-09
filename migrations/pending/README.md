# Migraciones pendientes

Estos archivos son migraciones preparadas, pero no forman parte del flujo automatico actual.

El runner `scripts/postgres/apply-migrations.mjs` solo lista archivos `.sql` directamente bajo `migrations/`. No recorre subdirectorios, por lo que los archivos en `migrations/pending/` no se aplican.

## `003_portal_rate_limits_indices.sql`

Agrega indices compuestos opcionales para acelerar el rate limit granular:

- `portal_rate_limits(bucket, ip_hash, created_at desc)`.
- `portal_rate_limits(bucket, key_hash, created_at desc)`.

Queda pendiente porque la forma segura en produccion es `CREATE INDEX CONCURRENTLY`, pero el runner actual envuelve cada migracion en `BEGIN/COMMIT`, y Postgres no permite `CONCURRENTLY` dentro de una transaccion.

Antes de aplicarla:

1. Medir en produccion el tamano real de `portal_rate_limits`.
2. Si la tabla es pequena, Bryams puede decidir aplicarla manualmente en una ventana tranquila.
3. Si la tabla crece, primero adaptar el runner para soportar migraciones sin transaccion y cambiar esta migracion a `CREATE INDEX CONCURRENTLY IF NOT EXISTS`.

Cuando llegue el momento, moverla de vuelta a `migrations/` solo si el runner ya soporta la estrategia elegida, o ejecutarla manualmente desde SQL Editor/psql con control operativo.
