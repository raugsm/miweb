# Panel 4 — Conexión

## Actualizacion v2.0 - Sesion 24 / Corte 5

**Fecha:** 2026-05-07.

**Decision:** el Panel 4 deja de tener el boton obligatorio `Equipo conectado`.
Despues de subir comprobante, la orden ya existe en seguimiento. Si el pago se
aprueba por humano o por IA, el operador puede procesar/finalizar desde el panel
operador sin esperar otra accion web del cliente.

**Nuevo contrato visual:**

- A: sin orden viva, muestra Technician ID si existe, codigo placeholder e instrucciones de preparacion.
- B: comprobante en revision o rechazado, mantiene codigo placeholder y estado informativo.
- C: pago aprobado o servicio activo, muestra codigo corto/real e instrucciones para abrir USB Redirector, conectar en sideload y mantener el equipo conectado.

**Ajuste de sesion 24 / Corte 6:** el `Codigo del proceso` no se muestra al cliente durante `PAGO_EN_REVISION` ni `PAGO_RECHAZADO`. Se muestra cuando el pago queda aprobado o el servicio esta vivo. Motivo: evitar que el cliente confunda comprobante recibido con orden tecnicamente procesable.

**Compatibilidad temporal:** `POST /api/portal/orders/:id/notify-connected`
permanece en backend y en un boton oculto del DOM para clientes con JS cacheado,
pero no forma parte del flujo principal ni desbloquea el trabajo del operador.

**Implicacion de formulario:** al pasar de pago en revision a pago aprobado,
el pedido queda en `Mis ordenes` y los paneles 1-3 vuelven a quedar disponibles
para una nueva orden. Panel 3 ya no usa `EN_PREPARACION` para mantener el cajon
verde como estado bloqueante.

**Nota de lectura:** el contenido v1.3 que sigue queda como historial. Si alguna
linea posterior contradice esta actualizacion v2.0, prevalece v2.0 hasta que se
reescriba el documento completo.

---

**Versión:** 1.3 · **Fecha:** 4 de mayo 2026 · **Estado:** spec formal con las 8 piezas, actualizada en sesión 15c. v1.3 ajusta el nombre real del binario del Redirector (`usbredirector-customer-module.exe`) ahora que la descarga está activa en el repo.

**Reemplaza a:** `panel-4-conexion.md` v1.1 (sesión 15c.1) y v1.0 (sesión 14).

---

## Cambios en v1.2 (sesión 15c — mini-spec)

Esta versión modifica el modelo de visibilidad de las cards Technician ID + Código del proceso. Hasta v1.1 las cards solo se mostraban en estado 4 (orden activa). En v1.2, las cards están **siempre visibles** desde que el cliente está logueado, con comportamiento de carga progresivo.

**Las 5 decisiones de la mini-spec:**

1. **Cards siempre visibles desde login.** Las cards Technician ID + Código aparecen no bien el cliente entra al portal logueado, sin importar si tiene orden, si subió comprobante, o si está apenas mirando.
2. **Technician ID cambia en vivo antes de que nazca la orden.** Si Jack y Angelo se cambian de turno mientras el cliente está mirando el panel, la card del Tech ID actualiza al ID nuevo automáticamente vía SSE. Cuando el cliente aprieta "Equipo conectado", el ID se "freeze-a" en la orden recién nacida y ya no cambia retroactivamente.
3. **Código del proceso aparece al subir el comprobante** (Escenario A). En el momento que el cliente sube el comprobante de pago en Panel 3, la card del Código pasa de placeholder a mostrar el código real (`CL-YYYYMMDD-NNN-Q`). El código se queda visible aunque el técnico rechace el comprobante.
4. **Texto placeholder de la card Código:** *"Aparecerá cuando subas tu pago"*. Se muestra mientras no haya código real generado.
5. **Botón Copiar de la card Código:** oculto mientras se muestra el placeholder. Aparece cuando aparece el código real.

**Implicación principal:** los 6 estados visuales de v1.1 se reorganizan. Ya no se diferencian por "qué cards se ven" sino por "si el botón 'Equipo conectado' aparece o no" y "si el Código del proceso está en placeholder o tiene valor real". Ver §2 actualizada.

