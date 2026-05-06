# Operador — Panel FRP Express

**Versión:** 1.2 · **Fecha:** 3 de mayo 2026 · **Estado:** implementado en sesiones 6-7, validación profunda pendiente

**Cambios respecto a v1.1:**
- Se eliminó el sistema de beep al entrar nuevos jobs (decisión sesión 7)
- `finalize` no requiere log/imagen obligatorio: auto-genera "Finalizado por <user> a las <HH:MM>" (Lima timezone)
- Campo en código se llama `technicianId` (no `takenBy` como decía v1.1)
- Order code: formato real es `ARD-YYYYMMDD-NNN` (no `ORD-`)
- Código del proceso: formato real es `CL-{code}-{quantity}` (sin XXX random letters)
- Se eliminó "Crear orden manual" del panel (no se usa)
- Se eliminó botón "Actualizar" del header del panel (innecesario con SSE)
- Se eliminaron los 8 contadores numéricos arriba del panel (código zombi del rediseño)
- Sección "Costos FRP" colapsada bajo acordeón con estilo del mockup
- SSE operador implementado en `/api/operator/frp/events`
- Reconnect banner implementado
- Polling acelerado del switch técnico durante swap window

---

## Contexto

Pantalla principal del panel operador donde Jack o Angelo (los técnicos de AriadGSM) procesan los pedidos de FRP Express que llegan desde el portal cliente. Es una vista de **trabajo en vivo**: cuando un cliente conecta su equipo (paso 4 del portal), el job correspondiente entra acá listo para que el técnico lo procese.

**Audiencia:** técnicos internos de AriadGSM (Jack, Angelo). Acceden desde `ops.ariadgsm.com`. Conocen el dominio profundamente y procesan ~130 órdenes/día.

**Posición en el flujo:** una vez que el cliente terminó los 4 pasos del portal y apretó "Equipo conectado", el job aparece en la cola de este panel. El técnico lo toma, procesa el equipo (manualmente con USB Redirector + herramientas externas), y marca finalizado.

**Restricción crítica:** **un técnico activo a la vez**. Existe un switch Jack ↔ Angelo con ventana de bloqueo `ARIAD_TECHNICIAN_SWAP_MS` (default 10s). Solo el técnico activo recibe los datos del Technician ID nuevo.

**Característica clave del bypass:** el bypass de FRP en sí dura **5-10 segundos**. La interfaz del operador acompaña el antes y el después del bypass, no el durante. Esto significa que decisiones como "cancelar de raíz" son seguras — no hay equipos físicamente conectados durante minutos.

**Lo que esta spec NO cubre:** otras tabs del panel operador (Tickets, Clientes, Precios, Cierre diario, Usuarios, Auditoría) ni el modal de "Reportar problema" (es spec separada) ni el rediseño visual interno de "Costos FRP" (spec separada documentada en `_costos-frp-redesign-pendiente.md`). Esta es solo la pantalla "FRP Express" / "Solicitudes FRP web".

---

## 1. Mockup visual

Archivo: `docs/specs/operador/mockups/operador-frp-express.html`

**Estructura visual de arriba hacia abajo:**

1. **Header del panel:** label "PANEL OPERADOR" + título "FRP Express" + badge a la derecha indicando técnico activo (ej. "Jack activo" con dot verde pulsante).
2. **Banner SSE de estado** (oculto cuando OK): "Conectando…" / "Reconectando…" / "Sin conexión" según estado de la conexión SSE.
3. **Sección "TU TRABAJO ACTUAL":** card grande con el job que el técnico tomó. Muestra orden + cliente + servicio + Technician ID + Código del proceso + dos botones (Marcar finalizado / Reportar problema). Si no hay job tomado, card vacía con CTA grande "Tomar siguiente". Banner amarillo de timeout 30 min cuando aplica.
4. **Sección "COLA · X listos":** lista vertical de jobs en estado `LISTO_PARA_TECNICO` con botón "Tomar" en cada uno + filtro VIP en el header.
5. **Sección "PAGOS POR REVISAR" + "ATENCIÓN":** grid de 2 columnas. A la izquierda, comprobantes de pago pendientes de revisar (color amber). A la derecha, jobs con problemas que requieren atención (color rojo).
6. **Sección "FINALIZADOS HOY":** tabla compacta con los jobs finalizados del día (de todos los tecnicos FRP elegibles). Sin acciones — es informativa pura.
7. **Acordeón "COSTOS FRP" (colapsado):** al final del panel, contenedor colapsable que esconde la tabla de pricing por proveedor. Estilo coherente con el resto del panel (label uppercase, chevron rotable, hover sutil). Contenido interno tiene rediseño visual pendiente como spec separada.

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

