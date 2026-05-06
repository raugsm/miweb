# Sesion 22 - PostgreSQL FRP review transaccional

Fecha: 2026-05-06
Estado: implementado localmente / pendiente push y deploy

## Objetivo

Cerrar el ultimo endpoint critico del nucleo FRP que seguia escribiendo mediante snapshot completo:

```text
PATCH /api/frp/jobs/:id/review
```

Este endpoint compite logicamente contra:

- `PATCH /api/frp/jobs/:id/finalize`
- `PATCH /api/frp/jobs/:id/cancel`

Si un click viejo o una request concurrente llega despues de finalizar/cancelar, no debe revivir el job como `REQUIERE_REVISION`.

## Fuentes externas usadas como criterio

- node-postgres indica que una transaccion debe ejecutarse con el mismo `client`, no mezclando clientes del pool: https://node-postgres.com/features/transactions
- PostgreSQL documenta que `SELECT ... FOR UPDATE` bloquea filas seleccionadas contra updates concurrentes: https://www.postgresql.org/docs/18/sql-select.html
- PostgreSQL documenta `UPDATE` como la operacion de modificacion de filas existentes: https://www.postgresql.org/docs/current/sql-update.html

## Hechos del codigo antes del cambio

- La ruta legacy hacia `review` hacia:
  - `readDb()`
  - mutacion en memoria de `job.status`
  - `syncFrpOrderStatus(db, order)`
  - `audit(...)`
  - `writeDb(db)`
- En PostgreSQL, ese patron podia activar el bloqueo de escritura destructiva o competir con otros cambios de estado del mismo job.
- La UI solo ofrece "Reportar problema" sobre el trabajo actual del tecnico, pero el backend no validaba el estado transaccional real antes de mutar.

## Decision tecnica

Agregar un camino PostgreSQL granular:

```js
reviewFrpJobPostgres({ jobId, userId, userRole, reason, reviewedAt })
```

Reglas:

1. Bloquear `frp_jobs` por `id` con `FOR UPDATE`.
2. Bloquear la `frp_orders` ligada con `FOR UPDATE`.
3. Leer jobs hermanos de la orden despues de tomar el lock de la orden.
4. Validar estado actual dentro de la transaccion.
5. Actualizar solo:
   - `frp_jobs.status`
   - `frp_jobs.review_reason`
   - `frp_jobs.updated_at`
   - `frp_jobs.legacy_json`
   - `frp_orders.order_status`
   - `frp_orders.updated_at` si cambia el estado
   - `frp_orders.legacy_json`
   - `audit_events`
6. Publicar SSE solo despues del commit, desde la ruta.

## Cambio de contrato intencional

El legacy podia aceptar `review` aunque el job ya no estuviera en proceso, siempre que el usuario fuera el tecnico asignado o ADMIN.

El nuevo camino PostgreSQL exige:

```text
job.status === "EN_PROCESO"
```

Razon:

- `review`, `finalize` y `cancel` son transiciones terminales/conflictivas desde el punto de vista operativo.
- Un request viejo no debe convertir un job `FINALIZADO` o `CANCELADO` en `REQUIERE_REVISION`.
- La UI real dispara `review` desde "Tu trabajo actual", que representa un job en proceso.

Este ajuste no es polish; es control de concurrencia y coherencia de estado.

## Archivos modificados

- `server/db/postgres-frp-core.js`
- `server/frp/frp-routes.js`
- `server.js`
- `test/frp-payment-review-postgres.test.js`

## Funciones agregadas

En `server/db/postgres-frp-core.js`:

- `applyFrpJobReviewLegacyState(...)`
- `reviewFrpJobPostgres(...)`

Helper interno:

- `persistFrpReviewState(...)`

## Validacion local esperada

```powershell
node --check server.js
node --check server/frp/frp-routes.js
node --check server/db/postgres-frp-core.js
node --test test/frp-payment-review-postgres.test.js
npm.cmd test
git diff --check
```

## Validacion Render post-deploy

```bash
cd /opt/render/project/src
curl -fsS https://ops.ariadgsm.com/api/health
curl -fsS https://ariadgsm.com/api/health
npm run postgres:read-check -- --report /tmp/postgres-live-after-frp-review-transactional.json --strict
cat /tmp/postgres-live-after-frp-review-transactional.json
```

Resultado esperado:

```json
{
  "ok": true
}
```

## Fuera de alcance

No se corrige en este corte:

- la card `data-frp-show-review` que no abre accion porque el delegador escucha `data-frp-review`;
- el modal real de problema, que hoy sigue siendo `window.prompt`;
- el flujo de resolucion de jobs `REQUIERE_REVISION`;
- polish visual del workbench.

Esos puntos deben entrar en el siguiente corte funcional de "review/resolver", no mezclados con la migracion transaccional.

## Riesgo restante

El nucleo de mutaciones criticas FRP queda cubierto por caminos granulares:

- payment-review
- take/take-next
- finalize
- cancel
- review

El siguiente riesgo ya no es el snapshot destructivo del nucleo FRP, sino el contrato funcional alrededor de `REQUIERE_REVISION`:

- como se abre el detalle desde la lista de atencion;
- quien puede resolver;
- que estado recupera el job al resolver;
- que auditoria debe dejar.

## Actualizacion 2026-05-06

El contrato funcional de resolver trabajos en `REQUIERE_REVISION` fue movido al documento:

```text
docs/specs/_sesion-22-postgres-frp-review-resolver-contract.md
```

Ese corte migra `PATCH /api/frp/jobs/:id/ready` a camino PostgreSQL granular y conecta la card `data-frp-show-review` con un dialogo de resolucion.
