# HANDOFF — AriadGSM Portal Specs

**Para Claudes futuros que retomen este trabajo.** Si abrís un chat nuevo, leé este archivo primero, después abrí los otros archivos en `docs/specs/`. Después de eso, ya sabés todo lo necesario para continuar.

**Última actualización:** 3 de mayo 2026 · v1.7

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
| **"Decisión nueva al final de sesión cansado"** | Bryam abre una decisión grande de producto al final de una sesión larga, en respuesta a algo que vio en smoke test | Registrar como input crudo en HANDOFF, NO como decisión tomada. Spec formal con cabeza fresca, en sesión dedicada. |
| **"Descubrimiento conceptual a mitad de spec → improvisar diseño encima"** | Durante spec del paso 1, aparece info nueva del modelo de negocio que cambia el marco. Si Claude sigue cerrando preguntas que dependen de esa info nueva, está improvisando. | Detectar dependencias entre la pregunta abierta y el descubrimiento nuevo. Pausar las preguntas dependientes, cerrar las independientes, registrar el descubrimiento como input crudo, abrir spec dedicada. |

---

## Contexto del despliegue

**La web es local, sin clientes reales todavía.** Está alojada en un servidor local de Bryam, no en la nube. No hay urgencia de "lanzamiento" presionando ni clientes afectados por bugs en cola. Bryam puede parar la web cuando quiera para hacer cambios o pruebas.

Esto NO cambia el rigor del proceso (Plan → Design → Implement → Test → Review sigue siendo obligatorio). Lo que cambia es:

- No hay urgencia falsa que justifique saltar etapas.
- Bugs descubiertos pueden esperar a sesión dedicada sin riesgo comercial.
- Smoke tests pueden hacerse sin presión de tiempo.

Si un Claude futuro se ve tentado a apurar a Bryam con argumentos de "los clientes esperan" o "esto bloquea el lanzamiento", **frenar**. No aplica.

---

## Validación profunda — cuándo

**Política acordada en sesión 7:** durante implementación de Fase 1 NO hacemos validación profunda case-by-case. Solo smoke test rápido para detectar errores obvios (panel no carga, consola con errores rojos, regresiones visuales evidentes).

**Validación profunda toca recién en QA integral**, cuando:
- Operador FRP Express completo (sesión 7 ✅)
- Bugs cliente activados (sesión 8 ✅ parcial — falta B-008)
- B-008 fix (sesión 9 — escenarios 1, 2, 3 validados; escenario 4 **pausado en sesión 10**, pendiente de resolución del flujo cliente↔panel operador)
- Cualquier cleanup pendiente (Bundle 3)

Razón: probar feature por feature mientras hay bugs cliente conocidos genera ruido. Bugs del operador y del cliente se mezclan. Mejor cerrar bloques completos y QA integral al final.

---

## Qué es AriadGSM

Servicio remoto de FRP/Cuenta Google para Xiaomi en Latam. Procesa ~130 órdenes/día (proyección — hoy la web es local sin clientes reales). El cliente final son técnicos de tienda (B2B) que pagan en USDT (vía Binance Pay), transferencia local (PE/MX/CO/CL) o Yape Perú.

**Owner:** Bryam (no es programador, aprende haciendo, prefiere mockups visuales sobre texto largo).
**Operadores internos:** Jack (principal) + Angelo (apoyo). Trabajan en turnos distintos, no simultáneos.

**Producto:** monorepo Node.js que sirve dos frontends según host:
- `ariadgsm.com` → portal cliente (4 pasos para que el técnico mande su pedido)
- `ops.ariadgsm.com` → panel operador (donde Jack/Angelo procesan los pedidos)

En entorno local: `localhost:4173/cliente` (cliente) y `localhost:4173/` (operador). Login operador: `admin@local.test`. Cliente de prueba: `raugsm.69@gmail.com`. Comando arranque: `npm start`.

**Característica clave del bypass:** dura 5-10 segundos físicos. La interfaz del operador acompaña el antes y después del bypass, no el durante. Decisiones como "cancelar de raíz" son seguras.

---

## Modelo de uso del cliente — descubrimiento de sesión 10

**IMPORTANTE — info nueva no documentada en specs anteriores.** Durante la sesión 10, mientras se cerraban open questions del paso 1, Bryam reveló que el modelo de uso real del cliente es distinto al que asumía la spec actual. Esta sección registra el descubrimiento. **NO es decisión todavía** — requiere sesión dedicada para procesarlo (ver "Inputs crudos para spec futura").

**Lo que se sabe hoy:**

- El cliente NO hace un flujo lineal de 4 pasos para una sola orden y después se va. Hace **múltiples órdenes en paralelo**, una por cada equipo a desbloquear.
- Patrón típico: cliente paga por equipo A → sin esperar que termine el A, paga por equipo B → mientras A está en paso 3 y B en paso 1, paga por C → etc.
- La mayoría de los clientes hace 1-5 órdenes en una sesión, pero hay casos de 10 en un solo "tirón".
- Política firme: **pago anticipado** (cliente regular paga antes de procesar). Excepción: clientes VIP procesan primero, pagan después.
- El paso 3 (subir comprobante) es donde la orden aparece en el panel del operador.
- Bryam quiere que el flujo "se libere" para empezar otra orden recién después que el cliente apriete "conectado" en el paso 4 — no antes.

**Implicancia:** la pantalla principal cliente NO es solo "el paso 1 arriba + Mis órdenes abajo". Es un espacio donde conviven:
1. Iniciar nueva orden (lo que hoy es paso 1)
2. Ver/seguir órdenes activas en distintos pasos
3. Atender una orden específica (subir comprobante, marcar como conectada, etc.)

Esto choca con varias decisiones firmes (timer paso 4 de 2 min, regla multi-orden, lock pricing 15 min) y se cruza con el hallazgo abierto de sesión 9 (flujo de comprobantes y panel operador). Requiere spec formal dedicada en sesión 11.

---

## Plan de lanzamiento (decisión sesión 7, ratificado sesión 8, ajustado sesión 10)

Bryam eligió **Opción B**: lanzar con visual nuevo del cliente, no solo bugs arreglados. Estimación realista actualizada:

