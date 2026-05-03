# HANDOFF — AriadGSM Portal Specs

**Para Claudes futuros que retomen este trabajo.** Si abrís un chat nuevo, leé este archivo primero, después abrí los otros archivos en `docs/specs/`. Después de eso, ya sabés todo lo necesario para continuar.

**Última actualización:** 2 de mayo 2026 · sesión 7

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
- Multi-orden con priorización por accionabilidad
- Cierre diario con export Excel
- Auditoría completa
- Master clients + dedup cross-canal

### Implementado en sesión 7 (en progreso)

Panel operador FRP Express rediseñado a la spec v1.1. Commits backend completos:

- `f1267a3` — `POST /api/frp/jobs/:id/take` (toma específico)
- `d2bc27f` — `PATCH /api/frp/jobs/:id/cancel` con `{reason, note}`
- `99aae55` — `finalize` con auto-log Lima, sin requerir log/imagen manual
- `defc7f8` — `finishedTodayJobs[]` en `publicFrpState`
- `c00df85` — Commit 5: rediseño visual del panel — **PENDIENTE LIMPIEZA (commit 5b)**
- Pendientes: commit 6 (banner timeout 30 min) y commit 7 (SSE operador)

### Lo que está parcial

- VIP/postpago: backend completo (`vipUnitMargin`, `usableNow`, `urgentRequested`), no hay UI cliente
- Notificaciones in-portal: planeado como PR-2c, no empezado
- Anti-fraude 4 capas: planeado como PR-2b, no empezado
- Multi-orden enforcement: UI prioriza pero backend no enforce

### Lo que NO existe

- Tests E2E completos
- TypeScript (todo es JS puro)
- i18n (todo en español hardcoded)
- Storage externo (comprobantes en JSON DB como base64)
- Framework web (es `node:http` raw)

### Bugs conocidos en cola

- **5 commits con 16 bugs visuales** ya están en Claude Code (cliente, no operador)
- **2 pills "Perú" duplicadas** (PE_YAPE_BRYAMS + PE_YAPE_PEREGRINA)
- **`compatibilityReviewRequired` dead code** después del fix bug 11
- **`ARIAD_ENABLE_SETUP_RESET=true` en producción** abre vector de attack

### Bug detectado en sesión 7

Commit 5 (c00df85) agregó el panel nuevo pero no eliminó el viejo. Ambos coexisten en pantalla. Esto disparó la bitácora de errores de proceso (ver más abajo). **Pendiente: commit 5b para limpieza con análisis previo.**

---

## Cómo trabajamos (reglas no negociables)

### 1. Reference-driven design
Los mockups visuales son la fuente de verdad, no las interpretaciones textuales. Cada decisión va en archivo persistente (Markdown o HTML), nunca solo en el chat. Si está solo en chat, **no existe**.

### 2. Specs antes de código
Cada spec tiene 8 piezas: mockup, estados, edge cases, responsive, comportamiento, datos, acceptance criteria, open questions. Si una pieza no existe, Claude Code la improvisa y probablemente mal.

### 3. Plan → Design → Implement → Test → Review
Ver checklist arriba. **No improvisar entre etapas. No saltarse etapas.**

### 4. Por sesión, una spec
Una sesión = un archivo entregado. No mezclar specs.

### 5. Persistencia obligatoria
Cada sesión termina con archivos en `/mnt/user-data/outputs/` que Bryam sube al repo. Si no hay archivo persistido, la sesión no sirvió.

