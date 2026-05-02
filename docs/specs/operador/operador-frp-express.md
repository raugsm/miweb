# Operador — Panel FRP Express

**Versión:** 1.0 · **Fecha:** 2 de mayo 2026 · **Estado:** propuesto, pendiente de aprobación de Bryam y revisión técnica

---

## Contexto

Pantalla principal del panel operador donde Jack o Angelo (los técnicos de AriadGSM) procesan los pedidos de FRP Express que llegan desde el portal cliente. Es una vista de **trabajo en vivo**: cuando un cliente conecta su equipo (paso 4 del portal), el job correspondiente entra acá listo para que el técnico lo procese.

**Audiencia:** técnicos internos de AriadGSM (Jack, Angelo). Acceden desde `ops.ariadgsm.com`. Conocen el dominio profundamente y procesan ~130 órdenes/día.

**Posición en el flujo:** una vez que el cliente terminó los 4 pasos del portal y apretó "Equipo conectado", el job aparece en la cola de este panel. El técnico lo toma, procesa el equipo (manualmente con USB Redirector + herramientas externas), y marca finalizado.

**Restricción crítica:** **un técnico activo a la vez**. Existe un switch Jack ↔ Angelo con ventana de bloqueo `ARIAD_TECHNICIAN_SWAP_MS` (default 10s). Solo el técnico activo recibe los datos del Technician ID nuevo.

**Lo que esta spec NO cubre:** otras tabs del panel operador (Tickets, Clientes, Precios, Cierre diario, Usuarios, Auditoría). Esta es solo la pantalla "FRP Express" / "Solicitudes FRP web".

---

## 1. Mockup visual

Archivo: `docs/specs/operador/mockups/operador-frp-express.html`

**Estructura visual de arriba hacia abajo:**

1. **Header del panel:** label "PANEL OPERADOR" + título "FRP Express" + badge a la derecha indicando técnico activo (ej. "Jack activo" con dot verde pulsante).
2. **Sección "TU TRABAJO ACTUAL":** card grande con el job que el técnico tomó. Muestra orden + cliente + servicio + Technician ID + Código del proceso + dos botones (Marcar finalizado / Reportar problema). Si no hay job tomado, card vacía con CTA grande "Tomar siguiente".
3. **Sección "COLA · X listos":** lista vertical de jobs en estado `LISTO_PARA_TECNICO` con botón "Tomar" en cada uno.
4. **Sección "PAGOS POR REVISAR" + "ATENCIÓN":** grid de 2 columnas. A la izquierda, comprobantes de pago pendientes de revisar (color amber). A la derecha, jobs con problemas que requieren atención (color rojo).
5. **Sección "FINALIZADOS HOY":** tabla compacta con los jobs finalizados del día. Sin acciones — es informativa pura.

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
| Con job tomado | Job en estado `EN_PROCESO` con `takenBy === currentUser.id` | Card blanco con border 0.5px, datos del job, botones Finalizar (primary) + Reportar problema (secondary) |
| Sin job + cola con jobs | No hay job tomado y la cola tiene `LISTO_PARA_TECNICO` | Card dasheado gris con texto "Sin trabajo actual" + botón grande "Tomar siguiente" (primary, full-width) |
| Sin job + cola vacía | No hay job tomado y la cola está vacía | Card dasheado gris con texto "Sin trabajo actual. Esperando que clientes conecten equipos." + botón "Tomar siguiente" disabled |
| Loading (al apretar Marcar finalizado) | Click en Finalizar enviado al backend | Botón primario muestra spinner, ambos botones disabled hasta respuesta |
| Error de finalización | Backend devuelve error | Toast rojo con mensaje, card vuelve a estado normal |

**Datos visibles cuando hay job tomado:**
- Header: `<orderCode> · <jobSequence> de <orderQuantity>` (ej. "ORD-20260502-008 · 1 de 5 equipos")
- Nombre del cliente
- Servicio + ARD code (ej. "Xiaomi Cuenta Google · ARD012-AL")
- Tiempo desde que lo tomó (relativo, "tomado hace 3 min")
- Technician ID (copiable, monospace)
- Código del proceso (copiable, monospace)

### 2.3 Card de cola (cada item de la lista)

