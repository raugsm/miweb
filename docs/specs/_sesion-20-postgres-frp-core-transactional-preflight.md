# Sesion 20 - PostgreSQL FRP core transactional preflight

Fecha: 2026-05-06

Estado: preflight tecnico, pendiente de aprobacion para implementar.

Base local: `ae530c0` (`Use granular audit writes for permission denials`).

## Objetivo

Preparar el siguiente corte P1:

```text
FRP core transaccional: payment-review, take/take-next, finalize, cancel y review
```

Este documento no cambia runtime. Define alcance, riesgos, invariantes, estrategia tecnica y pruebas antes de tocar mutaciones de negocio.

## Fuentes externas usadas

- node-postgres, Transactions: una transaccion debe ejecutar `BEGIN / COMMIT / ROLLBACK` sobre el mismo `client`; no se debe usar `pool.query` para los statements de una misma transaccion.
  - https://node-postgres.com/features/transactions
- PostgreSQL, Explicit Locking: `SELECT ... FOR UPDATE` bloquea las filas seleccionadas contra `UPDATE`, `DELETE` y otros locks hasta el fin de la transaccion.
  - https://www.postgresql.org/docs/17/explicit-locking.html
- PostgreSQL, Transaction Isolation: en `READ COMMITTED`, un `UPDATE` o `SELECT FOR UPDATE` puede esperar a otra transaccion y luego re-evaluar la condicion sobre la version actualizada.
  - https://www.postgresql.org/docs/current/transaction-iso.html

## Por que este paso sigue

Hechos:

- `audit_events` SSE/GET ya fue cortado a escritura granular.
- denegaciones de permisos compartidas ya fueron cortadas a escritura granular.
- el self-check vivo post-deploy quedo `ok: true` en `ae530c0`.
- el bloque FRP core todavia usa `readDb() -> mutar db completo -> writeDb(db)` en rutas que cambian dinero, jobs y estados cliente-operador.

Inferencia:

- El mayor riesgo restante no esta en auditoria lateral, sino en mutaciones FRP que deben ser atomicas.
- El viejo patron de snapshot completo puede perder actualizaciones concurrentes o activar el guard destructivo si el objeto `db` llega incompleto.

Opinion tecnica:

- No conviene migrar todo FRP de una vez. Conviene empezar por `payment-review`, `take/take-next`, `finalize`, `cancel` y `review`, porque son el nucleo probado por el usuario y el punto donde vimos 500 antes.

## Alcance exacto

Archivo principal:

- `server/frp/frp-routes.js`

Rutas en alcance:

| Ruta | Linea actual | Estado actual | Riesgo |
| --- | ---: | --- | --- |
| `PATCH /api/frp/orders/:id/payment-review` | 644-700 | muta orden FRP, orden cliente ligada, ledger implicito por normalizacion y auditoria | pago validado sin reflejo coherente en portal/ledger |
| `POST /api/frp/jobs/:id/take` | 752-780 | muta job, orden FRP y auditoria | doble toma o toma sobre estado ya cambiado |
| `POST /api/frp/jobs/take-next` | 783-804 | selecciona primer job listo por snapshot y muta | dos tecnicos pueden elegir el mismo candidato si no hay lock |
| `PATCH /api/frp/jobs/:id/finalize` | 807-845 | muta job, orden FRP y auditoria | finalizacion puede pisar cancelacion/revision simultanea |
| `PATCH /api/frp/jobs/:id/cancel` | 860-902 | muta job, orden FRP y auditoria | cancelacion puede liberar o terminalizar un job ya finalizado |
| `PATCH /api/frp/jobs/:id/review` | 905-925 | muta job, orden FRP y auditoria | revision puede pisar finalize/cancel |

Rutas relacionadas pero fuera de este primer corte:

- `PATCH /api/frp/orders/:id/checklist`
- `PATCH /api/frp/orders/:id/payment-proof`
- `PATCH /api/frp/jobs/:id/checklist`
- `PATCH /api/frp/jobs/:id/ready`
- pricing/proveedores/costos FRP
- creacion de orden FRP manual/admin
- creacion de orden portal
- subida de comprobante cliente
- `notify-connected`

Razon:

- Son importantes, pero mezclar proof upload, ready, pricing y portal order con el primer corte transaccional aumenta el radio de fallo.

## Tablas afectadas

Tablas directas:

- `frp_orders`
- `frp_jobs`
- `customer_orders`
- `customer_order_items`
- `payment_ledger_entries`
- `payment_proofs`
- `stored_files`
- `audit_events`

Tablas de lectura/validacion:

- `operator_users`
- `active_technician_state`
- `internal_clients`
- `master_clients`
- `exchange_rates`
- `service_pricing_rules`
- `payment_method_overrides`

## Estado actual confirmado en codigo

### payment-review

`server/frp/frp-routes.js:644-700`

Mutaciones:

