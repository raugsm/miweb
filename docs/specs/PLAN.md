# Plan estratégico — Specs AriadGSM Portal

**Versión:** 1.0 · **Fecha:** 2 de mayo 2026 · **Estado:** propuesto, pendiente de aprobación de Bryam

---

## TL;DR

- **15 specs** a escribir, agrupadas en **3 fases**.
- **12–15 sesiones** de trabajo total.
- **Orden:** Sistema (transversales) → Cliente (técnicos) → Operador (interno).
- **1 spec por sesión** como regla. Excepciones marcadas abajo.
- **Cada spec tiene las 8 piezas** (mockup, estados, edge cases, responsive, comportamiento, datos, acceptance criteria, open questions).

---

## Por qué este orden

**Sistema primero** porque el pricing engine, la state machine y las integraciones externas son **bloqueantes** para todo lo demás. Sin esto definido, cada spec de UI se inventa estados que pueden no encajar — que es exactamente lo que pasó con los 16 bugs actuales.

**Cliente segundo** porque es el flow del usuario final, lo que hoy se está fixeando reactivamente, y porque genera el data set que el operador procesa.

**Operador último** porque es interno, depende de los estados/datos de las dos fases anteriores, y hoy no hay bloqueante crítico ahí (el negocio funciona con WhatsApp + spreadsheets).

---

## Inventario completo

### Fase 1 — Sistema (transversales) · 4 specs · ~4 sesiones

| # | Spec | Bloquea | Notas |
|---|---|---|---|
| 01 | Pricing engine + lock 15 min + validación 5 niveles | Pasos 1, 2, 3, 4 | Crítico. Define cómo se calculan precios y se manejan cambios de costo. |
| 02 | State machine de orden (estados, transiciones, eventos) | Pasos 4, Mis Órdenes, todo el operador | Define qué estados existen y cómo se mueve una orden entre ellos. |
| 03 | Multi-orden + VIPs + postpago | Mis Órdenes, operador | Cómo coexisten varias órdenes activas del mismo cliente. |
| 04 | Integraciones externas (FX API, geolocation, WhatsApp, PDF) | Pasos 1, 3, 4 | Decide proveedores, formatos, fallbacks. |

### Fase 2 — Cliente · 5 specs · ~5 sesiones

| # | Spec | Estado | Notas |
|---|---|---|---|
| 05 | Paso 1 — Precio (método de pago) | ✓ Hecho | Spec de referencia para los otros pasos. |
| 06 | Paso 2 — Solicitud (cantidad de equipos) | Pendiente | Más simple que paso 1. |
| 07 | Paso 3 — Pago (5 variantes de método) | Pendiente | **Puede llevar 2 sesiones** por las 5 variantes (Yape PE, transferencia MX/CO/CL, USDT). |
| 08 | Paso 4 — Conexión + tutorial Redirector | Pendiente | Incluye el bottom sheet con el tutorial mejorado. |
| 09 | Mis Órdenes + activity log + notificaciones cliente | Pendiente | El "post-equipo conectado". |

### Fase 3 — Operador · 6 specs · ~6 sesiones

| # | Spec | Notas |
|---|---|---|
| 10 | Vistas (histórico, VIPs con deuda, métricas, registry de clientes) | 4 vistas en una spec, comparten patrón. |
| 11 | Procesar equipo + acciones rápidas (siguiente, marcar Done, reportar problema) | El día a día del técnico. |
| 12 | Cerrar día / cerrar turno (Jack/Angelo) | Permisos compartidos según el doc original. |
| 13 | Aprobaciones admin (VIP, cambio costo >50%) | Solo Bryam. |
| 14 | Notificaciones internas + auditoría | Campanita + logs. |
| 15 | Panel admin Bryam (config márgenes, gestión técnicos, logs) | El "back-office" de Bryam. |

---

## Trabajo en paralelo (los 5 commits ya en Claude Code)

Los 16 bugs visuales que ya identificamos siguen en cola en Claude Code. **No están en el roadmap de specs** porque son fixes de cosas ya construidas, no specs nuevas.

**Decisión:** se validan al cierre de Fase 2, cuando las specs cliente estén firmes. Si los commits resolvieron correctamente y no contradicen las specs nuevas, se mergean. Si hay contradicción, prevalece la spec.

