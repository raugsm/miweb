# Panel 2 — Solicitud

**Versión:** 1.3 · **Fecha:** 5 de mayo 2026 · **Estado:** spec formal con las 9 piezas. v1.3 cambia los beneficios por volumen para descontar solo sobre la ganancia objetivo y proteger el piso público `costo interno + 0.60 USDT`.

**Reemplaza a:** no había spec previa. Hereda algunas decisiones tipográficas del HANDOFF línea 580 ("paso 2: stepper -/n/+ con label 'Equipos a desbloquear', total en card oscura, insignia verde 98%, validación modelo opcional").

---

## Contexto

Es el **panel 2 de los 4 paneles paralelos** que componen la pantalla principal cliente. Define cuántos equipos quiere desbloquear el cliente en este pedido, y opcionalmente qué modelo específico (para validar soporte preventivamente).

El panel 2 calcula el total del pedido multiplicando la cantidad por el costo unitario que viene del panel 1 (depende del país/moneda elegido).

**Audiencia:** técnico de tienda. Suele recibir 1-3 equipos a la mano (pedido típico). Casos esporádicos de pedidos grandes (10+ equipos) se canalizan vía WhatsApp con Bryam.

**Posición en el flow:** columna 2 de la fila horizontal de paneles paralelos (desktop) o segundo panel del stack vertical (mobile). El cliente puede saltearlo si la cantidad por defecto (2) le sirve, o ajustarlo antes de pasar al panel 3.

---

## 1. Mockup visual

**Estado del mockup:** decisiones visuales validadas en sesión 13 con mockups en chat. Archivo HTML standalone se entrega en sesión 14 como parte de los mockups consolidados de la pantalla principal.

### Estructura visual (desktop ~400px de ancho, mobile ~340px)

De arriba hacia abajo:

1. **Header:** título "Solicitud" en 16px, weight 500. Sin numeración.
2. **Stepper "Equipos a desbloquear":** botón −, número editable a mano, botón +. El número grande (32px desktop, 28px mobile) en el centro, botones cuadrados de 36×36 (34×34 mobile) a los costados.
3. **Input "Modelo (opcional)":** campo de texto con placeholder "ej: Redmi Note 13". Border verde (con check verde dentro) si el modelo es válido. Border rojo (sin íconos) si el modelo no es soportado o no se reconoce.
4. **Card oscura "TOTAL":** label TOTAL en gris claro, monto principal grande (30px desktop, 26px mobile), conversión "≈ X USDT" abajo, breakdown "N equipos × S/ Y.YY" separado por línea fina.
5. **Insignia verde "98% de modelos soportados":** pill verde claro al pie del panel, con check verde adelante.

### Avisos dentro de la card oscura

Cuando aplica, aparece un cajón pegado arriba del label TOTAL, dentro de la card oscura. Hay dos colores de cajón:

**Amarillo** (`#FAEEDA` con texto `#633806`): para validación negativa del modelo.
- "Este modelo no es soportado" → el modelo escrito está en la lista de los 5 no soportados.
- "No reconocemos el modelo, revisalo o dejalo vacío" → palabra al azar o nombre que no coincide con catálogo ni con la lista de no soportados.

**Verde** (`#EAF3DE` con texto `#27500A` + ícono WhatsApp): para cantidad excedida.
- "Para más de 10 equipos, contactanos por WhatsApp" → el cliente tipeó un número mayor a 10 (el sistema ya lo limitó a 10 visualmente).

### Código HTML del mockup default (desktop, cantidad 2, modelo vacío)