- `frp_orders.payment_status`
- `frp_orders.checklist.paymentValidated`
- `frp_orders.payment_reviewed_by`
- `frp_orders.payment_reviewed_at`
- `frp_orders.payment_rejected_reason`
- `frp_orders.paymentProofs[].reviewStatus`
- `customer_orders.priceLocked`
- `customer_orders.priceLockedAt`
- `customer_orders.priceLockExpiresAt`
- `customer_orders.priceDecision*`
- `customer_orders.debtCleared*`
- `payment_ledger_entries` por `syncFrpLedgerEntry`
- `audit_events`

Riesgo especifico:

- aprobar pago debe ser atomico con lock de precio, reflejo portal, ledger y auditoria.
- rechazar pago debe ser atomico con estado de comprobantes y estado publico.

### take / take-next

`server/frp/frp-routes.js:752-804`

Mutaciones:

- `frp_jobs.status = EN_PROCESO`
- `frp_jobs.technician_id`
- `frp_jobs.taken_at` en `legacy_json`
- `frp_orders.order_status` por `syncFrpOrderStatus`
- `audit_events`

Riesgo especifico:

- `take-next` selecciona por snapshot el primer job `LISTO_PARA_TECNICO`.
- Sin `SELECT ... FOR UPDATE` o `UPDATE ... WHERE status = 'LISTO_PARA_TECNICO'`, dos requests cercanos pueden tomar el mismo candidato logicamente.

### finalize / cancel / review

`server/frp/frp-routes.js:807-925`

Mutaciones:

- `frp_jobs.status`
- `frp_jobs.final_log`
- `frp_jobs.ard_code`
- `frp_jobs.done_at`
- `frp_jobs.canceled_at`
- `frp_jobs.cancel_reason`
- `frp_jobs.review_reason`
- `frp_job_files` si se habilitan imagenes finales fuera de `legacy_json`
- `stored_files` si se persisten imagenes finales granularmente
- `frp_orders.order_status` por `syncFrpOrderStatus`
- `audit_events`

Riesgo especifico:

- finalize, cancel y review son transiciones mutuamente conflictivas.
- Deben validar estado actual dentro de la transaccion, no sobre un objeto leido antes.

## Invariantes que no se pueden romper

1. Un job no puede estar simultaneamente `EN_PROCESO`, `FINALIZADO`, `CANCELADO` y `REQUIERE_REVISION`.
2. Un tecnico no debe tener mas de un job `EN_PROCESO` salvo decision futura documentada.
3. `take-next` debe tomar un solo job y devolver 409/404 si otro request lo gano.
4. Aprobar pago debe dejar FRP order, portal order, proofs, ledger y auditoria coherentes.
5. Rechazar pago debe dejar el comprobante rechazado y no crear ledger validado.
6. Finalizar job debe generar `ardCode` una sola vez y no pisar uno existente.
7. `syncFrpOrderStatus` debe recalcular contra el estado transaccional real.
8. Los eventos SSE se publican despues de commit, nunca antes.
9. Si la transaccion falla, no debe publicarse estado nuevo ni quedar auditoria suelta.
10. `postgres:read-check --strict` sin `--input` debe terminar `ok: true`.

## Decision tecnica propuesta

Implementar un modulo granular nuevo:

```text
server/db/postgres-frp-core.js
```

Responsabilidad:

- ofrecer funciones transaccionales por caso de uso;
- usar `withTransaction(client => ...)`;
- ejecutar todos los statements del caso con el mismo `client`;
- devolver un `db` reconstruido o payload suficiente para publicar SSE despues de commit;
- no llamar `writeDb(db)` en PostgreSQL;
- mantener fallback JSON con el flujo actual hasta que se decida otra cosa.

Funciones candidatas:

```js
reviewFrpPaymentPostgres({ orderId, action, reason, userId, now })
takeFrpJobPostgres({ jobId, userId, now })
takeNextFrpJobPostgres({ userId, now })
finalizeFrpJobPostgres({ jobId, userId, finalLog, finalImages, now })
cancelFrpJobPostgres({ jobId, userId, reason, note, now })
markFrpJobReviewPostgres({ jobId, userId, reason, now })
```

No usar `insertAuditEvent(event)` tal como esta dentro de estas transacciones, porque hoy abre su propio client con `withPostgresClient`.

Requisito previo:

```text
agregar variante transaction-aware para audit_events
```

Por ejemplo:

```js
insertAuditEventWithClient(client, event)
```

Razon:

- node-postgres exige que todos los statements de una transaccion usen el mismo client.
- insertar auditoria con otro client seria otra transaccion y podria sobrevivir aunque la mutacion de negocio haga rollback.

## Estrategia SQL recomendada

### take especifico

Patron recomendado:

```sql
select *
from ariad.frp_jobs
where id = $1
for update;
```

Luego validar:

- existe;
- `status = 'LISTO_PARA_TECNICO'`;
- tecnico activo;
- usuario no tiene otro `EN_PROCESO`.

Despues:

- actualizar `frp_jobs`;
- recalcular `frp_orders`;
- insertar `audit_events`;
- commit.

### take-next

