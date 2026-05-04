# Panel 4 — Conexión

**Versión:** 1.0 · **Fecha:** 4 de mayo 2026 · **Estado:** spec formal con las 8 piezas. Lista para implementación pendiente solo del archivo HTML standalone consolidado de la pantalla principal (entregado en la misma sesión 14) y de la captura real del Redirector que ya fue compartida por Bryam en sesión 14 y queda registrada para uso en el modal "¿Dónde pegar estos códigos?".

**Reemplaza a:** no había spec previa formal. Hereda decisiones del HANDOFF línea 594 ("paso 4: SIN banner pago aprobado, mini-Redirector NO inline, va en bottom sheet por botón ¿Dónde pego estos datos?, datos con badges 1° azul / 2° verde matcheando los campos del Redirector") y del modelo de pantalla principal (sesiones 11-12-13).

---

## Contexto

Es el **panel 4 de los 4 paneles paralelos** que componen la pantalla principal cliente. Es el panel que más estados tiene a lo largo del flujo (6 estados visibles).

Cumple 3 funciones clave:

1. **Descarga del Redirector v2.5 siempre disponible** — desde el momento inicial, sin gating. Cliente nuevo o experto, con orden o sin orden.
2. **Botón "Equipo conectado" post-validación** — el clic de este botón es el que **hace nacer la orden** y la mueve a la sección Mis órdenes.
3. **Datos de conexión cuando hay orden activa** — Technician ID + Código del proceso, que el cliente pega en el Redirector para que el técnico procese sus equipos.

**Audiencia:** técnico de tienda. Familiar con la mecánica de bypass FRP. Repetidor de alta frecuencia.

**Posición en el flow:** columna 4 de la fila horizontal de paneles paralelos (desktop) o cuarto panel del stack vertical (mobile). El panel 4 tiene una particularidad: a diferencia de paneles 1-2-3, **NO se congela**. El cliente siempre puede descargar el Redirector y, en momentos apropiados, apretar "Equipo conectado".

---

## 1. Mockup visual

**Estado del mockup:** decisiones visuales validadas en sesión 14 con mockups en chat (estado 4 con cards apiladas + modal "¿Dónde pegar estos códigos?" con captura real del Redirector). Archivo HTML standalone se entrega en la misma sesión 14 como parte de los mockups consolidados de la pantalla principal completa.

### Estructura visual (desktop ~400px de ancho, mobile ~340px)

De arriba hacia abajo, dentro del panel:

1. **Header:** título "Conexión" en 16px, weight 500. Sin numeración delante.
2. **Contenido central** (varía drásticamente según los 6 estados — ver §2).
3. **Botón "Descargar Redirector v2.5"** persistente — siempre visible, en TODOS los estados. Botón con estilo destacado (background `--color-background-info`, color `--color-text-info`, border 0.5px info, padding ~8-10px, font-size 12-13px, ícono ⬇ a la izquierda).

### Estados generales (resumen — detalle en §2)

| Estado | Cuándo | Contenido central |
|---|---|---|
| 0 — Inicial | Cliente recién entró, sin pedido | (vacío — solo botón Descargar Redirector) |
| 1 — Armando pedido | Paneles 1-2-3 editables, comprobante no subido | Igual al estado 0 |
| 2 — Validación en curso | Comprobante subido, técnico aún no validó | Igual al estado 0 (decisión sesión 14: sin "Esperando validación…" en panel 4 — la señal de validación vive en panel 3 + paneles 1-2-3 congelados) |
| 3 — Validado, pre-clic | Comprobante validado, cliente aún no apretó | Botón **"Equipo conectado"** + (botón Descargar abajo) |
| 4 — Orden activa | Cliente apretó "Equipo conectado", orden nació | Cards Technician ID + Código del proceso + botón "¿Dónde pegar estos códigos?" + (botón Descargar abajo) |
| 5 — Comprobante rechazado | Técnico rechazó | Igual al estado 0 |

---

## 2. Componentes y estados

### 2.1 Botón "Descargar Redirector v2.5" — persistente

Botón presente en TODOS los estados. Decisión firme sesión 12 (OQ-10):