```html
<div style="width: 400px; background: var(--color-background-primary); border: 0.5px solid var(--color-border-secondary); border-radius: var(--border-radius-lg); padding: 1.25rem 1.5rem;">

  <h3 style="font-size: 16px; font-weight: 500; margin: 0 0 1.25rem;">Solicitud</h3>

  <div style="margin-bottom: 1rem;">
    <p style="font-size: 12px; color: var(--color-text-secondary); margin: 0 0 8px; font-weight: 500;">Equipos a desbloquear</p>
    <div style="display: flex; align-items: center; justify-content: center; gap: 16px;">
      <button style="36x36 border 0.5px secondary, fondo blanco, borde radio md">−</button>
      <input type="text" inputmode="numeric" value="2" style="32px weight 500, sin border, sin background, centro, ancho 56px" />
      <button style="36x36 border 0.5px secondary">+</button>
    </div>
  </div>

  <div style="margin-bottom: 1rem;">
    <p style="font-size: 12px; ...">Modelo (opcional)</p>
    <input type="text" placeholder="ej: Redmi Note 13" style="width 100%, border 0.5px tertiary" />
  </div>

  <div style="background: #2C2C2A; border-radius: md; padding: 14px 16px;">
    <div style="font-size: 10px; uppercase; color: #B4B2A9;">Total</div>
    <div style="font-size: 30px; weight 500; color: white;">S/ 36.50</div>
    <div style="font-size: 12px; color: #B4B2A9;">≈ 10.00 USDT [logo Tether mini]</div>
    <div style="font-size: 11px; color: #888780; border-top fino;">2 equipos × S/ 18.25</div>
  </div>

  <div style="background: #EAF3DE; border-radius: 999px; padding: 8px 12px;">
    <span>[check verde] 98% de modelos soportados</span>
  </div>
</div>
```

(Bloques abreviados con descripción de estilos. El HTML standalone completo se entrega en sesión 14.)

---

## 2. Componentes y estados

### 2.1 Stepper "Equipos a desbloquear"

Tres elementos: botón −, input numérico editable, botón +.

**Botón − (menos):**

| Estado | Apariencia |
|---|---|
| Default | Border 0.5px `--color-border-secondary`, fondo blanco, texto primary, cursor pointer |
| Hover (desktop) | Fondo `--color-background-secondary` |
| Pressed | Scale(0.97) 100ms |
| Desactivado (cantidad = 1) | Border 0.5px `--color-border-tertiary`, opacity 0.4, texto tertiary, sin cursor |

**Input numérico (centro):**

- Tipo `text` con `inputmode="numeric"` para mostrar teclado numérico en mobile.
- Sin border, sin background, weight 500, font-size 32px (desktop) o 28px (mobile).
- Ancho fijo 56px (desktop) o 50px (mobile), centrado.
- Editable a mano (cliente puede tipear directamente).
- Cap automático: si el cliente tipea cualquier valor > 10, el sistema lo limita a 10 al perder foco o al apretar Enter, y dispara el aviso verde de WhatsApp.
- Cap automático también si tipea < 1 (vuelve a 1).
- Si el input queda vacío al perder foco, vuelve a 1.

**Botón + (más):**

| Estado | Apariencia |
|---|---|
| Default | Border 0.5px `--color-border-secondary`, fondo blanco, cursor pointer |
| Hover (desktop) | Fondo `--color-background-secondary` |
| Pressed | Scale(0.97) 100ms |
| Desactivado (cantidad = 10) | Border 0.5px `--color-border-tertiary`, opacity 0.4, texto tertiary, sin cursor |

### 2.2 Input "Modelo (opcional)"

Campo de texto con placeholder "ej: Redmi Note 13". El borde y el contenido cambian según validación:

| Estado | Trigger | Apariencia |
|---|---|---|
| Vacío | Sin texto escrito | Border 0.5px `--color-border-tertiary`, sin íconos |
| Apto | Modelo coincide con catálogo Xiaomi soportado | Border 0.5px `#639922` (verde), check verde dentro a la derecha |
| No soportado | Modelo coincide con uno de los 5 modelos no soportados (o sus codenames) | Border 0.5px `#A32D2D` (rojo), sin íconos. Aviso amarillo "Este modelo no es soportado" en la card oscura |
| No reconocido | Texto escrito no coincide con catálogo ni con la lista de no soportados | Border 0.5px `#A32D2D` (rojo), sin íconos. Aviso amarillo "No reconocemos el modelo, revisalo o dejalo vacío" en la card oscura |

**Lista de los 5 modelos no soportados** (a confirmar codenames con Claude Code al cierre de sesión 13, ya están en el código):

- A3
- A3X
- A2
- Redmi Note 12S
- A5

