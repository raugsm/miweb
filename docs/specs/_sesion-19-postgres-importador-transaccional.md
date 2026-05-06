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

## Resultado Render import dry-run

Fecha: 2026-05-06

Reporte recibido desde Render Shell:

- commit Render: `ae95058`;
- `DATABASE_URL`: conectado;
- `targetEmpty: true`;
- `nonEmptyTables: []`;
- `mismatches: []`;
- `wouldWrite: false`;
- `ok: false`;
- error: `Dry-run detecto warnings de integridad.`

Warnings:

```json
[
  {
    "code": "droppedMissingReference",
    "table": "client_links",
    "field": "created_by",
    "target": "operator_users"
  },
  {
    "code": "droppedMissingReference",
    "table": "client_links",
    "field": "unlinked_by",
    "target": "operator_users"
  },
  {
    "code": "droppedMissingReference",
    "table": "client_link_suggestions",
    "field": "reviewed_by",
    "target": "operator_users"
  }
]
```

Lectura:

- La DB destino esta limpia.
- Los conteos principales estan listos.
- El bloqueo fue correcto: esos campos tienen IDs de operadores que ya no existen en `operator_users`.
- Hacer apply con esos warnings perderia trazabilidad historica.

Decision:

- No usar `postgres:import:apply` todavia.
- Preservar actor legacy como texto cuando la FK no puede resolverse.
- Mantener FK nullable cuando el operador si existe.

Cambio aplicado:

- Nueva migracion: `migrations/002_preserve_client_link_suggestion_actor.sql`.
- Nuevo campo: `client_link_suggestions.reviewed_by_actor`.
- `client_links.created_by_actor` y `client_links.unlinked_by_actor` ahora reciben tambien UUID legacy huerfano, no solo actores texto como `portal` o `system`.
- `client_link_suggestions.reviewed_by_actor` conserva el valor legacy cuando `reviewed_by` no puede apuntar a `operator_users`.

Validacion local del caso Render:

- Se genero un fixture local con los tres actores huerfanos del reporte de Render.
- `npm.cmd run postgres:import -- --input .local-preview-data\users-import-legacy-actor-fixture.json --report .local-preview-data\postgres-import-legacy-actor-fixture-report.json`
- Resultado: `warnings: []`.
- El comando termina con `DATABASE_URL no configurado` porque la validacion local no apunta a PostgreSQL; ese fallo es esperado y controlado.
- El reporte no contiene patrones sensibles.

Nuevo gate en Render despues del deploy:

```sh
cd /opt/render/project/src
npm run postgres:migrate
npm run postgres:migrate:apply
npm run postgres:migrate
npm run postgres:import -- --input /opt/render/project/src/storage/users.json --report /tmp/postgres-render-import-plan.json
cat /tmp/postgres-render-import-plan.json
grep -E 'passwordHash|operatorPinHash|tokenHash|dataUrl|base64|legacy_data_url' /tmp/postgres-render-import-plan.json || true
```

No correr `postgres:import:apply` hasta que el nuevo dry-run diga:

- `ok: true`;
- `warnings: []`;
- `targetEmpty: true`;
- `nonEmptyTables: []`;
- `mismatches: []`.

## Resultado apply bloqueado por payment_proofs

Fecha: 2026-05-06

Comando ejecutado en Render Shell:

```sh
npm run postgres:import:apply -- --input /tmp/postgres-import-source-users.json --report /tmp/postgres-render-import-apply.json
```

Resultado:

```json
{
  "kind": "ariadgsm-postgres-users-json-import",
  "generatedAt": "2026-05-06T01:09:35.075Z",
  "sanitized": true,
  "ok": false,
  "error": "duplicate key value violates unique constraint \"payment_proofs_pkey\""
}
```

Verificacion posterior:

- `npm run postgres:import -- --input /tmp/postgres-import-source-users.json --report /tmp/postgres-render-import-after-failed-apply.json`
- Resultado: `targetEmpty: true`, `payment_proofs: 0`, `ok: true`.

Lectura:

- La transaccion hizo rollback completo.
- No quedo import parcial.
- La causa no fue el DDL ni la DB vacia.
- La causa fue la identidad planeada de `payment_proofs`.

Causa tecnica:

- `stored_files` debe deduplicarse por `sha256`.
- `payment_proofs` no debe deduplicarse solo por `proof.id`, porque el mismo comprobante legacy puede aparecer enlazado desde `customerOrders` y `frpOrders`.
- La PK de `payment_proofs` debe representar la relacion legacy, no el archivo.

Decision:

- Mantener `stored_files` deduplicado por hash.
- Generar `payment_proofs.id` de forma deterministica con:
  - `sourceType`;
  - `sourceId`;
  - `proof.id` o `hash`;
  - indice dentro de la lista legacy.
- Agregar detector de PK duplicadas planeadas antes de escribir.
- Si el apply falla, escribir tambien el reporte indicado por `--report`.

Cambio aplicado:

- `scripts/migration/import-users-json-to-postgres.mjs`
  - `proofRelationId(...)`;
  - `findDuplicatePlannedPrimaryKeys(...)`;
  - reporte de error en catch con `--report`.

Nuevo criterio:

- El dry-run debe seguir en `ok: true`.
- Si aparecen duplicados planeados, el reporte debe bloquear con warning `duplicatePlannedPrimaryKeys` antes de `--apply`.

Validacion local:

