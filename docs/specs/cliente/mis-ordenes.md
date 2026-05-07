# Mis ordenes

**Version:** 2.0
**Fecha:** 7 de mayo 2026
**Estado:** spec actualizada por contrato post-pago de sesion 24.
**Reemplaza:** v1.0 basada en `Equipo conectado` / `Equipo listo` como umbral operativo.

Esta spec queda conectada al contrato puente:

- `docs/specs/_sesion-24-frp-operador-seguimiento-cliente-contract.md`
- `docs/specs/operador/operador-frp-express.md`

## Contexto

`Mis ordenes` es la tabla de seguimiento del cliente. Debe reflejar el mismo pedido FRP que ve el operador, no una copia separada ni una interpretacion visual distinta.

La orden nace cuando el cliente sube el comprobante en el panel 3. Desde ese momento existe seguimiento cliente, aunque el pago todavia este en revision.

Decision nueva:

- El boton obligatorio `Equipo conectado` deja de ser el umbral que habilita al operador.
- El paso 4 pasa a ser instruccion de preparacion/conexion, no una accion obligatoria para crear cola.
- El operador puede finalizar una orden/equipo con pago aprobado sin esperar un click adicional del cliente.

## Principio de sincronizacion

Cada cambio visible en `Mis ordenes` debe venir del mismo estado persistido que alimenta el panel operador:

- `customerOrders`: estado publico del pedido.
- `customerOrderItems`: estado publico por equipo.
- `frpOrders`: estado operativo FRP.
- `frpJobs`: estado operativo por equipo.
- SSE cliente: `/api/portal/orders/events`.
- SSE operador: `/api/operator/frp/events`.

No debe existir una transicion que solo actualice cliente o solo operador.

## Estados visibles para el cliente

| Estado cliente | Estado operador relacionado | Cuando aparece | Texto recomendado |
| --- | --- | --- | --- |
| Pago en revision | Azul `IA revisando` | Comprobante subido, pago aun no aprobado | `Estamos revisando tu comprobante.` |
| Pago aprobado | Verde `Pago aprobado` | Pago aprobado por humano o futura IA autorizada | `Pago aprobado. Prepara el equipo para el servicio.` |
| Requiere conexion/contacto | Amarillo `No conecto` | Pago aprobado, pasaron 5 minutos sin avance operativo | `Necesitamos que conectes el equipo o respondas al aviso.` |
| En proceso | Trabajo operativo en curso | El operador esta procesando el equipo | `Servicio en proceso. No desconectes el equipo.` |
| Finalizado | Finalizados hoy / historial | El equipo o pedido fue cerrado | `Servicio finalizado.` |
| Pago rechazado | Revision rechazada | Comprobante no coincide o no se pudo validar | `Comprobante rechazado. Revisa el motivo y vuelve a subirlo.` |

## Regla para pago aprobado

Cuando el pago queda aprobado:

- la orden sigue visible en `Mis ordenes`;
- el cliente ya no necesita presionar un boton para que el operador pueda trabajar;
- el panel 4 debe explicar como preparar/conectar el equipo;
- el operador ve la orden verde y puede cerrarla cuando complete el servicio.

## Regla para no conexion en 5 minutos

El temporizador operativo empieza cuando el pago queda aprobado.

Si pasan 5 minutos sin avance operativo:

- operador ve amarillo `No conecto`;
- cliente ve estado de atencion;
- si el precio sigue vigente, operador puede usar `Avisar cliente`;
- si el precio cambio, operador puede usar `Avisar ajuste`;
- no se debe esconder el pedido ni dejarlo como "esperando" indefinido.

La revalidacion de precio es automatica. El operador solo ve el resultado accionable.

## Multi-equipo

Un pedido con N equipos es una sola orden con N items.

Ejemplo para 7 equipos:

- Card principal: `ARD-0007`, cliente, cantidad `7 equipos`, estado general.
- Filas internas:
  - `ARD-0007-01`
  - `ARD-0007-02`
  - `ARD-0007-03`
  - `ARD-0007-04`
  - `ARD-0007-05`
  - `ARD-0007-06`
  - `ARD-0007-07`

Reglas:

- No crear 7 cards principales.
- No crear 7 pedidos falsos.
- Cada equipo tiene estado propio.
- Solo el equipo accionable por el operador debe avanzar.
- El cliente ve el progreso por equipo, pero no debe tener botones obligatorios para que el operador pueda continuar.

## Codigo corto y codigo real

