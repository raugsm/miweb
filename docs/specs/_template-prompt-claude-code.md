# Templates de prompts para Claude Code

**Para qué sirve este archivo:** estandarizar cómo el Claude del chat le pasa trabajo a Claude Code. Sin estos templates terminamos saltando etapas del proceso (ver bitácora en `HANDOFF.md`).

**Regla básica:** todo cambio se le pide a Claude Code en **dos pasos**, no uno.

```
Paso 1: Análisis (Template A)  →  Bryam revisa  →  Paso 2: Implementación (Template B)
```

**Excepciones donde podés ir directo a Template B:**
- Spec ya tiene plan de commits validado (como cuando arrancamos commit 1, 2, 3 de la spec del operador)
- Es continuación de un análisis ya hecho en el chat (Bryam vio dependencias y dio luz verde)

**Si dudás, andá por Template A.** Cuesta 1 vuelta extra y te ahorra bugs como los 16 actuales.

---

## Template A — Análisis previo / Discovery

**Cuándo usar:**
- Eliminar código existente
- Modificar comportamiento que ya está en producción
- Cualquier "limpieza" o "refactor"
- Cuando no sabés qué dependencias tiene lo que vas a tocar
- Cuando el cambio toca más de un archivo y no tenés claro cuáles
- Cuando la spec dice "verificar si X existe" o tiene ambigüedades

**Estructura:**

```
[CONTEXTO BREVE — 2-3 líneas]
[CAMBIO PROPUESTO — qué quiere hacer Bryam y por qué]

ANTES de tocar código, hacé un análisis y devolveme un reporte. NO escribas código todavía.

Para cada elemento a modificar, devolveme:

A) UBICACIÓN — archivo(s) y líneas exactas donde se define/renderiza
B) DEPENDENCIAS — qué otros archivos/funciones lo referencian, importan o llaman
C) DATOS ASOCIADOS — si persiste algo en data/users.json, si tiene endpoints backend dedicados, si está en algún audit log
D) EFECTOS COLATERALES — qué se rompe si se elimina/modifica sin cuidado
E) RIESGO — bajo / medio / alto + razón
F) RECOMENDACIÓN — eliminar limpio / refactorizar / dejar como está / otra opción

Si durante el análisis encontrás otras cosas raras (código muerto, imports innecesarios, bugs latentes), reportalas en una sección separada "Hallazgos adicionales".

No toques nada todavía. Solo leé y reportá.
```

**Ejemplo concreto del proyecto (sesión 7, commit 5b):**

```
Bryam encontró 3 cosas en el panel FRP Express que quiere limpiar después del commit 5 (c00df85). ANTES de tocar código, necesito que hagas un análisis completo y me devuelvas un reporte. No escribas código todavía.

Las 3 cosas a analizar:

1. PANEL VIEJO DUPLICADO — las 8 lanes (Nuevas/Pago-comprobante/Preparacion/...) que quedaron junto al panel nuevo después del commit 5.

2. "CREAR ORDEN MANUAL" — el acordeón en el panel FRP Express. Bryam confirmó que no lo usan.

3. "COSTOS FRP" — la sección con tabla de proveedores. Mantener funcional pero colapsada bajo acordeón.

Para cada una, devolveme:
A) Ubicación exacta
B) Dependencias
C) Datos asociados
D) Efectos colaterales
E) Riesgo
F) Recomendación

Si encontrás otras cosas raras del commit 5, reportalas en "Hallazgos adicionales".

No toques nada. Solo leé y reportá.
```

---

## Template B — Implementación con luz verde

**Cuándo usar:**
- Después del análisis de Template A, con scope confirmado
- Cuando arrancás commits según un plan ya validado (ej. commits backend de una spec aprobada)
- Para cambios chicos donde Bryam ya vio el código y aprobó

**Estructura:**

```
[CONTEXTO — qué cambio es y dónde encaja]
[REFERENCIA — link a la spec en docs/specs/ que aplica]

SCOPE DEL COMMIT:
- [Qué se hace exactamente, en bullet points]
- [Acceptance criteria de la spec que cubre, por número]

RESTRICCIONES:
- npm test debe seguir pasando
- Self-contained y revertible
- No tocar [lista de cosas que NO se tocan]
- [Otras restricciones específicas]

MÉTODO:
- [Confirmación entre commits sí/no, dónde stop]
- [Cómo valida Bryam: en local / con screenshot / con tests]

Si encontrás ambigüedad nueva durante implementación, parás y preguntás. NO improvises.

Cuando termines, mensaje "[X] listo" y esperá validación antes de seguir.
```