| Estado | Trigger | Apariencia |
|---|---|---|
| Default | Job en `LISTO_PARA_TECNICO`, técnico activo no lo tiene tomado | Card blanco, border 0.5px, datos resumidos, botón "Tomar" outline |
| Hover (desktop) | Mouse encima del card | Borde se vuelve más oscuro, fondo levemente gris |
| Loading (al apretar Tomar) | Click en Tomar enviado al backend | Botón muestra spinner, card disabled |
| Tomado por otro técnico (carrera) | Backend rechaza take porque otro lo tomó primero | Card desaparece de la lista (refresh SSE) |

**Datos visibles:**
- Header: `<orderCode> · <quantity> equipo(s)`
- Nombre del cliente + servicio
- Tiempo desde conexión del cliente
- Botón "Tomar"

### 2.4 Card "PAGOS POR REVISAR" (cada item)

| Estado | Trigger | Apariencia |
|---|---|---|
| Default | `frpOrder.paymentStatus === 'PAGO_EN_VALIDACION'` | Card amber claro, border amber, click abre modal de revisión |
| Hover | Mouse encima | Fondo amber un poco más oscuro |
| Loading (mientras se aprueba/rechaza) | Acción en modal enviada al backend | Modal con spinner |

**Datos visibles:**
- Order code
- Cliente + monto en moneda local (ej. "Roberto Díaz · S/ 62.05")
- Link "Ver comprobante →"

### 2.5 Card "ATENCIÓN" (cada item)

| Estado | Trigger | Apariencia |
|---|---|---|
| Default | Job en `REQUIERE_REVISION` o `frpOrder.paymentStatus === 'COMPROBANTE_RECHAZADO'` con cliente esperando | Card rojo claro, border rojo |
| Hover | Mouse encima | Fondo rojo un poco más oscuro |

**Datos visibles:**
- Order code
- Cliente
- Razón del problema (ej. "Modelo no soportado · revisar")
- Link "Resolver →"

### 2.6 Tabla de finalizados

Estado único, informativa. Cada fila:
- Order code (formato corto, ej. "ORD-007-1")
- Cliente + ARD code (ej. "RAUL GSM · ARD012-AL")
- Hora de finalización (ej. "14:32")

Sin acciones. Sin botones. Click en "Ver todos →" del header lleva a vista filtrada de histórico (esa vista no es parte de esta spec).

### 2.7 Botones genéricos

| Tipo | Apariencia |
|---|---|
| Primary | Fondo `#185FA5`, texto blanco, hover `#0C447C`, disabled fondo gris |
| Secondary | Fondo blanco, border 0.5px gris medio, texto primary, hover fondo gris claro |
| Take (outline pequeño) | Fondo blanco, border 0.5px azul claro, texto azul, hover fondo azul muy claro |

---

## 3. Edge cases

1. **Switch técnico mientras tenés job tomado.** Si Jack tiene un job en `EN_PROCESO` y Angelo se vuelve activo:
   - Decisión de producto pendiente (Open Question 1).
   - Opciones: (a) el job sigue siendo de Jack, Angelo lo ve solo en lectura. (b) el job se libera y vuelve a la cola. (c) Angelo "hereda" el job de Jack.
   - Hoy en código: el job mantiene `takenBy = jack.id` aunque Angelo sea el activo. Angelo ve "Sin trabajo actual" y la cola.

2. **Cola vacía + sin job tomado.** Mensaje "Sin trabajo actual. Esperando que clientes conecten equipos." Botón "Tomar siguiente" disabled. Cuando un job entra (vía SSE), la cola se actualiza en vivo.

3. **Carrera de tomado.** Dos técnicos no pueden estar activos al mismo tiempo (restricción de switch). Pero entre el momento que un técnico ve el botón "Tomar" y aprieta, podría haber `ARIAD_TECHNICIAN_SWAP_MS` ventana donde el otro se vuelve activo y tomó otro job. El backend `POST /api/frp/jobs/take-next` resuelve por timestamp.

4. **Cliente desconecta el equipo durante procesamiento.** El job sigue en `EN_PROCESO` con el técnico. La señal del cliente desconectado debería llegar como evento (no implementado hoy según abstracto). Mitigación temporal: el técnico aprieta "Reportar problema" si el equipo se desconectó.

