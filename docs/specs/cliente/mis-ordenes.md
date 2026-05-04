# Mis órdenes

**Versión:** 1.0 · **Fecha:** 3 de mayo 2026 · **Estado:** spec formal con las 8 piezas. Lista para implementación pendiente solo del flujo completo de reembolso (pausado, requiere spec dedicada de política de reembolso) y archivo HTML standalone (sesión 14).

**Reemplaza a:** no había spec previa. Hereda decisiones conceptuales de sesión 12 sobre composición de card, comportamiento del estado, modal de historial, abortar proceso, etc. Pero la composición de la card cambió mucho durante sesión 13, ver changelog.

---

## Contexto

Es la **zona inferior** de la pantalla principal cliente, debajo de los 4 paneles paralelos. Muestra todas las órdenes que el cliente ya tiene en seguimiento (las que cruzaron el umbral de "haber apretado el botón Equipo conectado en panel 4 con comprobante validado").

**Decisión clave heredada:** una orden **nace** recién cuando el cliente aprieta "Equipo conectado" en panel 4. Antes de eso, lo que existe es un "pedido en armado" que vive en los paneles 1-2-3, no acá.

**Audiencia:** técnico de tienda. Para 1 equipo es seguimiento simple. Para N equipos (mayoría experimentada del rubro), tiene control granular sobre cada equipo individual.

**Posición en el flow:** zona ancha que ocupa todo el ancho de la pantalla principal, debajo de los 4 paneles. En desktop, 2 cards completas visibles antes de scroll. En mobile, stack vertical natural.

---

## 1. Mockup visual

**Estado del mockup:** decisiones visuales validadas en sesión 13 con mockups en chat. Archivo HTML standalone se entrega en sesión 14 como parte de los mockups consolidados de la pantalla principal.

### Estructura visual de la card (desktop ~600px de ancho, mobile ~340px)

De arriba hacia abajo:

1. **Header de la card.** Tres elementos en una fila horizontal:
   - **Izquierda:** bandera del país (28×28 desktop, 24×24 mobile, circular) + bloque vertical con código de orden (font mono, 12px, color secundario) y monto en moneda local (20px desktop, 18px mobile, weight 500). Sin conversión "X USDT" — es redundante porque el cliente ya pagó en su moneda.
   - **Derecha:** fecha y hora ("Hoy · 14:32" o "12 abr · 09:15").

2. **Línea descriptiva.** "N equipos · Modelo" (ej: "3 equipos · Redmi Note 13"). Si el cliente no escribió modelo en panel 2, dice solo "N equipos".

3. **Lista de equipos individuales.** Una fila por equipo. Cada fila tiene fondo y elementos según el estado del equipo (ver §2.2). Sin barra de procesados general — la lista directa reemplaza esa visualización.

4. **Pie de la card.** Dos elementos:
   - **Izquierda:** botón "Recibo de operación" (full-width hasta el botón de 3 puntos). Disabled hasta que toda la orden esté finalizada.
   - **Derecha:** botón cuadrado de 3 puntitos verticales que abre menú con opciones de la orden completa.

### Decoración visual

La **bandera del país** en el header da identidad visual y match con el sistema de pills del panel 1. Es el elemento que evita que la card se vea genérica.

**Sin ilustraciones, gradientes ni efectos extra.** Tipografía + bandera + estados de color en los items son suficiente para diferenciar.

### Código HTML del mockup default (desktop, 3 equipos en medio del proceso)

```html
<div style="width: 600px; background: var(--color-background-primary); border: 0.5px solid var(--color-border-secondary); border-radius: var(--border-radius-lg); padding: 1.25rem 1.5rem;">

  <!-- Header con bandera + código + monto + fecha -->
  <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
    <div style="display: flex; gap: 12px; align-items: center;">
      <svg width="28" height="28" ...>[bandera Perú: rojo/blanco/rojo vertical]</svg>
      <div>
        <div style="font-family: mono; font-size: 12px; color: secondary;">PE-20260503-012</div>
        <div style="font-size: 20px; weight: 500;">S/ 54.75</div>
      </div>
    </div>
    <div style="text-align: right;">
      <div style="font-size: 12px; color: secondary;">Hoy · 12:14</div>
    </div>
  </div>

  <!-- Línea descriptiva -->
  <div style="font-size: 13px; color: secondary; margin-bottom: 16px;">3 equipos · Redmi Note 13</div>

  <!-- Lista de equipos -->
  <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px;">
    <!-- Equipo 1 finalizado -->
    <div style="background: #EAF3DE; padding: 10px 12px; border-radius: md;">
      [check verde 18x18] Equipo 1 ........... Finalizado · 12:42
    </div>
    <!-- Equipo 2 en proceso -->
    <div style="background: #E6F1FB; padding: 10px 12px;">
      [dot azul animado] Equipo 2 ............ En proceso
    </div>
    <!-- Equipo 3 pendiente con botones -->
    <div style="border 0.5px tertiary; padding: 10px 12px;">
      [dot gris vacío] Equipo 3 ... [Cancelar este equipo] [Equipo listo]
    </div>
  </div>

  <!-- Pie con Recibo + 3 puntos -->
  <div style="display: flex; gap: 8px; align-items: center;">
    <button disabled style="flex: 1;">Recibo de operación</button>
    <button style="36x36;">⋮</button>
  </div>

</div>
```

