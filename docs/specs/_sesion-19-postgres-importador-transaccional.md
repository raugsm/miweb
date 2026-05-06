# Sesion 19 - Importador transaccional users.json -> PostgreSQL

Fecha: 2026-05-06

## Objetivo

Crear el siguiente gate de migracion despues de aplicar el DDL inicial en Render Postgres:

- leer el `users.json` real;
- validar conteos esperados;
- comparar contra tablas PostgreSQL vacias;
- importar solo con `--apply`;
- ejecutar toda la escritura en una transaccion;
- generar reporte sanitizado;
- no hacer cutover de runtime.

## Hechos

- Render Postgres ya responde con `ok: true`.
- `001_initial_postgres.sql` ya fue aplicado y aparece como `APPLIED`.
- El dry-run estricto sobre `/opt/render/project/src/storage/users.json` salio sin warnings.
- El runtime de AriadGSM sigue leyendo y escribiendo `users.json`.
- El DDL tiene relaciones cruzadas:
  - `customer_orders.frp_order_id -> frp_orders.id`;
  - `frp_orders.portal_order_id -> customer_orders.id`;
  - `customer_order_items.frp_order_id -> frp_orders.id`;
  - `customer_order_items.frp_job_id -> frp_jobs.id`;
  - `frp_jobs.portal_order_item_id -> customer_order_items.id`.

## Inferencias

- El importador no puede insertar todas las filas en una sola pasada simple.
- La ruta segura es:
  - insertar `customer_orders` sin `frp_order_id`;
  - insertar `customer_order_items` sin `frp_order_id` ni `frp_job_id`;
  - insertar `frp_orders`;
  - actualizar `customer_orders.frp_order_id`;
  - insertar `frp_jobs`;
  - actualizar `customer_order_items`.
- Si la DB destino ya tiene datos, el import puede duplicar o mezclar estados. Por defecto debe bloquear.

## Riesgos

- Importar sobre una DB no vacia puede producir datos duplicados o conteos falsos.
- Cortar el runtime a PostgreSQL en esta etapa seria prematuro.
- Guardar el JSON legacy completo duplicaria secretos y binarios inline.
- Los comprobantes siguen usando `legacy_inline`; esto sirve para migracion, no para la arquitectura final de archivos.

## Supuestos

- `DATABASE_URL` apunta a la Internal Database URL de Render Postgres.
- Las tablas de datos estan vacias antes del primer import real.
- `users.json` parsea y coincide con el dry-run estricto ya documentado.
- Los hashes de comprobantes existen para deduplicar `stored_files`.

## Decision

Se crea un importador nuevo:

- `scripts/migration/import-users-json-to-postgres.mjs`

El script:

- usa `DATABASE_URL` o `POSTGRES_URL` mediante `server/db/postgres.js`;
- corre dry-run por defecto;
- escribe solo con `--apply`;
- usa una unica transaccion de PostgreSQL;
- bloquea DB no vacia salvo `--allow-non-empty`;
- bloquea el apply si faltan digests de credenciales o sesiones;
- genera reportes sin exponer `passwordHash`, `operatorPinHash`, `tokenHash`, `dataUrl`, `base64` ni `legacy_data_url`;
- sanitiza `legacy_json` para no duplicar secretos ni payloads inline;
- conserva comprobantes/final images en `stored_files.legacy_data_url` mientras no exista object storage;
- registra el import completado en `migration_runs`.

## Archivos afectados

- `package.json`
- `scripts/migration/import-users-json-to-postgres.mjs`
- `docs/specs/_sesion-19-postgres-importador-transaccional.md`
- `docs/specs/_sesion-19-postgres-fase-1-gate.md`
- `docs/specs/_sesion-19-migracion-postgres-dry-run.md`

## Scripts nuevos

```sh
npm run postgres:import
npm run postgres:import:apply
```

Uso recomendado en Render Shell:

```sh
cd /opt/render/project/src
npm run postgres:import -- --input /opt/render/project/src/storage/users.json --report /tmp/postgres-render-import-plan.json
cat /tmp/postgres-render-import-plan.json
grep -E 'passwordHash|operatorPinHash|tokenHash|dataUrl|base64|legacy_data_url' /tmp/postgres-render-import-plan.json || true
```