```sh
node --check scripts\migration\import-users-json-to-postgres.mjs
npm.cmd run postgres:import -- --input data\users.json --report .local-preview-data\postgres-import-no-db-report.json
npm.cmd run postgres:import -- --input .local-preview-data\users-import-duplicate-proof-fixture.json --report .local-preview-data\postgres-import-duplicate-proof-fixture-report.json
npm.cmd run postgres:import -- --input .local-preview-data\users-import-duplicate-pk-fixture.json --report .local-preview-data\postgres-import-duplicate-pk-fixture-report.json
npm.cmd run postgres:import -- --input .local-preview-data\users-import-invalid.json --report .local-preview-data\postgres-import-invalid-report.json
npm.cmd test
```

Resultados:

- fixture con mismo `proof.id` en dos fuentes: `stored_files: 1`, `payment_proofs: 2`, `warnings: []`;
- fixture con PK duplicada planeada: warning `duplicatePlannedPrimaryKeys`;
- JSON invalido: se escribio reporte sanitizado en `--report`;
- reportes sin `passwordHash`, `operatorPinHash`, `tokenHash`, `dataUrl`, `base64` ni `legacy_data_url`;
- `npm.cmd test`: 14/14 OK.

Siguiente gate en Render:

```sh
cd /opt/render/project/src
git rev-parse --short HEAD || true
npm run postgres:import -- --input /tmp/postgres-import-source-users.json --report /tmp/postgres-render-import-plan-after-proof-fix.json
cat /tmp/postgres-render-import-plan-after-proof-fix.json
grep -E 'passwordHash|operatorPinHash|tokenHash|dataUrl|base64|legacy_data_url' /tmp/postgres-render-import-plan-after-proof-fix.json || true
```

No repetir `postgres:import:apply` hasta que Render este en el commit del fix y el dry-run del snapshot vuelva `ok: true`.

## Resultado Render import apply exitoso

Fecha: 2026-05-06

Contexto:

- Render estaba en el commit `b5448eb`.
- La instancia nueva de Render no conservaba `/tmp/postgres-import-source-users.json`, por lo que se recreo el snapshot desde `storage/users.json`.
- Snapshot usado: `/tmp/postgres-import-source-users.json`.
- `sourceSha256`: `b81bcac3be2aefaa93be14884458677e561a5717fb3c39fee7108ad2a780e52f`.

Dry-run previo al apply:

```sh
cd /opt/render/project/src
cp storage/users.json /tmp/postgres-import-source-users.json
npm run postgres:import -- --input /tmp/postgres-import-source-users.json --report /tmp/postgres-render-import-plan-after-proof-fix.json
cat /tmp/postgres-render-import-plan-after-proof-fix.json
grep -E 'passwordHash|operatorPinHash|tokenHash|dataUrl|base64|legacy_data_url' /tmp/postgres-render-import-plan-after-proof-fix.json || true
```

Resultado aceptado:

- `ok: true`;
- `warnings: []`;
- `targetEmpty: true`;
- `nonEmptyTables: []`;
- `mismatches: []`;
- reporte sanitizado, sin patrones sensibles.

Apply ejecutado:

```sh
cd /opt/render/project/src
npm run postgres:import:apply -- --input /tmp/postgres-import-source-users.json --report /tmp/postgres-render-import-apply-after-proof-fix.json
cat /tmp/postgres-render-import-apply-after-proof-fix.json
grep -E 'passwordHash|operatorPinHash|tokenHash|dataUrl|base64|legacy_data_url' /tmp/postgres-render-import-apply-after-proof-fix.json || true
```

Resultado del apply:

- `ok: true`;
- `apply: true`;
- `warnings: []`;
- `mismatches: []`;
- `currentTables` estaba en cero antes de escribir;
- `actualTables` coincidio con `expectedTables`;
- reporte sanitizado, sin `passwordHash`, `operatorPinHash`, `tokenHash`, `dataUrl`, `base64` ni `legacy_data_url`.

Conteos relevantes importados:

- `migration_runs`: 1;
- `sequence_counters`: 8;
- `operator_users`: 5;
- `customer_clients`: 18;
- `customer_users`: 18;
- `customer_orders`: 13;
- `customer_order_items`: 14;
- `stored_files`: 17;
- `payment_proofs`: 32;
- `frp_orders`: 13;
- `frp_jobs`: 14;
- `payment_ledger_entries`: 13;
- `audit_events`: 830.

Verificacion anti doble-importacion:

```sh
cd /opt/render/project/src
npm run postgres:import -- --input /tmp/postgres-import-source-users.json --report /tmp/postgres-render-import-post-apply-check.json
cat /tmp/postgres-render-import-post-apply-check.json
grep -E 'passwordHash|operatorPinHash|tokenHash|dataUrl|base64|legacy_data_url' /tmp/postgres-render-import-post-apply-check.json || true
```

Resultado esperado y confirmado:

- `targetEmpty: false`;
- `nonEmptyTables` contiene las tablas pobladas;
- `wouldWrite: false`;
- `mismatches: []`;
- `ok: false`;
- `error`: `Dry-run bloqueado porque la DB destino no esta vacia.`

Lectura:

- La importacion inicial a PostgreSQL quedo aplicada.
- La compuerta anti doble-importacion funciona y bloquea una segunda carga por defecto.
- No se debe repetir `postgres:import:apply` sobre esta base ya poblada.
- El runtime todavia sigue usando `users.json`; no se activo cutover.

Siguiente paso unico:

- Disenar y validar el cutover controlado de runtime a PostgreSQL, con modo de lectura/escritura claramente definido y rollback antes de tocar rutas HTTP.