---

## 2. Componentes y estados

### 2.1 Header de la card

| Elemento | Detalles |
|---|---|
| Bandera del país | SVG circular 28×28 (desktop) o 24×24 (mobile). Mismo gráfico que panel 1. Match visual entre panel 1 y Mis órdenes |
| Código de orden | Formato `PE-20260503-014` (país + fecha YYYYMMDD + correlativo). Font mono, 12px desktop / 11px mobile, color tertiary |
| Monto en moneda local | 20px desktop / 18px mobile, weight 500, color primary. **Sin** la conversión a USDT |
| Fecha y hora | Si es hoy, "Hoy · HH:MM". Si es ayer, "Ayer · HH:MM". Si es más viejo, "DD MMM · HH:MM". Color secondary, 12px |

### 2.2 Lista de equipos — estados por equipo

Cada equipo es una fila horizontal con dot/ícono a la izquierda + nombre del equipo + estado/acciones a la derecha. **4 estados visibles del equipo:**

| Estado | Cuándo | Visual |
|---|---|---|
| **Pendiente** | Equipo aún no conectado por el cliente | Fondo blanco, border 0.5px tertiary, dot gris vacío (10×10, sin relleno, con border secondary). A la derecha: dos botones "Cancelar este equipo" (border rojo `#A32D2D`) + "Equipo listo" (border azul `#185FA5`) |
| **Esperando técnico** | Cliente lo conectó (apretó "Equipo listo" o el botón "Equipo conectado" del panel 4 para el primero), técnico aún no agarró | Fondo gris claro `var(--color-background-secondary)`, dot gris lleno (10×10, fill `#888780`). A la derecha: texto "Esperando técnico" en color secondary, sin botones |
| **En proceso** | Técnico agarró este equipo y está procesándolo | Fondo azul claro `#E6F1FB`, dot azul animado pulsante (10×10, fill `#185FA5`, opacity oscila 1↔0.4 cada 1.4s). A la derecha: texto "En proceso" en color `#0C447C`, weight 500 |
| **Finalizado** | Técnico terminó este equipo | Fondo verde claro `#EAF3DE`, círculo verde con check (18×18, fill `#639922`, check blanco adentro). A la derecha: texto "Finalizado · HH:MM" en color `#27500A`, weight 500. Sin botones |

**El equipo 1 al nacer la orden** (apretar "Equipo conectado" en panel 4) entra directo al estado "Esperando técnico". El cliente no lo aprieta como "Equipo listo" porque el botón del panel 4 ya cumple esa función para el primer equipo.

**Los equipos 2..N al nacer la orden** entran en estado "Pendiente" — el cliente debe conectarlos físicamente uno por uno y apretar "Equipo listo" en cada uno.

### 2.3 Botones por equipo en estado Pendiente

**Cancelar este equipo:**

- Border 0.5px `#A32D2D` (rojo destructivo del sistema), background blanco, color `#A32D2D`, weight 500, font-size 12px, padding 6px 12px, border-radius md.
- Click → cancela ese equipo individualmente (la mecánica concreta del reembolso parcial está pausada en política de reembolso).
- En mobile: texto se acorta a "Cancelar" para que entre. Botón apilado verticalmente con "Equipo listo".

**Equipo listo:**

- Border 0.5px `#185FA5` (azul primario), background blanco, color `#185FA5`, weight 500, font-size 12px, padding 6px 12px.
- Click → cliente confirma que conectó físicamente este equipo. Estado pasa de Pendiente a Esperando técnico.
- En mobile: mismo texto, apilado vertical.

### 2.4 Pie de la card — Recibo + menú 3 puntos

**Recibo de operación:**

