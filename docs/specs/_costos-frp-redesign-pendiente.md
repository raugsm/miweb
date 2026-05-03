# Costos FRP — rediseño visual pendiente

**Estado:** capturado, no implementado.
**Cuándo se trabaja:** después de Fase 1 (cliente + operador firmes y lanzados).
**Decisión tomada:** sesión 7.

---

## Contexto

La sección "Costos FRP" del panel operador (donde se configuran proveedores Krypto/XFP/Manual/Phoenix Service Tool con sus costos USDT, modos, estados, política de pricing) tiene un layout cargado y desalineado con el resto del panel rediseñado en commits 5/5b/6.

En sesión 7 se eliminaron los 8 contadores duplicados, el botón "Crear orden manual", el botón "Actualizar" y se colapsó la sección bajo acordeón. Pero el **contenido interno** del acordeón (la tabla de proveedores + formulario de política) sigue con el estilo viejo.

Bryam pidió rediseñarlo "al mismo estilo de los mockups que venimos creando" (cards con bordes suaves, tipografía clean, tokens del mockup `--bg-card #FFFFFF`, etc.).

---

## Por qué se postergó

1. **No es bloqueante para el lanzamiento.** Jack y Angelo no usan Costos FRP en el día a día — solo Bryam lo toca cada tanto para configurar pricing. Que sea fea no afecta operación diaria.

2. **Es trabajo de diseño, no de cleanup.** La tabla actual tiene 4 proveedores × 7 columnas (Estado, Modo, USDT fijo, Créditos, USDT/crédito, Motivo, Acción) más la política arriba (Ganancia objetivo, Límite delegado, Guardar política, Pending changes panel). Rediseñarla requiere decisiones de layout, jerarquía visual, qué se ve por default y qué se esconde. No se "limpia rápido".

3. **Necesita su propio mockup HTML** antes de implementar. Igual que paso 1 cliente y operador FRP Express. Sin mockup, es improvisación garantizada.

4. **Sesión 8 y 9 son críticas para lanzamiento.** Sesión 8 = 5 commits con 16 bugs cliente. Sesión 9 = QA integral. No conviene meter rediseño Costos FRP entre medio.

---

## Estado actual del código (después de commit 5b/6/6b)

- HTML: `<details class="frp-costs-collapsed"><summary>Costos FRP</summary><div id="frp-pricing-box"...></div></details>` en `public/index.html`
- JS render: función `renderFrpPricingBox` en `public/app.js:1186-1331`
- Endpoints backend (NO se tocan):
  - `PATCH /api/frp/pricing/policy`
  - `POST /api/frp/pricing/providers`
  - `PATCH /api/frp/pricing/providers/:id`
  - `POST /api/frp/pricing/providers/:id/archive`
  - `GET /api/frp/pricing/pending-changes`
  - `POST /api/frp/pricing/pending-changes/:id/approve|reject`

El comportamiento funcional **se mantiene** — el rediseño es puramente visual.

---

## Qué se hace en la sesión de rediseño (futura)

1. **Auditar el contenido actual** con Claude Code: qué campos hay, qué interacciones, qué validaciones, qué estados (loading, error, pending changes, etc.).

2. **Definir información jerarquía:**
   - ¿Qué se ve siempre? (Probablemente: proveedor activo + precio normal en vivo)
   - ¿Qué se ve solo al expandir? (Tabla detallada de todos los proveedores, política, pending changes)
   - ¿Qué se ve solo a admins vs coordinadores?

3. **Hacer mockup HTML standalone** con el estilo del resto del operador (cards, bordes 0.5px, tokens `--bg-card`, tipografía clean, etc.). Validar con Bryam.

4. **Escribir spec completa** (8 piezas: mockup, estados, edge cases, responsive, comportamiento, datos, AC, OQ).

5. **Implementar con Claude Code** siguiendo el proceso Plan → Design → Implement → Test → Review.

---

## Pendientes para esta sesión futura

- [ ] Confirmar con Bryam si esta sesión va antes o después de la sesión de polish visual con logo (decisión A2 en `_brand-tokens-pendiente.md`)
- [ ] Auditar el código actual de `renderFrpPricingBox` con Claude Code: qué hace, qué valida, qué dispara
- [ ] Decidir jerarquía de información (qué siempre visible, qué bajo expand)
- [ ] Diseñar mockup HTML con tokens del operador
- [ ] Escribir spec completa
- [ ] Implementar y validar

---

## Relación con otras specs pendientes

- **`_brand-tokens-pendiente.md`** — sesión de polish visual con logo. Si la paleta cambia (probablemente no, pero hay que medir), conviene hacer el rediseño Costos FRP **después** del polish para usar los tokens correctos directamente.
- **Tools/billeteras** — spec separada que también toca pricing pero del lado de "qué herramienta usa el técnico para procesar". Es ortogonal a Costos FRP (que es pricing al cliente).

---

## Archivos a leer antes de retomar

1. `docs/specs/HANDOFF.md` (siempre primero)
2. Este archivo
3. `_brand-tokens-pendiente.md` para alinear con la sesión de polish
4. `public/app.js:1186-1331` para ver el código actual
5. Screenshots/imágenes de Bryam mostrando cómo se ve hoy (si quedaron en el chat)
