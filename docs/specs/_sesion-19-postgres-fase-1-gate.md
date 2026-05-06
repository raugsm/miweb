# Sesion 19 - PostgreSQL fase 1 gate

Fecha: 2026-05-06

Estado: implementado localmente, pendiente de ejecutar contra Render Postgres.

## Objetivo

Agregar una puerta tecnica para PostgreSQL antes de cambiar el runtime.

Esta fase permite:

- validar que `DATABASE_URL` conecta;
- usar pool de conexiones;
- aplicar migraciones de forma controlada;
- registrar migraciones aplicadas;
- mantener `server.js` usando `users.json` hasta que exista una migracion validada.

## Fuentes tecnicas usadas

- PostgreSQL Transactions: `https://www.postgresql.org/docs/current/tutorial-transactions.html`
- node-postgres Pooling: `https://node-postgres.com/features/pooling`
- node-postgres Transactions: `https://node-postgres.com/features/transactions`
- Render Postgres connection: `https://render.com/docs/postgresql-creating-connecting`

## Hechos

- Produccion ya sufrio corrupcion repetida de `users.json`.
- El hotfix de escritura atomica reduce corrupcion fisica, pero no entrega transacciones reales.
- `migrations/001_initial_postgres.sql` ya existe.
- `scripts/migration/users-json-to-postgres.mjs` ya existe como dry-run de datos.
- `package.json` no tenia driver PostgreSQL.
- `render.yaml` no tiene todavia `DATABASE_URL`.

## Decision

Se implementa una puerta PostgreSQL sin cutover:

- dependencia `pg`;
- helper `server/db/postgres.js`;
- script `scripts/postgres/check-connection.mjs`;
- script `scripts/postgres/apply-migrations.mjs`;
- scripts npm:
  - `npm run postgres:check`;
  - `npm run postgres:migrate`;
  - `npm run postgres:migrate:apply`.

## Contrato de seguridad

- No imprimir `DATABASE_URL` completa.
- No imprimir password, token, PIN ni connection string sin redaccion.
- El modo `postgres:migrate` es solo lectura.
- Las migraciones solo se aplican con `postgres:migrate:apply`.
- `server.js` no cambia todavia a PostgreSQL.
- No activar `DATABASE_URL` en produccion hasta validar schema y conteos.

## Implementacion

### `server/db/postgres.js`

Responsabilidades:

- crear un `Pool` de node-postgres bajo demanda;
- leer `DATABASE_URL` o `POSTGRES_URL`;
- limitar pool con `PG_POOL_MAX`, default `5`, maximo `20`;
- soportar SSL si `DATABASE_SSL`, `PGSSL` o `sslmode=require` lo piden;
- exponer `withPostgresClient`;
- exponer `withTransaction`;
- exponer `checkPostgresConnection`;
- cerrar pool con `closePostgresPool`.

### `scripts/postgres/check-connection.mjs`

Responsabilidades:

- fallar si no existe `DATABASE_URL`;
- probar conexion;
- imprimir reporte JSON sanitizado;
- no imprimir secretos.

### `scripts/postgres/apply-migrations.mjs`

Responsabilidades:

- leer archivos `.sql` desde `migrations`;
- calcular SHA-256 por migracion;
- en modo default, reportar `PENDING` / `APPLIED` sin escribir;
- con `--apply`, crear `ariad.schema_migrations`;
- aplicar cada migracion pendiente dentro de una transaccion controlada por el script;
- registrar version y checksum;
- fallar si una migracion aplicada tiene checksum distinto.

## Hechos, inferencias, riesgos y supuestos

### Hechos

- PostgreSQL agrupa multiples pasos con `BEGIN`/`COMMIT` y permite rollback.
- node-postgres exige usar el mismo client para una transaccion.
- Render recomienda usar la URL interna cuando app y base estan en la misma region.

### Inferencias

- AriadGSM necesita transacciones para casos como verificar Gmail, crear pedido, registrar pago y auditar en una sola operacion logica.
- La puerta de conexion/migracion reduce riesgo antes de tocar rutas HTTP.

### Riesgos

- Aplicar el DDL sobre una DB no vacia puede fallar porque `001_initial_postgres.sql` crea tablas nuevas.
- Una migracion aplicada con checksum distinto debe tratarse como incidente de migracion, no como warning menor.
- Usar `pool.query` dentro de transacciones romperia el contrato de node-postgres; para transacciones se debe usar `withTransaction`.
- La DB gratis o chica puede quedarse corta en conexiones/almacenamiento si el uso crece.

### Supuestos