---

## Contexto

Es el **panel 4 de los 4 paneles paralelos** que componen la pantalla principal cliente.

Cumple 3 funciones clave:

1. **Descarga del Redirector v2.5 siempre disponible** — desde el momento inicial, sin gating.
2. **Botón "Equipo conectado" post-validación** — el clic confirma que el equipo físico está conectado al PC y dispara los siguientes pasos del lado operador.
3. **Datos de conexión visibles desde login** — Technician ID + Código del proceso, que el cliente pega en el Redirector.

**Audiencia:** técnico de tienda. Familiar con la mecánica de bypass FRP. Repetidor de alta frecuencia.

**Posición en el flow:** columna 4 de la fila horizontal de paneles paralelos (desktop) o cuarto panel del stack vertical (mobile). El panel 4 tiene una particularidad: a diferencia de paneles 1-2-3, **NO se congela**. El cliente siempre puede descargar el Redirector y, en momentos apropiados, apretar "Equipo conectado".

**Decisión heredada de 15b.2 (D1):** la orden nace en Panel 3 cuando el cliente sube el comprobante. El botón "Equipo conectado" del Panel 4 NO crea la orden — usa el endpoint existente `POST /api/portal/orders/:id/notify-connected` para confirmar conexión física del equipo.

---

## 1. Mockup visual

**Estado del mockup:** decisiones visuales validadas en sesión 14 + sesión 15c. La estructura de los 6 estados (v1.0) cambia en v1.2 a 3 estados visuales reales (ver §2). El mockup HTML standalone consolidado (`docs/specs/cliente/mockups/pantalla-principal-cliente.html`) debe actualizarse para reflejar el nuevo modelo de cards siempre visibles.

### Estructura visual (desktop ~400px de ancho, mobile ~340px)

De arriba hacia abajo, dentro del panel:

1. **Header:** título "Conexión" en 16px, weight 500. Sin numeración delante.
2. **Card "Technician ID":** label arriba (11px secondary), valor en monospace (12-14px weight 500) sobre fondo `--color-bg-secondary`, botón "Copiar" a la derecha. **Visible siempre.**
3. **Card "Código del proceso":** mismo formato. Muestra placeholder *"Aparecerá cuando subas tu pago"* o el código real según el estado. **Visible siempre.** Botón "Copiar" oculto cuando muestra placeholder.
4. **Botón "Equipo conectado" (condicional):** aparece cuando `paymentProof.status === 'validated'`. Estilo prominente azul.
5. **Botón "¿Dónde pegar estos códigos?":** ancho completo, estilo secundario. Click → abre modal (§2.5). **Visible siempre** desde que las cards están visibles.
6. **Botón "Descargar Redirector v2.5":** persistente, abajo de todo. **Visible siempre.**

---

## 2. Componentes y estados (v1.2)

### 2.1 Modelo de estados rediseñado

A diferencia de v1.0/v1.1 (6 estados visuales), v1.2 tiene **3 estados visuales reales** definidos por dos variables:

- **¿Hay código del proceso?** Sí (existe orden creada en backend) / No (placeholder).
- **¿Está validado el comprobante?** Sí (botón "Equipo conectado" visible) / No (botón oculto).

Combinaciones:

| Estado | Código aparece | Botón "Equipo conectado" | Cuándo se da |
|---|---|---|---|
| **A — Inicial** | Placeholder | No | Cliente recién logueado, sin haber subido comprobante. |
| **B — Comprobante en validación** | Código real | No | Cliente subió comprobante, técnico aún no validó (o rechazó). |
| **C — Validado, pre-clic** | Código real | Sí | Técnico validó, cliente aún no apretó "Equipo conectado". |

**Equivalencia con los 6 estados antiguos (referencia para transición):**