Cada uno tiene **nombres comerciales** y **codenames internos**. El sistema debe reconocer ambas formas para considerar un modelo "no soportado". Por ejemplo, si "Redmi Note 12S" tiene codename interno "tapas", escribir "tapas" debe disparar el aviso "Este modelo no es soportado".

**Importante:** ninguno de los estados de validación bloquea el flujo. El cliente puede pasar al panel 3 con modelo no soportado, no reconocido, o vacío. Los avisos son informativos.

### 2.3 Card oscura "TOTAL"

Card oscura `#2C2C2A` con texto blanco/gris.

| Estado | Apariencia |
|---|---|
| Default | Label "TOTAL" en gris claro, monto en moneda local 30px (26px mobile), conversión "≈ X USDT" abajo, breakdown "N equipos × S/ Y.YY" |
| Con aviso amarillo (modelo no soportado) | Cajón amarillo arriba "Este modelo no es soportado". Total se mantiene visible abajo |
| Con aviso amarillo (modelo no reconocido) | Cajón amarillo arriba "No reconocemos el modelo, revisalo o dejalo vacío". Total se mantiene visible |
| Con aviso verde (cantidad >10) | Cajón verde arriba "Para más de 10 equipos, contactanos por WhatsApp" + ícono WhatsApp. Total visible abajo, calculado para 10 (el cap aplicado) |

**Si dos avisos quieren mostrarse a la vez** (ej: modelo no soportado + cantidad excedida): prevalece el primero que se disparó. El segundo aplica su lógica funcional pero su cajón no se muestra hasta que el primero termine su duración. (Misma regla que el panel 1.)

### 2.4 Insignia verde "98% de modelos soportados"

Pill verde claro siempre visible al pie del panel, en todos los estados. No cambia.

---

## 3. Edge cases

1. **Cliente entra al panel sin haber tocado nada antes.** Cantidad por defecto: 2. Modelo: vacío. Card "TOTAL" muestra `2 × monto unitario` del panel 1.

2. **Panel 1 sin pill seleccionada.** El panel 2 muestra cantidad y stepper igual, pero la card "TOTAL" no puede calcular el monto (no hay tasa). Decisión: card muestra texto "Elegí un método de pago primero" en vez del monto. Total se reactiva cuando el cliente toca una pill en el panel 1.

3. **Cliente tipea valor mayor a 10.** El sistema fuerza el valor a 10 al perder foco (o al apretar Enter). Aparece el aviso verde de WhatsApp. Botón + queda desactivado. Botón − sigue activo.

4. **Cliente tipea valor menor a 1 (incluyendo 0 o negativo).** El sistema fuerza el valor a 1. Sin aviso especial.

5. **Cliente borra el input numérico** (queda vacío). Al perder foco, el sistema vuelve el valor a 1.

6. **Cliente tipea letras o caracteres no numéricos.** El input acepta solo dígitos (atributo `inputmode="numeric"` + filtrado JS). Caracteres no numéricos se ignoran al tipear.

7. **Cliente escribe modelo en mayúsculas, minúsculas o con espacios extra.** La validación normaliza el texto antes de comparar contra el catálogo (lowercase, trim de espacios). "  REDMI note 12s  " coincide con "Redmi Note 12S".

8. **Cliente escribe modelo en orden distinto al catálogo** (ej: "Note 13 Redmi"). NO coincide. Cae en estado "no reconocido" hasta que escriba el orden correcto.

9. **Cliente escribe modelo soportado y luego cambia la cantidad.** El estado del modelo se mantiene válido. El total se recalcula con la nueva cantidad.

10. **Cliente escribe modelo soportado, lo borra, escribe un modelo no soportado.** El borde del input pasa de verde a sin color (mientras escribe) y luego a rojo cuando coincide con la lista. El check verde desaparece y aparece el aviso amarillo.

11. **Cliente escribe modelo no soportado y luego corrige al modelo válido.** El aviso amarillo desaparece **antes** de los 15 segundos de duración (la corrección es trigger explícito de cierre).

12. **Admin agrega o quita modelos de la lista de no soportados** (futuro, vía Centro de configuración). El cliente debería ver el cambio en vivo vía SSE. Comportamiento exacto se define cuando se haga la spec del Centro de configuración (sub-sección "Catálogo de equipos" o "Modelos no soportados").

