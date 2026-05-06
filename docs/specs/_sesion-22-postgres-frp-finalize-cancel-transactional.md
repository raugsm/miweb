# Sesion 22 - Postgres FRP finalize/cancel transaccional

Fecha: 2026-05-06

## Objetivo

Migrar solo:

- `PATCH /api/frp/jobs/:id/finalize`
- `PATCH /api/frp/jobs/:id/cancel`

fuera del patron legacy `readDb() -> mutar snapshot -> writeDb(db)` cuando `ARIAD_STORAGE_DRIVER=postgres`.

Este corte no incluye `review`; sigue siendo el siguiente riesgo del nucleo FRP.

## Fuentes externas usadas

- node-postgres exige usar el mismo cliente para todos los statements dentro de una transaccion.
  Fuente: https://node-postgres.com/features/transactions
- PostgreSQL documenta `FOR UPDATE` para bloquear filas seleccionadas contra updates concurrentes.
  Fuente: https://www.postgresql.org/docs/18/sql-select.html
- PostgreSQL `UPDATE` permite actualizar filas concretas y devolver datos con `RETURNING`; el corte mantiene updates granulares en vez de reemplazar snapshots.
  Fuente: https://www.postgresql.org/docs/current/sql-update.html

## Contrato aplicado

### `finalize`

1. Bloquea el job con `FOR UPDATE`.
2. Bloquea la orden FRP ligada con `FOR UPDATE` para serializar recalculo de `order_status`.
3. Valida permisos y estado actual despues del lock:
   - tecnico distinto recibe 403 salvo ADMIN;
   - no `EN_PROCESO` recibe 400 salvo ADMIN.
4. Genera `ardCode` solo si el job no lo tenia, usando `sequence_counters` dentro de la misma transaccion.
5. Actualiza solo:
   - `frp_jobs.status`
   - `frp_jobs.technician_id`
   - `frp_jobs.final_log`
   - `frp_jobs.ard_code`
   - `frp_jobs.done_at`
   - `frp_jobs.updated_at`
   - `frp_jobs.legacy_json`
   - `frp_orders.order_status`
   - `frp_orders.updated_at`
   - `frp_orders.legacy_json`
   - `audit_events`
6. Si llega `finalImages`, persiste granularmente:
   - `stored_files`
   - `frp_job_files`

### `cancel`

1. Bloquea el job y la orden ligada igual que `finalize`.
2. Valida permisos, estado y razon despues del lock.
3. `manual` y `timeout` liberan el job a `LISTO_PARA_TECNICO`.
4. `payment_reverted` terminaliza el job en `CANCELADO`.
5. Actualiza solo:
   - `frp_jobs.status`
   - `frp_jobs.technician_id`
   - `frp_jobs.canceled_at`
   - `frp_jobs.canceled_by`
   - `frp_jobs.cancel_reason`
   - `frp_jobs.updated_at`
   - `frp_jobs.legacy_json`
   - `frp_orders.order_status`
   - `frp_orders.updated_at`
   - `frp_orders.legacy_json`
   - `audit_events`

## Archivos modificados

- `server/db/postgres-frp-core.js`
- `server/frp/frp-routes.js`
- `server.js`
- `test/frp-payment-review-postgres.test.js`

## Verificacion esperada

Comandos locales:

```powershell
node --check server.js
node --check server/frp/frp-routes.js
node --check server/db/postgres-frp-core.js
node --test test/frp-payment-review-postgres.test.js
npm.cmd test
git diff --check
```

Resultado local 2026-05-06:

- `node --check server.js`: OK.
- `node --check server/frp/frp-routes.js`: OK.
- `node --check server/db/postgres-frp-core.js`: OK.
- `node --test test/frp-payment-review-postgres.test.js`: 8/8 OK.
- `npm.cmd test`: 33/33 OK.
- `git diff --check`: OK, solo aviso normal de CRLF en Windows.

Verificacion Render despues de deploy:

```bash
cd /opt/render/project/src
curl -fsS https://ops.ariadgsm.com/api/health
curl -fsS https://ariadgsm.com/api/health
npm run postgres:read-check -- --report /tmp/postgres-live-after-frp-finalize-cancel-transactional.json --strict
cat /tmp/postgres-live-after-frp-finalize-cancel-transactional.json
```

## Actualizacion 2026-05-06

El siguiente corte fue aplicado en `_sesion-22-postgres-frp-review-transactional.md`.

`PATCH /api/frp/jobs/:id/review` ya tiene camino PostgreSQL granular local. El riesgo restante se mueve desde "snapshot destructivo" hacia el contrato funcional de resolver trabajos en `REQUIERE_REVISION`.