- Estado 0/1 antiguo (sin pedido / armando) → **Estado A**.
- Estado 2 antiguo (validación en curso) → **Estado B**.
- Estado 3 antiguo (validado pre-clic) → **Estado C**.
- Estado 4 antiguo (orden activa post-clic) → ya no existe como estado del Panel 4 — la orden activa vive en Mis órdenes. El Panel 4 vuelve a Estado A (con el código de la última orden si todavía está activa, o placeholder si la orden finalizó).
- Estado 5 antiguo (rechazado) → **Estado B** (el código se queda, el rechazo se comunica en Panel 3).

### 2.2 Card "Technician ID" (siempre visible)

**Layout:**

- Label: *"Technician ID"* (11px secondary).
- Valor: ID del técnico activo en formato `1000 9983 5478` (12 dígitos espaciados de 4 en 4). Visualmente puede mostrarse compacto sin espacios (`100099835478`) si el ancho del panel lo requiere; al copiar, se copia el formato CON espacios.
- Botón "Copiar" a la derecha. **Siempre funcional.**

**Carga del ID:**

- Apenas el cliente entra al portal logueado, se llama a `GET /api/portal/active-technician`.
- Mientras el ID está cargando, la card muestra el label + un placeholder de carga discreto (ej: skeleton gris) en lugar del valor.
- Cuando responde el endpoint, la card muestra el ID real.

**Comportamiento dinámico (decisión 2 de la mini-spec):**

- Si el técnico activo cambia (Jack ↔ Angelo) mientras el cliente está mirando el panel y **la orden todavía no nació**: la card actualiza el ID en vivo vía SSE (mismo canal `/api/portal/orders/events` o el de admin-config implementado en 15a.2). Sin animación brusca — fade rápido entre el ID viejo y el nuevo.
- Cuando el cliente aprieta "Equipo conectado" (orden nace, ya estaba creada en Panel 3 pero acá se confirma conexión): el ID que estaba en pantalla en ese momento se "freeze-a" en la orden. Si el técnico activo cambia después, la card sigue mostrando el ID congelado de esa orden.

**Estado especial — sin orden activa:** la card muestra el ID del técnico activo en vivo (sin congelar), porque no hay orden a la cual asociarlo todavía.

**Estado especial — con orden activa (después de "Equipo conectado"):** la card muestra el ID congelado de esa orden. Si esa orden finaliza, la card vuelve a mostrar el ID del técnico activo en vivo.

### 2.3 Card "Código del proceso" (siempre visible)

**Layout:**

- Label: *"Código del proceso"* o *"Código"* (versión corta) (11px secondary).
- Valor: muestra dos cosas según estado:
  - **Estado placeholder** (sin haber subido comprobante): texto *"Aparecerá cuando subas tu pago"* (12-13px secondary, sin monospace, sin botón Copiar).
  - **Estado con código real** (post-subida de comprobante): valor en monospace `CL-YYYYMMDD-NNN-Q` (12-14px weight 500), con botón Copiar a la derecha.

**Transición placeholder → código real (decisión 3 de la mini-spec):**

- Trigger: cliente sube comprobante en Panel 3 (la orden nace en backend, decisión D1 de 15b.2).
- Vía SSE, el Panel 4 detecta que `state.customer.orders` tiene una orden nueva con `paymentProof.status === 'uploading' | 'validating'` o más avanzado.
- La card cambia de placeholder a código real con fade-in suave (~200ms).
- El botón Copiar aparece junto con el código.

**El código se queda aunque el comprobante sea rechazado** (decisión 3 de la mini-spec, Escenario A):

- Si el técnico rechaza el comprobante, la card del Código sigue mostrando `CL-20260504-001-2`.
- El rechazo se comunica en Panel 3 con sus propios mensajes (cajón rojo + motivo, implementado en 15b.2).
- Cliente sube otro comprobante → mismo código (la orden ya existe en backend).
- Cliente sube comprobante para pedido nuevo (después de finalizar el actual y descongelar paneles 1-2-3) → código nuevo.

**Riesgo de comunicación registrado:** el cliente puede ver el código y pensar "todo OK" antes de que el técnico valide. El Panel 3 cubre la comunicación del estado real del comprobante.

### 2.4 Botón "Equipo conectado" (condicional)

**Cuándo aparece:** solo cuando `paymentProof.status === 'validated'`.