---

## Decisiones macro upfront

Antes de arrancar Fase 1, Bryam decide:

1. **¿Aprobás el orden Sistema → Cliente → Operador?** Si preferís Cliente primero (porque es lo más visible), avisame. Trade-off: vamos a tener que hacer rework cuando definamos Sistema.

2. **APIs externas (FX, geolocation, hosting de PDF):** ¿Las definimos vos+yo o tenés a alguien técnico que ya haya elegido proveedores? Si no hay nadie, te tiro recomendaciones con justificación y elegís.

3. **Cadencia de envío a Claude Code:** ¿Cada spec validada se manda al toque, o esperamos a tener un bloque (ej. toda Fase 1, o todo Cliente)? Recomendación: **por bloque**, así Claude Code tiene contexto completo y no hace work parcial sobre specs incompletas.

4. **Aceptás que las primeras 2-3 specs van a iterar más** mientras encontramos el ritmo. Después se acelera. La spec del paso 1 ya nos enseñó qué nivel de detalle funciona.

5. **Cadencia de sesiones:** ¿Cuántas por semana podés sostener? Si hacés 3-5 por semana, son 3-4 semanas para cerrar todo. Si son 1-2, son 8-12 semanas.

---

## Estructura del repo de docs

```
docs/
├── specs/
│   ├── PLAN.md                         ← este archivo
│   ├── sistema/
│   │   ├── 01-pricing-engine.md
│   │   ├── 02-state-machine-orden.md
│   │   ├── 03-multi-orden-vips.md
│   │   └── 04-integraciones-externas.md
│   ├── cliente/
│   │   ├── 05-paso-1-precio.md         ← ya hecho
│   │   ├── 06-paso-2-solicitud.md
│   │   ├── 07-paso-3-pago.md
│   │   ├── 08-paso-4-conexion.md
│   │   ├── 09-mis-ordenes.md
│   │   └── mockups/
│   │       ├── 05-paso-1-precio.html   ← ya hecho
│   │       └── …
│   └── operador/
│       ├── 10-vistas.md
│       ├── 11-procesar-equipo.md
│       ├── 12-cerrar-dia-turno.md
│       ├── 13-aprobaciones-admin.md
│       ├── 14-notif-auditoria.md
│       └── 15-panel-admin-bryam.md
└── ariadgsm-decisiones-FINAL-2026-05-02.md   ← se mantiene como referencia histórica
```

---

## Workflow por sesión

Cada sesión sigue la misma rutina, así no improvisamos:

1. **Apertura (5 min):** abrimos las Open Questions pendientes de la sesión anterior. Las que no estén resueltas, las cierra Bryam o las posponemos.
2. **Spec del día (45–60 min):** escribimos las 8 piezas siguiendo el formato del paso 1.
3. **Cierre (5 min):** entrego archivo `.md` + mockup `.html`. Bryam lo sube al repo en la carpeta correspondiente. Listamos las nuevas Open Questions para la próxima sesión.

**Regla:** no se cierra una sesión sin entregable persistente. No más mockups que se pierden en el chat.

---

## Hitos / checkpoints

- **Hito 1 — Cierre Fase 1:** las 4 specs de Sistema validadas. Bryam tiene claridad total de cómo funciona internamente el portal antes de tocar UI. **Esperado:** semana 2.
- **Hito 2 — Cierre Fase 2:** las 5 specs cliente validadas + los 5 commits de Claude Code mergeados. El portal cliente queda 100% specced. **Esperado:** semana 4.
- **Hito 3 — Cierre Fase 3:** las 6 specs operador validadas. Listo para implementar el back-office. **Esperado:** semana 6–7.

Las fechas son orientativas y dependen de la cadencia que elijas en la Decisión Macro #5.

---

## Riesgos y mitigaciones

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| Specs muy detalladas, Bryam se aburre y no las lee | Media | Cada spec tiene TL;DR arriba + mockup visual + Open Questions destacadas. |
| Claude Code malinterpreta una spec | Media | Acceptance Criteria como tests testeables, no descriptivos vagos. |
| Aparecen requerimientos nuevos durante el proceso | Alta | Cada spec tiene Changelog + Open Questions. Cambios se versionan, no se ignoran. |
| Bryam responde Open Questions tarde, todo se atrasa | Alta | Cada sesión empezamos resolviendo las OQ pendientes. Si hay >5 sin resolver, freeze de specs nuevas hasta que se resuelvan. |
| Una spec resulta más grande de lo esperado | Media | Spec 07 (Paso 3) ya está marcada como posibles 2 sesiones. Si otra crece, se divide. |