**Polling acelerado durante swap:** mientras `swap.inProgress === true`, `paintTechnicianWidget` consulta `/api/operator/technician/status` cada 2s (en lugar de cada 30s). Cuando el swap completa, regresa a 30s. Esto reemplaza al 2do evento del switch técnico que se decidió no implementar en backend.

### 2.2 Banner SSE de estado

Banner sibling de `#frp-workbench` (afuera del re-render) que indica el estado de la conexión SSE.

| Estado | Apariencia |
|---|---|
| Conectado | Hidden |
| Conectando | Visible, dot pulsante amarillo, texto "Conectando..." |
| Reconectando | Visible, dot pulsante amarillo, texto "Reconectando..." |
| Desconectado | Visible, dot rojo, texto "Sin conexión" (variante `.is-error`) |

### 2.3 Card "TU TRABAJO ACTUAL"

| Estado | Trigger | Apariencia |
|---|---|---|
| Con job tomado (normal) | Job en `EN_PROCESO` con `technicianId === currentUser.id`, tomado hace <30 min | Card blanco con border 0.5px, datos del job, botones Finalizar (primary) + Reportar problema (secondary) |
| Con job tomado (timeout 30 min) | Mismo job pero `(now - takenAt) > 30 min` | Mismo card pero con **banner amarillo arriba**: "Este job lleva 30+ min. ¿Necesitás ayuda?" + botones [Sigo trabajando] (cierra banner por 30 min más, persiste en localStorage) y [Cancelar job] (confirm dialog → cancela el job con `reason: 'timeout'`) |
| Jobs tomados por otros operadores | Jobs en `EN_PROCESO` con `technicianId !== currentUser.id` | Seccion separada "Trabajos en curso por otros", cards en modo lectura, sin botones operables. `Tu trabajo actual` no debe ser ocupado por jobs ajenos. |
| Sin job + cola con jobs | No hay job tomado y la cola tiene `LISTO_PARA_TECNICO` | Card dasheado gris con texto "Sin trabajo actual" + botón grande "Tomar siguiente" (primary, full-width) |
| Sin job + cola vacía | No hay job tomado y la cola está vacía | Card dasheado gris con texto "Sin trabajo actual. Esperando que clientes conecten equipos." + botón "Tomar siguiente" disabled |
| Loading (al apretar Marcar finalizado) | Click en Finalizar enviado al backend | Botón primario muestra spinner, ambos botones disabled hasta respuesta |
| Job cancelado por reversión de pago | Pago revertido por admin mientras el job estaba `EN_PROCESO` | Card cambia a estado vacío + frpMessage rojo "Job cancelado: el pago fue revertido" (vía notice del payload SSE) |
| Error de finalización | Backend devuelve error | frpMessage con error, card vuelve a estado normal |

**Datos visibles cuando hay job tomado:**
- Header: `<orderCode> · <jobSequence> de <orderQuantity>` (ej. "ARD-20260502-008 · 1 de 5 equipos")
- Nombre del cliente
- Servicio + ARD code (ej. "Xiaomi Cuenta Google · ARD012-AL")
- Tiempo desde que lo tomó (relativo, "tomado hace 3 min", actualizado cada 60s vía setInterval)
- Technician ID (copiable, monospace)
- Código del proceso (copiable, monospace)

### 2.4 Filtro VIP en cola

Elemento en el header de la sección "COLA". Permite filtrar la cola por jobs de clientes VIP.