**Estilo:** background azul primario `#185FA5`, color blanco, border-radius `--border-radius-md`, padding ~14-16px, font-size 14-16px, weight 500.

**Posición:** entre la card del Código y el botón "¿Dónde pegar?".

**Click:** llama al endpoint existente `POST /api/portal/orders/:id/notify-connected` (decisión 15c.1, hereda D1 de 15b.2). Esto:

1. Marca la orden con `customerConnectedAt`.
2. La orden cambia a estado `LISTO_PARA_CONEXION`.
3. Vía SSE, la card de Mis órdenes aparece con animación slide-in (si no estaba ya por estar la orden creada en Panel 3 — en ese caso solo cambia de estado).
4. Se "freeze-a" el Technician ID actual en la orden.
5. Paneles 1-2-3 se descongelan instantáneamente.

**Sin texto guía arriba ni abajo del botón** (decisión sesión 14).

**Por qué este botón importa:** representa el momento físico en que el equipo está conectado al PC del cliente y listo para que el técnico empiece el bypass. Aunque la orden ya nace en Panel 3 (decisión D1 de 15b.2), el "Equipo conectado" es la señal operativa real para el técnico.

### 2.5 Botón "¿Dónde pegar estos códigos?" (siempre visible)

**Visible siempre** desde que las cards están visibles (decisión derivada del modelo nuevo de cards).

**Cuando el cliente está en estado A (Código en placeholder):** el botón funciona y abre el modal igual. El cliente puede leer las instrucciones de uso del Redirector incluso antes de tener un código real.

**Click → abre modal (ver §2.6).**

### 2.6 Modal "¿Dónde pegar estos códigos?"

**Trigger:** click en el botón homónimo.

**Layout (decisión sesión 14):**

- Modal centrado, fondo overlay `rgba(0,0,0,0.45)`.
- Card blanco, ancho 480px (desktop) / `calc(100vw - 32px)` (mobile, máx 460), padding 1.5rem, border-radius `--border-radius-lg`, border 0.5px secondary.
- **Header:**
  - Título: "¿Dónde pegar estos códigos?" (h3, 18px, weight 500).
  - Botón ✕ cuadrado 28×28 alineado a la derecha.
  - Subtítulo: "Abrí el Redirector y completá estos 2 campos" (13px, color secondary).
- **Cuerpo principal:**
  - **Captura real del Redirector v2.5** — imagen `redirector-screenshot.png` (sube Bryam en 15c.2). Hasta entonces, mock SVG simulado del Redirector que ya existe en el repo.
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

### 2.7 Botón "Descargar Redirector v2.5" (siempre visible)

Sin cambios respecto a v1.1.

- Texto: "Descargar Redirector v2.5"
- Ícono: flecha hacia abajo (⬇) a la izquierda del texto.
- Estilo: background `--color-bg-info`, color `--color-text-info`, border 0.5px info, padding 8-10px, font-size 12-13px, weight 500.
- Click → descarga directa del archivo `usbredirector-customer-module.exe` (~9 MB) sin gating, sin pasos previos, sin login adicional.
- Posición: abajo de todo el panel, ocupando ancho completo.

### 2.8 Animaciones de transición

- **Cambio de Technician ID en vivo (sin orden):** fade rápido (~150ms) entre ID viejo y nuevo.
- **Aparición del código real (placeholder → real):** fade-in del valor + botón Copiar (~200ms).
- **Aparición del botón "Equipo conectado":** fade-in suave (~200ms).
- **Click en "Equipo conectado":** botón desaparece con fade-out, paneles 1-2-3 se descongelan instantáneamente.

---

## 3. Edge cases

1. **Cliente entra al portal sin estar logueado.** Login es previo a la pantalla principal. Cliente sin login no ve el Panel 4.

2. **Cliente recién logueado, sin órdenes ni pedido en armado.** Panel 4 muestra:
   - Card "Technician ID" con el ID del técnico activo (cargado vía endpoint).
   - Card "Código del proceso" con placeholder *"Aparecerá cuando subas tu pago"*, sin botón Copiar.
   - Botón "¿Dónde pegar estos códigos?" funcional.
   - Botón "Descargar Redirector" funcional.

