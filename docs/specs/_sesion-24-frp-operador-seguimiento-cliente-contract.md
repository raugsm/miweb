# Sesion 24 - Contrato FRP operador + seguimiento cliente

## Objetivo

Cerrar el contrato entre la tabla del operador FRP y la tabla de seguimiento del cliente antes de implementar el nuevo flujo post-pago.

La regla base queda asi:

- La tabla del operador no es una fuente independiente.
- La tabla de seguimiento del cliente no es una copia manual.
- Ambas son proyecciones del mismo pedido FRP, sus equipos y sus estados.

Esto evita dejar conexiones en el aire cuando el operador ve una orden, el cliente ve otra cosa, o un equipo de un pedido multiple queda sin avance claro.

## Fuentes externas usadas como criterio

- Stripe recomienda disparar fulfillment desde eventos confiables de pago y registrarlo de forma idempotente, no depender solo del navegador del cliente despues de pagar: https://docs.stripe.com/checkout/fulfillment
- Shopify Flow usa el cambio de estado de pago a `paid` como disparador operativo para acciones sobre una orden: https://help.shopify.com/en/manual/shopify-flow/reference/triggers/order-paid
- GOV.UK Task List separa estados visibles de acciones, y advierte contra usar demasiados pasos si el servicio puede simplificarse: https://design-system.service.gov.uk/components/task-list/

Conclusion aplicada: despues de subir comprobante, el pedido debe existir y avanzar por estados del sistema. El boton del cliente "Equipo conectado" no debe ser el umbral que desbloquea la operacion.

## Hechos confirmados en el repo

1. `docs/specs/cliente/mis-ordenes.md` ya dice que la orden nace al subir comprobante en panel 3, pero conserva referencias viejas a `Equipo conectado`.
2. `public/portal-modules/order-state.js` todavia comunica estados basados en `PAGO_EN_REVISION`, `EN_PREPARACION`, `LISTO_PARA_CONEXION`, `EN_PROCESO` y `FINALIZADO`.
3. `public/portal-modules/panel-4-connection.js` y pruebas de `test/phase4.smoke.test.js` todavia cubren el contrato viejo de `notify-connected`.
4. `public/app.js` todavia contiene secciones del operador basadas en `Trabajo actual`, `Tomar`, `Pagos por revisar`, cola y espera de conexion.
5. `docs/specs/_sesion-23-payment-proof-ai-verification-shadow.md` define la IA de comprobantes como `shadow mode`: observa y clasifica, pero no aprueba pagos de produccion de forma autonoma todavia.

## Decision de producto

El nuevo flujo del operador se rige por una sola tabla de ordenes FRP. No se crea una caja separada de "pagos por aprobar" y no se duplica el pedido en "trabajo actual".

Estados visuales de la tabla:

| Color | Etiqueta operador | Que significa | Accion principal |
| --- | --- | --- | --- |
| Verde | Pago aprobado | El comprobante esta aprobado y el pedido puede procesarse | `Finalizado` o `Finalizado equipo N` |
| Azul | IA revisando | El comprobante aun no esta aprobado o requiere revision | `Revisar` |
| Amarillo | No conecto | El pago esta aprobado, paso el plazo operativo y no hay avance visual/operativo | `Avisar cliente` o `Avisar ajuste` |

Reglas:

- Si una orden esta verde, no se muestra `Revisar`.
- Si una orden esta azul, no se muestra `Finalizado`.
- Si una orden esta amarilla, se muestra accion de contacto/ajuste, no una accion que simule conexion automatica.
- No se muestran monto, metodo o vigencia en la card verde. Esa informacion vive dentro de `Revisar` cuando aun hace falta revisar el comprobante o explicar un ajuste.
- El codigo corto visible sera del tipo `ARD-0001`; el codigo real queda disponible como referencia secundaria para auditoria.

## Contrato operador-cliente

| Estado fuente | Operador ve | Cliente ve en seguimiento | Acciones operador | Efecto requerido |
| --- | --- | --- | --- | --- |
| Comprobante recibido, IA/manual aun no aprueba | Card azul `IA revisando` | Pedido en revision de pago | `Revisar` | No genera trabajo finalizable. SSE actualiza operador y cliente. |
| Pago aprobado por humano o futura IA con permiso productivo | Card verde `Pago aprobado` | Pedido listo para servicio / pago aprobado | `Finalizado` o `Finalizado equipo N` | El operador puede cerrar el servicio sin esperar boton `Equipo conectado`. |
| Pago aprobado + pasan 5 minutos sin avance operativo | Card amarilla `No conecto` | Pedido requiere atencion del cliente | `Avisar cliente` si precio sigue vigente; `Avisar ajuste` si precio cambio | No se bloquea invisible. El cliente tambien ve que debe actuar. |
| Equipo finalizado | Sale de ordenes activas; entra en `Finalizados hoy` | Equipo finalizado, recibo disponible si aplica | Ninguna accion sobre ese equipo | Cliente y operador reciben SSE. |
| Pedido multiple con N equipos | Una sola card con contador y filas compactas por equipo | Una orden con N equipos y estado por equipo | Solo el siguiente equipo accionable tiene boton | No se crean N cards separadas ni N pedidos falsos. |