```
SESIÓN 7 (cerrada)
└── Operador FRP Express completo + cierre con archivos firmes ✅

SESIÓN 8 (cerrada)
└── B-001 fix paso 4 cliente (1 commit) + descubrimiento de B-008 ✅

SESIÓN 9 (cerrada parcialmente)
└── B-008 fix (crítico) ✅ + escenarios 1-3 smoke test ✅ + escenario 4 pendiente

SESIÓN 10 (cerrada parcialmente)
└── Escenario 4 B-008 PAUSADO (bloqueo técnico) + Spec paso 1 cliente 7/8 cerradas + descubrimiento modelo paralelo ✅

SESIÓN 11 (próxima)
└── Procesar modelo de órdenes paralelas en frío + spec "página principal cliente" o equivalente + cierre #5 paso 1

SESIÓN 12
└── Implementación paso 1 cliente (después que sesión 11 defina el marco)

SESIÓN 13
└── Spec + implementación paso 2 cliente

SESIÓN 14
└── Spec + implementación paso 3 cliente (incluye corrección USDT/Binance Pay vs TRC20)

SESIÓN 15
└── Spec + implementación paso 4 cliente (incluye decisiones del modelo paralelo si aplica, ver "Inputs crudos")

SESIÓN 16
└── QA final cliente rediseñado (incluye reintento escenario 4 B-008)

→ LANZAMIENTO (cadencia depende de Bryam — no hay urgencia comercial al ser local)
```

**Cadencia:** Bryam construye solo y atiende clientes en paralelo por WhatsApp. La cadencia de sesiones la define Bryam. No hay deadline real. Si una sesión por semana es mucho, se distribuyen con margen. En sesión 9 Bryam reconoció cansancio acumulado, lo que activó la trampa "Decisión nueva al final de sesión cansado". En sesión 10 se aplicó preventivamente la regla cuando apareció el descubrimiento del modelo paralelo. Claudes futuros: si notan a Bryam fatigado, sugieran cortar y retomar con cabeza fresca antes que insistir en cerrar.

**Si en sesión 11 surge urgencia de lanzar antes** con cliente "feo pero funcional", se puede cambiar a Opción A (lanzar con cliente actual + bugs arreglados, postergar rediseño visual). La decisión no es irreversible.

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
- **Sesión 8:** Paso 4 cliente muestra código real de orden activa (no más placeholder permanente)
- **Sesión 9:** Items vacíos retornan APTO_EXPRESS, desbloqueando creación de órdenes con comprobante (B-008)

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

### Implementado en sesión 9 — Fix B-008 items vacíos

**1 commit, branch `feat-b008-fix` (creada desde `feat-step4-redesign`):**

- `21e1790` — `fix(eligibility): items vacios retornan APTO_EXPRESS (B-008)`. Guarda al inicio de `frpEligibilityResult` que devuelve `APTO_EXPRESS` cuando `originalText` es string vacío. Soluciona la causa raíz del bug crítico que bloqueaba la creación de órdenes nuevas con comprobante. Cubre análisis previo empírico de los 3 fixes posibles (a, b, c). Diff: 3 archivos, +14 / -2 LOC.

**Smoke test B-008 (validación post-fix):**

- ✅ Escenario 1 — cliente sin modelo + comprobante → orden creada en PAGO_EN_REVISION sin error 409.
- ✅ Escenario 2 — operador valida pago → cliente ve EN_PREPARACION con código real `CL-20260503-001-1`. Cierra B-001.
- ✅ Escenario 3 — cliente con modelo válido ("Redmi Note 13") + comprobante → flujo normal sin diferencias. Control de no-regresión OK.
- ⏸️ Escenario 4 — cliente con modelo ambiguo ("xy") + comprobante → debería bloquear con REVISION_COMPATIBILIDAD. **PAUSADO en sesión 10.** Ver "Estado de B-008 en sesión 10" abajo.

### Estado de B-008 en sesión 10 — escenario 4 pausado

**Qué pasó:** la sesión 10 arrancó con plan de cerrar el escenario 4 en 5 min. Al revisar el setup, se descubrió que la orden de prueba del escenario 1 quedó en `LISTO_PARA_CONEXION` y bloquea la creación de nuevas órdenes del mismo cliente. Para destrabar había dos opciones desde el panel operador (cancelar o finalizar la orden vieja). **Ninguna funcionó porque la orden NO aparece en el panel del operador** — confirmando empíricamente el hallazgo abierto de sesión 9 sobre conexión cliente↔panel operador.

**Decisión sesión 10:**

- **Escenario 4 pausado** hasta que se implemente el flujo de comprobantes y estados en panel operador (hallazgo abierto sesión 9).
- **Rama `feat-b008-fix` NO se mergea a main todavía.** Queda en pausa hasta poder ejecutar el escenario 4 limpio. El fix sigue siendo válido (tests 11/11 pass), solo falta el control de no-regresión.
- En sesión 16 (QA final), reintentar escenario 4 antes de lanzamiento.

**Importante:** esto NO es regresión del fix B-008. El fix sigue funcionando. Lo que falta es el control de no-regresión para casos ambiguos. La orden zombi se puede limpiar manualmente desde la base de datos JSON si fuera urgente, pero no se hizo en sesión 10 porque agregaba scope técnico no planificado.

### Implementado en sesión 10

**Nada nuevo en código.** Sesión exclusivamente de spec/diseño:
- Cierre de 7 de 8 open questions del paso 1 cliente
- Spec `paso-1-precio.md` actualizada a v1.1
- Descubrimientos registrados como inputs crudos
- Hallazgos abiertos nuevos identificados

### Lo que NO existe

- Tests E2E completos
- TypeScript (todo es JS puro)
- i18n (todo en español hardcoded)
- Storage externo (comprobantes en JSON DB como base64)
- Framework web (es `node:http` raw)

### Bugs conocidos en cola