5. **Comprobante rechazado mientras el técnico lo tenía aprobado.** Si Bryam (admin) revierte una aprobación de pago después de que el job ya estaba en `EN_PROCESO`, el job no se afecta automáticamente. Decisión de producto pendiente (Open Question 2).

6. **Job con problema reportado.** Click en "Reportar problema" debería abrir un modal pidiendo razón (texto libre + categoría). El modal de reportar problema **no es parte de esta spec** (es una pieza separada que va en otra spec del operador).

7. **Múltiples comprobantes pendientes a la vez.** Lista vertical en la sección "PAGOS POR REVISAR". Si son más de 5, paginar con "Ver más".

8. **Múltiples jobs en atención a la vez.** Igual que comprobantes pendientes — lista vertical, paginar si son más de 5.

9. **Conexión perdida con el servidor (SSE caído).** Banner amarillo arriba del panel: "Reconectando…" con dot pulsante. Reintenta cada 25s (heartbeat default).

10. **Sesión del técnico expirada.** Redirige a `/login` automáticamente. No muestra datos viejos.

11. **Cliente con texto muy largo (nombre, servicio).** Truncar con `text-overflow: ellipsis` después de 2 líneas en el card actual, 1 línea en cards de cola/atención.

12. **Cero finalizados hoy.** Sección entera oculta o con texto "Sin finalizados hoy".

---

## 4. Responsive

### 4.1 Desktop (`≥1024px`)
- Container max-width 960px, centrado.
- Card "Tu trabajo actual" a ancho completo.
- Cola con cards horizontales (info a la izq, botón Tomar a la dcha).
- Pagos por revisar y Atención en grid 2 columnas.
- Finalizados como tabla compacta.

### 4.2 Tablet (`768px – 1023px`)
- Container max-width 720px, centrado.
- Mismo layout que desktop, todo más compacto.

### 4.3 Mobile (`<768px`)
- Container full-width.
- Card "Tu trabajo actual": data cells en 1 columna, botones apilados.
- Cola: cards verticales con botón Tomar abajo (no a la derecha).
- Pagos por revisar y Atención en 1 columna apilada.
- Finalizados igual.

**Nota:** el panel operador está pensado para desktop primariamente. Mobile es soporte secundario para que Jack/Angelo puedan revisar desde el celular si están fuera. No se espera que procesen equipos desde mobile.

---

## 5. Comportamiento (interaction logic)

### 5.1 Mapeo a endpoints existentes

| Acción UI | Endpoint backend | Resultado |
|---|---|---|
| Apretar "Tomar siguiente" (header card vacío) | `POST /api/frp/jobs/take-next` | Toma el job más antiguo de la cola, lo asigna a `takenBy = currentUser.id`, cambia estado a `EN_PROCESO`. Refresh por SSE. |
| Apretar "Tomar" en card de cola específica | (no existe endpoint hoy, hay que ver si `take-next` toma específico o si hay que agregar `POST /api/frp/jobs/:id/take`) | **Open Question 3**. Hoy `take-next` toma el primero. Si querés permitir elegir cuál, hay que agregar endpoint. |
| Apretar "Marcar finalizado" | `PATCH /api/frp/jobs/:id/finalize` | Cambia estado a `FINALIZADO`, registra `doneAt`, dispara generación de PDF cliente. |
| Apretar "Reportar problema" | `PATCH /api/frp/jobs/:id/review` (con razón) | Cambia estado a `REQUIERE_REVISION`, libera `takenBy`. Aparece en sección Atención. |
| Apretar "Ver comprobante" en card de pago | Abre modal con `paymentProofs[]` de la orden. Botones "Aprobar" y "Rechazar" llaman `PATCH /api/frp/orders/:id/payment-review` |
| Apretar "Resolver" en card de atención | Abre modal contextual según razón del problema. Acciones varían. **No es parte de esta spec.** |
| Apretar "Ver todos" en finalizados | Navega a vista de histórico filtrada. **No es parte de esta spec.** |

### 5.2 Real-time updates

