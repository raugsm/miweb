# Sesion 22 - Panel trabajador: sin tecnico activo

Fecha: 2026-05-06

## Problema

Despues de cerrar ownership, observador multioperador, VIP, finalizados, revision y swap, quedaba un caso de borde del workbench:

```text
tech.active.userId no existe
```

El backend ya rechaza `take` y `take-next` cuando no hay tecnico activo via `requireActiveFrpTechnician`. El riesgo encontrado estaba en UI: el boton quedaba deshabilitado correctamente, pero el tooltip decia `No sos el tecnico activo`, que describe otro caso.

Ese texto es engañoso cuando no hay ningun tecnico activo.

## Decision

Separar tres estados en UI:

- `swap.inProgress === true`: `Cambio de tecnico en curso`;
- sin `tech.active.userId`: `Sin tecnico activo`;
- existe tecnico activo, pero no es el usuario actual: `No sos el tecnico activo`.

## Alcance

Aplica a acciones de toma:

- CTA principal `Tomar siguiente`;
- card especifica `Tomar`.

No aplica a:

- `Finalizar`, `Reportar problema` o `Cancelar job` de un job ya tomado por el dueño congelado;
- `Ver comprobante`;
- `Resolver revision` para dueño, `ADMIN` o `COORDINADOR`.

Motivo: esas acciones no dependen de ser el tecnico activo global; dependen de ownership congelado o rol. Bloquearlas por ausencia de tecnico activo repetiria el error conceptual que ya se corrigio en los cortes de owner-switch.

## Cambios aplicados

- `renderFrp` calcula `hasActiveTechnician = Boolean(tech?.active?.userId)`.
- `frpOpsV2RenderCurrentEmpty` recibe `hasActiveTechnician` y muestra `Sin tecnico activo` cuando corresponde.
- `frpOpsV2RenderQueueCard` recibe `hasActiveTechnician` y usa el mismo contrato.
- `phase3a.contract.test.js` agrega guarda para impedir mezclar `sin tecnico activo` con `otro tecnico activo`.

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
npm run postgres:read-check -- --report /tmp/postgres-live-after-worker-no-active-tech.json --strict
cat /tmp/postgres-live-after-worker-no-active-tech.json
```

Resultado esperado:

```json
{ "ok": true, "tableProjectionMismatches": [] }
```