**Ejemplo concreto del proyecto (sesión 7, commit 5):**

```
Implementá commit 5: rediseño visual del panel FRP Express.

Spec de referencia: docs/specs/operador/operador-frp-express.md (v1.1)
Mockup de referencia: docs/specs/operador/mockups/operador-frp-express.html

SCOPE DEL COMMIT:
- Reemplazar renderFrp() en public/app.js (~70 LOC actuales)
- Agregar handlers nuevos (take específico, vipFilter, modal Ver comprobante)
- CSS nuevo del layout vertical con tokens del mockup (--bg-page #F5F4ED, etc.)
- Cubre AC #1-7, #10-11, #14, #18-22, #27-29, #31-35, #37-38

RESTRICCIONES:
- npm test debe pasar
- Filtro VIP es client-side puro, no inventes endpoint nuevo
- Modal Ver comprobante: reusar uno existente si hay, sino crear simple
- No tocar backend
- No tocar otras tabs del panel operador

MÉTODO:
- STOP al final del commit. Avisame "commit 5 listo" y esperá que Bryam valide en local antes de avanzar.

Si encontrás ambigüedad, parás y preguntás. No improvises.
```

---

## Template C — Subir archivos al repo

**Cuándo usar:** al final de cada sesión, cuando Bryam descargó archivos nuevos a `C:\Users\Bryams\Desktop\AriadGsm\files1\`.

**Estructura:**

```
Tengo archivos en C:\Users\Bryams\Desktop\AriadGsm\files1\ que necesito que muevas al repo.

[ACLARAR si reemplazan versiones anteriores o son nuevos]

Mapping (origen → destino):
- [archivo1.md]  → docs/specs/ruta/archivo1.md  [REEMPLAZA vX.X / NUEVO]
- [archivo2.html] → docs/specs/ruta/mockups/archivo2.html  [renombrar quitando "-mockup"]

Pasos:
1. Verificar/crear directorios necesarios
2. Copiar a destinos (sobrescribir si reemplaza)
3. Renombrar mockups quitando "-mockup" si aplica
4. git add docs/specs + git commit con mensaje "[mensaje claro]"
5. NO push, solo commit local

Cuando termines, decime qué archivos copiaste y si hubo problemas.
```

---

## Cómo elegir el template correcto

Diagrama de decisión rápido:

```
¿Qué tipo de cambio es?

├── Subir archivos generados al repo
│   └── Template C
│
├── Cambio que toca código existente o nuevo
│   │
│   ├── ¿Hay análisis previo aprobado por Bryam?
│   │   ├── SÍ → Template B
│   │   └── NO → Template A primero
│   │
│   ├── ¿Es un commit dentro de un plan ya validado?
│   │   └── SÍ → Template B
│   │
│   └── ¿Tenés dudas?
│       └── Template A (siempre la opción segura)
```

---

## Reglas para todos los templates

1. **Siempre referenciá los archivos relevantes**: `docs/specs/HANDOFF.md` + la spec específica que aplique. Claude Code arranca cada sesión limpio, no asume contexto.

2. **Siempre incluí "si encontrás ambigüedad, parás y preguntás"**. Esa frase salva bugs.

3. **Nunca pidas más de un commit en un solo prompt**. Un commit = un alcance = un prompt.

4. **Siempre cerrá con cómo se valida**: en local, con tests, con screenshot, con review en chat. Sin criterio de validación, no hay test.

5. **Si el cambio es grande (>200 LOC o >3 archivos), considerá si conviene partirlo en 2 commits.** Si sí, planeá los dos prompts antes de mandar el primero.

---

## Anti-patrones (qué NO hacer)

❌ "Implementá X" sin contexto, sin referencias, sin scope claro
❌ "Limpiá lo que no se usa" — vago, no actionable, alto riesgo
❌ "Aprovechá y arreglá Y mientras tanto" — scope creep
❌ "Hacé esto rápido que es simple" — pedido de saltar análisis
❌ "Confiá en tu criterio" sin haber dado restricciones — invitación a improvisar
❌ Mandar prompt de implementación sin spec persistida en repo

---

**Si dudás entre dos templates, elegí el más conservador.** Cuesta más tiempo pero evita los 16 bugs que ya están en cola.
