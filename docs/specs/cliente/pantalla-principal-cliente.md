# Pantalla principal cliente

**Versión:** 1.1 · **Fecha:** 4 de mayo 2026 · **Estado:** spec base conceptual con todas las open questions cerradas. La conversión a spec implementable con las 8 piezas formales se completó en sesiones 13 y 14 a través de las specs por panel: `panel-1-metodo-de-pago.md` v2.0, `panel-2-solicitud.md` v1.0, `panel-3-datos-de-pago.md` v1.0, `panel-4-conexion.md` v1.0 y `mis-ordenes.md` v1.0.

**Cambio v1.0 → v1.1:** OQ-8 (espera del técnico durante validación) reabierta en sesión 14 y cerrada con decisión nueva: el panel 4 NO muestra "Esperando validación…" + spinner durante el estado 2; queda igual al estado 0/1. La señal de validación vive en panel 3 ("Comprobante recibido ✓") + paneles 1-2-3 congelados.

---

## Por qué existe este archivo

Hasta sesión 10 inclusive, la web cliente se diseñaba como **flujo lineal de 4 pasos** (paso 1 → paso 2 → paso 3 → paso 4), donde cada paso era una pantalla propia con su spec individual. Bajo ese modelo, ya estaban planificadas 4 specs separadas: `paso-1-precio.md`, `paso-2-solicitud.md`, `paso-3-pago.md`, `paso-4-conexion.md`.

En sesión 11 Bryam reveló que el modelo real es distinto. La pantalla cliente no es una secuencia de pasos. Es **una pantalla única con 4 paneles paralelos visibles a la vez**, más una zona de seguimiento ("Mis órdenes") debajo. El cliente puede trabajar en cualquier panel en el orden que quiera, con preselecciones por defecto que le permiten ir directo a pagar si es un cliente repetidor experto.

En sesión 12 se procesaron las 10 open questions (OQ-1 a OQ-10) y se cerraron todas. Este archivo registra ese cierre completo. Las specs por panel (panel 1, panel 2, panel 3, panel 4) y la spec de "Mis órdenes" se desarrollan después, basadas en este marco. La spec `paso-1-precio.md` v1.1 que ya existe se reescribe en sesión 13 como spec del panel 1 con las 8 piezas.

---

## Cómo se descubrió este modelo

Sesión 11 arrancó con plan de procesar el "modelo de órdenes paralelas" descubierto en sesión 10. Durante la entrevista para entender el modelo de uso real:

1. Se descubrió que existen **dos comportamientos legítimos del cliente** (agrupado y encadenado), no uno solo como sugería el HANDOFF v1.7.
2. Se descubrió un **tercer modelo** ("atajo de pago") — clientes expertos repetidores que quieren ir directo a pagar sin pasar por panel 1 ni 2.
3. Se descubrió un **cuarto caso** ("abortar orden") — cliente final se arrepiente, técnico necesita cancelar una orden ya pagada o conectada.
4. Bryam aportó dos mockups visuales que mostraron que su modelo mental NO es de "pasos secuenciales con saltos permitidos", sino de **paneles paralelos visibles simultáneamente**. Eso colapsó las preguntas anteriores y abrió un marco nuevo.

El Claude del chat aplicó la regla #13 del HANDOFF (descubrimientos conceptuales a mitad de spec → pausar lo dependiente y registrar). En lugar de seguir el plan original de 5 etapas, se dedicó la sesión 11 entera a entender el modelo de uso. Los mockups de Bryam funcionaron como "fuente de verdad reference-driven" según regla #1.

En sesión 12 el procesamiento se profundizó al cerrar las 10 OQ. Durante el cierre aparecieron **dos descubrimientos adicionales** que aplicaron regla #13 nuevamente:

- **Rediseño del Redirector v2.5:** pasa de entrega por WhatsApp a descarga directa con instalador genérico libre. Ver sección dedicada abajo.
- **Comportamiento del estado en card de Mis órdenes:** distinto a lo que sugería el Mockup 2. Solo dos estados visibles, aparecen condicionalmente. Ver sección dedicada abajo.

