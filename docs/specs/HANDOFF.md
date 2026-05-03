# HANDOFF — AriadGSM Portal Specs

**Para Claudes futuros que retomen este trabajo.** Si abrís un chat nuevo, leé este archivo primero, después abrí los otros archivos en `docs/specs/`. Después de eso, ya sabés todo lo necesario para continuar.

**Última actualización:** 3 de mayo 2026 · v1.6

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
- B-008 fix (sesión 9 — escenarios 1, 2, 3 validados; escenario 4 pendiente)
- Cualquier cleanup pendiente (Bundle 3)

Razón: probar feature por feature mientras hay bugs cliente conocidos genera ruido. Bugs del operador y del cliente se mezclan. Mejor cerrar bloques completos y QA integral al final.

---

## Qué es AriadGSM

Servicio remoto de FRP/Cuenta Google para Xiaomi en Latam. Procesa ~130 órdenes/día (proyección — hoy la web es local sin clientes reales). El cliente final son técnicos de tienda (B2B) que pagan en USDT, transferencia local (PE/MX/CO/CL) o Yape Perú.

**Owner:** Bryam (no es programador, aprende haciendo, prefiere mockups visuales sobre texto largo).
**Operadores internos:** Jack (principal) + Angelo (apoyo). Trabajan en turnos distintos, no simultáneos.

**Producto:** monorepo Node.js que sirve dos frontends según host:
- `ariadgsm.com` → portal cliente (4 pasos para que el técnico mande su pedido)
- `ops.ariadgsm.com` → panel operador (donde Jack/Angelo procesan los pedidos)

En entorno local: `localhost:4173/cliente` (cliente) y `localhost:4173/` (operador). Login operador: `admin@local.test`. Cliente de prueba: `raugsm.69@gmail.com`. Comando arranque: `npm start`.

**Característica clave del bypass:** dura 5-10 segundos físicos. La interfaz del operador acompaña el antes y después del bypass, no el durante. Decisiones como "cancelar de raíz" son seguras.

---

## Plan de lanzamiento (decisión sesión 7, ratificado sesión 8)

Bryam eligió **Opción B**: lanzar con visual nuevo del cliente, no solo bugs arreglados. Estimación realista:

```
SESIÓN 7 (cerrada)
└── Operador FRP Express completo + cierre con archivos firmes ✅

SESIÓN 8 (cerrada)
└── B-001 fix paso 4 cliente (1 commit) + descubrimiento de B-008 ✅

SESIÓN 9 (cerrada parcialmente)
└── B-008 fix (crítico) ✅ + escenarios 1-3 smoke test ✅ + escenario 4 pendiente

SESIÓN 10 (próxima)
└── Cerrar escenario 4 B-008 (5 min) + Spec + implementación paso 1 cliente

SESIÓN 11
└── Spec + implementación paso 2 cliente

SESIÓN 12
└── Spec + implementación paso 3 cliente

SESIÓN 13
└── Spec + implementación paso 4 cliente (incluye decisiones pendientes — ver "Inputs crudos para spec futura")

SESIÓN 14
└── QA final cliente rediseñado

→ LANZAMIENTO (cadencia depende de Bryam — no hay urgencia comercial al ser local)
```

**Cadencia:** Bryam construye solo y atiende clientes en paralelo por WhatsApp. La cadencia de sesiones la define Bryam. No hay deadline real. Si una sesión por semana es mucho, se distribuyen con margen. Esto es importante: en sesión 9 Bryam reconoció cansancio acumulado, lo que activó la trampa "Decisión nueva al final de sesión cansado". Claudes futuros: si notan a Bryam fatigado, sugieran cortar y retomar con cabeza fresca antes que insistir en cerrar.

**Si en sesión 10 surge urgencia de lanzar antes** con cliente "feo pero funcional", se puede cambiar a Opción A (lanzar con cliente actual + bugs arreglados, postergar rediseño visual). La decisión no es irreversible.

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

