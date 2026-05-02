# AriadGSM — Decisiones consolidadas del rediseño del portal

> ⚠️ **DOCUMENTO DEPRECATED**
> Este documento corresponde a la sesión V1 de diseño. Para la
> versión actual y completa de las decisiones, ver:
> [`docs/ariadgsm-decisiones-FINAL-2026-05-02.md`](./ariadgsm-decisiones-FINAL-2026-05-02.md)

Documento de referencia con todas las decisiones tomadas en la sesión de diseño. Cada sección refleja el modelo final al que llegamos. Si algo no encaja con tu visión real, este documento es el lugar para corregir antes de implementar.

---

## 1. Estado del repositorio

**Rama activa:** `feat-step4-redesign` (no mergeada a main)

**Commits hechos:**

| Commit | Hash corto | Descripción |
|---|---|---|
| 0a | `b1d064e` | Sistema responsive Tailwind + container queries + refactor flex |
| 0b | `a28b2db` | Rediseño paso 4 + panel técnico + cleanup visual |
| 0c | `973312e` | Actualización package.json y README |
| 1 | `296742d` | Flow state derivado + bloqueo opción A |
| 2 | `e06abb9` | Botón "Equipo conectado" + lane "Cliente conectado" en panel |

**Pendiente del usuario:** probar en local los commits 1 y 2 con la mini-checklist de pruebas.

**Branding:** logo y favicons generados en pack descargable. Aplicación al portal pospuesta hasta validar el flujo completo.

---

## 2. Modelo de pricing (la base que afecta todo)

### Cómo funciona el negocio en la realidad

Servicio Xiaomi Reset + FRP. Margen neto: 0.5 a 1.5 USDT por unidad. Volumen: 130+ pedidos por día.

El precio del servicio depende de qué herramienta esté disponible y a qué precio. Hay 4 a 7 herramientas en rotación, ninguna con API. Dos trabajadores monitorean los precios manualmente durante el día.

### Ritmo del día

- 9 AM: solo herramientas caras online
- 11 AM: reinicio de servidores, se activan las baratas
- 3-4-6 PM: las baratas se agotan, hay que rotar a la siguiente más barata
- Noche: precios suben, manejado manualmente

### Cobro por marca, no por modelo

Todos los Xiaomi (Redmi, Poco, Mi, Black Shark) cuestan lo mismo. Todos los Samsung cuestan otra tarifa. Etc. El modelo específico es información secundaria — útil para planear con qué herramienta procesar, pero no para cotizar.

### Lock del precio

El precio se "ancla" para un cliente específico **al momento de subir el primer comprobante de pago**, no antes. Entre que entra al portal y sube comprobante, ve el precio vivo del momento.

### Lógica asimétrica de variación

| Caso | Comportamiento |
|---|---|
| Precio activo BAJA después del lock | Sin notificación. Cliente paga el precio anclado. La diferencia es ganancia adicional. |
| Precio activo SUBE después del lock | Notificación al cliente con tres opciones. |

### Las tres opciones cuando el precio sube

1. **Subir comprobante adicional** por la diferencia (máximo 2 comprobantes por orden)
2. **Esperar 1 hora** a que el precio baje. El sistema monitorea automáticamente. Si baja antes de la hora, se cancela el aviso. Si pasa la hora sin bajar, aparece pantalla "¿qué quieres hacer?" con botones cancelar / pagar diferencia.
3. **Cancelar y solicitar reembolso** vía Yape/Plin. Procesado manualmente. Copy en el portal: "usualmente en menos de 1 hora en horario activo".

### Reglas adicionales

- **Sin umbral mínimo de variación.** Cualquier subida se cobra, por chica que sea, porque el margen del negocio es muy delgado.
- **Sin lógica horaria automática.** Los trabajadores cargan el precio nocturno manualmente, el sistema solo refleja lo que ellos ponen.
- **Aviso de inactividad en paso 3:** 3 minutos sin subir comprobante desde que el cliente terminó de escribir el último modelo. Copy: "Precio puede variar. Si cambia, te pediremos un segundo comprobante o puedes solicitar reembolso."
- **Aviso de inactividad en paso 4:** 3 minutos sin apretar "Equipo conectado". Copy: "Recuerda conectar el equipo. Si el precio cambió, te pediremos un segundo comprobante o puedes solicitar reembolso."

---

## 3. Paso 1 — Método de pago

### Estructura

- Label: "Método de pago"
- 5 pills horizontales con banderas SVG inline (no emoji)
  - Colombia
  - México
  - Chile
  - Perú
  - USDT (círculo verde Tether `#26A17B` con ₮ blanco)
- Card único de monto

### Card de monto

- Label "Estimado" + indicador "en vivo" pulsante (dot verde `#10B981` con anillo expandiendo)
- Monto principal: ej. `$489 MXN` (sigla en gris secundario)
- Conversión de referencia: ej. `≈ 25 USDT`
- **Sin** línea redundante de "pesos mexicanos" abajo