| Estado | Apariencia |
|---|---|
| Default (todos) | Toggle off, fondo blanco, texto "Solo VIP" gris |
| Filtrado VIP | Toggle on, fondo amarillo claro, texto "Solo VIP" + contador (ej. "Solo VIP · 2") |
| Sin VIPs en cola | Toggle visible pero al activarlo muestra "No hay VIPs en cola" en lugar de la lista |

Contrato del CTA principal: si `Solo VIP` esta activo y existen VIPs visibles, el boton grande "Tomar siguiente" toma el primer job VIP visible usando el endpoint especifico `POST /api/frp/jobs/:id/take`. Si el filtro esta apagado, o si no hay VIPs y la UI cae a "mostrando todos", conserva `POST /api/frp/jobs/take-next`.

### 2.5 Card de cola (cada item de la lista)

| Estado | Trigger | Apariencia |
|---|---|---|
| Default | Job en `LISTO_PARA_TECNICO`, técnico activo no lo tiene tomado | Card blanco, border 0.5px, datos resumidos, botón "Tomar" outline |
| VIP | Mismo + cliente.status === 'VIP' | Igual que default + badge dorado pequeño "VIP" arriba a la derecha |
| Hover (desktop) | Mouse encima del card | Borde se vuelve más oscuro, fondo levemente gris |
| Loading (al apretar Tomar) | Click en Tomar enviado al backend | Botón muestra spinner, card disabled |
| Tomado por otro técnico (carrera) | Backend rechaza take porque otro lo tomó primero | Card desaparece de la lista (refresh SSE) + frpMessage informativo "Otro técnico tomó este job" |
| Técnico activo cambió entre render y click | Backend rechaza take porque el usuario ya no es técnico activo | UI muestra error, refresca sesión y el job queda disponible para el técnico activo real |

**Datos visibles:**
- Header: `<orderCode> · <quantity> equipo(s)` + badge VIP (si aplica)
- Nombre del cliente + servicio
- Tiempo desde conexión del cliente
- Botón "Tomar" → llama `POST /api/frp/jobs/:id/take` (endpoint específico, no take-next)

### 2.6 Card "PAGOS POR REVISAR" (cada item)

| Estado | Trigger | Apariencia |
|---|---|---|
| Default | `frpOrder.paymentStatus === 'PAGO_EN_VALIDACION'` | Card amber claro, border amber, click abre modal de revisión |
| Hover | Mouse encima | Fondo amber un poco más oscuro |
| Loading (mientras se aprueba/rechaza) | Acción en modal enviada al backend | Modal con spinner |

**Datos visibles:**
- Order code
- Cliente + monto en moneda local (ej. "Roberto Díaz · S/ 62.05")
- Link "Ver comprobante →"

### 2.7 Card "ATENCIÓN" (cada item)

| Estado | Trigger | Apariencia |
|---|---|---|
| Default | Job en `REQUIERE_REVISION` o `frpOrder.paymentStatus === 'COMPROBANTE_RECHAZADO'` con cliente esperando | Card rojo claro, border rojo |
| Hover | Mouse encima | Fondo rojo un poco más oscuro |

**Datos visibles:**
- Order code
- Cliente
- Razón del problema (ej. "Modelo no soportado · revisar")
- Link "Resolver →"

### 2.8 Tabla de finalizados

Estado único, informativa. Muestra finalizados de **todos los tecnicos FRP elegibles** del día actual. Cada fila:
- Order code (formato corto)
- Cliente + ARD code (ej. "RAUL GSM · ARD012-AL")
- Hora de finalización (ej. "14:32")
- Técnico que finalizó: marca compacta derivada del nombre del operador (dos letras cuando sea posible) y `title` con el nombre completo. No se hardcodea Jack/Angelo.

Sin acciones. Sin botones. Click en "Ver todos →" del header lleva a vista filtrada de histórico (esa vista no es parte de esta spec).

### 2.9 Acordeón "Costos FRP"

Acordeón colapsable al final del panel.

| Estado | Apariencia |
|---|---|
| Cerrado (default) | Header con label "COSTOS FRP" en uppercase gris, chevron `›` apuntando a la derecha, hover sutil con fondo `--bg-secondary` |
| Abierto | Mismo header con chevron rotado 90° (apunta hacia abajo), contenido del pricing-box visible debajo |