3. **Cliente descarga Redirector pero nunca arma pedido.** No hay consecuencia. El Redirector es libre.

4. **Técnico activo cambia mientras cliente mira el panel sin orden.** Card del Tech ID actualiza en vivo vía SSE. El cliente puede ver el ID cambiar de Jack a Angelo en tiempo real.

5. **Cliente sube comprobante en Panel 3.** Card del Código pasa de placeholder a código real con fade-in. Botón Copiar aparece.

6. **Técnico valida el comprobante.** Vía SSE, panel 4 muestra el botón "Equipo conectado" con fade-in.

7. **Técnico rechaza el comprobante.** Card del Código sigue mostrando el código real (no vuelve a placeholder). Panel 3 comunica el rechazo. Botón "Equipo conectado" no aparece. Cliente puede subir otro comprobante.

8. **Cliente aprieta "Equipo conectado".** Tech ID se congela en esa orden. Card del Tech ID sigue mostrando ese ID. Si el técnico activo cambia después, la card sigue con el ID congelado. Cuando la orden finaliza, la card vuelve a mostrar el ID del técnico activo en vivo.

9. **Cliente recarga la página estando con orden activa.** El panel 4 se reconstruye desde el backend. Tech ID sigue siendo el de la orden (congelado). Código sigue siendo el de la orden.

10. **Cliente abre el panel en mobile con orden activa.** Cards Technician ID + Código apiladas (ya estaban así en desktop). Modal "¿Dónde pegar?" ocupa ancho casi completo.

11. **Click en "¿Dónde pegar?" antes de subir comprobante.** Modal se abre normal. Cliente puede leer las instrucciones aunque no tenga código todavía.

12. **Cliente apreta "Descargar Redirector" en cualquier estado.** Permitido — descarga el archivo. Idempotente.

13. **Multiple clicks rápidos en "Equipo conectado".** Solo el primer click cuenta (debounce backend).

14. **Cliente quiere conectar más equipos después de haber apretado "Equipo conectado".** No puede agregar al pedido actual. Tiene que usar Mis órdenes ("Equipo listo" para los equipos 2..N) o crear orden nueva (paneles 1-2-3 ya descongelados).

15. **Cliente ve código en card pero técnico rechazó.** Riesgo de comunicación: el cliente puede pensar "todo OK" porque ve el código. Mitigación: Panel 3 comunica el rechazo claramente con cajón rojo + motivo. Si en producción aparece confusión, considerar agregar un indicador visual en la card del Código (ej: borde rojo discreto) — pendiente para polish post-lanzamiento, no para 15c.2.

---

## 4. Responsive

Sin cambios respecto a v1.1. Sistema de breakpoints unificado del repo (Tailwind: 640 / 768 / 1024 / 1280 con max-width 1400px). Decisión D1 sesión 15: usar Tailwind del repo, ignorar números de spec hasta que las specs sean actualizadas en commit aparte.

### 4.1 Mobile (<640px)

- Cards Technician ID + Código apiladas (idéntico a desktop).
- Botón "¿Dónde pegar?" ancho completo.
- Botón Descargar ancho completo.
- Modal: ancho `calc(100vw - 32px)` máx 460px.

### 4.2 Tablet / Laptop / Desktop (≥640px)

- 2 / 4 columnas según breakpoint del grid de paneles.
- Cards apiladas dentro del panel (no hay diferencia visual interna).

---

## 5. Comportamiento

