# Sesion 20 - PostgreSQL runtime P0 estabilizacion

Fecha: 2026-05-06

Estado: aplicado en produccion.

Commit desplegado: `92868be21337` (`Stop Postgres snapshot writes from read paths`).

## Objetivo

Documentar el incidente posterior al cutover PostgreSQL, la causa raiz observada, el primer corte aplicado y las reglas para futuras modificaciones.

Este documento es obligatorio para cualquier cambio futuro en:

- `server.js` alrededor de `readDb`, `writeDb`, `getCurrentUser` o `getCurrentCustomerContext`;
- `server/db/postgres-storage.js`;
- `server/db/postgres-legacy-read.js`;
- `server/db/postgres-legacy-plan.js`;
- rutas portal/admin/FRP que llamen `writeDb(db)`.

## Resumen ejecutivo

Hecho:

- PostgreSQL quedo activo como runtime (`storageDriver: "postgres"`).
- El flujo FRP cliente/admin fue probado en produccion despues del corte:
  - login cliente;
  - login admin;
  - aprobacion de pago;
  - `Equipo conectado`;
  - tomar pedido;
  - finalizar pedido.
- La red del navegador mostro APIs en `200`; el unico rojo visible fue Google Fonts bloqueado por CSP.
- El self-check Postgres sin `--input` quedo `ok: true`.

Decision:

- El incendio operativo queda estabilizado.
- No se debe volver a usar `storage/users.json` como fuente viva para comparaciones `--strict`.
- `users.json` queda como snapshot historico pre-cutover.

## Sintoma

Despues de activar `ARIAD_STORAGE_DRIVER=postgres`, varias rutas comenzaron a fallar con 500 o con el guard destructivo:

- `GET /api/portal/active-technician`
- `GET /api/presence`
- `GET /api/operator/technician/status`
- `POST /api/portal/orders/:id/notify-connected`

Mensaje visible del guard:

```text
ARIAD_STORAGE_DRIVER=postgres escritura bloqueada por reemplazo destructivo
```

Ejemplos observados:

```text
operator_users:5->0
master_clients:19->0
customer_clients:18->0
customer_users:18->0
customer_orders:13->0
customer_order_items:14->0
stored_files:17->0
payment_proofs:32->0
frp_orders:13->0
frp_jobs:14->0
active_technician_state:1->0
payment_ledger_entries:13->0
audit_events:835->0
```

## Causa raiz

La raiz no fue una ruta aislada.

La raiz fue mantener el contrato legacy de JSON monolitico encima de PostgreSQL:

```text
request -> readDb() -> mutar objeto db -> writeDb(db) -> plan completo -> reemplazo de muchas tablas
```

Ese contrato era tolerable con `users.json`, pero es peligroso en PostgreSQL porque:

- rutas de lectura podian terminar escribiendo;
- helpers de sesion/presencia se ejecutan antes del handler real;
- `getCurrentCustomerContext()` escribia incluso en rutas de sesion;
- `writeDb(db)` en Postgres reemplaza runtime completo desde el snapshot recibido;
- si el snapshot recibido era parcial o incoherente, el plan podia intentar vaciar tablas criticas.

## Evidencia previa al cambio

Auditoria estatica inicial:

| Archivo | Coincidencias `writeDb` |
| --- | ---: |
| `server.js` | 60 |
| `server/portal/portal-routes.js` | 50 |
| `server/frp/frp-routes.js` | 23 |

Total inicial: 133 coincidencias.

P0 identificado:

- `readDb()` podia llamar `writeDb(db)`.
- `getCurrentUser(req)` podia llamar `writeDb(db)` por limpieza, sesion, presencia o rechazo de dispositivo admin.
- `getCurrentCustomerContext(req)` siempre preparaba escritura de dispositivo/sesion cliente.
- rutas GET/polling dependian de esos helpers.

## Cambio aplicado

Archivo modificado:

- `server.js`

Cambio:

```js
const runtimeSnapshotWritesEnabled = storage.driver !== "postgres";
```

Efecto:

- Bajo `ARIAD_STORAGE_DRIVER=postgres`, `readDb()` ya no persiste normalizaciones incidentales.
- Bajo `ARIAD_STORAGE_DRIVER=postgres`, `getCurrentUser()` ya no persiste last-seen/sesion por snapshot global.
- Bajo `ARIAD_STORAGE_DRIVER=postgres`, `getCurrentCustomerContext()` ya no persiste device/session por snapshot global.
- Bajo `ARIAD_STORAGE_DRIVER=json`, el comportamiento legacy se conserva.

Razon:

- Cortar las escrituras incidentales desde lectura/sesion era el primer corte raiz.
- No se desactivo el guard destructivo.
- No se toco la logica de negocio FRP.

## Verificacion local antes de deploy

Comandos:

```powershell
node --check server.js
npm.cmd test
```

Resultado:

- `node --check server.js`: OK.
- `npm.cmd test`: 17 tests OK.
- Incluye `test/postgres-storage-guard.test.js`.

## Deploy

Commit:

```text
92868be Stop Postgres snapshot writes from read paths
```

Health verificado:

