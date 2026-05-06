# Sesion 20 - PostgreSQL FRP payment-review transaccional

Fecha: 2026-05-06

Estado: implementado localmente, pendiente de deploy y smoke vivo.

Base de decision: `_sesion-20-postgres-frp-core-transactional-preflight.md`.

## Objetivo

Convertir el primer flujo FRP critico a escritura granular PostgreSQL:

```text
PATCH /api/frp/orders/:id/payment-review
```

Este corte no migra todo FRP. Solo cubre aprobacion/rechazo de comprobante porque toca dinero, estado de portal, ledger y auditoria.

## Hechos

- `audit_events` SSE/GET ya estaba granular.
- denegaciones de permiso ya estaban granulares.
- el riesgo restante estaba en mutaciones FRP con patron `readDb() -> mutar snapshot completo -> writeDb(db)`.
- `payment-review` antes modificaba orden FRP, comprobantes, orden portal, ledger derivado y auditoria desde un snapshot completo.

## Cambios implementados

### `server/db/postgres-audit.js`

Se agrego:

```js
insertAuditEventWithClient(client, event)
```

Razon:

- una transaccion node-postgres debe usar el mismo `client`;
- `insertAuditEvent(event)` abre su propio cliente;
- usarlo dentro de una transaccion de negocio podria dejar auditoria persistida aunque la mutacion FRP hiciera rollback.

### `server/db/postgres-frp-core.js`

Nuevo modulo granular para FRP core.

Primer caso implementado:

```js
reviewFrpPaymentPostgres({ orderId, action, reason, userId, reviewedAt })
```

La funcion:

- abre `withTransaction`;
- bloquea `frp_orders` con `select ... for update`;
- bloquea `payment_proofs` de la orden;
- bloquea `customer_orders` ligada si existe;
- bloquea `frp_jobs` de la orden para recalcular estado con datos actuales;
- actualiza columnas canonicas y `legacy_json`;
- upserta o anula `payment_ledger_entries`;
- inserta `audit_events` con el mismo `client`;
- devuelve resultado para publicar SSE despues del commit.

### `server/frp/frp-routes.js`

La ruta `payment-review` usa PostgreSQL granular solo cuando se inyecta `reviewFrpPaymentPostgres`.

Fallback JSON:

- se mantiene intacto;
- sigue usando el flujo anterior para entornos no PostgreSQL.

Publicacion SSE:

- ocurre despues del commit;
- reconstruye `db` con `readDb()` y publica estado ya persistido.

### `server.js`

La ruta FRP recibe el handler granular solo si:

```js
storage.driver === "postgres"
```

## Invariantes cubiertas

- aprobar pago deja coherentes `frp_orders`, `payment_proofs`, `customer_orders`, `payment_ledger_entries` y `audit_events`.
- rechazar pago marca comprobantes rechazados y no deja ledger validado.
- auditoria del payment-review no queda fuera de la transaccion.
- el fallback JSON no cambia.
- no se publica SSE antes del commit.

## Fuera de alcance

Quedan pendientes para cortes separados:

- `take`
- `take-next`
- `finalize`
- `cancel`
- `review`
- `payment-proof`
- `notify-connected`
- `ready`
- pricing/costos/proveedores

## Pruebas agregadas

Archivo:

```text
test/frp-payment-review-postgres.test.js
```

Cubre:

- approve actualiza orden, lock de portal y comprobantes;
- reject marca rechazo y manda anular ledger;
- missing proofs devuelve 400 antes de mutar.

## Verificacion local

Comandos ejecutados:

```powershell
node --check server/db/postgres-frp-core.js
node --check server/frp/frp-routes.js
node --check server.js
npm.cmd test
```

Resultado:

```text
23 tests pass
```

## Smoke post-deploy requerido

```bash
cd /opt/render/project/src
curl -fsS https://ops.ariadgsm.com/api/health
curl -fsS https://ariadgsm.com/api/health
npm run postgres:read-check -- --report /tmp/postgres-live-after-frp-payment-review-transactional.json --strict
cat /tmp/postgres-live-after-frp-payment-review-transactional.json
```

Smoke manual recomendado:

1. crear orden controlada;
2. subir comprobante;
3. aprobar pago desde admin;
4. verificar portal cliente y panel admin;
5. correr self-check vivo sin `--input`;
6. confirmar ausencia de `POSTGRES_RUNTIME_DESTRUCTIVE_WRITE_BLOCKED`.

## Siguiente corte recomendado

```text
take / take-next transaccional
```

Razon:

- ya no conviene seguir por payment-review;
- el siguiente riesgo real es doble asignacion o seleccion concurrente de job listo.