- Texto: "Descargar Redirector v2.5"
- Ícono: flecha hacia abajo (⬇) a la izquierda del texto.
- Estilo: background `--color-background-info`, color `--color-text-info`, border 0.5px info, padding 8-10px, font-size 12-13px, weight 500.
- Click → descarga directa del archivo `usb-redirector-customer.exe` (~9 MB) sin gating, sin pasos previos, sin login adicional.
- Posición: en estados 0/1/2/5 ocupa el centro del panel como elemento principal. En estados 3 y 4 vive abajo del contenido, ocupando ancho completo.

**Sin texto explicativo extra** (decisión sesión 14 OQ-1: solo el botón, sin frase guía).

### 2.2 Estados 0/1/2/5 — Inicial / Armando / Validando / Rechazado

Los 4 estados se ven idénticos visualmente. Cambia el contexto en otros paneles (panel 3 mostrando "Comprobante recibido ✓", "Comprobante validado ✓", o "Comprobante rechazado"), pero el panel 4 muestra solo el botón de descarga.

**Decisión sesión 14 (OQ-8 reabierta):** estado 2 NO muestra "Esperando validación…" + spinner. Se quita por redundancia con panel 3 que ya señala el estado del comprobante.

**Layout:** botón centrado vertical y horizontalmente en el panel. Sin texto extra. El botón es el único elemento.

### 2.3 Estado 3 — Comprobante validado, pre-clic del cliente

**Trigger:** técnico valida el comprobante. Vía SSE, panel 3 cambia a "Comprobante validado ✓" y panel 4 cambia al estado 3.

**Contenido:**

- Botón **"Equipo conectado"** centrado, ocupando la mayor parte del panel.
  - Estilo: background azul primario `#185FA5`, color blanco, border-radius `--border-radius-md`, padding ~14-16px, font-size 14-16px, weight 500. Es el botón más visualmente prominente del flujo.
  - Sin texto guía arriba ni abajo (decisión sesión 14).
- Botón "Descargar Redirector v2.5" debajo (mismo estilo persistente).

**Click en "Equipo conectado":** dispara la creación de la orden:

1. La orden **nace** en backend con `globalStatus: in_progress`, equipo 1 en estado `waiting_technician`, equipos 2..N en estado `pending`.
2. La card aparece en Mis órdenes con animación slide-in (~300-500ms).
3. Paneles 1-2-3 se descongelan instantáneamente. Panel 1 mantiene última pill, panel 2 vuelve a 1, panel 3 se limpia.
4. Panel 4 transiciona al estado 4 (orden activa).

**Por qué este botón es el corazón del flujo:** el HANDOFF y las specs tienen una decisión conceptual firme (sesión 11, ratificada sesión 12 en OQ-4): *"Una orden nace recién cuando el cliente aprieta el botón 'Equipo conectado' del panel 4 con comprobante validado."* Antes de eso lo que existe es un "pedido en armado". Esto define que la sección Mis órdenes muestra solo entidades que cruzaron ese umbral.

### 2.4 Estado 4 — Orden activa (post-clic)

**Trigger:** cliente apretó "Equipo conectado". Orden nacida.

**Contenido (decisión sesión 14):**

- **Cards apiladas** verticalmente (no en columnas):

  - **Card "Technician ID":** label arriba (11px secondary), valor en monospace (12-14px weight 500) sobre fondo `--color-background-secondary`, botón "Copiar" a la derecha.
  - **Card "Código":** mismo formato. Label "Código del proceso" o solo "Código" (versión corta).

- **Botón "¿Dónde pegar estos códigos?":** debajo de las dos cards, ocupa ancho completo. Estilo botón secundario (border 0.5px secondary, background blanco, color primary). Click → abre modal (§2.5).

- **Botón "Descargar Redirector v2.5":** persistente, abajo de todo.

**Datos visibles:**

- **Technician ID:** formato `1000 9983 5478` (12 dígitos espaciados de 4 en 4). Visualmente puede mostrarse compacto sin espacios (`100099835478`) si el ancho del panel lo requiere; al copiar, se copia el formato CON espacios que entiende el Redirector.
- **Código del proceso:** formato `CL-YYYYMMDD-NNN-Q` donde Q es la cantidad de equipos del pedido. Visualmente puede acortar el año a `YYMMDD` si hace falta espacio (ej: `CL-260503-001-2`); al copiar, se copia el formato completo con año de 4 dígitos.