| Acción | Resultado |
|---|---|
| Cliente se loguea | Cards Technician ID + Código aparecen. Tech ID carga vía endpoint, Código muestra placeholder. |
| Click en "Copiar" sobre Technician ID | Copia el valor formateado al portapapeles. Botón cambia a "Copiado ✓" durante 1.5s. |
| Click en "Descargar Redirector v2.5" | Descarga directa del archivo `usbredirector-customer-module.exe`. |
| Click en "¿Dónde pegar estos códigos?" | Abre modal con captura del Redirector + badges 1°/2° + 3 pasos. |
| Click en "Entendido" / ✕ / fuera del modal | Cierra modal sin acción. |
| Esc | Cierra modal si está abierto. |
| Técnico activo cambia (sin orden) | Card Tech ID actualiza en vivo vía SSE con fade rápido. |
| Cliente sube comprobante en Panel 3 | Card del Código pasa de placeholder a código real con fade-in. Botón Copiar aparece. |
| Técnico valida comprobante | Aparece botón "Equipo conectado" con fade-in. |
| Técnico rechaza comprobante | Card del Código sigue mostrando el código. Botón "Equipo conectado" no aparece. Panel 3 comunica el rechazo. |
| Click en "Equipo conectado" | Llama a `notify-connected`. Tech ID se congela. Paneles 1-2-3 se descongelan. |
| Click en "Copiar" sobre Código | Copia el valor formateado. Botón cambia a "Copiado ✓" durante 1.5s. (Solo disponible si hay código real). |
| Orden finaliza | Tech ID vuelve a mostrar el técnico activo en vivo. Código vuelve a placeholder cuando ya no hay orden activa (al cabo de transición — definir en implementación). |
| Recarga de página | Estado se reconstruye desde el backend. Sin pérdida de datos. |

**Sincronización en vivo:** vía SSE `/api/portal/orders/events`. Eventos relevantes para Panel 4: validación/rechazo de comprobante, cambio de técnico activo, finalización de orden.

**Comportamiento del panel 4 NO se congela** (a diferencia de paneles 1-2-3).

---

## 6. Datos

### 6.1 Datos que necesita (inputs)

**Endpoint del técnico activo** (consumido al login y on SSE de cambio de técnico):

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

**Estado de la orden activa** (si existe en `state.customer.orders`):

```json
{
  "id": "PE-20260503-012",
  "code": "CL-20260503-012-2",
  "technicianId": "1000 9983 5478",
  "publicStatus": "PAGO_EN_REVISION" | "EN_PREPARACION" | "LISTO_PARA_CONEXION" | "EN_PROCESO" | "FINALIZADO" | "PAGO_RECHAZADO"
}
```

El Panel 4 deriva su estado de los campos de arriba:

- Si no hay orden activa → Estado A (placeholder).
- Si hay orden con `publicStatus` en `[PAGO_EN_REVISION, PAGO_RECHAZADO]` → Estado B (código real, sin botón "Equipo conectado").
- Si hay orden con `publicStatus === EN_PREPARACION` y `paymentProof.status === 'validated'` → Estado C (código real + botón "Equipo conectado").
- Si hay orden con `publicStatus` en `[LISTO_PARA_CONEXION, EN_PROCESO]` → Estado A para nueva interacción + Tech ID congelado de esa orden.

**Recurso del Redirector v2.5:**

```http
GET /downloads/usbredirector-customer-module.exe
```

### 6.2 Datos que produce

**Click en "Equipo conectado":**

```http
POST /api/portal/orders/:id/notify-connected
```

Body: vacío. Backend marca `customerConnectedAt`, mueve la orden a `LISTO_PARA_CONEXION`, "freeze-a" el Tech ID, dispara SSE.

**Click en "Descargar Redirector":** descarga directa, sin POST.

### 6.3 Validaciones

**Frontend:**

- Card del Código muestra placeholder si no hay orden con código generado.
- Botón Copiar de la card del Código solo se renderiza si hay código real.
- Botón "Equipo conectado" solo aparece si `paymentProof.status === 'validated'`.
- Tech ID se carga inicialmente y luego se actualiza en vivo si SSE indica cambio de técnico activo (mientras no haya orden congelada).

**Backend:**

- `notify-connected`: validar que la orden exista, que el comprobante esté validado, que el cliente sea el dueño de la orden.
- "Freeze-ar" el Technician ID en `notify-connected` si todavía no está freeze-ado.

---

## 7. Acceptance criteria (v1.2)

**Cards siempre visibles:**