- **B-001 (paso 4 código real)** — ✅ ARREGLADO sesión 8 (commit 964413b), validado sesión 9 escenario 2.
- **B-002 (pills "Perú" duplicadas en paso 1)** — UX, requiere decisión de producto. Bundle 3.
- **B-003** `wirePaso4BannerActions` import muerto en `auth-forms.js:15` — Bundle 3
- **B-004** `operationCode` sin callers en `connection.js:3-7` — Bundle 3
- **B-005** `customerName` ignorado en `stepGuideMarkup` (`auth-forms.js:25` lo envía pero `connection.js:81` no lo recibe) — Bundle 3
- **B-006** `liveRing` animación 1.8s vs spec 1.4s en `05-frp-flow.css:321` — Bundle 3
- **H-008** copy "pasos 1, 2 y 3" en paso 3 (debería decir "1 y 2") en `portal.html:210` — Bundle 3
- **B-008 (comprobante bloqueado)** — ✅ ARREGLADO sesión 9 (commit 21e1790). ⏸️ Escenario 4 pausado sesión 10 (control de no-regresión, requiere flujo cliente↔panel resuelto).

**Otros pendientes Bundle 3:**

- **2 pills "Perú" duplicadas** (PE_YAPE_BRYAMS + PE_YAPE_PEREGRINA) — Bundle 3
- **`compatibilityReviewRequired` semi-dead code** después del fix B-008 — Bundle 3
- **`postpayEligible` indefinido** en `server/portal/portal-routes.js:679` — Bundle 3 o sesión postpago UI
- **`ARIAD_ENABLE_SETUP_RESET=true` en producción** abre vector de attack — Bundle 3
- **CSP error con Google Fonts** en consola del operador — Bundle 3
- **CSS huérfano (~200 líneas)** en `public/styles.css` — Bundle 3
- **10 funciones potencialmente muertas** en `public/app.js` — Bundle 3

### Deuda residual de sesiones anteriores

- **DOM diffing para flicker:** múltiples timers convergen a `renderFrp({ skipPricing: true })`. Si se nota flicker molesto en uso real, implementar diffing en commit separado.
- **Disparador de `payment_reverted`:** mecanismo SSE listo (campo `notice` en payload), pero el endpoint admin que revierte pagos no existe todavía.
- **Sub-acción "Adjuntar evidencia" post-finalización:** mencionada en spec v1.2. Spec separada cuando sea necesario.
- **`:focus-visible` en summary del acordeón Costos FRP:** Claude Code lo agregó en commit 6b sin estar en scope original.

---

## Hallazgos abiertos pendientes de spec/investigación

### Hallazgo sesión 9 — flujo de comprobantes y estados en panel operador

Durante el smoke test post-fix B-008, Bryam observó que cuando el cliente sube comprobante en paso 3, la orden asociada no aparece en el panel del operador FRP Express hasta que el operador valida el pago. Bryam describió cómo debería funcionar el flujo correcto:

**Línea de tiempo del flujo propuesto:**

1. **Cliente sube comprobante (paso 3)** → la orden aparece en el panel del operador con etiqueta "sin verificar", junto al comprobante.
2. **Operador valida pago** → la etiqueta cambia a "verificado". La orden queda en el panel del operador pero NO disponible para el técnico todavía.
3. **Cliente vuelve al paso 4 y aprieta el botón** → dispara dos cosas simultáneas: (a) seguimiento en vivo del lado del cliente, (b) la orden cambia a etiqueta "listo para procesar" en el panel del operador.
4. **Técnico toma el job de la cola "listo para procesar"** cuando está disponible y ejecuta el bypass.

**Confirmación empírica sesión 10:** durante el intento de cerrar escenario 4 de B-008, se confirmó que **la orden no aparece en ninguna pestaña del panel operador** (Bryam revisó las 8 tabs). Esto bloquea el escenario 4 y motivó pausar B-008 hasta resolver este flujo.

**Open questions para la spec formal (no se resuelven hoy):**

- ¿Qué pasa si el cliente nunca aprieta el botón del paso 4? ¿La orden queda eternamente en "verificado"? Bryam confirma que existen casos reales de clientes que pagan y procesan al día siguiente.
- ¿Las etiquetas "sin verificar" / "verificado" / "listo para procesar" reemplazan al estado actual `LISTO_PARA_CONEXION`, o conviven con él?
- ¿El cambio afecta también el panel del cliente "Mis órdenes" o solo el lado operador?
- ¿Cómo se mapea esto al `paymentStatus` existente?

**Pendiente para sesión futura (sesión 11 o posterior):**

1. Verificación empírica con Claude Code: confirmar cómo maneja hoy el panel del operador los pagos pendientes.
2. Decidir si es bug a arreglar o feature nueva. Spec formal con las 8 piezas antes de tocar código.
3. Decidir prioridad: probablemente sesión 11 lo necesita resolver junto con el modelo de órdenes paralelas.

### Hallazgo sesión 10 — validación de precio que falló

Durante la conversación de sesión 10, Bryam mencionó que la validación de precio (la que rechaza precios fuera del rango 0.5 a 100 USDT) tuvo un fallo en algún momento. **No se entró en detalles** para no salir de scope.

**Pendiente:** investigar empíricamente cuándo falla, en qué archivo vive la validación, qué mensaje muestra al cliente. Sin detalles concretos hoy. Bryam recordará al retomar.

### Hallazgo sesión 10 — USDT real es Binance Pay, no transferencia TRC20 directa

La spec v1.0 del paso 1 decía "USDT en red TRC20", pero los métodos reales de cobro son **Binance Pay**, NO transferencia TRC20 directa. Son cosas distintas:

- **Binance Pay:** transferencia interna entre cuentas de Binance, sin red blockchain de por medio. Solo necesita identificador de Binance.
- **TRC20 / BEP20:** transferencia real por blockchain, necesita dirección de wallet.

**Esto NO afecta el paso 1** (la pill solo dice "USDT" + logo Tether, sin mención de red). **Sí afecta la spec del paso 3** (donde se muestran datos para pagar). Cuando se haga la spec del paso 3 (sesión 14), corregir esto.

Bryam mencionó interés futuro en agregar QR de pagos (Yape ya tiene QR, Binance Pay también). Eso vive en la futura sub-sección "Medios de pago" del Centro de configuración.

### Hallazgo sesión 10 — mockup paso 1 necesita actualización antes de implementación

El mockup actual `paso-1-precio.html` cubre el estado "todo bien" pero no incluye los 2 estados nuevos decididos en sesión 10:

1. Pill desactivada con mensaje custom configurable (decisión #8).
2. Banner amarillo "El tipo de cambio cambió, monto actualizado" disparado por cambio manual del admin (decisión #2).

**Pendiente:** sesión chica de polish visual para agregar estos estados al mockup antes de implementación del paso 1 (sesión 12).

---

## Inputs crudos para spec futura

**Esta sección registra ideas y propuestas que Bryam compartió en chat pero NO son decisiones tomadas.** Quedan registradas para ser convertidas en spec formal en una sesión dedicada con cabeza fresca, mockups, fuentes externas e investigación. **NO implementar basándose en esta sección.** Si un Claude futuro va a trabajar en cualquiera de estos temas, primero debe abrir sesión dedicada para escribir spec con las 8 piezas.

### Modelo de órdenes paralelas y "liberación" del flujo (sesión 10)

*Descubrimiento clave de sesión 10. Cambia el marco de cómo se diseña la página principal cliente y todos los pasos del flujo. Detalle completo en sección "Modelo de uso del cliente" arriba.*

**Propuestas de Bryam para discutir en sesión 11:**

- Después del paso 3 (subir comprobante) debería existir un temporizador para que el cliente en paso 4 marque como conectado.
- El flujo "se libera" (el cliente puede empezar otra orden sin trabas) recién cuando el cliente apreta "conectado" en paso 4.
- La orden aparece en el panel del operador como "listo para procesar" recién en ese momento (cruza con hallazgo sesión 9).
- Esto debería convivir con que el cliente pueda tener múltiples órdenes en distintos pasos al mismo tiempo.

**Conflictos con decisiones firmes actuales:**

- Choca con timer paso 4 de 2 min (firme, ver "Decisiones de producto firmes").
- Choca con regla multi-orden actual ("permitir nuevas EXCEPTO si hay órdenes en `ESPERANDO_PAGO` o `PAGO_RECHAZADO`").
- Se cruza con hallazgo abierto sesión 9 (flujo de comprobantes y panel operador).
- Se cruza con propuestas del Sistema de tiempo y alertas (sesión 9).

**Pendiente para sesión 11:**

1. Procesar este modelo en frío con cabeza fresca.
2. Definir cómo conviven en la pantalla principal cliente: paso 1 (nueva orden) + Mis órdenes (órdenes activas) + flujo paralelo.
3. Posiblemente generar una spec nueva ("página principal cliente" o "Mis órdenes ampliada") que precede a las specs individuales de cada paso.
4. Cerrar pregunta #5 del paso 1 (vista en desktop) que quedó en pausa porque depende de este marco.

### Modo express sin login (sesión 10)

*Bryam aclaró en sesión 10 que NO va a sacar el login del flujo principal. El login sirve para servicios completos. Pero a futuro quiere lanzar una **versión paralela** de la web donde el cliente entra rápido a hacer servicios express sin registrarse.*

**Características de lo que Bryam describió:**

- Versión separada del flujo, sin login.
- Para servicios express (cortos, no requieren historial del cliente).
- Convive con el flujo con login. NO lo reemplaza.
- Como no hay perfil del cliente, ahí sí necesita detección de país por IP (Cloudflare `cf-ipcountry`, que Bryam planea usar cuando la web salga al aire).

**Pendiente para sesión futura dedicada:**

1. Decidir qué servicios cubre el modo express vs el modo con login.
2. Cómo se accede (subdomain distinto, ruta distinta, mismo lugar con un toggle).
3. Diseño del flujo express (¿son los mismos 4 pasos? ¿menos?).
4. Spec formal con las 8 piezas.

**Hoy:** la spec del paso 1 (modo con login) usa el país del perfil del cliente registrado, NO Cloudflare. Cloudflare es para el modo express futuro.

### Sistema de tiempo y alertas en flujo de pago/conexión (sesión 9)

*Registrado al cierre de sesión 9. Bryam estaba cansado al momento del registro y reconoció que necesitaba cabeza fresca. Pendiente revisar TODO esto en frío antes de tomarlo como decisión.*

**Sobre clientes que no aprietan paso 4:**
Bryam confirma que existen casos reales de clientes que pagan y procesan al día siguiente. Hoy lo maneja manualmente por WhatsApp.

**Propuesta de Bryam para reemplazar el lock de 15 min y el timer de 2 min del paso 4:**
Sistema de alertas escaladas que se dispara desde que el cliente sube el comprobante:
- 1.5 min → primera alerta: "los precios pueden variar, el precio brindado es seguro solo por 5 minutos"
- 3 min → alerta naranja: recordatorio
- 5 min → alerta roja: "el precio final puede variar"

**Propuesta de Bryam sobre cambio de precio post-5min:**
Si después de los 5 min el cliente no apretó el botón del paso 4 y el precio cambió:
- En el lado cliente: alerta de que tiene que reintegrar dinero o se le reembolsa.
- En el lado operador: la orden vuelve al estado "revisar pago" avisando que va a aumentar de precio.

**Conflictos con decisiones firmes actuales** (a resolver en spec formal):

- Sección "Pricing": *"Lock por orden completa por 15 min desde aprobación del comprobante"* → contradice regla nueva de 5 min.
- Sección "Timers cliente": *"Paso 4: 2 min sin apretar 'Equipo conectado' → banner '🔧 ¿Listo para conectar?'"* → Bryam plantea reemplazar.
- Se cruza con el modelo de órdenes paralelas (sesión 10).

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
Cuando un commit es grande (>200 LOC, >3 archivos, o múltiples áreas tocadas), partir en sub-commits (7a, 7b, 7c).

### 8. Tono con Bryam
- No es programador, aprende haciendo
- Prefiere respuestas cortas y mockups visuales
- Pide fuentes externas cuando duda — eso es chequeo, no desconfianza
- Usa instancia paralela de Claude Code para implementación
- El Claude del chat hace specs/diseño, Claude Code hace código
- **Sin jerga técnica**. Si Bryam pide hablar "más suave", se cumple. Términos como "regresión", "branch", "diff", "scope", se traducen o se evitan.
- **Si Bryam menciona cansancio, fatiga o "construí esto algo lento"**, eso es señal real. Sugerir cortar la sesión y retomar con cabeza fresca antes que insistir en cerrar decisiones.

### 9. Frase de arranque obligatoria de Bryam
Cuando Bryam abre un chat nuevo conmigo, debe arrancar con esta frase (o similar):

> "Soy Bryam de AriadGSM. Te paso HANDOFF.md y archivos de specs. Trabajamos con proceso Plan → Design → Implement → Test → Review. **Si me proponés saltar alguna etapa, frename.**"

La última oración es lo que me da permiso explícito a frenarte si me apuro. Sin esa frase, la regla se debilita.

### 10. Validación profunda solo en QA integral
Durante implementación de Fase 1, smoke test rápido. Validación profunda recién cuando todos los bloques están cerrados.

### 11. Audit no es verdad final
Un audit de Claude Code es ayuda valiosa pero NO infalible. Smoke test es el último filtro.

### 12. Decisiones grandes en frío, nunca al final de sesión cansado
Si Bryam empieza a abrir decisiones grandes al final de una sesión larga, mientras estaba haciendo smoke test, o después de haber dicho que estaba cansado: **frenar**. Registrar como input crudo en HANDOFF, NO como decisión tomada.

### 13. Descubrimientos conceptuales a mitad de spec — pausar lo dependiente
Si durante la respuesta a una open question Bryam revela info nueva del modelo de negocio que cambia el marco (ej: sesión 10 — "los clientes hacen órdenes en paralelo"), **detectar las preguntas dependientes y pausarlas**. Cerrar las preguntas independientes que no toca el descubrimiento, registrar el descubrimiento como input crudo, y abrir spec dedicada en sesión siguiente. NO improvisar diseño encima del descubrimiento fresco.

---

## Decisiones de producto firmes (no se reabren)

**IMPORTANTE:** algunas de estas decisiones tienen propuestas de cambio en "Inputs crudos para spec futura". Hasta que esas propuestas se conviertan en spec formal aprobada, **las decisiones firmes de abajo siguen vigentes**. NO implementar nada distinto basándose en los inputs crudos.

### Pricing
- Lock por orden completa por 15 min desde aprobación del comprobante *(propuesta de cambio a 5 min en inputs crudos sesión 9 — no aprobada)*
- Validación 5 niveles: `<15%` silencio, `15-30%` confirm, `30-50%` motivo+notif, `>50%` admin Bryam, `<1` o `>100 USDT` rechazo absoluto
- **Costo unitario en USDT:** rango real 3.0–5.5 USDT por equipo (varía con mercado), mismo para los 5 destinos. Configurable por admin desde Centro de configuración (sub-sección "Costo del servicio").

### VIPs
- Atributo: **`vipUnitMargin`** (no `vipUnitPrice`)
- Fórmula: `precio_VIP = costo_proveedor + vipUnitMargin`
- Rango: 0.5 – 1.0 USDT
- Marcar VIP activa postpago automáticamente
- VIP procesa primero, paga después (excepción al pago anticipado).

### Multi-orden
- Permitir nuevas EXCEPTO si hay órdenes en `ESPERANDO_PAGO` o `PAGO_RECHAZADO` *(propuesta de modelo paralelo en inputs crudos sesión 10 — no aprobada)*

### Timers cliente
- Paso 2: 30s banner azul, 90s banner amarillo
- Paso 4: 2 min sin apretar "Equipo conectado" → banner "🔧 ¿Listo para conectar?" *(propuesta de reemplazo en inputs crudos sesión 9 — no aprobada)*

### Mis Órdenes
- Solo aparece después que cliente apreta "Equipo conectado"
- Activity log con eventos del cliente marcados con "(vos)"
- Botón "Comprobante (PDF)" disabled hasta `FINALIZADO`

### Operador FRP Express
- **Switch técnico con job en curso:** el job se queda con quien lo tomó (`technicianId`).
- **Tomar específico:** botón "Tomar" en cada card de la cola. Endpoint `POST /api/frp/jobs/:id/take`.
- **Pago revertido con job en curso:** cancelación de raíz. Bypass dura 5-10s.
- **Timeout 30 min:** banner amarillo en card actual con [Sigo trabajando] / [Cancelar job]. Confirm dialog antes de cancelar.
- **Finalizados hoy:** muestra de ambos técnicos con identificador visual (J/A).
- **Reportar problema:** texto libre + opciones predefinidas. Modal en spec separada.
- **Filtro VIP en cola:** toggle simple, client-side, persiste en sessionStorage.
- **Beep al entrar nuevo job:** ELIMINADO.
- **finalize sin log obligatorio:** auto-log "Finalizado por <user> a las <HH:MM>" Lima.
- **"Crear orden manual" en panel FRP Express:** ELIMINADO.
- **"Actualizar" botón en panel FRP Express:** ELIMINADO.
- **Costos FRP en panel FRP Express:** colapsado bajo acordeón con label uppercase y chevron rotable.
- **2do evento del switch técnico:** NO se emite desde backend. Frontend resuelve con polling acelerado a 2s durante swap.

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
- "Finalizados hoy" como tabla compacta sin acciones
- Acordeón "Costos FRP" colapsado al final
- SSE end-to-end con reconnect banner
- Un técnico procesa un job por vez

### Paso 4 cliente / Edge case EN_PROCESO (sesión 8)
- Durante los 5-10s del bypass, el campo "Código del proceso" muestra el placeholder transitorio `CL-YYYYMMDD-000-1`.
- **Decisión: aceptado (Opción A — mínima).**

### Eligibility de items vacíos (sesión 9)
- `frpEligibilityResult("")` retorna `APTO_EXPRESS`. Items con `originalText` vacío no gatean revisión de compatibilidad.
- Casos ambiguos no-vacíos (ej. "xy", "asdf") siguen retornando `REQUIERE_REVISION`.
- Casos de catálogo válidos sin cambio.
- `compatibilityReviewRequired` se mantiene como safety net defensivo.

### Paso 1 cliente — decisiones de sesión 10

**7 de 8 open questions cerradas. La #5 queda pausada hasta resolver el modelo de órdenes paralelas (sesión 11).**

- **#1 Detección de país:** preselección desde **perfil del cliente registrado**. NO se usa IP en el modo con login. Cloudflare `cf-ipcountry` queda reservado para el "modo express sin login" futuro (input crudo separado).
- **#2 Tasa de cambio USDT → moneda local:** **manual desde Centro de configuración** (sub-sección "Tasa de cambio manual"). NO se usa fuente externa (CoinGecko, Binance API, etc. descartadas). Cuando admin actualiza la tasa, el cliente que está mirando paso 1 ve el monto cambiar en vivo.
- **#3 Polling de tasa:** **anulada**. No hay fuente externa que pollear.
- **#4 Costo unitario:** fijo en USDT, mismo para los 5 destinos. Rango real actual 3.0–5.5 USDT por equipo. Configurable por admin (corregir spec — el ejemplo de 6.25 USDT está desactualizado).
- **#5 Vista en desktop:** **PAUSADA.** Depende del modelo de órdenes paralelas (sesión 11).
- **#6 Persistencia entre sesiones:** **recordar última pill elegida**, no siempre la del perfil. Si el cliente peruano elige USDT, la próxima vez que entra ve USDT preseleccionado. Si elige Perú de nuevo, vuelve a Perú. La pantalla "aprende" de la última elección.
- **#7 Aclaración TRC20 en pill USDT:** NO mostrar TRC20 en paso 1. Pill muestra solo "USDT" + logo Tether (verde, ya está en mockup).
- **#8 Desactivar métodos de pago:** Sí. Vive en pestaña nueva del panel admin (NO en "Precios"). Cambio se refleja en vivo (sin recargar). Mensaje al cliente es **configurable**: por defecto "No disponible temporalmente", pero admin puede escribir texto custom (ej. "USDT vuelve mañana 9 AM").

**Banner amarillo nuevo:** cuando admin actualiza la tasa desde Centro de configuración, en la pantalla del cliente aparece un banner amarillo "El tipo de cambio cambió, monto actualizado". Reemplaza al edge case 9 original que se disparaba por cambio >2% en API externa.

### Centro de configuración (panel admin) — spec futura sesión 10

**Pestaña nueva en el panel admin/operador.** Nombre acordado: **"Centro de configuración"**.

Sub-secciones identificadas (NO diseñadas todavía, solo nombradas):

1. **Métodos de pago** — activar/desactivar pills por país + mensaje custom (origen: decisión #8 paso 1).
2. **Medios de pago** — cuentas reales de cobro (Yape, Binance Pay, transferencias bancarias) + QR de pago (Yape, Binance Pay).
3. **Costo del servicio en USDT** — subir/bajar precio base, historial de cambios.
4. **Operadores/técnicos** — ver si conviene mudar desde "Usuarios" existente o mantener en ambos lugares.
5. **Horarios de atención** — inicio/fin del servicio, días sin atención.
6. **Mensajes globales** — cartel "mantenimiento" / "demoras hoy" para mostrar en cliente.
7. **Tasa de cambio manual** — override para definir tasa USDT → moneda local (origen: decisión #2 paso 1).
8. **Catálogo de equipos** — lista de modelos Xiaomi soportados.

**Cada sub-sección requiere su propia spec formal con las 8 piezas.** No implementar sin spec.

**Prioridad sugerida:** "Tasa de cambio manual" y "Métodos de pago" son las primeras necesarias porque son dependencias del paso 1 cliente. El resto puede esperar.

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
- **`HANDOFF.md`** — este archivo. Bridge entre sesiones. **Versión actual: v1.7.**
- **`audit-template.md`** — template para auditar el repo con Claude Code.
- **`_template-prompt-claude-code.md`** — templates obligatorios para prompts a Claude Code.
- **`_brand-tokens-pendiente.md`** — placeholder para sesión de polish visual con logo.
- **`_costos-frp-redesign-pendiente.md`** — placeholder para rediseño visual interno de Costos FRP.

### `docs/specs/cliente/`
- **`paso-1-precio.md`** — spec completo del paso 1. **Versión actual: v1.1.** 7 de 8 open questions cerradas en sesión 10. La #5 (vista desktop) queda pendiente del modelo de órdenes paralelas. Mockup pendiente de actualización antes de implementación.
- **`mockups/paso-1-precio.html`** — mockup HTML standalone responsive del paso 1. **Pendiente actualización** con 2 estados nuevos (pill desactivada con mensaje custom + banner amarillo de tasa cambiada). Sesión chica futura antes de implementación.

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

### Sesión 11 (próxima)

**Foco:** procesar en frío el modelo de órdenes paralelas descubierto en sesión 10.

**No es:** ni implementación, ni cerrar paso 1, ni avanzar al paso 2.

**Es:** sentarse con cabeza fresca a definir cómo conviven en la pantalla principal cliente: paso 1 (nueva orden) + Mis órdenes (órdenes activas) + flujo paralelo. Esto puede generar una spec nueva ("página principal cliente" o "Mis órdenes ampliada") que precede a las specs de paso 1, 2, 3, 4 individuales.

Procedimiento sugerido:

1. **Empezar revisando el descubrimiento sesión 10** (sección "Modelo de uso del cliente" arriba) y los inputs crudos relacionados (modelo paralelo, sistema de tiempo y alertas).
2. **Mockup de la pantalla principal cliente** que represente correctamente el modelo paralelo. Validar con Bryam.
3. **Resolver los conflictos con decisiones firmes** (timer paso 4, multi-orden, lock pricing) explícitamente: cuál se mantiene, cuál se reemplaza.
4. **Cerrar pregunta #5 del paso 1** (vista en desktop) ahora que se sabe cómo conviven los espacios.
5. **Spec resultante:** decidir si va como nueva spec dedicada o como sección expandida de specs existentes.

### Sesión 12

Implementación paso 1 cliente. Requisitos previos:
- Sesión 11 cerrada (modelo paralelo definido).
- Paso 1 spec a v1.2 con #5 cerrada y notas del modelo paralelo aplicadas si corresponde.
- Mockup del paso 1 actualizado con estados nuevos.
- Spec del Centro de configuración con sub-secciones "Tasa de cambio manual" y "Métodos de pago" al menos esbozadas (porque paso 1 las consume).

### Sesiones 13-15

Spec + implementación de paso 2, 3, 4 cliente. Sesión 14 (paso 3) deberá incluir corrección USDT/Binance Pay vs TRC20. Sesión 15 (paso 4) deberá considerar el sistema de tiempo y alertas + el modelo paralelo si para entonces se decidió implementarlo.

### Sesión 16

QA final del cliente rediseñado. **Reintento del escenario 4 de B-008** una vez que el flujo cliente↔panel operador esté implementado.

### Post-lanzamiento (Bundle 3 + futuro)

- Bundle 3 cleanup (CSS huérfano, funciones zombi, error CSP, Perú dup, B-003 a B-006, H-008, postpayEligible, compatibilityReviewRequired si confirma muerto)
- B-002 (decisión de producto sobre pills "Perú")
- Endpoint admin para revertir pagos (dispara `payment_reverted` SSE)
- Modal "Reportar problema"
- Sub-acción "Adjuntar evidencia" post-finalización
- VIP/postpago UI cliente
- Notificaciones in-portal (PR-2c)
- Anti-fraude 4 capas (PR-2b)
- Tools/billeteras (modelo nuevo + admin)
- Multi-orden enforcement backend
- Rediseño visual de Costos FRP
- Polish visual con logo
- DOM diffing si flicker es molesto
- Hallazgo flujo de comprobantes en panel operador (resuelto idealmente en sesión 11)
- Sistema de alertas/lock/reembolso (requiere spec formal antes de implementar)
- **Modo express sin login** (línea de producto futura, requiere spec formal)
- **Centro de configuración** (panel admin con 8 sub-secciones, cada una requiere spec)
- **Validación de precio que falla** (investigar y arreglar — hallazgo sesión 10)
- **Polish visual mockup paso 1** (estados nuevos antes de implementación sesión 12)

---

## Bitácora de errores de proceso

Esta sección documenta cuando una sesión salteó pasos del proceso. Sirve para que un Claude futuro vea ejemplos reales y no los repita.

### Sesión 5 — Inicial: "no nos trabamos con specs todavía, sigamos con mockups"
- **Qué pasó:** El Claude del chat sugirió seguir con mockups uno por uno (paso 1, 2, 3, 4) en vez de planificar el método completo de specs.
- **Por qué falló:** Los mockups solos cubren "happy path", no estados, edge cases, responsive, behavior, etc.
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
- **Cómo se corrigió:** Bryam preguntó "¿no debería leer el código primero?" Refactorizamos el prompt a uno de análisis previo.
- **Lección:** "Limpieza" no es excepción al proceso. Toda acción pasa por Plan → Design antes de Implement.

### Sesión 7 — Commit 6: "la spec ya cubre esto"
- **Qué pasó:** El Claude del chat mandó prompt directo de implementación para commit 6 sin pedir Template A primero.
- **Por qué falló:** La spec describe **qué** hacer; el análisis describe **cómo** y **qué se rompe**. Son distintos.
- **Cómo se corrigió:** Bryam preguntó "¿estás siguiendo Plan → Design → Implement → Test → Review?"
- **Lección:** Tener spec NO equivale a tener análisis. Análisis previo siempre, aún con spec validada.

### Sesión 7 — Commit 6b: scope creep silencioso de Claude Code
- **Qué pasó:** Claude Code agregó `:focus-visible` accessibility al summary del acordeón Costos FRP sin estar en el scope acordado.
- **Por qué falló parcialmente:** Es accesibilidad útil, pero violó "scope acordado, nada más".
- **Lección:** Claude Code debe **preguntar antes**, no implementar y avisar después.

### Sesión 8 — propuesta de saltar al rediseño en caliente
- **Qué pasó:** Durante el smoke test del fix B-001, apareció el mensaje rojo de B-008. Bryam, frustrado, propuso "rediseñemos todo el flujo y esta página como hicimos con la otra".
- **Por qué fallaba:** Era una decisión de plan grande tomada en caliente, en respuesta a un solo bug nuevo, sin Plan/Design previo.
- **Cómo se manejó:** El Claude del chat aplicó la regla "si me proponés saltar etapas, frename".
- **Lección:** Las propuestas de cambio grande de plan se discuten en sesión aparte, con cabeza fría.

### Sesión 8 — audit incorrecto en H-004 → bug crítico oculto
- **Qué pasó:** El audit de Claude Code clasificó `compatibilityReviewRequired` como dead code (H-004), basándose en un comentario incorrecto.
- **Por qué falló:** Claude Code se basó en un comentario sin validar empíricamente la lógica del helper.
- **Lección:** El audit puede equivocarse. Smoke test es el último filtro.

### Sesión 9 — "decisión nueva al final de sesión cansado"
- **Qué pasó:** Al final de sesión 9 Bryam empezó a abrir decisiones grandes de producto (lock pricing, timer paso 4, alertas, reembolsos).
- **Por qué fallaba:** Sesión 9 era B-008 + QA, no diseño de producto. Bryam mismo había mencionado cansancio.
- **Cómo se manejó:** El Claude del chat frenó explícitamente: no investigó fuentes externas, no propuso ideas. Todo lo registró textualmente como "input crudo".
- **Lección:** Cansancio + final de sesión + smoke test reciente = combinación de alto riesgo. Agregada como trampa común #11 y regla #12.

### Sesión 10 — descubrimiento del modelo de órdenes paralelas a mitad de spec
- **Qué pasó:** Mientras se respondían las open questions del paso 1, en la respuesta a la pregunta #5 (vista desktop), Bryam reveló que su modelo de negocio funciona con **órdenes en paralelo**, no secuencial. Esto cambia el marco de cómo se diseña la pantalla principal cliente y se cruza con varias decisiones firmes (timer paso 4, multi-orden, lock pricing).
- **Por qué fallaba el camino fácil:** Si el Claude seguía cerrando preguntas que dependían del modelo paralelo (especialmente #5), estaría improvisando diseño encima de un descubrimiento fresco. Mismo patrón que la trampa #11 pero a mitad de spec en lugar de al final.
- **Cómo se manejó:** El Claude del chat detectó la dependencia, pausó las preguntas dependientes (#5), cerró las independientes (#1, #2, #3, #4, #6, #7, #8) que NO dependían del modelo paralelo, y registró el descubrimiento como input crudo. Bryam aceptó. Sesión cerró con 7/8 cerradas + descubrimiento listo para procesar en frío en sesión 11.
- **Lección:** Cuando aparece un descubrimiento conceptual a mitad de una spec, el reflejo correcto es **separar dependencias**: cerrar lo que NO depende, pausar lo que depende, abrir spec dedicada. NO improvisar diseño sobre lo recién descubierto. Agregada como regla #13 y trampa #12.

### Sesión 10 — prevención de "decisión nueva al final de sesión cansado"
- **Qué pasó:** Cerca del final de sesión 10, Bryam abrió la propuesta de "temporizador en paso 4 + liberación del flujo al apretar conectado" mientras seguíamos cerrando paso 1.
- **Por qué fallaba el camino fácil:** Era propuesta de plan grande (afecta paso 3, paso 4, panel operador, multi-orden) ofrecida como si fuera ajuste menor de paso 1. Patrón sesión 9 reapareciendo.
- **Cómo se manejó:** El Claude del chat aplicó preventivamente la regla #12 + #13: registró como input crudo, NO como decisión, propuso cortar sesión. Bryam aceptó y validó cerrar con 7/8 preguntas resueltas.
- **Lección:** La regla #12 funciona. Reaplicarla cada vez que vuelva a aparecer el patrón.

---

## Cómo arrancar próxima sesión

Si sos un Claude que abre un chat nuevo:

1. Leé este `HANDOFF.md` completo, especialmente la sección "ANTES DE NADA — el proceso obligatorio" y "Modelo de uso del cliente".
2. Leé `_template-prompt-claude-code.md` para los formatos de prompt a Claude Code.
3. Bryam te va a decir en qué spec quiere trabajar. Buscá el archivo `.md` correspondiente en `docs/specs/`.
4. **Antes de proponer implementación, validá el checklist** Plan → Design → Implement → Test → Review.
5. **Antes de proponer cosas nuevas, revisá la sección "Decisiones de producto firmes" arriba.** Si querés contradecir alguna, decíselo explícitamente y pedí confirmación.
6. **NO confundas "Inputs crudos para spec futura" con decisiones tomadas.** Esa sección es material a procesar en sesión dedicada, no implementar.
7. Una sesión = un archivo entregado. No empezar dos cosas a la vez.
8. **Cada sesión termina con un prompt para Claude Code** que mueva los archivos generados al repo.
9. **Al final de la sesión, actualizá este HANDOFF** si hay decisiones nuevas o si una spec cambió de versión.
10. **Si Bryam te pide saltar el proceso por urgencia o por "es simple", frená.** Tu rol es proteger el proceso, incluso de él.
11. **Si Bryam pide hablar más simple/suave**, sin jerga técnica, cumplir.
12. **Si Bryam menciona cansancio o construcción lenta**, sugerí cortar y retomar con cabeza fresca antes de cerrar decisiones grandes.
13. **Si aparece un descubrimiento conceptual a mitad de una spec**, separá dependencias: cerrá lo que NO depende, pausá lo que sí, abrí spec dedicada. NO improvises diseño sobre lo recién descubierto.

### Frase de arranque que Bryam debe usar

> "Soy Bryam de AriadGSM. Te paso HANDOFF.md y archivos de specs. Trabajamos con proceso Plan → Design → Implement → Test → Review. **Si me proponés saltar alguna etapa, frename.**"

Si no usa esa frase, recordásela vos antes de avanzar.

---

## Sesiones previas (resumen mínimo)

- **Sesión 1-4:** mockups visuales de los 4 pasos cliente. Iteramos hasta cerrar diseño visual.
- **Sesión 5:** definimos el método (8 piezas por spec). Spec completa de paso 1 cliente como piloto. Plan estratégico v1.1. Audit del repo. Spec inicial del operador FRP Express v1.0.
- **Sesión 6:** Bryam respondió las 8 Open Questions del operador FRP Express. Spec actualizada a v1.1.
- **Sesión 7 (cerrada):** 11 commits implementados. Operador FRP Express completo end-to-end. Tests pass. HANDOFF v1.3.
- **Sesión 8 (cerrada):** 1 commit + descubrimiento crítico. B-001 implementado. **B-008 descubierto.** HANDOFF v1.4.
- **Sesión 9 (cerrada parcialmente):**
  - HANDOFF v1.5: limpieza de referencias erróneas a "BryamsIA".
  - Análisis previo B-008 + implementación fix (a) en commit `21e1790`. Tests 11/11 pass.
  - Smoke test: escenarios 1, 2, 3 ✅. Escenario 4 ⏳ pendiente.
  - Hallazgo abierto: flujo de comprobantes en panel operador.
  - Inputs crudos registrados (NO decisiones): sistema de alertas escaladas, lock pricing, política de reembolso.
  - Trampa nueva registrada: "Decisión nueva al final de sesión cansado". Regla #12.
  - HANDOFF v1.6.
- **Sesión 10 (cerrada parcialmente):**
  - **B-008 escenario 4 PAUSADO** después de confirmar empíricamente el bloqueo del flujo cliente↔panel operador. Rama `feat-b008-fix` no se mergea hasta sesión 16.
  - **Spec paso 1 cliente actualizada a v1.1** con 7 de 8 open questions cerradas. La #5 (vista desktop) queda pausada.
  - **Decisiones firmes nuevas del paso 1** registradas en sección dedicada (preselección por perfil, tasa manual desde Centro de configuración, costo unitario actualizado, recordar última pill, etc.).
  - **Descubrimiento clave:** modelo de órdenes paralelas. Cambia el marco de la pantalla principal cliente. Registrado como input crudo + sección dedicada "Modelo de uso del cliente".
  - **Spec futura nueva identificada:** Centro de configuración (panel admin) con 8 sub-secciones nombradas.
  - **Hallazgos abiertos nuevos:** validación de precio falla, USDT real es Binance Pay (no TRC20), mockup paso 1 necesita actualización antes de implementación.
  - **Inputs crudos nuevos:** modelo de órdenes paralelas, modo express sin login.
  - **Reglas y trampas nuevas:** regla #13 (descubrimientos conceptuales a mitad de spec), trampa #12 (improvisar diseño sobre descubrimiento fresco).
  - **Aplicación correcta de regla #12 (preventiva)** cuando Bryam abrió propuesta de temporizador paso 4 cerca del final.
  - **HANDOFF v1.7.**

---

**Si tenés dudas que no podés resolver con este archivo + las specs, preguntale a Bryam directo. No improvises.**