13. **Paneles 1-2-3 congelados** (comprobante en revisión en panel 3). El stepper, el input de modelo y la edición pierden la capacidad de recibir clicks/escritura. Sin cambio visual (sin opacity, sin overlay). El cliente no puede modificar la cantidad ni el modelo hasta que el comprobante se valide o se rechace.

14. **Cliente tipea cantidad excedida y al mismo tiempo escribe modelo no soportado.** Los dos eventos disparan sus cajones (verde y amarillo). Se muestra solo el primero que se disparó; el segundo aplica su lógica funcional pero su cajón queda descartado hasta que el primero termine.

---

## 4. Responsive

### 4.1 Mobile (<768px)

- Panel ocupa el ancho disponible del stack vertical de paneles. Ancho típico ~340px.
- Padding interno: `1.25rem 1rem`.
- Header 16px (igual que desktop).
- Stepper: botones 34×34, número 28px, ancho del input 50px, gap 14px entre elementos.
- Input modelo: padding `9px 12px`, font-size 13px.
- Card "TOTAL": padding `14px 16px`, monto principal 26px.
- Insignia verde: igual.

### 4.2 Tablet y desktop (≥768px)

- Panel es **una columna** dentro de la fila horizontal de 4 paneles paralelos. Ancho ~400px.
- Padding interno: `1.25rem 1.5rem`.
- Stepper: botones 36×36, número 32px, ancho del input 56px, gap 16px.
- Input modelo: padding `9px 12px`, font-size 13px.
- Card "TOTAL": padding `14px 16px`, monto principal 30px.

---

## 5. Comportamiento

| Acción | Resultado |
|---|---|
| Click en − (cantidad > 1) | Cantidad baja en 1. Total se recalcula. Si cantidad pasa de 1, botón − se desactiva |
| Click en − (cantidad = 1) | No-op. Botón está desactivado |
| Click en + (cantidad < 10) | Cantidad sube en 1. Total se recalcula. Si cantidad llega a 10, botón + se desactiva |
| Click en + (cantidad = 10) | No-op. Botón está desactivado |
| Tipeo en input numérico | Cliente puede escribir cualquier número entero. Cap automático aplica al perder foco o Enter |
| Tipeo de valor > 10 | Sistema vuelve la cantidad a 10. Aparece cajón verde "Para más de 10 equipos, contactanos por WhatsApp" en la card oscura. Dura 15 segundos o desaparece si cliente baja la cantidad por debajo de 10 |
| Tipeo de valor < 1 (incl. 0) | Sistema vuelve la cantidad a 1. Sin aviso |
| Input numérico vacío al perder foco | Sistema vuelve la cantidad a 1 |
| Tipeo en input modelo | Validación en tiempo real (debounce ~300ms): compara el texto contra el catálogo soportado y la lista de no soportados |
| Modelo coincide con catálogo válido | Border del input pasa a verde, check verde aparece dentro |
| Modelo coincide con uno de los 5 no soportados (o sus codenames) | Border del input pasa a rojo. Cajón amarillo "Este modelo no es soportado" en la card oscura, dura 15 segundos o desaparece si cliente corrige |
| Modelo no coincide con nada | Border del input pasa a rojo. Cajón amarillo "No reconocemos el modelo, revisalo o dejalo vacío" en la card oscura, misma duración |
| Cliente borra el modelo | Border del input vuelve a default (gris). Cajón amarillo desaparece |
| Cliente cambia cantidad después de tener modelo válido | Total se recalcula. Estado del modelo se mantiene |
| Recarga de página | Cantidad y modelo se resetean a default (cantidad 2, modelo vacío). NO se persisten en localStorage. (Decisión nueva: el panel 1 sí persiste pill, el panel 2 no persiste cantidad ni modelo porque dependen del pedido específico.) |
| Paneles 1-2-3 congelados | Stepper y input modelo no responden a clicks/escritura. Sin cambio visual |

**Sincronización en vivo:** los cambios en la lista de modelos no soportados (futuros, vía Centro de configuración) se propagan al cliente vía SSE. Comportamiento exacto a definir en spec del Centro de configuración.