---

## El modelo de 4 paneles + Mis órdenes

### Layout general (desktop)

Dos zonas apiladas verticalmente:

**Zona 1 (arriba) — "Pedido actual":** los 4 paneles paralelos, en una fila horizontal.
- Panel 1: Método de pago
- Panel 2: Solicitud (cantidad de equipos + modelo opcional)
- Panel 3: Pago (totales + cuentas + dropzone de comprobante)
- Panel 4: Conexión (botón Descargar Redirector v2.5 persistente + estado del proceso)

**Zona 2 (abajo) — "Mis órdenes":** lista de cards horizontales con todas las órdenes que el cliente ya tiene en seguimiento. Incluye órdenes activas y finalizadas recientes (últimos 7 días). Las finalizadas más viejas se ocultan automáticamente y se acceden vía botón "Ver órdenes anteriores" que abre un modal con el historial completo.

### Layout en mobile

Los 4 paneles se apilan verticalmente como stepper. Mis órdenes va debajo, también en stack vertical.

### Sistema de breakpoints del portal (decisión vigente)

El grid contenedor de los 4 paneles usa el sistema de breakpoints unificado del portal. Esta decisión fue tomada en sesión anterior (rediseño responsive del portal viejo) y se mantiene vigente para la pantalla principal nueva:

| Breakpoint | Rango | Layout |
|---|---|---|
| Mobile | <640px | 1 columna (paneles apilados verticalmente) |
| Tablet | 640–899px | 2 columnas (2×2) |
| Laptop | 900–1199px | 4 columnas (estrechas pero legibles) |
| Desktop | 1200–1799px | 4 columnas cómodas |
| Ultrawide | ≥1800px | 4 columnas con `max-width: 1400px` centrado |

**Implementación esperada (mobile-first):**

```css
.pantalla-principal__paneles {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
  max-width: 1400px;
  margin-inline: auto;
}

@media (min-width: 640px) {
  .pantalla-principal__paneles { grid-template-columns: repeat(2, 1fr); }
}

@media (min-width: 900px) {
  .pantalla-principal__paneles { grid-template-columns: repeat(4, 1fr); }
}
```

Los 4 paneles **no tienen ancho fijo de 400px estricto**. Cada panel ocupa el ancho que le da el grid en cada breakpoint. Las medidas tipográficas y spacings internos de cada panel sí son fijas (ver specs por panel); solo el ancho exterior es fluido dentro del breakpoint.

El archivo `public/portal-styles/00-breakpoints.css` (o equivalente, según estructura del repo al momento de implementar) documenta los breakpoints como custom properties para referencia.

**Mis órdenes (zona de abajo):** en TODOS los breakpoints ocupa el ancho completo del contenedor (1 columna). Las cards de Mis órdenes apiladas verticalmente — no se ponen lado a lado.

### Mockups de referencia

- **Mockup 1** (sesión 11): vista desktop con los 4 paneles paralelos, sin sección Mis órdenes visible. **Queda parcialmente desactualizado** por el rediseño del Redirector v2.5 hecho en sesión 12 (ver sección dedicada).
- **Mockup 2** (sesión 11): vista desktop con los 4 paneles paralelos arriba + sección "Mis órdenes" abajo. Mis órdenes muestra dos cards: una en estado "Listo para conexión" y otra "Finalizado". **Queda parcialmente desactualizado** por las decisiones de sesión 12 sobre composición de la card y comportamiento del estado (ver sección dedicada).
- **Imagen de detalle de card aportada en sesión 12:** card con código `CL-20260503-001`, "1 equipo · $97.80 MXN", estado "Listo para conexión", precio asegurado, barra de procesados, comprobante PDF, ayuda, registro de actividad. **Queda parcialmente desactualizada** — varios elementos cambian (botón Ayuda se quita, Comprobante PDF se renombra a "Recibo de operación", precio asegurado/vencimiento se pausan, estado cambia ubicación y semántica).