- El panel se suscribe a stream SSE (similar a `/api/portal/orders/events` para cliente, pero para operador).
- Eventos que disparan refresh:
  - Cliente apreta "Equipo conectado" → job nuevo aparece en cola.
  - Cliente sube comprobante → card aparece en "Pagos por revisar".
  - Otro admin/técnico aprueba/rechaza un pago → card desaparece o cambia.
  - Otro técnico (en sesión paralela) toma un job → card desaparece de la cola.
  - Switch técnico activado → badge del header cambia.

### 5.3 Keyboard shortcuts (opcional)

- `T` → Tomar siguiente (si no hay job tomado).
- `F` → Marcar finalizado (si hay job tomado).
- `R` → Reportar problema (si hay job tomado).

**No implementar shortcuts en v1**, solo dejar nota para v2.

### 5.4 Validaciones antes de actions

- "Marcar finalizado" requiere que el técnico activo coincida con `job.takenBy`. Si no coincide (ej. cambió de técnico), botón disabled con tooltip "Solo el técnico que tomó el job puede finalizarlo".
- "Tomar" no permite tomar si ya hay un job en `EN_PROCESO` para este técnico. Botón disabled.
- "Aprobar comprobante" requiere rol `ADMIN` o `COORDINADOR`. Si rol `ATENCION_TECNICA`, botón disabled con tooltip "Permisos insuficientes".

---

## 6. Datos (data requirements)

### 6.1 Datos que necesita

**Modelos existentes a leer:**

`frpJob`:
- `id`, `frpOrderId`, `ardCode`, `status` (enum: `ESPERANDO_PREPARACION`, `LISTO_PARA_TECNICO`, `EN_PROCESO`, `FINALIZADO`, `REQUIERE_REVISION`, `ESPERANDO_CLIENTE`, `CANCELADO`)
- `takenBy`, `takenAt`, `doneAt`
- `requiredStateConfirmed`, `modelSupported`, `clientConnected`

`frpOrder`:
- `id`, `code` (formato `ARD-YYYYMMDD-NNN`)
- `paymentStatus` (enum: `ESPERANDO_COMPROBANTE`, `PAGO_EN_VALIDACION`, `PAGO_VALIDADO`, `COMPROBANTE_RECHAZADO`, `REVISION_COMPATIBILIDAD`)
- `orderStatus`, `checklist`, `paymentProofs[]`

`customerOrder`:
- `code` (formato `CL-YYYYMMDD-NNN`), `quantity`, `paymentMethod`, `totalPrice`, `priceFormatted`

`customerClient`:
- `name`, `whatsapp`, `country`

`activeTechnician`:
- `userId`, `redirectorId`, `switchedAt`, `swapEndsAt`

### 6.2 Datos que produce

Mutaciones existentes que el panel dispara (ya documentadas en sección 5.1).

### 6.3 Validaciones

**Frontend:**
- Solo mostrar el panel a usuarios con rol `ADMIN`, `COORDINADOR`, o `ATENCION_TECNICA`.
- Botones de aprobación de pago solo a `ADMIN` y `COORDINADOR`.
- Botón "Marcar finalizado" solo si `job.takenBy === currentUser.id`.

**Backend** (ya implementado, no se toca):
- Validación de rol en cada endpoint.
- Validación de transición de estado (no se puede pasar de `LISTO_PARA_TECNICO` directo a `FINALIZADO` sin pasar por `EN_PROCESO`).
- Lock 15min al aprobar pago.

---

## 7. Acceptance criteria

**Layout y estilo:**
1. Header del panel muestra título "FRP Express" y badge con técnico activo (Jack o Angelo).
2. Badge tiene dot verde pulsante con animación.
3. Card "Tu trabajo actual" ocupa ancho completo y tiene borde 0.5px.
4. Cards de cola están en lista vertical con gap de 6px.
5. Pagos por revisar y Atención están en grid de 2 columnas en desktop, 1 columna en mobile.
6. Finalizados muestra como tabla con filas separadas por borde.

