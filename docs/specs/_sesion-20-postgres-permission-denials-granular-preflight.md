# Sesion 20 - PostgreSQL permission-denial audit preflight

Fecha: 2026-05-06

Estado: preflight tecnico, pendiente de aprobacion para implementar.

Base local: `6bfedbb` (`Use granular Postgres audit writes for SSE reads`).

## Objetivo

Preparar el segundo corte granular:

```text
auditoria granular para denegaciones de permisos compartidas
```

Este documento no cambia runtime. Define el alcance exacto antes de tocar helpers compartidos por admin, FRP, pricing, cierres y seguridad.

## Por que este paso sigue

El corte anterior saco `writeDb(db)` de SSE/GET auditables.

Quedo un grupo de riesgo parecido pero no identico: helpers que solo auditan denegaciones de permisos y luego responden `403`.

Estos helpers no mutan negocio cuando deniegan. Por eso son buen siguiente corte antes de entrar a payment-review, take/finalize o ledger.

## Estado actual confirmado

Archivo:

- `server.js`

Helpers con escritura global al denegar:

| Helper | Lineas | Que hace hoy |
| --- | ---: | --- |
| `denySensitiveRoute` | 2909-2918 | `audit(db)` + `writeDb(db)` + `403` |
| `requireFrpAccess` | 2927-2934 | `audit(db)` + `writeDb(db)` + `403` |
| `requireActiveFrpTechnician` | 2936-2947 | `audit(db)` + `writeDb(db)` + `403` |
| `requireFrpCostManagerWithAudit` | 2950-2956 | `audit(db)` + `writeDb(db)` + `403` |
| `requireFrpPaymentReviewer` | 2959-2965 | `audit(db)` + `writeDb(db)` + `403` |

Hecho:

- Estos helpers ya tienen `db` cargado.
- El comportamiento de negocio cuando deniegan es responder `403`.
- La unica persistencia necesaria en la rama de denegacion es auditoria.

Inferencia:

- En PostgreSQL no necesitan reemplazo completo del runtime.
- En JSON deben seguir persistiendo la auditoria como antes.

## Superficie afectada

### requireAdminWithAudit / denySensitiveRoute

Rutas afectadas en `server.js`:

- daily close view/admin:
  - `DAILY_CLOSE_VIEW_DENIED`
  - `DAILY_CLOSE_ADMIN_DENIED`
- operator PIN:
  - `OPERATOR_PIN_UPDATE_DENIED`
- trusted devices:
  - `TRUSTED_DEVICES_REVOKE_DENIED`
  - `ADMIN_DEVICE_APPROVE_DENIED`
- master clients:
  - `CLIENT_MASTER_READ_DENIED`
  - `CLIENT_MASTER_REVIEW_DENIED`
  - `CLIENT_MASTER_UNLINK_DENIED`
- users/pricing/payment methods:
  - `USERS_READ_DENIED`
  - `PRICING_READ_DENIED`
  - `PRICING_RATE_UPDATE_DENIED`
  - `PAYMENT_METHOD_TOGGLED_DENIED`
  - `PRICING_RULE_UPDATE_DENIED`
  - `USER_UPDATE_DENIED`

Rutas afectadas en `server/frp/frp-routes.js`:

- `FRP_POLICY_UPDATE_DENIED`

Riesgo actual:

- un usuario sin permiso puede disparar `writeDb(db)` aunque no haya mutacion de negocio.
- una denegacion normal podria convertirse en 500 si la escritura global falla.

### requireFrpAccess

Rutas afectadas:

- lectura FRP pricing;
- crear orden FRP admin;
- checklist orden;
- subir comprobante FRP;
- checklist job;
- ready;
- take/take-next;
- finalize;
- cancel;
- review;
- SSE operator FRP denied.

Acciones:

- `FRP_PRICING_READ_DENIED`
- `FRP_ORDER_CREATE_DENIED`
- `FRP_ORDER_CHECKLIST_DENIED`
- `FRP_PAYMENT_PROOF_DENIED`
- `FRP_JOB_CHECKLIST_DENIED`
- `FRP_JOB_READY_DENIED`
- `FRP_JOB_TAKE_DENIED`
- `FRP_JOB_FINALIZE_DENIED`
- `FRP_JOB_CANCEL_DENIED`
- `FRP_JOB_REVIEW_DENIED`
- `FRP_OPS_STREAM_DENIED`

Riesgo actual:

- intentos de acceso no autorizado en FRP causan reemplazo global solo para auditar un `403`.

