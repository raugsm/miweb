# Paso 1 — Precio (Método de pago)

**Versión:** 1.1 · **Fecha:** 3 de mayo 2026 · **Estado:** 7 de 8 open questions cerradas en sesión 10. La #5 (vista desktop) queda pendiente del modelo de órdenes paralelas (sesión 11). Spec NO está lista para implementación todavía.

---

## Contexto

Primera pantalla del flow del portal cliente. El técnico (cliente B2B de AriadGSM) elige en qué moneda va a pagar. La selección define qué método de pago verá en el paso 3 (Yape, transferencia mexicana, transferencia chilena, transferencia colombiana, USDT vía Binance Pay). Esta pantalla **no** decide cantidad de equipos (eso es paso 2) ni paga (eso es paso 3) — solo selecciona país/moneda y muestra un estimado en vivo de cuánto costaría 1 equipo.

**Audiencia:** técnico de tienda, semi-novato a profesional. Ya conoce el dominio (FRP, Xiaomi, USDT). No quiere fricción. Cliente repetidor de alta frecuencia (puede iniciar varias órdenes por día).

**Posición en el flow:** entrada del portal cliente. Hoy requiere login (modo principal). Modo express sin login está identificado como línea de producto futura — ver HANDOFF.md sección "Inputs crudos para spec futura".