**Generación automática:** ambos datos se generan en backend al nacer la orden. Technician ID viene del endpoint `GET /api/portal/active-technician` (devuelve el técnico activo del momento — Jack o Angelo). Código del proceso se genera con la fecha actual + correlativo + cantidad.

**Persistencia:** mientras la orden esté activa (`globalStatus: in_progress`), el panel 4 muestra estos datos. Cuando la orden termina (todos los equipos finalizados, `globalStatus: finished`), el panel 4 vuelve al estado 0/1 (botón Descargar como único elemento).

**Comportamiento durante "En proceso":** mientras el técnico está procesando equipos, el panel 4 NO muestra estados intermedios (eso vive en Mis órdenes con sus 4 estados por equipo). El panel 4 solo muestra los datos de conexión, fijos.

### 2.5 Modal "¿Dónde pegar estos códigos?"

**Trigger:** click en el botón homónimo del estado 4.

**Layout (decisión sesión 14):**

- Modal centrado, fondo overlay `rgba(0,0,0,0.45)`.
- Card blanco, ancho 480px (desktop) / `calc(100vw - 32px)` (mobile, máx 460), padding 1.5rem, border-radius `--border-radius-lg`, border 0.5px secondary.
- **Header:**
  - Título: "¿Dónde pegar estos códigos?" (h3, 18px, weight 500).
  - Botón ✕ cuadrado 28×28 alineado a la derecha.
  - Subtítulo: "Abrí el Redirector y completá estos 2 campos" (13px, color secondary).
- **Cuerpo principal:**
  - **Captura real del Redirector v2.5** — imagen `1777861729916_image.png` aportada por Bryam en sesión 14, contenida dentro de un marco simulando la ventana del Redirector (header oscuro `#1f2937` con texto "USB Redirector — Customer Module", body blanco con la imagen).
  - **Badges flotantes encima de la captura:**
    - Badge azul `#185FA5` con texto blanco "1° dato", al lado del label "Technician ID:".
    - Badge verde `#639922` con texto blanco "2° dato", al lado del label "Additional information".
  - **Pasos numerados** debajo de la captura:
    1. Círculo azul `#185FA5` con "1" blanca + texto "Pegá el **Technician ID** en el primer campo".
    2. Círculo verde `#639922` con "2" blanca + texto "Pegá el **Código del proceso** en el segundo campo".
    3. Círculo gris (border tertiary) con "3" + texto "Apretá **Connect** y volvé acá".
- **Pie:**
  - Botón único "Entendido" alineado a la derecha. Estilo botón primario (background `--color-text-info`, color blanco, padding 8x18px, font-size 13px).

**Comportamiento:**

- Click en "Entendido" o ✕ o fuera del modal → cierra sin acción.
- Esc cierra el modal.

**Nota técnica:** la imagen de la captura del Redirector (`1777861729916_image.png`) se incluye en el repo en `public/images/redirector-screenshot.png` o ubicación equivalente. Los badges flotantes se posicionan via CSS absoluto sobre la imagen.

### 2.6 Animación de transición entre estados

- **Estado 2 → Estado 3** (validado): el botón "Equipo conectado" aparece con fade-in suave (~200ms).
- **Estado 3 → Estado 4** (clic en "Equipo conectado"): cambio instantáneo (no animación), porque la animación principal vive en Mis órdenes (slide-in de la card nueva).
- **Estado 5 → Estado 0/1** (rechazo): el botón "Equipo conectado" desaparece con fade-out, vuelve al botón Descargar único.

---

## 3. Edge cases

1. **Cliente entra al portal sin estar logueado.** Login es previo a la pantalla principal (decisión OQ-9 sesión 12). Cliente sin login redirige al login, no ve el panel 4.

2. **Cliente recién logueado, sin órdenes ni pedido en armado.** Panel 4 en estado 0/1: solo botón Descargar Redirector. Cliente puede descargar libremente sin haber pagado nada.

3. **Cliente descarga Redirector pero nunca arma pedido.** No hay consecuencia. El Redirector es libre. Lo guarda para usarlo más tarde.

