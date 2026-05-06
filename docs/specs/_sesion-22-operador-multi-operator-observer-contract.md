# Sesion 22 - Panel operador: observacion multioperador

Fecha: 2026-05-06

## Problema

El panel operador trataba el estado observador como singular:

```js
jobs.find((job) => job.status === "EN_PROCESO" && job.technicianId !== currentUser.id)
```

Eso era suficiente para explicar el caso Jack/Angelo, pero no para AriadGSM con N operadores.

## Riesgo

Si el operador actual no tiene job, pero otro operador conserva un job en proceso, el panel podia mostrar ese job ajeno como `Tu trabajo actual` en modo lectura.

Con mas operadores esto crea dos problemas:

- oculta otros jobs en proceso tomados por terceros;
- puede quitar el CTA `Tomar siguiente` al operador activo aunque tenga cola disponible.

## Decision

`Tu trabajo actual` debe ser estrictamente personal:

- si `job.technicianId === currentUser.id`, renderiza el job activo propio;
- si no hay job propio, renderiza el estado vacio con CTA segun cola/turno;
- los jobs de otros operadores se muestran en una seccion separada e informativa: `Trabajos en curso por otros`.

## Cambio aplicado

- `otherActiveJob` singular fue reemplazado por `otherActiveJobs`.
- Se agrego `frpOpsV2RenderOtherActiveSection()`.
- Los jobs ajenos ya no bloquean `Tomar siguiente`.
- `phase3a.contract.test.js` bloquea la regresion a `find()` singular.

## Verificacion esperada

```bash
node --check public/app.js
node --test test/phase3a.contract.test.js
npm test
```
