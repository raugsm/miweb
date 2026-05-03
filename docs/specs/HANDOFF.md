# HANDOFF — AriadGSM Portal Specs

**Para Claudes futuros que retomen este trabajo.** Si abrís un chat nuevo, leé este archivo primero, después abrí los otros archivos en `docs/specs/`. Después de eso, ya sabés todo lo necesario para continuar.

**Última actualización:** 3 de mayo 2026 · v1.5

---

## ⚠️ ANTES DE NADA — el proceso obligatorio

Toda acción que se le pida a Claude Code debe pasar este checklist. **Sin excepciones, ni siquiera para "limpiezas simples".**

```
Plan → Design → Implement → Test → Review
```

Antes de mandar **cualquier** prompt de implementación a Claude Code, el Claude del chat tiene que validar:

- [ ] **Plan** — ¿qué se hace y por qué? Está escrito.
- [ ] **Design** — ¿hay mockup, lista de archivos a tocar, riesgos identificados, dependencias mapeadas?
- [ ] **Luz verde de Bryam** — ¿aprobó el plan explícitamente?
- [ ] **Test** — ¿hay criterio de aceptación o instrucción de prueba en local?
- [ ] **Review** — ¿hay forma de revertir si sale mal? (commit aislado, plan B)

**Si alguna casilla está vacía, NO mandar prompt de implementación.** Mandar prompt de análisis primero (ver `_template-prompt-claude-code.md`).

### Trampas comunes que ya cometimos

Estas son patrones reales que aparecieron en sesiones anteriores. Si te encontrás haciendo alguna, **frená**.

| Trampa | Cómo se ve | Cómo evitarla |
|---|---|---|
| **"Es solo limpieza, no necesita Plan"** | "Eliminá X" sin análisis de dependencias | Toda eliminación pide análisis previo. Lo que parece muerto puede tener referencias ocultas. |
| **"Ya lo dijo el cliente, ya existe"** | Implementar basado en lo que Bryam comentó en el chat sin archivo | Si no está en archivo .md persistido, no existe. Escribir spec primero. |
| **"Claude Code ya conoce el contexto"** | Mandar prompt sin recordatorio de HANDOFF + spec activa | Cada chat de Claude Code es una sesión nueva. Empezar siempre con "leé HANDOFF.md y la spec X antes de tocar código". |
| **"Hacé los 4 mockups de una"** | Tirar 4 visuales seguidos sin validar el primero | Uno por uno. Bryam valida estilo antes de replicar. |
| **"Mientras tanto agregale Y al commit"** | Sumar scope durante implementación | Una spec, un commit, un alcance. Si aparece Y, es spec separada. |
| **"Una preguntita rápida durante el código"** | Que Claude Code resuelva ambigüedad inventando | Si Claude Code duda, **debe parar y preguntar**. Eso está en su prompt y se respeta. |
| **"La spec ya cubre esto, no necesito análisis"** | Saltar Template A porque la spec describe el qué | La spec dice **qué** hacer. El análisis dice **cómo** y **qué se rompe en el camino**. Son distintos. |
| **"Una mejora chiquita de yapa"** | Claude Code agrega cosa fuera de scope con buena intención (ej. accessibility) | Aunque sea correcto, debe preguntarse antes. Transparentar después es mejor que esconder, pero preguntar antes es lo correcto. |
| **"Aparece un bug nuevo, mejor rediseñemos todo"** | Reaccionar a una frustración con un cambio de plan grande durante una sesión | El plan grande se discute en sesión aparte, en frío. Un bug ≠ tirar el plan. Sin entender los bugs primero, esos bugs migran al rediseño. |
| **"El audit ya confirmó que es dead code"** | Confiar en el audit como verdad final sin pruebas empíricas | El audit puede equivocarse (caso H-004 → B-008 en sesión 8). Smoke test es el último filtro antes de cerrar. |

---

## Validación profunda — cuándo

**Política acordada en sesión 7:** durante implementación de Fase 1 NO hacemos validación profunda case-by-case. Solo smoke test rápido para detectar errores obvios (panel no carga, consola con errores rojos, regresiones visuales evidentes).

**Validación profunda toca recién en QA integral**, cuando:
- Operador FRP Express completo (sesión 7 ✅)
- Bugs cliente activados (sesión 8 ✅ parcial — falta B-008)
- B-008 fix (sesión 9)
- Cualquier cleanup pendiente (Bundle 3)

Razón: probar feature por feature mientras hay bugs cliente conocidos genera ruido. Bugs del operador y del cliente se mezclan. Mejor cerrar bloques completos y QA integral al final.

---

## Qué es AriadGSM

Servicio remoto de FRP/Cuenta Google para Xiaomi en Latam. Procesa ~130 órdenes/día. El cliente final son técnicos de tienda (B2B) que pagan en USDT, transferencia local (PE/MX/CO/CL) o Yape Perú.

**Owner:** Bryam (no es programador, aprende haciendo, prefiere mockups visuales sobre texto largo).
**Operadores internos:** Jack (principal) + Angelo (apoyo). Trabajan en turnos distintos, no simultáneos.

**Producto:** monorepo Node.js que sirve dos frontends según host:
- `ariadgsm.com` → portal cliente (4 pasos para que el técnico mande su pedido)
- `ops.ariadgsm.com` → panel operador (donde Jack/Angelo procesan los pedidos)