**Total sesión 8: 1 commit. Smoke test del paso 4 NO completado por aparición de B-008 (pre-existente). El smoke test se completó en sesión 9 después de arreglar B-008.**

### Implementado en sesión 9 — Fix B-008 items vacíos

**1 commit, branch `feat-b008-fix` (creada desde `feat-step4-redesign`):**

- `21e1790` — `fix(eligibility): items vacios retornan APTO_EXPRESS (B-008)`. Guarda al inicio de `frpEligibilityResult` que devuelve `APTO_EXPRESS` cuando `originalText` es string vacío. Soluciona la causa raíz del bug crítico que bloqueaba la creación de órdenes nuevas con comprobante. Cubre análisis previo empírico de los 3 fixes posibles (a, b, c). Diff: 3 archivos, +14 / -2 LOC:
  - `server/frp/eligibility.js` — +10 / -0 (guarda nueva)
  - `test/phase3a.contract.test.js` — +1 / -0 (assertion empty string)
  - `public/portal-modules/events.js` — +3 / -2 (comentario actualizado al mecanismo real)

**Smoke test B-008 (validación post-fix):**

- ✅ Escenario 1 — cliente sin modelo + comprobante → orden creada en PAGO_EN_REVISION sin error 409. Confirma fix B-008.
- ✅ Escenario 2 — operador valida pago → cliente ve EN_PREPARACION con código real `CL-20260503-001-1`. Cierra B-001 que quedó pendiente de sesión 8.
- ✅ Escenario 3 — cliente con modelo válido ("Redmi Note 13") + comprobante → flujo normal sin diferencias. Control de no-regresión OK.
- ⏳ Escenario 4 — cliente con modelo ambiguo ("xy") + comprobante → debería bloquear con REVISION_COMPATIBILIDAD. **Pendiente** porque la orden del escenario 1 quedó en `LISTO_PARA_CONEXION` y bloquea creación de nuevas órdenes con el mismo cliente. Se completa en sesión 10.

**Total sesión 9: 1 commit. Branch `feat-b008-fix` sin push, sin merge a main hasta cerrar escenario 4. Tests 11/11 pass.**

### Lo que está parcial

- VIP/postpago: backend completo (`vipUnitMargin`, `usableNow`, `urgentRequested`), no hay UI cliente
- Notificaciones in-portal: planeado como PR-2c, no empezado
- Anti-fraude 4 capas: planeado como PR-2b, no empezado
- Multi-orden enforcement: UI prioriza pero backend no enforce
- **Smoke test B-008 escenario 4:** pendiente, se completa en sesión 10 (5 min de trabajo).

### Lo que NO existe

- Tests E2E completos
- TypeScript (todo es JS puro)
- i18n (todo en español hardcoded)
- Storage externo (comprobantes en JSON DB como base64)
- Framework web (es `node:http` raw)

### Bugs conocidos en cola

- **B-001 (paso 4 código real)** — ✅ ARREGLADO sesión 8 (commit 964413b), validado sesión 9 escenario 2.
- **B-002 (pills "Perú" duplicadas en paso 1)** — UX, requiere decisión de producto. Target sesión 10 o Bundle 3.
- **B-003** `wirePaso4BannerActions` import muerto en `auth-forms.js:15` — Bundle 3
- **B-004** `operationCode` sin callers en `connection.js:3-7` — Bundle 3
- **B-005** `customerName` ignorado en `stepGuideMarkup` (`auth-forms.js:25` lo envía pero `connection.js:81` no lo recibe) — Bundle 3
- **B-006** `liveRing` animación 1.8s vs spec 1.4s en `05-frp-flow.css:321` — Bundle 3
- **H-008** copy "pasos 1, 2 y 3" en paso 3 (debería decir "1 y 2") en `portal.html:210` — Bundle 3
- **B-008 (comprobante bloqueado)** — ✅ ARREGLADO sesión 9 (commit 21e1790). Pendiente escenario 4 del smoke test (control de no-regresión para casos ambiguos).

