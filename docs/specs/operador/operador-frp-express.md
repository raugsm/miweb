# Operador - Panel FRP Express

**Version:** 2.0
**Fecha:** 7 de mayo 2026
**Estado:** spec actualizada por contrato post-pago de sesion 24.
**Reemplaza:** v1.2 basada en `Trabajo actual`, `Tomar`, cola `LISTO_PARA_TECNICO` y caja separada de pagos.

Esta spec queda conectada al contrato puente:

- `docs/specs/_sesion-24-frp-operador-seguimiento-cliente-contract.md`
- `docs/specs/cliente/mis-ordenes.md`

## Contexto

El panel FRP Express es la vista operativa donde el tecnico procesa pedidos FRP nacidos desde el portal cliente.

Decision nueva:

- La orden nace cuando el cliente sube el comprobante en panel 3.
- El operador no depende de que el cliente presione `Equipo conectado`.
- El panel deja de separar el trabajo en cajas redundantes de `Trabajo actual`, `Pagos por revisar` y `Esperando conexion`.
- La vista principal pasa a ser una sola tabla/card-list de ordenes FRP con estados visuales claros.

## Principio de operacion

Orden creada, orden visible.
Pago aprobado, orden finalizable.
Problema detectado, orden visible con accion clara.
Orden finalizada, seguimiento cliente actualizado.

La tabla operador no puede tener estados que no existan en el seguimiento cliente.

## Mockup vigente

Mockup de revision:

```text
docs/specs/operador/mockups/operador-frp-flujo-simple-post-pago.html
```

El mockup muestra el concepto visual, pero esta spec define el contrato funcional.

## Estructura visual

De arriba hacia abajo:

1. Header global de sesion y tecnico activo.
2. Titulo de seccion `FRP Express`.
3. Tabla/card-list principal `Ordenes FRP`.
4. Resumen operativo lateral.
5. `Finalizados hoy`.
6. Acordeon `Costos FRP`.

No debe existir una card principal separada llamada `Trabajo actual`.

## Estados visuales de orden

| Color | Estado operador | Cuando aparece | Accion principal |
| --- | --- | --- | --- |
| Verde | `Pago aprobado` | Pago aprobado por humano o futura IA autorizada | `Finalizado` / `Finalizado equipo N` |
| Azul | `IA revisando` | Comprobante recibido, pago no aprobado | `Revisar` |
| Amarillo | `No conecto` | Pago aprobado + 5 minutos sin avance operativo | `Finalizado` si el operador completa el servicio, o `Avisar cliente` / `Avisar ajuste` |
| Gris/neutral | `Finalizado` | Equipo o pedido cerrado | Sin accion en la lista activa |

Reglas:

- Verde no muestra `Revisar`.
- Azul no muestra `Finalizado`.
- Amarillo no simula conexion automatica, pero no bloquea el cierre si el operador completa el servicio.
- No se muestran monto, metodo ni vigencia en cards verdes.
- `Revisar` abre comprobante, monto esperado y evidencia necesaria.

## Codigo corto

El operador ve codigo corto para ejecutar rapido:

- Pedido: `ARD-0001`
- Equipo: `ARD-0001-01`

El codigo real queda como secundaria:

- `ARD-20260506-007`

El mismo codigo corto debe aparecer en `Mis ordenes` del cliente.

## Card de pedido

### Pedido de 1 equipo

Muestra:

- codigo corto y codigo real;
- cliente;
- cantidad `1 equipo`;
- estado visual;
- equipo interno `ARD-0001-01`;
- accion permitida segun estado.

Acciones:

- Verde: `Finalizado`.
- Azul: `Revisar`.
- Amarillo: `Avisar cliente` o `Avisar ajuste`.

### Pedido multi-equipo

Un pedido de N equipos se muestra como una sola card con filas internas.

Ejemplo:

- `ARD-0007`
- `7 equipos`
- filas:
  - `ARD-0007-01`
  - `ARD-0007-02`
  - `ARD-0007-03`
  - `ARD-0007-04`
  - `ARD-0007-05`
  - `ARD-0007-06`
  - `ARD-0007-07`

