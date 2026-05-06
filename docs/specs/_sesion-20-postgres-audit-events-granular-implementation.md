# Sesion 20 - PostgreSQL audit_events granular implementation

Fecha: 2026-05-06

Estado: implementado localmente, pendiente de deploy/validacion en Render.

Preflight base:

- `docs/specs/_sesion-20-postgres-audit-events-granular-preflight.md`

## Objetivo

Ejecutar el primer corte aprobado despues de la auditoria:

```text
audit_events append-only transaccional y sin writeDb(db) en SSE/GET auditables
```

## Archivos modificados

- `server/core/audit.js`
- `server/db/postgres-audit.js`
- `server.js`
- `server/portal/portal-routes.js`
- `test/audit-events-granular.test.js`
- `package.json`

## Cambio aplicado

### 1. Audit core devuelve evento

`audit(db, actorId, action, targetId, detail)` ahora:

- crea un evento con `createAuditEvent`;
- lo inserta en `db.audit` con `pushAuditEvent`;
- devuelve exactamente el evento creado.

Esto mantiene compatibilidad con llamadas existentes que ignoran el retorno.

### 2. Insert granular de audit_events

Se agrego `server/db/postgres-audit.js`.

Responsabilidad:

- convertir evento legacy a fila `audit_events`;
- normalizar `actor_id` a UUID o `null`;
- preservar el evento completo en `legacy_json`;
- insertar con `on conflict (id) do nothing`;
- no usar `writeDb(db)`;
- no reconstruir tablas runtime.

### 3. Rutas GET/SSE cambiadas

Las siguientes escrituras dejaron de usar reemplazo global:

| Ruta | Antes | Ahora |
| --- | --- | --- |
| `GET /api/portal/orders/events` blocked | `audit(db)` + `writeDb(db)` | `audit(db)` + insert granular |
| `GET /api/portal/orders/events` connected | `audit(db)` + `writeDb(db)` | `audit(db)` + insert granular |
| `GET /api/portal/orders/events` disconnected | `readDb()` + `audit(db)` + `writeDb(db)` | evento directo + insert granular |
| `GET /api/operator/frp/events` connected | `audit(db)` + `writeDb(db)` | `audit(db)` + insert granular |
| `GET /api/operator/frp/events` disconnected | `readDb()` + `audit(db)` + `writeDb(db)` | evento directo + insert granular |
| `GET /api/portal/orders/:id` lookup blocked | `audit(db)` + `writeDb(db)` | `audit(db)` + insert granular |
| `GET /api/portal/orders/:id/comprobante.pdf` | `audit(db)` + `writeDb(db)` | sin escritura de auditoria |
| `GET /api/daily-close/:date/export` | `audit(db)` + `writeDb(db)` | `audit(db)` + insert granular |

## Lo que no se toco

No se migraron todavia:

- aprobacion/rechazo de pago FRP;
- tomar/take-next/finalizar/cancelar jobs;
- creacion de orden portal;
- subida de comprobantes;
- login/register/reset;
- pricing/proveedores/costos;
- cierres y ledger salvo auditoria de export GET.

Razon:

- esas rutas mutan negocio real;
- requieren transacciones por dominio;
- migrarlas junto con audit_events aumentaria riesgo y romperia el alcance aprobado.

## Riesgo residual conocido

`requireFrpAccess`, `requireActiveFrpTechnician`, `requireAdminWithAudit` y helpers similares todavia pueden auditar denegaciones con `writeDb(db)`.

No se cambiaron en este corte porque son helpers compartidos por rutas POST/PATCH de negocio. Migrarlos requiere una segunda decision: audit granular para denegaciones de permisos en helpers compartidos.

## Verificacion local

Comandos ejecutados:

```powershell
node --check server.js
node --check server/core/audit.js
node --check server/db/postgres-audit.js
node --check server/portal/portal-routes.js
node --test test/audit-events-granular.test.js
npm.cmd test
```

Resultados:

- `node --check`: OK.
- `test/audit-events-granular.test.js`: 3 tests OK.
- `npm.cmd test`: 20 tests OK.

## Validacion pendiente post-deploy

En Render:

```bash
cd /opt/render/project/src
curl -fsS https://ops.ariadgsm.com/api/health
curl -fsS https://ariadgsm.com/api/health
npm run postgres:read-check -- --report /tmp/postgres-live-after-audit-events.json --strict
cat /tmp/postgres-live-after-audit-events.json
```

Smoke recomendado:

1. login admin;
2. login cliente;
3. dejar abiertos admin y portal cliente 60-90 segundos;
4. revisar `events`, `session`, `presence`, `status`, `active-technician`;
5. abrir/descargar comprobante PDF;
6. confirmar que no aparece `POSTGRES_RUNTIME_DESTRUCTIVE_WRITE_BLOCKED`;
7. confirmar `postgres:read-check` vivo sin `--input` con `ok: true`.

## Siguiente paso despues de deploy

Si este corte queda estable, el siguiente paso tecnico deberia ser:

```text
audit granular para denegaciones de permisos compartidas
```

Despues de eso recien conviene entrar a FRP core transaccional: payment-review, take/take-next y finalize.
