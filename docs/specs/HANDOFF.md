# HANDOFF — AriadGSM Portal Specs

**Para Claudes futuros que retomen este trabajo.** Si abrís un chat nuevo, leé este archivo primero, después abrí los otros archivos en `docs/specs/`. Después de eso, ya sabés todo lo necesario para continuar.

**Última actualización:** 4 de mayo 2026 · v1.12

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
| **"Mockup conceptual = spec lista para implementar"** | Bryam aporta un mockup que define un modelo nuevo (sesión 11: pantalla principal con 4 paneles paralelos). Tentación de saltar directo a implementación basándose en ese mockup. | El mockup es base conceptual, no spec con las 8 piezas. Antes de implementar: spec formal con estados, edge cases, responsive, comportamiento, datos, acceptance criteria, open questions. Sesión dedicada. |
| **"Interpretar de menos lo que dice el cliente y aplicar regla de pausa innecesariamente"** | Sesión 12: Bryam dijo "barra de procesados" refiriéndose a un elemento dentro de la card; Claude lo interpretó como un componente nuevo separado y declaró "regla #13 → pausar". Falsa contradicción. | Antes de aplicar reglas de pausa por descubrimiento, **pedir aclaración con preguntas concretas**. Mostrar 2-3 lecturas posibles del término ambiguo y dejar que el cliente confirme. Las reglas #13/#14 son para cambios reales de marco, no para malentendidos de vocabulario. Si la duda se resuelve con una pregunta, no hace falta pausar. |

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

## Modelo de uso del cliente — procesado en sesión 11, OQ cerradas en sesión 12

**Estado:** modelo conceptual cerrado en sesión 11. **Las 10 open questions cerradas en sesión 12.** Spec formal con las 8 piezas (mockup HTML, estados detallados, edge cases, responsive, comportamiento, datos, acceptance criteria) pendiente para sesiones 13-14. Ver `docs/specs/cliente/pantalla-principal-cliente.md` v1.0 con todas las decisiones integradas.

En sesión 10 se descubrió que el cliente no hace un flujo lineal de 4 pasos. En sesión 11 se procesó ese descubrimiento en frío y resultó ser más profundo de lo que parecía: la pantalla cliente no es una secuencia de pasos saltable, sino **una pantalla única con 4 paneles paralelos visibles a la vez** + una zona de "Mis órdenes" debajo. Bryam aportó dos mockups que sirvieron como fuente de verdad reference-driven.

### Los 4 modelos de uso identificados

**Modelo 1 — Agrupado (mayoría de los casos).** Cliente llega con 2+ equipos a la mano. Hace UN solo pedido con N equipos (cantidad en panel 2). Paga una vez, un comprobante. En panel operador aparece UNA orden con N equipos adentro. Si un equipo no es soportado se cancela ese individual; los demás siguen.

**Modelo 2 — Encadenado.** Cliente arranca con 1 equipo. Antes de pagar, le llega otro: simplemente sube cantidad en panel 2 (NO crea pedido nuevo, agranda el existente). Después de subir comprobante: paneles 1-2-3 congelados, no puede agrandar; tiene que terminar el ciclo (apretar botón panel 4 cuando técnico valide), recién ahí se descongela y puede arrancar pedido nuevo.

**Modelo 3 — Atajo de pago.** Cliente experto repetidor que conoce la dinámica. Va directo a panel 3 (Pago) sin tocar 1 ni 2. **Resuelto por el layout**: los 4 paneles visibles a la vez + preselección por perfil/última pill en panel 1 + cantidad por defecto en panel 2 = el cliente experto hace clic directo en panel 3. NO se necesita botón "pagar rápido" extra. **Refuerzo en sesión 12:** después de cerrar un pedido, panel 1 mantiene la última pill y panel 2 vuelve a 1 — pantalla queda lista para el siguiente pago.

**Caso 4 — Abortar orden.** Cliente final se arrepiente y se lleva el equipo. Técnico necesita cancelar una orden ya en seguimiento (puede haber pasado pago/conexión/ambos). Sucede pocas veces pero pasa. Resolución: botón "Abortar proceso" en cada card de Mis órdenes que esté activa. Confirmación previa con modal. Al ejecutar: notifica simultáneamente al técnico (alerta para detener trabajo) y al operador (registro). **Política de reembolso pausada** — input crudo del HANDOFF.

### Mecánica "congelar/descongelar"

Reemplaza al concepto viejo de "candados visibles". Mecanismo invisible:

1. Estado inicial: paneles 1-2-3 editables. Panel 4 con botón "Descargar Redirector v2.5" persistente.
2. Cliente sube comprobante en panel 3 → paneles 1-2-3 se **congelan**. Panel 3 dice "Comprobante recibido ✓". Panel 4 dice "Esperando validación…" + spinner.
3. Técnico revisa comprobante, dos caminos:
   - **Válido:** panel 3 cambia a "Comprobante validado ✓". Panel 4 muestra el botón **"Equipo conectado"**. Cliente lo aprieta → la orden **nace** y aparece en Mis órdenes con animación slide-in → paneles 1-2-3 se **descongelan** instantáneamente (panel 1 mantiene última pill, panel 2 vuelve a 1, panel 3 se limpia).
   - **Rechazado:** alerta inline en panel 3 con motivo (lista prefabricada + libre opcional) y comprobante rechazado visible con overlay "Rechazado". Paneles 1-2-3 se descongelan. Panel 4 NO se activa. Sin límite de reintentos.

### Concepto clave: cuándo "nace" una orden

**Una orden nace recién cuando el cliente aprieta el botón "Equipo conectado" del panel 4 con comprobante validado.** Antes de eso lo que existe es un "pedido en armado". La sección Mis órdenes muestra solo entidades que cruzaron ese umbral. Esto reemplaza la noción anterior (HANDOFF v1.7) de que "orden = lo que el cliente arrancó desde paso 1".

### Implicancias para decisiones firmes anteriores

- **Multi-orden** ("permitir nuevas EXCEPTO si hay órdenes en `ESPERANDO_PAGO` o `PAGO_RECHAZADO`"): **incompatible con el modelo nuevo**. Se reemplaza por la regla "mientras paneles 1-2-3 estén congelados, no se puede armar pedido nuevo". Las decisiones de sesión 12 confirman esto.
- **Timer paso 4 de 2 min:** sin cambios todavía. Cambia dónde vive (panel 4) pero no su lógica.
- **Lock pricing 15 min:** sin cambios todavía. Cruza con elementos pausados de la card de Mis órdenes ("precio asegurado", "vencimiento") — resolver en spec dedicada del sistema de tiempos.

---

## Plan de lanzamiento (decisión sesión 7, ratificado sesión 8, ajustado sesiones 10, 11 y 12)

Bryam eligió **Opción B**: lanzar con visual nuevo del cliente, no solo bugs arreglados. Estimación realista actualizada en sesión 12:

```
SESIÓN 7 (cerrada)
└── Operador FRP Express completo + cierre con archivos firmes ✅

SESIÓN 8 (cerrada)
└── B-001 fix paso 4 cliente (1 commit) + descubrimiento de B-008 ✅

SESIÓN 9 (cerrada parcialmente)
└── B-008 fix (crítico) ✅ + escenarios 1-3 smoke test ✅ + escenario 4 pendiente

SESIÓN 10 (cerrada parcialmente)
└── Escenario 4 B-008 PAUSADO (bloqueo técnico) + Spec paso 1 cliente 7/8 cerradas + descubrimiento modelo paralelo ✅

SESIÓN 11 (cerrada)
└── Modelo de uso del cliente procesado en frío ✅ + 4 modelos identificados ✅
    + descubrimiento "pantalla principal con 4 paneles paralelos" ✅
    + base conceptual `pantalla-principal-cliente.md` v0.1 ✅
    + pregunta #5 paso 1 cerrada en concepto ✅

SESIÓN 12 (cerrada)
└── 10 open questions cerradas ✅ (OQ-1 a OQ-10)
    + descubrimiento Redirector v2.5 rediseñado (descarga directa libre) ✅
    + comportamiento del estado en card de Mis órdenes definido ✅
    + 6 estados visibles del panel 4 documentados ✅
    + `pantalla-principal-cliente.md` v1.0 con todas las decisiones integradas ✅
    + sub-decisiones cruzadas trasladadas a specs futuras
      (panel operador, sistema de tiempos, política de reembolso) ✅

SESIÓN 13 (cerrada)
└── 3 specs formales con las 8 piezas: panel 1 + panel 2 + Mis órdenes ✅
    + Mockup HTML standalone consolidado pendiente para sesión 14
    + Decisiones cruzadas con panel operador, política de reembolso, panel 4

SESIÓN 14 (cerrada)
└── Spec del panel 3 ✅ + Spec del panel 4 ✅ + Mockup HTML standalone consolidado ✅
    + Actualización pantalla-principal-cliente v1.0 → v1.1 (OQ-8 reabierta y re-cerrada)
    + Decisiones cruzadas con Centro de configuración (Medios de pago) y panel operador

SESIÓN 15
└── Implementación de la pantalla principal completa (paneles + Mis órdenes
    + congelado/descongelado + Redirector descarga directa)

SESIÓN 16
└── QA final cliente rediseñado (incluye reintento escenario 4 B-008)

→ LANZAMIENTO (cadencia depende de Bryam — no hay urgencia comercial al ser local)
```

