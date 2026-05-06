# Sesion 22 - Review y cancel tras cambio de tecnico activo

Fecha: 2026-05-06
Estado: aplicado como contrato de auditoria

## Problema revisado

`Reportar problema` y `Cancelar job` son acciones sobre un trabajo ya tomado. Por eso pertenecen al mismo grupo de permiso que `Finalizar`, no al grupo de permiso de `Tomar`.

Riesgo: si el tecnico activo global cambia despues de que Jack toma un job, Angelo podria aparecer como nuevo operador activo y una implementacion debil podria permitirle operar el job de Jack o esconder las acciones del dueno real.

## Regla confirmada

- `Reportar problema` (`PATCH /api/frp/jobs/:id/review`) depende de `job.technicianId` o `ADMIN`.
- `Cancelar job` (`PATCH /api/frp/jobs/:id/cancel`) depende de `job.technicianId` o `ADMIN`.
- El tecnico activo global no hereda permiso sobre jobs ya tomados.
- El dueno congelado del job conserva permiso aunque `active_technician_state` cambie despues.

## Diferencia funcional

- `review` mueve el job a `REQUIERE_REVISION` y conserva `technicianId`.
- `cancel` con `timeout` o `manual` libera el job a `LISTO_PARA_TECNICO`, limpia `technicianId` y permite que otro tecnico lo tome despues.

## Evidencia de codigo

- Backend: `cancel` y `review` no llaman `requireActiveFrpTechnician`.
- Backend: ambas rutas rechazan `job.technicianId !== user.id` salvo rol `ADMIN`.
- PostgreSQL: `cancelFrpJobPostgres` y `reviewFrpJobPostgres` pasan por `applyFrpJobCancelLegacyState` / `applyFrpJobReviewLegacyState`, que conservan la misma regla.
- UI: `myActiveJob` se calcula por `job.technicianId === session.user?.id`.
- UI: `Reportar problema` y el banner `Cancelar job` se renderizan dentro del trabajo actual del dueno, no por tecnico activo global.

## Pruebas agregadas

- `phase 5: FRP owner can request review after active technician changes`
  - Jack toma un job.
  - Admin cambia tecnico activo global a Angelo.
  - Angelo recibe 403 si intenta mandar el job a revision.
  - Jack puede mandar el job a `REQUIERE_REVISION`.

- `phase 5: FRP owner can cancel after active technician changes`
  - Jack toma un job.
  - Admin cambia tecnico activo global a Angelo.
  - Angelo recibe 403 si intenta cancelar el job.
  - Jack puede cancelar con reason `timeout`.
  - El job vuelve a `LISTO_PARA_TECNICO` y queda sin `technicianId`.

## Decision

No se modifico runtime porque el contrato actual ya estaba correcto.

El cambio correcto fue convertir la regla en pruebas y documentacion para evitar que futuras reformas del panel mezclen permiso de trabajo tomado (`job owner`) con permiso de captura (`active technician`).