La vista cliente puede mostrar codigo corto para orientacion rapida:

- Pedido: `ARD-0001`
- Equipo: `ARD-0001-01`

El codigo real queda como referencia secundaria/auditoria:

- `ARD-20260506-007`

La misma regla aplica al operador para evitar equivocaciones entre pantallas.

## Componentes de la card

### Header

- Codigo corto de pedido.
- Codigo real como texto secundario.
- Cantidad de equipos.
- Estado general.
- Fecha/hora relativa.

### Lista de equipos

Cada fila representa un equipo:

| Estado item | Visual | Accion cliente |
| --- | --- | --- |
| En revision de pago | Azul suave | Ninguna |
| Pago aprobado / listo | Verde suave | Ninguna obligatoria |
| Requiere contacto | Amarillo suave | Responder aviso / soporte |
| En proceso | Azul operativo | No desconectar |
| Finalizado | Verde cerrado | Ver recibo si aplica |

### Recibo

El recibo se habilita cuando el pedido completo queda finalizado o cuando el contrato de recibo parcial por equipo sea aprobado.

Hasta entonces:

- pedido de 1 equipo: recibo al finalizar el equipo;
- pedido de varios equipos: recibo al finalizar todos los equipos, salvo futura decision de recibo parcial.

## Botones permitidos en `Mis ordenes`

Permitidos:

- `Ver recibo` cuando corresponda.
- `Ver detalle` si se necesita historial o evidencia.
- Accion de soporte/contacto si la orden entra en atencion.

No permitidos como umbral operativo:

- `Equipo conectado`.
- `Equipo listo`.
- cualquier boton que haga depender la cola del operador de un click posterior al pago aprobado.

## Eventos SSE

Evento cliente obligatorio:

```text
GET /api/portal/orders/events
```

Debe refrescar `Mis ordenes` cuando ocurra:

- orden creada al subir comprobante;
- pago entra en revision;
- pago aprobado;
- pago rechazado;
- alerta `No conecto`;
- cambio de precio/ajuste;
- equipo entra en proceso;
- equipo finaliza;
- pedido finaliza;
- recibo disponible.

## Datos requeridos

### Pedido

- `id`
- `code` real
- `shortCode`
- `customerId`
- `quantity`
- `paymentStatus`
- `publicStatus`
- `operatorStatus`
- `createdAt`
- `paymentApprovedAt`
- `noConnectionAlertAt`
- `priceRevalidationStatus`
- `frpOrderId`

### Equipo

- `id`
- `orderId`
- `deviceIndex`
- `shortCode`
- `frpJobId`
- `status`
- `startedAt`
- `doneAt`
- `technicianId`
- `receiptId`

## Validaciones

- Una orden creada en panel 3 debe aparecer en `Mis ordenes` aunque el pago este en revision.
- Una orden con pago aprobado debe aparecer en operador y cliente desde el mismo estado fuente.
- Un cambio a finalizado debe actualizar `customerOrderItems` y `frpJobs` en la misma operacion.
- Un pedido multi-equipo no debe duplicarse como multiples pedidos.
- La UI cliente no debe prometer aprobacion por IA si el backend sigue en shadow mode.

## Acceptance criteria

1. Al subir comprobante, la orden aparece en `Mis ordenes` como `Pago en revision`.
2. Si el pago se aprueba, la orden pasa a `Pago aprobado` sin requerir `Equipo conectado`.
3. Si pasan 5 minutos sin avance, cliente y operador ven estado de atencion compatible.
4. Si el precio cambio, el cliente no ve una orden silenciosamente bloqueada.
5. Si el operador finaliza un equipo, el item cambia a `Finalizado` en cliente.
6. En pedidos de 7 equipos se mantiene una sola card con 7 filas.
7. El codigo corto aparece igual en cliente y operador.
8. El codigo real queda disponible como referencia secundaria.
9. No queda ningun boton obligatorio `Equipo conectado` o `Equipo listo` en el seguimiento.
10. La seccion funciona con SSE caido usando el ultimo snapshot visible y aviso de reconexion.

## Changelog

- **v2.0 (2026-05-07):** reescritura por contrato sesion 24. El seguimiento cliente queda conectado a la tabla operador y se elimina la dependencia operativa de `Equipo conectado` / `Equipo listo`.
- **v1.0 (2026-05-03):** version historica basada en ordenes por equipo y botones de confirmacion del cliente. Queda reemplazada por v2.0.
