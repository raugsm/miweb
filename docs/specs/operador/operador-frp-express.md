# Operador — Panel FRP Express

**Versión:** 1.1 · **Fecha:** 2 de mayo 2026 · **Estado:** aprobado por Bryam, listo para implementación

**Cambios respecto a v1.0:** Las 8 Open Questions originales se resolvieron con Bryam. Las decisiones están integradas en las secciones correspondientes.

---

## Contexto

Pantalla principal del panel operador donde Jack o Angelo (los técnicos de AriadGSM) procesan los pedidos de FRP Express que llegan desde el portal cliente. Es una vista de **trabajo en vivo**: cuando un cliente conecta su equipo (paso 4 del portal), el job correspondiente entra acá listo para que el técnico lo procese.

**Audiencia:** técnicos internos de AriadGSM (Jack, Angelo). Acceden desde `ops.ariadgsm.com`. Conocen el dominio profundamente y procesan ~130 órdenes/día.

**Posición en el flujo:** una vez que el cliente terminó los 4 pasos del portal y apretó "Equipo conectado", el job aparece en la cola de este panel. El técnico lo toma, procesa el equipo (manualmente con USB Redirector + herramientas externas), y marca finalizado.

**Restricción crítica:** **un técnico activo a la vez**. Existe un switch Jack ↔ Angelo con ventana de bloqueo `ARIAD_TECHNICIAN_SWAP_MS` (default 10s). Solo el técnico activo recibe los datos del Technician ID nuevo.

**Característica clave del bypass:** el bypass de FRP en sí dura **5-10 segundos**. La interfaz del operador acompaña el antes y el después del bypass, no el durante. Esto significa que decisiones como "cancelar de raíz" son seguras — no hay equipos físicamente conectados durante minutos.

**Lo que esta spec NO cubre:** otras tabs del panel operador (Tickets, Clientes, Precios, Cierre diario, Usuarios, Auditoría) ni el modal de "Reportar problema" (es spec separada). Esta es solo la pantalla "FRP Express" / "Solicitudes FRP web".

---

## 1. Mockup visual

Archivo: `docs/specs/operador/mockups/operador-frp-express.html`

**Estructura visual de arriba hacia abajo:**

1. **Header del panel:** label "PANEL OPERADOR" + título "FRP Express" + badge a la derecha indicando técnico activo (ej. "Jack activo" con dot verde pulsante).
2. **Sección "TU TRABAJO ACTUAL":** card grande con el job que el técnico tomó. Muestra orden + cliente + servicio + Technician ID + Código del proceso + dos botones (Marcar finalizado / Reportar problema). Si no hay job tomado, card vacía con CTA grande "Tomar siguiente".
3. **Sección "COLA · X listos":** lista vertical de jobs en estado `LISTO_PARA_TECNICO` con botón "Tomar" en cada uno + filtro VIP en el header.
4. **Sección "PAGOS POR REVISAR" + "ATENCIÓN":** grid de 2 columnas. A la izquierda, comprobantes de pago pendientes de revisar (color amber). A la derecha, jobs con problemas que requieren atención (color rojo).
5. **Sección "FINALIZADOS HOY":** tabla compacta con los jobs finalizados del día (de **ambos** técnicos). Sin acciones — es informativa pura.

---

## 2. Componentes y estados

### 2.1 Header del panel

Estático en cuanto a layout. El badge de técnico activo cambia según switch.

| Estado | Apariencia |
|---|---|
| Jack activo | Badge verde claro + dot verde pulsante + "Jack activo" |
| Angelo activo | Badge verde claro + dot verde pulsante + "Angelo activo" |
| En transición (10s ventana) | Badge gris + dot gris no pulsante + "Cambiando técnico…" |
| Ninguno activo (raro) | Badge rojo claro + dot rojo + "Sin técnico activo" |

### 2.2 Card "TU TRABAJO ACTUAL"