**Característica clave del bypass:** dura 5-10 segundos físicos. La interfaz del operador acompaña el antes y después del bypass, no el durante. Decisiones como "cancelar de raíz" son seguras.

---

## Plan de lanzamiento (decisión sesión 7, ratificado sesión 8)

Bryam eligió **Opción B**: lanzar con visual nuevo del cliente, no solo bugs arreglados. Estimación realista:

```
SESIÓN 7 (cerrada)
└── Operador FRP Express completo + cierre con archivos firmes ✅

SESIÓN 8 (cerrada)
└── B-001 fix paso 4 cliente (1 commit) + descubrimiento de B-008 ✅

SESIÓN 9
└── B-008 fix (crítico) + QA integral cliente + operador

SESIÓN 10
└── Spec + implementación paso 1 cliente

SESIÓN 11
└── Spec + implementación paso 2 cliente

SESIÓN 12
└── Spec + implementación paso 3 cliente

SESIÓN 13
└── Spec + implementación paso 4 cliente

SESIÓN 14
└── QA final cliente rediseñado

→ LANZAMIENTO (~1-2 semanas de trabajo dependiendo de cadencia)
```

**Si en sesión 9 surge urgencia de lanzar antes** con cliente "feo pero funcional", se puede cambiar a Opción A (lanzar con cliente actual + bugs arreglados, postergar rediseño visual). La decisión no es irreversible.

**En sesión 8 hubo una propuesta de saltar al rediseño en caliente** después de detectar B-008. Se frenó. Ver bitácora de errores de proceso. Si vuelve a surgir, el camino es: sesión dedicada en frío, no decisión durante implementación.

---

## Estado actual del proyecto

### Lo que YA está implementado

- Cliente: 4 pasos completos (precio → solicitud → pago → conexión)
- Mis Órdenes con activity log y PDF con QR + SHA-256
- Panel operador con 8 tabs (Inicio, Tickets, FRP Express, Clientes, Precios, Cierre diario, Usuarios, Auditoría)
- Login con roles (ADMIN, COORDINADOR, ATENCION_TECNICA), 2FA, password reset
- Switch técnico activo (Jack ↔ Angelo) con ventana 10s
- Pricing engine completo (validación 5 niveles, lock 15 min, providers)
- State machine (4 enums)
- SSE en vivo en `/api/portal/orders/events` (cliente)
- SSE en vivo en `/api/operator/frp/events` (operador) end-to-end
- Multi-orden con priorización por accionabilidad
- Cierre diario con export Excel
- Auditoría completa
- Master clients + dedup cross-canal
- **NUEVO sesión 8:** Paso 4 cliente muestra código real de orden activa (no más placeholder permanente)

### Implementado en sesión 7 — Operador FRP Express completo

**Backend (4 commits):**

- `f1267a3` — `POST /api/frp/jobs/:id/take` (toma específico)
- `d2bc27f` — `PATCH /api/frp/jobs/:id/cancel` con `{reason, note}`
- `99aae55` — `finalize` con auto-log Lima, sin requerir log/imagen manual
- `defc7f8` — `finishedTodayJobs[]` en `publicFrpState`

**Rediseño visual + cleanup (3 commits):**

- `c00df85` — Commit 5: rediseño visual del panel a layout vertical priorizado
- `16f094a` — Commit 5b: cleanup post-rediseño (Mínimo+: 8 contadores + Crear orden manual + Costos FRP colapsado + 22 elementos zombi). Diff -418/+10.
- `6410f62` — Commit 6: banner timeout 30 min + UI cancelar
- `4dfa23f` — Commit 6b: cleanup visual (quitar botón Actualizar + estilizar summary acordeón Costos FRP)

**SSE end-to-end (3 commits):**

- `ca81c63` — Commit 7a: backend SSE base (helpers, endpoint, instrumentación 7 endpoints FRP)
- `011c60a` — Commit 7b: backend SSE cross-cutting (portal + technician switch 1er evento + manual orders)
- `f6c2927` — Commit 7c: frontend SSE (EventSource, reconnect banner, notice handling, polling acelerado durante swap)

**Total sesión 7: 11 commits. Tests 11/11 pass en cada uno. Smoke tests OK al cierre.**

### Implementado en sesión 8 — Fix B-001 paso 4 cliente

**1 commit, branch `feat-step4-redesign`:**

- `964413b` — `fix(portal-cliente): paso 4 muestra codigo real de orden activa (B-001)`. `renderStaticStepGuide` ahora pasa `activeOrderForFlow(state.customer)` en lugar de `null`. Cliente con orden EN_PREPARACION/LISTO_PARA_CONEXION ve su código real `CL-YYYYMMDD-NNN-Q` en paso 4 en lugar del placeholder `CL-YYYYMMDD-000-1`. Diff: 2 inserciones / 2 eliminaciones en `public/portal-modules/auth-forms.js` (líneas 13 y 22).

**Total sesión 8: 1 commit. Smoke test del paso 4 NO completado por aparición de B-008 (pre-existente, ver "Bugs conocidos en cola"). El smoke test se completará en sesión 9 después de arreglar B-008.**

### Lo que está parcial

