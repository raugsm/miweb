# Panel 1 — Método de pago

**Versión:** 2.0 · **Fecha:** 3 de mayo 2026 · **Estado:** spec formal con las 8 piezas. Lista para implementación pendiente solo de OQ-residuales y archivo HTML standalone (sesión 14).

**Reemplaza a:** `paso-1-precio.md` v1.1. Cambia el "envoltorio" de pantalla independiente a panel dentro de la pantalla principal cliente. Decisiones de contenido (tipo de pills, tasa manual, persistencia de última pill, USDT sin TRC20, etc.) se mantienen.

---

## Contexto

Es el **panel 1 de los 4 paneles paralelos** que componen la pantalla principal cliente. El técnico (cliente B2B de AriadGSM) elige en qué moneda va a pagar. La selección define qué método verá en el panel 3 (Yape, transferencia mexicana/chilena/colombiana, USDT vía Binance Pay).

Este panel **no** decide cantidad de equipos (eso es panel 2) ni paga (eso es panel 3). Solo selecciona país/moneda y muestra un estimado en vivo de cuánto costaría 1 equipo.

**Audiencia:** técnico de tienda, semi-novato a profesional. Ya conoce el dominio (FRP, Xiaomi, USDT). No quiere fricción. Cliente repetidor de alta frecuencia.

**Posición en el flow:** columna 1 de la fila horizontal de paneles paralelos (desktop) o primer panel del stack vertical (mobile). Ya no hay "navegación entre pasos" — el cliente trabaja en cualquier panel en el orden que quiera. La selección de pill es estado del pedido en armado.

**Importante (sesión 13):** este panel cumple un rol clave en el modelo 3 ("atajo de pago") del HANDOFF. Cliente experto repetidor que abre la pantalla con la última pill recordada + cantidad por defecto en panel 2 = puede ir directo a panel 3 sin tocar este panel.

---

## 1. Mockup visual

**Estado del mockup:** decisiones visuales validadas en sesión 13 con mockups en chat. Archivo HTML standalone se entrega en sesión 14 como parte de los mockups consolidados de la pantalla principal.

### Estructura visual (desktop ~400px de ancho, mobile ~340px)

De arriba hacia abajo, dentro del panel:

1. **Header:** título "Método de pago" en 16px, weight 500. Sin numeración delante (se quitó "PASO 1 / 4" y también "Panel 1 de 4"). Sin ícono de candado.
2. **Grilla de 5 pills** en layout 3 + 2:
   - Fila 1: Perú · USDT · México
   - Fila 2: Colombia · Chile · (espacio vacío del ancho de una pill)
3. **Card oscura "ESTIMADO · EN VIVO"** con dot verde pulsante, monto principal en moneda local, monto estimado en USDT debajo.

**No hay** botón "Continuar" (se quitó en sesión 13 — el modelo de paneles paralelos no tiene "avanzar").

### Código HTML del mockup default (desktop, pill Perú seleccionada)

```html
<div style="width: 400px; background: var(--color-background-primary); border: 0.5px solid var(--color-border-secondary); border-radius: var(--border-radius-lg); padding: 1.25rem 1.5rem;">

  <h3 style="font-size: 16px; font-weight: 500; margin: 0 0 1.25rem; color: var(--color-text-primary);">Método de pago</h3>

  <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 8px;">
    <!-- Perú (seleccionada) -->
    <div style="border: 2px solid #185FA5; background: #E6F1FB; padding: 9px 10px; border-radius: 999px; display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 13px; color: #0C447C; font-weight: 500;">
      [bandera Perú 14x14] Perú
    </div>
    <!-- USDT -->
    <div style="border: 0.5px solid var(--color-border-tertiary); ...">
      [logo Tether circular verde 14x14] USDT
    </div>
    <!-- México -->
    <div style="border: 0.5px solid var(--color-border-tertiary); ...">
      [bandera México 14x14] México
    </div>
  </div>

  <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 1.25rem;">
    <!-- Colombia -->
    <!-- Chile -->
    <!-- espacio vacío -->
  </div>

  <div style="background: #2C2C2A; border-radius: var(--border-radius-md); padding: 14px 16px;">
    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">
      <span style="dot verde pulsante 8x8"></span>
      <span style="font-size: 10px; color: #B4B2A9; text-transform: uppercase;">Estimado · en vivo</span>
    </div>
    <div style="font-size: 30px; font-weight: 500; color: white;">S/ 18.25</div>
    <div style="font-size: 12px; color: #B4B2A9;">≈ 5.00 USDT [logo Tether mini]</div>
  </div>

</div>
```