4. **Cliente arma pedido (paneles 1-2-3 editables), sube comprobante.** Panel 4 sigue en estado 0/1 → 2 (visualmente idénticos). Botón Descargar visible.

5. **Técnico valida el comprobante.** Vía SSE, panel 4 transiciona a estado 3 con fade-in del botón "Equipo conectado". Cliente lo aprieta cuando esté listo.

6. **Cliente aprieta "Equipo conectado" sin haber descargado Redirector.** Permitido — el clic crea la orden de todos modos. Pero el cliente NO va a poder pegar los códigos en ningún lado. Solución: el botón Descargar sigue visible en estado 4, el cliente puede descargar y configurar después. Lógicamente, la orden ya está en Mis órdenes y el técnico va a esperar conexión. Si el cliente no conecta nunca, la orden queda colgada (caso "técnico desconectado" cubierto por sistema de tiempos pendiente).

7. **Cliente aprieta "Equipo conectado" sin haber comprado equipo físicamente conectado al PC.** Igual al edge 6: la orden se crea, el técnico va a esperar. Cliente debe conectar después. Mecánica de "Equipo listo" en Mis órdenes (decisión sesión 13) cubre los equipos 2..N — pero para el equipo 1, la conexión se asume al apretar "Equipo conectado".

8. **Cliente cambia de técnico mientras tiene panel 4 abierto en estado 4.** Vía SSE, el endpoint `GET /api/portal/active-technician` devuelve el nuevo técnico. **Pero la orden ya nacida mantiene su Technician ID original** — no cambia retroactivamente. Esto es decisión del backend: el ID del técnico se "freeze-ea" al nacer la orden.

9. **Cliente recarga la página estando en estado 4.** El panel 4 se reconstruye desde el backend. La orden está en Mis órdenes (no se duplica), y los códigos siguen siendo los mismos.

10. **Cliente abre el panel en mobile con orden activa.** Panel 4 ocupa el cuarto bloque del stack vertical. Las dos cards (Technician ID, Código) siguen apiladas (ya estaban así en desktop). El modal "¿Dónde pegar?" ocupa ancho casi completo (`calc(100vw - 32px)`).

11. **Comprobante rechazado.** Vía SSE, panel 4 transiciona del estado 2 al 5 (visualmente idénticos al estado 0/1). Mientras tanto, panel 3 muestra el motivo de rechazo y permite reintento.

12. **Cliente apreta "Descargar Redirector" mientras está en estado 4.** Permitido — descarga el archivo otra vez. No afecta nada (es idempotente). Útil si cliente cambió de PC y necesita reinstalar.

13. **Click en el modal "¿Dónde pegar?" durante la subida del comprobante.** Permitido — el modal puede abrirse en cualquier estado donde el botón sea visible (solo estado 4). Mientras el botón esté visible, se puede abrir.

14. **Multiple clicks rápidos en "Equipo conectado".** Solo el primer click cuenta (debounce 1s en backend). Los siguientes se ignoran.

15. **Cliente quiere conectar más equipos después de haber apretado "Equipo conectado".** No puede agregar al pedido actual. Tiene que usar Mis órdenes ("Equipo listo" para los equipos 2..N que ya están en estado Pendiente) o crear una orden nueva (paneles 1-2-3 ya descongelados).

---

## 4. Responsive

**Sistema de breakpoints del portal (decisión vigente, NO se reabre):**

| Breakpoint | Rango | Layout de los 4 paneles |
|---|---|---|
| Mobile | <640px | 1 columna (paneles apilados) |
| Tablet | 640–899px | 2 columnas (2×2) |
| Laptop | 900–1199px | 4 columnas (estrechas pero legibles) |
| Desktop | 1200–1799px | 4 columnas cómodas |
| Ultrawide | ≥1800px | 4 columnas con `max-width: 1400px` centrado |

**El ancho del panel 4 NO es fijo 400px estricto.** El panel ocupa el ancho que le da el grid contenedor de la pantalla principal en cada breakpoint. Las medidas tipográficas y los spacings internos sí están fijos; solo el ancho exterior es fluido dentro del breakpoint.

