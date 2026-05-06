# Sesion 22 - Panel trabajador: repaint al cerrar swap

Fecha: 2026-05-06

## Problema

Ya se valido que durante `swap.inProgress === true` las acciones FRP quedan congeladas. El riesgo siguiente era el estado posterior:

```text
swap.inProgress pasa de true a false
```

Si el frontend no repinta rapido, el panel puede quedar mostrando `Cambiando tecnico...`, botones deshabilitados o Technician ID visual viejo aunque el backend ya haya cerrado el switch.

## Hechos verificados

- Backend: `resolveActiveTechnician` confirma el swap cuando `now >= swapEndsAt`.
- Backend: la prueba runtime `phase 5: technician switch with swap window and auto-revert` cubre switch normal y auto-revert.
- Frontend: `paintTechnicianWidget(status)` recibe el status fresco desde `/api/operator/technician/status`.
- Frontend: durante swap llama `setTechnicianPollInterval(FRP_OPS_TECHNICIAN_POLL_SWAP_MS)`.
- Frontend: cuando ya no hay swap vuelve a `FRP_OPS_TECHNICIAN_POLL_NORMAL_MS`.
- Frontend: cada `paintTechnicianWidget` ejecuta `renderFrp({ skipPricing: true })`, por lo que el header y botones del workbench se recalculan con `technicianStatusCache` actualizado.

## Decision

No se cambio runtime. El comportamiento actual ya sostiene el contrato.

El corte agrega guarda contractual para que futuras modificaciones no rompan:

- polling normal de 30s;
- polling acelerado de 2s durante swap;
- regreso a polling normal al terminar swap;
- repaint del workbench con `skipPricing: true`.

## Contrato esperado

```text
paintTechnicianWidget(status):
  guarda status en technicianStatusCache
  si status.swap.inProgress:
    polling = 2s
  si no hay swap y ya existe polling:
    polling = 30s
  si FRP esta habilitado:
    renderFrp({ skipPricing: true })
```

## Riesgo cerrado

El riesgo no era una falla visible actual, sino ausencia de prueba en frontend. Sin esa guarda, una refactorizacion futura podria dejar el panel congelado visualmente despues del swap aunque el backend estuviera correcto.

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
npm run postgres:read-check -- --report /tmp/postgres-live-after-worker-swap-repaint-contract.json --strict
cat /tmp/postgres-live-after-worker-swap-repaint-contract.json
```

Resultado esperado:

```json
{ "ok": true, "tableProjectionMismatches": [] }
```