**Validación del modelo (debounce):** ~300ms después de la última tecla, el sistema compara el texto contra los catálogos. Esto evita parpadeo durante el tipeo.

**Estado compartido frontend:** el panel 2 expone su estado a los otros paneles (sin POST al backend hasta que panel 3 envíe el comprobante).

---

## 6. Datos

### 6.1 Datos que necesita (inputs)

**Estado del panel 1:**

```json
{
  "selectedPill": "PE",
  "currency": "PEN",
  "estimatedAmountUsdt": 5.00,
  "estimatedAmountLocal": 18.25,
  "fxRate": 3.65
}
```

Si `selectedPill` es null, el panel 2 muestra "Elegí un método de pago primero" en vez del monto.

**Catálogo de modelos Xiaomi soportados:** lista mantenida en backend (en código fuente o en archivo de configuración). Sirve para validar el input modelo.

**Lista de los 5 modelos no soportados (con codenames):**

```json
[
  { "commercialName": "A3",                "codenames": ["blue"] },
  { "commercialName": "A3X",               "codenames": ["klein"] },
  { "commercialName": "A2",                "codenames": ["water"] },
  { "commercialName": "Redmi Note 12S",    "codenames": ["sea", "ocean"] },
  { "commercialName": "A5",                "codenames": ["serenity"] }
]
```

Codenames confirmados por Bryam según conocimiento del producto. Estado actual del backend: `klein` (A3X), `serenity` (A5), `sea` y `ocean` (Note 12S) ya están registrados como aliases en `server/config/catalog.js#frpEligibilityCatalog`. Los codenames `blue` (A3) y `water` (A2) NO están registrados en el código todavía — ver OQ-R3 en §9.

### 6.2 Datos que produce

A diferencia de un flow lineal, el panel 2 **no hace POST** al cambiar de panel. La cantidad y el modelo quedan en estado compartido frontend, se envían al backend cuando el cliente sube el comprobante en el panel 3.

Estado compartido que el panel 2 expone:

```json
{
  "quantity": 2,
  "deviceModel": "Redmi Note 13",
  "modelValidation": "apto" | "not_supported" | "not_recognized" | null,
  "totalUsdt": 10.00,
  "totalLocal": 36.50
}
```

`modelValidation` es null si el input está vacío.

### 6.3 Validaciones

**Frontend (durante interacción):**

- `quantity` entero entre 1 y 10. Si el cliente intenta más, sistema fuerza a 10 + dispara aviso.
- `quantity` no puede ser 0, negativo, ni vacío. Sistema fuerza a 1 si pasa.
- `deviceModel` opcional. Validación es informativa, no bloquea.

**Backend (cuando panel 3 envía el comprobante):**

- Re-validar `quantity` (entero entre 1 y 10).
- Re-validar que `totalLocal` y `totalUsdt` coincidan con el cálculo `quantity × estimatedAmountLocal` y `quantity × estimatedAmountUsdt` respectivamente.
- `deviceModel` se acepta tal como viene (puede ser apto, no soportado, no reconocido o vacío). El backend registra `modelValidation` para que el operador lo vea.
- Si el modelo es "no soportado", el operador puede comunicarse con el cliente vía WhatsApp para clarificar.

---

## 7. Acceptance criteria

**Layout y estilo:**

1. Header dice "Solicitud" sin numeración delante.
2. Stepper se compone de 3 elementos: botón −, input numérico editable, botón +.
3. Botones del stepper son cuadrados con border-radius medio.
4. Input numérico del stepper no tiene border ni background visible.
5. En desktop, número grande es 32px y botones 36×36. En mobile, 28px y 34×34.
6. Input "Modelo (opcional)" tiene placeholder "ej: Redmi Note 13".
7. Card "TOTAL" tiene fondo `#2C2C2A` y texto blanco/gris.
8. Insignia "98% de modelos soportados" siempre visible al pie, fondo verde claro.
9. No existe botón "Continuar".

**Comportamiento — stepper:**