Ver `public/portal-styles/00-breakpoints.css` (o equivalente). El sistema es el mismo para los 4 paneles — vive en la spec de `pantalla-principal-cliente.md`.

### 4.1 Mobile (<640px)

- Panel ocupa el ancho disponible del stack vertical de paneles. Ancho típico ~340px.
- Padding interno: `1.25rem 1rem`.
- Header 16px (igual a desktop).
- Botón Descargar: padding 9-10px, font-size 12-13px.
- Estado 3 botón "Equipo conectado": padding 14px, font-size 14px.
- Estado 4 cards Technician ID + Código: padding 8px, valores en monospace 11-12px.
- Estado 4 botón "¿Dónde pegar?": padding 8px, font-size 12px.
- Modal: ancho `calc(100vw - 32px)` máx 460px, captura del Redirector ajustada al ancho.

### 4.2 Tablet (640–899px)

- 2 paneles por fila (2×2). El panel 4 ocupa la mitad del ancho menos el gap.
- Mismos spacings y tipografía que desktop.

### 4.3 Laptop / Desktop / Ultrawide (≥900px)

- 4 paneles por fila. Ancho efectivo del panel 4 varía de ~280px (laptop estrecho) a ~340px (ultrawide topado en max-width).
- Padding interno: `1.25rem 1.5rem`.
- Botón Descargar: padding 10px, font-size 13px.
- Estado 3 botón "Equipo conectado": padding 16px, font-size 16px.
- Estado 4 cards: padding 10-12px, valores 12-13px.
- Modal: 480px ancho, captura del Redirector tamaño natural.

---

## 5. Comportamiento

| Acción | Resultado |
|---|---|
| Click en "Descargar Redirector v2.5" | Descarga directa del archivo `usb-redirector-customer.exe`. Sin pasos previos, sin login adicional. Disponible en todos los estados. |
| Click en "Equipo conectado" (estado 3) | Crea la orden en backend. Vía SSE, Mis órdenes recibe la card nueva con animación slide-in. Panel 4 transiciona a estado 4. Paneles 1-2-3 se descongelan. |
| Click en "Copiar" sobre Technician ID o Código | Copia el valor formateado al portapapeles. Botón cambia a "Copiado ✓" durante 1.5s. |
| Click en "¿Dónde pegar estos códigos?" | Abre modal con captura real del Redirector + badges 1°/2° + 3 pasos. |
| Click en "Entendido" / ✕ / fuera del modal | Cierra modal sin acción. |
| Esc | Cierra modal si está abierto. |
| Comprobante validado por técnico (vía SSE) | Panel 4 transiciona a estado 3 con fade-in del botón. |
| Comprobante rechazado por técnico (vía SSE) | Panel 4 transiciona a estado 5 (visualmente idéntico al 0/1). |
| Orden finaliza (todos los equipos `finished`) | Panel 4 vuelve al estado 0/1. Cliente queda listo para nuevo pedido. |
| Tab keyboard nav en estado 0/1/2/5 | Tab order: botón Descargar. |
| Tab keyboard nav en estado 3 | Tab order: botón "Equipo conectado" → botón Descargar. |
| Tab keyboard nav en estado 4 | Tab order: botón Copiar Technician ID → botón Copiar Código → botón "¿Dónde pegar?" → botón Descargar. |
| Recarga de página | Estado se reconstruye desde el backend. Sin pérdida de datos. |

**Sincronización en vivo:**

- Validación/rechazo del comprobante: vía SSE `/api/portal/orders/events`.
- Cambio de técnico activo: vía SSE en el endpoint `/api/portal/active-technician`. NO afecta órdenes ya nacidas.

**Comportamiento del panel 4 NO se congela** (a diferencia de paneles 1-2-3). Botón Descargar siempre clickable. Botón "Equipo conectado" solo aparece en estado 3 y solo es clickable mientras el comprobante esté validado.

---

## 6. Datos

### 6.1 Datos que necesita (inputs)

**Estado del panel 3** (para saber en qué estado del panel 4 estamos):

```json
{
  "paymentProof": {
    "status": "uploading" | "uploaded" | "validating" | "validated" | "rejected" | null
  }
}
```

**Estado de orden activa** (si existe, ya nacida):

