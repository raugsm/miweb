# Pantalla principal cliente

**Versión:** 0.1 · **Fecha:** 3 de mayo 2026 · **Estado:** BORRADOR INICIAL. NO es spec lista para implementación. Es la base conceptual descubierta en sesión 11. La spec formal con las 8 piezas se desarrolla a partir de sesión 12.

---

## Por qué existe este archivo

Hasta sesión 10 inclusive, la web cliente se diseñaba como **flujo lineal de 4 pasos** (paso 1 → paso 2 → paso 3 → paso 4), donde cada paso era una pantalla propia con su spec individual. Bajo ese modelo, ya estaban planificadas 4 specs separadas: `paso-1-precio.md`, `paso-2-solicitud.md`, `paso-3-pago.md`, `paso-4-conexion.md`.

En sesión 11 Bryam reveló que el modelo real es distinto. La pantalla cliente no es una secuencia de pasos. Es **una pantalla única con 4 paneles paralelos visibles a la vez**, más una zona de seguimiento ("Mis órdenes") debajo. El cliente puede trabajar en cualquier panel en el orden que quiera, con preselecciones por defecto que le permiten ir directo a pagar si es un cliente repetidor experto.

Este archivo registra ese descubrimiento como base conceptual. Las specs por panel (panel 1, panel 2, panel 3, panel 4) y la spec de "Mis órdenes" se desarrollan después, basadas en este marco. La spec `paso-1-precio.md` v1.1 que ya existe se reescribe en sesión 12 como spec del panel 1.

---

## Cómo se descubrió este modelo

Sesión 11 arrancó con plan de procesar el "modelo de órdenes paralelas" descubierto en sesión 10. Durante la entrevista para entender el modelo de uso real:

1. Se descubrió que existen **dos comportamientos legítimos del cliente** (agrupado y encadenado), no uno solo como sugería el HANDOFF v1.7.
2. Se descubrió un **tercer modelo** ("atajo de pago") — clientes expertos repetidores que quieren ir directo a pagar sin pasar por panel 1 ni 2.
3. Se descubrió un **cuarto caso** ("abortar orden") — cliente final se arrepiente, técnico necesita cancelar una orden ya pagada o conectada.
4. Bryam aportó dos mockups visuales que mostraron que su modelo mental NO es de "pasos secuenciales con saltos permitidos", sino de **paneles paralelos visibles simultáneamente**. Eso colapsó las preguntas anteriores y abrió un marco nuevo.

El Claude del chat aplicó la regla #13 del HANDOFF (descubrimientos conceptuales a mitad de spec → pausar lo dependiente y registrar). En lugar de seguir el plan original de 5 etapas, se dedicó la sesión 11 entera a entender el modelo de uso. Los mockups de Bryam funcionaron como "fuente de verdad reference-driven" según regla #1.

---

## El modelo de 4 paneles + Mis órdenes

### Layout general (desktop)

Dos zonas apiladas verticalmente:

**Zona 1 (arriba) — "Pedido actual":** los 4 paneles paralelos, en una fila horizontal.
- Panel 1: Método de pago
- Panel 2: Solicitud (cantidad de equipos + modelo opcional)
- Panel 3: Pago (totales + cuentas + dropzone de comprobante)
- Panel 4: Conexión (códigos + Redirector + estado)

**Zona 2 (abajo) — "Mis órdenes":** lista de cards horizontales con todas las órdenes que el cliente ya tiene en seguimiento. Incluye órdenes en proceso y órdenes finalizadas.

### Layout en mobile

Los 4 paneles se apilan verticalmente como stepper. Mis órdenes va debajo, también en stack vertical.

### Mockups de referencia

- **Mockup 1** (sesión 11): vista desktop con los 4 paneles paralelos, sin sección Mis órdenes visible. Estado en pleno proceso (panel 4 con "Pago confirmado, tu orden está activa", botón "Solicitar Redirector v2.5" activo).
- **Mockup 2** (sesión 11): vista desktop con los 4 paneles paralelos arriba + sección "Mis órdenes" abajo. Mis órdenes muestra dos cards: una en estado "Listo para conexión" y otra "Finalizado".

Ambos mockups quedan archivados en el chat de sesión 11. Pendiente: convertirlos en archivos HTML standalone en `docs/specs/cliente/mockups/` durante sesión 12.

---

## Concepto clave — "congelar / descongelar" en lugar de "candado"

