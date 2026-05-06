# Sesion 22 - Panel trabajador: swap congela acciones

Fecha: 2026-05-06

## Problema

La spec activa ya define que durante `swap.inProgress === true` todos los botones de accion del panel operador FRP deben quedar deshabilitados.

La auditoria encontro que el flujo principal ya respetaba esa regla en:

- `Tomar siguiente`;
- `Tomar` de card especifica;
- `Marcar finalizado`;
- `Reportar problema`.

Pero quedaban acciones auxiliares sin cubrir:

- banner de timeout 30 min: `Sigo trabajando` y `Cancelar job`;
- cards de `Pagos por revisar`: `Ver comprobante`;
- cards de `Atencion`: `Resolver`.

## Decision

Durante un cambio de tecnico en curso, la UI puede seguir mostrando contexto operativo, pero no debe dejar disparar ninguna accion que mute estado o abra un flujo operativo sobre FRP.

Regla:

```text
si tech.swap.inProgress === true
  todo boton de accion FRP queda disabled
  el title explica "Cambio de tecnico en curso"
```

Esto protege tanto a operadores regulares como a roles elevados. `ADMIN` o `COORDINADOR` pueden resolver revisiones cuando no hay swap, pero durante swap tambien quedan congelados en UI.

## Alcance

Acciones cubiertas por el contrato:

- `take-next`;
- `take` especifico;
- `finalize`;
- `review`;
- `keep-working`;
- `cancel-timeout`;
- `payment-review`;
- `review-resolver`.

No cambia backend. Las rutas backend ya conservan sus validaciones de ownership y rol; este corte evita UX enganosa durante la ventana de cambio.

## Cambios aplicados

- `frpOpsV2RenderActiveBanner(jobId, { actionsDisabled })` deshabilita `Sigo trabajando` y `Cancelar job` durante swap.
- `frpOpsV2RenderAttentionGrid({ pagosRevisar, reviewJobs, swapInProgress })` deshabilita cards de pago y revision durante swap.
- `renderFrp` propaga `swapInProgress` a la seccion de atencion.
- `phase3a.contract.test.js` guarda que el contrato no vuelva a depender solo de permisos/ownership y olvide swap.

## Riesgo cerrado

Antes, un operador podia ver el badge `Cambiando tecnico...` y aun asi operar acciones laterales. Eso contradecia la spec y podia hacer creer que el cambio de tecnico no bloqueaba todo el panel.

Despues, la ventana de swap queda tratada como estado global de congelamiento de acciones.

## Validacion requerida

Local:

```bash
node --check public/app.js
node --test test/phase3a.contract.test.js
npm test
git diff --check
```

Post deploy:

```bash
cd /opt/render/project/src
npm run postgres:read-check -- --report /tmp/postgres-live-after-worker-swap-action-freeze.json --strict
cat /tmp/postgres-live-after-worker-swap-action-freeze.json
```

Resultado esperado:

```json
{ "ok": true, "tableProjectionMismatches": [] }
```