**Nota:** el contenido interno del acordeón (tabla de proveedores, política, pending changes) tiene rediseño visual pendiente, documentado en `_costos-frp-redesign-pendiente.md`.

### 2.10 Botones genéricos

| Tipo | Apariencia |
|---|---|
| Primary | Fondo `#185FA5`, texto blanco, hover `#0C447C`, disabled fondo gris |
| Secondary | Fondo blanco, border 0.5px gris medio, texto primary, hover fondo gris claro |
| Take (outline pequeño) | Fondo blanco, border 0.5px azul claro, texto azul, hover fondo azul muy claro |
| Banner action [Sigo trabajando] | Fondo amarillo medio, texto marrón oscuro |
| Banner action [Cancelar job] | Fondo blanco, border rojo, texto rojo |

---

## 3. Edge cases

### 3.1 Switch tecnico mientras hay jobs tomados

Cada job mantiene `technicianId` del operador que lo tomo aunque otro operador pase a ser el tecnico activo global. El operador activo puede tomar cola si no tiene job propio; los jobs de terceros se ven en una seccion informativa separada, sin botones operables. Razon: el equipo sigue fisicamente conectado a la PC del operador que tomo ese job.

### 3.2 Pago revertido mientras el job está `EN_PROCESO`

Cuando admin revierte una aprobación de pago: el job se cancela automáticamente. Toast rojo "Job cancelado: el pago fue revertido" (vía `payload.notice` en SSE). El card "TU TRABAJO ACTUAL" vuelve a estado vacío. Razón: el bypass real dura 5-10s, no hay equipo físicamente conectado durante minutos.

**Nota técnica v1.2:** el mecanismo `notice` en el payload SSE está implementado pero el endpoint admin que dispara la reversión no existe todavía. Cuando se construya, dispara `publishFrpOps(db, "payment_reverted", { notice: { type: 'error', message: '...' } })`.

### 3.3 Job lleva más de 30 minutos en proceso

Si el técnico tomó un job hace más de 30 minutos y todavía no lo finalizó:
- Aparece banner amarillo arriba del card: "Este job lleva 30+ min. ¿Necesitás ayuda?"
- Banner tiene 2 botones:
  - **[Sigo trabajando]** → cierra el banner por 30 min más (persiste en `localStorage` con key `frpOpsV2KeepWorking_<jobId>`)
  - **[Cancelar job]** → confirm dialog "¿Cancelar este job?" → si OK, llama `PATCH /api/frp/jobs/:id/cancel` con `reason: 'timeout'` y `note: 'Cancelado tras 30+ min sin finalizar'`
- El banner re-evalúa cada 60s vía `setInterval` global (también actualiza el "tomado hace X min")
- Sin autocancelación

**En modo readonly (otro técnico tiene el job):** banner observador "Jack lleva 30+ min en este job" sin botones (alerta informativa).

### 3.4 Cola vacía + sin job tomado

Mensaje "Sin trabajo actual. Esperando que clientes conecten equipos." Botón "Tomar siguiente" disabled. Cuando un job entra (vía SSE), la cola se actualiza en vivo.

### 3.5 Carrera de tomado

Dos técnicos no pueden estar activos al mismo tiempo (restricción de switch). Pero entre el momento que un técnico ve el botón "Tomar" y aprieta, podría haber `ARIAD_TECHNICIAN_SWAP_MS` ventana donde el otro se vuelve activo y tomó otro job. El backend resuelve por timestamp y devuelve error al segundo intento. UI muestra frpMessage: "Otro técnico tomó este job".

### 3.6 Cliente desconecta el equipo durante procesamiento

El bypass dura 5-10s, así que esto raramente pasa. Si pasa: el job sigue en `EN_PROCESO` con el técnico. Si el técnico no logra finalizar, aprieta "Reportar problema".

### 3.7 Conexión perdida con el servidor (SSE caído)