1. Cliente recién logueado ve las dos cards (Tech ID + Código) y los botones (¿Dónde pegar?, Descargar).
2. Card Tech ID muestra el ID del técnico activo cargado vía endpoint.
3. Card Código muestra texto *"Aparecerá cuando subas tu pago"* sin botón Copiar.
4. Botón "Copiar" de la card Tech ID es siempre funcional.

**Comportamiento dinámico:**

5. Si el técnico activo cambia (sin orden), card Tech ID actualiza en vivo vía SSE.
6. Cuando cliente sube comprobante, card Código pasa de placeholder a código real con fade-in. Botón Copiar aparece.
7. Si técnico rechaza comprobante, card Código sigue mostrando el código (no vuelve a placeholder).
8. Si comprobante es validado, aparece botón "Equipo conectado" con fade-in.
9. Click en "Equipo conectado" llama a `notify-connected`, congela Tech ID, descongela paneles 1-2-3.

**Botones siempre visibles:**

10. Botón "¿Dónde pegar?" abre modal en cualquier estado.
11. Modal muestra captura real del Redirector (cuando se suba) o mock SVG actual.
12. Modal cierra con ✕, Esc, click fuera, o "Entendido".
13. Botón "Descargar Redirector" descarga `.exe` en cualquier estado.

**Layout y estilo:**

14. Header dice "Conexión" sin numeración.
15. Cards apiladas verticalmente (no en columnas).
16. Tech ID formato `1000 9983 5478` al copiar (con o sin espacios visualmente según ancho).
17. Código formato `CL-YYYYMMDD-NNN-Q` al copiar.
18. Botón "Copiado ✓" durante 1.5s después de cada copia.

**Resiliencia:**

19. Recarga: estado se reconstruye desde el backend. Sin pérdida de datos.
20. SSE caído: panel sigue funcional con datos cargados, banner ámbar en Mis órdenes.

**Accesibilidad:**

21. Botón "Equipo conectado" tiene `aria-label="Confirmar equipo conectado"`.
22. Botón "Descargar Redirector" tiene `aria-label="Descargar Redirector v2.5"` y `download` attribute.
23. Modal tiene `role="dialog"` y `aria-modal="true"`.
24. Tab order coherente.

---

## 8. Open questions

### OQ-residuales (sesión 15c, mini-spec)

**OQ-R1 — Captura del Redirector reemplazable.**

Sin cambios respecto a v1.1. Sigue pendiente la subida de la imagen real `redirector-screenshot.png` (sube Bryam en 15c.2). Hasta entonces, mock SVG actual.

**OQ-R2 — Formato compacto vs completo del Tech ID y Código.**

Sin cambios. Pendiente definir umbral exacto de ancho.

**OQ-R3 — Comportamiento de "Descargar Redirector" en mobile/tablet.**

Sin cambios. Decisión provisional: botón igual en todas las plataformas.

**OQ-R4 — Indicador visual de comprobante rechazado en card del Código.**

Nueva en v1.2. Riesgo de comunicación identificado: cliente puede ver el código y pensar "todo OK" cuando el comprobante está rechazado. ¿Agregar borde rojo discreto a la card del Código mientras el comprobante esté en `rejected`? Postergado a polish post-lanzamiento. No bloquea 15c.2.

**OQ-R5 — Qué pasa con la card del Código cuando la orden finaliza.**

Nueva en v1.2. Cuando la orden pasa a `FINALIZADO`, ¿la card del Código:

- (a) Vuelve a placeholder *"Aparecerá cuando subas tu pago"* — listo para próximo pedido.
- (b) Se queda mostrando el código de la última orden hasta que el cliente arme un pedido nuevo.
- (c) Otra cosa.

Decisión provisional: (a). Coherente con la lógica de "el código aparece al subir comprobante" — sin comprobante actual, no hay código. Confirmar en implementación 15c.2.

### OQ heredadas

- **OQ-H1 — Sistema de tiempos / lock pricing / alertas escaladas.** El sistema de 3 fases / 5 min implementado en 15a-15b para Panel 3 ya cubre lo que en v1.0 se proponía como "timer 2 min" en Panel 4. Banner "🔧 ¿Listo para conectar?" eliminado en 15c.1. La spec del sistema de tiempos sigue pendiente para formalizar las 3 fases completas.
- **OQ-H2 — Caso "técnico desconectado" durante validación.** Vive en spec del sistema de tiempos.

