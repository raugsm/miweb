# HANDOFF — AriadGSM Portal Specs

**Para Claudes futuros que retomen este trabajo.** Si abrís un chat nuevo, leé este archivo primero, después abrí los otros archivos en `docs/specs/`. Después de eso, ya sabés todo lo necesario para continuar.

**Última actualización:** 2 de mayo 2026 · sesión 6

---

## Qué es AriadGSM

Servicio remoto de FRP/Cuenta Google para Xiaomi en Latam. Procesa ~130 órdenes/día. El cliente final son técnicos de tienda (B2B) que pagan en USDT, transferencia local (PE/MX/CO/CL) o Yape Perú.

**Owner:** Bryam (no es programador, aprende haciendo, prefiere mockups visuales sobre texto largo).
**Operadores internos:** Jack (principal) + Angelo (apoyo). Trabajan en turnos distintos, no simultáneos.

**Producto:** monorepo Node.js que sirve dos frontends según host:
- `ariadgsm.com` → portal cliente (4 pasos para que el técnico mande su pedido)
- `ops.ariadgsm.com` → panel operador (donde Jack/Angelo procesan los pedidos)

**Característica clave del bypass:** dura 5-10 segundos físicos. La interfaz del operador acompaña el antes y después del bypass, no el durante. Esto significa que decisiones como "cancelar de raíz" son seguras — no hay equipos físicamente conectados durante minutos.

---

## Estado actual del proyecto

### Lo que YA está implementado (no tocar sin razón fuerte)

- Cliente: 4 pasos completos (precio → solicitud → pago → conexión)
- Mis Órdenes con activity log y PDF con QR + SHA-256
- Panel operador con 8 tabs (Inicio, Tickets, FRP Express, Clientes, Precios, Cierre diario, Usuarios, Auditoría)
- Login con roles (ADMIN, COORDINADOR, ATENCION_TECNICA), 2FA, password reset
- Switch técnico activo (Jack ↔ Angelo) con ventana 10s
- Pricing engine completo (validación 5 niveles, lock 15 min, providers)
- State machine (4 enums: customerOrder.publicStatus, frpOrder.orderStatus, frpOrder.paymentStatus, frpJob.status)
- SSE en vivo en `/api/portal/orders/events`
- Multi-orden con priorización por accionabilidad
- Cierre diario con export Excel
- Auditoría completa
- Master clients + dedup cross-canal

### Lo que está parcial (backend OK, falta UI o flow)

- VIP/postpago: backend completo (`vipUnitMargin`, `usableNow`, `urgentRequested`), no hay UI cliente
- Notificaciones in-portal: planeado como PR-2c, no empezado
- Anti-fraude 4 capas: planeado como PR-2b, no empezado
- Multi-orden enforcement: UI prioriza pero backend no enforce restricción específica

### Lo que NO existe

- Tests E2E completos
- TypeScript (todo es JS puro)
- i18n (todo en español hardcoded)
- Storage externo (comprobantes en JSON DB como base64)
- Framework web (es `node:http` raw)

### Bugs conocidos en cola

- **5 commits con 16 bugs visuales** ya están en Claude Code. Resuelven layout paso 1, 2, 4 + bug 16 (`deriveFlowState` que prioriza orden incorrecta cuando hay múltiples activas). Ver detalle en `docs/ariadgsm-decisiones-FINAL-2026-05-02.md`.
- **2 pills "Perú" duplicadas** (PE_YAPE_BRYAMS + PE_YAPE_PEREGRINA) — no estaba en los 16, descubierto en audit.
- **`compatibilityReviewRequired` dead code** después del fix bug 11.
- **`ARIAD_ENABLE_SETUP_RESET=true` en producción** abre vector de attack.

---

## Cómo trabajamos (reglas no negociables)

### 1. Reference-driven design
Los mockups visuales son la fuente de verdad, no las interpretaciones textuales. Cada decisión va en archivo persistente (Markdown o HTML), nunca solo en el chat. Si está solo en chat, **no existe**.

### 2. Specs antes de código
Cada spec tiene 8 piezas: mockup, estados, edge cases, responsive, comportamiento, datos, acceptance criteria, open questions. Si una pieza no existe, Claude Code la improvisa y probablemente mal. Esto generó los 16 bugs actuales.