10. Al cargar el panel, cantidad por defecto es 2.
11. Click en − cuando cantidad > 1: baja la cantidad en 1.
12. Click en − cuando cantidad = 1: no hace nada (botón desactivado visualmente).
13. Click en + cuando cantidad < 10: sube la cantidad en 1.
14. Click en + cuando cantidad = 10: no hace nada (botón desactivado visualmente).
15. Cliente puede tipear en el input numérico (es editable a mano).
16. Si cliente tipea valor > 10, sistema lo limita a 10 al perder foco o Enter.
17. Si cliente tipea valor < 1 (incl. 0), sistema lo limita a 1.
18. Si cliente borra el input, sistema vuelve a 1 al perder foco.
19. Solo se aceptan dígitos en el input.

**Comportamiento — modelo:**

20. Modelo válido del catálogo: border verde + check verde dentro del input.
21. Modelo en lista de 5 no soportados (incluyendo codenames): border rojo, sin íconos, cajón amarillo "Este modelo no es soportado" en la card oscura.
22. Modelo no reconocido: border rojo, sin íconos, cajón amarillo "No reconocemos el modelo, revisalo o dejalo vacío" en la card oscura.
23. Modelo vacío: border default (gris), sin íconos, sin cajón.
24. Validación normaliza mayúsculas/minúsculas y espacios extra.
25. Validación no bloquea el flujo (el cliente puede pasar al panel 3 con cualquier estado).

**Comportamiento — avisos:**

26. Cajón amarillo de modelo no soportado o no reconocido dura 15 segundos o desaparece si el cliente corrige el modelo antes.
27. Cajón verde de cantidad excedida dura 15 segundos o desaparece si el cliente baja la cantidad por debajo de 10.
28. Si dos cajones quieren mostrarse a la vez, prevalece el primero que se disparó.

**Comportamiento — cálculo:**

29. Total en moneda local = cantidad × estimatedAmountLocal del panel 1.
30. Total en USDT = cantidad × estimatedAmountUsdt del panel 1.
31. Breakdown muestra "N equipo(s) × S/ Y.YY" con singular/plural correcto.
32. Si panel 1 no tiene pill seleccionada, card muestra "Elegí un método de pago primero" en vez del monto.

**Resiliencia:**

33. Recarga de página: cantidad vuelve a 2, modelo vuelve a vacío. NO se persisten.
34. Cantidad y modelo no se envían al backend hasta que el comprobante se sube en el panel 3.

**Accesibilidad:**

35. Tab order: botón − → input numérico → botón + → input modelo.
36. Botones desactivados tienen `aria-disabled="true"`.
37. Cajones amarillos tienen `role="status"` (informativo, no crítico).
38. Cajón verde de WhatsApp tiene `role="status"`.

---

## 8. Descuentos por volumen

### Modelo de pricing

El portal aplica descuentos automáticos por cantidad de equipos en una misma orden. Aplica a TODOS los clientes excepto los marcados como VIP (los VIP tienen su propio modelo de pricing, fuera del scope de esta spec).

### Tiers visibles al cliente

| Cantidad | Etiqueta mostrada | Tasa interna | Regla de precio |
|---|---|---|---|
| 1 equipo | "Precio normal" | 0% | `pricing.unitPrice` |
| 2-3 equipos | "Beneficio por 2-3 equipos" | 15% sobre ganancia | `costo interno + ganancia objetivo × 0.85` |
| 4-6 equipos | "Beneficio por 4-6 equipos" | 25% sobre ganancia | `costo interno + ganancia objetivo × 0.75` |
| 7-10 equipos | "Beneficio por 7-10 equipos" | 40% sobre ganancia | `costo interno + ganancia objetivo × 0.60` |

**Regla de contrato:** cantidad 1 SIEMPRE usa el mismo precio normal dinámico que se muestra en Costos FRP (`costo proveedor + ganancia objetivo`). No existe margen oculto de 1.50 USDT para cantidad 1. Los beneficios por volumen descuentan solo sobre la ganancia objetivo, nunca sobre el costo interno del proveedor ni sobre el precio total.