- Botón con border 0.5px tertiary, background blanco, padding 9px 14px, font-size 13px, border-radius md.
- **Disabled** mientras la orden no esté completamente finalizada (color tertiary, opacity 0.5, cursor not-allowed).
- **Habilitado** cuando todos los equipos están en estado Finalizado (color primary, cursor pointer).
- Click cuando habilitado → genera/descarga el comprobante final. (La generación del archivo es responsabilidad del panel operador, ver decisiones cruzadas.)
- Ocupa todo el ancho disponible hasta el botón de 3 puntos.

**Botón 3 puntitos (menú de la orden):**

- Botón cuadrado 36×36 (28×28 en mobile-ajuste interior), border 0.5px tertiary, fondo blanco, tres dots verticales pequeños (3×3 cada uno) en color secondary.
- Click → abre menú dropdown debajo del botón.

### 2.5 Menú 3 puntitos — opciones

Por ahora una sola opción visible:

| Opción | Cuándo aparece | Acción |
|---|---|---|
| **Abortar pedido** | Mientras la orden tenga al menos un equipo en estado distinto a Finalizado | Click → modal de confirmación (§2.6) |

**Cuando toda la orden está finalizada:** los 3 puntitos desaparecen completamente del pie. No hay acciones disponibles.

**"Pedir reembolso" como segunda opción:** registrada como **input crudo** del HANDOFF (política de reembolso pausada). Cuando se haga la spec dedicada de política de reembolso, este menú podrá agregar una segunda opción específica para reembolso post-finalización.

### 2.6 Modal "¿Abortar este pedido?"

Modal centrado, fondo de overlay semitransparente (`rgba(0,0,0,0.45)`), card blanco con `border-radius: lg`, padding 1.75rem 1.5rem, ancho 380px (desktop) / `calc(100vw - 32px)` (mobile, máx 360).

**Contenido:**

- Título: "¿Abortar este pedido?" (h3, 18px, weight 500)
- Cuerpo: "Te contactamos por WhatsApp para procesar el reembolso. No es reversible." (14px, color secondary, line-height 1.5)
- Dos botones alineados a la derecha:
  - "Cancelar" (border 0.5px secondary, background blanco, color primary)
  - "Sí, abortar" (background `#A32D2D`, color blanco) — botón destructivo

**Comportamiento:**

- Click en "Cancelar" o fuera del modal: se cierra sin acción.
- Click en "Sí, abortar": dispara la solicitud de aborto + reembolso (manejada por WhatsApp con Bryam en versión inicial, ver decisión cruzada con política de reembolso). Cierra modal. La card desaparece de la lista visible (o cambia visualmente, ver OQ-R1).

### 2.7 Botón "Ver órdenes anteriores" + modal de historial

Cuando el cliente tiene órdenes finalizadas de **más de 7 días**, aparece debajo de la lista de cards activas un botón/link "Ver órdenes anteriores". Al apretarlo, abre el modal de historial.

**Modal de historial:**

- Ancho 540px (desktop) / `calc(100vw - 32px)` (mobile).
- Header: título "Tus órdenes anteriores" (h3) + botón cerrar × cuadrado 28×28 a la derecha.
- Search input full-width: placeholder "Buscar por código o fecha…", padding 9px 12px, font-size 13px, border 0.5px tertiary.
- Lista de cards compactas (ver §2.8).
- Pie del modal: indicador de paginación "Mostrando X de Y" + botones de navegación "‹" "›" (border 0.5px tertiary, padding 5px 10px). El primero queda disabled cuando estás en la primera página.

### 2.8 Card compacta del modal historial

Versión reducida de la card principal, una fila horizontal compacta:

- Bandera 20×20 a la izquierda
- Bloque vertical: código de orden (mono 11px) + descripción "N equipos · Monto" (13px primary)
- Estado a la derecha: "Finalizado · DD MMM" (verde 11px)
- Botón "Recibo" (5px 10px, border 0.5px secondary, font 11px) — siempre habilitado en historial (todas las órdenes acá están finalizadas)

Sin lista de equipos individuales (ya finalizó todo, no aporta info al cliente).
Sin botones de acción (no hay nada que hacer salvo descargar el recibo).

### 2.9 Estado vacío

Cuando el cliente no tiene órdenes ni activas ni en últimos 7 días.

- Card con border 0.5px secondary, padding 2.5rem 1.5rem, text-align center.
- Línea principal: "Aún no tenés órdenes." (14px, color secondary).
- Línea secundaria: "Tu primera orden aparecerá acá." (13px, color tertiary).
- **Sin** ilustraciones, sin íconos decorativos, sin botones de CTA. El cliente B2B se orienta solo en los paneles 1-4 de arriba.

### 2.10 Indicador "Sin conexión SSE"

Cuando la conexión SSE se cae, aparece un banner ámbar arriba de la lista de cards:

- Padding 8px 12px, background `#FAEEDA`, border-radius md.
- Dot ámbar (8×8, fill `#BA7517`).
- Texto: "Sin conexión, intentando reconectar…" (12px, color `#633806`, weight 500).
- Adicionalmente, en cada card visible aparece una línea pequeña al final: "(estados pueden no estar actualizados mientras la conexión esté caída)" (11px, color tertiary, italic).

Cuando la conexión se recupera, el banner desaparece silenciosamente. La nota dentro de las cards también.

---

## 3. Edge cases

1. **Orden recién creada con 1 equipo.** Aparece la card. Equipo 1 en estado "Esperando técnico". Sin equipos pendientes (no aplican botones). Recibo deshabilitado. Menú 3 puntos visible.

2. **Orden recién creada con 3 equipos.** Equipo 1 en "Esperando técnico". Equipos 2 y 3 en "Pendiente" con botones. Cliente debe conectar físicamente cada uno y apretar "Equipo listo".

3. **Cliente cancela un equipo individualmente.** El equipo desaparece visualmente de la lista (o queda marcado como cancelado, ver OQ-R1). Los demás siguen su flujo normal. La cantidad total mostrada en "N equipos · Modelo" se actualiza si fuera necesario.

4. **Cliente cancela TODOS los equipos individualmente.** La orden queda sin equipos. ¿Es lo mismo que abortar el pedido? Pendiente, ver OQ-R2.

5. **Cliente aprieta "Abortar pedido" en el menú.** Aparece el modal. Si confirma, se inicia el proceso de aborto + reembolso (manejo manual por WhatsApp con Bryam en versión inicial). La card desaparece de la lista activa.

6. **Toda la orden finaliza.** Todos los equipos en estado Finalizado. El menú 3 puntos desaparece. El botón "Recibo de operación" se habilita ocupando todo el ancho.

7. **Cliente sin órdenes históricas.** Se muestra el estado vacío (§2.9).

8. **Cliente con muchas órdenes.** Vista por defecto: activas + finalizadas de últimos 7 días. Las finalizadas más viejas se acceden vía botón "Ver órdenes anteriores" que abre el modal de historial.

9. **Cliente tiene 1 orden activa + 5 finalizadas hace 10 días.** La activa se ve, las 5 viejas no. Aparece el botón "Ver órdenes anteriores".

10. **Conexión SSE se cae mientras cliente está mirando.** Aparece el banner ámbar arriba. Las cards siguen visibles con el último estado conocido. Cuando la conexión se recupera, el banner desaparece y los estados se sincronizan.

11. **Técnico finaliza un equipo mientras el cliente está mirando.** Vía SSE, el equipo en proceso pasa a finalizado en vivo (cambio de fondo azul a verde + texto a "Finalizado · HH:MM").

12. **Técnico agarra un equipo que estaba en "Esperando técnico".** Vía SSE, ese equipo pasa de fondo gris a azul claro, dot pasa a azul animado, texto pasa a "En proceso".

13. **Cliente intenta apretar "Equipo listo" cuando otro equipo ya está en proceso.** Funciona normal. El equipo pasa a "Esperando técnico". El técnico tomará ese equipo cuando termine el actual.

14. **Cliente tiene problema físico al conectar el equipo 3 (no enciende, cable roto, etc.).** Apretar "Cancelar este equipo" para sacarlo del pedido. Los demás siguen.

15. **Cliente cierra el navegador en medio del proceso.** Al volver a entrar, la pantalla principal muestra Mis órdenes con el estado actualizado vía SSE al cargar.

16. **Pedido aborto con un equipo en proceso.** Si el cliente abortó cuando Jack ya empezó un equipo, Jack recibe alerta inmediata para detener trabajo. El registro queda en panel operador para reembolso manual.

17. **Recibo se intenta descargar en una orden no finalizada.** Botón disabled, click no hace nada.

18. **Modal historial con búsqueda sin resultados.** Mostrar mensaje "No encontramos órdenes que coincidan." en lugar de la lista. Pendiente: definir comportamiento exacto del search (busca código exacto, sub-strings, fechas en distintos formatos, etc.).

19. **Modal historial con muchas páginas.** Paginación de 10 por página (a confirmar). Botones "‹" "›" navegan entre páginas.

20. **Cliente click "Ver órdenes anteriores" cuando no tiene historial viejo.** El botón no aparece en ese caso. Solo si hay finalizadas más viejas que 7 días.

---

## 4. Responsive

### 4.1 Mobile (<768px)