| Estado | Trigger | Apariencia |
|---|---|---|
| Con job tomado (normal) | Job en `EN_PROCESO` con `takenBy === currentUser.id`, tomado hace <30 min | Card blanco con border 0.5px, datos del job, botones Finalizar (primary) + Reportar problema (secondary) |
| Con job tomado (timeout 30 min) | Mismo job pero `(now - takenAt) > 30 min` | Mismo card pero con **banner amarillo arriba**: "Este job lleva 30+ min. ¿Necesitás ayuda?" + botones [Sigo trabajando] (cierra banner por 30 min más) y [Cancelar job] (cancela el job, libera) |
| Con job tomado por otro (visible solo al ver de Jack como Angelo) | Job en `EN_PROCESO` con `takenBy !== currentUser.id` | Card en modo lectura: datos visibles, botones disabled con texto "Tomado por [Jack]" |
| Sin job + cola con jobs | No hay job tomado y la cola tiene `LISTO_PARA_TECNICO` | Card dasheado gris con texto "Sin trabajo actual" + botón grande "Tomar siguiente" (primary, full-width) |
| Sin job + cola vacía | No hay job tomado y la cola está vacía | Card dasheado gris con texto "Sin trabajo actual. Esperando que clientes conecten equipos." + botón "Tomar siguiente" disabled |
| Loading (al apretar Marcar finalizado) | Click en Finalizar enviado al backend | Botón primario muestra spinner, ambos botones disabled hasta respuesta |
| Job cancelado por reversión de pago | Pago revertido por admin mientras el job estaba `EN_PROCESO` | Card cambia a estado vacío + toast rojo "Job cancelado: el pago fue revertido" |
| Error de finalización | Backend devuelve error | Toast rojo con mensaje, card vuelve a estado normal |

**Datos visibles cuando hay job tomado:**
- Header: `<orderCode> · <jobSequence> de <orderQuantity>` (ej. "ORD-20260502-008 · 1 de 5 equipos")
- Nombre del cliente
- Servicio + ARD code (ej. "Xiaomi Cuenta Google · ARD012-AL")
- Tiempo desde que lo tomó (relativo, "tomado hace 3 min")
- Technician ID (copiable, monospace)
- Código del proceso (copiable, monospace)

### 2.3 Filtro VIP en cola

Elemento nuevo en el header de la sección "COLA". Permite filtrar la cola por jobs de clientes VIP.

| Estado | Apariencia |
|---|---|
| Default (todos) | Toggle off, fondo blanco, texto "Solo VIP" gris |
| Filtrado VIP | Toggle on, fondo amarillo claro, texto "Solo VIP" + contador (ej. "Solo VIP · 2") |
| Sin VIPs en cola | Toggle visible pero al activarlo muestra "No hay VIPs en cola" en lugar de la lista |

### 2.4 Card de cola (cada item de la lista)

| Estado | Trigger | Apariencia |
|---|---|---|
| Default | Job en `LISTO_PARA_TECNICO`, técnico activo no lo tiene tomado | Card blanco, border 0.5px, datos resumidos, botón "Tomar" outline |
| VIP | Mismo + cliente.status === 'VIP' | Igual que default + badge dorado pequeño "VIP" arriba a la derecha |
| Hover (desktop) | Mouse encima del card | Borde se vuelve más oscuro, fondo levemente gris |
| Loading (al apretar Tomar) | Click en Tomar enviado al backend | Botón muestra spinner, card disabled |
| Tomado por otro técnico (carrera) | Backend rechaza take porque otro lo tomó primero | Card desaparece de la lista (refresh SSE) + toast informativo "Otro técnico tomó este job" |

**Datos visibles:**
- Header: `<orderCode> · <quantity> equipo(s)` + badge VIP (si aplica)
- Nombre del cliente + servicio
- Tiempo desde conexión del cliente
- Botón "Tomar"

### 2.5 Card "PAGOS POR REVISAR" (cada item)