**Otros pendientes Bundle 3:**

- **2 pills "Perú" duplicadas** (PE_YAPE_BRYAMS + PE_YAPE_PEREGRINA) — Bundle 3 (mismo issue que B-002)
- **`compatibilityReviewRequired` semi-dead code** después del fix B-008 — Bundle 3 (mantenido como safety net defensivo).
- **`postpayEligible` indefinido** en `server/portal/portal-routes.js:679` — referenciado en audit dentro de rama hoy muerta (`postpayRequested = false` hardcoded). Si se reintroduce UI postpago lanzaría ReferenceError. Bundle 3 o sesión postpago UI.
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

## Hallazgos abiertos pendientes de spec/investigación

### Hallazgo sesión 9 — flujo de comprobantes y estados en panel operador

Durante el smoke test post-fix B-008, Bryam observó que cuando el cliente sube comprobante en paso 3, la orden asociada no aparece en el panel del operador FRP Express hasta que el operador valida el pago. Bryam describió cómo debería funcionar el flujo correcto:

**Línea de tiempo del flujo propuesto:**

1. **Cliente sube comprobante (paso 3)** → la orden aparece en el panel del operador con etiqueta "sin verificar", junto al comprobante. Razón: el operador necesita ver la orden y el comprobante juntos para tener contexto al validar (qué se pagó, cuántos equipos, qué método).

2. **Operador valida pago** → la etiqueta cambia a "verificado". La orden queda en el panel del operador pero NO disponible para el técnico todavía. Validar pagos y procesar jobs son acciones independientes — el operador puede validar varios pagos seguidos sin que eso encadene procesamiento.

3. **Cliente vuelve al paso 4 y aprieta el botón** → dispara dos cosas simultáneas: (a) seguimiento en vivo del lado del cliente, (b) la orden cambia a etiqueta "listo para procesar" en el panel del operador.

4. **Técnico toma el job de la cola "listo para procesar"** cuando está disponible y ejecuta el bypass.

**Razón del flujo:** "verificado" ≠ "listo para procesar". El técnico no debe procesar órdenes solo verificadas porque el cliente puede no estar listo (todavía no conectó el equipo, todavía no abrió Mini-Redirector, etc.). El botón del paso 4 es la señal del cliente de "ya estoy listo, vengan a procesarme". Esto evita que el técnico ejecute el bypass cuando el cliente ni está mirando la PC, o que tome jobs y quede esperando.

**Open questions para la spec formal (no se resuelven hoy):**

- ¿Qué pasa si el cliente nunca aprieta el botón del paso 4? ¿La orden queda eternamente en "verificado"? Bryam confirma que existen casos reales de clientes que pagan y procesan al día siguiente, hoy lo maneja manualmente por WhatsApp. (Ver "Inputs crudos para spec futura" abajo.)
- ¿Las etiquetas "sin verificar" / "verificado" / "listo para procesar" reemplazan al estado actual `LISTO_PARA_CONEXION`, o conviven con él?
- ¿El cambio afecta también el panel del cliente "Mis órdenes" o solo el lado operador?
- ¿Cómo se mapea esto al `paymentStatus` existente (`ESPERANDO_COMPROBANTE`, `PAGO_EN_VALIDACION`, `PAGO_VALIDADO`)?

**Pendiente para sesión futura (NO sesión 10):**

1. Verificación empírica con Claude Code: ¿cómo maneja hoy el panel del operador los pagos pendientes? ¿Hay otra pestaña, otro panel, u otro mecanismo que muestre órdenes con comprobante sin validar? Posible que el flujo actual ya tenga algo similar pero no esté visible donde Bryam estuvo mirando.
2. Si el flujo actual NO contempla esto, decidir si es bug a arreglar (flujo viejo incompleto) o feature nueva a especificar (rediseño del panel operador). Cualquier implementación requiere spec formal con las 8 piezas (mockup, estados, edge cases, etc.) antes de tocar código.
3. Decidir prioridad: ¿se hace antes, durante o después de las sesiones 10-13 del rediseño visual del cliente? El panel del operador ya se rediseñó en sesión 7 — un cambio aquí implicaría reabrir esa spec.