---

## Próximo paso concreto

**Si aprobás este plan**, próxima sesión arrancamos con la **Spec 01 — Pricing engine + lock 15 min + validación 5 niveles**. Es el bloqueante mayor y desbloquea las 3 specs siguientes de Fase 1.

**Si querés iterar este plan primero**, decime qué cambia. Posibles cambios:
- Reordenar fases (ej. Cliente primero)
- Agregar/quitar specs del inventario
- Cambiar agrupaciones (ej. Paso 3 con 5 variantes en specs separadas)
- Cambiar cadencia de envío a Claude Code

---

## Apéndice A — Decisiones ya tomadas (no se reabren)

Estas decisiones están firmes. No se discuten en cada spec, se aplican. Si alguna necesita cambiar, se versiona como cambio explícito en el changelog del plan.

### Pricing y validación

- **Lock por orden completa** (no por equipo) por **15 minutos** desde la aprobación del comprobante.
- Durante esos 15 min: Bryam absorbe cualquier subida de costo sin alertar al cliente.
- Después de 15 min: si el costo bajó o quedó igual → renovación silenciosa. Si subió → banner amarillo en el portal cliente con 3 opciones: subir 2do comprobante / esperar 1 h / cancelar pendientes.
- **Validación dinámica de 5 niveles** sobre el monto ingresado vs. el monto esperado:
  - `<15%` de diferencia → guarda silencioso
  - `15–30%` → confirm modal al cliente
  - `30–50%` → pide motivo + notifica admin
  - `>50%` → bloquea, requiere admin Bryam
  - `<1 USDT` o `>100 USDT` → rechazo absoluto sin importar nada más

### VIPs y postpago

- Atributo del cliente VIP: **`vipUnitMargin`** (no `vipUnitPrice`).
- Fórmula: `precio_VIP = costo_proveedor + vipUnitMargin`.
- Rango válido de `vipUnitMargin`: **0.5 – 1.0 USDT**.
- Marcar a un cliente como VIP **activa postpago automáticamente**.

### Multi-orden simultánea

- Permitir crear nuevas órdenes **excepto** si el cliente tiene órdenes en estado `ESPERANDO_PAGO` o `PAGO_RECHAZADO` (debe completar/resolver primero).

### Timers en portal cliente

- **Paso 2:**
  - 30 s sin acción → banner azul "Los precios son en vivo".
  - 90 s sin acción → cambia a amarillo "El precio puede cambiar pronto".
- **Paso 4:**
  - 2 min sin apretar "Equipo conectado" → banner "🔧 ¿Listo para conectar?" con botones "Ya estoy listo" + "Necesito ayuda WhatsApp".

### Mis Órdenes

- Solo aparece **después** de que el cliente apreta "Equipo conectado" en paso 4.
- Card con activity log colapsable. Eventos del cliente marcados con "(vos)".
- Botón **"Comprobante (PDF)"**: disabled hasta `FINALIZADO`, después azul activo.
- Botón **"Ayuda"**: abre WhatsApp con contexto del proceso.

### PDF comprobante

- PDF real con **QR + SHA-256** (anti-disputa).
- Endpoint público `/v/:code` para verificación externa.

### Operador

- 16 piezas totales: 4 vistas + 4 modales + 4 acciones rápidas + 4 admin/config.
- **Permisos cerrar día/turno:** Jack y Angelo pueden hacer todo (cobrar, bloquear, cerrar). Cada técnico cierra **su** turno. Bryam consolida al final del día.
- **Bryam es admin único** para aprobaciones VIP y aprobaciones de cambio de costo `>50%`.

### Mockups cliente (decisiones de esta sesión)