Pendiente para sesiones 13+: convertir los mockups en archivos HTML standalone en `docs/specs/cliente/mockups/pantalla-principal-cliente.html` reflejando todas las decisiones de sesión 12.

---

## Concepto clave — "congelar / descongelar" en lugar de "candado"

En sesiones anteriores se usaba el lenguaje de "candados" (íconos visibles en cada paso). En sesión 11 Bryam descartó ese lenguaje visual por anticuado. Se reemplaza por el concepto de **congelar/descongelar paneles**: mecanismo invisible que impide al cliente modificar paneles 1, 2 y 3 en ciertos momentos.

**Mecánica completa (refinada con decisiones de sesión 12):**

1. **Estado inicial.** Paneles 1, 2 y 3 editables. Panel 4 muestra solo el botón persistente "Descargar Redirector v2.5".

2. **Cliente sube comprobante en panel 3.** Inmediatamente se **congelan** los paneles 1, 2 y 3.
   - Panel 3 muestra "Comprobante recibido ✓" como estado fijo (verde, sin spinner).
   - Panel 4 muestra "Esperando validación…" con spinner. El botón "Descargar Redirector v2.5" sigue visible.
   - No se muestra tiempo estimado al cliente. La validación es típicamente de segundos.
   - El cliente **no puede cancelar** mientras espera. Si querrá abortar después, lo hará desde Mis órdenes.

3. **Técnico revisa comprobante en su panel.** Dos caminos:

   **Camino A — Comprobante válido:**
   - Panel 3 cambia a "Comprobante validado ✓".
   - Panel 4 muestra el botón **"Equipo conectado"** (texto definido en OQ-4).
   - Paneles 1, 2 y 3 **siguen congelados**.
   - Cliente aprieta "Equipo conectado". **Recién ahí:**
     - Se crea la orden en "Mis órdenes" (zona de abajo) con animación slide-in.
     - Se descongelan paneles 1, 2 y 3 (cambio instantáneo).
     - Panel 1 mantiene la última pill seleccionada. Panel 2 vuelve a 1 equipo. Panel 3 se limpia (dropzone vacío).
     - Panel 4 cambia al estado activo (códigos del proceso + descarga Redirector persistente).
     - **No hay banner "Pago confirmado…"** en panel 4 (decidido en OQ-5 sub-3 — el "Comprobante validado ✓" en panel 3 ya cubre esa confirmación).

   **Camino B — Comprobante rechazado:**
   - Aparece alerta inline en panel 3: "❌ Comprobante rechazado" con motivo + detalle.
   - El motivo viene de una lista prefabricada que el técnico elige al rechazar (Monto incorrecto · Comprobante ilegible · Cuenta destino equivocada · Comprobante duplicado · Fecha inválida · Otros). Opcionalmente el técnico puede agregar detalle libre en un campo de texto.
   - El comprobante rechazado **queda visible** con thumbnail + overlay rojo "Rechazado". Se reemplaza cuando el cliente sube uno nuevo.
   - Paneles 1, 2 y 3 se descongelan inmediatamente.
   - Panel 4 vuelve a inactivo (sin spinner, sin botón "Equipo conectado"). El botón "Descargar Redirector v2.5" sigue visible.
   - **Sin límite de reintentos.** El cliente puede subir cuantos comprobantes quiera. Detección de fraude entre múltiples órdenes es spec aparte.

### Implicancia conceptual: cuándo "nace" una orden

Antes de sesión 11, en el HANDOFF y el código, "orden" era cualquier cosa que el cliente arrancara desde el primer clic en paso 1. En sesión 11 Bryam aclaró que su modelo mental es distinto: una orden **nace** recién cuando el cliente aprieta el botón "Equipo conectado" del panel 4 con comprobante validado. Antes de eso, lo que existe es un "pedido en armado" o "pedido en revisión", pero no una orden propiamente dicha.

Esto define que la sección "Mis órdenes" muestra solo entidades que cruzaron ese umbral. Pedidos en armado o pedidos cuyo comprobante fue rechazado y nunca se reenvió no aparecen ahí.