En sesiones anteriores se usaba el lenguaje de "candados" (íconos visibles en cada paso). En sesión 11 Bryam descartó ese lenguaje visual por anticuado. Se reemplaza por el concepto de **congelar/descongelar paneles**: mecanismo invisible que impide al cliente modificar paneles 1, 2 y 3 en ciertos momentos.

**Mecánica completa:**

1. **Estado inicial.** Paneles 1, 2 y 3 editables. Panel 4 inactivo (sin botón visible).

2. **Cliente sube comprobante en panel 3.** Inmediatamente se **congelan** los paneles 1, 2 y 3. El cliente no puede modificar nada de eso. Pasa a estar a la espera de que el técnico revise el comprobante.

3. **Técnico revisa comprobante en su panel.** Dos caminos:

   **Camino A — Comprobante válido:**
   - Paneles 1, 2 y 3 **siguen congelados**.
   - En panel 4 aparece un botón (nombre tentativo: "Conexión lista" o similar; nombre exacto se decide en spec formal).
   - Cliente aprieta ese botón. **Recién ahí:**
     - Se crea la orden en "Mis órdenes" (zona de abajo).
     - Se descongelan paneles 1, 2 y 3.
     - El cliente queda libre para arrancar un pedido nuevo si quiere.

   **Camino B — Comprobante rechazado:**
   - Aparece alerta en panel 3 ("comprobante rechazado" o similar).
   - Paneles 1, 2 y 3 se descongelan inmediatamente.
   - Panel 4 NO se activa (no aparece botón).
   - Cliente puede modificar lo que quiera y reintentar.

### Implicancia conceptual: cuándo "nace" una orden

Antes de sesión 11, en el HANDOFF y el código, "orden" era cualquier cosa que el cliente arrancara desde el primer clic en paso 1. En sesión 11 Bryam aclaró que su modelo mental es distinto: una orden **nace** recién cuando el cliente aprieta el botón del panel 4 con comprobante validado. Antes de eso, lo que existe es un "pedido en armado" o "pedido en revisión", pero no una orden propiamente dicha.

Esto define que la sección "Mis órdenes" muestra solo entidades que cruzaron ese umbral. Pedidos en armado o pedidos cuyo comprobante fue rechazado y nunca se reenvió no aparecen ahí.

### Implicancia conceptual: por qué no hay 2 pedidos en armado a la vez

El estado "congelado" garantiza que el cliente nunca tenga 2 pedidos en armado simultáneamente. Cuando un comprobante está siendo revisado o esperando que el cliente apriete el botón del panel 4, los paneles 1, 2 y 3 están bloqueados. Lo que el cliente puede tener simultáneamente es **1 pedido en armado activo + N órdenes ya en seguimiento abajo**.

Esto reemplaza el concepto previo del HANDOFF de "múltiples órdenes en paralelo". El paralelismo no está en "pedidos en armado", sino en "órdenes en seguimiento" mientras el cliente arma una nueva.

---

## Modelos de uso del cliente (resumen de sesión 11)

### Modelo 1 — Agrupado

Cliente llega con 2 o más equipos a la mano. Hace **un solo pedido** que contiene los N equipos. Paga una vez, sube un comprobante. En el panel de operador aparece **una sola orden** con N equipos adentro.

- Procesamiento uno por uno por el técnico.
- Si un equipo no es soportado, ese equipo individual se cancela; los demás siguen.
- Expectativa del cliente: entrega completa de los N equipos al final.
- Cronómetro (registrado como insumo, NO decisión todavía): único al inicio para conectar el primer equipo. Una vez arrancada la conexión, los N se procesan en cadena. La spec formal del sistema de tiempos lo cierra después.

### Modelo 2 — Encadenado

Cliente arranca con 1 equipo. Mientras el primer pedido está armándose, le llega a la tienda otro equipo. **Antes de pagar:** simplemente sube la cantidad en panel 2, el pedido se agranda. NO crea pedido nuevo.

**Después de subir comprobante:** los paneles 1, 2 y 3 están congelados. No puede agrandar el pedido. Tiene que esperar que el técnico valide el comprobante, luego apretar el botón del panel 4. **Recién ahí** se descongela y puede arrancar otro pedido nuevo desde panel 1.

### Modelo 3 — Atajo de pago

Cliente experto repetidor que conoce la dinámica y no quiere fricción. Quiere ir directo a pagar.