**Importante:** este hallazgo NO es regresión del fix B-008. El fix B-008 cerró correctamente el bug crítico (escenarios 1, 2, 3 validados; escenario 4 pendiente). El hallazgo es comportamiento pre-existente del flujo viejo, descubierto al poder atravesar el flujo end-to-end gracias al fix B-008.

---

## Inputs crudos para spec futura

**Esta sección registra ideas y propuestas que Bryam compartió en chat pero NO son decisiones tomadas.** Quedan registradas para ser convertidas en spec formal en una sesión dedicada con cabeza fresca, mockups, fuentes externas e investigación. **NO implementar basándose en esta sección.** Si un Claude futuro va a trabajar en cualquiera de estos temas, primero debe abrir sesión dedicada para escribir spec con las 8 piezas.

### Sistema de tiempo y alertas en flujo de pago/conexión

*Registrado al cierre de sesión 9. Bryam estaba cansado al momento del registro y reconoció que necesitaba cabeza fresca. Pendiente revisar TODO esto en frío antes de tomarlo como decisión.*

**Sobre clientes que no aprietan paso 4:**
Bryam confirma que existen casos reales de clientes que pagan y procesan al día siguiente. Hoy lo maneja manualmente por WhatsApp: si tiene visión de que pagó y el costo sigue siendo el mismo, le hace el proceso. Pendiente: investigar fuentes externas sobre cómo manejar esto en mercado latinoamericano sin sonar agresivo, manteniendo tono "express".

**Propuesta de Bryam para reemplazar el lock de 15 min y el timer de 2 min del paso 4:**
Sistema de alertas escaladas que se dispara desde que el cliente sube el comprobante:
- 1.5 min → primera alerta: "los precios pueden variar, el precio brindado es seguro solo por 5 minutos"
- 3 min → alerta naranja: recordatorio
- 5 min → alerta roja: "el precio final puede variar"

Bryam plantea que esta nueva regla reemplazaría tanto el lock de 15 minutos como el timer de 2 min del paso 4 ("¿listo para conectar?"). Ubicación de las alertas (paso 3 o paso 4): a definir.

**Propuesta de Bryam sobre cambio de precio post-5min:**
Si después de los 5 min el cliente no apretó el botón del paso 4 y el precio cambió:
- En el lado cliente: alerta de que tiene que reintegrar dinero o se le reembolsa.
- En el lado operador: la orden vuelve al estado "revisar pago" avisando que va a aumentar de precio.
- Bryam aclara que los cambios suelen ser bajos (0.5–1 USD) y la mayoría de clientes aceptan.

**Open questions para la spec formal:**

- ¿La nueva regla de 1.5/3/5 min REEMPLAZA el lock de 15 min, o son cosas distintas (ej. lock interno = 15 min, alertas visuales al cliente = 1.5/3/5 min)?
- ¿Las alertas viven en paso 3, paso 4, o ambos? ¿Y "Mis órdenes"?
- ¿"Reembolso" es decisión automática del sistema o manual del operador? ¿Política comercial escrita?
- ¿El estado "vuelve a revisar pago" requiere nuevo enum en `paymentStatus` del backend? ¿O reusa `PAGO_EN_VALIDACION`?
- ¿Se notifica al cliente del cambio de precio antes de pedirle reintegro, o se le presenta como hecho?
- Tono: investigar fuentes externas sobre comunicación con consumidor latinoamericano para que las alertas no suenen agresivas.

**Conflictos con decisiones firmes actuales del HANDOFF (a resolver en spec formal):**