### Implicancia conceptual: por qué no hay 2 pedidos en armado a la vez

El estado "congelado" garantiza que el cliente nunca tenga 2 pedidos en armado simultáneamente. Cuando un comprobante está siendo revisado o esperando que el cliente apriete "Equipo conectado", los paneles 1, 2 y 3 están bloqueados. Lo que el cliente puede tener simultáneamente es **1 pedido en armado activo + N órdenes ya en seguimiento abajo**.

Esto reemplaza el concepto previo del HANDOFF de "múltiples órdenes en paralelo". El paralelismo no está en "pedidos en armado", sino en "órdenes en seguimiento" mientras el cliente arma una nueva.

---

## Modelos de uso del cliente

### Modelo 1 — Agrupado

Cliente llega con 2 o más equipos a la mano. Hace **un solo pedido** que contiene los N equipos. Paga una vez, sube un comprobante. En el panel de operador aparece **una sola orden** con N equipos adentro.

- Procesamiento uno por uno por el técnico.
- Si un equipo no es soportado, ese equipo individual se cancela; los demás siguen.
- Expectativa del cliente: entrega completa de los N equipos al final.
- Cronómetro (registrado como insumo, NO decisión todavía): único al inicio para conectar el primer equipo. Una vez arrancada la conexión, los N se procesan en cadena. La spec formal del sistema de tiempos lo cierra después.

### Modelo 2 — Encadenado

Cliente arranca con 1 equipo. Mientras el primer pedido está armándose, le llega a la tienda otro equipo. **Antes de pagar:** simplemente sube la cantidad en panel 2, el pedido se agranda. NO crea pedido nuevo.

**Después de subir comprobante:** los paneles 1, 2 y 3 están congelados. No puede agrandar el pedido. Tiene que esperar que el técnico valide el comprobante, luego apretar "Equipo conectado" en panel 4. **Recién ahí** se descongela y puede arrancar otro pedido nuevo desde panel 1.

### Modelo 3 — Atajo de pago

Cliente experto repetidor que conoce la dinámica y no quiere fricción. Quiere ir directo a pagar.

**Resuelto por el layout:** como los 4 paneles están todos visibles a la vez, panel 1 trae preselección por perfil/última pill, y panel 2 tiene cantidad por defecto, el cliente experto puede hacer clic directo en panel 3 sin tocar los anteriores. NO se necesita botón extra "pagar rápido" ni layout especial. El layout en sí ya resuelve el atajo.

**Refuerzo en sesión 12 (OQ-5 sub-4+5):** después de cerrar un pedido (apretar "Equipo conectado"), panel 1 mantiene la última pill seleccionada y panel 2 vuelve a 1 equipo. Esto refuerza el modelo 3: el cliente repetidor tiene la pantalla "lista para el siguiente pago" sin tener que reconfigurar nada.

### Caso 4 — Abortar orden

Cliente final que llevó el equipo a la tienda se arrepiente y se lo lleva. Técnico necesita cancelar una orden que ya está en seguimiento (puede haber pasado pago, conexión, o ambos). NO sucede a menudo pero pasa varias veces.

**Resolución (decidida en OQ-3 sesión 12):** botón "Abortar proceso" en cada card de Mis órdenes que esté en estado activo (no aparece en cards finalizadas).

- **Confirmación previa:** modal "¿Abortar esta orden? Esta acción detendrá el trabajo del técnico y registrará una solicitud de reembolso. No es reversible." con botones "Cancelar" / "Sí, abortar".
- **Notificaciones:** al apretar "Sí, abortar" se notifica simultáneamente al técnico que tiene asignada la orden (alerta inmediata para detener trabajo) y al operador (para registro y posibles acciones administrativas).
- **Qué pasa con el dinero:** PAUSADO. Pendiente para spec dedicada de política de reembolso (input crudo del HANDOFF). En la versión inicial, "Abortar proceso" registra la solicitud pero el flujo concreto del dinero se procesa manualmente por el operador según la política que se defina.

---