(Bloques abreviados con `[…]` se completan con SVGs de banderas o el animation de pulse del dot verde. El HTML standalone completo se entrega en sesión 14.)

### Banderas

Cada pill de país lleva una bandera circular de 14×14px (12×12px en mobile). SVGs simples con franjas planas:

- **Perú:** rojo / blanco / rojo (vertical, tres franjas iguales)
- **México:** verde / blanco / rojo (vertical)
- **Chile:** blanco arriba / rojo abajo + cuadrado azul a la izquierda superior
- **Colombia:** amarillo (mitad superior) / azul (cuarto) / rojo (cuarto, abajo)
- **USDT:** círculo verde `#26A17B` con letra "T" blanca (logo Tether). Sin mención de TRC20.

---

## 2. Componentes y estados

### 2.1 Pill de país

| Estado | Borde | Fondo | Texto | Cuándo |
|---|---|---|---|---|
| Default | 0.5px `--color-border-tertiary` | blanco | primary | Pill no seleccionada, método activo |
| Hover (desktop) | 0.5px `--color-border-secondary` | blanco | primary | Mouse encima |
| Focus (keyboard) | 2px `--color-border-info` | blanco | primary | Tab nav |
| Seleccionada | 2px `#185FA5` | `#E6F1FB` | `#0C447C`, weight 500 | Click anterior, persistida |
| Pressed (touch) | igual default + scale(0.97) 100ms | — | — | Tap activo |
| Desactivada | 0.5px `--color-border-tertiary`, opacity 0.4 | blanco, opacity 0.4 | tertiary, opacity 0.4 | Admin desactivó el método |

**Pill USDT:** muestra logo Tether (círculo verde con T blanca) + texto "USDT". NO se muestra "TRC20" ni ninguna red. Detalle del método (Binance Pay) se ve recién en panel 3.

**Estado desactivada:** aplica cuando admin desactiva el método de pago desde Centro de configuración → Métodos de pago. **Click sobre pill desactivada** dispara el cajón amarillo dentro de la card oscura con el mensaje configurable (ver §2.2 estado "USDT pausado"). NO hay tooltip al hover.

### 2.2 Card "ESTIMADO · EN VIVO"

