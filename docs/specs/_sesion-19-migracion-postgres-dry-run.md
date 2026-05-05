# Sesion 19 - Migracion PostgreSQL dry-run

Fecha: 2026-05-05

Estado: primer dry-run local ejecutado. No toca produccion.

## Objetivo

Crear artefactos ejecutables para validar la migracion desde `users.json` hacia PostgreSQL sin conectar aun a una base real.

## Archivos creados

- `migrations/001_initial_postgres.sql`
- `scripts/migration/users-json-to-postgres.mjs`
- `docs/specs/_sesion-19-migracion-postgres-dry-run.md`

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