## Rediseño del Redirector v2.5 (sesión 12)

**Decisión firme tomada por Bryam fuera de sesión, comunicada y registrada en sesión 12.**

**Antes (modelo viejo, en Mockup 1):**
- Botón en panel 4 decía "Solicitar Redirector v2.5 por WhatsApp".
- El archivo del redirector se enviaba por WhatsApp al cliente.
- Aparecía solo después de que la orden estaba activa (post-clic del cliente).
- Copy explicativo: "te lo enviamos por WhatsApp en segundos".

**Ahora (modelo nuevo):**
- Botón "Descargar Redirector v2.5" — descarga directa desde la web.
- **Instalador genérico:** mismo archivo para todos los clientes. Cliente repetidor lo descarga una vez y lo reutiliza en todas sus órdenes futuras.
- **Descarga libre:** sin gating de pago, sin pasos previos, sin ninguna validación. Disponible siempre.
- **Persistente en panel 4:** el botón aparece en TODOS los estados del flujo (no aparece "después" de la orden, está siempre).
- Sin dependencia de WhatsApp en este paso.

**Implicancias:**
- Mockup 1 queda parcialmente desactualizado.
- Spec del Redirector (si existe o se hará) tiene que reflejar este cambio.

---

## Estados visibles del panel 4 a lo largo del flujo

El panel 4 es el panel con más estados a lo largo del flujo. Se documentan acá para referencia de sesiones 13-15:

| Estado | Cuándo | Qué muestra panel 4 |
|---|---|---|
| 0 — Inicial / sin pedido | Cliente recién entró | Botón "Descargar Redirector v2.5" + texto explicativo breve |
| 1 — Cliente armando pedido | Paneles 1-2-3 editables | Igual al estado 0 |
| 2 — Comprobante subido, esperando | Paneles 1-2-3 congelados, panel 3 dice "Comprobante recibido ✓" | **Igual al estado 0/1** (botón Descargar Redirector como único elemento). **Cambio v1.1 sesión 14**: se quitó "Esperando validación…" + spinner por redundancia con panel 3 que ya señala el estado del comprobante. |
| 3 — Comprobante validado (momento A) | Paneles 1-2-3 aún congelados, panel 3 dice "Comprobante validado ✓" | Botón **"Equipo conectado"** + botón Descargar persistente |
| 4 — Post-clic, orden activa (momento B) | Orden nació, paneles 1-2-3 descongelados | Códigos del proceso + estado del proceso del técnico + botón Descargar persistente. **Sin banner "Pago confirmado…"** |
| 5 — Comprobante rechazado | Paneles 1-2-3 descongelados, alerta en panel 3 | Vuelve a estado 0/1. Botón "Equipo conectado" no aparece. Botón Descargar persistente |

---

## Mis órdenes — composición y comportamiento

### Composición de cada card

| Elemento | 1 equipo | N equipos |
|---|---|---|
| Código de orden | ✅ | ✅ |
| Cantidad de equipos + modelo opcional | ✅ | ✅ |
| Monto pagado | ✅ | ✅ |
| Fecha/hora de creación | ✅ | ✅ |
| Texto del estado ("En proceso" / "Finalizado") | ✅ — solo si técnico ya agarró, va cerca de la barra de procesados | ✅ — igual |
| Barra de procesados + % | ✅ con texto del estado | ✅ con "X de Y procesados · Z pendiente" |
| Registro de actividad | ❌ no aplica | ✅ expandible desde la barra |
| Botón "Recibo de operación" | ✅ | ✅ |
| Botón "Abortar proceso" | ✅ — solo en estados activos | ✅ — igual |

**Pausados (a definir en spec del sistema de tiempos / lock pricing):**
- Precio asegurado
- Vencimiento

**Descartados:**
- Botón "Ayuda" (quitado)
- Estado en esquina superior derecha (la posición se mueve cerca de la barra de procesados)

### Comportamiento del estado