**Piso de protección:** el precio público por volumen nunca puede bajar de `costo interno + 0.60 USDT`. Ese piso queda por encima del precio VIP futuro (`costo interno + 0.50 USDT`) para que VIP conserve sentido comercial. Si la ganancia objetivo es demasiado baja y el piso no deja espacio para descuento real, el sistema mantiene el precio normal y no muestra beneficio.

### Tope de cantidad

El frontend mantiene el cap de 10 equipos por orden (decisión D3 de sesión 15). El backend sigue aceptando hasta 50 (no se cambia). Si un cliente necesita más de 10, el aviso verde "Para más de 10 contactanos por WhatsApp" lo direcciona al canal manual.

### Visualización en pantalla (panel 2)

**Card oscura "TOTAL":**
- Para cantidad = 1: SIN badge de descuento. Etiqueta debajo de la card dice "Precio normal".
- Para cantidad ≥ 2 con beneficio real: badge verde "Volumen" en la esquina superior derecha de la card oscura. Etiqueta debajo dice "Beneficio por X-Y equipos".
- El portal NO muestra "-X%" al cliente porque el porcentaje se aplica sobre ganancia, no sobre el total.
- El monto del breakdown ("X equipos × S/ N") usa el precio CON descuento, no el normal.

**Aviso de "1 más mejora tier" (debajo del stepper):**
- Cuando el cliente está exactamente en el límite superior de un tier (cantidad = 1, 3 o 6), aparece debajo del stepper un texto azul:
  - "Si sumás 1 más, mejorás el beneficio por volumen"
- Cantidad 7 a 10 → sin aviso (ya están en el mejor tier).
- El aviso desaparece automáticamente cuando el cliente cambia la cantidad.

### Cliente VIP

Si el cliente tiene flag VIP en su perfil:
- El portal NO muestra los descuentos por volumen estándar.
- El portal NO muestra badges ni avisos de tier.
- El precio mostrado es el de su modelo VIP particular (definido en backend por el operador).
- La feature de "clientes VIP" todavía no está habilitada en su totalidad — esta sección queda como referencia para la sesión que la complete.

---

## 9. Open questions

**Estado al cierre de sesión 13:** las decisiones principales del panel 2 quedaron cerradas. OQ-R1 cerrada con los codenames documentados en §6.1. Quedan 2 OQ-residuales abiertas (OQ-R2 y OQ-R3):

### OQ-residuales (sesión 13)

**OQ-R1 — Lista exacta de codenames de los 5 modelos no soportados.** ✅ CERRADA

Los nombres comerciales están confirmados (A3, A3X, A2, Redmi Note 12S, A5). Codenames confirmados por Bryam: `blue` (A3), `klein` (A3X), `water` (A2), `serenity` (A5), `sea` y `ocean` (Note 12S). Documentados en §6.1.

**OQ-R2 — Comportamiento del aviso verde de WhatsApp si el cliente sube y baja la cantidad varias veces.**

Hoy el aviso aparece cuando cliente tipea > 10. Si baja a 10 antes de los 15 segundos, el aviso desaparece. Pero ¿qué pasa si el cliente sube y baja varias veces seguidas? Decisión provisional: cada vez que se dispara, se reinicia el contador de 15 segundos. Pendiente confirmar comportamiento exacto cuando se haga el HTML standalone (sesión 14).

**OQ-R3 — Codenames `blue` (A3) y `water` (A2) ausentes del catálogo backend.**

El catálogo backend (`server/config/catalog.js#frpEligibilityCatalog`) hoy NO incluye los codenames `blue` (A3) ni `water` (A2). Solo tiene los aliases comerciales (`"redmi a3"`, `"a3"`, `"redmi a2"`, `"a2"`). Esto significa que un cliente que escriba "blue" o "water" en el input modelo del panel 2 no dispara hoy el match de "no soportado" — el helper `frpEligibilityResult` los clasifica como ambiguos/no reconocidos. Pendiente: agregar `"blue"` al array `aliases` de la entrada `redmi-a3` y `"water"` al array `aliases` de la entrada `redmi-a2` en `server/config/catalog.js`. Tarea de implementación dedicada (no de spec), a tomar antes del lanzamiento o en sesión específica de cleanup del catálogo de modelos.

### OQ heredadas