- Sección "Pricing": *"Lock por orden completa por 15 min desde aprobación del comprobante"* → contradice regla nueva de 5 min.
- Sección "Timers cliente": *"Paso 4: 2 min sin apretar 'Equipo conectado' → banner '🔧 ¿Listo para conectar?'"* → Bryam plantea reemplazar.

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
- **Si Bryam menciona cansancio, fatiga o "construí esto algo lento"**, eso es señal real. Sugerir cortar la sesión y retomar con cabeza fresca antes que insistir en cerrar decisiones.

### 9. Frase de arranque obligatoria de Bryam
Cuando Bryam abre un chat nuevo conmigo, debe arrancar con esta frase (o similar):

> "Soy Bryam de AriadGSM. Te paso HANDOFF.md y archivos de specs. Trabajamos con proceso Plan → Design → Implement → Test → Review. **Si me proponés saltar alguna etapa, frename.**"

La última oración es lo que me da permiso explícito a frenarte si me apuro. Sin esa frase, la regla se debilita.

### 10. Validación profunda solo en QA integral
Durante implementación de Fase 1, smoke test rápido. Validación profunda recién cuando todos los bloques están cerrados. Esto evita mezclar contextos de bugs distintos.

### 11. Audit no es verdad final
Un audit de Claude Code es ayuda valiosa pero NO infalible. Smoke test es el último filtro. En sesión 8, el audit afirmó que cierta rama era "dead code" (H-004) pero el smoke test descubrió que era B-008, un bug bloqueante. Lección: confiar en el audit pero verificar empíricamente cuando se pueda.

### 12. Decisiones grandes en frío, nunca al final de sesión cansado
Si Bryam empieza a abrir decisiones grandes (cambiar lock de pricing, reemplazar timers, agregar políticas comerciales) al final de una sesión larga, mientras estaba haciendo smoke test, o después de haber dicho que estaba cansado: **frenar**. Registrar como input crudo en HANDOFF, NO como decisión tomada. Decisiones grandes requieren sesión dedicada con mockups, fuentes externas, y revisión en frío. Esto le pasó a Bryam en sesión 9 y lo reconoció él mismo.

---

## Decisiones de producto firmes (no se reabren)

**IMPORTANTE:** algunas de estas decisiones tienen propuestas de cambio en "Inputs crudos para spec futura". Hasta que esas propuestas se conviertan en spec formal aprobada, **las decisiones firmes de abajo siguen vigentes**. NO implementar nada distinto basándose en los inputs crudos.

### Pricing
- Lock por orden completa por 15 min desde aprobación del comprobante *(propuesta de cambio a 5 min en inputs crudos sesión 9 — no aprobada)*
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
- Paso 4: 2 min sin apretar "Equipo conectado" → banner "🔧 ¿Listo para conectar?" *(propuesta de reemplazo en inputs crudos sesión 9 — no aprobada)*

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

### Eligibility de items vacíos (sesión 9)
- `frpEligibilityResult("")` retorna `APTO_EXPRESS`. Items con `originalText` vacío no gatean revisión de compatibilidad.
- Casos ambiguos no-vacíos (ej. "xy", "asdf") siguen retornando `REQUIERE_REVISION` (gate sigue activo).
- Casos de catálogo válidos (ej. "Redmi Note 13") sin cambio.
- `compatibilityReviewRequired` se mantiene como safety net defensivo aunque hoy no se dispare desde el FE.

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
- **`HANDOFF.md`** — este archivo. Bridge entre sesiones. **Versión actual: v1.6.**
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

### Sesión 10 (próxima)

**Foco:** cerrar B-008 (escenario 4) + Spec + implementación paso 1 cliente.

Procedimiento:

1. **Cerrar smoke test B-008 escenario 4 (5 min):** cliente con modelo ambiguo ("xy") + comprobante → debe seguir bloqueando con `REVISION_COMPATIBILIDAD`. Si pasa, B-008 cierra formalmente y se puede mergear `feat-b008-fix` a la branch principal de trabajo.

