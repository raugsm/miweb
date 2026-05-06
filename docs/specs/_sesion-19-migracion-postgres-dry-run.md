# Sesion 19 - Migracion PostgreSQL dry-run

Fecha: 2026-05-05

Estado: primer dry-run local ejecutado. No toca produccion.

## Objetivo

Crear artefactos ejecutables para validar la migracion desde `users.json` hacia PostgreSQL sin conectar aun a una base real.

## Archivos creados

- `migrations/001_initial_postgres.sql`
- `scripts/migration/users-json-to-postgres.mjs`
- `docs/specs/_sesion-19-migracion-postgres-dry-run.md`

## Fase 1 gate agregada

Documento relacionado:

- `docs/specs/_sesion-19-postgres-fase-1-gate.md`

Archivos agregados despues del incidente de corrupcion repetida:

- `server/db/postgres.js`
- `scripts/postgres/check-connection.mjs`
- `scripts/postgres/apply-migrations.mjs`

Decision:

- Se agrega conexion PostgreSQL y aplicador de migraciones, pero no se cambia runtime todavia.
- `npm run postgres:migrate` es solo lectura.
- `npm run postgres:migrate:apply` es el unico comando que aplica DDL.

## Alcance confirmado

- Lee un `users.json` local o copia.
- Valida que el JSON parsea.
- Calcula SHA-256 del archivo fuente.
- Cuenta colecciones actuales.
- Proyecta conteos esperados por tabla PostgreSQL.
- Valida relaciones basicas.
- Detecta duplicados de email sin imprimir emails.
- Detecta comprobantes sin hash.
- Genera reporte sanitizado.
- No conecta a Postgres.
- No modifica `users.json`.
- No toca `server.js`, rutas, frontend ni produccion.

## Decision tecnica durante implementacion

Al revisar codigo real, aparecio un detalle importante:

- `server.js` puede guardar `createdBy: "portal"` o `createdBy: "system"` en algunas estructuras.
- Si el DDL fuerza esos campos como `uuid`, la migracion puede fallar o perder origen.

Decision aplicada:

- En tablas donde el actor puede ser no-UUID se agrego campo texto de respaldo:
  - `internal_clients.created_by_actor`
  - `client_links.created_by_actor`
  - `client_links.unlinked_by_actor`
- Los UUID se mantienen cuando el actor sea realmente usuario operador.

## Comandos ejecutados

```powershell
node --check scripts\migration\users-json-to-postgres.mjs
Select-String -Path migrations\001_initial_postgres.sql,scripts\migration\users-json-to-postgres.mjs -Pattern '[^\x00-\x7F]'
node scripts\migration\users-json-to-postgres.mjs --input data\users.json --report .local-preview-data\postgres-dry-run-report.json
node scripts\migration\users-json-to-postgres.mjs --input data\users.json --strict --report .local-preview-data\postgres-dry-run-report.strict.json
Select-String -Path .local-preview-data\postgres-dry-run-report.json,.local-preview-data\postgres-dry-run-report.strict.json -Pattern 'passwordHash|operatorPinHash|tokenHash|dataUrl|base64|legacy_data_url'
npm.cmd test
node --check server.js
node --check public\app.js
node --check public\portal.js
```

## Resultado local

Archivo validado:

- `data/users.json`

SHA-256:

- `82f067193fc792445a1305f8f9f31d26d7707a92a9d90cff7e7e4176e25e665c`

Colecciones principales:

| Coleccion | Conteo |
|---|---:|
| `users` | 1 |
| `customerClients` | 2 |
| `customerUsers` | 2 |
| `customerSessions` | 9 |
| `customerDevices` | 7 |
| `customerOrders` | 1 |
| `customerOrderItems` | 2 |
| `frpOrders` | 1 |
| `frpJobs` | 2 |
| `paymentLedgerEntries` | 11 |
| `frpProviderCostHistory` | 5 |
| `audit` | 578 |

Tablas proyectadas principales:

| Tabla | Conteo |
|---|---:|
| `operator_users` | 1 |
| `customer_clients` | 2 |
| `customer_users` | 2 |
| `customer_sessions` | 9 |
| `customer_devices` | 7 |
| `customer_orders` | 1 |
| `customer_order_items` | 2 |
| `frp_orders` | 1 |
| `frp_jobs` | 2 |
| `stored_files` | 2 |
| `payment_proofs` | 4 |
| `payment_ledger_entries` | 11 |
| `audit_events` | 578 |

Checks:

- `customerUsersMatch`: true
- `customerClientsMatch`: true
- `customerOrdersMatch`: true
- `customerOrderItemsMatch`: true
- `frpOrdersMatch`: true
- `frpJobsMatch`: true
- `ticketsMatch`: true
- `operatorEmailDuplicates`: 0
- `customerEmailDuplicates`: 0
- `proofMissingHash`: 0
- `finalImageMissingHash`: 0
- `warnings`: 0

## Seguridad del reporte

Busqueda de patrones sensibles en reportes:

- `passwordHash`
- `operatorPinHash`
- `tokenHash`
- `dataUrl`
- `base64`
- `legacy_data_url`

Resultado:

- No hubo coincidencias.

## Resultado Render real despues de fase 1

Comando ejecutado en Render Shell:

```sh
node scripts/migration/users-json-to-postgres.mjs --input /opt/render/project/src/storage/users.json --strict --report /tmp/postgres-render-data-dry-run.json
```

Reporte recibido:

```json
{
  "kind": "ariadgsm-postgres-migration-dry-run",
  "generatedAt": "2026-05-06T00:20:26.539Z",
  "sourceName": "users.json",
  "sourceSha256": "e028b631850729c1447154274f5e101956b7d590e5b7a3739cb63d78fdcd6a51",
  "sanitized": true,
  "collections": {
    "users": 5,
    "sessions": 2,
    "devices": 4,
    "deviceApprovals": 0,
    "customerClients": 18,
    "customerUsers": 18,
    "customerSessions": 23,
    "customerDevices": 87,
    "customerRequests": 13,
    "customerOrders": 13,
    "customerOrderItems": 14,
    "customerBenefits": 34,
    "customerEmailVerificationTokens": 6,
    "masterClients": 19,
    "clientLinks": 25,
    "clientLinkSuggestions": 2,
    "paymentLedgerEntries": 13,
    "dailyCloses": 0,
    "dailyCloseLines": 0,
    "dailyAdjustments": 0,
    "portalRateLimits": 0,
    "clients": 5,
    "tickets": 0,
    "frpOrders": 13,
    "frpJobs": 14,
    "frpProviderCostHistory": 8,
    "frpPendingCostChanges": 0,
    "passwordResetTokens": 0,
    "passwordResetRequests": 0,
    "audit": 830
  },
  "tables": {
    "migration_runs": 1,
    "sequence_counters": 8,
    "operator_users": 5,
    "operator_devices": 4,
    "operator_device_admin_users": 2,
    "operator_device_approvals": 0,
    "operator_sessions": 2,
    "password_reset_tokens": 0,
    "password_reset_requests": 0,
    "master_clients": 19,
    "customer_clients": 18,
    "customer_users": 18,
    "internal_clients": 5,
    "client_links": 25,
    "client_link_suggestions": 2,
    "customer_benefits": 34,
    "customer_devices": 87,
    "customer_device_authorizations": 18,
    "customer_sessions": 23,
    "customer_email_verification_tokens": 6,
    "exchange_rates": 5,
    "service_pricing_rules": 14,
    "payment_method_overrides": 0,
    "frp_pricing_policy": 1,
    "frp_pricing_providers": 3,
    "frp_provider_cost_history": 8,
    "frp_pending_cost_changes": 0,
    "customer_requests": 13,
    "customer_orders": 13,
    "customer_order_items": 14,
    "service_tickets": 0,
    "stored_files": 17,
    "payment_proofs": 32,
    "frp_orders": 13,
    "frp_jobs": 14,
    "frp_job_files": 0,
    "active_technician_state": 1,
    "payment_ledger_entries": 13,
    "daily_closes": 0,
    "daily_close_lines": 0,
    "daily_adjustments": 0,
    "portal_rate_limits": 0,
    "audit_events": 830
  },
  "summaryChecks": {
    "customerUsersMatch": true,
    "customerClientsMatch": true,
    "customerOrdersMatch": true,
    "customerOrderItemsMatch": true,
    "frpOrdersMatch": true,
    "frpJobsMatch": true,
    "ticketsMatch": true,
    "operatorEmailDuplicates": 0,
    "customerEmailDuplicates": 0,
    "proofMissingHash": 0,
    "finalImageMissingHash": 0
  },
  "warnings": []
}
```