```json
{
  "activeOrder": {
    "id": "PE-20260503-012",
    "code": "CL-20260503-012-2",
    "technicianId": "1000 9983 5478",
    "globalStatus": "in_progress" | "finished"
  }
}
```

**Endpoint de técnico activo** (para mostrar el ID antes que la orden nazca, no — solo después):

```http
GET /api/portal/active-technician
```

Devuelve:

```json
{
  "redirectorId": "1000 9983 5478",
  "swapInProgress": false
}
```

Solo se consume al momento de crear la orden (al apretar "Equipo conectado") para "freeze-ar" el ID en la orden.

**Recurso del Redirector v2.5** (para descarga):

```http
GET /downloads/usb-redirector-customer.exe
```

~9 MB. Servido directamente, sin auth.

### 6.2 Datos que produce

**Click en "Equipo conectado":**

```http
POST /api/portal/orders/create-from-validated-payment
```

Body: vacío (el backend tiene todo lo necesario en sesión: comprobante validado + estado de paneles 1, 2, 3).

Backend crea la orden, asigna el técnico activo, genera el código `CL-YYYYMMDD-NNN-Q`, devuelve los datos. Frontend transiciona al estado 4 y emite SSE para Mis órdenes.

**Click en "Descargar Redirector":**

Descarga directa, sin POST. Si querés tracking, agregar evento de analytics opcional (no bloquea la descarga).

### 6.3 Validaciones

**Frontend:**

- Botón "Equipo conectado" solo aparece y es clickable si `paymentProof.status === 'validated'`.
- Botón "¿Dónde pegar?" solo aparece si hay orden activa (`activeOrder` no null).
- Cards Technician ID + Código solo se muestran si `activeOrder` no null.

**Backend:**

- Re-validar al recibir POST: que haya comprobante validado, que panel 1, 2, 3 tengan datos coherentes, que el cliente esté logueado.
- Generar código `CL-YYYYMMDD-NNN-Q` correlativo único.
- "Freeze-ar" el Technician ID actual en la orden — no se actualiza si el técnico activo cambia después.

---

## 7. Acceptance criteria

**Layout y estilo:**

1. Header dice "Conexión" sin numeración delante.
2. Botón "Descargar Redirector v2.5" visible en TODOS los estados.
3. Botón "Descargar Redirector" tiene ícono ⬇ a la izquierda y color info.
4. Estado 3 muestra botón "Equipo conectado" prominente azul + botón Descargar abajo.
5. Estado 4 muestra cards Technician ID + Código apiladas verticalmente (no en columnas).
6. Estado 4 muestra botón "¿Dónde pegar estos códigos?" debajo de las cards.
7. Estados 0, 1, 2 y 5 son visualmente idénticos (solo botón Descargar centrado).
8. Estado 2 NO muestra "Esperando validación…" + spinner (decisión sesión 14 OQ-8 reabierta).

**Comportamiento — descarga:**

9. Click en "Descargar Redirector" descarga `usb-redirector-customer.exe`.
10. Botón clickable en TODOS los estados.
11. Sin gating de pago, sin login adicional.

**Comportamiento — Equipo conectado:**

12. Botón "Equipo conectado" solo visible cuando `paymentProof.status === 'validated'`.
13. Click crea la orden en backend, dispara SSE a Mis órdenes, transiciona panel 4 al estado 4.
14. Después del clic, paneles 1-2-3 se descongelan instantáneamente.
15. Card en Mis órdenes aparece con animación slide-in.
16. Multiple clicks rápidos: solo el primero cuenta (debounce backend).

**Comportamiento — datos en estado 4:**

17. Card "Technician ID" muestra el ID con formato `1000 9983 5478` (al copiar) y posiblemente compacto `100099835478` (visualmente, si el ancho lo requiere).
18. Card "Código" muestra el código con formato `CL-YYYYMMDD-NNN-Q` (al copiar) y posiblemente abreviado `CL-YYMMDD-NNN-Q` (visualmente, si el ancho lo requiere).
19. Click en "Copiar" copia el valor con formato completo.
20. Botón "Copiado ✓" durante 1.5s después de cada click.
21. Cuando la orden finaliza, panel 4 vuelve al estado 0/1.