Si el reporte dice `ok: true`, `targetEmpty: true`, `warnings: []` y `nonEmptyTables: []`, el siguiente comando aprobado es:

```sh
cd /opt/render/project/src
npm run postgres:import:apply -- --input /opt/render/project/src/storage/users.json --report /tmp/postgres-render-import-apply.json
cat /tmp/postgres-render-import-apply.json
grep -E 'passwordHash|operatorPinHash|tokenHash|dataUrl|base64|legacy_data_url' /tmp/postgres-render-import-apply.json || true
```

## Criterio de exito

El import real solo se acepta si:

- `ok: true`;
- `actualTables` existe;
- `mismatches: []`;
- `warnings: []`;
- `currentTables` estaba vacio antes del import;
- el reporte no contiene patrones sensibles;
- `migration_runs` queda en `1`;
- no se toca todavia el runtime HTTP.

## Rollback

Antes del cutover no hay rollback de runtime porque la app sigue usando `users.json`.

Si el import falla:

- PostgreSQL revierte la transaccion completa;
- no debe quedar import parcial;
- repetir primero `npm run postgres:import`;
- no usar `--allow-non-empty` sin revisar conteos.

Si el import se aplico y hay que repetir desde cero:

- crear una nueva base PostgreSQL limpia o vaciar tablas con un runbook separado;
- no borrar datos a mano sin respaldo y aprobacion.

## Validacion local ejecutada

```sh
node --check scripts\migration\import-users-json-to-postgres.mjs
node --check scripts\migration\users-json-to-postgres.mjs
node --check server\db\postgres.js
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('package.json OK')"
node scripts\migration\import-users-json-to-postgres.mjs --help
node scripts\migration\users-json-to-postgres.mjs --input data\users.json --report .local-preview-data\postgres-dry-run-report.import-compare.json
node scripts\migration\import-users-json-to-postgres.mjs --input data\users.json --report .local-preview-data\postgres-import-no-db-report.json
node -e "const fs=require('fs');const dry=JSON.parse(fs.readFileSync('.local-preview-data/postgres-dry-run-report.import-compare.json','utf8'));const imp=JSON.parse(fs.readFileSync('.local-preview-data/postgres-import-no-db-report.json','utf8'));const diff=[];for(const [k,v] of Object.entries(dry.tables)){if(imp.expectedTables[k]!==v)diff.push({table:k,dry:v,importer:imp.expectedTables[k]});}for(const k of Object.keys(imp.expectedTables)){if(!(k in dry.tables))diff.push({table:k,dry:null,importer:imp.expectedTables[k]});}console.log(JSON.stringify({diffCount:diff.length,diff},null,2));"
Select-String -Path .local-preview-data\postgres-import-no-db-report.json -Pattern 'passwordHash|operatorPinHash|tokenHash|dataUrl|base64|legacy_data_url' -CaseSensitive
Select-String -Path .local-preview-data\postgres-dry-run-report.import-compare.json -Pattern 'passwordHash|operatorPinHash|tokenHash|dataUrl|base64|legacy_data_url' -CaseSensitive
npm.cmd test
```

Resultado:

- sintaxis OK;
- `package.json` OK;
- comando `--help` OK;
- sin `DATABASE_URL`, el importador falla controlado con reporte sanitizado;
- `diffCount: 0` contra el dry-run existente;
- reporte local sin patrones sensibles.
- `npm.cmd test`: 14/14 OK.

## Lo que NO se hizo

- No se importaron datos en Render desde esta maquina.
- No se cambio `server.js` para leer desde PostgreSQL.
- No se activo cutover.
- No se elimino `users.json`.

## Siguiente paso unico

En Render Shell, ejecutar el dry-run conectado a DB:

```sh
cd /opt/render/project/src
npm run postgres:import -- --input /opt/render/project/src/storage/users.json --report /tmp/postgres-render-import-plan.json
cat /tmp/postgres-render-import-plan.json
grep -E 'passwordHash|operatorPinHash|tokenHash|dataUrl|base64|legacy_data_url' /tmp/postgres-render-import-plan.json || true
```