## Multi-equipo

Un pedido de 7 equipos no debe crear 7 cards principales.

Modelo visual recomendado:

- Card principal: `ARD-0007`, cliente, cantidad total, estado general.
- Fila compacta por equipo: `ARD-0007-01`, `ARD-0007-02`, ... `ARD-0007-07`.
- Solo un equipo queda accionable a la vez si el proceso debe ser secuencial.
- Los equipos completados quedan marcados como finalizados dentro de la misma card.
- Los equipos pendientes quedan visibles, pero sin boton si aun no corresponde procesarlos.

Esto protege el flujo de trabajo: una orden grande no tapa la cola completa, y el cliente no ve pedidos duplicados.

## Puente de datos obligatorio

Cada cambio operativo debe tocar ambos lados del contrato en una misma operacion persistente:

- `customerOrders`: estado publico del pedido.
- `customerOrderItems`: estado publico por equipo.
- `frpOrders`: estado operativo FRP.
- `frpJobs`: estado operativo por equipo.
- auditoria: evento con actor, accion, orden, equipo y razon.
- SSE operador: refresca tabla FRP.
- SSE cliente: refresca `Mis ordenes`.

No debe existir una accion que actualice solo operador o solo cliente.

## Estado de la IA

La maqueta puede mostrar `IA revisando` desde ahora.

Pero `Pago aprobado por IA` solo puede ser productivo cuando exista una fase posterior que cambie explicitamente el contrato actual de shadow mode. Hasta entonces:

- la IA puede clasificar y recomendar;
- los casos seguros pueden quedar listos para aprobacion humana rapida;
- la aprobacion autonoma real queda bloqueada por feature flag o fase separada.

Riesgo si se ignora esto: la UI prometera una automatizacion que el backend todavia no garantiza.

## Impacto por archivo

Implementacion futura probable:

| Archivo | Motivo |
| --- | --- |
| `server.js` | Cambiar transiciones de pedido/equipo y publicar SSE a ambos lados |
| `public/app.js` | Reemplazar render viejo de operador FRP por tabla unica de estados |
| `public/portal-modules/orders.js` | Mostrar seguimiento cliente segun el nuevo contrato |
| `public/portal-modules/order-state.js` | Actualizar labels publicos y estados visibles |
| `public/portal-modules/panel-4-connection.js` | Convertir paso 4 en instrucciones, sin boton obligatorio |
| `public/portal-modules/flow-state.js` | Quitar dependencia de `customerConnectedAt` como bloqueo principal |
| `docs/specs/cliente/mis-ordenes.md` | Reescribir referencias obsoletas a `Equipo conectado` |
| `docs/specs/operador/operador-frp-express.md` | Reescribir contrato viejo de `Tomar`, cola y pagos separados |
| `test/phase4.smoke.test.js` | Cambiar pruebas que esperan `notify-connected` como umbral operativo |

## Auditoria de impacto

### Tocar un solo archivo

Ventaja: cambio rapido.

Riesgo: alto. Si solo se toca el panel operador, el cliente seguira viendo estados viejos y la orden puede parecer viva en un lado y muerta en otro.

### Tocar el grupo completo

Ventaja: contrato consistente entre cliente, operador, backend y pruebas.

Riesgo: mayor superficie de cambio. Requiere implementacion por fases y pruebas locales antes de push/deploy.

### No tocar nada

Riesgo: el problema original se repite. El cliente sube comprobante, no presiona `Equipo conectado`, y el operador conserva pedidos en espera sin salida clara.

### Cambio minimo recomendado

Primero documentar y aprobar este contrato. Segundo, ajustar specs cliente/operador. Tercero, implementar backend y frontend en una rama con pruebas.

No recomiendo tocar solo la maqueta o solo el render del operador.

## Siguiente paso unico

Revisar y aprobar este contrato. Despues de aprobarlo, el siguiente paso debe ser reescribir las dos specs que hoy contradicen el flujo:

1. `docs/specs/cliente/mis-ordenes.md`
2. `docs/specs/operador/operador-frp-express.md`

Solo despues conviene entrar a codigo productivo.