| Estado | Trigger | Apariencia |
|---|---|---|
| Default | `frpOrder.paymentStatus === 'PAGO_EN_VALIDACION'` | Card amber claro, border amber, click abre modal de revisión |
| Hover | Mouse encima | Fondo amber un poco más oscuro |
| Loading (mientras se aprueba/rechaza) | Acción en modal enviada al backend | Modal con spinner |

**Datos visibles:**
- Order code
- Cliente + monto en moneda local (ej. "Roberto Díaz · S/ 62.05")
- Link "Ver comprobante →"

### 2.6 Card "ATENCIÓN" (cada item)

| Estado | Trigger | Apariencia |
|---|---|---|
| Default | Job en `REQUIERE_REVISION` o `frpOrder.paymentStatus === 'COMPROBANTE_RECHAZADO'` con cliente esperando | Card rojo claro, border rojo |
| Hover | Mouse encima | Fondo rojo un poco más oscuro |

**Datos visibles:**
- Order code
- Cliente
- Razón del problema (ej. "Modelo no soportado · revisar")
- Link "Resolver →"

### 2.7 Tabla de finalizados

Estado único, informativa. Muestra finalizados de **ambos técnicos** (Jack y Angelo) del día actual. Cada fila:
- Order code (formato corto, ej. "ORD-007-1")
- Cliente + ARD code (ej. "RAUL GSM · ARD012-AL")
- Hora de finalización (ej. "14:32")
- Técnico que finalizó (avatar pequeño o iniciales: "J" para Jack, "A" para Angelo)

Sin acciones. Sin botones. Click en "Ver todos →" del header lleva a vista filtrada de histórico (esa vista no es parte de esta spec).

### 2.8 Botones genéricos

| Tipo | Apariencia |
|---|---|
| Primary | Fondo `#185FA5`, texto blanco, hover `#0C447C`, disabled fondo gris |
| Secondary | Fondo blanco, border 0.5px gris medio, texto primary, hover fondo gris claro |
| Take (outline pequeño) | Fondo blanco, border 0.5px azul claro, texto azul, hover fondo azul muy claro |
| Banner action [Sigo trabajando] | Fondo amarillo medio, texto marrón oscuro |
| Banner action [Cancelar job] | Fondo blanco, border rojo, texto rojo |

---

## 3. Edge cases

### 3.1 Switch técnico mientras tenés job tomado **[DECISIÓN: el job se queda con quien lo tomó]**

Si Jack tiene un job en `EN_PROCESO` y Angelo se vuelve activo:
- El job mantiene `takenBy = jack.id` aunque Angelo sea el activo.
- Angelo ve el job en la sección "TU TRABAJO ACTUAL" pero en modo lectura, con botones disabled y texto "Tomado por Jack".
- Cuando Jack vuelve a estar activo, retoma su job desde donde lo dejó.
- **Razón:** el equipo del cliente está físicamente conectado en la PC de Jack. Angelo no tiene acceso al equipo real.

### 3.2 Pago revertido mientras el job está `EN_PROCESO` **[DECISIÓN: cancelación de raíz]**

Si Bryam (admin) revierte una aprobación de pago después de que el job ya estaba en `EN_PROCESO`:
- El job se cancela automáticamente sin importar el estado.
- En la pantalla del técnico aparece un toast rojo: "Job cancelado: el pago fue revertido".
- El card "TU TRABAJO ACTUAL" cambia al estado vacío.
- **Razón:** el bypass real dura 5-10 segundos. La probabilidad de que alguien revierta justo durante esos segundos es muy baja. Si pasa, el equipo no se daña porque el bypass o ya terminó o ni empezó.

### 3.3 Job lleva más de 30 minutos en proceso **[DECISIÓN: banner con opciones]**

Si el técnico tomó un job hace más de 30 minutos y todavía no lo finalizó:
- Aparece banner amarillo arriba del card: "Este job lleva 30+ min. ¿Necesitás ayuda?"
- Banner tiene 2 botones:
  - **[Sigo trabajando]** → cierra el banner. Vuelve a aparecer 30 min después si todavía no se finalizó.
  - **[Cancelar job]** → cancela el job (vuelve a `LISTO_PARA_TECNICO` o se mueve a `REQUIERE_REVISION`, decisión técnica al implementar).
