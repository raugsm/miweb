# Paso 1 — Precio (Método de pago)

**Versión:** 1.0 · **Fecha:** 2 de mayo 2026 · **Estado:** propuesto, pendiente de aprobación de Bryam

---

## Contexto

Primera pantalla del flow del portal cliente. El técnico (cliente B2B de AriadGSM) elige en qué moneda va a pagar. La selección define qué método de pago verá en el paso 3 (Yape, transferencia mexicana, transferencia chilena, transferencia colombiana, USDT en red TRC20). Esta pantalla **no** decide cantidad de equipos (eso es paso 2) ni paga (eso es paso 3) — solo selecciona país/moneda y muestra un estimado en vivo de cuánto costaría 1 equipo.

**Audiencia:** técnico de tienda, semi-novato a profesional. Ya conoce el dominio (FRP, Xiaomi, USDT). No quiere fricción.

**Posición en el flow:** entrada del portal cliente. No requiere login para ver, sí requiere selección para avanzar.

---

## 1. Mockup visual

Archivo: `docs/specs/cliente/mockups/paso-1-precio.html`

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
| Paso actual | Segmento azul `#185FA5`, altura 3px (igual que completado) |
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

**Nota:** disabled aplica si admin desactiva ese método (ver edge case 8).

### 2.5 Card "ESTIMADO · EN VIVO"
Card oscura `#1a1a1a` con texto blanco. Múltiples estados según data.

| Estado | Trigger | Apariencia |
|---|---|---|
| Loading | Al cargar paso 1 antes de tener tasa de cambio | Dot gris (sin animación), texto "Calculando…", monto en skeleton shimmer |
| Default (con dato fiat) | Pill de país fiat seleccionada + tasa cargada | Dot verde pulsante (animación 1.4s loop), monto en moneda local 28px, sub-línea "≈ X USDT" con logo Tether |
| Default (con USDT) | Pill USDT seleccionada | Dot verde pulsante, monto en USDT 28px, sub-línea oculta (no hay conversión) |
| Error de FX | API de tasa de cambio falla | Dot rojo (sin animación), texto "Sin conexión", botón "Reintentar" |
| Precio fuera de rango | Cost unitario configurado >100 USDT (error de config) | Banner amarillo dentro del card "Configuración incorrecta, contactá soporte" |

### 2.6 Botón "Continuar"
| Estado | Trigger | Apariencia |
|---|---|---|
| Disabled | Sin pill seleccionada O Card en error/loading | Fondo `--color-background-secondary`, borde tertiary, texto tertiary, no clickeable |
| Enabled default | Pill seleccionada + Card en estado válido | Fondo `#185FA5`, texto blanco, clickeable |
| Hover (desktop) | Mouse encima de Enabled | Fondo `#0C447C` |
| Focus (keyboard) | Tab nav | Outline 2px `#185FA5`, offset 2px |
| Pressed | Click activo | Scale(0.98), 100ms |
| Loading | Click realizado, esperando respuesta del backend | Texto reemplazado por spinner blanco 16px, disabled hasta respuesta |

---

## 3. Edge cases

1. **Cliente entra sin selección previa.** Detectar país por IP. Si IP detecta país soportado (CO/MX/CL/PE), preseleccionar pill correspondiente. Si IP no detecta o detecta país no soportado, ninguna pill seleccionada → botón Continuar disabled.
2. **API de FX falla.** Card pasa a estado error. Pills siguen seleccionables. Continuar disabled hasta que la tasa esté disponible. Botón "Reintentar" en el card.
3. **Cliente selecciona USDT.** No hay conversión que aplicar. Card muestra monto directo en USDT, sin sub-línea "≈".
4. **Cliente vuelve a paso 1 desde paso 2** (botón "atrás"). Estado preservado: pill seleccionada y monto estimado intactos. Card no recarga loading.
5. **Cost unitario configurado >100 USDT** (error de config admin). Card muestra error "Configuración incorrecta, contactá soporte". Continuar disabled. Esto **no debería pasar en producción** pero el frontend debe degradarse, no romper.
6. **Cliente recarga página en paso 1.** Estado se reconstruye desde localStorage (selección de país) y desde API (tasa de cambio). Si no hay selección previa, vuelve a flujo de detección por IP.
7. **Texto largo en pill.** No aplica — los 5 países tienen nombres ≤8 caracteres.
8. **Admin desactiva un método** (ej: USDT bloqueado por mantenimiento). Pill aparece **disabled** (opacity 0.4, no clickeable), no se oculta. Tooltip al hover: "No disponible temporalmente".
9. **Tasa de cambio cambia mientras cliente está en paso 1** (>2% de variación). Banner amarillo en el card oscura: "El tipo de cambio cambió, monto actualizado". Esto es la lógica de "cambio de costo" del doc original §4 pero aplicada solo al estimado.
10. **Cliente sin conexión a internet.** Card en estado error de FX (es la primera dependencia de red que prueba). Toast global "Sin conexión a internet". Continuar disabled.

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