- **Política de modelos no soportados desde Centro de configuración (futuro).** ¿Admin puede agregar/quitar modelos de la lista? ¿Se propaga en vivo vía SSE? Cierre: spec del Centro de configuración (sub-sección a definir).

---

## Changelog

- **panel-2-solicitud.md v1.3** (2026-05-05, sesión 16) — Cambia beneficios por volumen: 2-3 descuenta 15% de la ganancia objetivo, 4-6 descuenta 25%, 7-10 descuenta 40%. El precio público nunca baja de `costo interno + 0.60 USDT`. El portal deja de mostrar "-X%" y muestra "Volumen" + "Beneficio por X-Y equipos" para evitar confundir porcentaje sobre ganancia con descuento sobre total.
- **panel-2-solicitud.md v1.2** (2026-05-05, sesión 16) — Corrige contrato de pricing dinámico: cantidad 1 = `pricing.unitPrice`; se elimina el margen oculto 1.50 USDT como precio normal. Los descuentos de volumen ahora se calculan desde el precio normal dinámico: 2-3 resta 0.15 USDT, 4-6 resta 0.25 USDT, 7-10 resta 0.40 USDT, con piso de costo interno para evitar venta por debajo del proveedor.
- **panel-2-solicitud.md v1.1** (2026-05-04, sesión 15) — Agrega §8 "Descuentos por volumen". Tiers: 1 equipo "Precio normal" (0%, margen 1.50 USDT) / 2-3 equipos −3% (margen 1.35) / 4-6 equipos −5% (margen 1.25) / 7-10 equipos −8% (margen 1.10). Regla de protección: el descuento nunca deja al operador por debajo de costo + 1 USDT. Visualización: badge verde con % en la esquina superior derecha de la card oscura "TOTAL" + etiqueta descriptiva debajo. Aviso "1 más mejora tier" debajo del stepper en cantidades 1, 3 y 6. Cliente VIP: pricing aparte, fuera de scope. Renumeración: la sección "Open questions" pasa de §8 a §9; cross-ref interno actualizado.
- **panel-2-solicitud.md v1.0** (2026-05-03, sesión 13) — Spec inicial completa con las 8 piezas. Decisiones tomadas en la sesión:
  - Header "Solicitud" sin numeración.
  - Cantidad por defecto: 2.
  - Cantidad mínima: 1 (botón − se desactiva).
  - Cantidad máxima: 10 (botón + se desactiva al llegar).
  - Input numérico del stepper editable a mano (no solo botones).
  - Cap automático: si cliente tipea > 10, sistema lo lleva a 10 y muestra aviso verde de WhatsApp.
  - Cap automático: si cliente tipea < 1 o vacío, sistema lo lleva a 1.
  - Solo dígitos aceptados en el input numérico.
  - Aviso verde "Para más de 10 equipos, contactanos por WhatsApp" con ícono WhatsApp, dura 15s o desaparece si baja a 10.
  - Input modelo opcional, 1 solo campo para todos los equipos del pedido.
  - 3 estados de validación de modelo: apto (border verde + check), no soportado (border rojo, aviso amarillo "Este modelo no es soportado"), no reconocido (border rojo, aviso amarillo "No reconocemos el modelo, revisalo o dejalo vacío").
  - Lista de 5 modelos no soportados: A3, A3X, A2, Redmi Note 12S, A5 (más sus codenames internos a extraer del código).
  - Validación de modelo nunca bloquea el flujo, solo informa.
  - Cajones amarillos del modelo duran 15s o desaparecen si el cliente corrige.
  - Si dos cajones se cruzan, prevalece el primero (misma regla del panel 1).
  - Insignia verde "98% de modelos soportados" siempre visible al pie.
  - Card oscura "TOTAL" con monto en moneda local + conversión USDT + breakdown "N × S/ Y.YY".
  - Sin botón Continuar.
  - Cantidad y modelo no se persisten en localStorage (se resetean al recargar).
  - Panel congelado: pierde clicks/escritura sin cambio visual (misma regla del panel 1).
  - 2 OQ-residuales identificadas: OQ-R1 (codenames de no soportados, Claude Code las saca), OQ-R2 (comportamiento del aviso si cliente sube/baja varias veces).
