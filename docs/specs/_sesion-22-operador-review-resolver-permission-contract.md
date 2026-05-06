# Sesion 22 - Permisos para resolver revision FRP

Fecha: 2026-05-06
Estado: implementado localmente / pendiente push y deploy

## Motivo

`Resolver revision` no es equivalente a `Tomar`, `Finalizar` o `Reportar problema`.

El estado origen es:

```text
REQUIERE_REVISION
```

Eso significa que ya existe un caso reportado. Devolverlo a cola modifica el control operativo del caso y puede borrar la asignacion tecnica previa. Por eso el permiso no debe depender del tecnico activo global.

## Fuentes externas usadas como criterio

- OWASP Authorization Cheat Sheet: recomienda minimo privilegio, denegar por defecto y validar permisos en cada request: https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
- OWASP Developer Guide / Access Controls: recomienda denegar por defecto, aplicar minimo privilegio y crear pruebas para reglas de negocio y autorizacion: https://devguide.owasp.org/en/04-design/02-web-app-checklist/07-access-controls/

## Contrato decidido

`PATCH /api/frp/jobs/:id/ready` conserva su semantica general para preparar trabajos, pero cuando el job actual esta en `REQUIERE_REVISION`, el permiso queda limitado a:

- el tecnico dueno que reporto el caso (`job.technicianId === session.user.id`);
- `ADMIN`;
- `COORDINADOR`.

No autoriza:

- tecnico activo global distinto del dueno;
- cualquier operador FRP solo por pertenecer a WhatsApp 3;
- usuario que solo esta observando el panel.

## Comportamiento esperado

Si el usuario autorizado resuelve:

```text
REQUIERE_REVISION -> LISTO_PARA_TECNICO
```

Efectos intencionales:

- limpia `technicianId`;
- limpia `takenAt`;
- deja el job nuevamente disponible en cola tecnica;
- publica evento FRP normal.

Si el usuario no autorizado intenta resolver:

```text
HTTP 403
Solo quien reporto el caso, coordinador o administrador puede devolverlo a cola.
```

La UI debe reflejar el mismo contrato:

- card de revision propia/admin/coordinador: accion `Resolver ->`;
- card de revision ajena para tecnico regular: `Solo lectura`, deshabilitada.

## Riesgo que se cierra

Antes del cambio, `ready` validaba acceso FRP general, pero no propiedad del caso en revision.

Con varios operadores, eso permitia que el tecnico activo global, o cualquier tecnico FRP con acceso al panel, devolviera a cola un caso que otro tecnico habia reportado.

Ese comportamiento viola el contrato de ownership que ya se habia cerrado para:

- `finalize`;
- `review`;
- `cancel`;
- observador multioperador.

## Pruebas agregadas

- `test/frp-payment-review-postgres.test.js`
  - owner tecnico resuelve su revision;
  - tecnico ajeno recibe 403;
  - coordinador puede resolver;
  - validacion de checklist sigue devolviendo 400 cuando corresponde.
- `test/phase5.technician-swap.test.js`
  - Jack toma job;
  - admin cambia tecnico activo a Angelo;
  - Jack envia el job a revision;
  - Angelo recibe 403 al resolver;
  - Jack resuelve y el job vuelve a cola.
- `test/phase3a.contract.test.js`
  - la card de revision queda deshabilitada para no-duenos sin rol elevado.

## Siguiente validacion Render

Despues de deploy:

```bash
cd /opt/render/project/src
curl -fsS https://ops.ariadgsm.com/api/health
curl -fsS https://ariadgsm.com/api/health
npm run postgres:read-check -- --report /tmp/postgres-live-after-review-resolver-permissions.json --strict
cat /tmp/postgres-live-after-review-resolver-permissions.json
```

Resultado esperado:

```json
{
  "ok": true
}
```