---

## Decisiones cruzadas que afectan otras specs

### Spec del panel operador (sesión futura)

Sin cambios respecto a v1.1. Necesita exponer endpoints de validar/rechazar comprobante, agarrar pedido, finalizar equipo individual, generar Recibo de operación, cambiar técnico activo.

### Spec de pantalla-principal-cliente.md (actualización pendiente)

La spec `pantalla-principal-cliente.md` v1.1 debe actualizarse a v1.2 para reflejar el nuevo modelo de cards siempre visibles del Panel 4. Cambios concretos:

- Tabla de estados del Panel 4: pasar de 6 estados a 3.
- Mockup HTML standalone consolidado: actualizar la representación visual del Panel 4 (cards siempre visibles).

Esto se hace cuando se cierre 15c completo (15c.1 + 15c.2 + 15c.3 + 15c.4), en una sesión chica de actualización de specs.

### Spec del sistema de tiempos (input crudo HANDOFF, parcialmente implementada en 15a-15b)

Sin cambios. El sistema de 3 fases / 5 min ya está implementado en Panel 3. Pendiente formalizar la spec.

---

## Changelog

- **panel-4-conexion.md v1.3** (2026-05-04, sesión 15c.3) — Descarga real del Redirector activa. El binario `usbredirector-customer-module.exe` se sube al repo en `public/downloads/` y el botón "Descargar Redirector v2.5" pasa de `<button>` no-op a `<a href="/downloads/usbredirector-customer-module.exe" download>`. Spec actualiza el nombre real del archivo en §2.7 (era `usb-redirector-customer.exe` placeholder), §5 (tabla acciones), §6.1 (recurso). Sin cambio visual del botón.
- **panel-4-conexion.md v1.2** (2026-05-04, sesión 15c — mini-spec) — Cambio en el modelo de cards. Las dos cards (Tech ID + Código) pasan de "solo visibles en estado 4" a "siempre visibles desde login". 5 decisiones nuevas:
  - Cards visibles desde que el cliente está logueado.
  - Tech ID cambia en vivo antes de que la orden nazca, se congela al apretar "Equipo conectado".
  - Código aparece al subir comprobante, se queda aunque rechacen.
  - Texto placeholder de la card Código: *"Aparecerá cuando subas tu pago"*.
  - Botón Copiar de la card Código: oculto mientras se muestra placeholder.
  - Modelo de 6 estados visuales (v1.0/v1.1) reorganizado en 3 estados visuales reales (A, B, C).
  - 2 OQ-residuales nuevas (R4: indicador visual de rechazo, R5: comportamiento al finalizar orden).
  - Riesgo de comunicación registrado: cliente puede ver código antes de validación.

- **panel-4-conexion.md v1.1** (2026-05-04, sesión 15c.1) — El botón "Equipo conectado" usa endpoint existente `notify-connected` en lugar de crear endpoint nuevo `create-from-validated-payment`. Reflejo de decisión D1 de 15b.2 (orden nace en Panel 3, no en Panel 4). El efecto visual para el cliente NO cambia.

- **panel-4-conexion.md v1.0** (2026-05-04, sesión 14) — Spec inicial completa con las 8 piezas. Decisiones principales heredadas:
  - Header "Conexión" sin numeración.
  - Botón "Descargar Redirector v2.5" persistente en todos los estados.
  - 6 estados visibles definidos (reorganizados en v1.2).
  - OQ-8 reabierta y cerrada en sesión 14: estado 2 NO muestra "Esperando validación…".
  - Botón "Equipo conectado" como núcleo del flujo.
  - Modal "¿Dónde pegar estos códigos?" con captura real del Redirector + badges 1°/2° + 3 pasos.
  - Sin "¿Necesitás más ayuda? WhatsApp" (descartado).
  - Sin banner "Pago confirmado…" (descartado).
  - 4 OQ-residuales identificadas.