- Cards apiladas verticalmente, ancho ~340px (depende del padding de la pantalla principal).
- Padding interno de la card: `1.25rem 1rem`.
- Bandera 24×24 (vs 28×28 desktop).
- Código de orden 11px (vs 12px desktop).
- Monto 18px (vs 20px desktop).
- Fecha 11px (vs 12px desktop).
- Items de equipo: en estado Pendiente, los dos botones se **apilan verticalmente debajo del nombre del equipo** en una segunda fila (no caben al costado en pantalla angosta). Texto del botón "Cancelar este equipo" se acorta a "Cancelar" en mobile para que entre cómodo.
- Pie de card: Recibo + 3 puntos en una fila, igual que desktop.
- Modales (abortar e historial): ancho `calc(100vw - 32px)` con máximo 360px (abortar) o 540px (historial). Para historial, las cards compactas se vuelven más compactas todavía y la paginación queda al pie.

### 4.2 Tablet y desktop (≥768px)

- Cards en stack vertical (no se ponen lado a lado). Ancho típico ~600px.
- Padding interno: `1.25rem 1.5rem`.
- Bandera 28×28, código 12px, monto 20px, fecha 12px.
- Items de equipo: en Pendiente, los dos botones quedan a la derecha del nombre en una sola fila.
- 2 cards completas visibles en viewport antes de scroll.

---

## 5. Comportamiento

| Acción | Resultado |
|---|---|
| Aparece nueva card en Mis órdenes | Animación slide-in suave (~300-500ms). El cliente acaba de apretar "Equipo conectado" en panel 4 |
| Click en "Equipo listo" (estado Pendiente) | Equipo pasa de Pendiente a Esperando técnico. Botones desaparecen. Cliente debe haber conectado físicamente el equipo antes |
| Click en "Cancelar este equipo" (estado Pendiente) | Equipo se cancela individualmente. Visualmente desaparece de la lista (o queda marcado como cancelado, OQ-R1) |
| Click en botón "Recibo de operación" (habilitado) | Descarga el comprobante final de la orden. Mecanismo concreto definido en spec del panel operador |
| Click en botón "Recibo de operación" (deshabilitado) | No-op. Sin feedback |
| Click en botón 3 puntos | Abre menú dropdown debajo del botón |
| Click en "Abortar pedido" del menú | Abre modal de confirmación |
| Click en "Sí, abortar" del modal | Confirma aborto. Se cierra el modal. Card desaparece de la lista activa. Notifica al técnico (alerta) y al operador (registro). Política de reembolso pausada |
| Click en "Cancelar" del modal o fuera del modal | Cierra modal sin acción |
| Click en botón "Ver órdenes anteriores" | Abre modal de historial completo |
| Tipeo en search del modal historial | Filtra la lista en tiempo real (debounce ~300ms). Búsqueda contra código y fecha (alcance exacto a definir, OQ-R6) |
| Click en "‹" o "›" del modal historial | Navega entre páginas de la lista filtrada |
| Click en × del modal historial | Cierra modal |
| Conexión SSE se cae | Aparece banner ámbar arriba de la lista. Cards siguen visibles con último estado conocido |
| Conexión SSE se recupera | Banner ámbar desaparece. Estados se sincronizan vía SSE silenciosamente |
| Técnico cambia el estado de un equipo | Vía SSE, el item de la card cambia su visual instantáneamente |
| Recargar página | Estado se reconstruye desde el backend al cargar. SSE se reconecta. Sin pérdida de datos |

**Sincronización en vivo:** todos los cambios de estado (técnico agarra, técnico finaliza, otra orden nace para mismo cliente) se propagan vía SSE al canal `/api/portal/orders/events`. Sin polling.

**Animación de aparición de card:** slide-in suave de ~300-500ms cuando una orden nueva nace. Para que sea claro al cliente B2B que algo cambió en su pantalla.

---

## 6. Datos

### 6.1 Datos que necesita (inputs)

**Lista de órdenes activas + recientes** desde el backend cuando carga la pantalla:

```json
{
  "orders": [
    {
      "id": "PE-20260503-012",
      "country": "PE",
      "currency": "PEN",
      "totalLocal": 54.75,
      "totalUsdt": 15.00,
      "createdAt": "2026-05-03T12:14:00Z",
      "deviceModel": "Redmi Note 13",
      "items": [
        { "deviceIndex": 1, "status": "in_progress" },
        { "deviceIndex": 2, "status": "waiting_technician" },
        { "deviceIndex": 3, "status": "pending" }
      ],
      "globalStatus": "in_progress"
    }
  ],
  "olderOrdersCount": 14
}
```

`olderOrdersCount` indica cuántas órdenes finalizadas más viejas que 7 días tiene el cliente. Si es > 0, mostrar el botón "Ver órdenes anteriores".

**Estados posibles de cada item:**