Patron recomendado:

```sql
select *
from ariad.frp_jobs
where status = 'LISTO_PARA_TECNICO'
order by coalesce(ready_at, updated_at, created_at), id
for update skip locked
limit 1;
```

Nota:

- Si `ready_at` solo vive dentro de `legacy_json`, hay dos opciones:
  - migrar `ready_at` a columna antes o durante este corte;
  - ordenar por `updated_at/created_at` y dejar `readyAt` como compatibilidad legacy.

Decision recomendada:

- para este corte, no agregar columna nueva salvo que el codigo confirme que `readyAt` es requisito funcional fuerte.
- documentar que `updated_at` queda como orden estable de cola para PostgreSQL.

### payment-review

Patron recomendado:

- bloquear `frp_orders` por `id`;
- bloquear `customer_orders` ligada por `portal_order_id` si existe;
- bloquear/actualizar proofs de esa fuente;
- upsert/void ledger con `on conflict (source_type, source_id, entry_type) do update`;
- insertar auditoria;
- commit.

### finalize/cancel/review

Patron recomendado:

- bloquear `frp_jobs` por `id`;
- bloquear `frp_orders` ligada;
- validar estado actual despues del lock;
- actualizar solo transicion permitida;
- insertar auditoria;
- commit.

## Pruebas minimas antes de deploy

Unitarias/integracion local:

- `node --check server.js`
- `node --check server/frp/frp-routes.js`
- `node --check server/db/postgres-frp-core.js`
- `npm.cmd test`

Tests nuevos recomendados:

1. `take specific` exitoso actualiza un solo job y la orden ligada.
2. `take specific` sobre job ya tomado devuelve conflicto y no cambia tecnico.
3. `take-next` con dos llamadas concurrentes no toma el mismo job.
4. `finalize` desde `EN_PROCESO` marca `FINALIZADO`, conserva/genera `ardCode` una sola vez.
5. `cancel` desde `EN_PROCESO` con `manual` vuelve a `LISTO_PARA_TECNICO`.
6. `review` marca `REQUIERE_REVISION` y no deja job en proceso.
7. `payment-review approve` actualiza order, portal order, proofs, ledger y audit.
8. `payment-review reject` no deja ledger validado.
9. Si una query falla a mitad, no queda audit event persistido ni cambio parcial.

Smoke post-deploy:

```bash
cd /opt/render/project/src
curl -fsS https://ops.ariadgsm.com/api/health
curl -fsS https://ariadgsm.com/api/health
npm run postgres:read-check -- --report /tmp/postgres-live-after-frp-core-transactional.json --strict
cat /tmp/postgres-live-after-frp-core-transactional.json
```

Smoke manual:

1. crear orden cliente controlada;
2. subir comprobante;
3. aprobar pago;
4. tomar job especifico;
5. finalizar job;
6. verificar portal cliente y panel admin;
7. correr self-check vivo sin `--input`;
8. revisar que no aparezca `POSTGRES_RUNTIME_DESTRUCTIVE_WRITE_BLOCKED`.

Smoke concurrencia recomendado:

- abrir dos sesiones admin/tecnico o dos curls controlados;
- intentar `take` sobre el mismo job;
- resultado esperado: una gana, la otra recibe 409/422, nunca dos tecnicos asignados.

## Riesgos y mitigaciones

### Riesgo 1: transaccion parcial por usar dos clients

Mitigacion:

- no llamar helpers que abran `withPostgresClient` dentro de `withTransaction`;
- crear variantes `WithClient`.

### Riesgo 2: publicar SSE antes de commit

Mitigacion:

- las funciones transaccionales devuelven resultado;
- `publishPortalOrdersForFrpOrder` y `publishFrpOps` se ejecutan solo despues del commit.

### Riesgo 3: divergencia entre legacy_json y columnas

Mitigacion:

- cada update debe actualizar columnas canonicas y `legacy_json`;
- `postgres:read-check --strict` debe reconstruir el legacy esperado.

### Riesgo 4: take-next cambia orden de cola

Mitigacion:

- documentar si se usa `updated_at/created_at`;
- si `readyAt` es indispensable, agregar columna y migracion separada.

### Riesgo 5: ledger duplicado

Mitigacion:

- usar constraint existente `unique (source_type, source_id, entry_type)`;
- usar `insert ... on conflict ... do update` para `payment_ledger_entries`.

## No aprobado todavia

No implementar sin aprobacion explicita:

- modulo `postgres-frp-core.js`;
- cambios en `frp-routes.js`;
- tests concurrentes;
- migraciones nuevas;
- columnas nuevas como `ready_at`;
- conversion de proof/final images fuera de `legacy_json`.

## Siguiente paso unico

Si este preflight queda aprobado:

```text
implementar transaction-aware audit_events + primer corte de FRP payment-review
```

No empezaria por `take-next`.

Decision:

- `payment-review` es primero porque toca dinero, portal order y ledger.
- `take/take-next` va segundo porque requiere bloqueo de cola y prueba concurrente.