### 4.3 Desktop (`≥1200px`)
- Container max-width 600px, centrado horizontalmente. **Sin sidebar** (ver Open Question 5).
- Top bar oculta.
- Pills en una fila de 5.
- Hover states activos en pills y botón.
- Botón Continuar max-width 320px, alineado al centro.
- Tipografía: header 24px, monto 32px, pill text 12px.

**Breakpoints exactos:**
- `mobile`: hasta 767px
- `tablet`: 768px – 1199px
- `desktop`: 1200px en adelante

---

## 5. Comportamiento (interaction logic)

| Acción | Resultado |
|---|---|
| Click en pill no seleccionada | Pill pasa a seleccionada, las otras vuelven a default. Card actualiza monto en <200ms. |
| Click en pill ya seleccionada | No-op. Sin feedback visual. |
| Click en pill disabled | No-op. Tooltip con razón aparece ~500ms. |
| Click en card "ESTIMADO" | No-op. Card es display only. |
| Click en botón "Reintentar" del card error | Reintenta llamada de FX. Card pasa a loading. |
| Click en "Continuar" disabled | No-op. Sin feedback. |
| Click en "Continuar" enabled | Botón pasa a loading. Backend recibe `POST /orders` con datos del paso 1. Al recibir 200 OK, navega a paso 2. Al recibir error, vuelve a enabled y muestra toast con mensaje. |
| Cierre de navegador en medio del paso 1 | Estado guardado en localStorage. |
| Recarga de página en paso 1 | Recupera selección de localStorage. Recarga tasa de cambio desde API. |
| Pérdida de conexión durante polling de FX | Card pasa a error. Polling reintenta cada 30s automáticamente. |
| Tab keyboard nav | Tab order: pill 1 → pill 2 → … → pill 5 → botón Continuar. |
| Enter sobre pill con focus | Selecciona esa pill (igual que click). |
| Enter sobre botón Continuar enabled con focus | Avanza al paso 2. |
| Touch en mobile | Tap en pill da feedback `scale(0.97)` 100ms y feedback haptic si dispositivo lo soporta. |

**Polling de tasa de cambio:** cada 30 segundos, en silencio. Si la tasa cambia >2% respecto a la primera carga, dispara el banner amarillo del edge case 9.

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

**Geolocation por IP:** endpoint a definir (Open Question 1). Devuelve country code ISO-2.

**Tasa de cambio USDT → moneda local:** API a definir (Open Question 2). Endpoint debe devolver al menos:
```json
{
  "USDT_COP": 4250.5,
  "USDT_MXN": 19.55,
  "USDT_CLP": 940.2,
  "USDT_PEN": 3.72
}
```
Polling cada 30 segundos.

**Cost unitario en USDT:** valor de configuración admin. Hoy en producción es `~6.25 USDT por equipo` (Open Question 4 confirma).

### 6.2 Datos que produce (al click "Continuar")

`POST /orders` (o `PATCH /orders/:id` si la orden ya existía):
```json
{
  "orderId": "string (UUID, nuevo o existente)",
  "step": 1,
  "countryCode": "CO | MX | CL | PE | USDT",
  "currency": "COP | MXN | CLP | PEN | USDT",
  "estimatedAmountUsdt": "number (>0, ej: 6.25)",
  "estimatedAmountLocal": "number (>0, ej: 122.25)",
  "fxRate": "number (>0, ej: 19.55) o null si countryCode === 'USDT'"
}
```