- `pending`: cliente no lo conectó todavía (pendiente)
- `waiting_technician`: cliente lo conectó, técnico no agarró
- `in_progress`: técnico procesando este equipo
- `finished`: técnico terminó este equipo
- `cancelled`: cliente lo canceló individualmente

**Estado global de la orden** (`globalStatus`):

- `in_progress`: al menos un item en estado distinto a `finished` o `cancelled`
- `finished`: todos los items en `finished`
- `aborted`: cliente apretó "Abortar pedido"

**Eventos SSE** (`/api/portal/orders/events`):

```json
{
  "type": "item_status_changed",
  "orderId": "PE-20260503-012",
  "deviceIndex": 1,
  "newStatus": "finished",
  "finishedAt": "2026-05-03T12:42:00Z"
}
```

Otros tipos: `order_created`, `order_aborted`, `connection_lost`, `connection_restored`.

### 6.2 Datos que produce

**Click en "Equipo listo":**

```http
POST /api/portal/orders/:orderId/items/:deviceIndex/ready
```

Cambia el item de `pending` a `waiting_technician`.

**Click en "Cancelar este equipo":**

```http
POST /api/portal/orders/:orderId/items/:deviceIndex/cancel
```

Cambia el item de `pending` a `cancelled`. Genera registro de solicitud de reembolso parcial (manual hasta que política de reembolso esté definida).

**Click en "Sí, abortar" del modal:**

```http
POST /api/portal/orders/:orderId/abort
```

Cambia el `globalStatus` a `aborted`. Notifica al técnico y operador. Genera registro de solicitud de reembolso completo.

**Click en "Recibo de operación":**

```http
GET /api/portal/orders/:orderId/receipt
```

Devuelve el archivo PDF del comprobante final.

### 6.3 Validaciones

**Frontend:**

- "Equipo listo" solo aparece si `item.status === 'pending'`.
- "Cancelar este equipo" solo aparece si `item.status === 'pending'`.
- "Recibo de operación" habilitado solo si `globalStatus === 'finished'`.
- Menú 3 puntos visible solo si `globalStatus === 'in_progress'`.

**Backend:**

- Re-validar el estado actual del item antes de aceptar el cambio.
- "Cancelar este equipo" rechaza si el equipo ya pasó de `pending` (no se puede cancelar uno que el técnico ya está procesando — caso pendiente, ver OQ-R3).
- "Abortar pedido" rechaza si la orden ya está finalizada o ya fue abortada.

---

## 7. Acceptance criteria

**Layout y estilo:**

1. Card tiene bandera del país en el header (28×28 desktop, 24×24 mobile).
2. Header muestra código de orden + monto en moneda local. Sin conversión a USDT.
3. Línea descriptiva muestra "N equipos · Modelo" si hay modelo, "N equipos" si no hay.
4. Lista de equipos individuales reemplaza la barra de procesados general.
5. Cada equipo tiene 4 estados visuales claros: Pendiente, Esperando técnico, En proceso, Finalizado.
6. Pie de la card: Recibo de operación a la izquierda (full-width hasta el botón 3 puntos), botón 3 puntos a la derecha.

**Comportamiento — equipos:**

7. Equipo 1 al nacer la orden está en "Esperando técnico" (no en Pendiente).
8. Equipos 2..N al nacer están en "Pendiente" con botones.
9. Click en "Equipo listo" cambia el estado a "Esperando técnico" y oculta los botones.
10. Click en "Cancelar este equipo" lo saca de la lista (o lo marca como cancelado, según OQ-R1).
11. Estado "En proceso" tiene fondo azul claro, dot azul animado pulsante, texto azul oscuro.
12. Estado "Finalizado" tiene fondo verde claro, círculo verde con check, texto verde oscuro + hora.

**Comportamiento — orden completa:**

13. Botón "Recibo de operación" deshabilitado mientras `globalStatus !== 'finished'`.
14. Botón "Recibo de operación" habilitado cuando todos los equipos están finalizados.
15. Menú 3 puntitos visible mientras `globalStatus === 'in_progress'`.
16. Menú 3 puntitos desaparece cuando `globalStatus === 'finished'`.
17. Click en "Abortar pedido" abre modal de confirmación.
18. Click en "Sí, abortar" del modal dispara el aborto + notifica técnico y operador.

**Comportamiento — historial:**

19. Vista por defecto muestra órdenes activas + finalizadas últimos 7 días.
20. Botón "Ver órdenes anteriores" aparece solo si hay finalizadas más viejas que 7 días.
21. Click en "Ver órdenes anteriores" abre modal con búsqueda + paginación.
22. Cards del modal historial son versión compacta (bandera chica, código, descripción, estado, botón Recibo).