- El técnico decide. No hay autocancelación.

### 3.4 Cola vacía + sin job tomado

Mensaje "Sin trabajo actual. Esperando que clientes conecten equipos." Botón "Tomar siguiente" disabled. Cuando un job entra (vía SSE), la cola se actualiza en vivo y suena el beep (ver sección 5.5).

### 3.5 Carrera de tomado

Dos técnicos no pueden estar activos al mismo tiempo (restricción de switch). Pero entre el momento que un técnico ve el botón "Tomar" y aprieta, podría haber `ARIAD_TECHNICIAN_SWAP_MS` ventana donde el otro se vuelve activo y tomó otro job. El backend resuelve por timestamp y devuelve error al segundo intento. UI muestra toast: "Otro técnico tomó este job".

### 3.6 Cliente desconecta el equipo durante procesamiento

El bypass dura 5-10s, así que esto raramente pasa. Si pasa: el job sigue en `EN_PROCESO` con el técnico. Si el técnico no logra finalizar, aprieta "Reportar problema".

### 3.7 Conexión perdida con el servidor (SSE caído)

Banner amarillo arriba del panel: "Reconectando…" con dot pulsante. Reintenta cada 25s (heartbeat default). Mientras está caído, la UI no actualiza datos pero los datos ya cargados quedan visibles.

### 3.8 Sesión del técnico expirada

Redirige a `/login` automáticamente. No muestra datos viejos.

### 3.9 Cliente con texto muy largo (nombre, servicio)

Truncar con `text-overflow: ellipsis` después de 2 líneas en el card actual, 1 línea en cards de cola/atención.

### 3.10 Cero finalizados hoy

Sección entera oculta o con texto "Sin finalizados hoy".

### 3.11 Cola muy larga + filtro VIP

Si la cola tiene 10+ jobs (caso pico que vos mencionaste) y se activa filtro VIP, se muestran solo los VIP. Si no hay VIPs, mensaje "No hay VIPs en cola, mostrando todos…" y se desactiva el filtro automáticamente.

---

## 4. Responsive

### 4.1 Desktop (`≥1024px`)
- Container max-width 960px, centrado.
- Card "Tu trabajo actual" a ancho completo.
- Cola con cards horizontales (info a la izq, botón Tomar a la dcha).
- Filtro VIP en el header de la sección Cola, alineado a la derecha.
- Pagos por revisar y Atención en grid 2 columnas.
- Finalizados como tabla compacta con columna de técnico.

### 4.2 Tablet (`768px – 1023px`)
- Container max-width 720px, centrado.
- Mismo layout que desktop, todo más compacto.

### 4.3 Mobile (`<768px`)
- Container full-width.
- Card "Tu trabajo actual": data cells en 1 columna, botones apilados.
- Cola: cards verticales con botón Tomar abajo (no a la derecha).
- Filtro VIP en línea separada arriba de la cola.
- Pagos por revisar y Atención en 1 columna apilada.
- Finalizados sin columna de técnico (espacio limitado), inicial al final del nombre.

**Nota:** el panel operador está pensado para desktop primariamente. Mobile es soporte secundario.

---

## 5. Comportamiento (interaction logic)

### 5.1 Mapeo a endpoints