- VIP/postpago: backend completo (`vipUnitMargin`, `usableNow`, `urgentRequested`), no hay UI cliente
- Notificaciones in-portal: planeado como PR-2c, no empezado
- Anti-fraude 4 capas: planeado como PR-2b, no empezado
- Multi-orden enforcement: UI prioriza pero backend no enforce
- **B-008 (comprobante bloqueado):** identificado, no arreglado. Pre-existente. Bloquea creación de órdenes nuevas con comprobante. Sin urgencia inmediata porque app no está deployada. Target sesión 9.
- **Smoke test B-001:** parcial. Solo se confirmó que el commit no causa regresión. Los 4 escenarios de validación del paso 4 quedaron pendientes porque B-008 bloquea llegar al paso 4 con orden fresh. Completar en sesión 9 una vez resuelto B-008.

### Lo que NO existe

- Tests E2E completos
- TypeScript (todo es JS puro)
- i18n (todo en español hardcoded)
- Storage externo (comprobantes en JSON DB como base64)
- Framework web (es `node:http` raw)

### Bugs conocidos en cola

**El conteo "16 bugs" del HANDOFF previo estaba obsoleto.** Audit de Claude Code en sesión 8 reveló que la mayoría ya se cerraron en commits previos (ca03afc paso 2, b433733 modelo opcional, e768f3a paso 4, 5b cleanup). Estado real:

- **B-001 (paso 4 código real)** — ✅ ARREGLADO sesión 8 (commit 964413b)
- **B-002 (pills "Perú" duplicadas en paso 1)** — UX, requiere decisión de producto. Target sesión 9 o Bundle 3.
- **B-003** `wirePaso4BannerActions` import muerto en `auth-forms.js:15` — Bundle 3
- **B-004** `operationCode` sin callers en `connection.js:3-7` — Bundle 3
- **B-005** `customerName` ignorado en `stepGuideMarkup` (`auth-forms.js:25` lo envía pero `connection.js:81` no lo recibe) — Bundle 3
- **B-006** `liveRing` animación 1.8s vs spec 1.4s en `05-frp-flow.css:321` — Bundle 3
- **H-008** copy "pasos 1, 2 y 3" en paso 3 (debería decir "1 y 2") en `portal.html:210` — Bundle 3
- **B-008 NUEVO — comprobante bloqueado en creación de orden nueva — CRÍTICO.** Pre-existente desde commit b433733. El backend (`portal-routes.js:528`) marca `compatibilityReviewRequired=true` cuando items vacíos retornan `REQUIERE_REVISION` desde `frpEligibilityResult("")`. Audit en H-004 lo dio por dead code incorrectamente. Sin fix, ningún cliente nuevo puede crear orden con comprobante. Target: sesión 9 con análisis previo de los 3 fixes posibles (ver "Pendientes y próximos pasos").

**Otros pendientes Bundle 3:**

- **2 pills "Perú" duplicadas** (PE_YAPE_BRYAMS + PE_YAPE_PEREGRINA) — Bundle 3 (mismo issue que B-002)
- **`compatibilityReviewRequired` dead code** después del fix B-008 — Bundle 3
- **`ARIAD_ENABLE_SETUP_RESET=true` en producción** abre vector de attack — Bundle 3
- **CSP error con Google Fonts** en consola del operador — Bundle 3
- **CSS huérfano (~200 líneas)** en `public/styles.css` después del cleanup — Bundle 3
- **10 funciones potencialmente muertas** en `public/app.js` (uploadFrpPaymentProof y otras) — Bundle 3

### Deuda residual de sesiones anteriores

- **DOM diffing para flicker:** múltiples timers (60s del banner timeout, 30s/2s del polling técnico, eventos SSE) convergen a `renderFrp({ skipPricing: true })`. Si se nota flicker molesto en uso real, implementar diffing en commit separado.

- **Disparador de `payment_reverted`:** mecanismo SSE listo (campo `notice` en payload), pero el endpoint admin que revierte pagos no existe todavía. Cuando se construya, llamar `publishFrpOps(db, "payment_reverted", { notice: { type: 'error', message: '...' } })`.

- **Sub-acción "Adjuntar evidencia" post-finalización:** mencionada en spec v1.2 (decisión auto-log de finalize). No implementada todavía. Spec separada cuando sea necesario.

- **`:focus-visible` en summary del acordeón Costos FRP:** Claude Code lo agregó en commit 6b sin estar en scope original. Es accessibility útil, transparente sobre la desviación. Documentado como caso en bitácora de errores de proceso.

---

## Cómo trabajamos (reglas no negociables)

### 1. Reference-driven design
Los mockups visuales son la fuente de verdad, no las interpretaciones textuales. Cada decisión va en archivo persistente (Markdown o HTML), nunca solo en el chat. Si está solo en chat, **no existe**.

### 2. Specs antes de código
Cada spec tiene 8 piezas: mockup, estados, edge cases, responsive, comportamiento, datos, acceptance criteria, open questions.

### 3. Plan → Design → Implement → Test → Review
Ver checklist arriba. **No improvisar entre etapas. No saltarse etapas.**

### 4. Por sesión, una spec
Una sesión = un archivo entregado. No mezclar specs.