Banner `#frpOpsLiveStatus` arriba del panel pasa a estado "Reconectando…" con dot pulsante. El navegador reintenta automáticamente cada 5000ms (configurado en backend con `retry: 5000\n\n`). Mientras está caído, la UI no actualiza datos pero los datos ya cargados quedan visibles.

### 3.8 Sesión del técnico expirada

`renderLayout(!loggedIn)` cubre el path: dispara `stopFrpOpsLive()` automáticamente cuando detecta que la sesión expiró. Redirige a `/login`.

### 3.9 Cliente con texto muy largo (nombre, servicio)

Truncar con `text-overflow: ellipsis` después de 2 líneas en el card actual, 1 línea en cards de cola/atención.

### 3.10 Cero finalizados hoy

Sección entera oculta o con mensaje "Sin finalizados hoy".

### 3.11 Cola muy larga + filtro VIP

Si la cola tiene 10+ jobs (caso pico) y se activa filtro VIP, se muestran solo los VIP. Si no hay VIPs, mensaje "No hay VIPs en cola, mostrando todos…" y se desactiva el filtro automáticamente.

### 3.12 Múltiples timers coexistiendo (deuda v2)

El render del panel se dispara por 3 fuentes:
- `setInterval 60s` (banner timeout 30 min) — implementado en commit 6
- Polling técnico 30s/2s — implementado en commit 7c
- Eventos SSE entrantes — implementado en commit 7c

Todos llaman `renderFrp({ skipPricing: true })`. Si se nota flicker visual molesto, deuda v2: implementar DOM diffing.

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
| Apretar "Tomar siguiente" (card vacío, filtro apagado) | `POST /api/frp/jobs/take-next` | Toma el job más antiguo de la cola |
| Apretar "Tomar siguiente VIP" (card vacío, filtro VIP activo con VIPs visibles) | `POST /api/frp/jobs/:id/take` | Toma el primer job VIP visible. 409 si ya fue tomado |
| Apretar "Tomar" en card específica de cola | `POST /api/frp/jobs/:id/take` | Toma ese job específico. 409 si ya fue tomado |
| Apretar "Marcar finalizado" | `PATCH /api/frp/jobs/:id/finalize` | Cambia estado a `FINALIZADO`, registra `doneAt`, auto-genera log "Finalizado por <user> a las <HH:MM>" Lima, dispara generación de PDF cliente. El permiso depende del dueno del job, no del tecnico activo global |
| Apretar "Reportar problema" | Abre modal (otra spec). Modal llama `PATCH /api/frp/jobs/:id/review` con razón + categoría. El permiso depende del dueno del job, no del tecnico activo global |
| Apretar "Sigo trabajando" en banner 30 min | (sin endpoint) cierra banner client-side, persiste en localStorage |
| Apretar "Cancelar job" en banner 30 min | confirm → `PATCH /api/frp/jobs/:id/cancel` con `{reason: 'timeout', note: 'Cancelado tras 30+ min sin finalizar'}`. El permiso depende del dueno del job, no del tecnico activo global |
| Toggle "Solo VIP" | (sin endpoint) filtro client-side sobre la cola ya cargada, persiste en sessionStorage |
| Apretar "Ver comprobante" | Abre modal con `paymentProofs[]` + botones Aprobar/Rechazar |
| Apretar "Aprobar" en modal de comprobante | `PATCH /api/frp/orders/:id/payment-review` (action: approve) | Aprueba pago, dispara lock 15min |
| Apretar "Rechazar" en modal de comprobante | `PATCH /api/frp/orders/:id/payment-review` (action: reject) | Rechaza pago, vuelve a cliente con razón |

### 5.2 Real-time updates (SSE)

Endpoint: `GET /api/operator/frp/events`. Auth via cookie operador + rol con acceso FRP.

**Eventos emitidos por backend:**