| Acción UI | Endpoint backend | Resultado |
|---|---|---|
| Apretar "Tomar siguiente" (card vacío) | `POST /api/frp/jobs/take-next` | Toma el job más antiguo de la cola |
| Apretar "Tomar" en card específica de cola | **`POST /api/frp/jobs/:id/take` [ENDPOINT NUEVO A AGREGAR]** | Toma ese job específico. Si ya fue tomado por otro, devuelve 409. |
| Apretar "Marcar finalizado" | `PATCH /api/frp/jobs/:id/finalize` | Cambia estado a `FINALIZADO`, registra `doneAt`, dispara generación de PDF cliente |
| Apretar "Reportar problema" | Abre modal (otra spec). Modal llama `PATCH /api/frp/jobs/:id/review` con razón + categoría |
| Apretar "Sigo trabajando" en banner 30 min | (sin endpoint) cierra banner client-side, lo re-abre 30 min después |
| Apretar "Cancelar job" en banner 30 min | `PATCH /api/frp/jobs/:id/cancel` (ya existe o agregar) | Cancela el job, libera al técnico |
| Toggle "Solo VIP" | (sin endpoint) filtro client-side sobre la cola ya cargada |
| Apretar "Ver comprobante" | Abre modal con `paymentProofs[]` + botones Aprobar/Rechazar |
| Apretar "Aprobar" en modal de comprobante | `PATCH /api/frp/orders/:id/payment-review` (action: approve) | Aprueba pago, dispara lock 15min |
| Apretar "Rechazar" en modal de comprobante | `PATCH /api/frp/orders/:id/payment-review` (action: reject) | Rechaza pago, vuelve a cliente con razón |
| Reversión de pago aprobado (admin desde otra vista) | (endpoint admin existente) | Si hay job en `EN_PROCESO`, lo cancela. Toast en panel operador. |

### 5.2 Real-time updates (SSE)

- El panel se suscribe a stream SSE del operador.
- Eventos que disparan refresh:
  - Cliente apreta "Equipo conectado" → job nuevo aparece en cola + dispara beep (si aplica)
  - Cliente sube comprobante → card aparece en "Pagos por revisar"
  - Otro admin/técnico aprueba/rechaza un pago → card desaparece o cambia
  - Otro técnico (en sesión paralela) toma un job → card desaparece de la cola
  - Switch técnico activado → badge del header cambia
  - Pago revertido sobre job en proceso → toast rojo + card de trabajo actual se vacía
  - Job pasa a 30 min → banner amarillo aparece en card de trabajo actual

### 5.3 Filtro VIP

- Toggle client-side, no requiere endpoint.
- Filtra la cola ya cargada por `cliente.status === 'VIP'`.
- Persiste en sessionStorage del técnico (si lo apaga y vuelve, queda como lo dejó).
- Si filtro activo y entran jobs nuevos no-VIP, no aparecen en la vista filtrada (pero el contador "COLA · X" sigue contando todos).

### 5.4 Validaciones antes de actions

- "Marcar finalizado" requiere que `job.takenBy === currentUser.id`. Si no, botón disabled con tooltip "Solo quien tomó el job puede finalizarlo".
- "Tomar" no permite tomar si ya hay un job en `EN_PROCESO` para este técnico. Botón disabled.
- "Aprobar comprobante" requiere rol `ADMIN` o `COORDINADOR`. Si rol `ATENCION_TECNICA`, botón disabled con tooltip "Permisos insuficientes".
- Cuando hay switch en transición (10s), todos los botones de acción están disabled.

### 5.5 Notificación sonora (beep)

- Sonido corto (0.3s, frecuencia ~880Hz) cuando entra un job nuevo a la cola.
- **Solo suena si el técnico no tiene job tomado** (no interrumpir si está procesando).
- **Solo suena si el tab está visible** (no molestar si está minimizado en background).
- El técnico puede silenciar con un toggle en algún lugar del panel (preferencia local en localStorage). **Default: ON.**
- Sonido se carga como audio embebido (data URI), no requiere request externo.

### 5.6 Keyboard shortcuts (opcional, no implementar en v1.1)

Reservado para v2:
- `T` → Tomar siguiente
- `F` → Marcar finalizado
- `R` → Reportar problema

---

## 6. Datos (data requirements)

### 6.1 Datos que necesita

**Modelos existentes a leer (no se modifican):**

`frpJob`:
- `id`, `frpOrderId`, `ardCode`, `status` (enum)
- `takenBy`, `takenAt`, `doneAt`
- `requiredStateConfirmed`, `modelSupported`, `clientConnected`