### requireActiveFrpTechnician

Rutas afectadas:

- `POST /api/frp/jobs/:id/take`
- `POST /api/frp/jobs/take-next`

Acciones:

- `FRP_JOB_TAKE_NOT_ACTIVE`

Riesgo actual:

- si un operador no activo intenta tomar trabajo, la ruta solo deberia responder `403`; hoy tambien hace reemplazo global.

### requireFrpCostManagerWithAudit

Rutas afectadas:

- crear proveedor;
- archivar proveedor;
- actualizar proveedor.

Acciones:

- `FRP_PROVIDER_CREATE_DENIED`
- `FRP_PROVIDER_ARCHIVE_DENIED`
- `FRP_PROVIDER_UPDATE_DENIED`

Riesgo actual:

- intentos sin permiso sobre costos/proveedores hacen snapshot write aunque no cambian costos.

### requireFrpPaymentReviewer

Rutas afectadas:

- payment review FRP.

Accion:

- `FRP_PAYMENT_REVIEW_DENIED`

Riesgo actual:

- un usuario sin permiso puede disparar reemplazo global justo en una zona sensible de pagos, aunque la operacion termine en `403`.

## Cambio propuesto

Usar el helper ya implementado en el corte anterior:

```js
const event = audit(db, user.id, action, targetId, detail);
await persistAuditEventOnly(event, {
  db,
  alreadyInDb: true,
  label: "permission_denied"
});
```

Aplicar en:

- `denySensitiveRoute`
- `requireFrpAccess`
- `requireActiveFrpTechnician`
- `requireFrpCostManagerWithAudit`
- `requireFrpPaymentReviewer`

No cambiar:

- `requireUser`
- `requireAdmin`
- `requirePaymentReviewer`
- `requirePricingManager`

Razon:

- esos helpers no auditan ni escriben; solo responden `403`.

## Lo que no se debe tocar en este paso

No migrar todavia:

- payment-review exitoso/rechazado;
- take/take-next exitoso;
- finalize/cancel/review;
- pricing provider updates exitosos;
- daily close mutations;
- login/register/reset.

Razon:

- esas rutas mutan estado real y requieren transacciones por dominio.

## Riesgos del cambio

### Riesgo 1: perder auditoria de denegacion

Control:

- `audit()` sigue insertando el evento en `db.audit`.
- `persistAuditEventOnly` persiste en Postgres o JSON.

### Riesgo 2: ocultar fallo de auditoria

Control:

- `persistAuditEventOnly` ya hace `console.warn`.
- La denegacion debe seguir respondiendo `403`; no debe transformarse en 500 por auditoria.

### Riesgo 3: tocar demasiadas rutas indirectamente

Control:

- cambio solo en helpers.
- pruebas deben cubrir al menos un helper admin y un helper FRP.

## Pruebas requeridas

### Local

```powershell
node --check server.js
npm.cmd test
```

### Prueba nueva recomendada

Agregar cobertura en `test/audit-events-granular.test.js` o nuevo test:

- simular `persistAuditEventOnly` en modo JSON con `alreadyInDb`;
- comprobar que no duplica evento;
- comprobar que mantiene la persistencia legacy por `writeDb`.

Nota:

- No se necesita conexion real a Postgres.

### Render post-deploy

```bash
cd /opt/render/project/src
curl -fsS https://ops.ariadgsm.com/api/health
curl -fsS https://ariadgsm.com/api/health
npm run postgres:read-check -- --report /tmp/postgres-live-after-permission-denials.json --strict
cat /tmp/postgres-live-after-permission-denials.json
```

Smoke recomendado:

1. login admin y cliente normal;
2. abrir admin FRP y portal 60-90 segundos;
3. opcional controlado: intentar una accion FRP con usuario sin permiso, si hay cuenta adecuada;
4. confirmar que las denegaciones quedan como `403`, no `500`;
5. confirmar que no aparece `POSTGRES_RUNTIME_DESTRUCTIVE_WRITE_BLOCKED`.

## Decision recomendada

Implementar este corte antes de FRP core transaccional.

Motivo:

- reduce reemplazos globales en ramas que no mutan negocio;
- baja riesgo de que un acceso denegado rompa una ruta sensible;
- aprovecha el helper `persistAuditEventOnly` ya desplegado y validado;
- mantiene el alcance lejos de pagos/jobs/ledger.

## Autorizacion requerida

Para implementar, aprobar explicitamente:

```text
aprobado permission denials granular
```