| Reason | Trigger |
|---|---|
| `connected` | Snapshot inicial al abrir conexión |
| `frp_job_ready_for_technician` | Cliente apreta "Equipo conectado" → job entra a cola |
| `payment_review_needed` | Cliente sube comprobante (creación o re-upload) |
| `payment_review_resolved` | Operador aprueba/rechaza pago |
| `frp_job_taken` | Operador toma un job (take-next o take específico) |
| `frp_job_done` | Operador finaliza job |
| `frp_job_canceled` | Operador cancela job (timeout/manual/payment_reverted) |
| `frp_job_ready` | Operador marca job ready (paso preparación → técnico) |
| `frp_job_review_required` | Operador reporta problema (review) |
| `technician_switched` | Switch Jack ↔ Angelo (1er evento al iniciar) |
| `frp_order_created` | Nueva orden manual (operador) o portal (cliente) |
| `payment_reverted` | (Mecanismo listo, sin disparador hasta que se construya endpoint admin) |

**Payload:** `{ reason, frp: <publicFrpState>, notice?: { type: 'info'|'error', message: '...' } }`

Si hay `notice`, el frontend pinta `#frp-message` con el dataset.type. Sin notice, refresh silencioso.

**Heartbeat:** 25s. Reconnect: navegador retry automático cada 5000ms.

### 5.3 Filtro VIP

- Toggle client-side, no requiere endpoint.
- Filtra la cola ya cargada por `cliente.status === 'VIP'`.
- Persiste en sessionStorage del técnico.
- Si filtro activo y entran jobs nuevos no-VIP, no aparecen en la vista filtrada (pero el contador "COLA · X" sigue contando todos).

### 5.4 Validaciones antes de actions

- "Marcar finalizado" requiere que `job.technicianId === currentUser.id`. Si no, botón disabled con tooltip "Solo quien tomó el job puede finalizarlo".
- Si el tecnico activo global cambia despues de tomar el job, el dueno congelado (`job.technicianId`) conserva el boton y puede finalizar. El nuevo activo global no hereda permiso sobre ese job.
- "Reportar problema" y "Cancelar job" siguen la misma regla de dueno congelado. El nuevo tecnico activo global no puede operar jobs ya tomados por otro operador.
- "Tomar" no permite tomar si ya hay un job en `EN_PROCESO` para este técnico. Botón disabled.
- "Aprobar comprobante" requiere rol `ADMIN` o `COORDINADOR`. Si rol `ATENCION_TECNICA`, botón disabled con tooltip "Permisos insuficientes".
- Cuando hay switch en transición (10s), todos los botones de acción están disabled.

### 5.5 Polling acelerado durante swap

- Mientras `swap.inProgress === true`, `paintTechnicianWidget` consulta `/api/operator/technician/status` cada 2s.
- Cuando `swap.inProgress === false`, regresa a 30s.
- Esto reemplaza al 2do evento del switch técnico (decisión de no instrumentar `readDb`).
- Resultado UX: badge "Cambiando técnico..." dura ~10-12s reales, no 35s del peor caso.

---

## 6. Datos (data requirements)

### 6.1 Datos que necesita

**Modelos existentes a leer (no se modifican):**

`frpJob`:
- `id`, `frpOrderId`, `ardCode`, `status` (enum)
- **`technicianId`**, `takenAt`, `doneAt`
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

### 6.2 Endpoints implementados

**Sesión 7 (commits f1267a3, d2bc27f, 99aae55, defc7f8):**

- `POST /api/frp/jobs/:id/take` — toma específico
- `PATCH /api/frp/jobs/:id/cancel` — body `{ reason, note }`
- `PATCH /api/frp/jobs/:id/finalize` modificado: ya no requiere log, auto-genera Lima
- `publicFrpState` extendido con `finishedTodayJobs[]`

**Sesión 7 (commits ca81c63, 011c60a, f6c2927):**

- `GET /api/operator/frp/events` — SSE stream operador
- Helper `publishFrpOps(db, reason, opts?)` con campo `notice` opcional
- Map `frpOpsStreams<userId, Set<stream>>` con cleanup en disconnect
- 13 puntos de instrumentación en mutaciones existentes

### 6.3 Validaciones

**Frontend:**
- Solo mostrar el panel a usuarios con rol `ADMIN`, `COORDINADOR`, o `ATENCION_TECNICA`.
- Botones de aprobación de pago solo a `ADMIN` y `COORDINADOR`.
- Botones "Marcar finalizado", "Reportar problema" y "Cancelar job" solo operan sobre el trabajo actual del usuario (`job.technicianId === currentUser.id`), aunque `active_technician_state` haya cambiado despues de tomar el job.
- Botón "Tomar" disabled si el técnico no es el activo del momento.