**Resuelto por el layout:** como los 4 paneles están todos visibles a la vez, panel 1 trae preselección por perfil/última pill, y panel 2 tiene cantidad por defecto, el cliente experto puede hacer clic directo en panel 3 sin tocar los anteriores. NO se necesita botón extra "pagar rápido" ni layout especial. El layout en sí ya resuelve el atajo.

### Caso 4 — Abortar orden

Cliente final que llevó el equipo a la tienda se arrepiente y se lo lleva. Técnico necesita cancelar una orden que ya está en seguimiento (puede haber pasado pago, conexión, o ambos). NO sucede a menudo pero pasa varias veces.

**Resolución conceptual:** botón "Abortar proceso" (nombre tentativo, puede ser más corto) en cada card de Mis órdenes. Detalles de cómo funciona el abort (qué pasa con el dinero, qué notifica al técnico/operador, en qué estados es permitido) son spec aparte.

---

## Lo que cambia respecto del HANDOFF v1.7

### 1. La pregunta #5 del paso 1 (vista desktop) queda cerrada en concepto

La pregunta original era: *"¿Desktop tiene sidebar de estado de orden o es full-width como mobile?"*

**Respuesta:** ninguna de las dos. En desktop, lo que pasa es que panel 1 deja de ser una pantalla y pasa a ser una columna dentro de la pantalla principal. Los 4 paneles en una fila horizontal. Mis órdenes debajo. No hay sidebar separada — Mis órdenes ocupa el ancho completo abajo.

La pregunta #5 queda cerrada conceptualmente. La traducción concreta a la spec del panel 1 (qué cambios hay que hacerle a `paso-1-precio.md` v1.1 para reescribirla como "panel 1" en vez de "pantalla paso 1") se hace en sesión 12.

### 2. Las specs de paso 1, 2, 3, 4 individuales dejan de ser specs de pantallas