Lectura:

- El `users.json` real actual de Render parsea correctamente.
- El dry-run estricto no encontro warnings.
- No hay duplicados de email operador ni cliente.
- No hay comprobantes/final images sin hash.
- La proyeccion de tablas esta lista para importador real.
- Esto todavia no escribio datos en PostgreSQL.

Siguiente gate:

- Crear importador `users.json -> PostgreSQL` que escriba en transaccion y genere reporte de conteos post-import.
- Ejecutarlo primero contra la DB recien creada, sin cutover de runtime.

## Validacion del repo

- `node --check scripts\migration\users-json-to-postgres.mjs`: OK.
- `npm.cmd test`: 14/14 OK.
- `node --check server.js`: OK.
- `node --check public\app.js`: OK.
- `node --check public\portal.js`: OK.

## Validacion SQL pendiente

`psql` no esta disponible en este entorno local, por eso el DDL no fue aplicado contra una base PostgreSQL real.

La validacion SQL real queda pendiente para una de estas dos opciones:

- instalar/usar `psql` local con Postgres de prueba;
- usar un Postgres staging en Render y ejecutar `migrations/001_initial_postgres.sql` contra una DB vacia.

## Lo que NO se valido todavia

- No se valido el `users.json` real de produccion en Render.
- No se ejecuto la migracion contra PostgreSQL.
- No se creo `DATABASE_URL`.
- No se cambio ninguna ruta para leer desde PostgreSQL.
- No se probo rollback real.
- No se valido sintaxis SQL contra un servidor PostgreSQL porque esta etapa solo creo el artefacto y el dry-run local.

## Riesgos detectados

- El dry-run local salio limpio, pero produccion puede tener datos corruptos, mas grandes o con relaciones distintas.
- El DDL inicial todavia no debe considerarse contrato final hasta probarse contra una copia real de produccion.
- Los comprobantes quedan modelados como metadata + `legacy_inline`. La raiz final para binarios debe ser object storage, no Postgres.
- El reporte local no reemplaza backup ni rescue de Render.

## Siguiente paso unico

Ejecutar el mismo dry-run contra una copia respaldada del `users.json` real de Render.

No usar todavia Postgres en produccion. No conectar rutas.

Runbook operativo creado:

- `docs/specs/_sesion-19-render-users-json-dry-run.md`

## Continuacion: importador transaccional

Se creo el siguiente gate:

- `scripts/migration/import-users-json-to-postgres.mjs`
- `docs/specs/_sesion-19-postgres-importador-transaccional.md`

Lectura:

- El dry-run de este documento fue solo proyeccion sin escritura.
- El importador nuevo usa la misma proyeccion de conteos esperados.
- Validacion local contra `data/users.json`: `diffCount: 0` entre `users-json-to-postgres.mjs` y `import-users-json-to-postgres.mjs`.
- La escritura real queda protegida por `--apply`, transaccion y bloqueo de DB no vacia.

Siguiente gate:

```sh
cd /opt/render/project/src
npm run postgres:import -- --input /opt/render/project/src/storage/users.json --report /tmp/postgres-render-import-plan.json
cat /tmp/postgres-render-import-plan.json
grep -E 'passwordHash|operatorPinHash|tokenHash|dataUrl|base64|legacy_data_url' /tmp/postgres-render-import-plan.json || true
```