**Backend** (ya implementado):
- Validación de rol en cada endpoint.
- Validación de transición de estado.
- Lock 15min al aprobar pago.

---

## 7. Acceptance criteria

**Layout y estilo:**
1. Header del panel muestra título "FRP Express" y badge con técnico activo.
2. Badge tiene dot verde pulsante con animación.
3. Card "Tu trabajo actual" ocupa ancho completo y tiene borde 0.5px.
4. Cards de cola están en lista vertical con gap de 6px.
5. Cards VIP en cola tienen badge dorado "VIP" arriba a la derecha.
6. Pagos por revisar y Atención están en grid de 2 columnas en desktop, 1 columna en mobile.
7. Finalizados muestra como tabla con filas separadas por borde, con columna/inicial del técnico que finalizó.
8. Acordeón "Costos FRP" colapsado por default con label uppercase y chevron rotable.

**Funcionalidad básica:**
9. Al cargar el panel, se hace fetch del estado actual y se renderiza con datos reales.
10. SSE establecido al cargar, reconecta automáticamente con `retry: 5000`.
11. Botón "Tomar siguiente" disabled si la cola está vacía.
12. Click en "Tomar siguiente" llama `POST /api/frp/jobs/take-next` y actualiza la UI con el job tomado.
13. Click en "Tomar" de un card específico llama `POST /api/frp/jobs/:id/take` y actualiza la UI.
14. Si otro técnico toma un job, el card desaparece de la cola en menos de 2s (vía SSE).
15. Si el técnico activo cambia entre render y click, `POST /api/frp/jobs/:id/take` devuelve 403, la UI muestra error y refresca sesión sin marcar éxito.
16. Click en "Marcar finalizado" llama `PATCH /api/frp/jobs/:id/finalize` (auto-log generado), refresca el panel, mueve el job a Finalizados.
16b. Si el tecnico activo cambia entre tomar y finalizar, el dueno del job todavia puede finalizar; la UI no debe ocultar su trabajo actual por no ser el activo global.
17. Click en "Reportar problema" abre modal de reportar problema (otra spec).
17b. Si el tecnico activo cambia despues de tomar el job, el dueno todavia puede enviarlo a revision; el nuevo activo global recibe 403 si intenta operar ese job.
17c. Si el job se envia a revision, conserva `technicianId` del dueno original.
18. Click en "Ver comprobante" abre modal con paymentProofs y botones de aprobar/rechazar.
19. Approve de un comprobante llama `PATCH /api/frp/orders/:id/payment-review` y dispara lock 15min.

**Estados especiales:**
20. Si el técnico activo es Jack y currentUser es Angelo, el botón "Tomar" está disabled con tooltip.
21. Si rol es `ATENCION_TECNICA`, los botones de aprobar/rechazar pago están disabled.
22. Durante el switch (10s ventana), badge del header dice "Cambiando técnico…" en gris y todos los botones de acción están disabled. Polling acelerado a 2s para confirmar fin del swap rápido.
23. Si la sesión del técnico expira, `renderLayout(!loggedIn)` dispara `stopFrpOpsLive()` y redirige a `/login`.
24. Si otros operadores tienen jobs en proceso, el operador actual los ve en "Trabajos en curso por otros"; `Tu trabajo actual` sigue libre para su job propio o para `Tomar siguiente`.