- **Paso 1:** layout 3+2 de pills (Colombia/México/Chile arriba, Perú/USDT abajo). Card oscura "ESTIMADO · EN VIVO" con dot pulsante.
- **Paso 2:** stepper -/n/+ con label "Equipos a desbloquear". Total en card oscura con breakdown integrado (precio por equipo dentro del card, no en línea separada). Insignia verde "98% modelos soportados" arriba derecha. Validación de modelo opcional (no gate).
- **Paso 3:** card "TOTAL A PAGAR" oscura. Header del método (ej. Yape Perú) con icono y "X cuentas disponibles". Cards de cuentas con botón Copiar. Info-tip azul de lock 15 min. Banner amarillo "Revisá pasos 1 y 2". Dropzone dasheada para comprobante. Botón Continuar disabled hasta subir.
- **Paso 4:** sin banner "pago aprobado" (redundante para técnicos pro). Mini-Redirector **no** inline — va en bottom sheet accesible por botón "¿Dónde pego estos datos?". Datos con badges 1° azul / 2° verde matcheando los campos del Redirector real. En el tutorial: campos del Redirector con borde grueso del color del badge + label descriptivo ("1° pegá Technician ID" / "2° pegá Código del proceso").

### Formatos

- **Technician ID:** `1000 9983 5478` (espaciado cada 4 dígitos).
- **Código del proceso:** `CL-YYYYMMDD-XXX-N` (ej. `CL-20260502-XPK-1`).

### Estados de orden (lista preliminar, se cierra en spec 02)

Conocidos hasta hoy. La spec 02 (state machine) los confirma y agrega los que falten.

- `ESPERANDO_PAGO`
- `PAGO_EN_REVISION`
- `PAGO_RECHAZADO`
- `EN_PREPARACION` (post-aprobación admin del comprobante)
- `EQUIPO_CONECTADO` (cliente apretó el botón en paso 4)
- `FINALIZADO`

---

## Apéndice B — Método de trabajo

### Reference-driven design

- Los **mockups visuales son la fuente de verdad**, no las interpretaciones textuales.
- Cada decisión visual queda persistida en archivo HTML standalone (en `mockups/`), no solo en widget de chat.
- Cada decisión textual queda persistida en archivo Markdown, no solo en mensaje de chat.
- Si está solo en chat, **no existe**.

### Proceso iterativo correcto

```
Plan → Design → Implement → Test → Review
```

1. **Plan:** entender qué se va a hacer y por qué.
2. **Design:** mockups visuales + las 8 piezas de spec.
3. **Implement:** Claude Code con la spec como contrato.
4. **Test:** validar contra Acceptance Criteria.
5. **Review:** mergear o iterar.

**No improvisar entre etapas. No saltarse etapas.**

### Specs antes de código

Las 8 piezas (mockup, estados, edge cases, responsive, comportamiento, datos, acceptance criteria, open questions) deben existir **antes** de que Claude Code escriba una línea. Si una pieza no existe, Claude Code va a improvisarla — y probablemente mal. Eso es lo que generó los 16 bugs actuales.

### Reglas de commits

- **Separados por área:** un commit no toca dos áreas distintas del producto.
- **Self-contained:** cada commit se entiende solo, sin depender de otros pendientes.
- **Deployable:** cada commit deja la app funcionando, no rota.
- **Revertible:** cada commit se puede deshacer sin afectar otros.

### Validación incremental

- Probar cada commit antes de avanzar al siguiente.
- No mandar un bloque grande sin haber validado las piezas individuales.

### Tono y forma de trabajar con Bryam

- No es programador. Aprende haciendo.
- Prefiere respuestas cortas y mockups visuales sobre texto largo.
- Pide fuentes externas cuando duda del proceso. Cuando lo pide, no es desconfianza, es chequeo.
- Usa instancia paralela de Claude Code para implementación. El Claude del chat hace specs/diseño, Claude Code hace código.
- `ask_user_input_v0` widgets a veces fallan; cuando hay duda, preguntar en mensaje libre.

---

## Changelog

- **v1.1** (2026-05-02) — Agregados Apéndice A (decisiones ya tomadas) y Apéndice B (método de trabajo). Plan aprobado por Bryam, orden Sistema → Cliente → Operador confirmado.
- **v1.0** (2026-05-02) — Plan inicial. Inventario de 15 specs en 3 fases. Pendiente aprobación.