- Render Postgres sera creado en la misma region que el servicio web.
- La variable se llamara `DATABASE_URL`.
- La primera aplicacion de DDL sera contra una DB vacia o staging.
- El usuario no pegara ni documentara URLs con credenciales en el repo.

## Runbook fase 1

1. Crear Render Postgres en la misma region que `ariadgsm-ops`.
2. Copiar Internal Database URL.
3. Configurar `DATABASE_URL` como secret/env var del servicio o entorno de prueba.
4. Verificar conexion:

```powershell
npm.cmd run postgres:check
```

5. Ver migraciones pendientes sin escribir:

```powershell
npm.cmd run postgres:migrate
```

6. Si el reporte es correcto y la DB esta vacia/staging, aplicar:

```powershell
npm.cmd run postgres:migrate:apply
```

7. Ejecutar dry-run de datos contra copia real sanitizada de `users.json`.
8. Comparar conteos y warnings antes de cambiar runtime.

## Criterio de avance

Se puede pasar a fase 2 solo si:

- `postgres:check` devuelve `ok: true`;
- `postgres:migrate` lista `001_initial_postgres.sql` como `PENDING` o `APPLIED`;
- `postgres:migrate:apply` termina `ok: true` en staging;
- los conteos del dry-run real coinciden;
- no hay secretos en reportes ni docs.

## No hacer todavia

- No cambiar `readDb()`/`writeDb()` para usar PostgreSQL.
- No activar PostgreSQL como fuente de verdad en produccion.
- No ejecutar migracion final sin backup nuevo de `users.json`.
- No eliminar el persistent disk todavia.

## Validacion local

Comandos ejecutados:

```powershell
node --check server/db/postgres.js
node --check scripts/postgres/check-connection.mjs
node --check scripts/postgres/apply-migrations.mjs
node --check server.js
node --check scripts/migration/users-json-to-postgres.mjs
npm.cmd run postgres:check
npm.cmd run postgres:migrate
node scripts/postgres/apply-migrations.mjs --help
npm.cmd test
node --check public/app.js
node --check public/portal.js
node --input-type=module -e "import { redactedPostgresUrl } from './server/db/postgres.js'; const out = redactedPostgresUrl('postgresql://realuser:secretpass@example.internal:5432/ariad'); if (out.includes('realuser') || out.includes('secretpass')) process.exit(1); console.log(out);"
```

Resultados:

- Checks de sintaxis: OK.
- `postgres:check` sin `DATABASE_URL`: falla controlado con JSON sanitizado y exit `1`.
- `postgres:migrate` sin `DATABASE_URL`: falla controlado con JSON sanitizado, `dryRunWrites: false` y exit `1`.
- `apply-migrations --help`: OK.
- `npm.cmd test`: 14/14 OK.
- Redaccion de URL: no imprime usuario ni password reales.

Resultado esperado pendiente:

- Ejecutar `postgres:check` con `DATABASE_URL` real de Render Postgres.
- Ejecutar `postgres:migrate` contra staging.
- Ejecutar `postgres:migrate:apply` solo contra DB vacia/staging aprobada.

## Validacion Render Postgres

Reporte recibido desde Render Shell de `ariadgsm-ops`:

```json
{
  "kind": "ariadgsm-postgres-connection-check",
  "generatedAt": "2026-05-06T00:16:29.840Z",
  "sanitized": true,
  "connection": "postgresql://user:redacted@dpg-d7t8dld7vvec73fdp9e0-a/ariadgsm_postgres",
  "ok": true,
  "postgres": {
    "database": "ariadgsm_postgres",
    "user": "ariadgsm_app",
    "schema": "public",
    "serverTime": "2026-05-06T00:16:29.865Z",
    "serverVersion": "18.3 (Debian 18.3-1.pgdg12+1)"
  }
}
```

Lectura:

- `DATABASE_URL` esta configurado y funciona desde el servicio web.
- La URL usada es interna y fue reportada con credenciales redactadas.
- PostgreSQL 18.3 esta disponible.
- Todavia no se aplico DDL.

Siguiente gate:

- Ejecutar `npm run postgres:migrate` para listar migraciones pendientes sin escribir.

## Dry-run migraciones Render Postgres

Reporte recibido desde Render Shell:

```json
{
  "kind": "ariadgsm-postgres-migration-gate",
  "generatedAt": "2026-05-06T00:17:18.729Z",
  "sanitized": true,
  "apply": false,
  "connection": "postgresql://user:redacted@dpg-d7t8dld7vvec73fdp9e0-a/ariadgsm_postgres",
  "migrationsDir": "/opt/render/project/src/migrations",
  "dryRunWrites": false,
  "migrations": [
    {
      "version": "001_initial_postgres.sql",
      "status": "PENDING",
      "checksum": "121d0a86b9290df1e6aa9b271f4adeb255ee6bb0948a109c793016ce101c5065"
    }
  ],
  "ok": true
}
```

Lectura:

- El script ve correctamente el directorio `/opt/render/project/src/migrations`.
- La migracion inicial esta pendiente.
- El modo fue solo lectura: `apply: false`, `dryRunWrites: false`.
- El checksum queda como evidencia previa a aplicar DDL.

Siguiente gate sensible:

- Aplicar `001_initial_postgres.sql` con `npm run postgres:migrate:apply` solo si se acepta que la DB esta vacia/staging.

## Aplicacion DDL inicial

Reporte recibido desde Render Shell:

```json
{
  "kind": "ariadgsm-postgres-migration-gate",
  "generatedAt": "2026-05-06T00:18:52.436Z",
  "sanitized": true,
  "apply": true,
  "connection": "postgresql://user:redacted@dpg-d7t8dld7vvec73fdp9e0-a/ariadgsm_postgres",
  "migrationsDir": "/opt/render/project/src/migrations",
  "dryRunWrites": false,
  "migrations": [
    {
      "version": "001_initial_postgres.sql",
      "status": "APPLIED_NOW",
      "checksum": "121d0a86b9290df1e6aa9b271f4adeb255ee6bb0948a109c793016ce101c5065"
    }
  ],
  "ok": true
}
```

Lectura:

- El DDL inicial se aplico en Render Postgres.
- La migracion quedo registrada con checksum.
- No se hizo cutover de runtime.
- `users.json` sigue siendo fuente de verdad hasta migrar datos y cambiar repositorios.

Siguiente gate:

- Ejecutar `npm run postgres:migrate` otra vez para confirmar que la migracion aparece como `APPLIED`.

## Verificacion de idempotencia

Reporte recibido desde Render Shell despues de aplicar DDL:

```json
{
  "kind": "ariadgsm-postgres-migration-gate",
  "generatedAt": "2026-05-06T00:19:29.151Z",
  "sanitized": true,
  "apply": false,
  "connection": "postgresql://user:redacted@dpg-d7t8dld7vvec73fdp9e0-a/ariadgsm_postgres",
  "migrationsDir": "/opt/render/project/src/migrations",
  "dryRunWrites": false,
  "migrations": [
    {
      "version": "001_initial_postgres.sql",
      "status": "APPLIED",
      "checksum": "121d0a86b9290df1e6aa9b271f4adeb255ee6bb0948a109c793016ce101c5065",
      "appliedAt": "2026-05-06T00:18:52.501Z"
    }
  ],
  "ok": true
}
```

Lectura:

- El migrador es idempotente para la migracion inicial.
- `schema_migrations` registra `001_initial_postgres.sql`.
- No hay checksum mismatch.

Conclusion fase 1:

- Conexion PostgreSQL: OK.
- DDL inicial aplicado: OK.
- Idempotencia de migracion: OK.
- Runtime sigue en `users.json`.

Siguiente fase:

- Ejecutar migracion de datos a PostgreSQL staging sin cutover.
- Comparar conteos y relaciones antes de tocar rutas HTTP.

## Gate creado para import de datos

Archivo nuevo:

- `scripts/migration/import-users-json-to-postgres.mjs`

Scripts nuevos:

- `npm run postgres:import`
- `npm run postgres:import:apply`

Decision:

- `postgres:import` valida DB, conteos esperados y DB vacia sin escribir.
- `postgres:import:apply` escribe solo con `--apply` dentro de una transaccion.
- El importador bloquea tablas no vacias salvo `--allow-non-empty`.
- Los reportes no deben contener `passwordHash`, `operatorPinHash`, `tokenHash`, `dataUrl`, `base64` ni `legacy_data_url`.
- El runtime sigue en `users.json`; este gate no cambia rutas HTTP.

Runbook:

- `docs/specs/_sesion-19-postgres-importador-transaccional.md`

Siguiente paso unico:

```sh
cd /opt/render/project/src
npm run postgres:import -- --input /opt/render/project/src/storage/users.json --report /tmp/postgres-render-import-plan.json
cat /tmp/postgres-render-import-plan.json
grep -E 'passwordHash|operatorPinHash|tokenHash|dataUrl|base64|legacy_data_url' /tmp/postgres-render-import-plan.json || true
```