**Cadencia:** Bryam construye solo y atiende clientes en paralelo por WhatsApp. La cadencia de sesiones la define Bryam. No hay deadline real. En sesión 9 Bryam reconoció cansancio acumulado, lo que activó la trampa "Decisión nueva al final de sesión cansado". En sesión 10 se aplicó preventivamente la regla cuando apareció el descubrimiento del modelo paralelo. En sesión 11 se aplicaron las reglas #12 y #13 múltiples veces (recalibrar vocabulario, frenar ante descubrimientos nuevos, evitar improvisar diseño sobre mockup conceptual). En sesión 12 se aplicó regla #13 dos veces (Redirector + falsa contradicción de "barra de procesados") y se identificó trampa nueva #14 (interpretar de menos antes de aplicar regla de pausa). Claudes futuros: si notan a Bryam fatigado, sugieran cortar y retomar con cabeza fresca antes que insistir en cerrar.

**Si en sesiones futuras surge urgencia de lanzar antes** con cliente "feo pero funcional", se puede cambiar a Opción A (lanzar con cliente actual + bugs arreglados, postergar rediseño visual). La decisión no es irreversible.

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
- Spec `paso-1-precio.md` actualizada a v1.1 (reemplazada en sesión 13 por `panel-1-metodo-de-pago.md` v2.0)
- Descubrimientos registrados como inputs crudos
- Hallazgos abiertos nuevos identificados

### Implementado en sesión 11

**Nada nuevo en código.** Sesión exclusivamente conceptual / de descubrimiento:
- Procesamiento del modelo de órdenes paralelas en frío.
- Identificación de los 4 modelos de uso del cliente (agrupado, encadenado, atajo de pago, abortar orden).
- Descubrimiento del modelo "pantalla principal con 4 paneles paralelos + Mis órdenes" a partir de mockups aportados por Bryam.
- Concepto "congelar/descongelar" reemplaza al de "candados visibles".
- Concepto "cuándo nace una orden" definido (al apretar botón panel 4 con comprobante validado).
- Pregunta #5 del paso 1 cliente cerrada en concepto.
- Archivo nuevo `docs/specs/cliente/pantalla-principal-cliente.md` v0.1 (borrador inicial).
- 10 open questions identificadas para sesión 12 (OQ-1 a OQ-10).
- Plan de lanzamiento reorganizado: sesiones 12-15 redefinidas.

### Implementado en sesión 12

**Nada nuevo en código.** Sesión exclusivamente de spec/diseño:
- **Las 10 open questions cerradas** (OQ-1 a OQ-10).
- **Descubrimiento clave: Redirector v2.5 rediseñado** — descarga directa libre, instalador genérico, sin WhatsApp. Mockup 1 queda parcialmente desactualizado.
- **Botón principal del panel 4: "Equipo conectado"** (descartado "Conexión lista" tentativo).
- **Comportamiento del estado en card de Mis órdenes definido:** solo "En proceso" / "Finalizado", aparecen condicionalmente cuando técnico agarra el pedido, ubicación cerca de la barra de procesados (no esquina).
- **Card de Mis órdenes adaptativa** según cantidad de equipos (1 vs N).
- **Botón "Comprobante (PDF)" rebautizado** a "Recibo de operación".
- **Botón "Ayuda" descartado** de la card.
- **6 estados visibles del panel 4** documentados a lo largo del flujo.
- **Sub-decisiones cruzadas trasladadas a specs futuras:** panel operador (dropdown rechazo + abort + agarrar pedido), sistema de tiempos (precio asegurado/vencimiento), política de reembolso (qué pasa con dinero al abortar).
- **`pantalla-principal-cliente.md` v1.0** con todas las decisiones integradas.
- **Trampa nueva #14 identificada:** interpretar de menos lo que dice el cliente antes de aplicar regla de pausa innecesariamente.

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
- **B-008 (comprobante bloqueado)** — ✅ ARREGLADO sesión 9 (commit 21e1790). ⏸️ Escenario 4 pausado sesión 10 (control de no-regresión, requiere flujo cliente↔panel operador resuelto).

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

**Actualización sesión 12:** este hallazgo queda parcialmente integrado en las decisiones del modelo de pantalla principal. El comportamiento "card de Mis órdenes aparece al apretar 'Equipo conectado', cambia a 'En proceso' cuando técnico agarra" del lado cliente está definido. Falta la spec del lado operador (cómo se ven los comprobantes para revisar, cómo se agarran los pedidos, cómo se notifican los aborts). Va a la spec del panel operador en sesión 14+.

**Pendiente para spec del panel operador:**

- Vista de comprobantes para revisar (lista, validar/rechazar, dropdown de motivos + campo libre).
- Mecanismo "agarrar pedido" que cambia card cliente a "En proceso".
- Notificaciones de abort (alerta inmediata al técnico + registro al operador).
- Lista exacta de motivos de rechazo (lista preliminar definida: Monto incorrecto · Comprobante ilegible · Cuenta destino equivocada · Comprobante duplicado · Fecha inválida · Otros).

### Hallazgo sesión 10 — validación de precio que falló

Durante la conversación de sesión 10, Bryam mencionó que la validación de precio (la que rechaza precios fuera del rango 0.5 a 100 USDT) tuvo un fallo en algún momento. **No se entró en detalles** para no salir de scope.

**Pendiente:** investigar empíricamente cuándo falla, en qué archivo vive la validación, qué mensaje muestra al cliente. Sin detalles concretos hoy. Bryam recordará al retomar.

### Hallazgo sesión 10 — USDT real es Binance Pay, no transferencia TRC20 directa

**✅ RESUELTO en sesión 14.** La spec del panel 3 (`panel-3-datos-de-pago.md` v1.0) incorpora la corrección: el método se llama "Binance Pay" (no "USDT TRC20"), solo necesita Pay ID del titular, no dirección de wallet blockchain. Pill USDT del panel 1 sin red mencionada (decidido en sesión 13). Datos reales de Bryam: Binance Pay ID `564181591` · Beneficiario `Ariadgsm`.

**Lo que sigue como input crudo:** Bryam mencionó interés futuro en agregar QR de pagos (Yape ya tiene QR, Binance Pay también). En sesión 14 se confirmó que Yape Perú y Bancolombia tienen QR; México (STP) y Chile (Mercado Pago) no tienen QR todavía (Bryam investigando). Eso vive en la futura sub-sección "Medios de pago" del Centro de configuración.

### Hallazgo sesión 10 — mockup paso 1 necesita actualización antes de implementación

El mockup actual `paso-1-precio.html` cubre el estado "todo bien" pero no incluye los 2 estados nuevos decididos en sesión 10:

1. Pill desactivada con mensaje custom configurable (decisión #8).
2. Banner amarillo "El tipo de cambio cambió, monto actualizado" disparado por cambio manual del admin (decisión #2).

**Pendiente:** sesión chica de polish visual para agregar estos estados al mockup antes de implementación del paso 1 (que ahora es panel 1, sesión 13).

---

## Inputs crudos para spec futura

**Esta sección registra ideas y propuestas que Bryam compartió en chat pero NO son decisiones tomadas.** Quedan registradas para ser convertidas en spec formal en una sesión dedicada con cabeza fresca, mockups, fuentes externas e investigación. **NO implementar basándose en esta sección.** Si un Claude futuro va a trabajar en cualquiera de estos temas, primero debe abrir sesión dedicada para escribir spec con las 8 piezas.

### Modelo de órdenes paralelas y "liberación" del flujo (sesión 10) — ✅ PROCESADO en sesiones 11 y 12

*Procesado en frío en sesión 11 (modelos de uso + descubrimiento layout). Las 10 OQ cerradas en sesión 12. Detalle completo en `docs/specs/cliente/pantalla-principal-cliente.md` v1.0.*

**Lo que sigue pendiente como input crudo (no se procesó completamente):**

- **Sistema de tiempos y alertas escaladas** (1.5 / 3 / 5 min, cambio de precio post-5min, reembolsos): sigue siendo input crudo. **Detalles nuevos identificados en sesión 12:**
  - "Precio asegurado" y "vencimiento" en card de Mis órdenes — pausados en OQ-1, decidir cuando se haga la spec.
  - Posible duplicación entre el contador del panel 3 (lock pricing pre-pago) y el contador en card (lock pricing post-pago) — Bryam mismo lo detectó en sesión 12.
  - Pregunta abierta: ¿lock pricing aplica pre-pago, post-pago, ambos?
  - Caso borde "técnico desconectado" en validación de comprobante (espera anormalmente larga) — bloque para resolver acá.
  - Cierre formal en sesión futura, posiblemente entre 13 y 15 cuando se especifique el panel 4.
- **Lock pricing 5 vs 15 min:** sigue siendo input crudo. La decisión firme actual (15 min) sigue vigente hasta que la spec del sistema de tiempos lo redefina.

**Conflictos con decisiones firmes:**

- ~~Multi-orden actual ("permitir nuevas EXCEPTO si hay órdenes en `ESPERANDO_PAGO` o `PAGO_RECHAZADO`")~~ → **se reemplaza** por la regla congelar/descongelar. La decisión vieja queda derogada cuando la spec formal de pantalla principal entre en vigencia. Hasta entonces, el código sigue funcionando con la regla vieja.
- Timer paso 4 de 2 min: sigue firme.
- Lock pricing 15 min: sigue firme.

### Política de reembolso (sesión 9, ampliado en sesión 12 y 13)

*Pendiente de spec dedicada.*

**Lo que se sabe (ampliado en sesión 12):**

- Cuando un cliente abre el botón "Abortar proceso" de una card de Mis órdenes, hay que devolver/manejar el dinero pagado.
- En la versión inicial, el abort registra una solicitud que el operador procesa manualmente — no hay automatización todavía.
- Las preguntas que la spec dedicada debe responder:
  - ¿Reembolso automático en USDT/transferencia/Yape, o crédito interno para futuras órdenes?
  - ¿Hay diferencia entre abortar antes de que el técnico agarre vs durante "En proceso"?
  - ¿Hay tiempo límite o costo de cancelación?
  - ¿El abort dispara reembolso automático o requiere aprobación del operador?

**Ampliación sesión 13:** durante el diseño de Mis órdenes aparecieron decisiones cruzadas nuevas que la spec dedicada de política de reembolso debe responder:
- Cancelación individual de un equipo (cliente aprieta "Cancelar este equipo" en estado Pendiente): ¿reembolso parcial automático? ¿Crédito interno? ¿Manual por WhatsApp?
- Diferencia entre cancelar antes de "Esperando técnico" vs en cualquier otro estado.
- Modal "Pedir reembolso" post-finalización: ¿existe como segunda opción del menú 3 puntitos cuando la orden está finalizada?
- Campo del cliente para emitir el reembolso (datos bancarios, Yape, etc.): a definir.
- Subida del comprobante de reembolso desde el panel operador: a definir.
- El cliente ve el comprobante del reembolso en alguna parte: a definir.
- Bryam reconoció en sesión 13 que la mayoría de clientes maneja reembolsos por WhatsApp con él manualmente, lo que justifica diferir el flujo formal a sesión dedicada.

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
- Se cruza con el modelo de pantalla principal (sesiones 11-12).

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

> "Soy Bryam de AriadGSM. **No soy programador, hablame en español simple, sin jerga técnica.** Te paso HANDOFF.md y archivos de specs. Trabajamos con proceso Plan → Design → Implement → Test → Review. **Si me proponés saltar alguna etapa, frename.**"

La última oración es lo que da permiso explícito a frenarte si se apura. La frase de "no soy programador" es lo que mantiene el tono accesible. Sin esa frase, ambas reglas se debilitan.

**Práctica documentada (desde sesión 11):** además de la frase de arranque general, Bryam puede agregar **recordatorios específicos por sesión** que ayuden a anclar el foco. Ejemplos vistos:
- Sesión 11: "Sesión NO es de implementación. Es entrevista conceptual. Si me proponés tocar código, frename."
- Sesión 12: "Sesión NO es de implementación. Es spec/diseño. Las 10 OQ son el material a procesar. Si proponés cerrar otra cosa antes, frename."

Esos recordatorios son útiles cuando la sesión tiene un foco angosto que podría diluirse.

### 10. Validación profunda solo en QA integral
Durante implementación de Fase 1, smoke test rápido. Validación profunda recién cuando todos los bloques están cerrados.

### 11. Audit no es verdad final
Un audit de Claude Code es ayuda valiosa pero NO infalible. Smoke test es el último filtro.

### 12. Decisiones grandes en frío, nunca al final de sesión cansado
Si Bryam empieza a abrir decisiones grandes al final de una sesión larga, mientras estaba haciendo smoke test, o después de haber dicho que estaba cansado: **frenar**. Registrar como input crudo en HANDOFF, NO como decisión tomada.

### 13. Descubrimientos conceptuales a mitad de spec — pausar lo dependiente
Si durante la respuesta a una open question Bryam revela info nueva del modelo de negocio que cambia el marco (ej: sesión 10 — "los clientes hacen órdenes en paralelo"; sesión 11 — "la pantalla no es secuencia de pasos sino paneles paralelos"; sesión 12 — "el Redirector se rediseña como descarga directa libre"), **detectar las preguntas dependientes y pausarlas**. Cerrar las preguntas independientes que no toca el descubrimiento, registrar el descubrimiento como input crudo, y abrir spec dedicada en sesión siguiente. NO improvisar diseño encima del descubrimiento fresco.

### 14. Mockup conceptual no es spec lista para implementar
Cuando Bryam aporta un mockup que define un modelo nuevo (ej: sesión 11 — pantalla con 4 paneles paralelos + Mis órdenes), ese mockup es **base conceptual reference-driven**, no spec con las 8 piezas. Antes de implementar: spec formal con mockup HTML standalone, estados, edge cases, responsive, comportamiento, datos, acceptance criteria, open questions. Sesión dedicada. NO saltar de "Bryam mostró mockup" a "Claude Code implementá esto".

### 15. Recalibrar vocabulario cuando aparezcan términos divergentes
Si durante una sesión Claude usa una palabra (ej: "orden", "paso", "candado") y Bryam la entiende distinto, **frenar de inmediato y alinear vocabulario antes de seguir**. Las palabras que parecen sinónimas pero significan cosas distintas son fuente de malentendidos compuestos. Patrón aparecido en sesión 11: Claude decía "orden" desde el primer clic en paso 1; Bryam llamaba "orden" solo a lo que ya está en seguimiento (post comprobante validado). Recalibrar antes de avanzar.

### 16. Aclarar vocabulario ambiguo antes de aplicar regla #13
Sesión 12 trajo una variante de la regla #15: cuando Bryam usa un término que **podría** ser un descubrimiento conceptual nuevo o **podría** ser un malentendido de vocabulario, primero pedir aclaración con preguntas concretas (ej: "¿es X componente nuevo, o te referís a Y elemento existente?"), no aplicar regla #13 inmediatamente. Aplicar regla #13 sin aclarar genera **falsa contradicción**: pausar decisiones que en realidad estaban bien. Caso real sesión 12: Bryam dijo "barra de procesados", Claude lo interpretó como componente nuevo, declaró "regla #13 → pausar". En realidad era un elemento dentro de la card que ya existía con otro nombre. Bastaba con preguntar.

### 17. Iteraciones repetidas = señal de procesamiento incompleto en frío
Si un componente necesita 6+ iteraciones de mockup en una sola sesión para llegar a estilo aprobado, eso es señal de que el componente requiere procesamiento en frío en sesión dedicada. La card de Mis órdenes pasó por 8 iteraciones en sesión 13. Llegamos a buen puerto pero el patrón es marcador de fatiga. En sesiones futuras: si una card o componente importante lleva 4+ iteraciones, frenar y proponer corte para retomar con cabeza fresca, en lugar de seguir iterando hasta cerrar a fuerza de voluntad.

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
- Permitir nuevas EXCEPTO si hay órdenes en `ESPERANDO_PAGO` o `PAGO_RECHAZADO` *(propuesta de modelo paralelo en inputs crudos sesión 10 — procesada en sesión 11, OQ cerradas sesión 12)*
- **Sesión 11-12:** esta regla **se reemplaza** conceptualmente por la mecánica congelar/descongelar de paneles 1-2-3 cuando hay un comprobante en revisión o esperando que el cliente apriete el botón del panel 4. La nueva regla queda formalizada cuando la spec de pantalla principal cliente entre en vigencia (sesiones 13-15). Hasta entonces, el código existente sigue con la regla vieja.

### Timers cliente
- Paso 2: 30s banner azul, 90s banner amarillo
- Paso 4: 2 min sin apretar "Equipo conectado" → banner "🔧 ¿Listo para conectar?" *(propuesta de reemplazo en inputs crudos sesión 9 — no aprobada)*

### Mis Órdenes
- Solo aparece después que cliente apreta "Equipo conectado" (sesión 11) — **decisión refinada en sesión 12:** la card aparece con animación slide-in inmediata. El texto del estado dentro de la card aparece solo cuando técnico agarra el pedido.
- Activity log con eventos del cliente marcados con "(vos)" — **renombrado en sesión 12 a "Registro de actividad"**, solo aparece en cards de N≥2 equipos, integrado como expansión de la barra de procesados.
- Botón "Comprobante (PDF)" disabled hasta `FINALIZADO` — **renombrado en sesión 12 a "Recibo de operación"**, latinoamericano, mismo botón ya en código solo cambia el nombre.
- **Vista por defecto:** activas + finalizadas últimos 7 días. Resto en modal de historial accesible vía "Ver órdenes anteriores".
- **Actualización:** solo SSE automático, sin botón "Actualizar" manual.

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

### Paso 1 cliente — decisiones de sesión 10 + actualización sesión 11

**8 de 8 open questions cerradas (la #5 cerrada en concepto en sesión 11).** El contenido (pills, card estimado, decisiones #1-#8) se trasladó en sesión 13 a `docs/specs/cliente/panel-1-metodo-de-pago.md` v2.0 (reemplaza a `paso-1-precio.md` v1.1, deprecada y eliminada del repo). El "envoltorio" cambió: pasa de ser "spec de la pantalla paso 1" a ser "spec del panel 1 dentro de la pantalla principal" con las 8 piezas formales.

- **#1 Detección de país:** preselección desde **perfil del cliente registrado**. NO se usa IP en el modo con login. Cloudflare `cf-ipcountry` queda reservado para el "modo express sin login" futuro (input crudo separado).
- **#2 Tasa de cambio USDT → moneda local:** **manual desde Centro de configuración** (sub-sección "Tasa de cambio manual"). NO se usa fuente externa (CoinGecko, Binance API, etc. descartadas). Cuando admin actualiza la tasa, el cliente que está mirando paso 1 ve el monto cambiar en vivo.
- **#3 Polling de tasa:** **anulada**. No hay fuente externa que pollear.
- **#4 Costo unitario:** fijo en USDT, mismo para los 5 destinos. Rango real actual 3.0–5.5 USDT por equipo. Configurable por admin (corregir spec — el ejemplo de 6.25 USDT está desactualizado).
- **#5 Vista en desktop:** **cerrada en concepto en sesión 11.** La respuesta es: en desktop, panel 1 es una columna dentro de la pantalla principal con 4 paneles paralelos. NO sidebar separada. Mis órdenes ocupa ancho completo abajo. Spec del panel 1 con las 8 piezas se desarrolla en sesión 13.
- **#6 Persistencia entre sesiones:** **recordar última pill elegida**, no siempre la del perfil. Si el cliente peruano elige USDT, la próxima vez que entra ve USDT preseleccionado. Si elige Perú de nuevo, vuelve a Perú. La pantalla "aprende" de la última elección.
- **#7 Aclaración TRC20 en pill USDT:** NO mostrar TRC20 en paso 1. Pill muestra solo "USDT" + logo Tether (verde, ya está en mockup).
- **#8 Desactivar métodos de pago:** Sí. Vive en pestaña nueva del panel admin (NO en "Precios"). Cambio se refleja en vivo (sin recargar). Mensaje al cliente es **configurable**: por defecto "No disponible temporalmente", pero admin puede escribir texto custom (ej. "USDT vuelve mañana 9 AM").

**Banner amarillo nuevo:** cuando admin actualiza la tasa desde Centro de configuración, en la pantalla del cliente aparece un banner amarillo "El tipo de cambio cambió, monto actualizado". Reemplaza al edge case 9 original que se disparaba por cambio >2% en API externa.

### Pantalla principal cliente — decisiones de sesión 12 (las 10 OQ)

Las decisiones detalladas viven en `docs/specs/cliente/pantalla-principal-cliente.md` v1.0. Resumen ejecutivo:

**Mecánica del flujo principal (bloque A):**
- Botón principal del panel 4 (post-validación, pre-clic): **"Equipo conectado"**.
- Indicador de espera: combo panel 3 ("Comprobante recibido ✓") + panel 4 ("Esperando validación…" con spinner). Sin tiempo estimado al cliente. Sin opción de cancelar.
- Comprobante rechazado: alerta inline en panel 3, comprobante visible con overlay rojo "Rechazado", motivo de lista prefabricada + libre opcional, sin límite de reintentos.
- Transición al apretar "Equipo conectado": paneles instantáneos, card en Mis órdenes con animación slide-in. **Sin banner "Pago confirmado…"** (panel 3 ya cubre con "Comprobante validado ✓").
- Al descongelarse: panel 1 mantiene última pill, panel 2 vuelve a 1, panel 3 se limpia.

**Mis órdenes (bloque B):**
- Composición de card adaptativa: 1 equipo simplificada / N equipos con Registro de actividad expandible.
- Botón "Comprobante (PDF)" rebautizado a **"Recibo de operación"**.
- Botón "Ayuda" descartado.
- Estado en card: solo "En proceso" / "Finalizado", aparecen cuando técnico agarra, cerca de la barra de procesados (no esquina).
- Vista por defecto: activas + finalizadas últimos 7 días + indicador "Ver órdenes anteriores" en modal con historial completo.
- 2 cards completas visibles en desktop antes de scroll.
- Abortar proceso: solo en estados activos, modal de confirmación, notifica a técnico + operador. Política de reembolso pausada.

**Integraciones (bloque C):**
- Actualización en vivo: solo SSE automático, sin botón manual.
- Login previo confirmado, sin onboarding, mensaje vacío simple para clientes sin órdenes.
- **Redirector v2.5 rediseñado:** descarga directa, instalador genérico, descarga libre, persistente en panel 4 en TODOS los estados. Texto del botón: "Descargar Redirector v2.5". Reemplaza al modelo viejo de "envío por WhatsApp".

### Pantalla principal cliente — decisiones de sesión 13 (specs panel 1, panel 2, Mis órdenes)

Las decisiones detalladas viven en los 3 archivos nuevos. Resumen ejecutivo:

**Panel 1 (Método de pago):**
- Reescribe `paso-1-precio.md` v1.1 como spec de panel dentro de pantalla principal.
- Sin botón Continuar.
- Pills con banderas circulares y border-radius completo.
- Orden nuevo: Perú · USDT · México (fila 1), Colombia · Chile (fila 2).
- Tooltip pill desactivada → cajón amarillo dentro de la card oscura, solo al click.
- Cajones amarillos: cambio de tasa dura 15s, USDT pausado dura 4s.
- Si dos cajones se cruzan: prevalece el primero.
- Panel congelado: pierde clicks sin cambio visual.

**Panel 2 (Solicitud):**
- Cantidad por defecto 2, mínimo 1, máximo 10.
- Stepper editable a mano (cliente puede tipear).
- Cap automático a 10 + aviso verde de WhatsApp si supera, dura 15s.
- 5 modelos no soportados: A3, A3X, A2, Redmi Note 12S, A5 + codenames.
- Validación de modelo nunca bloquea.

**Mis órdenes:**
- Card unificada para 1 y N equipos (mismo patrón siempre).
- Sin barra de procesados general; en su lugar lista de equipos individuales.
- 4 estados por equipo: Pendiente, Esperando técnico, En proceso, Finalizado.
- Botón "Equipo listo" en cada equipo Pendiente.
- Botón "Cancelar este equipo" enmarcado en cada equipo Pendiente.
- Sin botón "Abortar proceso" general; menú 3 puntitos al pie con "Abortar pedido".
- Cuando todo finaliza: 3 puntitos desaparecen + Recibo se activa.
- Bandera del país en header como decoración.
- Sin conversión a USDT en el header.
- Modal de abortar: "Te contactamos por WhatsApp para procesar el reembolso. No es reversible."
- Modal de historial: search + paginación + cards compactas.
- Estado vacío: "Aún no tenés órdenes. Tu primera orden aparecerá acá."
- Banner ámbar arriba si SSE se cae.

### Centro de configuración (panel admin) — spec futura sesión 10, ampliada sesión 12

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

**Funcionalidad nueva del panel operador identificada en sesión 12** (no del Centro de configuración pero relacionada):

- **Dropdown de motivos de rechazo de comprobante** + campo libre opcional. Lista preliminar: Monto incorrecto · Comprobante ilegible · Cuenta destino equivocada · Comprobante duplicado · Fecha inválida · Otros.
- **Mecanismo "agarrar pedido"** que cambia card cliente a "En proceso".
- **Notificaciones de abort** — alerta inmediata al técnico, registro al operador.
- **Generación del "Recibo de operación"** — botón ya existe en código, solo cambia el nombre.

Estas piezas van a la spec del panel operador (sesión 14+).

**Prioridad sugerida:** "Tasa de cambio manual" y "Métodos de pago" son las primeras necesarias porque son dependencias del panel 1 cliente. El resto puede esperar.

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
- **`HANDOFF.md`** — este archivo. Bridge entre sesiones. **Versión actual: v1.10.**
- **`audit-template.md`** — template para auditar el repo con Claude Code.
- **`_template-prompt-claude-code.md`** — templates obligatorios para prompts a Claude Code.
- **`_brand-tokens-pendiente.md`** — placeholder para sesión de polish visual con logo.
- **`_costos-frp-redesign-pendiente.md`** — placeholder para rediseño visual interno de Costos FRP.

### `docs/specs/cliente/`
- **`pantalla-principal-cliente.md`** — modelo de pantalla principal cliente con 4 paneles paralelos + Mis órdenes. **Versión actual: v1.1 (sesión 14).** 10 OQ originales cerradas en sesión 12; OQ-8 reabierta y re-cerrada en sesión 14. Las specs por panel (1, 2, 3, 4) y Mis órdenes con las 8 piezas formales viven en archivos separados.
- **`panel-1-metodo-de-pago.md`** — spec del panel 1 (Método de pago) dentro de la pantalla principal cliente. **Versión actual: v2.0 (sesión 13).** Reemplaza a `paso-1-precio.md` v1.1 (deprecada y eliminada del repo). 8 piezas formales completas. 3 OQ-residuales cerradas en la misma sesión.
- **`panel-2-solicitud.md`** — spec del panel 2 (Solicitud) dentro de la pantalla principal cliente. **Versión actual: v1.1 (sesión 15).** 9 piezas formales completas (v1.1 agrega §8 "Descuentos por volumen"). 2 OQ-residuales abiertas (comportamiento del aviso si cliente sube/baja cantidad varias veces, codenames blue/water ausentes del catálogo backend).
- **`panel-3-datos-de-pago.md`** — spec del panel 3 (Datos de pago) dentro de la pantalla principal cliente. **Versión actual: v1.0 (sesión 14).** 8 piezas formales completas. Incluye corrección USDT/Binance Pay vs TRC20. 4 OQ-residuales abiertas (imágenes QR pendientes, QR de México y Chile pendientes, comportamiento de timeout largo, lista final de motivos de rechazo).
- **`panel-4-conexion.md`** — spec del panel 4 (Conexión) dentro de la pantalla principal cliente. **Versión actual: v1.0 (sesión 14).** 8 piezas formales completas. Incluye modal "¿Dónde pegar estos códigos?" con captura real del Redirector. 4 OQ-residuales abiertas (captura reemplazable, formato compacto del Technician ID/Código, comportamiento mobile, texto explicativo de polish).
- **`mis-ordenes.md`** — spec de la zona "Mis órdenes" debajo de los 4 paneles paralelos. **Versión actual: v1.0 (sesión 13).** 8 piezas formales completas. 7 OQ-residuales abiertas para sesión 14+ y para spec dedicada de política de reembolso.
- **`mockups/paso-1-precio.html`** — mockup HTML standalone responsive del paso 1. **Pendiente actualización** con 2 estados nuevos (pill desactivada con mensaje custom + banner amarillo de tasa cambiada). Sesión chica futura antes de implementación. **Probablemente deprecado** ahora que existe el mockup consolidado de la pantalla principal completa.
- **`mockups/pantalla-principal-cliente.html`** — **CREADO en sesión 14.** Mockup HTML standalone consolidado de la pantalla principal completa con los 4 paneles + Mis órdenes. Cubre 5 escenarios visuales (estado inicial, comprobante en validación, validado pre-clic, orden activa con 3 equipos, comprobante rechazado) + vista mobile + modal "¿Dónde pegar estos códigos?". Listo para servir como referencia visual a sesión 15 de implementación. **Nota:** la captura del Redirector está simulada en SVG; reemplazar por la imagen real `1777861729916_image.png` cuando Bryam la suba al repo (sugerencia: `public/images/redirector-screenshot.png`).

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

### Sesión 15 (próxima)

**Foco:** implementación de la pantalla principal completa (paneles + Mis órdenes + congelado/descongelado + Redirector descarga directa).

**Procedimiento sugerido:**

1. Releer las 6 specs cerradas (`pantalla-principal-cliente.md` v1.1, `panel-1-metodo-de-pago.md` v2.0, `panel-2-solicitud.md` v1.0, `panel-3-datos-de-pago.md` v1.0, `panel-4-conexion.md` v1.0, `mis-ordenes.md` v1.0) y el mockup HTML consolidado para tener marco completo.
2. Análisis previo (Template A) con Claude Code antes de tocar código. Identificar archivos a tocar, dependencias, riesgos.
3. Implementación en sub-commits por área (15a paneles 1-2, 15b panel 3, 15c panel 4, 15d Mis órdenes, 15e congelado/descongelado, etc.).
4. Smoke test al cierre de cada sub-commit.
5. Es probable que esto se parta en múltiples sesiones (15a, 15b, 15c) por tamaño.

**No es:** sesión de spec/diseño. Las specs ya están cerradas. Implementación pura.

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
- Hallazgo flujo de comprobantes en panel operador (parcialmente integrado en spec de pantalla principal sesiones 11-12, falta lado operador para sesión 14)
- Sistema de alertas/lock/reembolso (requiere spec formal antes de implementar)
- **Modo express sin login** (línea de producto futura, requiere spec formal)
- **Centro de configuración** (panel admin con 8 sub-secciones, cada una requiere spec)
- **Validación de precio que falla** (investigar y arreglar — hallazgo sesión 10)
- **Polish visual mockup paso 1** (estados nuevos antes de implementación)

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

### Sesión 11 — vocabulario divergente entre Claude y Bryam ("orden", "paso", "candado")
- **Qué pasó:** Durante la entrevista para entender el modelo de uso, Claude usaba "orden" desde el primer clic en paso 1. Bryam llamaba "orden" solo a lo que ya estaba en seguimiento (post comprobante validado). Igual con "paso" (Claude lo entendía secuencial, Bryam lo entendía como paneles paralelos) y "candado" (Bryam lo descartó como anticuado).
- **Por qué fallaba el camino fácil:** Si Claude seguía haciendo preguntas con su vocabulario, las respuestas de Bryam iban a sonar incoherentes y se acumulaba ruido. Cada pregunta nueva agravaba el malentendido.
- **Cómo se manejó:** Bryam frenó explícitamente ("recalibremos por que no te entendí"). Claude paró, registró el malentendido, pidió definiciones a Bryam ("¿en qué momento exacto, para vos, ya hay orden?"), y ajustó vocabulario antes de seguir.
- **Lección:** Cuando palabras parecen sinónimas pero las dos partes las usan distinto, el costo del malentendido crece compuesto. **Recalibrar de inmediato.** Agregada como regla #15.

### Sesión 11 — descubrimientos múltiples a mitad de entrevista (modelo "atajo de pago" + "abortar orden")
- **Qué pasó:** Mientras se procesaba el modelo paralelo de sesión 10, aparecieron dos modelos más que no estaban en el HANDOFF: clientes expertos que saltan paso 1 y 2, y casos de aborto por arrepentimiento del cliente final.
- **Por qué fallaba el camino fácil:** Si Claude seguía con el plan original de 5 etapas (mockup → conflictos → cerrar #5), iba a estar diseñando sobre 4 modelos pero solo entendiendo 1. Mismo patrón que la trampa #12 pero apareció dos veces seguidas.
- **Cómo se manejó:** Claude paró, propuso 3 opciones (seguir plan original / cambiar plan a "solo entender modelos de uso" / otra), Bryam eligió cambiar plan. Sesión 11 dedicada entera a entender modelos. Resultado: 4 modelos identificados, mockup de Bryam, archivo conceptual nuevo.
- **Lección:** Cuando aparecen 2+ descubrimientos seguidos en una sesión, **el plan de la sesión cambia, no se fuerza el original**. Cambio de plan en frío durante la sesión es válido si Bryam lo aprueba.

### Sesión 11 — mockup conceptual de Bryam evita 2-3 sesiones de mockup iterativo
- **Qué pasó:** Después de varios intentos de Claude por hacer preguntas dirigidas para entender el layout, Bryam aportó un mockup hecho por él mostrando el modelo de 4 paneles paralelos.
- **Por qué fue valioso:** El mockup respondió en 30 segundos lo que las preguntas dirigidas no podían capturar. Aplica regla #1 (reference-driven design — los mockups visuales son fuente de verdad).
- **Lección:** Si el cliente puede aportar un mockup, dejar que lo aporte antes que insistir con preguntas. Las preguntas dirigidas funcionan cuando el modelo mental ya está claro; cuando no lo está, el mockup es más rápido. **Pero ojo:** el mockup conceptual NO es spec lista para implementar (regla #14 nueva). Sigue requiriendo las 8 piezas formales después.

### Sesión 12 — descubrimiento Redirector v2.5 rediseñado durante OQ-4
- **Qué pasó:** Mientras se procesaba OQ-4 (texto del botón panel 4 con comprobante validado), Bryam reveló que el Redirector se rediseña: ya no se entrega por WhatsApp, ahora es descarga directa desde la web, con instalador genérico y descarga libre. Esto invalida parcialmente el Mockup 1 + cambia la dependencia entre OQ-4 y OQ-10.
- **Por qué fallaba el camino fácil:** Si Claude seguía cerrando OQ-4 con un texto cualquiera de botón ("Iniciar conexión", etc.) sin entender el rediseño del Redirector, estaba diseñando sobre supuestos viejos. La OQ-10 (botón Solicitar Redirector) hubiera salido contradictoria.
- **Cómo se manejó:** Claude aplicó regla #13: pausó OQ-4, identificó las cosas afectadas (Mockup 1, OQ-4, OQ-10, OQ-5, spec del panel 4, spec del Redirector), preguntó si era decisión firme o algo en exploración. Bryam confirmó decisión firme. Claude registró el rediseño, recalibró el marco, y volvió a OQ-4 con info correcta. Resultado: "Equipo conectado" como botón, "Descargar Redirector v2.5" persistente en panel 4 (OQ-10 cerrada acá mismo).
- **Lección:** Cuando aparece un cambio de marco firme tomado por el cliente fuera de sesión, integrar el cambio antes de seguir. Y aprovechar para cerrar las OQ que dependían: OQ-10 se cerró 8 OQ antes de lo previsto.

### Sesión 12 — falsa contradicción al interpretar de menos lo que dijo Bryam ("barra de procesados")
- **Qué pasó:** Durante OQ-1 sub-1 (composición de la card de Mis órdenes), Bryam dijo que el estado debería ir "debajo de la barra de procesados o arriba", no en una esquina. Claude interpretó "barra de procesados" como un componente nuevo separado del archivo y declaró regla #13 ("nuevo descubrimiento conceptual, pausar"). Bryam clarificó con una imagen: "barra de procesados" era el elemento de progreso DENTRO de la card, no un componente nuevo. Falsa contradicción.
- **Por qué fallaba el camino fácil:** Aplicar regla #13 sin clarificar generó sobre-pausa. La consecuencia inmediata: Claude creyó que dos decisiones del bloque A (OQ-5 sub-2 animación de card y OQ-5 sub-3 sin banner) quedaban invalidadas. En realidad seguían válidas.
- **Cómo se manejó:** Bryam aportó una imagen de la card con el elemento marcado en rojo. Claude reconoció el error de interpretación, aplicó la lectura correcta (la card aparece desde el nacimiento, solo el texto del estado es condicional), y siguió. No hubo daño porque se detectó rápido.
- **Lección:** Antes de aplicar reglas de pausa por descubrimiento, **pedir aclaración con preguntas concretas**. Mostrar 2-3 lecturas posibles del término ambiguo. Si el cliente puede aportar imagen, dejar que la aporte. Las reglas #13/#14 son para cambios reales de marco, no para malentendidos de vocabulario. Agregada como trampa nueva #14 y regla #16.

### Sesión 12 — pausa preventiva de "precio asegurado" + "vencimiento" por cruce con spec futura
- **Qué pasó:** Durante OQ-1 (composición de la card), aparecieron dos elementos del Mockup 2 ("precio asegurado" y "vencimiento") que cruzaban con el input crudo del HANDOFF "lock pricing 5 vs 15 min". Bryam mismo detectó que había duplicación con el contador del panel 3 y dijo no recordar bien por qué los puso.
- **Por qué fallaba el camino fácil:** Si Claude cerraba esos elementos con un texto cualquiera ("muestra precio + countdown de 5 min"), estaba decidiendo política de negocio que NO le tocaba a OQ-1 sino a la spec del sistema de tiempos.
- **Cómo se manejó:** Claude aplicó regla #14 (detectar dependencias con specs futuras), pausó los dos elementos, identificó las preguntas a resolver en la spec dedicada (¿lock pre-pago, post-pago, ambos? ¿caso técnico desconectado?), y cerró OQ-1 con los 5 elementos maduros + 2 pausados. Bryam aceptó.
- **Lección:** Aplicación correcta y limpia de regla #14. La spec futura del sistema de tiempos hereda los pendientes acumulados.

### Sesión 12 — pausa de OQ-3 sub-2 por cruce con política de reembolso
- **Qué pasó:** OQ-3 sub-2 preguntaba qué pasa con el dinero al abortar. Cruza directamente con el input crudo "política de reembolso" del HANDOFF.
- **Cómo se manejó:** Claude pausó la sub-2 con justificación clara, registró las preguntas a resolver en la spec dedicada (¿reembolso automático? ¿crédito interno? ¿diferencia por estado?), y siguió con sub-3 y sub-4. Resultado: OQ-3 cerrada parcialmente, dinero queda como solicitud manual procesada por operador hasta que la política se defina.
- **Lección:** Aplicación correcta y limpia de regla #14, igual que con "precio asegurado". Las specs futuras heredan pendientes.

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
14. **Si Bryam aporta un mockup conceptual**, tratalo como base reference-driven, no como spec lista para implementar. La spec con las 8 piezas viene después.
15. **Si una palabra parece estar generando malentendido** (ej: "orden", "paso"), recalibrar vocabulario explícitamente antes de seguir. Pedir definición a Bryam, registrarla, usar la suya.
16. **Si un término que dijo Bryam podría ser un descubrimiento conceptual o un malentendido de vocabulario**, primero pedir aclaración con preguntas concretas. No aplicar regla #13 inmediatamente. Si la duda se resuelve con una pregunta, no hace falta pausar.

### Frase de arranque que Bryam debe usar

> "Soy Bryam de AriadGSM. **No soy programador, hablame en español simple, sin jerga técnica.** Te paso HANDOFF.md y archivos de specs. Trabajamos con proceso Plan → Design → Implement → Test → Review. **Si me proponés saltar alguna etapa, frename.**"

Si no usa esa frase, recordásela vos antes de avanzar. Bryam puede agregar **recordatorios específicos por sesión** (ver regla #9) cuando la sesión tiene un foco angosto.

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
- **Sesión 11 (cerrada):**
  - **Modelo de uso del cliente procesado en frío.** Sesión exclusivamente conceptual.
  - **4 modelos de uso identificados:** agrupado, encadenado, atajo de pago, abortar orden.
  - **Descubrimiento clave:** la pantalla cliente NO es secuencia de pasos; es **pantalla única con 4 paneles paralelos visibles + Mis órdenes debajo**. Bryam aportó 2 mockups que sirvieron como fuente de verdad.
  - **Mecánica "congelar/descongelar"** reemplaza al concepto de candados. Concepto "cuándo nace una orden" (botón panel 4 con comprobante validado) definido.
  - **Pregunta #5 paso 1 cerrada en concepto** (panel 1 = columna en pantalla principal, sin sidebar separada).
  - **Archivo nuevo:** `docs/specs/cliente/pantalla-principal-cliente.md` v0.1 (borrador).
  - **10 open questions identificadas** (OQ-1 a OQ-10) para sesión 12.
  - **Plan de lanzamiento reorganizado:** sesiones 12-15 redefinidas con foco en pantalla principal en lugar de paso por paso individual.
  - **Decisión multi-orden** (HANDOFF v1.7) **se reemplaza** conceptualmente por la regla congelar/descongelar. Cierre formal cuando spec de pantalla principal entre en vigencia.
  - **Aplicaciones correctas de reglas #12, #13 múltiples veces:** cambio de plan en frío durante la sesión, recalibrar vocabulario, no improvisar sobre descubrimientos frescos.
  - **Reglas y trampas nuevas:** regla #14 (mockup conceptual ≠ spec lista), regla #15 (recalibrar vocabulario), trampa #13 (mockup conceptual = spec lista para implementar).
  - **Ajuste menor pendiente:** mover "no soy programador, hablame simple" a frase de arranque obligatoria + agregar patrón de "recordatorios específicos por sesión" como práctica documentada. Aplicar al inicio de sesión 12.
  - **HANDOFF v1.8.**
- **Sesión 12 (cerrada):**
  - **10 open questions cerradas** (OQ-1 a OQ-10). Sesión exclusivamente de spec/diseño, sin código.
  - **Decisiones del bloque A (mecánica del flujo):** OQ-4 ("Equipo conectado"), OQ-5 (transición visual con 5 sub-decisiones), OQ-7 (comprobante rechazado con 4 sub-decisiones), OQ-8 (espera del técnico con 3 sub-decisiones).
  - **Decisiones del bloque B (Mis órdenes):** OQ-1 (composición y layout adaptativos por cantidad de equipos), OQ-2 (modelo del historial: 7 días + modal), OQ-3 (abortar proceso con 4 sub-decisiones, dinero PAUSADO).
  - **Decisiones del bloque C (integraciones):** OQ-6 (solo SSE, sin botón manual), OQ-9 (login confirmado, sin onboarding, mensaje vacío simple), OQ-10 (Redirector descarga directa persistente).
  - **Descubrimiento clave: Redirector v2.5 rediseñado** — descarga directa libre, instalador genérico, sin WhatsApp. Mockup 1 queda parcialmente desactualizado.
  - **Comportamiento del estado en card de Mis órdenes redefinido:** solo "En proceso"/"Finalizado", aparece cuando técnico agarra, ubicación cerca de barra de procesados.
  - **Card de Mis órdenes adaptativa** según cantidad de equipos (1 vs N), con Registro de actividad expandible solo en N≥2.
  - **Botón "Comprobante (PDF)" rebautizado** a "Recibo de operación" (latinoamericano).
  - **6 estados visibles del panel 4** documentados a lo largo del flujo.
  - **Sub-decisiones cruzadas trasladadas a specs futuras:** panel operador (dropdown rechazo + abort + agarrar pedido + Recibo de operación), sistema de tiempos (precio asegurado, vencimiento, caso técnico desconectado), política de reembolso (qué pasa con dinero al abortar).
  - **Aplicaciones correctas de regla #13 dos veces:** descubrimiento Redirector + falsa contradicción "barra de procesados" (esta última identificada como trampa nueva).
  - **Aplicaciones correctas de regla #14 dos veces:** pausa de "precio asegurado"/"vencimiento" por cruce con sistema de tiempos, pausa de OQ-3 sub-2 por cruce con política de reembolso.
  - **Reglas y trampas nuevas:** trampa #14 (interpretar de menos antes de aplicar regla de pausa), regla #16 (aclarar vocabulario ambiguo antes de aplicar regla #13).
  - **Archivo actualizado:** `docs/specs/cliente/pantalla-principal-cliente.md` **v1.0** con todas las decisiones integradas.
  - **HANDOFF v1.9.**
- **Sesión 13 (cerrada):**
  - 3 specs formales con las 8 piezas entregadas: panel 1, panel 2 y Mis órdenes. Sesión enteramente de spec/diseño, sin código.
  - **Panel 1 (Método de pago):** archivo nuevo `docs/specs/cliente/panel-1-metodo-de-pago.md` v2.0 que reemplaza al viejo `paso-1-precio.md` v1.1. Cambios principales: sin botón Continuar, sin numeración del header, pills con banderas circulares, pills con border-radius completo, orden nuevo (Perú/USDT/México arriba, Colombia/Chile abajo), sin candado visible, tooltip de pill desactivada se mueve a cajón amarillo dentro de la card oscura (mismo lugar que cambio de tasa), tooltip aparece solo al click (no al hover), banner cambio de tasa dura 15s, banner USDT pausado dura 4s. 3 OQ-residuales cerradas en la misma sesión: prevalece el primer cajón amarillo cuando dos coinciden, panel congelado pierde clicks sin cambio visual, mensaje default "No disponible temporalmente" se mantiene.
  - **Panel 2 (Solicitud):** archivo nuevo `docs/specs/cliente/panel-2-solicitud.md` v1.0. Decisiones nuevas: cantidad por defecto 2, mínimo 1, máximo 10. Stepper -/n/+ con input numérico editable a mano (cliente puede tipear directo, no solo botones). Si cliente tipea >10, sistema lo cap a 10 + muestra aviso verde "Para más de 10 equipos, contactanos por WhatsApp" con ícono WhatsApp, dura 15s o desaparece si baja a 10. Si tipea <1 o vacío, sistema lo lleva a 1. Botón + se desactiva al llegar a 10. Solo dígitos aceptados. Validación de modelo opcional con 3 estados (apto: borde verde + check; no soportado: borde rojo + cajón amarillo "Este modelo no es soportado"; no reconocido: borde rojo + cajón amarillo "No reconocemos el modelo, revisalo o dejalo vacío"). 5 modelos no soportados: A3, A3X, A2, Redmi Note 12S, A5 (más sus codenames internos: blue, klein, water, serenity, sea/ocean — los dos primeros pendientes de agregar al catálogo backend, OQ-R3 del panel 2). Validación nunca bloquea. Cajones duran 15s o desaparecen si cliente corrige. 2 OQ-residuales abiertas: comportamiento si cliente sube/baja cantidad varias veces, codenames blue/water ausentes del catálogo backend.
  - **Mis órdenes:** archivo nuevo `docs/specs/cliente/mis-ordenes.md` v1.0. Cambios importantes respecto a sesión 12 (`pantalla-principal-cliente.md`): card unificada para 1 y N equipos (no más adaptativa), sin barra de procesados general, sin Registro de actividad expandible, lista de equipos individuales con 4 estados visibles por equipo (Pendiente, Esperando técnico, En proceso, Finalizado). Mecánica nueva: el equipo 1 se asume conectado al apretar "Equipo conectado" del panel 4; los equipos 2..N empiezan en Pendiente y el cliente debe apretar "Equipo listo" después de conectar físicamente cada uno. Botón "Cancelar este equipo" enmarcado en cada equipo Pendiente para cancelación individual. Sin botón "Abortar proceso" general cuando hay 2+ equipos. Menú 3 puntitos al pie con la opción "Abortar pedido" (que internamente solicita reembolso). Bandera del país en el header como decoración visual. Sin conversión a USDT en el header (redundante). Cuando toda la orden finaliza, los 3 puntitos desaparecen y el botón "Recibo de operación" se activa. 7 OQ-residuales abiertas para sesión 14+ y para spec dedicada de política de reembolso.
  - **Decisiones cruzadas registradas:** spec del panel 4 sin cambios (botón "Equipo conectado" sigue creando la orden); spec del panel operador con cambio importante (debe procesar equipos individuales dentro del pedido, no el pedido como block); spec de política de reembolso sigue pausada con preguntas ampliadas (cancelación individual de equipo, reembolso parcial, datos bancarios del cliente, comprobante del operador subido, etc.).
  - **Aplicaciones correctas de regla #13 (descubrimientos conceptuales):** durante el diseño de Mis órdenes aparecieron tres descubrimientos grandes (lista de equipos en lugar de barra, mecánica de "Equipo listo" + "Cancelar este equipo" individual, flujo completo de reembolso). Los dos primeros se procesaron en sesión integrando las decisiones; el tercero se frenó explícitamente con regla #13 + trampa #12 ("mockup conceptual = spec lista") porque la política de reembolso está pausada.
  - **Aplicación correcta de trampa #11 (decisión nueva al final de sesión cansado):** al cierre, cuando Bryam abrió el flujo completo de reembolso (campo, comprobante del operador, cliente lo ve), Claude frenó el diseño UI sobre proceso no definido, ofreció dejar la opción "Pedir reembolso" registrada como pendiente y manejarla manualmente por WhatsApp en versión inicial.
  - **Trampa nueva identificada:** "iteraciones repetidas sobre un mismo componente al final de sesión = señal de que el componente necesita procesamiento en frío en sesión dedicada". Aparece como trampa #15 propuesta. La card de Mis órdenes pasó por 8 iteraciones en una sola sesión, lo que es señal de que el componente requería más tiempo de gestación que el disponible al final de sesión 13. Las iteraciones llegaron a buen puerto pero el patrón es marcador de fatiga. Quedó capturado como regla #17 nueva en "Cómo trabajamos".
  - **HANDOFF v1.10.**
- **Sesión 14 (cerrada):**
  - 2 specs formales con las 8 piezas entregadas: panel 3 y panel 4. Sesión enteramente de spec/diseño, sin código. Mockup HTML standalone consolidado entregado. Pantalla principal cliente actualizada a v1.1.
  - **Panel 3 (Datos de pago):** archivo nuevo `docs/specs/cliente/panel-3-datos-de-pago.md` v1.0. Decisiones principales: header "Datos de pago" (no "Pago" — para evitar choque de nombres con panel 1 "Método de pago"). Card oscura con bandera al costado del monto. Sin conversión a USDT en card oscura (excepto cuando el método elegido es USDT). Sin breakdown "N equipos × monto unitario" (ya está en panel 2). Sin banner amarillo "Revisá pasos 1 y 2" (descartado). Una cuenta visible por método. Yape Perú con 2 cuentas (principal default + link "Ver otra cuenta Yape" para alternar). QR vía botón "Mostrar QR" — aparece arriba del número (empuja todo hacia abajo), datos visibles para que cliente compare con titular del QR escaneado. QR como imagen estática (admin la sube desde Centro de configuración). Dropzone con 6 estados (default, hover, drag-over, tipo no permitido, tamaño excedido, subiendo). Comprobante con 4 estados post-subida (subido esperando, validado, rechazado con motivo). Estado "Subido" sin nombre de archivo ni peso (decisión sesión 14 para evitar ruido visual). Estado "Validado" oculta thumbnail, muestra cajón verde. Estado "Rechazado" muestra thumbnail con X roja + botón "Subir otro" + cajón rojo con motivo + texto guía "o arrastrá un archivo nuevo encima". Cliente puede arrastrar otro archivo encima del rechazado para reemplazarlo. Tipos permitidos JPG/PNG/PDF, máximo 5 MB (verificado con fuentes externas — Canon Europe usa 4 MB para comprobantes similares). Sin límite de reintentos. Datos reales de Bryam usados como ejemplos en mockups. **Corrección USDT/Binance Pay confirmada:** USDT real es Binance Pay (no TRC20). Pill USDT panel 1 sin red mencionada. Panel 3 muestra "Binance Pay" como nombre del método con Pay ID. Esto cierra el hallazgo abierto del HANDOFF sesión 10. **Sin lock pricing 15 min y sin sistema de alertas escaladas** — la regla vieja de 15 min se desecha; la propuesta de Bryam de 5 min con 3 fases queda como input crudo en el HANDOFF, vive en spec dedicada del sistema de tiempos (sesión futura). Hoy panel 3 NO muestra contadores ni alertas. 4 OQ-residuales identificadas (imágenes de QR pendientes, QR de MX/CL pendientes, comportamiento de timeout largo, lista final de motivos de rechazo).
  - **Panel 4 (Conexión):** archivo nuevo `docs/specs/cliente/panel-4-conexion.md` v1.0. Decisiones principales: header "Conexión" (no "Conectar equipo" ni numeración). Botón "Descargar Redirector v2.5" persistente en TODOS los estados (decisión OQ-10 sesión 12 ratificada). Botón Descargar sin texto explicativo extra (decisión sesión 14). 6 estados visibles definidos; estados 0/1/2/5 visualmente idénticos (solo botón Descargar). **OQ-8 reabierta y cerrada en sesión 14:** estado 2 NO muestra "Esperando validación…" + spinner. La señal de validación vive en panel 3 + paneles 1-2-3 congelados. Botón "Equipo conectado" como núcleo del flujo (decisión OQ-4 sesión 12 ratificada — fue una falsa contradicción de Bryam que pensó que se había reemplazado). Estado 4: cards Technician ID + Código apiladas verticalmente. Botón "¿Dónde pegar estos códigos?" debajo de las cards. Modal "¿Dónde pegar?" con captura real del Redirector v2.5 (`1777861729916_image.png` aportada por Bryam en sesión) + badges flotantes 1°/2° + 3 pasos numerados. Sin "¿Necesitás más ayuda? Contactá por WhatsApp" (descartado en sesión 14). Sin banner "Pago confirmado…" (descartado en OQ-5 sesión 12). Formato compacto vs completo del Technician ID y Código a definir según ancho del panel (visualmente compacto, al copiar formato completo). Technician ID se "freeze-a" al nacer la orden (no cambia retroactivamente si el técnico activo cambia). 4 OQ-residuales identificadas (captura reemplazable, formato compacto, comportamiento mobile, texto explicativo de polish).
  - **Mockup HTML standalone consolidado:** archivo nuevo `docs/specs/cliente/mockups/pantalla-principal-cliente.html`. Recoge 5 escenarios: estado inicial, comprobante en validación, validado pre-clic, orden activa con 3 equipos, comprobante rechazado. Vista mobile incluida. Modal "¿Dónde pegar estos códigos?" incluido. Variables CSS del sistema. Tipografía y banderas integradas. Listo para servir como referencia visual a sesión 15 de implementación. **Nota:** la captura del Redirector está simulada en SVG; reemplazar por la imagen real `1777861729916_image.png` cuando Bryam la suba al repo (`public/images/redirector-screenshot.png`).
  - **Pantalla principal cliente actualizada a v1.1:** OQ-8 reabierta y re-cerrada con la decisión nueva (panel 4 estado 2 sin "Esperando validación"). Tabla de estados del panel 4 actualizada. Changelog extendido.
  - **Hallazgos del HANDOFF resueltos en sesión 14:** USDT/Binance Pay vs TRC20 (cerrado, datos reales en panel 3 spec).
  - **Decisiones cruzadas registradas:** spec del Centro de configuración → "Medios de pago" (debe permitir cargar cuentas con QR opcional, manejar Yape doble con `alternativeAccountKey`). Spec del panel operador (debe exponer endpoints de validar/rechazar comprobante, "agarrar equipo" individual, generar Recibo de operación, cambiar técnico activo). Spec del sistema de tiempos / lock pricing sigue pausada como input crudo.
  - **Falsas contradicciones detectadas y resueltas (regla #16 aplicada correctamente):** Bryam dijo "el botón Equipo conectado fue reemplazado, revisá el HANDOFF" — Claude verificó en HANDOFF y specs, no encontró evidencia, preguntó si era confusión con "Conexión lista" (nombre tentativo descartado). Bryam confirmó la confusión. Decisión OQ-4 sesión 12 mantenida.
  - **Aplicación correcta de regla #11 (decisión grande al final de sesión cansado):** Bryam pidió cambiar el lock 15 min por las alertas escaladas de 5 min. Claude frenó porque las alertas escaladas requieren spec completa del sistema de tiempos (9 sub-decisiones, cruza con panel 4, Mis órdenes, política de reembolso). Acordamos: sacar la regla vieja de 15 min del panel 3, dejar placeholder explícito de que el sistema de tiempos vive en spec dedicada futura.
  - **Iteraciones del QR abierto: 4 versiones** (acordeón cerrado → abierto empujando todo → versión limpia sin número → QR debajo → QR arriba). Activó regla #17 (4+ iteraciones = procesamiento incompleto). Llegamos a buen puerto pero queda como marcador de fatiga.
  - **Bryam aportó datos reales de las 5+ cuentas en chat** (Yape PE × 2, México STP, Colombia Bancolombia, Chile Mercado Pago, Binance Pay, PayPal). PayPal queda como input crudo (no se trabaja en sesión 14). 2 cuentas Yape integradas en spec del panel 3.
  - **Sistema de breakpoints unificado documentado en specs** (decisión heredada del rediseño responsive del portal viejo, no se reabre): mobile <640px (1 col) → tablet 640px (2 cols) → laptop 900px (4 cols) → desktop 1200px → ultrawide 1800px (max-width 1400px centrado). Documentado en `pantalla-principal-cliente.md` v1.1 + en sección 4 de panel 3 y panel 4. Los paneles NO tienen ancho fijo 400px estricto — son fluidos dentro del breakpoint. Las medidas tipográficas y spacings internos sí están fijos.
  - **HANDOFF v1.11.**
- **Sesión 15 (en curso):**
  - panel-2-solicitud.md v1.0 → v1.1 (descuentos por volumen documentados).
  - **HANDOFF v1.12.**

---

**Si tenés dudas que no podés resolver con este archivo + las specs, preguntale a Bryam directo. No improvises.**