2. **Spec paso 1 cliente (rediseño visual):** según el plan, sesión 10 arranca el rediseño cliente paso 1. Mockups validados en sesiones 1-5, hay spec base en `docs/specs/cliente/paso-1-precio.md`. Revisar spec, completar las 8 open questions, y definir plan de implementación.

3. **Implementación paso 1 cliente:** Template B con scope acotado. Si el rediseño es grande, partir en sub-commits.

### Sesiones 11-13

Spec + implementación de mockups del cliente (paso 2, 3, 4 en sesiones separadas). Sesión 13 (paso 4) deberá considerar el hallazgo del flujo de comprobantes y los inputs crudos sobre alertas/lock/reembolso registrados en sesión 9 — pero NO tomarlos como decisiones, sino como insumos para la spec formal.

### Sesión 14

QA final del cliente rediseñado + lanzamiento (cuando Bryam decida — sin urgencia comercial).

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
- Rediseño visual de Costos FRP (con mockup, ver `_costos-frp-redesign-pendiente.md`)
- Polish visual con logo (ver `_brand-tokens-pendiente.md`)
- DOM diffing si flicker es molesto
- Hallazgo flujo de comprobantes en panel operador (ver "Hallazgos abiertos")
- Sistema de alertas/lock/reembolso (ver "Inputs crudos para spec futura" — requiere spec formal antes de implementar)

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
- **Cómo se corrigió:** Bryam preguntó "¿no debería leer el código primero?" Refactorizamos el prompt a uno de análisis previo. Resultado: Claude Code descubrió 2 listeners más que su reporte original había omitido. Sin análisis, hubieras tenido `ReferenceError` al cargar la página.
- **Lección:** "Limpieza" no es excepción al proceso. Toda acción pasa por Plan → Design antes de Implement.

### Sesión 7 — Commit 6: "la spec ya cubre esto"
- **Qué pasó:** El Claude del chat mandó prompt directo de implementación para commit 6 (banner timeout 30 min) sin pedir Template A primero.
- **Por qué falló:** La spec describe **qué** hacer; el análisis describe **cómo** y **qué se rompe**. Son distintos.
- **Cómo se corrigió:** Bryam preguntó "¿estás siguiendo Plan → Design → Implement → Test → Review?" El Claude reconoció el error y refactorizó el prompt a análisis previo. Claude Code devolvió 5 ambigüedades que requerían decisión.
- **Lección:** Tener spec NO equivale a tener análisis. Análisis previo siempre, aún con spec validada.

### Sesión 7 — Commit 6b: scope creep silencioso de Claude Code
- **Qué pasó:** Claude Code agregó `:focus-visible` accessibility al summary del acordeón Costos FRP sin estar en el scope acordado. Lo transparentó al final.
- **Por qué falló parcialmente:** Es accesibilidad útil, pero violó "scope acordado, nada más".
- **Cómo se mitigó:** Lo dejamos (es 4 líneas, útil, transparente). Pero registrado como caso a evitar.
- **Lección:** Claude Code debe **preguntar antes**, no implementar y avisar después.

### Sesión 8 — propuesta de saltar al rediseño en caliente
- **Qué pasó:** Durante el smoke test del fix B-001, apareció el mensaje rojo de B-008 (bug pre-existente bloqueante). Bryam, frustrado, propuso "rediseñemos todo el flujo y esta página como hicimos con la otra, no quiero perder 2 días corrigiendo bug por bug".
- **Por qué fallaba:** Era una decisión de plan grande tomada en caliente, en respuesta a un solo bug nuevo, sin Plan/Design previo.
- **Cómo se manejó:** El Claude del chat aplicó la regla "si me proponés saltar etapas, frename". Validó la frustración pero separó las dos cosas. Bryam aceptó cerrar sesión 8 con solo B-001 y atacar B-008 en sesión 9.
- **Lección:** Las propuestas de cambio grande de plan se discuten en sesión aparte, con cabeza fría.

