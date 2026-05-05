# Sesion 16 - Auditoria spec vs codigo

**Fecha:** 2026-05-04  
**Estado:** auditoria inicial, sin cambios de codigo  
**Alcance:** comparar la spec cerrada contra el codigo actual y la pantalla visible antes de implementar.

---

## Regla de esta auditoria

No se corrige nada hasta separar:

1. Que dice la spec cerrada.
2. Que hace el codigo actual.
3. Que se ve en la web local.
4. Que riesgo hay si se cambia sin ordenar.
5. Cual es el primer cambio correcto.

---

## Bloque auditado: Mis ordenes

### Hechos de la spec

Fuente principal: `docs/specs/cliente/mis-ordenes.md`.

- La card debe mostrar una **lista de equipos individuales**, una fila por equipo.
- Los estados visibles por equipo son:
  - Pendiente.
  - Esperando tecnico.
  - En proceso.
  - Finalizado.
- Equipo 1 entra en "Esperando tecnico" cuando el cliente aprieta "Equipo conectado" en Panel 4.
- Equipos 2..N nacen como "Pendiente" y el cliente debe apretar "Equipo listo" por cada uno.
- Cada equipo Pendiente debe mostrar:
  - "Cancelar este equipo".
  - "Equipo listo".
- La spec elimina:
  - barra de procesados general;
  - Registro de actividad expandible;
  - boton Ayuda;
  - boton Comprobante (PDF) como nombre principal.
- El boton correcto es "Recibo de operacion", deshabilitado hasta que todos los equipos finalicen.
- El menu de 3 puntos debe incluir "Abortar pedido" mientras la orden siga activa.
- El estado vacio debe decir:
  - "Aun no tenes ordenes."
  - "Tu primera orden aparecera aca."

### Hechos del codigo actual

Archivos revisados:

- `public/portal.html`
- `public/portal-modules/orders.js`
- `public/portal-styles/10-orders-tracking-proofs.css`

El codigo actual todavia usa una card vieja:

- `portal.html` mantiene boton `Actualizar` en la seccion de Mis ordenes.
- `portal.html` mantiene template con:
  - `.status-pill`
  - `.order-progress`
  - `.order-card-actions`
  - "Comprobante (PDF)"
  - "Ayuda"
  - "Registro de actividad"
- `orders.js` filtra ordenes por estado global de orden, no por estados individuales de cada equipo.
- `orders.js` renderiza una barra de progreso con "X de Y procesados".
- `orders.js` renderiza activity log.
- `orders.js` no renderiza filas por equipo.
- `orders.js` no tiene acciones "Equipo listo" ni "Cancelar este equipo".

### Hecho visible en navegador local

URL revisada: `http://127.0.0.1:4183/cliente`

Texto visible en la seccion Mis ordenes:

```text
SEGUIMIENTO
Mis ordenes
En vivo
Actualizar
CL-20260504-001
3 equipos · S/ 281.25
Listo para conexion
Precio asegurado: 25.00 USDT por equipo · vence 05:23 p. m.
1 de 3 procesados · 2 pendientes
33%
Comprobante (PDF)
Ayuda
Registro de actividad
```

Esto confirma que la brecha no es solo codigo muerto: la UI visible sigue usando el modelo viejo.

---

## Diagnostico

### Hechos

La spec de Mis ordenes ya esta suficientemente cerrada para implementar la card principal.

El codigo actual no cumple el contrato visual ni operativo de esa spec.

La pantalla visible muestra elementos que la spec ya descarto:

- `Actualizar`.
- barra de progreso general.
- `Comprobante (PDF)`.
- `Ayuda`.
- `Registro de actividad`.
- estado global "Listo para conexion" en vez de filas por equipo.

### Inferencias

La razon mas probable del bug actual de multi-equipo no es solo backend. El cliente no tiene UI para avisar que los equipos 2..N ya fueron conectados.

Aunque el operador pudo finalizar el equipo 1, los equipos 2 y 3 quedan en espera porque del lado cliente no existe todavia el mecanismo especificado: "Equipo listo" por equipo pendiente.

### Opinion tecnica

No conviene hacer un parche visual para esconder botones viejos. Eso repetiria el error anterior: maquillar la pantalla sin conectar el flujo real.

El primer arreglo correcto es rehacer `Mis ordenes` como card por equipos individuales, pero en una version minima controlada:

1. Mostrar filas por equipo.
2. Mapear estados reales del backend a los 4 estados de la spec.
3. Agregar "Equipo listo" para equipos pendientes.
4. Dejar "Cancelar este equipo" visible solo si existe endpoint real o dejarlo fuera como pendiente documentado.
5. Reemplazar "Comprobante (PDF)" por "Recibo de operacion", disabled hasta finalizado.
6. Quitar Ayuda, Registro de actividad y barra de progreso general.