Reglas:

- No crear N cards principales.
- Solo el siguiente equipo accionable muestra boton.
- Los equipos finalizados quedan marcados dentro de la misma card.
- Los equipos pendientes quedan visibles sin accion si aun no corresponde.
- Si el proceso real exige secuencia, no se permite finalizar equipo 5 antes de equipo 1.

## Botones

| Boton | Visible cuando | Funcion |
| --- | --- | --- |
| `Finalizado` | Orden verde de 1 equipo | Cierra el equipo/pedido |
| `Finalizado equipo N` | Orden verde multi-equipo con equipo accionable | Cierra solo ese equipo |
| `Revisar` | Orden azul o caso que requiere evidencia | Abre comprobante y monto esperado |
| `Avisar cliente` | Orden amarilla con precio vigente | Dispara aviso/contacto operativo |
| `Avisar ajuste` | Orden amarilla con precio cambiado | Dispara aviso por cambio de precio |
| `Ver orden` | Solo si hace falta detalle secundario | Abre detalle no destructivo |

Nota de Corte 6: la orden amarilla conserva el boton `Finalizado` porque la web no puede confirmar por si sola si USB Redirector muestra el equipo conectado. Si el operador procesa el servicio, debe poder cerrar la orden sin moverla a otra caja ni revivir el flujo viejo de `Tomar`.

Botones removidos del contrato principal:

- `Tomar`.
- `Tomar siguiente`.
- `Equipo conectado`.
- `Equipo listo`.

## Resumen operativo

El resumen lateral solo cuenta estados. No duplica cards ni acciones.

Contadores:

- `Aprobadas`
- `IA revisando`
- `No conecto`
- `Finalizados hoy`

No debe existir una caja separada de `Pagos por aprobar`.

## Finalizados hoy

Muestra finalizados del dia de todos los tecnicos FRP elegibles.

Cada fila:

- codigo corto;
- cliente;
- hora;
- marca compacta del tecnico.

No hardcodear Jack/Angelo. Debe soportar mas operadores.

## Costos FRP

Sigue como acordeon colapsado al final del panel.

La tabla de costos no debe interferir con la tabla operativa. Si se abre, no debe romper el flujo principal.

## Permisos

### Pago/revision

- `ADMIN` y `COORDINADOR` pueden aprobar/rechazar pagos manualmente.
- `ATENCION_TECNICA` puede ver lo necesario para operar, pero no debe aprobar pagos si el contrato de permisos no lo autoriza.
- La IA en shadow mode no aprueba de forma productiva sin feature flag/fase posterior.

### Finalizacion

En el nuevo flujo simple, la accion `Finalizado` cierra el equipo accionable de la orden aprobada.

Debe validarse:

- usuario autenticado;
- rol permitido;
- orden/equipo en estado finalizable;
- pago aprobado;
- equipo no finalizado previamente;
- transaccion actualiza operador y cliente.

## Temporizador de 5 minutos

Inicio:

- `paymentApprovedAt`.

Si no hay avance operativo despues de 5 minutos:

- estado operador: amarillo `No conecto`;
- estado cliente: requiere atencion;
- backend revalida precio automaticamente;
- si precio sigue igual: accion `Avisar cliente`;
- si precio cambio: accion `Avisar ajuste`.

No se agrega boton `Extender 5 minutos` por ahora. Aumenta complejidad sin resolver el problema principal.

## SSE

Endpoint operador:

```text
GET /api/operator/frp/events
```

Eventos relevantes:

| Reason | Trigger |
| --- | --- |
| `frp_order_created` | Cliente sube comprobante |
| `payment_review_needed` | Orden entra a revision |
| `payment_review_resolved` | Pago aprobado/rechazado |
| `frp_order_ready` | Orden queda verde/finalizable |
| `frp_order_no_connection` | Vence plazo de 5 minutos |
| `frp_price_revalidated` | Resultado de revalidacion automatica |
| `frp_job_done` | Equipo finalizado |
| `frp_order_done` | Pedido completo finalizado |
| `connected` | Snapshot inicial |