**Funcionalidad:**
7. Al cargar el panel, se hace fetch del estado actual y se renderiza con datos reales.
8. SSE establecido al cargar, reconecta cada 25s si se cae.
9. Botón "Tomar siguiente" disabled si la cola está vacía.
10. Click en "Tomar siguiente" llama `POST /api/frp/jobs/take-next` y actualiza la UI con el job tomado.
11. Click en "Tomar" de un card específico hace lo mismo (depende de Open Question 3).
12. Si otro técnico toma un job, el card desaparece de la cola en menos de 2s (vía SSE).
13. Click en "Marcar finalizado" llama `PATCH /api/frp/jobs/:id/finalize`, refresca el panel, mueve el job a Finalizados.
14. Click en "Reportar problema" abre modal de reportar problema (no parte de esta spec).
15. Click en "Ver comprobante" abre modal con paymentProofs y botones de aprobar/rechazar.
16. Approve de un comprobante llama `PATCH /api/frp/orders/:id/payment-review` y dispara lock 15min.

**Estados y permisos:**
17. Si el técnico activo es Jack y currentUser es Angelo, el botón "Tomar" está disabled con tooltip "Solo el técnico activo puede tomar jobs".
18. Si rol es `ATENCION_TECNICA`, los botones de aprobar/rechazar pago están disabled.
19. Durante el switch (10s ventana), badge del header dice "Cambiando técnico…" en gris.
20. Si la sesión del técnico expira, redirige a `/login` automáticamente.

**Responsive:**
21. En mobile (<768px), cards de cola se vuelven verticales (info arriba, botón abajo).
22. En mobile, grid de Pagos+Atención se vuelve 1 columna.
23. En mobile, data cells del card "Tu trabajo actual" se apilan en 1 columna.

**Edge cases:**
24. Si la cola está vacía y no hay job tomado, mensaje "Sin trabajo actual. Esperando que clientes conecten equipos."
25. Si SSE se cae, banner amarillo arriba del panel "Reconectando…" hasta que vuelva.
26. Texto largo en nombres se trunca con ellipsis.

---

## 8. Open questions / Decisiones pendientes

Antes de codear, Bryam tiene que resolver:

1. **¿Qué pasa con un job en `EN_PROCESO` cuando hay switch de técnico?** Hoy queda asignado al técnico que lo tomó (Jack), pero Angelo no puede continuarlo. Opciones:
   - **A.** Mantener como está. Si Jack vuelve a ser activo, retoma su job.
   - **B.** Liberar el job (vuelve a `LISTO_PARA_TECNICO`) cuando hay switch.
   - **C.** Permitir que Angelo "herede" el job al volverse activo.

2. **¿Qué pasa si Bryam (admin) revierte una aprobación de pago después de que el job ya estaba en `EN_PROCESO`?** Hoy no afecta al job. Opciones:
   - **A.** Cancelar el job automáticamente.
   - **B.** Mover a `REQUIERE_REVISION` para que el técnico vea el problema.
   - **C.** Mantener como está (job sigue, pago revertido).

3. **¿"Tomar" desde un card específico en la cola es endpoint nuevo o reuso de `take-next`?** Hoy `take-next` toma el primero. Si querés que el técnico pueda elegir cuál tomar (por ejemplo, priorizar a un VIP), hay que agregar `POST /api/frp/jobs/:id/take`. Si no, "Tomar" en cards específicos es solo decoración y siempre toma el primero.

4. **¿Hay un timeout para jobs `EN_PROCESO`?** Si Jack toma un job y se va sin marcarlo finalizado, ¿qué pasa? Hoy queda colgado. Sugerencia: warning después de 30 min, autocancel después de 2 hs.

5. **¿La sección "FINALIZADOS HOY" muestra finalizados de cualquier técnico o solo del que está logueado?** Si es de cualquier técnico, ¿se diferencia visualmente quién finalizó cada uno?

6. **¿El modal de "Reportar problema" requiere razón obligatoria?** Si sí, ¿es texto libre, categoría predefinida, o ambas? (Esta es responsabilidad de otra spec, pero impacta el flow.)

7. **¿Filtro/búsqueda en la cola?** Si la cola tiene 30+ jobs (caso pico), ¿se necesita filtrar por país, cliente, urgente, etc.? O se asume que la cola siempre es manejable visualmente.

8. **¿Notificación sonora cuando entra un job nuevo?** Algunos paneles operadores usan beep al entrar trabajo nuevo. Decidir si va.

---

## Changelog

- **v1.0** (2026-05-02) — Spec inicial. 8 piezas completas. 8 Open Questions pendientes.