---

## Riesgos

### Riesgo 1 - Implementar solo vista sin backend

Si se dibujan botones "Equipo listo" sin endpoint, el cliente va a creer que aviso al tecnico pero no pasara nada real.

### Riesgo 2 - Tocar cancelaciones ahora

"Cancelar este equipo" cruza con politica de reembolso. La spec dice que esa politica sigue pausada. Meterlo ahora completo puede abrir una deuda mayor.

### Riesgo 3 - Cambiar operador y cliente a la vez sin corte claro

Mis ordenes exige que el operador trabaje por equipo, no por pedido completo. Parte de eso ya existe en jobs, pero hay que validar que la UI de operador y la data publica hablen el mismo idioma antes de tocar mucho.

---

## Decision recomendada

Implementar primero **Mis ordenes v1 minimo funcional**, no todo el historial ni reembolsos.

Incluye:

- card nueva por orden;
- lista de equipos individuales;
- estados visuales: Pendiente, Esperando tecnico, En proceso, Finalizado;
- boton "Equipo listo" para equipos 2..N pendientes;
- recibo final deshabilitado/habilitado;
- limpiar elementos viejos descartados.

No incluye todavia:

- cancelar equipo;
- abortar pedido;
- historial completo;
- politica de reembolso;
- busqueda/paginacion de ordenes anteriores.

---

## Siguiente paso unico

Antes de editar codigo: revisar que datos llegan al frontend para cada `order.items[]` y confirmar si ya existe endpoint para marcar un job/equipo pendiente como conectado por el cliente.

Si existe, se implementa Mis ordenes v1 minimo.

Si no existe, primero se agrega endpoint pequeno y testeado para "Equipo listo".

---

## Revision backend para Equipo listo

### Hechos

El serializer publico del portal ya envia `order.items[]` al cliente con:

- `id`
- `sequence`
- `model`
- `imei`
- `status`
- `ardCode`
- `eligibilityStatus`
- `reviewReason`

Eso alcanza para dibujar las filas visuales de Mis ordenes.

El endpoint existente de cliente es:

```text
POST /api/portal/orders/:id/notify-connected
```

Ese endpoint:

- marca la orden como conectada;
- congela Technician ID;
- busca el siguiente job de la orden en `ESPERANDO_PREPARACION` o `ESPERANDO_CLIENTE`;
- lo pasa a `LISTO_PARA_TECNICO` si el checklist queda apto.

Endpoint de operador existente:

```text
PATCH /api/frp/jobs/:id/ready
```

Ese endpoint no sirve directo para el cliente porque requiere usuario operador/FRP, no sesion cliente.

### Inferencia

Hoy se podria reutilizar `notify-connected` para avanzar "el siguiente equipo", pero seria una accion por orden, no por fila. Eso choca con la spec, que pide botones por equipo pendiente.

Si el cliente ve botones en equipo 2 y equipo 3, pero el backend siempre avanza "el siguiente", puede haber confusion: el cliente podria tocar equipo 3 y el sistema moveria equipo 2.

### Decision recomendada

Para cumplir la spec sin ambiguedad, el siguiente cambio debe agregar un endpoint de cliente especifico por item:

```text
POST /api/portal/orders/:orderId/items/:itemId/ready
```

Reglas minimas:

- valida que la orden pertenezca al cliente logueado;
- valida que el item pertenezca a esa orden;
- valida que el job ligado este en `ESPERANDO_PREPARACION` o `ESPERANDO_CLIENTE`;
- marca checklist `clientConnected`, `requiredStateConfirmed`, `modelSupported` igual que `notify-connected`;
- mueve ese job a `LISTO_PARA_TECNICO` o `REQUIERE_REVISION`;
- publica SSE para cliente y operador;
- no toca reembolsos ni cancelaciones.

Con eso, `Mis ordenes v1 minimo funcional` puede implementar el boton `Equipo listo` sin mentirle al cliente.

## Resultado implementado S16-FIX-006

La decision anterior ya quedo aplicada en codigo:

- backend: `POST /api/portal/orders/:orderId/items/:itemId/ready`;
- cliente: `Mis ordenes` renderiza filas por equipo;
- cliente: cada equipo pendiente tiene su propio boton `Equipo listo`;
- cliente: el recibo queda bloqueado hasta que todos los equipos esten en `FINALIZADO`;
- pruebas: `npm.cmd test` pasa completo.

Validacion visible en local:

- `CL-20260504-001`;
- equipo 1 `Finalizado`;
- equipo 2 `Esperando tecnico`;
- equipo 3 `Pendiente` con boton `Equipo listo`.
