# Sesion 22 - Panel operador: Technician ID congelado en trabajo actual

Fecha: 2026-05-06

## Problema

El panel operador mostraba el `Technician ID` del trabajo actual desde `activeTechnician.redirectorId`.

Ese valor representa el turno global actual, no necesariamente el equipo que ya fue conectado por el cliente. El portal cliente ya congela `technicianId`/`redirectorId` en la orden cuando el cliente pulsa `Equipo conectado`; por tanto, el panel del trabajador debe renderizar ese valor congelado.

## Riesgo

Si Jack toma un job y luego el turno global cambia a Angelo, el card `Tu trabajo actual` podia mostrar el Technician ID de Angelo aunque el equipo estuviera conectado con el ID congelado de Jack.

Esto mezcla dos contratos:

- `job.technicianId`: usuario operador que tomo el trabajo.
- `order.redirectorId` / `order.technicianId`: Technician ID congelado para el Redirector.

## Cambio aplicado

- `server/frp/serializers.js` expone `order.redirectorId` y `order.technicianId` dentro de `publicFrpJob`.
- `public/app.js` agrega `frpOpsV2JobRedirectorId()`, que prioriza:
  1. `job.order.redirectorId`;
  2. `job.order.technicianId`;
  3. `tech.active.redirectorId` solo como fallback y no durante swap.
- `test/phase4.smoke.test.js` valida que jobs FRP del operador exponen el Technician ID congelado.
- `test/phase3a.contract.test.js` bloquea la regresion del render del trabajo actual.

## Decision

El badge del header puede seguir representando el turno global activo. El card `Tu trabajo actual` debe representar el dato operativo del job/orden congelada.

## Verificacion esperada

```bash
node --check server/frp/serializers.js
node --check public/app.js
node --test test/phase3a.contract.test.js
node --test test/phase4.smoke.test.js
npm test
```