### Comportamiento

- El precio del paso 1 es siempre vivo, sin lock
- Polling de 30 segundos al backend para reflejar cambios que hagan los 2 trabajadores
- Cuando el cliente cambia de pill, se recalcula con la conversión correspondiente

---

## 4. Paso 2 — Solicitud de equipos

### Lo que decidimos eliminar

Botón "Crear solicitud" del paso 2. Era el origen del bucle UX que detectaste en el screenshot original.

### Estructura final

- Pills de marca: Xiaomi/Redmi/Poco · Samsung · Otra marca
- Selector de cantidad con botones +/- y total visible
- Total visible al lado: ej. `S/. 48`
- Sección colapsable opcional "Especificar modelos"
  - Textarea para escribir modelos libres
  - Hint: "Si tienes modelos no soportados los confirmaremos antes de procesar"

### Por qué simplificado

Cobras por marca, no por modelo. El cliente experto escribe "Redmi" en WhatsApp y eso ya basta. No necesita autocompletar modelos exactos. El cliente novato no tiene que adivinar el modelo de su celular.

El campo opcional de modelos es para clientes que quieran dar más detalle, o para que tu equipo planee con qué herramienta procesar.

### Comportamiento

- La orden se crea automáticamente cuando el cliente sube el comprobante en paso 3, no antes
- Si el cliente no llena nada del paso 2, se asume "1 equipo" como default
- El timer de inactividad del paso 3 se resetea cada vez que el cliente edita un modelo

---

## 5. Paso 3 — Pago y comprobante

### Estructura

- Datos para transferir según método elegido en paso 1 (cuentas, Yape, Plin, USDT wallet)
- Dropzone para subir comprobante (foto o PDF)
- Aviso preventivo arriba del dropzone: "Revisa los datos de los pasos 1, 2 y 3 antes de subir. Una vez subido el comprobante no podrás editarlos."

### Mobile UX (pendiente de implementación)

- Wrap dropzone en `<label for="flowPaymentProofInput">` para hacerlo tappable
- `accept="image/*,application/pdf"` (permite cámara, galería, archivo)
- Sin atributo `capture` (no forzar cámara)
- Preview después de seleccionar con botones confirmar/cambiar
- Loading state con porcentaje durante upload
- Edge cases: archivo > 10MB, formato no válido, picker cancelado, conexión perdida
- Copy: "Sube tu comprobante (foto o PDF) · Cámara, galería o archivo según tu dispositivo"

### Comportamiento

- Al subir comprobante: la orden se crea automáticamente en backend
- Pasos 1, 2 y 3 se congelan visualmente con candado (`step-locked` CSS)
- El precio queda anclado en `priceLocked` con timestamp `priceLockedAt`
- Avanza al paso 4

### Aviso de inactividad

A los 3 minutos desde que el cliente terminó de escribir el último modelo del paso 2 sin haber subido comprobante, aparece el banner de aviso de variación de precio.

---

## 6. Paso 4 — Conexión del equipo

### Propósito

**Enseñar al cliente cómo conectar su equipo + recibir confirmación de que conectó.** No es donde el cliente ve el progreso del procesamiento (eso es "Mis órdenes / Seguimiento", sección 7).

### Contenido

1. Sub-paso 1: descarga del Redirector
   - Link permanente al Redirector 2.5 en Drive
   - Versión actual visible (ej. "publicada hace 5 días")
   - Hint: "Si ya lo tienes, verifica que sea esta versión"
   - Link "¿Primera vez? Ver video tutorial" debajo
2. Sub-paso 2: configuración del Redirector
   - DDNS code del técnico asignado al caso (auto-poblado, antes "Technician ID")
   - Código del cliente (auto-poblado)
   - Recordatorio: "Pon tu nombre, apellido y país reales en el Redirector"
3. Botón final: **"Equipo conectado"** (no "Crear solicitud")

### Comportamiento

- Pasos 1, 2 y 3 quedan congelados visualmente con candado
- Al apretar "Equipo conectado", llama a `POST /api/portal/orders/:id/notify-connected` (ya implementado en commit 2)
- La orden aparece en la lane "Cliente conectado, listo para procesar" del panel de operadores

### Aviso de inactividad

A los 3 minutos sin apretar "Equipo conectado", aparece el banner recordatorio.

---

## 7. Mis órdenes / Seguimiento

### Qué es

Sección **aparte y debajo** del flujo de pasos. El cliente ve aquí el estado de cada uno de sus pedidos en proceso y finalizados. Ya está implementada en `public/portal-modules/orders.js`.

### No se toca por ahora

Esta sección no entra en el rediseño actual. Funciona como está. Si el cliente quiere ver progreso de su pedido, lo hace acá.

---

## 8. Sistema de notificaciones (pendiente de definir)

### Pregunta abierta

Cuando un evento importante ocurre en una orden (técnico terminó, requiere atención, etc.), ¿cómo se entera el cliente?