### Sesión 8 — audit incorrecto en H-004 → bug crítico oculto
- **Qué pasó:** El audit de Claude Code clasificó `compatibilityReviewRequired` como dead code (H-004), basándose en un comentario incorrecto del código. La rama no era dead code: era B-008.
- **Por qué falló:** Claude Code se basó en un comentario sin validar empíricamente la lógica del helper.
- **Cómo se descubrió:** El smoke test del paso 4 (post-fix B-001) ejercitó el flow completo y el bug se manifestó en pantalla.
- **Lección:** El audit puede equivocarse. Smoke test es el último filtro. Esto motivó el énfasis en "verificación empírica" del análisis B-008 en sesión 9, que validó correctamente fix (a) y descartó (b) que el HANDOFF marcaba como recomendación inicial errada.

### Sesión 9 — "decisión nueva al final de sesión cansado"
- **Qué pasó:** Al final de sesión 9 (después de smoke test de B-008), Bryam empezó a abrir decisiones grandes de producto: cambiar el lock de pricing de 15 a 5 min, reemplazar el timer del paso 4, política de reembolso si el precio cambia, sistema de alertas escaladas con tono específico para mercado latinoamericano. Pidió que Claude buscara fuentes externas y propusiera ideas.
- **Por qué fallaba:** Sesión 9 era B-008 + QA, no diseño de producto. Las decisiones planteadas contradecían decisiones firmes ya registradas (lock de 15 min, timer paso 4 de 2 min) y agregaban política comercial nueva (reembolsos). Bryam mismo había mencionado cansancio en mensajes previos. Si Claude validaba o investigaba, esas ideas iban a quedar registradas como "lo que decidimos" sin haber pasado por sesión dedicada con mockups y cabeza fresca.
- **Cómo se manejó:** El Claude del chat frenó explícitamente: no investigó fuentes externas, no propuso ideas, no validó números. Todo lo registró textualmente como "input crudo" en HANDOFF, marcado explícitamente como NO decisión, con open questions y conflictos con decisiones firmes señalados. Bryam reconoció: "construí esta página algo lento. Y estuve agotado estos días. Ahora veo con más claridad el panorama". Sesión cerró sin decisiones nuevas tomadas.
- **Lección:** Cansancio + final de sesión + smoke test reciente = combinación de alto riesgo para decisiones de producto. La regla "decisiones grandes en frío, en sesión aparte" se aplica especialmente acá. Agregada como trampa común #11 y regla #12 de cómo trabajamos.

---

## Cómo arrancar próxima sesión

Si sos un Claude que abre un chat nuevo:

1. Leé este `HANDOFF.md` completo, especialmente la sección "ANTES DE NADA — el proceso obligatorio".
2. Leé `_template-prompt-claude-code.md` para los formatos de prompt a Claude Code.
3. Bryam te va a decir en qué spec quiere trabajar. Buscá el archivo `.md` correspondiente en `docs/specs/`.
4. **Antes de proponer implementación, validá el checklist** Plan → Design → Implement → Test → Review.
5. **Antes de proponer cosas nuevas, revisá la sección "Decisiones de producto firmes" arriba.** Si querés contradecir alguna, decíselo explícitamente y pedí confirmación.
6. **NO confundas "Inputs crudos para spec futura" con decisiones tomadas.** Esa sección es material a procesar en sesión dedicada, no implementar.
7. Una sesión = un archivo entregado. No empezar dos cosas a la vez.
8. **Cada sesión termina con un prompt para Claude Code** que mueva los archivos generados al repo. Bryam los descarga a `C:\Users\Bryams\Desktop\AriadGsm\files1\`.
9. **Al final de la sesión, actualizá este HANDOFF** si hay decisiones nuevas o si una spec cambió de versión.
10. **Si Bryam te pide saltar el proceso por urgencia o por "es simple", frená.** Tu rol es proteger el proceso, incluso de él.
11. **Si Bryam pide hablar más simple/suave**, sin jerga técnica, cumplir. No es programador.
12. **Si Bryam menciona cansancio o construcción lenta**, sugerí cortar y retomar con cabeza fresca antes de cerrar decisiones grandes.

### Frase de arranque que Bryam debe usar

> "Soy Bryam de AriadGSM. Te paso HANDOFF.md y archivos de specs. Trabajamos con proceso Plan → Design → Implement → Test → Review. **Si me proponés saltar alguna etapa, frename.**"

Si no usa esa frase, recordásela vos antes de avanzar.

---

## Sesiones previas (resumen mínimo)

- **Sesión 1-4:** mockups visuales de los 4 pasos cliente. Iteramos hasta cerrar diseño visual. Mockups validados pero no persistidos como archivo en sesiones 1-3.
- **Sesión 5:** definimos el método (8 piezas por spec). Spec completa de paso 1 cliente como piloto. Plan estratégico v1.1. Audit del repo. Spec inicial del operador FRP Express v1.0.
- **Sesión 6:** Bryam respondió las 8 Open Questions del operador FRP Express. Spec actualizada a v1.1 (38 AC, 0 OQ). Mockup actualizado con filtro VIP y columna de técnico.
- **Sesión 7 (cerrada):** 11 commits implementados. Operador FRP Express completo end-to-end (4 commits backend + 3 commits visuales + 1 commit feature + 3 sub-commits SSE). Tests pass. HANDOFF v1.3.
- **Sesión 8 (cerrada):** 1 commit + descubrimiento crítico. Audit del estado actual reveló que "16 bugs" estaba obsoleto (mayoría ya cerrados; reales: 7). B-001 implementado en `964413b`. Decisión Opción A sobre edge case EN_PROCESO. **B-008 descubierto** durante smoke test. 2 trampas evitadas: rediseño en caliente, audit como verdad final. HANDOFF v1.4.
- **Sesión 9 (cerrada parcialmente):**
  - **HANDOFF v1.5:** limpieza de referencias erróneas a "BryamsIA" (proyecto que no existía en este flujo).
  - **Análisis previo B-008** (Template A) verificó empíricamente la cadena de causas y evaluó los 3 fixes posibles. Confirmó que fix (b) — la "recomendación inicial" del HANDOFF — era inferior por dejar datos inconsistentes. Recomendó fix (a). Validó la regla "audit no es verdad final" / "verificación empírica antes de elegir".
  - **Implementación fix (a)** en commit `21e1790` (branch `feat-b008-fix`): 3 archivos, +14/-2 LOC. Tests 11/11 pass.
  - **Smoke test:** escenarios 1, 2, 3 ✅. Escenario 4 ⏳ pendiente (orden de prueba quedó en `LISTO_PARA_CONEXION` y bloquea creación de nuevas órdenes; se cierra en sesión 10).
  - **Hallazgo abierto:** flujo de comprobantes en panel operador. Bryam describió línea de tiempo de 4 pasos con etiquetas "sin verificar" / "verificado" / "listo para procesar". NO es regresión de B-008, es comportamiento pre-existente del flujo viejo descubierto al atravesar el flujo end-to-end.
  - **Inputs crudos registrados (NO decisiones):** sistema de alertas escaladas 1.5/3/5 min, propuesta de reemplazar lock de 15 min y timer paso 4 de 2 min, política de reembolso si precio cambia post-5min. Bryam reconoció cansancio. Quedan para spec formal en sesión dedicada.
  - **Trampa nueva registrada:** "Decisión nueva al final de sesión cansado". Agregada como regla #12.
  - **Aclaración explícita:** web local sin clientes reales, sin urgencia de lanzamiento. Cadencia de sesiones la define Bryam.
  - **HANDOFF v1.6** con todo lo anterior.

---

**Si tenés dudas que no podés resolver con este archivo + las specs, preguntale a Bryam directo. No improvises.**
