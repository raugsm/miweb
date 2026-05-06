# Sesion 22 - Operador Take Especifico y Tecnico Activo Stale

Fecha: 2026-05-06

## Hecho verificado

La UI deshabilita `Tomar` si `currentUser` no es el tecnico activo, pero esa validacion es solo ayuda visual. La autoridad real debe estar en backend porque el tecnico activo puede cambiar entre render y click.

## Riesgo revisado

Un operador podia tener una vista vieja con un card `LISTO_PARA_TECNICO`. Si el admin cambiaba el tecnico activo antes del click, el operador anterior no debia poder tomar ese job aunque su pantalla aun mostrara el boton habilitado.

## Contrato

- `POST /api/frp/jobs/:id/take` debe validar `requireActiveFrpTechnician` en el momento del request.
- Si el usuario ya no es tecnico activo, responde `403`.
- La UI muestra el error recibido y ejecuta `refreshSession()`.
- El job no cambia a `EN_PROCESO` para el operador stale.
- El tecnico activo real puede tomar el job despues.

## Guardas

- `phase5.technician-swap.test.js` ejecuta la carrera completa con servidor real:
  1. Jack queda como tecnico activo.
  2. Se crea un job FRP listo.
  3. Jack inicia sesion y podria tener la vista stale.
  4. Admin cambia el tecnico activo a Angelo.
  5. Jack intenta `POST /api/frp/jobs/:id/take` y recibe `403`.
  6. El job sigue `LISTO_PARA_TECNICO`.
  7. Angelo toma el job correctamente.
- `phase3a.contract.test.js` verifica que `takeSpecificFrpJob` refresque sesion en error.

## No objetivo

Este corte no cambia el mecanismo de switch, no cambia `take-next` y no agrega bloqueo optimista en frontend. El backend sigue siendo la autoridad final.