Cada evento que cambie operador debe publicar tambien el evento cliente equivalente en `/api/portal/orders/events`.

## Datos requeridos

### frpOrder

- `id`
- `code`
- `shortCode`
- `portalOrderId`
- `customerId`
- `quantity`
- `paymentStatus`
- `operatorStatus`
- `paymentApprovedAt`
- `noConnectionAlertAt`
- `priceRevalidationStatus`
- `createdAt`
- `updatedAt`

### frpJob

- `id`
- `orderId`
- `portalOrderItemId`
- `deviceIndex`
- `shortCode`
- `status`
- `technicianId`
- `startedAt`
- `doneAt`
- `reviewReason`

### customerOrder / customerOrderItem

Deben actualizarse junto con `frpOrder` / `frpJob`. Ver `docs/specs/cliente/mis-ordenes.md`.

## Transacciones obligatorias

Toda accion operativa debe:

1. validar permisos;
2. leer estado actual;
3. validar transicion;
4. actualizar `frpOrders` / `frpJobs`;
5. actualizar `customerOrders` / `customerOrderItems`;
6. escribir auditoria;
7. publicar SSE operador;
8. publicar SSE cliente;
9. devolver snapshot actualizado.

No se permite escribir solo el lado operador.

## Edge cases

### Sesion expirada o permisos revocados

La UI debe detener SSE/polling y bloquear botones. No debe dejar acciones vivas con sesion invalida.

### Pago rechazado

La orden sale del estado finalizable y el cliente ve motivo/accion para corregir.

### Precio cambia despues de aprobado

Si aun no se proceso y vence el plazo, la revalidacion define si se mantiene o si requiere ajuste.

### Pedido de muchos equipos

Debe seguir siendo una sola card. El boton solo aparece en el equipo accionable.

### SSE caido

Banner de reconexion. Acciones criticas deben revalidar estado en backend antes de ejecutar.

### Mas operadores

No asumir nombres fijos. El estado de finalizados y permisos debe derivarse de usuarios/roles, no de Jack/Angelo hardcodeados.

## Acceptance criteria

1. El panel muestra una tabla unica de ordenes FRP.
2. No existe caja separada `Trabajo actual`.
3. No existe caja separada `Pagos por aprobar`.
4. Una orden azul muestra `Revisar` y no `Finalizado`.
5. Una orden verde muestra `Finalizado` y no `Revisar`.
6. Una orden amarilla muestra accion de aviso/ajuste.
7. Una orden de 7 equipos se muestra como una card con 7 filas.
8. Finalizar un equipo actualiza tambien `Mis ordenes`.
9. Los codigos cortos coinciden entre operador y cliente.
10. Las acciones revalidan permisos y estado en backend.
11. El panel soporta mas operadores sin hardcodear nombres.
12. La IA no aprueba productivo mientras el contrato siga en shadow mode.

## Archivos relacionados

- `docs/specs/_sesion-24-frp-operador-seguimiento-cliente-contract.md`
- `docs/specs/cliente/mis-ordenes.md`
- `docs/specs/operador/mockups/operador-frp-flujo-simple-post-pago.html`
- `public/app.js`
- `public/portal-modules/orders.js`
- `public/portal-modules/order-state.js`
- `public/portal-modules/panel-4-connection.js`
- `public/portal-modules/flow-state.js`
- `server.js`
- `test/phase4.smoke.test.js`

## Changelog

- **v2.0 (2026-05-07):** reescritura por contrato sesion 24. Se elimina dependencia operativa de `Equipo conectado`, `Tomar`, `Trabajo actual` y caja separada de pagos.
- **v1.2 (2026-05-03):** version historica basada en `LISTO_PARA_TECNICO`, `Tomar`, `Trabajo actual`, `Pagos por revisar` y cola. Queda reemplazada por v2.0.