**Comportamiento — modal "¿Dónde pegar?":**

22. Click en el botón abre modal centrado.
23. Modal muestra captura real del Redirector v2.5 (imagen `1777861729916_image.png`).
24. Badges azul "1° dato" al lado de label "Technician ID:" y verde "2° dato" al lado de "Additional information:".
25. 3 pasos numerados con círculos de color (azul, verde, gris).
26. Botón "Entendido" cierra el modal.
27. ✕ cierra el modal.
28. Esc cierra el modal.
29. Click fuera del modal cierra el modal.

**Comportamiento — sincronización:**

30. Validación del comprobante (vía SSE): panel 4 transiciona a estado 3 con fade-in.
31. Rechazo del comprobante (vía SSE): panel 4 transiciona a estado 5 (idéntico al 0/1).
32. Cambio de técnico activo NO afecta órdenes ya nacidas (Technician ID se freeze-a al nacer).

**Resiliencia:**

33. Recarga: estado del panel 4 se reconstruye desde el backend.
34. SSE caído: panel sigue funcional con datos cargados, banner ámbar en Mis órdenes.

**Accesibilidad:**

35. Botón "Equipo conectado" tiene `aria-label="Confirmar equipo conectado y crear orden"`.
36. Botón "Descargar Redirector" tiene `aria-label="Descargar Redirector v2.5"` y `download` attribute en el HTML.
37. Modal tiene `role="dialog"` y `aria-modal="true"`.
38. Tab order coherente en cada estado.

---

## 8. Open questions

**Estado al cierre de sesión 14:** las decisiones principales del panel 4 quedaron cerradas. Quedan OQ-residuales para refinar en sesiones siguientes.

### OQ-residuales (sesión 14)

**OQ-R1 — Captura del Redirector reemplazable.**

La captura `1777861729916_image.png` fue aportada por Bryam en sesión 14. Cuando salga una versión nueva del Redirector (v2.6, v2.7, etc.), la captura debe actualizarse. Pendiente: definir si la imagen vive en el repo (estática) o vive en Centro de configuración (admin la sube/reemplaza). Decisión provisional: vive en repo en `public/images/redirector-screenshot.png`. Cambia con cada versión del Redirector vía PR del repo.

**OQ-R2 — Formato compacto vs completo del Technician ID y Código.**

Decisión sesión 14: visualmente puede mostrarse compacto (sin espacios / año abreviado) si el ancho del panel lo requiere; al copiar, se copia el formato completo. **Pendiente:** definir umbral exacto de ancho a partir del cual se compacta (ej: <380px panel → compacto, ≥380px → completo). Confirmar en HTML standalone (sesión 14 mockup consolidado).

**OQ-R3 — Comportamiento de "Descargar Redirector" en mobile/tablet.**

El archivo `.exe` solo corre en Windows. ¿Cliente con celular Android/iPhone qué ve? Opciones:

- (a) Botón Descargar igual, descarga el .exe (cliente lo guarda para PC).
- (b) Botón Descargar oculto en mobile (detecta UA).
- (c) Botón Descargar con texto distinto en mobile ("Descargar para Windows").

Decisión provisional: (a) — el botón es igual en todas las plataformas, el cliente B2B sabe que el Redirector solo corre en Windows. **No bloquea esta spec.**

**OQ-R4 — Texto explicativo arriba del estado 4.**

Hoy el estado 4 muestra cards + botón sin texto explicativo. Si en producción se ve que clientes nuevos no entienden qué hacer con los códigos, se puede agregar texto ("Pegá estos datos en el Redirector"). Postergado a polish post-lanzamiento.

### OQ heredadas (cierran en otras specs)

- **OQ-H1 — Sistema de tiempos / lock pricing / alertas escaladas.** Cuando se haga la spec del sistema de tiempos, podrá agregar elementos al panel 4 (ej: timer de 2 min sin apretar "Equipo conectado", alertas escaladas, mecánica de cambio de precio post-X min). Hoy panel 4 NO tiene timers.
- **OQ-H2 — Caso "técnico desconectado" durante validación.** Si el técnico está offline y el comprobante queda colgado mucho tiempo, ¿panel 4 muestra alerta? Vive en spec del sistema de tiempos.