Card oscura (#2C2C2A) con texto blanco/gris. Múltiples estados según data y contexto:

| Estado | Trigger | Apariencia |
|---|---|---|
| Cargando | Al cargar el panel antes de tener tasa | Dot gris (sin animación), texto "Calculando…", barra skeleton gris |
| Default fiat | Pill país fiat seleccionada + tasa cargada | Dot verde pulsante (1.4s loop), monto en moneda local 30px (26px mobile), sub-línea "≈ X USDT" con logo Tether mini |
| Default USDT | Pill USDT seleccionada | Dot verde pulsante, monto en USDT 30px (26px mobile), sub-línea oculta (no hay conversión) |
| Tasa no disponible | Admin no cargó tasa en Centro de configuración | Dot rojo (sin animación), texto "Tasa no disponible, contactá soporte" en color rojo claro, sin monto |
| Precio fuera de rango | Cost unitario configurado fuera 0.5–100 USDT (error config) | Banner amarillo arriba "Configuración incorrecta, contactá soporte". Sin monto |
| Cambio de tasa | Admin actualizó la tasa mientras cliente estaba en el panel | Cajón amarillo arriba "El tipo de cambio cambió, monto actualizado" + monto actualizado al nuevo valor abajo. Cajón desaparece solo a los 15 segundos. |
| USDT pausado | Cliente clickeó pill USDT desactivada | Cajón amarillo arriba con mensaje configurable ("USDT pausado por mantenimiento" como ejemplo). Cajón desaparece solo a los 4 segundos. Card sigue mostrando el monto del último país fiat seleccionado. |

**Cajones amarillos unificados:** los avisos "Cambio de tasa" y "USDT pausado" usan el mismo estilo visual (banner amarillo `#FAEEDA` con texto `#633806`, dentro de la card oscura, arriba del monto). Diferencias: duración (15s vs 4s) y trigger (admin vs click del cliente). **Si los dos eventos coinciden temporalmente, prevalece el primero que se disparó.** El segundo evento aplica su lógica funcional pero su cajón NO se muestra hasta que el primero termine su duración.

---

## 3. Edge cases

1. **Cliente entra al panel con login activo, sin pill recordada en localStorage.** El país se preselecciona desde el perfil del cliente registrado. NO se usa detección por IP. Si el perfil no tiene país declarado, ninguna pill seleccionada → card en estado "Cargando" hasta que toque alguna pill, después estado "Default".

2. **Cliente entra al panel con pill recordada.** Esa pill prevalece sobre la del perfil. Card pasa directo al estado "Default" con monto.

3. **Tasa de cambio no cargada en Centro de configuración.** Card pasa a estado "Tasa no disponible". Pills siguen seleccionables. NO hay botón "Reintentar" porque no se llama a fuente externa.

4. **Cliente selecciona USDT.** No hay conversión. Card muestra monto directo en USDT, sin sub-línea "≈".

5. **Cliente toca pill desactivada.** Aparece cajón amarillo dentro de la card oscura ("USDT pausado por mantenimiento" o el mensaje custom que cargó admin). Dura 4 segundos. La pill no se selecciona, el monto no cambia. Si el cliente toca varias veces seguidas, el contador se reinicia.

6. **Cost unitario configurado fuera del rango 0.5–100 USDT** (error de config admin). Card muestra error "Configuración incorrecta, contactá soporte". Esto **no debería pasar en producción**. (Pendiente investigar empíricamente cuándo y por qué falló alguna vez — ver HANDOFF, "Hallazgo sesión 10".)

7. **Cliente recarga la pantalla.** Estado se reconstruye desde la última pill elegida (localStorage). Si nunca eligió pill, vuelve a la del perfil. Card recarga la tasa desde el backend.

8. **Admin desactiva un método** mientras el cliente está mirando. Pill correspondiente cambia a desactivada **en vivo** sin recargar (vía SSE). Si la pill estaba seleccionada por el cliente, queda deseleccionada y la card vuelve a "Cargando" hasta que el cliente toque otra pill.

9. **Admin actualiza la tasa** mientras el cliente está mirando. Aparece cajón amarillo "El tipo de cambio cambió, monto actualizado" durante 15 segundos. El monto se actualiza al nuevo valor inmediatamente.

10. **Admin desactiva pill seleccionada Y actualiza tasa simultáneamente** (caso raro). Cada evento aplica su lógica funcional (la pill se deselecciona, la tasa se actualiza). Pero el cajón amarillo visible es solo el del **primer evento que se disparó**; el segundo cajón no se superpone hasta que termine la duración del primero.

11. **Cliente sin conexión a internet.** El panel igual carga (la tasa se sirve desde el backend del propio sitio, no desde fuente externa). Si la conexión SSE se cae, no se actualizan en vivo los cambios admin pero el panel sigue funcional con los datos que tenía. Indicador "Sin conexión, intentando reconectar…" se muestra en la sección Mis órdenes (no en este panel).

12. **Texto largo en pill.** No aplica — los nombres de los 5 países son cortos (≤8 caracteres).

13. **Cliente cambia de pill después de subir comprobante.** No puede. Los paneles 1, 2 y 3 están **congelados** mientras hay comprobante en revisión. Click sobre pills no hace nada visual. El comportamiento de congelado se documenta en la spec del panel 3.

---

## 4. Responsive

### 4.1 Mobile (<768px)

- Panel ocupa el ancho disponible del stack vertical de paneles. Ancho típico ~340px (depende del padding de la pantalla principal cliente).
- Padding interno: `1.25rem 1rem` (vertical, horizontal).
- Pills en layout 3 + 2 con gap 6px.
- Pills: padding `8px 6px`, font-size 12px, banderas 12×12.
- Card "ESTIMADO": padding `14px 16px`, monto principal 26px.

### 4.2 Tablet y desktop (≥768px)

- Panel es **una columna** dentro de la fila horizontal de 4 paneles paralelos. Ancho aproximado 400px (ajustable según ancho total de pantalla).
- Padding interno: `1.25rem 1.5rem`.
- Pills en layout 3 + 2 con gap 8px.
- Pills: padding `9-10px`, font-size 13px, banderas 14×14.
- Card "ESTIMADO": padding `14px 16px`, monto principal 30px.

### 4.3 Pregunta cerrada de v1.1

La OQ-#5 de v1.1 ("¿desktop tiene sidebar de estado de orden o full-width?") **queda cerrada** por el modelo de pantalla principal: en desktop, el panel 1 deja de ser pantalla independiente y pasa a ser una columna dentro de la pantalla principal. No hay sidebar separada. Mis órdenes ocupa el ancho completo abajo. Decisión cerrada en sesión 11, traducción concreta a este archivo en sesión 13.

---

## 5. Comportamiento

| Acción | Resultado |
|---|---|
| Click en pill no seleccionada (activa) | Pill pasa a seleccionada, las otras vuelven a default. Card actualiza monto en <200ms. La elección se guarda en localStorage como "última pill" |
| Click en pill ya seleccionada | No-op. Sin feedback visual |
| Click en pill desactivada | No-op de selección. Aparece cajón amarillo dentro de la card oscura con el mensaje configurable. Dura 4 segundos. Si el cliente toca varias veces, el contador se reinicia |
| Hover sobre pill desactivada (desktop) | No-op. NO hay tooltip al hover. (Cambio respecto a v1.1.) |
| Click en card "ESTIMADO" | No-op. Display only |
| Cierre de navegador | Última pill elegida queda persistida en localStorage |
| Recarga de página | Recupera última pill elegida. Recarga tasa desde el backend. Si nunca eligió pill, fallback al país del perfil |
| Admin actualiza tasa en Centro de configuración | Vía SSE, cliente recibe nueva tasa. Aparece cajón amarillo "El tipo de cambio cambió, monto actualizado" en la card. Dura 15 segundos. El monto se actualiza inmediatamente |
| Admin desactiva un método | Vía SSE, pill cambia a desactivada en vivo. Si era la pill seleccionada, queda deseleccionada y card vuelve a "Cargando" |
| Tab keyboard nav | Tab order: pill 1 → pill 2 → … → pill 5. (No hay botón Continuar; el tab sale del panel hacia el panel 2 según orden de paneles.) |
| Enter sobre pill con focus | Selecciona la pill |
| Touch en mobile | Tap da feedback `scale(0.97)` 100ms |
| Paneles 1-2-3 congelados (comprobante en revisión en panel 3) | Pills pierden la capacidad de recibir clicks. Sin cambio visual (sin opacity, sin overlay, sin cursor especial). El cliente no puede alterar la selección hasta que el comprobante se valide o se rechace. |

**Sincronización en vivo:** los cambios admin (tasa, desactivar método) se propagan al cliente vía SSE (`/api/portal/orders/events` o canal equivalente). NO hay polling externo.

**Persistencia de pill seleccionada:** se guarda en `localStorage` con clave `lastSelectedPill`. Estructura sugerida:

```json
{ "lastSelectedPill": "PE", "timestamp": "2026-05-03T..." }
```

El valor de `lastSelectedPill` debe coincidir con uno de los 5 códigos válidos (`CO`, `MX`, `CL`, `PE`, `USDT`).

---

## 6. Datos

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

**País del perfil del cliente:** endpoint backend ya existente devuelve `customer.country`. Si está vacío, queda sin pill seleccionada (fallback final).

**Última pill elegida:** localStorage del cliente. Prevalece sobre el país del perfil cuando existe.

**Tasa de cambio USDT → moneda local (manual desde Centro de configuración):**

```json
{
  "USDT_COP": 4250.5,
  "USDT_MXN": 19.55,
  "USDT_CLP": 940.2,
  "USDT_PEN": 3.65,
  "lastUpdated": "2026-05-03T10:23:00Z",
  "updatedBy": "admin"
}
```

Cuando admin actualiza, se emite evento SSE al cliente para que actualice en vivo.

**Costo unitario en USDT (manual desde Centro de configuración):** valor entre 3.0 y 5.5 USDT. Mismo para los 5 destinos.

**Estado activo/desactivado de cada método (manual desde Centro de configuración):** estructura sugerida:

```json
[
  { "code": "CO",   "active": true },
  { "code": "MX",   "active": true },
  { "code": "CL",   "active": true },
  { "code": "PE",   "active": true },
  { "code": "USDT", "active": false, "customMessage": "USDT pausado por mantenimiento" }
]
```

Si `active: false`, la pill se muestra desactivada. `customMessage` es el texto que aparece en el cajón amarillo al click. Si está vacío, se muestra el default "No disponible temporalmente".

### 6.2 Datos que produce

A diferencia de v1.1, **este panel ya no genera un POST al click de "Continuar"** (no existe el botón). La selección de pill se persiste localmente (localStorage) y se incluye en el POST cuando el cliente sube el comprobante en el panel 3.

Lo que el panel expone hacia los otros paneles (vía estado compartido en frontend):

```json
{
  "selectedPill": "PE",
  "currency": "PEN",
  "estimatedAmountUsdt": 5.00,
  "estimatedAmountLocal": 18.25,
  "fxRate": 3.65
}
```

El panel 2 lee este estado para mostrar el subtotal, el panel 3 lo lee para mostrar el método de pago correspondiente.

### 6.3 Validaciones

**Frontend (durante interacción):**

- `selectedPill` debe estar en la lista de 5 fijos.
- `estimatedAmountUsdt` entre 0.5 y 100 (rango razonable, fuera de eso = error de config).
- `fxRate > 0` si `selectedPill !== 'USDT'`.

**Backend (cuando se envía el comprobante en panel 3):**

- Re-validar todo lo del frontend (no confiar).
- Verificar que `selectedPill` no esté desactivado por configuración admin al momento del envío.
- Verificar que `fxRate` enviado por el frontend coincide con la tasa actual del backend (anti-manipulación). Sin tolerancia ±2% — la tasa la define admin manualmente, debe coincidir exactamente.
- Si validación falla, devolver 400 con código de error específico (ej: `FX_OUTDATED`, `COUNTRY_DEACTIVATED`, `AMOUNT_OUT_OF_RANGE`).

---

## 7. Acceptance criteria

Lista para verificar implementación. Cada ítem debería ser un test (manual o automático).

**Layout y estilo:**

1. Las 5 pills aparecen en orden Perú, USDT, México (fila 1), Colombia, Chile (fila 2).
2. La fila 2 deja un espacio vacío del ancho de una pill a la derecha.
3. Pills tienen `border-radius: 999px` (forma de píldora completa).
4. En mobile (<768px), pills tienen font-size 12px y banderas 12×12.
5. En desktop (≥768px), pills tienen font-size 13px y banderas 14×14.
6. Card "ESTIMADO" tiene fondo `#2C2C2A` y texto blanco/gris.
7. Dot verde tiene animación pulsante de 1.4s loop.
8. Monto principal de la card es 26px en mobile, 30px en desktop.
9. Pill USDT muestra logo Tether (círculo verde con T blanca) sin mención de TRC20.
10. Header del panel dice "Método de pago" sin numeración delante.
11. No existe botón "Continuar".

**Comportamiento — selección:**

12. Al cargar panel con pill anterior en localStorage, esa pill queda preseleccionada.
13. Al cargar panel sin pill en localStorage, queda preseleccionada la del perfil del cliente.
14. Al cargar panel sin pill ni perfil, ninguna pill seleccionada.
15. Click en pill cambia la selección y actualiza el card en <200ms.
16. Click en pill ya seleccionada no hace nada.
17. Selección de USDT oculta la sub-línea "≈ X USDT".
18. Selección de país fiat muestra "≈ X USDT" con logo Tether mini.
19. Cada selección se guarda en localStorage como "última pill".

**Comportamiento — desactivación:**

20. Click en pill desactivada NO la selecciona.
21. Click en pill desactivada dispara el cajón amarillo "USDT pausado por mantenimiento" (o el mensaje custom configurado por admin).
22. El cajón amarillo aparece dentro de la card oscura, arriba del monto.
23. El cajón amarillo dura 4 segundos y desaparece solo.
24. Click repetido en pill desactivada reinicia el contador de 4 segundos.
25. Hover sobre pill desactivada (desktop) NO dispara nada.

**Comportamiento — actualización en vivo:**

26. Admin actualiza tasa en Centro de configuración: cliente ve cajón amarillo "El tipo de cambio cambió, monto actualizado" + monto actualizado, **sin recargar**.
27. Cajón amarillo de cambio de tasa dura 15 segundos y desaparece solo.
28. Admin desactiva un método: cliente ve la pill cambiar a desactivada **sin recargar**. Si la pill estaba seleccionada, queda deseleccionada y card vuelve a "Cargando".

**Resiliencia:**

29. Si la tasa no está cargada en Centro de configuración, card muestra "Tasa no disponible, contactá soporte".
30. Recarga de página: estado recuperado de localStorage + tasa recargada del backend.
31. Si SSE se cae, panel sigue funcionando con los datos cargados pero NO recibe actualizaciones en vivo.

**Accesibilidad:**

32. Tab order: pill 1 → pill 2 → pill 3 → pill 4 → pill 5.
33. Enter sobre pill con focus: selecciona.
34. Pills tienen `aria-pressed` que refleja estado de selección.
35. Pills desactivadas tienen `aria-disabled="true"`.
36. Card en estado error tiene `role="alert"` (lectores de pantalla anuncian).
37. Cajón amarillo de cambio de tasa tiene `role="status"` (no `alert`, es solo informativo).
38. Cajón amarillo de USDT pausado tiene `role="status"`.

---

## 8. Open questions

**Estado al cierre de sesión 13:** las 8 OQ originales del archivo v1.1 quedaron cerradas (las #1-#4, #6-#8 en sesión 10; la #5 en sesiones 11-13). Las 3 OQ-residuales identificadas en sesión 13 también se cerraron en la misma sesión.

### OQ-residuales (sesión 13) — TODAS CERRADAS

**OQ-R1 — ¿Qué pasa si los dos cajones amarillos se quieren mostrar a la vez?** ✅ CERRADA

Decisión de Bryam: **prevalece el primero que se disparó**. El segundo cajón no se superpone hasta que el primero termine su duración. La lógica funcional del segundo evento sí se aplica (la pill se desactiva o la tasa se actualiza), solo el cajón visual queda descartado durante la duración del primero.

**OQ-R2 — ¿Cómo se ve visualmente "panel congelado"?** ✅ CERRADA

Decisión de Bryam: **el panel pierde la capacidad de recibir clicks, sin cambio visual**. No hay opacity reducida, ni overlay, ni cursor especial. La spec del panel 3 puede agregar indicadores adicionales si los necesita, pero por defecto este panel no se ve distinto cuando está congelado.

**OQ-R3 — ¿Mensaje default cuando admin desactiva sin texto custom?** ✅ CERRADA

Decisión de Bryam: el texto default "No disponible temporalmente" sirve. Se mantiene como fallback cuando admin desactiva una pill sin escribir mensaje custom.

### OQ heredadas (no de este panel)

**OQ-H1 — Validación de precio que falló (hallazgo sesión 10).** Pendiente investigar empíricamente cuándo falló la validación de rango 0.5–100 USDT y por qué. No bloquea esta spec pero sí la implementación si vuelve a ocurrir.

---

## Changelog

- **paso-1-precio.md v1.0** (2026-05-02) — Spec inicial como pantalla independiente.
- **paso-1-precio.md v1.1** (2026-05-03, sesión 10) — 7 de 8 OQ cerradas. Tasa manual, costo 3.0–5.5 USDT, persistencia última pill, USDT sin TRC20, etc.
- **panel-1-metodo-de-pago.md v2.0** (2026-05-03, sesión 13) — Reescribe v1.1 como spec de panel dentro de pantalla principal cliente. Cambios respecto a v1.1:
  - Archivo renombrado de `paso-1-precio.md` a `panel-1-metodo-de-pago.md`.
  - Sin botón "Continuar" (el modelo de paneles paralelos no tiene "avanzar").
  - Sin numeración delante del título ("PASO 1 / 4" eliminado).
  - Pills con banderas circulares reales (antes solo nombre + logo Tether).
  - Pills con `border-radius: 999px` (antes radius medio rectangular).
  - Orden nuevo: Perú · USDT · México (fila 1), Colombia · Chile (fila 2). v1.1 tenía Colombia · México · Chile (arriba), Perú · USDT (abajo).
  - Sin candado visible (decisión sesión 11 mantenida).
  - Tooltip de pill desactivada → cajón amarillo dentro de la card oscura, mismo lugar que el de cambio de tasa. Antes era un tooltip flotante debajo de la pill.
  - Tooltip aparece **solo al click** (no al hover). En v1.1 era hover.
  - Cajón amarillo de cambio de tasa dura **15 segundos** y se va solo. Definición nueva.
  - Cajón amarillo de USDT pausado dura **4 segundos** y se va solo. Definición nueva.
  - Mensaje default del tooltip cambiado en mockup a "USDT pausado por mantenimiento" (era "USDT vuelve mañana 9 AM").
  - Pregunta #5 de v1.1 (vista desktop) cerrada por el modelo de pantalla principal.
  - Datos: el panel ya no hace POST. La selección queda en estado compartido frontend, se envía cuando el cliente sube comprobante en panel 3.
  - 3 OQ-residuales identificadas y cerradas en la misma sesión 13: OQ-R1 (prevalece el primer cajón amarillo cuando dos eventos coinciden), OQ-R2 (panel congelado pierde clicks sin cambio visual), OQ-R3 (mensaje default "No disponible temporalmente" se mantiene).
