# Sesion 22 - Postgres FRP take/take-next transaccional

Fecha: 2026-05-06

## Objetivo

Migrar solo `POST /api/frp/jobs/:id/take` y `POST /api/frp/jobs/take-next` fuera del patron legacy `readDb() -> mutar snapshot -> writeDb(db)` cuando `ARIAD_STORAGE_DRIVER=postgres`.

Este corte no incluye `finalize`, `cancel` ni `review`. Esos siguen siendo el siguiente riesgo operativo porque todavia pueden tocar un snapshot completo.

## Fuentes externas usadas

- node-postgres documenta que una transaccion debe usar el mismo cliente para todos sus statements; por eso se usa `withTransaction(...)` y no `pool.query(...)` disperso.
  Fuente: https://node-postgres.com/features/transactions
- PostgreSQL documenta que `FOR UPDATE` bloquea las filas seleccionadas contra updates concurrentes.
  Fuente: https://www.postgresql.org/docs/18/sql-select.html
- PostgreSQL documenta que `SKIP LOCKED` puede usarse para evitar contencion cuando multiples consumidores acceden una tabla tipo cola. Esa es la forma correcta para `take-next`, no para lecturas generales.
  Fuente: https://www.postgresql.org/docs/18/sql-select.html

## Contrato aplicado

### `take` especifico

1. Bloquea el usuario operador con `SELECT ... FOR UPDATE` para serializar dos clicks simultaneos del mismo tecnico.
2. Revisa si el tecnico ya tiene un job `EN_PROCESO`.
3. Bloquea el job solicitado con `FOR UPDATE`.
4. Si sigue `LISTO_PARA_TECNICO`, actualiza solo:
   - `frp_jobs.status`
   - `frp_jobs.technician_id`
   - `frp_jobs.updated_at`
   - `frp_jobs.legacy_json`
   - `audit_events`
5. Devuelve 409 si otro tecnico ya gano la carrera.

No actualiza `frp_orders` en este corte: cambiar un job de `LISTO_PARA_TECNICO` a `EN_PROCESO` no cambia la clase de estado que usa `syncFrpOrderStatus`, y bloquear jobs hermanos de la misma orden aumentaria riesgo de deadlock cuando dos tecnicos toman equipos distintos de una misma orden.

### `take-next`

1. Bloquea el usuario operador igual que `take`.
2. Busca un candidato `LISTO_PARA_TECNICO` con orden estable:
   - `legacy_json->>'readyAt'`
   - `updated_at`
   - `created_at`
   - `id`
3. Usa `FOR UPDATE SKIP LOCKED` para que dos consumidores no tomen la misma fila.
4. Si no hay candidato disponible, devuelve 404.

## Archivos modificados

- `server/db/postgres-frp-core.js`
- `server/frp/frp-routes.js`
- `server.js`
- `test/frp-payment-review-postgres.test.js`

## Verificacion esperada

Comandos locales:

```powershell
node --check server.js
node --test test/frp-payment-review-postgres.test.js
npm.cmd test
```

Resultado local 2026-05-06:

- `node --check server.js`: OK.
- `node --check server/db/postgres-frp-core.js`: OK.
- `node --test test/frp-payment-review-postgres.test.js`: 6/6 OK.
- `npm.cmd test`: 31/31 OK.
- `git diff --check`: OK, solo aviso normal de CRLF en Windows.

Verificacion Render despues de deploy:

```bash
cd /opt/render/project/src
curl -fsS https://ops.ariadgsm.com/api/health
curl -fsS https://ariadgsm.com/api/health
npm run postgres:read-check -- --report /tmp/postgres-live-after-frp-take-transactional.json --strict
cat /tmp/postgres-live-after-frp-take-transactional.json
```

## Actualizacion 2026-05-06

`finalize/cancel` fue tomado como siguiente corte y documentado en `_sesion-22-postgres-frp-finalize-cancel-transactional.md`.

## Riesgo restante

El panel de trabajo aun no queda completamente protegido mientras `review` siga escribiendo por snapshot completo.