Pasan a ser specs de **paneles dentro de la pantalla principal**. La spec `paso-1-precio.md` v1.1 ya tiene contenido válido (qué pills, cómo se ve el card estimado, decisiones #1 a #8 de sesión 10). Lo que cambia es su "envoltorio": ya no es una pantalla independiente, es la columna 1 de la pantalla principal.

Misma situación pendiente para los paneles 2, 3 y 4 cuando lleguen sus specs (sesiones 13-15).

### 3. Las decisiones firmes que tocan multi-orden y timer paso 4 quedan en revisión

El HANDOFF tiene decisiones firmes que asumían el modelo viejo:

- **Multi-orden:** "Permitir nuevas EXCEPTO si hay órdenes en `ESPERANDO_PAGO` o `PAGO_RECHAZADO`." Esta decisión se vuelve incompatible con el modelo nuevo, donde el bloqueo viene del estado "congelado/descongelado" de los paneles, no de un check sobre órdenes existentes. La regla nueva es más simple: mientras los paneles 1-2-3 estén congelados, no se puede armar pedido nuevo. Cuando se descongelan, sí. La spec formal de pantalla principal (sesión 12) reemplaza la decisión vieja.

- **Timer paso 4 de 2 min:** sin cambios todavía. El modelo nuevo no contradice el timer; solo cambia dónde vive (panel 4, no pantalla 4). Sigue como estaba hasta que la spec del sistema de tiempos lo redefina.

- **Lock pricing 15 min:** sin cambios todavía. Sigue como estaba.

### 4. El plan de lanzamiento se reorganiza

Antes (HANDOFF v1.7):
- Sesión 12: implementación paso 1 cliente
- Sesión 13: spec + implementación paso 2
- Sesión 14: spec + implementación paso 3 (incluye corrección USDT/Binance Pay)
- Sesión 15: spec + implementación paso 4
- Sesión 16: QA final cliente

Después (sesión 11 cerrada):
- Sesión 12: spec formal de pantalla principal cliente (las 8 piezas) + adaptación de spec del panel 1 (a partir de `paso-1-precio.md` v1.1)
- Sesión 13: spec del panel 2 + spec de Mis órdenes
- Sesión 14: spec del panel 3 (incluye corrección USDT/Binance Pay) + spec del panel 4
- Sesión 15: implementación de la pantalla principal completa (todos los paneles + Mis órdenes)
- Sesión 16: QA final cliente (incluye reintento escenario 4 B-008)

La cadencia exacta la define Bryam. Sigue sin haber urgencia comercial.

---

## Open questions para sesión 12

Estas son las preguntas que quedan abiertas. Cada una se resuelve durante el armado de la spec formal de pantalla principal en sesión 12.

### OQ-1: Layout exacto de "Mis órdenes" en cards

El mockup 2 muestra cards horizontales con: código de orden, cantidad, monto, estado, precio asegurado, vencimiento, barra de progreso. ¿Esa es la composición final, o se ajusta? ¿Cuántas cards se ven a la vez en desktop antes de scroll?

### OQ-2: Comportamiento de "Mis órdenes" cuando hay muchas órdenes finalizadas

Si un cliente tiene 50 órdenes históricas, ¿se muestran todas? ¿Hay paginación? ¿Filtro por estado (activas / finalizadas)? ¿Las finalizadas viejas se ocultan después de N días?

### OQ-3: Cómo funciona "Abortar proceso" exactamente

¿En qué estados de orden está permitido? ¿Qué pasa con el dinero (devolución / crédito / nada)? ¿Qué notifica al técnico u operador? ¿Pide confirmación con un cartel "¿estás seguro?"?

### OQ-4: Texto exacto del botón en panel 4 cuando comprobante es validado

Bryam mencionó "Conexión lista" como nombre tentativo. Necesita decisión formal y consistencia con el resto de copys del flow.

### OQ-5: Qué pasa visualmente cuando un pedido se completa y los paneles "se vacían"

El cliente apretó el botón del panel 4, la orden quedó en Mis órdenes abajo. ¿Los 4 paneles se limpian instantáneamente? ¿Hay alguna animación/transición? ¿Aparece un mensaje "pedido enviado, podés empezar otro"? ¿Las preselecciones del panel 1 (última pill) se mantienen?

### OQ-6: Mecanismo de actualización en vivo

El mockup 2 tiene un botón "Actualizar" en Mis órdenes. ¿Esto es polling manual? ¿Es además de SSE en vivo, por si el SSE se cae? ¿Tiene cooldown? La infraestructura SSE ya existe en el código (`/api/portal/orders/events`). Ver cómo se integra con la pantalla principal nueva.

### OQ-7: Resolución del caso "comprobante rechazado" en detalle

Cuando comprobante rechazado, ¿el cliente ve el motivo del rechazo? ¿Puede abrir un modal con detalle? ¿El comprobante anterior se borra o se queda como "rechazado" visible? ¿Cuántas veces puede reintentar?

### OQ-8: Comportamiento durante la espera del técnico (entre subir comprobante y validación)

Mientras paneles 1-2-3 están congelados esperando que el técnico revise: ¿qué ve el cliente exactamente? ¿Indicador "tu pago está siendo validado"? ¿Tiempo estimado? ¿Posibilidad de cancelar el pedido en armado antes de que el técnico revise?

### OQ-9: Cómo se relaciona la pantalla principal con el login

La pantalla principal asume que el cliente está logueado (modelo principal de Bryam). El "modo express sin login" sigue siendo línea futura. ¿La pantalla de login sigue siendo previa a la pantalla principal? ¿Hay onboarding para clientes nuevos primerizos? ¿Cómo se ve la pantalla principal la primera vez que entra un cliente sin órdenes históricas?

### OQ-10: Qué pasa con "Solicitar Redirector v2.5 por WhatsApp"

El mockup 1 muestra un botón grande "Solicitar Redirector v2.5 por WhatsApp" que aparece en panel 4. ¿Esto es el botón principal del panel 4 o convive con otro botón? ¿Cómo se relaciona con el botón "Conexión lista" de Camino A?

---

## Lo que NO se resuelve en este archivo

Este archivo es base conceptual, no spec formal. Las 8 piezas (mockup HTML, estados detallados, edge cases, responsive, comportamiento, datos, acceptance criteria, open questions) se desarrollan en sesión 12.

Tampoco resuelve:

- Los inputs crudos del HANDOFF que se cruzan con este modelo (sistema de tiempos y alertas, lock pricing 5 vs 15 min, política de reembolso). Esos son specs aparte.
- La spec del Centro de configuración (panel admin) y sus 8 sub-secciones identificadas en sesión 10.
- El flujo de comprobantes en panel operador (hallazgo abierto sesión 9). Cruza con este modelo pero requiere spec propia.

---

## Changelog

- **v0.1** (2026-05-03) — Sesión 11. Borrador inicial del modelo de pantalla principal cliente con 4 paneles paralelos + Mis órdenes. Base para spec formal en sesión 12.