**Importante (sesión 10):** se descubrió que el cliente real hace órdenes en paralelo, no secuencial. La pantalla principal cliente convive con "Mis órdenes" y posibles órdenes activas. Cómo se relacionan paso 1 + Mis órdenes + flujo paralelo se decide en sesión 11. La spec del paso 1 actual asume que paso 1 vive como punto de entrada para "nueva orden", pero la convivencia con Mis órdenes en desktop queda pendiente (Open Question #5).

---

## 1. Mockup visual

Archivo: `docs/specs/cliente/mockups/paso-1-precio.html`

**Estado del mockup:** v1.0 cubre el estado "todo bien". **Pendiente actualizar antes de implementación** con dos estados nuevos decididos en sesión 10:

1. Pill desactivada con mensaje custom configurable (ver §2.4).
2. Banner amarillo "El tipo de cambio cambió, monto actualizado" disparado por cambio manual del admin (ver §2.5).

**Estructura visual de arriba hacia abajo:**

1. Top bar con hora y nombre "AriadGSM"
2. Stepper de progreso con 4 segmentos (segmento 1 azul, 2-4 grises)
3. Header: label "PASO 1 / 4" + título "Precio"
4. Sub-label: "Método de pago"
5. Grilla de 5 pills en layout 3+2: Colombia / México / Chile arriba, Perú / USDT abajo
6. Card oscura "ESTIMADO · EN VIVO" con dot verde pulsante, monto grande en moneda local, monto estimado en USDT debajo
7. Botón "Continuar" full-width, primary azul

---

## 2. Componentes y estados

### 2.1 Top bar
Elemento decorativo. Solo aparece en mobile. Sin estados.

### 2.2 Stepper de progreso (4 segmentos)
| Estado | Apariencia |
|---|---|
| Paso completado | Segmento azul `#185FA5`, altura 3px |
| Paso actual | Segmento azul `#185FA5`, altura 3px |
| Paso pendiente | Segmento gris `var(--color-border-tertiary)`, altura 3px |

En paso 1: segmento 1 azul (actual), 2-4 grises.

### 2.3 Header (PASO 1 / 4 + título)
Estático. Sin estados.

### 2.4 Pill de país
Cinco pills idénticas en estructura, una por país/moneda.

| Estado | Borde | Fondo | Texto |
|---|---|---|---|
| Default | 0.5px `--color-border-tertiary` | blanco | primary |
| Hover (desktop) | 0.5px `--color-border-secondary` | blanco | primary |
| Focus (keyboard nav) | 2px `--color-border-info` | blanco | primary |
| Seleccionado | 2px `#185FA5` | `#E6F1FB` | `#0C447C`, weight 500 |
| Pressed (touch) | igual default + scale(0.97) animación 100ms | — | — |
| Disabled | 0.5px `--color-border-tertiary`, opacity 0.4 | blanco, opacity 0.4 | tertiary, opacity 0.4 |

**Pill USDT:** muestra logo de Tether (círculo verde `#26A17B` con T blanca) + texto "USDT". NO se muestra "TRC20" ni ninguna red. Razón: clientes ya entienden USDT como abreviación de dólar; los detalles de método (Binance Pay) se ven recién en paso 3 (decisión #7 sesión 10).

**Estado disabled (decisión #8 sesión 10):** aplica cuando admin desactiva el método de pago desde Centro de configuración → Métodos de pago. Tooltip al hover muestra mensaje configurable: por defecto "No disponible temporalmente", o texto custom que admin haya cargado al desactivar (ej: "USDT vuelve mañana 9 AM"). Cambio de estado se refleja **en vivo** sin necesidad de recarga (ver §5).

### 2.5 Card "ESTIMADO · EN VIVO"
Card oscura `#1a1a1a` con texto blanco. Múltiples estados según data.

| Estado | Trigger | Apariencia |
|---|---|---|
| Loading | Al cargar paso 1 antes de tener tasa cargada | Dot gris (sin animación), texto "Calculando…", monto en skeleton shimmer |
| Default (con dato fiat) | Pill de país fiat seleccionada + tasa cargada | Dot verde pulsante (animación 1.4s loop), monto en moneda local 28px, sub-línea "≈ X USDT" con logo Tether |
| Default (con USDT) | Pill USDT seleccionada | Dot verde pulsante, monto en USDT 28px, sub-línea oculta (no hay conversión) |
| Tasa no cargada | Admin no cargó tasa en Centro de configuración | Dot rojo (sin animación), texto "Tasa no disponible, contactá soporte" |
| Precio fuera de rango | Cost unitario configurado fuera de 0.5–100 USDT (error de config) | Banner amarillo dentro del card "Configuración incorrecta, contactá soporte" |
| **Cambio de tasa (NUEVO sesión 10)** | Admin actualizó la tasa mientras cliente estaba en paso 1 | Banner amarillo dentro del card: "El tipo de cambio cambió, monto actualizado". Monto se actualiza al nuevo valor. |

### 2.6 Botón "Continuar"
| Estado | Trigger | Apariencia |
|---|---|---|
| Disabled | Sin pill seleccionada O Card en estado tasa-no-cargada / loading / error de config | Fondo `--color-background-secondary`, borde tertiary, texto tertiary, no clickeable |
| Enabled default | Pill seleccionada + Card en estado válido | Fondo `#185FA5`, texto blanco, clickeable |
| Hover (desktop) | Mouse encima de Enabled | Fondo `#0C447C` |
| Focus (keyboard) | Tab nav | Outline 2px `#185FA5`, offset 2px |
| Pressed | Click activo | Scale(0.98), 100ms |
| Loading | Click realizado, esperando respuesta del backend | Texto reemplazado por spinner blanco 16px, disabled hasta respuesta |

---

## 3. Edge cases

1. **Cliente entra al paso 1 con login activo.** El país se preselecciona desde **el perfil del cliente registrado** (decisión #1 sesión 10). NO se usa detección por IP. Si el perfil no tiene país declarado, ninguna pill seleccionada → botón Continuar disabled. *(Nota: detección por IP con Cloudflare `cf-ipcountry` queda reservada para el "modo express sin login" futuro, ver HANDOFF.)*
2. **Tasa de cambio no cargada en Centro de configuración.** Card pasa a estado "tasa no disponible". Pills siguen seleccionables. Continuar disabled hasta que admin cargue la tasa. NO hay botón "Reintentar" porque no se llama a fuente externa — la tasa la define el admin manualmente.
3. **Cliente selecciona USDT.** No hay conversión que aplicar. Card muestra monto directo en USDT, sin sub-línea "≈".
4. **Cliente vuelve a paso 1 desde paso 2** (botón "atrás"). Estado preservado: pill seleccionada y monto estimado intactos. Card no recarga loading.
5. **Cost unitario configurado fuera del rango 0.5–100 USDT** (error de config admin). Card muestra error "Configuración incorrecta, contactá soporte". Continuar disabled. Esto **no debería pasar en producción** pero el frontend debe degradarse, no romper. *(Nota sesión 10: registrado en HANDOFF que esta validación falló en algún momento. Pendiente investigar empíricamente cuándo y por qué.)*
6. **Cliente recarga página en paso 1.** Estado se reconstruye desde la última pill elegida (decisión #6 sesión 10) y desde el panel admin (tasa de cambio actualizada). Si el cliente nunca eligió pill antes, vuelve a la del perfil.
7. **Texto largo en pill.** No aplica — los 5 países tienen nombres ≤8 caracteres.
8. **Admin desactiva un método** (ej: USDT bloqueado por mantenimiento). Pill aparece **disabled** (opacity 0.4, no clickeable), no se oculta. Tooltip muestra mensaje configurable (custom o por defecto "No disponible temporalmente"). El cambio se refleja **en vivo** en pantalla del cliente sin recarga.
9. **Admin actualiza la tasa de cambio** desde Centro de configuración mientras cliente está en paso 1. Banner amarillo en el card oscura: "El tipo de cambio cambió, monto actualizado". Monto se actualiza al nuevo valor sin que cliente recargue. *(Reemplaza al edge case 9 original que se disparaba por cambio >2% en API externa.)*
10. **Cliente sin conexión a internet.** El paso 1 igual carga (la tasa se sirve desde el backend del propio sitio, no desde fuente externa). Si la conexión falla en el momento del Continuar, botón vuelve a enabled y aparece toast "Sin conexión, intentá de nuevo".

---

## 4. Responsive

### 4.1 Mobile (`<768px`)
- Container full-width, padding lateral 20px.
- Top bar visible.
- Pills en layout 3+2: Colombia/México/Chile arriba, Perú/USDT abajo. Gap 8px.
- Card "ESTIMADO" full-width.
- Botón Continuar full-width.
- Tipografía: header 22px, monto 28px, pill text 11px.

### 4.2 Tablet (`768px – 1199px`)
- Container max-width 600px, centrado horizontalmente.
- Top bar oculta (es web, no mobile).
- Pills en una sola fila de 5 (cada pill ~110px ancho). Si no caben, fallback a layout 3+2.
- Card "ESTIMADO" max-width 600px.
- Botón Continuar full-width del container.
- Tipografía: igual que mobile.

### 4.3 Desktop (`≥1200px`) — PENDIENTE

**⚠️ Open Question #5 abierta.** Cómo se ve el paso 1 en desktop depende del modelo de órdenes paralelas que se procesa en sesión 11. La duda no es solo estética — toca cómo conviven en desktop el paso 1 ("nueva orden") con Mis órdenes (órdenes activas).

**Decisión de mínima provisional (NO confirmada hasta sesión 11):** mismo layout que tablet, centrado a 600px. Es la opción más simple y compatible con el cliente repetidor de alta frecuencia (cero fricción, una sola pantalla escalable). Esta es la "Opción A" discutida en sesión 10 y aceptada provisionalmente por Bryam para el espacio del paso 1 *en sí mismo*. Lo que falta resolver es cómo **convive** con Mis órdenes y el flujo paralelo abajo.

**Breakpoints exactos:**
- `mobile`: hasta 767px
- `tablet`: 768px – 1199px
- `desktop`: 1200px en adelante

---

## 5. Comportamiento (interaction logic)

| Acción | Resultado |
|---|---|
| Click en pill no seleccionada | Pill pasa a seleccionada, las otras vuelven a default. Card actualiza monto en <200ms. La elección se guarda como "última pill" para preselección en próxima visita (decisión #6). |
| Click en pill ya seleccionada | No-op. Sin feedback visual. |
| Click en pill disabled | No-op. Tooltip con mensaje custom (o por defecto) aparece ~500ms. |
| Click en card "ESTIMADO" | No-op. Card es display only. |
| Click en "Continuar" disabled | No-op. Sin feedback. |
| Click en "Continuar" enabled | Botón pasa a loading. Backend recibe `POST /orders` con datos del paso 1. Al recibir 200 OK, navega a paso 2. Al recibir error, vuelve a enabled y muestra toast con mensaje. |
| Cierre de navegador en medio del paso 1 | Estado guardado en localStorage (última pill elegida). |
| Recarga de página en paso 1 | Recupera última pill elegida (decisión #6). Recarga tasa de cambio desde el backend del propio sitio. |
| Admin actualiza tasa en Centro de configuración | Cliente que está en paso 1 recibe la nueva tasa **en vivo** (vía SSE, mismo mecanismo que ya usa el panel operador). Aparece banner amarillo "El tipo de cambio cambió, monto actualizado" en el card. |
| Admin desactiva un método de pago | Cliente que está en paso 1 ve la pill correspondiente cambiar a estado disabled **en vivo** sin recargar. Si la pill estaba seleccionada por el cliente, queda deseleccionada y Continuar pasa a disabled. |
| Tab keyboard nav | Tab order: pill 1 → pill 2 → … → pill 5 → botón Continuar. |
| Enter sobre pill con focus | Selecciona esa pill (igual que click). |
| Enter sobre botón Continuar enabled con focus | Avanza al paso 2. |
| Touch en mobile | Tap en pill da feedback `scale(0.97)` 100ms y feedback haptic si dispositivo lo soporta. |

**Nota sobre sincronización en vivo (sesión 10):** los cambios admin (tasa, métodos desactivados) se propagan al cliente vía el mismo mecanismo SSE que ya está implementado en el sistema (`/api/portal/orders/events` o canal equivalente). NO hay polling externo. La spec original mencionaba polling de 30s a fuente externa — eso se ELIMINA.

---

## 6. Datos (data requirements)

### 6.1 Datos que necesita (inputs)

**Lista de países (hardcoded en frontend, los 5 fijos):**
```json
[
  { "code": "CO",   "name": "Colombia", "currency": "COP", "flag": "co"   },
  { "code": "MX",   "name": "México",   "currency": "MXN", "flag": "mx"   },
  { "code": "CL",   "name": "Chile",    "currency": "CLP", "flag": "cl"   },
  { "code": "PE",   "name": "Perú",     "currency": "PEN", "flag": "pe"   },
  { "code": "USDT", "name": "USDT",     "currency": "USDT","flag": "usdt" }
]
```

**País preseleccionado (decisión #1 sesión 10):** viene del perfil del cliente registrado, NO de IP. Endpoint backend ya existente (consulta del cliente logueado) devuelve `customer.country` o equivalente. Si no hay valor, queda sin pill seleccionada.

**Última pill elegida (decisión #6 sesión 10):** se guarda en localStorage del cliente. Si existe valor, **prevalece sobre el país del perfil** en la próxima visita. Estructura sugerida: `{"lastSelectedPill": "USDT", "timestamp": "2026-05-03T..."}`.

**Tasa de cambio USDT → moneda local (decisión #2 sesión 10):** **manual desde Centro de configuración** (sub-sección "Tasa de cambio manual"). NO viene de fuente externa. Backend expone endpoint que devuelve las tasas actuales cargadas por admin:
```json
{
  "USDT_COP": 4250.5,
  "USDT_MXN": 19.55,
  "USDT_CLP": 940.2,
  "USDT_PEN": 3.72,
  "lastUpdated": "2026-05-03T10:23:00Z",
  "updatedBy": "admin"
}
```
Cuando admin actualiza, se emite evento SSE al cliente para que actualice en vivo (ver §5).

**Cost unitario en USDT (decisión #4 sesión 10):** valor de configuración admin desde Centro de configuración (sub-sección "Costo del servicio"). Rango real actual: **3.0–5.5 USDT por equipo** (varía con mercado). Mismo valor para los 5 destinos (no hay variación por país). El ejemplo de "6.25 USDT" en la spec v1.0 estaba desactualizado.

### 6.2 Datos que produce (al click "Continuar")

`POST /orders` (o `PATCH /orders/:id` si la orden ya existía):
```json
{
  "orderId": "string (UUID, nuevo o existente)",
  "step": 1,
  "countryCode": "CO | MX | CL | PE | USDT",
  "currency": "COP | MXN | CLP | PEN | USDT",
  "estimatedAmountUsdt": "number (>0, ej: 4.25)",
  "estimatedAmountLocal": "number (>0, ej: 83.09)",
  "fxRate": "number (>0, ej: 19.55) o null si countryCode === 'USDT'"
}
```

Backend responde con la orden actualizada y el cliente navega al paso 2.

### 6.3 Validaciones

**Frontend (antes de habilitar Continuar):**
- `countryCode` debe estar en la lista de 5 fijos.
- `estimatedAmountUsdt` entre 0.5 y 100 (rango razonable, fuera de eso = error de config).
- `fxRate > 0` si `countryCode !== 'USDT'`.
- Card "ESTIMADO" no en estado tasa-no-cargada / loading / error de config.

**Backend (en `POST /orders`):**
- Re-validar todo lo del frontend (no confiar).
- Verificar que `countryCode` no esté bloqueado por configuración admin (edge case 8).
- Verificar que `fxRate` enviado por el frontend coincide con la tasa actual del backend (anti-manipulación). Sin tolerancia ±2% — la tasa la define el admin manualmente, debe coincidir exactamente.
- Si validación falla, devolver 400 con código de error específico (ej: `FX_OUTDATED`, `COUNTRY_BLOCKED`, `AMOUNT_OUT_OF_RANGE`).

---

## 7. Acceptance criteria

Lista para verificar implementación. Cada ítem debería ser un test (manual o automático).

**Layout y estilo:**
1. Las 5 pills aparecen en orden Colombia, México, Chile, Perú, USDT.
2. En mobile (<768px), pills están en layout 3+2.
3. En tablet/desktop (≥768px), pills están en una sola fila.
4. Card "ESTIMADO" tiene fondo `#1a1a1a` y texto blanco.
5. Dot verde tiene animación pulsante de 1.4s loop.
6. Monto principal del card es 28px en mobile, 32px en desktop.
7. Botón Continuar es full-width en mobile, max 320px en desktop.
8. Pill USDT muestra logo de Tether (círculo verde con T blanca) sin mención de red TRC20.

**Comportamiento:**
9. Al cargar paso 1 con cliente registrado y pill anterior elegida, esa pill queda preseleccionada (decisión #6).
10. Al cargar paso 1 con cliente registrado sin pill anterior, queda preseleccionada la del perfil (decisión #1).
11. Al cargar paso 1 sin perfil ni pill anterior, ninguna pill seleccionada.
12. Click en pill cambia la selección y actualiza el card en <200ms.
13. Click en pill ya seleccionada no hace nada.
14. Selección de USDT oculta la sub-línea "≈ X USDT".
15. Selección de país fiat muestra "≈ X USDT" con logo Tether.
16. Botón Continuar permanece disabled mientras no haya pill seleccionada.
17. Botón Continuar permanece disabled mientras Card está en estado tasa-no-cargada / loading / error de config.
18. Click en Continuar enabled persiste país y monto en backend, después navega a paso 2.

**Resiliencia:**
19. Si la tasa no está cargada en Centro de configuración, Card muestra "Tasa no disponible, contactá soporte" y Continuar queda disabled.
20. Recarga de página en paso 1 con pill previamente elegida: estado recuperado de localStorage.
21. Admin actualiza la tasa en Centro de configuración: cliente en paso 1 ve banner amarillo y monto actualizado **sin recargar**.
22. Admin desactiva un método de pago: cliente en paso 1 ve la pill correspondiente cambiar a disabled **sin recargar**. Si la pill estaba seleccionada, queda deseleccionada y Continuar pasa a disabled.
23. Pill desactivada muestra tooltip con mensaje custom (si admin lo configuró) o "No disponible temporalmente" (default).

**Accesibilidad:**
24. Tab order: pills (1→5) → Continuar.
25. Enter sobre pill con focus: selecciona.
26. Pills tienen `aria-pressed` que refleja estado de selección.
27. Card error tiene `role="alert"` para que lectores de pantalla anuncien el error.
28. Banner amarillo de cambio de tasa tiene `role="status"` (no `alert` porque no es crítico, solo informativo).

---

## 8. Open questions / Decisiones pendientes

**Estado al cierre de sesión 10: 7 de 8 cerradas. Solo #5 queda abierta.**

### ✅ Cerradas en sesión 10

1. **¿Detección de país por IP cuál proveedor?** → **Anulada para modo con login.** El país viene del perfil del cliente registrado. Cloudflare `cf-ipcountry` queda reservado para el "modo express sin login" futuro (ver HANDOFF, sección "Inputs crudos"). 

2. **¿API de tasa de cambio cuál?** → **Anulada.** Tasa cargada manualmente por admin desde Centro de configuración → "Tasa de cambio manual". NO se usa fuente externa.

3. **¿Polling de FX cada cuánto?** → **Anulada.** Sin fuente externa, no hay polling. Cambios del admin se propagan vía SSE al cliente en vivo.

4. **¿Cost unitario es fijo o varía por país?** → **Fijo.** Mismo valor en USDT para los 5 destinos. Rango real 3.0–5.5 USDT (varía con mercado), configurable por admin. Solo cambia la tasa de cambio para mostrar el equivalente en moneda local.

6. **¿Persistencia de selección entre sesiones?** → **Sí, se recuerda la última pill elegida.** Si el cliente peruano elige USDT, la próxima vez que entra ve USDT preseleccionado. Si elige Perú, vuelve a Perú. Se guarda en localStorage. La preselección por perfil sigue siendo el fallback cuando no hay localStorage.

7. **¿Tooltip/explicación de "USDT en red TRC20"?** → **NO mostrar TRC20 en paso 1.** Pill solo dice "USDT" + logo Tether. Detalle del método (Binance Pay) se muestra recién en paso 3. *(Nota: la spec v1.0 decía "USDT en red TRC20" pero los cobros reales son por Binance Pay, no TRC20 directo. Corrección registrada en HANDOFF para aplicar en spec del paso 3 cuando llegue.)*

8. **¿En qué casos se desactiva un método?** → **Admin desactiva desde Centro de configuración → "Métodos de pago".** Cambio se refleja en vivo. Mensaje tooltip al cliente es configurable (texto custom o "No disponible temporalmente" por defecto). Centro de configuración es spec futura — ver HANDOFF.

### ⏸️ Pausadas

5. **¿Desktop tiene sidebar de "estado de orden" o es full-width como mobile?**

   **Estado:** PAUSADA. Depende del modelo de órdenes paralelas descubierto en sesión 10.
   
   **Por qué:** la pregunta original asumía que el paso 1 es "el principio del flujo único" y la duda era estética (qué hacer con el espacio extra en pantalla grande). Pero con el modelo paralelo, el paso 1 convive en desktop con Mis órdenes y posibles órdenes activas en distintos pasos. Resolver solo el paso 1 en desktop sin saber cómo se relaciona con el resto = improvisar.
   
   **Decisión provisional:** mantener el comportamiento actual (centrado a 600px en desktop, "Opción A" — espacio crema a los costados, sin paneles ni decoración). Esto refleja la preferencia de Bryam de **velocidad pura** para el cliente repetidor: cero fricción, ninguna distracción a los costados del paso 1 en sí mismo. Lo que falta resolver es si abajo del paso 1 hay sección de Mis órdenes en ancho completo, o algún otro layout.
   
   **Cierre:** sesión 11, después de procesar el modelo paralelo y posiblemente generar spec dedicada de "página principal cliente".

---

## 9. Cambios pendientes antes de implementación

**No mandar prompt Template B (implementación) hasta que esto esté resuelto:**

1. **Cerrar Open Question #5** en sesión 11 (depende del modelo paralelo).
2. **Actualizar mockup `paso-1-precio.html`** con los 2 estados nuevos:
   - Pill desactivada con mensaje custom configurable.
   - Banner amarillo "El tipo de cambio cambió, monto actualizado".
   - Sesión chica de polish visual antes de implementación.
3. **Esbozar al menos en formato de placeholder** las sub-secciones del Centro de configuración que el paso 1 consume:
   - "Tasa de cambio manual" (provee la tasa al paso 1).
   - "Métodos de pago" (provee el estado activo/desactivado de cada pill).
   - "Costo del servicio" (provee el costo unitario en USDT).
   
   No hace falta spec completa todavía, pero al menos endpoints o estructura de datos para que la implementación del paso 1 sepa de dónde leer.

---

## Changelog

- **v1.0** (2026-05-02) — Spec inicial, 8 piezas completas. Pendiente respuestas de Open Questions.
- **v1.1** (2026-05-03) — Sesión 10. 7 de 8 open questions cerradas. La #5 queda pausada hasta sesión 11. Cambios principales:
  - Detección de país: por perfil del cliente (NO por IP).
  - Tasa de cambio: manual desde Centro de configuración (NO desde API externa). Se elimina polling.
  - Costo unitario: rango real 3.0–5.5 USDT (corrige el ejemplo desactualizado de 6.25 USDT).
  - Estados nuevos: pill desactivada con mensaje custom + banner amarillo de tasa cambiada.
  - Persistencia de selección: se recuerda la última pill elegida.
  - USDT: pill solo dice "USDT" + logo Tether, sin TRC20.
  - Cambios admin → cliente vía SSE en vivo (sin polling).
  - Mockup pendiente de actualización antes de implementación.
  - Spec NO está lista para Template B hasta resolver #5 y actualizar mockup.
