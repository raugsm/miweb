# Sesion 22 - Finalizar job tomado tras cambio de tecnico activo

Fecha: 2026-05-06
Estado: aplicado como contrato de auditoria

## Problema revisado

`Tomar` y `Finalizar` no tienen el mismo contrato.

- `Tomar` depende del tecnico activo global porque decide quien puede capturar el siguiente trabajo.
- `Finalizar` depende del dueno congelado del job porque el trabajo ya fue asignado.

Riesgo: si el tecnico activo cambia despues de que Jack toma un job, una implementacion debil podria esconder el boton o rechazar el cierre de Jack solo porque Angelo paso a ser el activo global.

## Regla confirmada

Un job `EN_PROCESO` puede finalizarlo su dueno (`job.technicianId`) aunque `active_technician_state` apunte a otro operador.

El tecnico activo global no hereda permiso sobre trabajos ya tomados por otro operador.

## Evidencia de codigo

- Backend: `PATCH /api/frp/jobs/:id/finalize` no llama `requireActiveFrpTechnician`.
- Backend: la regla efectiva es `job.technicianId !== user.id && user.role !== "ADMIN" => 403`.
- PostgreSQL: `finalizeFrpJobPostgres` usa `applyFrpJobFinalizeLegacyState`, que conserva la misma regla de dueno.
- UI: `myActiveJob` se calcula con `job.technicianId === session.user?.id`.
- UI: `frpOpsV2RenderCurrentActive` solo deshabilita acciones por `swapInProgress`, no por `isMeActive`.

## Pruebas agregadas

- `phase5: FRP owner can finalize after active technician changes`
  - Jack es tecnico activo.
  - Jack toma un job especifico.
  - Admin cambia tecnico activo a Angelo.
  - Jack finaliza el job ya tomado.
  - El job queda `FINALIZADO` y conserva `technicianId === Jack`.

- `operator current job finalize follows job ownership, not global active technician`
  - Guarda estatica para impedir que la UI vuelva a depender del tecnico activo global para renderizar/finalizar el trabajo actual del usuario.

## Decision

No se modifico runtime porque el contrato actual ya estaba correcto.

El cambio correcto era convertir esa regla en prueba y documentacion, para que futuras reformas del panel trabajador no mezclen permiso de captura (`active technician`) con permiso de cierre (`job owner`).
