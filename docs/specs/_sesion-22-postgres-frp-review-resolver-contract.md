# Sesion 22 - FRP review resolver transaccional

Fecha: 2026-05-06
Estado: implementado localmente / pendiente push y deploy

## Objetivo

Cerrar el contrato funcional que quedo pendiente despues de migrar `review`:

- `Reportar problema` no debe depender de `window.prompt`.
- La card de Atencion `data-frp-show-review` debe abrir una accion real.
- Resolver un job en `REQUIERE_REVISION` no debe llamar una ruta PostgreSQL de reemplazo global.

El endpoint involucrado es:

```text
PATCH /api/frp/jobs/:id/ready
```

## Fuentes externas usadas como criterio

- MDN documenta que `<dialog>` representa dialogos modales/no modales y que `showModal()` abre un modal con contenido externo inerte; tambien recomienda proveer un mecanismo de cierre: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog
- WAI-ARIA APG define que un dialogo modal debe contener el foco, permitir cierre con una accion visible y estar correctamente etiquetado: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
- El criterio de transaccion y locks sigue el documento anterior: `docs/specs/_sesion-22-postgres-frp-review-transactional.md`.

## Hechos antes del cambio

- `public/app.js` renderizaba cards de Atencion con `data-frp-show-review`.
- El delegador de clicks solo escuchaba `data-frp-review`, usado por el boton `Reportar problema`.
- `requestFrpReview(jobId)` usaba `window.prompt`, sin UI controlada ni estado de carga.
- `PATCH /api/frp/jobs/:id/ready` seguia en patron legacy:
  - `readDb()`
  - mutacion en memoria
  - `writeDb(db)`
- Con `ARIAD_STORAGE_DRIVER=postgres`, conectar la UI a esa ruta habria repetido el riesgo de reemplazo global.

## Decision tecnica

1. Agregar un dialogo nativo para dos modos:
   - `report`: enviar el job actual a `REQUIERE_REVISION`.
   - `resolve`: devolver un job en revision a la cola tecnica.
2. Conectar `data-frp-show-review` al modo `resolve`.
3. Migrar `ready` a camino PostgreSQL granular:

```js
markFrpJobReadyPostgres({ jobId, userId, userRole, readyAt })
```

4. Publicar SSE despues del commit, desde la ruta.
5. Mantener fallback legacy solo para driver no PostgreSQL.

## Contrato aplicado

Resolver revision significa:

```text
REQUIERE_REVISION -> LISTO_PARA_TECNICO
```

La transicion valida solo si:

- la orden tiene pago validado;
- la conexion fue enviada;
- la autorizacion fue confirmada;
- el checklist del job esta completo;
- el estado actual es `ESPERANDO_PREPARACION`, `ESPERANDO_CLIENTE` o `REQUIERE_REVISION`.

Cambio intencional:

- `technicianId` se limpia.
- `takenAt` se limpia.

Razon: un caso devuelto desde Atencion debe volver a la cola sin propiedad del tecnico que lo reporto. Si se deja asignado, la cola queda semanticamente ambigua aunque el status sea `LISTO_PARA_TECNICO`.

## Contrato de permisos para `REQUIERE_REVISION`

Cuando `ready` resuelve un job en `REQUIERE_REVISION`, no basta con tener acceso FRP general ni ser el tecnico activo global.

Puede devolverlo a cola:

- el tecnico dueno que lo reporto (`job.technicianId === user.id`);
- `ADMIN`;
- `COORDINADOR`.

No puede devolverlo:

- otro tecnico regular;
- el tecnico activo global si no es dueno del caso;
- un observador de la cola.

El contrato dedicado queda documentado en:

```text
docs/specs/_sesion-22-operador-review-resolver-permission-contract.md
```

## Archivos modificados

- `server/db/postgres-frp-core.js`
- `server/frp/frp-routes.js`
- `server.js`
- `public/index.html`
- `public/app.js`
- `public/styles.css`
- `test/frp-payment-review-postgres.test.js`

## Validacion local

```powershell
node --check public/app.js
node --check server.js
node --check server/db/postgres-frp-core.js
node --check server/frp/frp-routes.js
node --test test/frp-payment-review-postgres.test.js
npm.cmd test
git diff --check
```

Resultado local 2026-05-06:

- `node --check public/app.js`: OK.
- `node --check server.js`: OK.
- `node --check server/db/postgres-frp-core.js`: OK.
- `node --check server/frp/frp-routes.js`: OK.
- `node --test test/frp-payment-review-postgres.test.js`: 12/12 OK.
- `npm.cmd test`: 37/37 OK.
- `git diff --check`: OK, solo aviso normal de CRLF en Windows.

## Validacion Render post-deploy

```bash
cd /opt/render/project/src
curl -fsS https://ops.ariadgsm.com/api/health
curl -fsS https://ariadgsm.com/api/health
npm run postgres:read-check -- --report /tmp/postgres-live-after-frp-review-resolver.json --strict
cat /tmp/postgres-live-after-frp-review-resolver.json
```

Resultado esperado:

```json
{
  "ok": true
}
```

## Riesgo restante

Este corte cierra el contrato de resolver `REQUIERE_REVISION`.

No cierra:

- rediseño del panel operador;
- instrucciones de sideload en "Donde pegar estos codigos";
- investigacion de cierre de Chrome al subir comprobante;
- reemplazo de Google Fonts bloqueado por CSP.