### 3. Proceso iterativo correcto
```
Plan → Design → Implement → Test → Review
```
No improvisar entre etapas. No saltarse etapas.

### 4. Por sesión, una spec
Una sesión = un archivo entregado. No mezclar specs en una sola sesión.

### 5. Persistencia obligatoria
Cada sesión termina con archivos en `/mnt/user-data/outputs/` que Bryam sube al repo. Si no hay archivo persistido, la sesión no sirvió.

### 6. Cómo subir archivos al repo
Bryam descarga los archivos a `C:\Users\Bryams\Desktop\AriadGsm\files1\`. Cada sesión debe terminar con un prompt para Claude Code que mueva los archivos al repo, los renombre si hace falta (ej. quitar "-mockup" de los HTMLs), haga commit local (sin push), y reporte si hubo problemas.

### 7. Tono con Bryam
- No es programador, aprende haciendo
- Prefiere respuestas cortas y mockups visuales
- Pide fuentes externas cuando duda — eso es chequeo, no desconfianza
- Usa instancia paralela de Claude Code para implementación
- El Claude del chat hace specs/diseño, Claude Code hace código

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

### Operador (decisiones del FRP Express, sesión 6)
- **Switch técnico con job en curso:** el job se queda con quien lo tomó. Angelo lo ve en lectura si no es el activo.
- **Tomar específico:** botón "Tomar" en cada card de la cola (no solo "Tomar siguiente"). Requiere endpoint nuevo `POST /api/frp/jobs/:id/take`.
- **Pago revertido con job en curso:** cancelación de raíz. El bypass dura 5-10s, no hay riesgo físico.
- **Timeout 30 min:** banner amarillo en card actual con [Sigo trabajando] / [Cancelar job]. No hay autocancelación.
- **Finalizados hoy:** muestra de ambos técnicos con identificador visual (J/A).
- **Reportar problema:** texto libre + opciones predefinidas. Modal en spec separada.
- **Filtro VIP en cola:** toggle simple, client-side, persiste en sessionStorage.
- **Beep al entrar nuevo job:** solo si técnico no tiene job tomado y tab está visible. Toggle ON por default.

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
- Sin "Copiar Done" (eliminado por innecesario)
- Un técnico procesa un job por vez

### Formatos
- Technician ID: `1000 9983 5478` (espaciado cada 4 dígitos)
- Código del proceso: `CL-YYYYMMDD-XXX-N` (ej. `CL-20260502-XPK-1`)
- Order code interno: `ARD-YYYYMMDD-NNN`
- Order code cliente: `CL-YYYYMMDD-NNN`

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
- **`HANDOFF.md`** — este archivo. Bridge entre sesiones.
- **`audit-template.md`** — template para auditar el repo con Claude Code.

### `docs/specs/cliente/`
- **`paso-1-precio.md`** — spec completo del paso 1 (8 piezas). 26 acceptance criteria, 8 open questions sin responder aún.
- **`mockups/paso-1-precio.html`** — mockup HTML standalone responsive del paso 1.

### `docs/specs/operador/`
- **`operador-frp-express.md`** — spec completo del panel FRP Express v1.1 (8 piezas). 38 acceptance criteria, 0 open questions (todas resueltas en v1.1).
- **`mockups/operador-frp-express.html`** — mockup HTML standalone v1.1 con filtro VIP.

### `docs/`
- **`ariadgsm-decisiones-FINAL-2026-05-02.md`** — doc histórico de decisiones de producto (16 secciones). Source of truth ANTES de las specs nuevas. Las specs nuevas tienen precedencia sobre este doc en caso de conflicto.

---

## Endpoints nuevos pendientes de agregar al backend

De la spec del operador FRP Express v1.1:

- **`POST /api/frp/jobs/:id/take`** — toma un job específico (no solo el siguiente). Devuelve 409 si ya fue tomado por otro.
- **`PATCH /api/frp/jobs/:id/cancel`** — verificar si existe; si no, agregar. Body: `{ reason: 'timeout' | 'payment_reverted' | 'manual', note?: string }`.

---

## Pendientes y próximos pasos

### Próximas specs a escribir (orden sugerido del Plan v1.1)

1. **Tools/billeteras** — Bryam aclaró que el flujo de pricing NO se toca, solo se construye admin de billeteras. Pendiente respuestas de:
   - ¿Tools = providers FRP existentes o capa nueva?
   - ¿Extender modelo o crear nuevo?
   - Descuento auto o manual al finalizar
   - Bloquear take si balance 0
2. **VIP/postpago UI cliente** — backend ya está
3. **Notificaciones in-portal (PR-2c)** — toast wrapper
4. **Anti-fraude 4 capas (PR-2b)**
5. **Bundle 3 cleanup + 16 bugs + Perú dup**
6. **Multi-orden enforcement backend**
7. **Modal de "Reportar problema"** (referenciado por la spec del operador FRP Express)
8. **Modularización server.js + app.js** (deuda técnica, opcional)

### Decisiones macro pendientes (del PLAN.md)

- Cadencia de sesiones por semana
- API de FX cuál (sugerencia: CoinGecko)
- Polling FX cada cuánto (sugerencia: 30s)
- Cost unitario fijo o por país
- Persistencia entre sesiones de cliente
- Tooltip USDT (red TRC20)

### Bugs en vuelo (paralelo a specs)

Los 5 commits con 16 bugs siguen en Claude Code. No bloquean specs. Se validan al cierre de cada spec contra los acceptance criteria.

---

## Cómo arrancar próxima sesión

Si sos un Claude que abre un chat nuevo:

1. Leé este `HANDOFF.md` completo.
2. Bryam te va a decir en qué spec quiere trabajar. Buscá el archivo `.md` correspondiente en `docs/specs/`.
3. Si la spec ya existe, preguntá qué quiere ajustar.
4. Si la spec no existe, seguí el formato de las que ya están escritas (`paso-1-precio.md` o `operador-frp-express.md` como templates).
5. **Antes de escribir, abrí las "Open questions" de la spec previa y verificá si Bryam ya las respondió.**
6. **Antes de proponer cosas nuevas, revisá la sección "Decisiones de producto firmes" arriba.** Si querés contradecir alguna, decíselo explícitamente y pedí confirmación.
7. Una sesión = un archivo entregado. No empezar dos cosas a la vez.
8. **Cada sesión termina con un prompt para Claude Code** que mueva los archivos generados al repo. Bryam los descarga a `C:\Users\Bryams\Desktop\AriadGsm\files1\`, vos le pasás el prompt para que Claude Code los suba.
9. Al final de la sesión, **actualizá este HANDOFF** si hay decisiones nuevas o si una spec cambió de versión.

### Ejemplo de prompt de arranque que Bryam puede usar

> "Soy Bryam de AriadGSM. Te paso el HANDOFF.md y los archivos de specs anteriores. Hoy queremos trabajar en [X]. Leé todo antes de proponer nada."

---

## Sesiones previas (resumen mínimo)

- **Sesión 1-4:** mockups visuales de los 4 pasos cliente (paso 1, 2, 3, 4 con tutorial Redirector). Iteramos hasta cerrar diseño visual. Mockups validados pero no persistidos como archivo en sesiones 1-3.
- **Sesión 5:** definimos el método (8 piezas por spec). Escribimos spec completa de paso 1 cliente como piloto. Plan estratégico v1.1. Audit del repo con Claude Code (revelado que 80% ya está implementado, plan rebajado de 15 a 7 specs reales). Spec inicial del operador FRP Express v1.0 (con 8 Open Questions).
- **Sesión 6 (esta):** Bryam respondió las 8 Open Questions del operador FRP Express. Spec actualizada a v1.1 (38 acceptance criteria, 0 open questions). Mockup actualizado con filtro VIP y columna de técnico en finalizados. Bryam aclaró que el bypass real dura 5-10 segundos, lo que justifica decisiones de "cancelar de raíz" y "timeout 30 min con banner". HANDOFF a v1.1.

---

**Si tenés dudas que no podés resolver con este archivo + las specs, preguntale a Bryam directo. No improvises.**