Opciones a discutir más adelante:
- Solo si entra al portal y mira "Mis órdenes"
- Push del navegador (si dio permiso)
- WhatsApp como hoy
- Email

Esto NO afecta los PRs del rediseño actual. Se puede definir después.

---

## 9. Sistema de pricing dinámico (próximo PR — el más prioritario)

### Por qué este PR va antes que el flujo híbrido

Tú lo priorizaste. El flujo híbrido toca el paso 1 visualmente, y el paso 1 muestra precio vivo. Si los datos vienen de un sistema que vamos a re-arquitecturar, mejor armar la cañería primero y poner el visual encima después.

### Lo que va a incluir

**Backend:**

- Nueva tabla/estructura `db.toolPricing[]` con campos:
  - `id`
  - `toolName`
  - `currentPriceUSDT`
  - `slotsAvailable`
  - `lastUpdatedAt`
  - `lastUpdatedBy` (id del trabajador)
  - `supportedBrands` (Xiaomi, Samsung, etc.)
  - `isActive` (puede pausarse temporalmente)
- Endpoint `PATCH /api/operator/tool-pricing/:id` para que los trabajadores actualicen
- Endpoint `GET /api/portal/current-quote?brand=X&country=Y` que retorna el precio mínimo viable
- Lógica de selección: dado marca + país, retornar precio mínimo de herramienta activa con slots
- Endpoint `POST /api/portal/orders/:id/lock-price` (al subir comprobante)
- Lógica de detección de subida: comparar `priceLocked` vs `currentQuote`, si > 0 disparar flujo de "necesita 2do comprobante"
- Cola "Devoluciones pendientes" en backend

**Frontend operador (panel de los 2 trabajadores):**

- UI para ver lista de herramientas
- Editar precio + slots inline
- Marcar herramienta como agotada/activa
- Historial de cambios (quién, cuándo, de cuánto a cuánto)
- Vista de "clientes con precio anclado" (cuántos pedidos tienen lock activo y a qué precio)
- Cola de devoluciones pendientes para procesar

**Frontend cliente (portal):**

- Polling cada 30s al endpoint de cotización
- Animación sutil cuando el precio cambia (fade, no flash)
- Manejo del aviso de subida con sus 3 opciones
- Pantalla de "decisión manual" cuando se cumple la hora de espera

### Decisiones pendientes para este PR

Estas las cerramos cuando arranquemos el spec técnico, no ahora:

- Visibilidad para los trabajadores: qué ven en su panel sobre clientes con lock activo
- Cómo se ve el segundo comprobante en el panel del operador (al lado del primero, agrupados, etc.)
- Qué pasa exactamente cuando el cliente cancela tras el aviso de subida (cómo se comunica al operador para procesar devolución)

---

## 10. Cola de PRs (orden actualizado)

| Orden | PR | Estado |
|---|---|---|
| 1 | Probar commits 1+2 en local | Pendiente del usuario |
| 2 | Sistema de pricing dinámico | Próximo, requiere spec técnico |
| 3 | Flujo híbrido (incluye paso 1 visual + paso 2 simplificado + mobile UX upload) | Después del pricing |
| 4 | SSE para operadores + cancelación | Después del híbrido |
| 5 | Sistema de notificaciones al cliente | Definir cómo |
| 6 | Logo + favicons aplicados al portal | Cuando estés seguro |

---

## 11. Resumen de decisiones que pueden parecer pequeñas pero son importantes

- **Sin botón "Crear solicitud" en ningún paso.** La orden se crea automáticamente al subir comprobante.
- **Sin botón "Voy a pagar ahora" para congelar el precio antes del comprobante.** Cliente está expuesto al precio vivo, asumes el riesgo conscientemente.
- **Sin umbral mínimo de variación de precio.** Defendiste tu margen y entendí.
- **Botón "Equipo conectado" reemplaza al viejo "Estoy listo para conectar".** Ya implementado.
- **Devolución manual con copy honesto.** "Usualmente en menos de 1 hora en horario activo" en vez de prometer 24/7.
- **Catálogo de modelos no se construye.** Decidimos cobrar por marca, así que no hay catálogo de cientos de modelos para autocompletar. El campo libre opcional cubre el resto.
- **El Redirector 2.5 + DDNS se entregan automáticamente desde el portal.** Reemplaza el bloque de WhatsApp que envías hoy.

---

## 12. Cosas que aún quedan abiertas (no urgentes)

- Comportamiento exacto cuando el cliente cancela y el primer comprobante ya está subido (devolución vs crédito vs ajuste manual)
- Notificaciones al cliente (qué canal cuando hay cambios de estado)
- Aplicación visual del logo nuevo (favicons + identidad)
- Migración eventual a SSE en lugar de polling para operadores
- Decisión sobre si el portal a futuro reemplaza WhatsApp para cotizaciones (depende del éxito del pricing dinámico)