---

## Decisiones cruzadas que afectan otras specs

### Spec del panel operador (sesión futura)

El panel operador necesita exponer:

- Endpoint de validar/rechazar comprobante.
- Mecanismo de "agarrar pedido" (que cambia equipo individual de `waiting_technician` a `in_progress` en Mis órdenes).
- Mecanismo de finalizar equipo individual.
- Generación del Recibo de operación.
- Cambio de técnico activo (que afecta el endpoint `/api/portal/active-technician`).

### Spec del Centro de configuración → "Catálogo de equipos" / "Modelos no soportados" (sesión futura)

Si admin quiere actualizar la versión del Redirector (v2.5 → v2.6), debe haber:

- Endpoint o sub-sección de admin para subir el nuevo `.exe`.
- Update automático del texto del botón ("Descargar Redirector vX.Y").
- Reemplazo de la captura del Redirector en el modal.

**Por ahora la versión v2.5 vive hardcoded** en el frontend y el archivo `.exe` vive en `public/downloads/`.

### Spec del sistema de tiempos (input crudo HANDOFF, pausada)

Cuando se haga, define:

- Timer de 2 min sin apretar "Equipo conectado" (decisión vieja del HANDOFF, tentativa).
- Reemplazo del timer por alertas escaladas 1.5/3/5 min (propuesta de Bryam sesión 9, no aprobada).
- Caso "técnico desconectado" durante validación.
- Mecánica de cambio de precio post-X min.

### Spec de pantalla-principal-cliente.md (actualización en sesión 14)

Esta spec del panel 4 cierra el estado 2 reabierto en sesión 14 (OQ-8). La spec `pantalla-principal-cliente.md` v1.0 debe actualizarse a v1.1 reflejando la nueva decisión: panel 4 estado 2 = igual al 0/1 (sin "Esperando validación…").

---

## Changelog

- **panel-4-conexion.md v1.0** (2026-05-04, sesión 14) — Spec inicial completa con las 8 piezas. Decisiones principales:
  - Header "Conexión" (no "Conectar equipo" ni numeración).
  - Botón "Descargar Redirector v2.5" persistente en TODOS los estados (decisión OQ-10 sesión 12 ratificada).
  - Botón Descargar sin texto explicativo extra (decisión sesión 14).
  - 6 estados visibles definidos; estados 0/1/2/5 visualmente idénticos.
  - **OQ-8 reabierta y cerrada en sesión 14:** estado 2 NO muestra "Esperando validación…" + spinner. La señal de validación vive en panel 3 + paneles 1-2-3 congelados.
  - Botón "Equipo conectado" como núcleo del flujo (decisión OQ-4 sesión 12 ratificada). Apretarlo crea la orden y la mueve a Mis órdenes.
  - Sin texto guía arriba/abajo del botón "Equipo conectado" (decisión sesión 14).
  - Estado 4: cards Technician ID + Código apiladas verticalmente (no en columnas — decisión sesión 14).
  - Estado 4: botón "¿Dónde pegar estos códigos?" debajo de las cards.
  - Modal "¿Dónde pegar?" con captura real del Redirector v2.5 (`1777861729916_image.png` aportada por Bryam) + badges flotantes 1°/2° + 3 pasos numerados.
  - Sin "¿Necesitás más ayuda? Contactá por WhatsApp" (descartado en sesión 14).
  - Sin banner "Pago confirmado…" (descartado en OQ-5 sesión 12).
  - Formato compacto vs completo del Technician ID y Código a definir según ancho del panel.
  - Technician ID se "freeze-a" al nacer la orden (no cambia retroactivamente si el técnico activo cambia).
  - **Sistema de breakpoints unificado documentado:** mobile <640px (1 col) → tablet 640px (2 cols) → laptop 900px (4 cols) → desktop 1200px → ultrawide 1800px con max-width 1400px. Decisión heredada del rediseño responsive del portal viejo. El ancho del panel 4 NO es fijo 400px — es fluido dentro del breakpoint.
  - 4 OQ-residuales identificadas (OQ-R1 a OQ-R4): captura reemplazable, formato compacto, comportamiento mobile, texto explicativo de polish.