**Comportamiento — estado vacío:**

23. Cliente sin órdenes activas y sin historial: muestra mensaje "Aún no tenés órdenes."
24. Estado vacío sin ilustraciones decorativas.

**Comportamiento — sincronización:**

25. Conexión SSE caída: aparece banner ámbar "Sin conexión, intentando reconectar…" arriba de las cards.
26. Cada card visible muestra nota "(estados pueden no estar actualizados…)" mientras la conexión esté caída.
27. Conexión recuperada: banner ámbar desaparece, estados se sincronizan silenciosamente.
28. Cambios de estado vía SSE (técnico agarra, técnico finaliza, etc.) actualizan la card en vivo sin recargar.

**Accesibilidad:**

29. Botones desactivados tienen `aria-disabled="true"`.
30. Modal de abortar tiene `role="dialog"` y `aria-modal="true"`.
31. Modal de historial tiene `role="dialog"` y `aria-modal="true"`.
32. Banner SSE tiene `role="status"`.
33. Tab order de la card: botones por equipo (en orden) → Recibo → 3 puntos.
34. Esc cierra los modales abiertos.

---

## 8. Open questions

**Estado al cierre de sesión 13:** las decisiones principales de Mis órdenes están cerradas. Quedan OQ-residuales para refinar en sesiones siguientes:

### OQ-residuales (sesión 13)

**OQ-R1 — Visualización del equipo cancelado individualmente.**

Cuando el cliente aprieta "Cancelar este equipo" en estado Pendiente, ¿el equipo desaparece de la lista, o queda marcado visualmente como "Cancelado" (ej: tachado, opacidad reducida, texto "Cancelado" en gris)?

Decisión provisional: desaparece de la lista para no recargar visualmente. Confirmar en sesión 14 cuando se haga el HTML standalone.

**OQ-R2 — Cliente cancela todos los equipos individualmente.**

¿Es equivalente a abortar el pedido? ¿Cómo se ve la card en ese caso? ¿Se considera `globalStatus === 'aborted'` o un estado intermedio nuevo?

Cierre: depende de la política de reembolso pausada.

**OQ-R3 — ¿Cancelar este equipo sirve solo en estado Pendiente?**

Hoy decidimos que sí (los botones solo aparecen en Pendiente). Pero ¿qué pasa si el cliente quiere cancelar un equipo en "Esperando técnico" (lo conectó pero el técnico aún no agarró)? Decisión actual: tendría que usar "Abortar pedido" general. Pendiente confirmar si vale la pena agregar la opción en estado Esperando técnico.

**OQ-R4 — Comportamiento exacto del search del modal historial.**

¿Busca solo código exacto, sub-strings del código, fechas en distintos formatos ("12 abr", "2026-04-12", "abril")? Pendiente definir cuando se haga el HTML standalone del modal.

**OQ-R5 — Cantidad de órdenes por página del modal historial.**

10, 20, 50? Pendiente decidir.

**OQ-R6 — Aparece "Pedir reembolso" como segunda opción del menú post-finalización.**

Si el cliente tiene un problema con un equipo ya finalizado (ej: el celular no quedó bien), ¿puede pedir reembolso post-finalización? Cruza con política de reembolso. Cierre: spec dedicada de política de reembolso.

**OQ-R7 — Indicador SSE caído en mobile.**

El banner ámbar funciona bien en desktop. En mobile, donde la pantalla principal es un stack vertical, ¿el banner queda fijo arriba (sticky) o scrollea con el contenido? Decisión provisional: scrollea. Pendiente probar en HTML standalone.

### OQ heredadas

- **Política de reembolso (input crudo HANDOFF).** Define qué pasa con el dinero al abortar pedido completo o cancelar equipos individuales. Cierre: spec dedicada en sesión futura.
- **Sistema de tiempos (input crudo HANDOFF).** Define el lock pricing y cuánto dura el "precio asegurado" antes de que cambie. No bloquea esta spec pero el día que se haga, podría agregar elementos a la card (precio asegurado, vencimiento) que en sesión 12 quedaron pausados.

---

## Decisiones cruzadas que afectan otras specs

### Spec del panel 4 (sesión 14)

Sin cambios respecto a sesión 12. El botón "Equipo conectado" sigue creando la orden y desapareciendo. Internamente, marca el equipo 1 como "Esperando técnico" en Mis órdenes.

### Spec del panel operador (sesión futura)

Cambio importante respecto a sesiones anteriores: el operador ya no "agarra el pedido completo", agarra **equipos individuales dentro del pedido**. La UI del operador necesita:

- Vista de pedidos con sus equipos individuales listados (no como un block).
- Botón "Tomar equipo" por cada equipo en estado "Esperando técnico" del cliente.
- Botón "Finalizar equipo" individual (no "Finalizar pedido completo").
- Manejo de aborto: alerta inmediata + opción de detener trabajo si hay equipo en proceso.
- Manejo de cancelación individual: equipo desaparece o queda marcado para reembolso parcial.
- Generación del Recibo de operación final cuando todos los equipos están finalizados.

### Spec de política de reembolso (sesión futura)

Mucho cruce. Las preguntas pendientes que la spec dedicada debe responder, ampliadas en sesión 13:

- Cancelación individual de un equipo: ¿reembolso parcial automático? ¿Crédito interno? ¿Manual por WhatsApp?
- Abortar pedido completo: idem.
- ¿Hay diferencia entre cancelar antes de "Esperando técnico" vs en cualquier otro estado?
- ¿Se cobra un costo de cancelación?
- Modal "Pedir reembolso" post-finalización: ¿existe? ¿cuándo aparece como opción del menú?
- Campo del cliente para emitir el reembolso (datos bancarios o lo que sea): a definir.
- Subida del comprobante de reembolso desde el panel operador: a definir.
- El cliente ve el comprobante del reembolso en alguna parte: a definir.

### Spec del Centro de configuración (sesión futura)

Sin cambios directos, pero "Catálogo de equipos" / "Modelos no soportados" (sub-secciones existentes en el HANDOFF) afectan al panel 2, no a Mis órdenes.

---

## Changelog

- **mis-ordenes.md v1.0** (2026-05-03, sesión 13) — Spec inicial completa con las 8 piezas. Decisiones tomadas en la sesión, varias diferentes a las de sesión 12:

  **Cambios respecto a sesión 12 (`pantalla-principal-cliente.md` v1.0):**
  - Card **unificada** para 1 y N equipos. Sesión 12 decía "card adaptativa según cantidad". La nueva regla es mismo patrón siempre, solo cambia cuántos items hay en la lista.
  - **Sin barra de procesados general.** Reemplazada por lista de equipos individuales con su estado.
  - **Sin Registro de actividad** expandible. Sesión 12 decía expandible para N≥2. Quitado por redundancia con la lista de equipos (que muestra estado de cada uno).
  - **4 estados visibles del equipo individual** (Pendiente, Esperando técnico, En proceso, Finalizado). Sesión 12 hablaba de "estado a nivel orden" solo (En proceso / Finalizado).
  - **Botón "Equipo listo"** en cada equipo Pendiente. Decisión nueva: cliente conecta físicamente cada equipo y avisa al técnico apretando este botón. El primer equipo se asume conectado al apretar "Equipo conectado" del panel 4.
  - **Botón "Cancelar este equipo"** enmarcado en cada equipo Pendiente. Decisión nueva: cliente puede cancelar equipos individualmente.
  - **Sin botón "Abortar proceso" general** cuando hay 2+ equipos. La opción "Abortar pedido" vive en el menú 3 puntitos.
  - **Menú 3 puntitos** con la opción "Abortar pedido". Aparece al pie de la card al costado del botón "Recibo de operación".
  - **Bandera del país** en el header de la card como decoración visual de identidad.
  - **Sin conversión a USDT** en el header. Solo monto en moneda local. La conversión se considera redundante porque el cliente ya pagó en su moneda.
  - Botón **"Recibo de operación"** rebautizado se mantiene de sesión 12. Aparece deshabilitado durante el proceso, habilitado al finalizar toda la orden.
  - **Cuando toda la orden está finalizada**, el menú 3 puntitos desaparece y el botón Recibo se activa ocupando todo el ancho.

  **Modal de Abortar pedido** definido completo: título, cuerpo ("Te contactamos por WhatsApp para procesar el reembolso. No es reversible."), botones Cancelar / Sí, abortar.

  **Modal de historial** definido: título "Tus órdenes anteriores", search input, cards compactas, paginación.

  **Estado vacío** definido: "Aún no tenés órdenes. Tu primera orden aparecerá acá." sin ilustraciones.

  **Indicador SSE caído** definido: banner ámbar arriba de las cards con texto "Sin conexión, intentando reconectar…" + nota dentro de cada card visible.

  **Decisiones cruzadas registradas** para panel operador (cambia su mecánica), política de reembolso (sigue pausada), panel 4 (sin cambios).

  **7 OQ-residuales identificadas** (OQ-R1 a OQ-R7) para refinar en sesiones siguientes, principalmente cuando se haga el HTML standalone (sesión 14) y la spec dedicada de política de reembolso.