`frpOrder`:
- `id`, `code` (formato `ARD-YYYYMMDD-NNN`)
- `paymentStatus`, `orderStatus`, `checklist`, `paymentProofs[]`

`customerOrder`:
- `code` (formato `CL-YYYYMMDD-NNN`), `quantity`, `paymentMethod`, `totalPrice`, `priceFormatted`

`customerClient`:
- `name`, `whatsapp`, `country`, `status` (incluye `VIP`)

`activeTechnician`:
- `userId`, `redirectorId`, `switchedAt`, `swapEndsAt`

### 6.2 Endpoints a agregar al backend

**Nuevo:** `POST /api/frp/jobs/:id/take`
- Body: vacío
- Auth: requiere rol `ADMIN`/`COORDINADOR`/`ATENCION_TECNICA`
- Lógica: si `job.status === 'LISTO_PARA_TECNICO'` y el técnico está activo → toma el job (igual que take-next pero para uno específico)
- Respuestas: 200 con job actualizado, 409 si ya fue tomado por otro, 403 si no es técnico activo, 422 si el job no está en estado válido

**Verificar que existe:** `PATCH /api/frp/jobs/:id/cancel`
- Si no existe, agregar
- Body: `{ reason: 'timeout' | 'payment_reverted' | 'manual', note?: string }`
- Auth: técnico que tomó el job, o ADMIN

### 6.3 Validaciones

**Frontend:**
- Solo mostrar el panel a usuarios con rol `ADMIN`, `COORDINADOR`, o `ATENCION_TECNICA`.
- Botones de aprobación de pago solo a `ADMIN` y `COORDINADOR`.
- Botón "Marcar finalizado" solo si `job.takenBy === currentUser.id`.
- Botón "Tomar" disabled si el técnico no es el activo del momento.

**Backend** (ya implementado, no se toca):
- Validación de rol en cada endpoint.
- Validación de transición de estado.
- Lock 15min al aprobar pago.

---

## 7. Acceptance criteria

**Layout y estilo:**
1. Header del panel muestra título "FRP Express" y badge con técnico activo (Jack o Angelo).
2. Badge tiene dot verde pulsante con animación.
3. Card "Tu trabajo actual" ocupa ancho completo y tiene borde 0.5px.
4. Cards de cola están en lista vertical con gap de 6px.
5. Cards VIP en cola tienen badge dorado "VIP" arriba a la derecha.
6. Pagos por revisar y Atención están en grid de 2 columnas en desktop, 1 columna en mobile.
7. Finalizados muestra como tabla con filas separadas por borde, con columna/inicial del técnico que finalizó.

**Funcionalidad básica:**
8. Al cargar el panel, se hace fetch del estado actual y se renderiza con datos reales.
9. SSE establecido al cargar, reconecta cada 25s si se cae.
10. Botón "Tomar siguiente" disabled si la cola está vacía.
11. Click en "Tomar siguiente" llama `POST /api/frp/jobs/take-next` y actualiza la UI con el job tomado.
12. Click en "Tomar" de un card específico llama `POST /api/frp/jobs/:id/take` y actualiza la UI.
13. Si otro técnico toma un job, el card desaparece de la cola en menos de 2s (vía SSE) + toast "Otro técnico tomó este job".
14. Click en "Marcar finalizado" llama `PATCH /api/frp/jobs/:id/finalize`, refresca el panel, mueve el job a Finalizados.
15. Click en "Reportar problema" abre modal de reportar problema (otra spec).
16. Click en "Ver comprobante" abre modal con paymentProofs y botones de aprobar/rechazar.
17. Approve de un comprobante llama `PATCH /api/frp/orders/:id/payment-review` y dispara lock 15min.