```json
{
  "storageDriver": "postgres",
  "storageRuntimeImplemented": true,
  "releaseCommit": "92868be21337"
}
```

Dominios verificados:

- `https://ops.ariadgsm.com/api/health`
- `https://ariadgsm.com/api/health`

## Smoke test manual en produccion

Flujo validado por navegador:

1. Login cliente.
2. Login admin.
3. Cliente pulsa `Equipo conectado`.
4. Admin ve el pedido en cola/listo.
5. Admin toma el pedido.
6. Admin finaliza el pedido.
7. Panel admin sigue respondiendo `session`, `status`, `presence` en 200.

Resultado:

- `notify-connected`: 200.
- `take`: 200.
- `finalize`: 200.
- polling admin/cliente: 200 sostenido.
- pedido visible en `FINALIZADOS HOY`.

Nota:

- El error de Google Fonts por CSP no pertenece a PostgreSQL ni al flujo FRP.

## Verificacion Postgres post-flujo

Comando correcto post-cutover:

```bash
cd /opt/render/project/src
npm run postgres:read-check -- --report /tmp/postgres-live-self-check.json --strict
cat /tmp/postgres-live-self-check.json
```

Resultado observado:

```json
{
  "tableProjectionMismatches": [],
  "ok": true
}
```

Conteos Postgres vivos al cierre:

```json
{
  "users": 5,
  "sessions": 2,
  "devices": 5,
  "deviceApprovals": 1,
  "customerClients": 18,
  "customerUsers": 18,
  "customerSessions": 25,
  "customerDevices": 105,
  "customerRequests": 14,
  "customerOrders": 14,
  "customerOrderItems": 15,
  "paymentLedgerEntries": 14,
  "portalRateLimits": 2,
  "frpOrders": 14,
  "frpJobs": 15,
  "audit": 884
}
```

Summary checks:

- `customerUsersMatch`: true
- `customerClientsMatch`: true
- `customerOrdersMatch`: true
- `customerOrderItemsMatch`: true
- `frpOrdersMatch`: true
- `frpJobsMatch`: true
- `operatorEmailDuplicates`: 0
- `customerEmailDuplicates`: 0
- `proofMissingDigest`: 0
- `finalImageMissingDigest`: 0

## Regla critica sobre `users.json`

Antes del cutover, este comando era valido:

```bash
npm run postgres:read-check -- --input /opt/render/project/src/storage/users.json --report /tmp/check.json --strict
```

Despues del cutover, ese comando ya no debe usarse como criterio de salud.

Motivo:

- `storage/users.json` es un snapshot pre-cutover.
- PostgreSQL ya contiene datos nuevos: ordenes, jobs, sesiones, dispositivos, comprobantes, auditoria.
- Comparar contra ese JSON en modo strict va a devolver `ok:false` por divergencia esperada.

Interpretacion correcta:

- `ok:false` con `--input users.json` despues del cutover no prueba corrupcion.
- El check correcto de salud viva es sin `--input`.
- Nunca ejecutar `postgres:sync-drift --apply` contra ese JSON historico sin una decision explicita de recuperacion.

## Reglas para futuras modificaciones

Reglas duras:

- No desactivar el guard destructivo en produccion.
- No usar `POSTGRES_RUNTIME_ALLOW_DESTRUCTIVE_REPLACE` como solucion normal.
- No agregar nuevos `writeDb(db)` en rutas GET, polling, SSE o helpers de autenticacion.
- No tratar `readDb()` como lugar para mantenimiento persistente bajo PostgreSQL.
- No comparar Postgres vivo contra `users.json` viejo en modo `--strict`.
- No correr `sync-drift --apply` desde un snapshot viejo salvo plan de restauracion aprobado.

Si una ruta necesita escribir en Postgres:

- Preferir una transaccion SQL especifica por entidad.
- Usar un solo client dentro de la transaccion.
- Registrar auditoria con insert append-only, no reemplazo global.
- Probar con `postgres:read-check` sin `--input` despues del flujo.

## Deuda tecnica restante

El P0 estabiliza el incendio, pero no elimina toda la deuda.

Sigue pendiente:

- Convertir mutaciones FRP criticas a SQL especifico:
  - `notify-connected`;
  - `take`;
  - `finalize`;
  - payment review;
  - cancel/review.
- Convertir login/logout y sesiones a operaciones SQL nativas.
- Convertir auditoria a `INSERT` append-only.
- Reducir el uso normal de `writeDb(db)` completo.
- Reservar `replacePostgresLegacyRuntime()` para migracion, rehidratacion y operaciones controladas fuera del trafico web.

## Proxima decision recomendada

Siguiente corte tecnico recomendado:

Crear una capa runtime Postgres especifica para acciones de negocio FRP/portal, empezando por las rutas de mayor uso:

1. `POST /api/portal/orders/:id/notify-connected`
2. `POST /api/frp/jobs/:id/take`
3. `PATCH /api/frp/jobs/:id/finalize`
4. `PATCH /api/frp/orders/:id/payment-review`

No porque esten fallando ahora, sino porque siguen usando el contrato legacy de snapshot completo.