- **Solo dos estados visibles** en el texto: "En proceso" y "Finalizado".
- **Aparecen solo cuando el técnico agarra el pedido** desde el panel del operador. Antes de eso, no se muestra texto de estado, solo el resto de los elementos de la card.
- **Posición:** cerca de la barra de procesados (arriba o debajo, no en una esquina).

### Layout de Mis órdenes en la pantalla

- **Desktop:** 2 cards completas visibles + indicador "ver más" (ej. "Ver 3 órdenes más" o similar) para acceder al resto sin scroll.
- **Mobile:** stack vertical, scroll natural.

### Comportamiento con muchas órdenes históricas

- **Vista por defecto:** todas las órdenes activas + finalizadas de los **últimos 7 días**.
- **Las finalizadas más viejas que 7 días se ocultan automáticamente** del view principal.
- **Acceso al historial completo:** botón "Ver órdenes anteriores" que abre un **modal** con la lista completa, búsqueda y paginación. (Comportamiento interno del modal — búsqueda exacta, ordenamiento, paginación — se decide cuando se diseñe el modal específicamente.)

### Estado vacío (cliente sin órdenes históricas)

Mensaje plano simple: "Aún no tenés órdenes. Tu primera orden aparecerá acá." Sin ilustraciones ni elementos decorativos. Cuando aparece la primera orden, el texto se reemplaza por la card.

### Actualización en vivo

- Mis órdenes se actualiza automáticamente vía SSE (`/api/portal/orders/events`).
- **No hay botón "Actualizar" manual.**
- Si la conexión SSE se cae, indicador discreto "Sin conexión, intentando reconectar…" en la sección (posición visual exacta a definir cuando se diseñe la pantalla).

### Transición visual cuando el cliente apreta "Equipo conectado"

- **Card aparece en Mis órdenes con animación slide-in** (suave, ~300-500ms).
- **Paneles 1-2-3 se descongelan instantáneamente** (sin animación, cambio inmediato).
- **Panel 4 cambia instantáneamente** al estado de orden activa.
- No hay mensaje confirmatorio adicional (se quitó por redundancia con "Comprobante validado ✓" en panel 3).

---

## Login y onboarding

- **Login es previo a la pantalla principal.** Si un cliente no logueado intenta acceder a la URL de la pantalla principal, redirige al login.
- **Modo express sin login** sigue siendo línea de producto futura (input crudo del HANDOFF, NO se trabaja acá).
- **Sin onboarding** para clientes primerizos en versión inicial. El cliente B2B técnico de tienda descubre el flujo intuitivamente. Si en producción se ve que clientes se pierden, se puede sumar onboarding después como mejora.

---

## Lo que cambia respecto del HANDOFF v1.7 (vigente desde sesión 11) y v1.8 (vigente desde sesión 12)

### 1. La pregunta #5 del paso 1 (vista desktop) queda cerrada en concepto

La pregunta original era: *"¿Desktop tiene sidebar de estado de orden o es full-width como mobile?"*

**Respuesta:** ninguna de las dos. En desktop, lo que pasa es que panel 1 deja de ser una pantalla y pasa a ser una columna dentro de la pantalla principal. Los 4 paneles en una fila horizontal. Mis órdenes debajo. No hay sidebar separada — Mis órdenes ocupa el ancho completo abajo.

La pregunta #5 queda cerrada conceptualmente. La traducción concreta a la spec del panel 1 se hace en sesión 13.

### 2. Las specs de paso 1, 2, 3, 4 individuales dejan de ser specs de pantallas