Backend responde con la orden actualizada y el cliente navega al paso 2.

### 6.3 Validaciones

**Frontend (antes de habilitar Continuar):**
- `countryCode` debe estar en la lista de 5 fijos.
- `estimatedAmountUsdt` entre 0.5 y 100 (rango razonable, fuera de eso = error de config).
- `fxRate > 0` si `countryCode !== 'USDT'`.
- Card "ESTIMADO" no en estado error ni loading.

**Backend (en `POST /orders`):**
- Re-validar todo lo del frontend (no confiar).
- Verificar que `countryCode` no esté bloqueado por configuración admin (edge case 8).
- Verificar que `fxRate` enviado por el frontend está dentro de tolerancia ±2% de la tasa actual del backend (anti-manipulación).
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

**Comportamiento:**
8. Al cargar paso 1 con IP de país soportado, ese país queda preseleccionado.
9. Al cargar paso 1 con IP no soportado, ninguna pill seleccionada.
10. Click en pill cambia la selección y actualiza el card en <200ms.
11. Click en pill ya seleccionada no hace nada.
12. Selección de USDT oculta la sub-línea "≈ X USDT".
13. Selección de país fiat muestra "≈ X USDT" con logo Tether.
14. Botón Continuar permanece disabled mientras no haya pill seleccionada.
15. Botón Continuar permanece disabled mientras Card está en error/loading.
16. Click en Continuar enabled persiste país y monto en backend, después navega a paso 2.

**Resiliencia:**
17. Si API de FX falla, Card muestra error "Sin conexión, reintentar".
18. Click en Reintentar vuelve a llamar la API.
19. Recarga de página en paso 1 con país previamente seleccionado: estado recuperado de localStorage.
20. Pérdida de conexión: Card pasa a error en menos de 5s.
21. Tasa de cambio cambia >2% durante el paso: banner amarillo aparece en el card.
22. Si admin bloquea un método, esa pill aparece disabled (opacity 0.4) con tooltip.

**Accesibilidad:**
23. Tab order: pills (1→5) → Continuar.
24. Enter sobre pill con focus: selecciona.
25. Pills tienen `aria-pressed` que refleja estado de selección.
26. Card error tiene `role="alert"` para que lectores de pantalla anuncien el error.

---

## 8. Open questions / Decisiones pendientes

Antes de codear, Bryam tiene que resolver:

1. **¿Detección de país por IP cuál proveedor?** Opciones: `cf-ipcountry` header de Cloudflare (gratis, viene en cada request si Cloudflare es CDN), `ipapi.co` (gratis hasta cierto límite, agrega request extra), implementación propia en backend.

2. **¿API de tasa de cambio cuál?** Opciones: `CoinGecko` (gratis, 50 req/min), `exchangerate.host` (gratis, ilimitado pero menos preciso), `Binance API` (gratis, más preciso para USDT). Recomendación: CoinGecko por balance precio/precisión/cuota.

3. **¿Polling de FX cada cuánto?** Sugerencia: 30 segundos. Alternativa: 60 segundos para ahorrar requests. Bryam decide.

4. **¿Cost unitario es fijo `6.25 USDT` o varía por país?** Hoy parece fijo. Confirmar y decidir si en el futuro tendrá pricing por país.

5. **¿Desktop tiene sidebar de "estado de orden" o es full-width como mobile?** Si es sidebar, hay que diseñarla aparte. Hoy asumo full-width (más simple, replica mobile en desktop centrado).

6. **¿Persistencia de selección entre sesiones?** Si un cliente vuelve mañana, ¿queremos que vea su última selección de país preseleccionada? Si sí, ¿en cookie/localStorage o en perfil de cliente backend?

7. **¿Hay tooltip/explicación al lado del nombre del método de pago?** Por ejemplo, USDT puede confundir a un técnico mexicano que no sabe qué red. Sugerencia: hover/tap muestra "USDT en red TRC20".

8. **¿En qué casos se desactiva un método?** Hoy edge case 8 dice "admin bloquea". ¿Qué admin, qué interfaz, qué triggers? Esto se cruza con specs operador.

---

## Changelog

- **v1.0** (2026-05-02) — Spec inicial, 8 piezas completas. Pendiente respuestas de Open Questions.
