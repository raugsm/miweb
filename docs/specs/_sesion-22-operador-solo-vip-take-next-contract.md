# Sesion 22 - Operador Solo VIP y Tomar Siguiente

Fecha: 2026-05-06

## Hecho verificado

El filtro `Solo VIP` es client-side y usa `order.customerStatus === "VIP"` en los jobs ya cargados por `publicFrpState`.

## Riesgo encontrado

Antes de este corte, la lista podia mostrar solo VIPs, pero el boton grande `Tomar siguiente` seguia llamando `POST /api/frp/jobs/take-next`.

Ese endpoint toma el job mas antiguo global de la cola. Por tanto, con un no-VIP mas antiguo oculto y un VIP visible, el operador podia terminar tomando un trabajo que no estaba viendo.

## Contrato

- La cola visible se calcula una sola vez en `frpOpsV2QueueViewState`.
- La seccion `Cola` y el card `Tu trabajo actual` consumen ese mismo estado.
- Si `Solo VIP` esta apagado, `Tomar siguiente` conserva `POST /api/frp/jobs/take-next`.
- Si `Solo VIP` esta activo y existen VIPs visibles, el CTA cambia a `Tomar siguiente VIP` y toma el primer job VIP visible con `POST /api/frp/jobs/:id/take`.
- Si `Solo VIP` esta activo pero no hay VIPs y la UI cae a "mostrando todos", el CTA conserva `POST /api/frp/jobs/take-next`.
- No se crea endpoint nuevo.

## Guarda

`phase3a.contract.test.js` verifica que el CTA use `data-frp-take-next-job-id` para enrutar a `takeSpecificFrpJob` cuando el filtro VIP tiene jobs visibles.

## No objetivo

Este corte no cambia la prioridad backend global de `/take-next`, no introduce cola server-side por VIP y no modifica reglas comerciales VIP.