Pasan a ser specs de **paneles dentro de la pantalla principal**. La spec `paso-1-precio.md` v1.1 ya tiene contenido válido (qué pills, cómo se ve el card estimado, decisiones #1 a #8 de sesión 10). Lo que cambia es su "envoltorio": ya no es una pantalla independiente, es la columna 1 de la pantalla principal.

Misma situación pendiente para los paneles 2, 3 y 4 cuando lleguen sus specs (sesiones 13-14).

### 3. Las decisiones firmes que tocan multi-orden y timer paso 4 quedan en revisión

El HANDOFF tiene decisiones firmes que asumían el modelo viejo:

- **Multi-orden:** "Permitir nuevas EXCEPTO si hay órdenes en `ESPERANDO_PAGO` o `PAGO_RECHAZADO`." Esta decisión se vuelve incompatible con el modelo nuevo, donde el bloqueo viene del estado "congelado/descongelado" de los paneles, no de un check sobre órdenes existentes. La regla nueva es más simple: mientras los paneles 1-2-3 estén congelados, no se puede armar pedido nuevo. Cuando se descongelan, sí.

- **Timer paso 4 de 2 min:** sin cambios todavía. El modelo nuevo no contradice el timer; solo cambia dónde vive (panel 4, no pantalla 4). Sigue como estaba hasta que la spec del sistema de tiempos lo redefina.

- **Lock pricing 15 min:** sin cambios todavía. Sigue como estaba.

### 4. El plan de lanzamiento se reorganiza

Plan vigente desde sesión 12 (cierre de las 10 OQ):

- Sesión 12: cierre de 10 OQ + base conceptual completa ✅
- Sesión 13: spec formal del panel 1 (a partir de `paso-1-precio.md` v1.1) + spec del panel 2 + spec de Mis órdenes
- Sesión 14: spec del panel 3 (incluye corrección USDT/Binance Pay) + spec del panel 4 + mockups HTML standalone
- Sesión 15: implementación de la pantalla principal completa
- Sesión 16: QA final cliente (incluye reintento escenario 4 B-008)

La cadencia exacta la define Bryam. Sigue sin haber urgencia comercial.

---

## Open questions — TODAS CERRADAS (sesión 12)

Las 10 OQ identificadas en v0.1 fueron resueltas en sesión 12. Resumen del estado:

| OQ | Tema | Estado |
|---|---|---|
| OQ-1 | Layout y composición de cards de Mis órdenes | ✅ Cerrada |
| OQ-2 | Comportamiento con muchas órdenes históricas | ✅ Cerrada |
| OQ-3 | Cómo funciona "Abortar proceso" | ✅ Cerrada (sub-2 sobre dinero PAUSADA → política de reembolso) |
| OQ-4 | Texto del botón panel 4 con comprobante validado | ✅ Cerrada — "Equipo conectado" |
| OQ-5 | Transición visual al completar pedido | ✅ Cerrada (5 sub-decisiones) |
| OQ-6 | Mecanismo de actualización en vivo | ✅ Cerrada — solo SSE, sin botón manual |
| OQ-7 | Comprobante rechazado en detalle | ✅ Cerrada (4 sub-decisiones) |
| OQ-8 | Espera del técnico durante validación | ✅ Cerrada (3 sub-decisiones). **Reabierta y re-cerrada en sesión 14**: se quitó "Esperando validación…" del panel 4. Estado 2 = igual al 0/1. |
| OQ-9 | Pantalla principal y login | ✅ Cerrada (3 sub-decisiones) |
| OQ-10 | Botón Solicitar Redirector v2.5 | ✅ Cerrada — descarga directa, persistente en panel 4 |

---

## Sub-preguntas abiertas que emergieron en sesión 12 (no son nuevas OQ del archivo, son detalles para futuras specs)

1. **Posición visual exacta del indicador "Sin conexión SSE"** (de OQ-6) — se decide cuando se diseñe la pantalla principal con sus mockups HTML (sesión 14).
2. **Comportamiento dentro del modal de historial** (de OQ-2) — búsqueda, paginación, ordenamiento — se decide cuando se diseñe el modal específicamente (sesión 13 con spec de Mis órdenes).
3. **Lista exacta de motivos de rechazo de comprobante** (de OQ-7 sub-1) — la lista preliminar es Monto incorrecto · Comprobante ilegible · Cuenta destino equivocada · Comprobante duplicado · Fecha inválida · Otros. Se refina cuando se haga la spec del panel operador.
4. **Posición exacta del estado "En proceso"/"Finalizado" dentro de la card** — arriba o debajo de la barra de procesados — se decide cuando se haga el mockup HTML.

---

## Decisiones cruzadas que afectan otras specs

### Spec del panel operador (sesión futura)

- **Dropdown de motivos de rechazo + campo libre opcional** para que el técnico registre el motivo cuando rechaza un comprobante.
- **Mecanismo de "agarrar pedido"** que cambia card de Mis órdenes a "En proceso" en el lado cliente.
- **Notificación de abort** al técnico (alerta inmediata) y al operador (registro).
- **Sistema de generación de comprobante final ("Recibo de operación")** — botón ya existe en código, solo cambia el nombre.

### Spec del sistema de tiempos / lock pricing (input crudo del HANDOFF)

Pendientes acumuladas en sesión 12:
- "Precio asegurado" y "vencimiento" en card de Mis órdenes (pausados).
- Resolver duplicación con contador del panel 3 (lock pricing pre-pago).
- Pregunta abierta: ¿lock pricing aplica pre-pago, post-pago, ambos?
- Caso borde "técnico desconectado" en validación de comprobante (espera anormalmente larga).

### Spec de política de reembolso (input crudo del HANDOFF)

Pendientes acumuladas en sesión 12:
- Qué pasa con el dinero al abortar (por estado de la orden).
- ¿Reembolso automático en USDT/transferencia/Yape, o crédito interno?
- ¿Hay diferencia entre abortar antes/durante "En proceso"?
- ¿Hay tiempo límite o costo de cancelación?
- ¿El abort dispara reembolso automático o requiere aprobación del operador?

---

## Lo que NO se resuelve en este archivo

Este archivo es base conceptual con OQ cerradas, **no** spec formal con las 8 piezas. Los siguientes ítems se desarrollan en sesiones siguientes:

- **Mockup HTML standalone** de la pantalla principal completa (sesión 14).
- **Estados detallados** de cada panel con sus transiciones (sesiones 13-14, panel por panel).
- **Edge cases** específicos por panel.
- **Responsive** detallado.
- **Acceptance criteria** para implementación.
- **Spec del Centro de configuración** y sus 8 sub-secciones.
- **Spec del flujo de comprobantes en panel operador** (hallazgo abierto sesión 9 — cruza con este modelo pero requiere spec propia).

---

## Changelog

- **v0.1** (2026-05-03) — Sesión 11. Borrador inicial del modelo de pantalla principal cliente con 4 paneles paralelos + Mis órdenes. Base para spec formal en sesión 12.
- **v1.0** (2026-05-03) — Sesión 12. Cierre de las 10 open questions (OQ-1 a OQ-10). Decisiones del bloque A (mecánica del flujo: OQ-4, OQ-5, OQ-7, OQ-8), bloque B (Mis órdenes: OQ-1, OQ-2, OQ-3) y bloque C (integraciones: OQ-6, OQ-9, OQ-10) integradas. Descubrimientos nuevos registrados: rediseño del Redirector v2.5 (descarga directa libre), comportamiento del estado en card (solo "En proceso"/"Finalizado", aparece cuando técnico agarra), 6 estados visibles del panel 4. Sub-decisiones cruzadas trasladadas a specs futuras (panel operador, sistema de tiempos, política de reembolso).
- **v1.1** (2026-05-04) — Sesión 14. **OQ-8 reabierta y re-cerrada con decisión nueva**: el panel 4 estado 2 ya no muestra "Esperando validación…" + spinner. Queda igual al estado 0/1. La señal de validación vive en panel 3 ("Comprobante recibido ✓") + paneles 1-2-3 congelados. Tabla de estados del panel 4 actualizada. **Sistema de breakpoints unificado documentado** (decisión heredada del rediseño responsive del portal viejo): mobile <640px (1 col) → tablet 640px (2 cols) → laptop 900px (4 cols) → ultrawide 1800px (max-width 1400px). Los paneles NO tienen ancho fijo 400px — son fluidos dentro del breakpoint. La spec formal completa del panel 4 (con las 8 piezas) vive ahora en `panel-4-conexion.md` v1.0 (entregada misma sesión 14).