**Decisiones de producto v1.1+v1.2:**
25. Cuando un job lleva 30 min en `EN_PROCESO`, banner amarillo "Este job lleva 30+ min" aparece arriba del card con botones [Sigo trabajando] y [Cancelar job].
26. Click en [Sigo trabajando] cierra banner por 30 min más, persiste en localStorage.
27. Click en [Cancelar job] dispara confirm dialog. Si OK, llama endpoint con `reason: 'timeout'` y libera el card.
28. En modo readonly (otro técnico tiene el job), banner observador sin botones "X lleva 30+ min en este job".
29. Si admin revierte un pago aprobado mientras el job está `EN_PROCESO`, el job se cancela automáticamente y aparece notice "Job cancelado: el pago fue revertido" en frpMessage (mecanismo SSE, sin disparador hasta endpoint admin).
30. Si el tecnico activo cambia despues de tomar el job, el dueno todavia puede cancelar por timeout/manual; el nuevo activo global recibe 403 si intenta cancelar ese job.
31. Si el dueno cancela con reason `timeout` o `manual`, el job vuelve a `LISTO_PARA_TECNICO` y queda sin `technicianId`.
32. Toggle "Solo VIP" en cola filtra la lista mostrando solo jobs de clientes con `status === 'VIP'`.
33. Sección "Finalizados hoy" muestra finalizados de todos los tecnicos FRP elegibles, con identificador visual del técnico.

**Real-time (SSE):**
34. Conexión SSE establecida al hacer login, cleanup automático en logout/sesión expirada.
35. Banner `#frpOpsLiveStatus` muestra estado de la conexión (oculto cuando OK, "Reconectando..." cuando se cae).
36. Eventos SSE entrantes con notice pintan `#frp-message` con dataset.type.
37. Eventos sin notice solo refrescan el state (renderFrp silencioso).
38. Switch técnico: polling acelerado a 2s mientras `swap.inProgress === true`, vuelve a 30s al completarse.

**Responsive:**
39. En mobile (<768px), cards de cola se vuelven verticales (info arriba, botón abajo).
40. En mobile, grid de Pagos+Atención se vuelve 1 columna.
41. En mobile, data cells del card "Tu trabajo actual" se apilan en 1 columna.
42. Filtro VIP visible en mobile en línea separada arriba de la cola.

**Edge cases:**
43. Si la cola está vacía y no hay job tomado, mensaje "Sin trabajo actual. Esperando que clientes conecten equipos."
44. Si SSE se cae, banner amarillo "Reconectando…" hasta que vuelva.
45. Texto largo en nombres se trunca con ellipsis.
46. Cero finalizados hoy: sección oculta o mensaje "Sin finalizados hoy".

---

## 8. Open questions / Decisiones pendientes

**Todas las Open Questions de v1.0 y v1.1 fueron resueltas.**

**Open questions abiertas para v1.3 (futuras sesiones):**

1. **Disparador de `payment_reverted`:** mecanismo SSE listo, falta implementar endpoint admin que dispara la reversión. Cuando se haga, llamar `publishFrpOps(db, "payment_reverted", { notice: { type: 'error', message: 'Job cancelado: el pago fue revertido' } })` después de cancelar el job afectado.

2. **DOM diffing para evitar flicker:** múltiples timers convergen a `renderFrp({ skipPricing: true })`. Si se nota flicker molesto en uso real, implementar diffing.

3. **Adjuntar evidencia post-finalización:** la spec menciona sub-acción "Adjuntar evidencia" después de finalizar (decisión sesión 7 con auto-log). NO está implementado todavía. Spec separada cuando sea necesario.

4. **Toast flotante real:** decisión actual es reusar `#frp-message` inline. Si se quiere toast flotante en el futuro, spec separada.

---

## Changelog

- **v1.2** (2026-05-03) — Sesión 7. SSE operador end-to-end (commits ca81c63 + 011c60a + f6c2927). Cleanup post-rediseño (5b). Banner timeout 30 min (6). Cleanup visual + acordeón Costos FRP estilizado (6b). Decisiones registradas: beep eliminado, finalize auto-log, technicianId, formato ARD-, sin XXX, sin Crear orden manual, sin botón Actualizar, sin 8 contadores. 2do evento del switch reemplazado por polling acelerado (Opción D).

- **v1.1** (2026-05-02) — Sesión 6. Bryam respondió las 8 Open Questions originales. 38 acceptance criteria. Filtro VIP, banner timeout, beep (luego eliminado en v1.2), columna técnico en finalizados.

- **v1.0** (2026-05-02) — Sesión 5. Spec inicial. 8 piezas completas. 8 Open Questions pendientes.