### 6. Cómo subir archivos al repo
Bryam descarga los archivos a `C:\Users\Bryams\Desktop\AriadGsm\files1\`. Cada sesión termina con un prompt para Claude Code que mueva los archivos al repo y haga commit local (sin push). Ver template en `_template-prompt-claude-code.md`.

### 7. Tono con Bryam
- No es programador, aprende haciendo
- Prefiere respuestas cortas y mockups visuales
- Pide fuentes externas cuando duda — eso es chequeo, no desconfianza
- Usa instancia paralela de Claude Code para implementación
- El Claude del chat hace specs/diseño, Claude Code hace código

### 8. Frase de arranque obligatoria de Bryam
Cuando Bryam abre un chat nuevo conmigo, debe arrancar con esta frase (o similar):

> "Soy Bryam de AriadGSM. Te paso HANDOFF.md y archivos de specs. Trabajamos con proceso Plan → Design → Implement → Test → Review. **Si me proponés saltar alguna etapa, frename.**"

La última oración es lo que me da permiso explícito a frenarte si me apuro. Sin esa frase, la regla se debilita.

---

## Decisiones de producto firmes (no se reabren)

### Pricing
- Lock por orden completa por 15 min desde aprobación del comprobante
- Validación 5 niveles: `<15%` silencio, `15-30%` confirm, `30-50%` motivo+notif, `>50%` admin Bryam, `<1` o `>100 USDT` rechazo absoluto
- Durante 15 min: Bryam absorbe subidas. Después: si bajó/igual silencioso, si subió banner amarillo con 3 opciones (subir 2do comprobante / esperar 1h / cancelar)

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
- **Switch técnico con job en curso:** el job se queda con quien lo tomó. Angelo lo ve en lectura si no es el activo.
- **Tomar específico:** botón "Tomar" en cada card de la cola. Endpoint nuevo `POST /api/frp/jobs/:id/take`.
- **Pago revertido con job en curso:** cancelación de raíz. El bypass dura 5-10s, no hay riesgo físico.
- **Timeout 30 min:** banner amarillo en card actual con [Sigo trabajando] / [Cancelar job]. No hay autocancelación.
- **Finalizados hoy:** muestra de ambos técnicos con identificador visual (J/A).
- **Reportar problema:** texto libre + opciones predefinidas. Modal en spec separada.
- **Filtro VIP en cola:** toggle simple, client-side, persiste en sessionStorage.
- **Beep al entrar nuevo job:** ELIMINADO (decisión sesión 6, confirmada sesión 7).
- **finalize sin log obligatorio:** auto-log "Finalizado por <user> a las <HH:MM>" se genera automáticamente. Adjuntar evidencia opcional vía sub-acción "Adjuntar evidencia" después.
- **"Crear orden manual" en panel FRP Express:** ELIMINADO (sesión 7, no se usa).
- **Costos FRP en panel FRP Express:** colapsado bajo acordeón por default. Rediseño visual con estilo mockup pendiente (spec separada futura).

### Mockups cliente (sesiones 1-5)
- **Paso 1:** layout 3+2 de pills (CO/MX/CL arriba, PE/USDT abajo). Card oscura "ESTIMADO · EN VIVO" con dot pulsante.
- **Paso 2:** stepper -/n/+ con label "Equipos a desbloquear". Total en card oscura con breakdown integrado. Insignia verde "98% modelos soportados". Validación modelo opcional (no gate).
- **Paso 3:** card "TOTAL A PAGAR" oscura. Header método con icono. Cards de cuentas con botón Copiar. Lock 15 min azul. Banner amarillo "Revisá pasos 1 y 2". Dropzone dasheada.
- **Paso 4:** SIN banner "pago aprobado". Mini-Redirector NO inline, va en bottom sheet por botón "¿Dónde pego estos datos?". Datos con badges 1° azul / 2° verde matcheando los campos del Redirector.

### Operador FRP Express (sesión 6)
- Vista única vertical priorizada por urgencia
- Header con técnico activo (Jack o Angelo)
- "Tu trabajo actual" arriba como hero
- Cola con cards horizontales + tiempo de conexión + botón Tomar + filtro VIP
- "Pagos por revisar" + "Atención" en grid 2 columnas
- "Finalizados hoy" como tabla compacta sin acciones, mostrando ambos técnicos
- Sin "Copiar Done"
- Un técnico procesa un job por vez

### Formatos
- Technician ID: `1000 9983 5478` (espaciado cada 4 dígitos)
- Código del proceso: `CL-{code}-{quantity}` (ej. `CL-20260502-007-2`)
- Order code interno: `ARD-YYYYMMDD-NNN`
- Order code cliente: `CL-YYYYMMDD-NNN`
- Campo en código: `technicianId` (no `takenBy`)

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
- **`PLAN.md`** — plan estratégico de 7 specs en 3 fases (después del audit). Versión actual: v1.1.
- **`HANDOFF.md`** — este archivo. Bridge entre sesiones. Versión actual: v1.2.
- **`audit-template.md`** — template para auditar el repo con Claude Code.
- **`_template-prompt-claude-code.md`** — templates obligatorios para prompts a Claude Code (análisis e implementación).

### `docs/specs/cliente/`
- **`paso-1-precio.md`** — spec completo del paso 1 (8 piezas). 26 acceptance criteria, 8 open questions sin responder aún.
- **`mockups/paso-1-precio.html`** — mockup HTML standalone responsive del paso 1.

### `docs/specs/operador/`
- **`operador-frp-express.md`** — spec completo del panel FRP Express v1.1. 38 acceptance criteria, 0 open questions.
- **`mockups/operador-frp-express.html`** — mockup HTML standalone v1.1 con filtro VIP.

### `docs/`
- **`ariadgsm-decisiones-FINAL-2026-05-02.md`** — doc histórico de decisiones de producto (16 secciones). Source of truth ANTES de las specs nuevas. Las specs nuevas tienen precedencia en caso de conflicto.

---

## Endpoints implementados en sesión 7

- `POST /api/frp/jobs/:id/take` — toma un job específico. Devuelve 409 si ya fue tomado por otro.
- `PATCH /api/frp/jobs/:id/cancel` — body `{ reason: 'timeout' | 'payment_reverted' | 'manual', note?: string }`
- `finalize` modificado: ya no requiere log/imagen, auto-genera log Lima.
- `publicFrpState` extendido con `finishedTodayJobs[]`.

### Endpoints pendientes (commit 7 — SSE operador)

- `GET /api/operator/frp/events` (SSE stream)
- Helper `publishOperatorFrp()` llamado desde mutaciones existentes

---

## Pendientes y próximos pasos

### Inmediato — sesión 7

1. **Commit 5b — Cleanup post-rediseño:** análisis previo en curso. Pendiente reporte de Claude Code sobre dependencias antes de eliminar panel viejo + "Crear orden manual" + colapsar Costos FRP.
2. **Commit 6 — Banner timeout 30 min**
3. **Commit 7 — SSE operador real-time**

### Próximas specs (orden sugerido del Plan v1.1)

1. **Rediseño visual de Costos FRP** — separado del panel FRP Express, con estilo mockup. Sesión nueva.
2. **Tools/billeteras** — modelo nuevo, pendiente respuestas de:
   - ¿Tools = providers FRP existentes o capa nueva?
   - ¿Extender modelo o crear nuevo?
   - Descuento auto o manual al finalizar
   - Bloquear take si balance 0
3. **VIP/postpago UI cliente** — backend ya está
4. **Notificaciones in-portal (PR-2c)** — toast wrapper
5. **Anti-fraude 4 capas (PR-2b)**
6. **Modal de "Reportar problema"** — referenciado por la spec del operador FRP Express
7. **Bundle 3 cleanup + 16 bugs cliente + Perú dup**
8. **Multi-orden enforcement backend**
9. **Modularización server.js + app.js** (deuda técnica, opcional)

### Decisiones macro pendientes (del PLAN.md)

- Cadencia de sesiones por semana
- API de FX cuál (sugerencia: CoinGecko)
- Polling FX cada cuánto (sugerencia: 30s)
- Cost unitario fijo o por país
- Persistencia entre sesiones de cliente
- Tooltip USDT (red TRC20)

---

## Bitácora de errores de proceso

Esta sección documenta cuando una sesión salteó pasos del proceso. Sirve para que un Claude futuro vea ejemplos reales y no los repita.

### Sesión 5 — Inicial: "no nos trabamos con specs todavía, sigamos con mockups"
- **Qué pasó:** El Claude del chat sugirió seguir con mockups uno por uno (paso 1, 2, 3, 4) en vez de planificar el método completo de specs.
- **Por qué falló:** Los mockups solos cubren "happy path", no estados, edge cases, responsive, behavior, etc. Eso generó los 16 bugs en cola.
- **Cómo se corrigió:** Bryam aportó referencias de Miro 2026 sobre las 8 piezas. Cambio de método. Plan estratégico v1.0.
- **Lección:** No minimizar advertencias del cliente cuando aporta fuentes externas. Si pide cambio de método, considerar seriamente.

### Sesión 5 — Después: "te entrego el paso 1 y vamos haciendo el resto"
- **Qué pasó:** El Claude del chat propuso entregar specs una por una sin plan estratégico previo.
- **Por qué falló:** Sin plan total, Bryam no podía ver el camino completo y se sentía perdido. Trabajo nocturno hasta 4am sin progreso visible.
- **Cómo se corrigió:** Bryam pidió "plan estratégico antes de empezar a enviarme cosa por cosa". Se generó PLAN.md v1.0.
- **Lección:** Plan estratégico antes de ejecución específica, siempre. La gente necesita ver el camino, no solo el siguiente paso.

### Sesión 7 — "Es solo limpieza, eliminá X"
- **Qué pasó:** El Claude del chat propuso prompt para Claude Code que decía "eliminá panel viejo + eliminá Crear orden manual + colapsá Costos FRP" sin pedir análisis previo de dependencias.
- **Por qué falló:** Saltó la etapa **Design** del proceso. Toda eliminación tiene riesgo de dependencias ocultas que no se conocen sin leer el código.
- **Cómo se corrigió:** Bryam preguntó "¿no debería leer el código primero?" El Claude reconoció el error y cambió el prompt a uno de análisis previo.
- **Lección:** "Limpieza" no es excepción al proceso. Toda acción pasa por Plan → Design antes de Implement. Eliminaciones especialmente.

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

### Frase de arranque que Bryam debe usar

> "Soy Bryam de AriadGSM. Te paso HANDOFF.md y archivos de specs. Trabajamos con proceso Plan → Design → Implement → Test → Review. **Si me proponés saltar alguna etapa, frename.**"

Si no usa esa frase, recordásela vos antes de avanzar.

---

## Sesiones previas (resumen mínimo)

- **Sesión 1-4:** mockups visuales de los 4 pasos cliente. Iteramos hasta cerrar diseño visual. Mockups validados pero no persistidos como archivo en sesiones 1-3.
- **Sesión 5:** definimos el método (8 piezas por spec). Spec completa de paso 1 cliente como piloto. Plan estratégico v1.1. Audit del repo (revelado que 80% ya está implementado, plan rebajado de 15 a 7 specs). Spec inicial del operador FRP Express v1.0.
- **Sesión 6:** Bryam respondió las 8 Open Questions del operador FRP Express. Spec actualizada a v1.1 (38 AC, 0 OQ). Mockup actualizado con filtro VIP y columna de técnico. Decisión de bypass 5-10s justifica "cancelar de raíz" y "timeout 30 min con banner".
- **Sesión 7 (esta):** Claude Code implementó commits 1-5 (4 backend + rediseño visual). Commit 5 dejó panel viejo y nuevo conviviendo. Bryam detectó duplicación + propuso eliminaciones. Claude del chat propuso eliminación directa, Bryam frenó pidiendo análisis previo. Refactorizamos prompt a discovery-first. HANDOFF actualizado a v1.2 con checklist explícito, trampas comunes, bitácora de errores de proceso. Template de prompts creado.

---

**Si tenés dudas que no podés resolver con este archivo + las specs, preguntale a Bryam directo. No improvises.**