**Estados especiales:**
18. Si el técnico activo es Jack y currentUser es Angelo (visualizando el panel), el botón "Tomar" está disabled con tooltip.
19. Si rol es `ATENCION_TECNICA`, los botones de aprobar/rechazar pago están disabled.
20. Durante el switch (10s ventana), badge del header dice "Cambiando técnico…" en gris y todos los botones de acción están disabled.
21. Si la sesión del técnico expira, redirige a `/login` automáticamente.
22. Si Jack tiene un job y Angelo es activo, Angelo ve el card de trabajo actual en modo lectura con texto "Tomado por Jack".

**Decisiones de producto v1.1:**
23. Cuando un job lleva 30 min en `EN_PROCESO`, banner amarillo "Este job lleva 30+ min" aparece arriba del card con botones [Sigo trabajando] y [Cancelar job].
24. Click en [Sigo trabajando] cierra banner por 30 min más.
25. Click en [Cancelar job] llama endpoint de cancelación y libera el card.
26. Si admin revierte un pago aprobado mientras el job está `EN_PROCESO`, el job se cancela automáticamente y aparece toast rojo "Job cancelado: el pago fue revertido".
27. Toggle "Solo VIP" en cola filtra la lista mostrando solo jobs de clientes con `status === 'VIP'`.
28. Si toggle "Solo VIP" activado y entran jobs nuevos no-VIP, no aparecen en vista filtrada pero contador total se actualiza.
29. Sección "Finalizados hoy" muestra finalizados de Jack y Angelo, con identificador visual del técnico.
30. Sonido beep al entrar job nuevo a cola, solo si técnico no tiene job tomado y tab está visible. Toggle ON por default.

**Responsive:**
31. En mobile (<768px), cards de cola se vuelven verticales (info arriba, botón abajo).
32. En mobile, grid de Pagos+Atención se vuelve 1 columna.
33. En mobile, data cells del card "Tu trabajo actual" se apilan en 1 columna.
34. Filtro VIP visible en mobile en línea separada arriba de la cola.

**Edge cases:**
35. Si la cola está vacía y no hay job tomado, mensaje "Sin trabajo actual. Esperando que clientes conecten equipos."
36. Si SSE se cae, banner amarillo arriba del panel "Reconectando…" hasta que vuelva.
37. Texto largo en nombres se trunca con ellipsis.
38. Cero finalizados hoy: sección oculta o mensaje "Sin finalizados hoy".

---

## 8. Open questions / Decisiones pendientes

**Todas las 8 Open Questions de v1.0 fueron resueltas con Bryam y están integradas en las secciones correspondientes.**

Resumen de decisiones tomadas:

| Pregunta original | Decisión |
|---|---|
| 1. Switch técnico con job tomado | Job se queda con quien lo tomó (Opción A) |
| 2. Tomar específico vs take-next | Técnico elige cuál tomar (botón en cada card) |
| 3. Pago revertido con job en curso | Cancelación de raíz (bypass dura 5-10s, no hay riesgo físico) |
| 4. Timeout de jobs en proceso | Banner amarillo a los 30 min con [Sigo trabajando] / [Cancelar] |
| 5. Finalizados hoy: solo del técnico activo o de ambos | De ambos técnicos, con identificador visual |
| 6. Reportar problema: razón obligatoria | Texto libre + opciones predefinidas (modal en otra spec) |
| 7. Filtro/búsqueda en cola | Filtro VIP simple (toggle) |
| 8. Beep al entrar job | Sí, solo si no tiene job tomado y tab visible. Toggle ON por default. |

**Si surgen preguntas nuevas durante la implementación**, se agregan acá con su decisión y se actualiza changelog.

---

## Changelog

- **v1.1** (2026-05-02) — Bryam respondió las 8 Open Questions. Decisiones integradas en componentes, edge cases, comportamiento y acceptance criteria. Agregado: filtro VIP, banner timeout 30 min, beep, columna de técnico en finalizados, endpoint nuevo `POST /api/frp/jobs/:id/take`. Spec aprobada para implementación.
- **v1.0** (2026-05-02) — Spec inicial. 8 piezas completas. 8 Open Questions pendientes.