### 5. Persistencia obligatoria
Cada sesión termina con archivos en `/mnt/user-data/outputs/` que Bryam sube al repo. Si no hay archivo persistido, la sesión no sirvió.

### 6. Cómo subir archivos al repo
Bryam descarga los archivos a `C:\Users\Bryams\Desktop\AriadGsm\files1\`. Cada sesión termina con un prompt para Claude Code que mueva los archivos al repo y haga commit local (sin push). Ver template en `_template-prompt-claude-code.md`.

### 7. Sub-commits para trabajos grandes
Cuando un commit es grande (>200 LOC, >3 archivos, o múltiples áreas tocadas), partir en sub-commits (7a, 7b, 7c). Beneficios: mejor granularidad de revert, smoke test entre cada uno, fácil de revisar.

### 8. Tono con Bryam
- No es programador, aprende haciendo
- Prefiere respuestas cortas y mockups visuales
- Pide fuentes externas cuando duda — eso es chequeo, no desconfianza
- Usa instancia paralela de Claude Code para implementación
- El Claude del chat hace specs/diseño, Claude Code hace código
- **Sin jerga técnica**. Si Bryam pide hablar "más suave", se cumple. Términos como "regresión", "branch", "diff", "scope", se traducen o se evitan.

### 9. Frase de arranque obligatoria de Bryam
Cuando Bryam abre un chat nuevo conmigo, debe arrancar con esta frase (o similar):

> "Soy Bryam de AriadGSM. Te paso HANDOFF.md y archivos de specs. Trabajamos con proceso Plan → Design → Implement → Test → Review. **Si me proponés saltar alguna etapa, frename.**"

La última oración es lo que me da permiso explícito a frenarte si me apuro. Sin esa frase, la regla se debilita.

### 10. Validación profunda solo en QA integral
Durante implementación de Fase 1, smoke test rápido. Validación profunda recién cuando todos los bloques están cerrados. Esto evita mezclar contextos de bugs distintos.

### 11. Audit no es verdad final
Un audit de Claude Code es ayuda valiosa pero NO infalible. Smoke test es el último filtro. En sesión 8, el audit afirmó que cierta rama era "dead code" (H-004) pero el smoke test descubrió que era B-008, un bug bloqueante. Lección: confiar en el audit pero verificar empíricamente cuando se pueda.

---

## Decisiones de producto firmes (no se reabren)

### Pricing
- Lock por orden completa por 15 min desde aprobación del comprobante
- Validación 5 niveles: `<15%` silencio, `15-30%` confirm, `30-50%` motivo+notif, `>50%` admin Bryam, `<1` o `>100 USDT` rechazo absoluto

### VIPs
- Atributo: **`vipUnitMargin`** (no `vipUnitPrice`)
- Fórmula: `precio_VIP = costo_proveedor + vipUnitMargin`
- Rango: 0.5 – 1.0 USDT
- Marcar VIP activa postpago automáticamente

### Multi-orden
- Permitir nuevas EXCEPTO si hay órdenes en `ESPERANDO_PAGO` o `PAGO_RECHAZADO`

### Timers cliente
- Paso 2: 30s banner azul, 90s banner amarillo
- Paso 4: 2 min sin apretar "Equipo conectado" → banner "🔧 ¿Listo para conectar?"

### Mis Órdenes
- Solo aparece después que cliente apreta "Equipo conectado"
- Activity log con eventos del cliente marcados con "(vos)"
- Botón "Comprobante (PDF)" disabled hasta `FINALIZADO`

### Operador FRP Express
- **Switch técnico con job en curso:** el job se queda con quien lo tomó (`technicianId`).
- **Tomar específico:** botón "Tomar" en cada card de la cola. Endpoint `POST /api/frp/jobs/:id/take`.
- **Pago revertido con job en curso:** cancelación de raíz. Bypass dura 5-10s.
- **Timeout 30 min:** banner amarillo en card actual con [Sigo trabajando] / [Cancelar job]. Confirm dialog antes de cancelar. Persiste en localStorage.
- **Finalizados hoy:** muestra de ambos técnicos con identificador visual (J/A).
- **Reportar problema:** texto libre + opciones predefinidas. Modal en spec separada.
- **Filtro VIP en cola:** toggle simple, client-side, persiste en sessionStorage.
- **Beep al entrar nuevo job:** ELIMINADO.
- **finalize sin log obligatorio:** auto-log "Finalizado por <user> a las <HH:MM>" Lima se genera automáticamente.
- **"Crear orden manual" en panel FRP Express:** ELIMINADO (no se usa).
- **"Actualizar" botón en panel FRP Express:** ELIMINADO (innecesario con SSE).
- **Costos FRP en panel FRP Express:** colapsado bajo acordeón con label uppercase y chevron rotable. Rediseño interno pendiente (`_costos-frp-redesign-pendiente.md`).
- **2do evento del switch técnico:** NO se emite desde backend (no ensuciar `readDb`). Frontend resuelve con polling acelerado a 2s durante swap, vuelve a 30s al completarse.

### Mockups cliente (sesiones 1-5)
- **Paso 1:** layout 3+2 de pills (CO/MX/CL arriba, PE/USDT abajo). Card oscura "ESTIMADO · EN VIVO" con dot pulsante.
- **Paso 2:** stepper -/n/+ con label "Equipos a desbloquear". Total en card oscura con breakdown integrado. Insignia verde "98% modelos soportados". Validación modelo opcional (no gate).
- **Paso 3:** card "TOTAL A PAGAR" oscura. Header método con icono. Cards de cuentas con botón Copiar. Lock 15 min azul. Banner amarillo "Revisá pasos 1 y 2". Dropzone dasheada.
- **Paso 4:** SIN banner "pago aprobado". Mini-Redirector NO inline, va en bottom sheet por botón "¿Dónde pego estos datos?". Datos con badges 1° azul / 2° verde matcheando los campos del Redirector.

### Operador FRP Express (sesión 6-7)
- Vista única vertical priorizada por urgencia
- Header con técnico activo (Jack o Angelo)
- "Tu trabajo actual" arriba como hero
- Cola con cards horizontales + tiempo de conexión + botón Tomar + filtro VIP
- "Pagos por revisar" + "Atención" en grid 2 columnas
- "Finalizados hoy" como tabla compacta sin acciones, mostrando ambos técnicos
- Acordeón "Costos FRP" colapsado al final
- SSE end-to-end con reconnect banner
- Un técnico procesa un job por vez

### Paso 4 cliente / Edge case EN_PROCESO (sesión 8)
- Durante los 5-10s del bypass (orden en estado EN_PROCESO), el campo "Código del proceso" muestra el placeholder transitorio `CL-YYYYMMDD-000-1` porque `activeOrderForFlow` no incluye ese estado en sus filtros.
- **Decisión: aceptado (Opción A — mínima).** El cliente ya tiene el código copiado antes de EN_PROCESO. Si en QA integral se observa que molesta a clientes reales, abrir commit separado para extender `activeOrderForFlow` (sin tocarlo en B-001 para no expandir scope).

### Formatos
- Technician ID: `1000 9983 5478` (espaciado cada 4 dígitos)
- Código del proceso: `CL-{code}-{quantity}` (ej. `CL-20260502-007-2`)
- Order code interno (FRP): `ARD-YYYYMMDD-NNN`
- Order code cliente: `CL-YYYYMMDD-NNN`
- Campo en código: **`technicianId`** (no `takenBy`)

### Estados de orden (lista exhaustiva del código)

**`customerOrder.publicStatus`:**
`SOLICITUD_RECIBIDA`, `REVISION_COMPATIBILIDAD`, `ESPERANDO_PAGO`, `PAGO_EN_REVISION`, `PAGO_RECHAZADO`, `EN_PREPARACION`, `LISTO_PARA_CONEXION`, `EN_PROCESO`, `FINALIZADO`, `REQUIERE_ATENCION`, `POSTPAGO_SOLICITADO`, `CANCELADO`

**`frpOrder.orderStatus`:**
`COTIZADA`, `ESPERANDO_PAGO`, `PAGO_VALIDADO`, `EN_PREPARACION`, `PARCIAL_LISTA`, `LISTA_PARA_TECNICO`, `CERRADA`, `CANCELADA`

**`frpOrder.paymentStatus`:**
`ESPERANDO_COMPROBANTE`, `PAGO_EN_VALIDACION`, `PAGO_VALIDADO`, `COMPROBANTE_RECHAZADO`, `REVISION_COMPATIBILIDAD`

**`frpJob.status`:**
`ESPERANDO_PREPARACION`, `LISTO_PARA_TECNICO`, `EN_PROCESO`, `FINALIZADO`, `REQUIERE_REVISION`, `ESPERANDO_CLIENTE`, `CANCELADO`

**Customer status:**
`REGISTRADO_NO_VERIFICADO`, `EMAIL_VERIFICADO`, `REGISTRADO`, `VERIFICADO`, `VIP`, `EMPRESA`, `BLOQUEADO`

---

## Archivos en el repo

### `docs/specs/`
- **`PLAN.md`** — plan estratégico de 7 specs en 3 fases. Versión actual: v1.1.
- **`HANDOFF.md`** — este archivo. Bridge entre sesiones. **Versión actual: v1.5.**
- **`audit-template.md`** — template para auditar el repo con Claude Code.
- **`_template-prompt-claude-code.md`** — templates obligatorios para prompts a Claude Code.
- **`_brand-tokens-pendiente.md`** — placeholder para sesión de polish visual con logo.
- **`_costos-frp-redesign-pendiente.md`** — placeholder para rediseño visual interno de Costos FRP.

### `docs/specs/cliente/`
- **`paso-1-precio.md`** — spec completo del paso 1 (8 piezas). 26 acceptance criteria, 8 open questions sin responder aún.
- **`mockups/paso-1-precio.html`** — mockup HTML standalone responsive del paso 1.

### `docs/specs/operador/`
- **`operador-frp-express.md`** — spec completo del panel FRP Express v1.2. 43 acceptance criteria, 4 open questions abiertas (futuras sesiones).
- **`mockups/operador-frp-express.html`** — mockup HTML standalone v1.1 con filtro VIP.

### `docs/`
- **`ariadgsm-decisiones-FINAL-2026-05-02.md`** — doc histórico de decisiones de producto. Source of truth ANTES de las specs nuevas. Las specs tienen precedencia en caso de conflicto.

---

## Endpoints implementados en sesión 7

**FRP routes:**
- `POST /api/frp/jobs/:id/take` — toma específico
- `PATCH /api/frp/jobs/:id/cancel` — body `{ reason, note }`
- `finalize` modificado: auto-log Lima
- `publicFrpState` extendido con `finishedTodayJobs[]`

**SSE operador:**
- `GET /api/operator/frp/events` — SSE stream
- Helper `publishFrpOps(db, reason, opts?)` con campo `notice` opcional
- Map `frpOpsStreams<userId, Set<stream>>` con cleanup en disconnect
- 13 puntos de instrumentación en mutaciones existentes (FRP + portal + technician switch + manual orders)

---

## Pendientes y próximos pasos

### Sesión 9 (próxima)

**Foco:** B-008 fix + QA integral cliente + operador.

Procedimiento:

1. **Audit + análisis previo de B-008** (Template A en Claude Code). Los 3 fixes posibles identificados en sesión 8:
   - **(a) Backend en `eligibility.js:33-67`:** `frpEligibilityResult("")` retorna `APTO_EXPRESS` en lugar de `REQUIERE_REVISION`. Cambia semántica del helper. Riesgo: validación de fraude debilitada si en el futuro se reintroducen items con texto.
   - **(b) Backend en `portal-routes.js:528`:** `compatibilityReviewRequired = items.some(item => item.originalText !== "" && eligibility.review)`. Excluye items vacíos del flag. Más quirúrgico, mantiene `frpEligibilityResult` intacta. Recomendación inicial.
   - **(c) Frontend en `events.js:64`:** dejar de mandar `items` al backend cuando el cliente no escribió modelo. Backend genera placeholders sin items específicos. Más invasivo, requiere alinear validador del backend para aceptar requests sin items.

2. **Decisión de producto + Plan → Design** del fix elegido.

3. **Implementación + smoke test** del flow completo (creación de orden + comprobante + paso 4 con código real, completando lo pendiente del smoke test de B-001).

4. **QA integral** con validación profunda (checklist completo) cliente + operador. Esto incluye:
   - Verificar que el smoke test de B-001 pasa los 4 escenarios después del fix B-008
   - Recorrer los 8 tabs del operador
   - Recorrer los 4 pasos del cliente con cuenta nueva
   - Verificar SSE end-to-end
   - Verificar que B-002 a B-006 + H-008 siguen donde están (no introducimos regresiones)

### Sesiones 10-13

Spec + implementación de mockups del cliente (paso 1, 2, 3, 4 en sesiones separadas).

### Sesión 14

QA final del cliente rediseñado + lanzamiento.

### Post-lanzamiento (Bundle 3 + futuro)

- Bundle 3 cleanup (CSS huérfano, funciones zombi, error CSP, Perú dup, B-003 a B-006, H-008)
- B-002 (decisión de producto sobre pills "Perú")
- Endpoint admin para revertir pagos (dispara `payment_reverted` SSE)
- Modal "Reportar problema"
- Sub-acción "Adjuntar evidencia" post-finalización
- VIP/postpago UI cliente
- Notificaciones in-portal (PR-2c)
- Anti-fraude 4 capas (PR-2b)
- Tools/billeteras (modelo nuevo + admin)
- Multi-orden enforcement backend
- Rediseño visual de Costos FRP (con mockup, ver `_costos-frp-redesign-pendiente.md`)
- Polish visual con logo (ver `_brand-tokens-pendiente.md`)
- DOM diffing si flicker es molesto

---

## Bitácora de errores de proceso

Esta sección documenta cuando una sesión salteó pasos del proceso. Sirve para que un Claude futuro vea ejemplos reales y no los repita.

### Sesión 5 — Inicial: "no nos trabamos con specs todavía, sigamos con mockups"
- **Qué pasó:** El Claude del chat sugirió seguir con mockups uno por uno (paso 1, 2, 3, 4) en vez de planificar el método completo de specs.
- **Por qué falló:** Los mockups solos cubren "happy path", no estados, edge cases, responsive, behavior, etc. Eso generó los 16 bugs en cola (que sesión 8 demostró eran 7 reales).
- **Cómo se corrigió:** Bryam aportó referencias de Miro 2026 sobre las 8 piezas. Cambio de método. Plan estratégico v1.0.
- **Lección:** No minimizar advertencias del cliente cuando aporta fuentes externas.

### Sesión 5 — Después: "te entrego el paso 1 y vamos haciendo el resto"
- **Qué pasó:** El Claude propuso entregar specs una por una sin plan estratégico previo.
- **Por qué falló:** Sin plan total, Bryam no podía ver el camino completo.
- **Cómo se corrigió:** Plan estratégico antes de ejecución específica.
- **Lección:** Plan total antes de paso por paso, siempre.

### Sesión 7 — "Es solo limpieza, eliminá X"
- **Qué pasó:** El Claude propuso eliminar panel viejo + Crear orden manual + Costos FRP sin pedir análisis previo de dependencias.
- **Por qué falló:** Saltó la etapa **Design**. Toda eliminación tiene riesgo de dependencias ocultas.
- **Cómo se corrigió:** Bryam preguntó "¿no debería leer el código primero?" Refactorizamos el prompt a uno de análisis previo. Resultado: Claude Code descubrió 2 listeners más que su reporte original había omitido. Sin análisis, hubieras tenido `ReferenceError` al cargar la página.
- **Lección:** "Limpieza" no es excepción al proceso. Toda acción pasa por Plan → Design antes de Implement.

### Sesión 7 — Commit 6: "la spec ya cubre esto"
- **Qué pasó:** El Claude del chat mandó prompt directo de implementación para commit 6 (banner timeout 30 min) sin pedir Template A primero.
- **Por qué falló:** La spec describe **qué** hacer; el análisis describe **cómo** y **qué se rompe**. Son distintos. Claude Code podría haber improvisado decisiones técnicas (cómo calcular `takenAt`, cómo trigger el banner sin SSE, etc.).
- **Cómo se corrigió:** Bryam preguntó "¿estás siguiendo Plan → Design → Implement → Test → Review?" El Claude reconoció el error y refactorizó el prompt a análisis previo. Claude Code devolvió 5 ambigüedades que requerían decisión.
- **Lección:** Tener spec NO equivale a tener análisis. Análisis previo siempre, aún con spec validada.

### Sesión 7 — Commit 6b: scope creep silencioso de Claude Code
- **Qué pasó:** Claude Code agregó `:focus-visible` accessibility al summary del acordeón Costos FRP sin estar en el scope acordado. Lo transparentó al final con "te aviso porque excede el reporte original aunque es minimal".
- **Por qué falló parcialmente:** Es accesibilidad útil, pero violó "scope acordado, nada más". Patrón peligroso: alguien improvisa "una mejora chiquita" sin pasar por Plan → Design.
- **Cómo se mitigó:** Lo dejamos (es 4 líneas, útil, transparente). Pero registrado como caso a evitar.
- **Lección:** Claude Code debe **preguntar antes**, no implementar y avisar después. Próxima vez, si surge "una mejora chiquita gratis" durante implementación, parar y preguntar.

### Sesión 8 — propuesta de saltar al rediseño en caliente
- **Qué pasó:** Durante el smoke test del fix B-001, apareció el mensaje rojo de B-008 (bug pre-existente bloqueante que el audit no había detectado). Bryam, frustrado, propuso "rediseñemos todo el flujo y esta página como hicimos con la otra, no quiero perder 2 días corrigiendo bug por bug".
- **Por qué fallaba:** Era una decisión de plan grande (saltar 4-5 sesiones del plan acordado en sesión 7) tomada en caliente, en respuesta a un solo bug nuevo, sin Plan/Design previo, sin análisis de costo real. Repetía el patrón del error de sesión 5 ("sigamos con mockups"): asumir que el rediseño visual cura los bugs de fondo.
- **Cómo se manejó:** El Claude del chat aplicó la regla "si me proponés saltar etapas, frename" del HANDOFF. Validó la frustración pero separó las dos cosas: (1) bug específico → diagnóstico técnico empírico via Claude Code, (2) cambio de plan grande → no se decide en caliente. Mostró que el rediseño no acortaría tiempos (4-5 sesiones igual) y que sin entender los bugs primero, esos bugs migran al rediseño nuevo. Bryam aceptó cerrar sesión 8 con solo B-001 y atacar B-008 en sesión 9 con cabeza fresca.
- **Lección:** Las propuestas de cambio grande de plan se discuten en sesión aparte, con cabeza fría, no como reacción a fricción de implementación. Un bug nuevo no justifica tirar el plan. Si la frustración con el plan reaparece de manera consistente entre sesiones, ahí sí merece sesión dedicada para reabrir Opción A vs Opción B en frío.

### Sesión 8 — audit incorrecto en H-004 → bug crítico oculto
- **Qué pasó:** El audit de Claude Code en sesión 8 clasificó `compatibilityReviewRequired` como dead code (H-004), basándose en el comentario en `events.js:55-58` ("Items vacios = APTO_EXPRESS por default"). Pero la lógica real en `eligibility.js:33-67` marca items vacíos como `REQUIERE_REVISION` (vía rama de ambigüedad), no `APTO_EXPRESS`. La rama no era dead code: era B-008, un bug crítico bloqueante.
- **Por qué falló:** Claude Code se basó en un comentario del código sin validar empíricamente la lógica del helper que el comentario afirmaba. El comentario fue agregado en commit b433733 con la asunción incorrecta y nadie lo verificó después.
- **Cómo se descubrió:** El smoke test del paso 4 (post-fix B-001) ejercitó el flow completo de creación de orden con comprobante. El bug se manifestó en pantalla del cliente y Bryam lo reportó con captura.
- **Lección:** El audit puede equivocarse, especialmente cuando se basa en comentarios o asunciones sin verificar la lógica real. Nueva trampa común agregada al HANDOFF: "El audit ya confirmó que es dead code". Smoke test es el último filtro antes de cerrar; no se omite "porque el audit ya validó".

---

## Cómo arrancar próxima sesión

Si sos un Claude que abre un chat nuevo:

1. Leé este `HANDOFF.md` completo, especialmente la sección "ANTES DE NADA — el proceso obligatorio".
2. Leé `_template-prompt-claude-code.md` para los formatos de prompt a Claude Code.
3. Bryam te va a decir en qué spec quiere trabajar. Buscá el archivo `.md` correspondiente en `docs/specs/`.
4. **Antes de proponer implementación, validá el checklist** Plan → Design → Implement → Test → Review.
5. **Antes de proponer cosas nuevas, revisá la sección "Decisiones de producto firmes" arriba.** Si querés contradecir alguna, decíselo explícitamente y pedí confirmación.
6. Una sesión = un archivo entregado. No empezar dos cosas a la vez.
7. **Cada sesión termina con un prompt para Claude Code** que mueva los archivos generados al repo. Bryam los descarga a `C:\Users\Bryams\Desktop\AriadGsm\files1\`.
8. **Al final de la sesión, actualizá este HANDOFF** si hay decisiones nuevas o si una spec cambió de versión.
9. **Si Bryam te pide saltar el proceso por urgencia o por "es simple", frená.** Tu rol es proteger el proceso, incluso de él.
10. **Si Bryam pide hablar más simple/suave**, sin jerga técnica, cumplir. No es programador.

### Frase de arranque que Bryam debe usar

> "Soy Bryam de AriadGSM. Te paso HANDOFF.md y archivos de specs. Trabajamos con proceso Plan → Design → Implement → Test → Review. **Si me proponés saltar alguna etapa, frename.**"

Si no usa esa frase, recordásela vos antes de avanzar.

---

## Sesiones previas (resumen mínimo)

- **Sesión 1-4:** mockups visuales de los 4 pasos cliente. Iteramos hasta cerrar diseño visual. Mockups validados pero no persistidos como archivo en sesiones 1-3.
- **Sesión 5:** definimos el método (8 piezas por spec). Spec completa de paso 1 cliente como piloto. Plan estratégico v1.1. Audit del repo (revelado que 80% ya está implementado, plan rebajado de 15 a 7 specs). Spec inicial del operador FRP Express v1.0.
- **Sesión 6:** Bryam respondió las 8 Open Questions del operador FRP Express. Spec actualizada a v1.1 (38 AC, 0 OQ). Mockup actualizado con filtro VIP y columna de técnico. Decisión de bypass 5-10s justifica "cancelar de raíz" y "timeout 30 min con banner".
- **Sesión 7 (cerrada):** 11 commits implementados. Operador FRP Express completo end-to-end:
  - 4 commits backend (take, cancel, finalize auto-log, finishedTodayJobs)
  - 3 commits visuales (rediseño + cleanup 5b + cleanup 6b)
  - 1 commit feature (banner timeout 30 min)
  - 3 sub-commits SSE (7a backend base, 7b cross-cutting, 7c frontend completo)
  - Decisiones registradas: beep eliminado, finalize auto-log, technicianId, ARD-, sin XXX, sin Crear orden manual, sin botón Actualizar, polling acelerado durante swap reemplaza al 2do evento.
  - HANDOFF actualizado a v1.3 con 4 nuevas trampas comunes y 5 errores de proceso documentados.
  - Plan revisado: Opción B (lanzar con visual nuevo cliente). Estimación: ~7 sesiones más para lanzamiento.
- **Sesión 8 (cerrada):** 1 commit + descubrimiento crítico.
  - **Audit del estado actual** reveló que el conteo "16 bugs" estaba obsoleto. La mayoría ya se cerraron en commits previos (ca03afc, b433733, e768f3a, 5b cleanup). Bugs reales detectados: 7 (B-001 a B-006 + H-008) más hallazgos H-001 a H-008.
  - **B-001 implementado** — fix de 2 LOC en `auth-forms.js:13` y `auth-forms.js:22`. Paso 4 cliente muestra código real de orden activa. Commit `964413b` en branch `feat-step4-redesign`. Diff: 2 inserciones / 2 eliminaciones.
  - **Decisión Opción A** sobre edge case EN_PROCESO: placeholder transitorio aceptado durante el bypass de 5-10s. Si en QA molesta, commit separado para extender `activeOrderForFlow`.
  - **B-008 descubierto** durante smoke test del paso 4. Pre-existente desde commit b433733. Bloquea creación de orden con comprobante. El audit en H-004 lo había clasificado erróneamente como dead code. Registrado para sesión 9 con 3 fixes posibles ya identificados.
  - **2 trampas evitadas:** (1) propuesta de "saltar al rediseño en caliente" frenada por Claude del chat aplicando regla del HANDOFF. (2) confiar en el audit como verdad final, descubierto al destapar B-008.
  - **HANDOFF actualizado a v1.4** con 2 nuevas trampas comunes ("Aparece un bug nuevo, mejor rediseñemos todo" y "El audit ya confirmó que es dead code"), 2 errores de proceso documentados, regla #11 sobre tono sin jerga, y regla #11 sobre audit no es verdad final.
- **Sesión 9 (en curso, inicio):**
  - **HANDOFF v1.5:** limpieza de referencias a "BryamsIA" (proyecto que no existe en este flujo, fue un error de copy/paste del owner en una versión previa). Removida la regla #10 de "Cómo arrancar próxima sesión" sobre verificar repo, y removida la entrada de bitácora "Sesión 7 — Confusión de proyectos". Sin impacto en decisiones técnicas ni de producto.

---

**Si tenés dudas que no podés resolver con este archivo + las specs, preguntale a Bryam directo. No improvises.**
