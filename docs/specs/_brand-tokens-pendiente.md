# Brand tokens — pendiente para sesión de polish

**Estado:** capturado, no implementado.
**Cuándo se trabaja:** después de Fase 1 (recibir + procesar pedidos firme).
**Decisión tomada:** sesión 7, opción A2.

---

## Contexto

Bryam compartió su logo de marca y pidió aplicar la identidad visual a toda la web sin perder los colores vívidos que dan sentido a la página.

Después de discutir alcance y momento, se decidió:

- **NO aplicar retroactivamente** a los mockups validados en sesiones 1-6 (paso 1, 2, 3, 4, operador FRP Express).
- **NO bloquear** los commits 6 y 7 que están en vuelo en sesión 7.
- **SÍ tratar** como sesión específica de "polish visual" después de que Fase 1 esté firme.

---

## Logo de referencia

Bryam compartió el logo en sesión 7. Es texto "ARIAD GSM" con la siguiente estructura visual:

- Palabra "ARIAD" en blanco sobre fondo azul rectangular
- Palabra "GSM" en azul sobre fondo blanco (al lado)
- Color principal: **azul vivo** (parecido al hex actual `#185FA5` que usamos en mockups, pero no idéntico — pendiente medirlo)
- Tipografía sans-serif bold, condensada

**Pendiente:** medir el color exacto del logo (con eyedropper sobre la imagen original) y comparar con `#185FA5`.

---

## Lo que tenemos hoy

Los mockups actuales usan estos tokens (ver `operador-frp-express.html` y `paso-1-precio.html`):

```css
--primary: #185FA5;      /* azul botones primary */
--primary-light: #E6F1FB; /* azul claro fondo */
--primary-border: #B5D4F4; /* azul borde sutil */
```

Más colores semánticos (success/warning/danger), neutros (texto, fondos, bordes) y específicos (VIP dorado).

**Hipótesis a validar en sesión de polish:** el azul del logo está muy cerca del `#185FA5` actual, así que el cambio retroactivo puede ser mínimo. Pero hay que medirlo.

---

## Qué se hace en la sesión de polish (futura)

1. Medir color exacto del logo de Bryam (eyedropper sobre imagen)
2. Buscar fuentes externas de design systems con un solo color de marca + neutros (referencias: Stripe, Linear, Figma)
3. Definir paleta completa:
   - Primary (del logo)
   - Acento secundario (¿necesario?)
   - Neutros (escala de grises)
   - Semánticos (éxito, alerta, error, info)
   - Específicos (VIP dorado, etc.)
4. Definir tipografía (¿usar la del logo o una más legible para body?)
5. Aplicar retroactivamente a:
   - Mockups del cliente (paso 1, 2, 3, 4)
   - Mockup del operador FRP Express
   - Cualquier mockup nuevo que haya en ese momento
6. Generar prompt para Claude Code que actualice los CSS variables del repo
7. Validar visualmente en local

---

## Por qué postergamos

- El logo es **un solo color**. Definir un sistema completo a partir de un solo color requiere decisiones de diseño que no salen del logo (acento secundario, semánticos, etc.). Mejor dedicar sesión específica.
- Los mockups actuales ya tienen un azul muy parecido. Cambio retroactivo puede ser mínimo o invisible visualmente — necesitamos medir antes de mover.
- La implementación de Fase 1 está en vuelo (commits 5b, 6, 7 pendientes). Cambiar tokens visuales ahora abre 6 mockups + 4 sesiones de discusión a reabrirse. Mejor cerrar Fase 1 primero.
- Después de Fase 1, sitio ya funciona. La sesión de polish es "capa de pulido" sobre algo que ya gira, no decisión bloqueante.

---

## Pendientes para esta sesión futura

- [ ] Bryam comparte el logo en formato editable (SVG si tiene, sino PNG de alta resolución)
- [ ] Medir hex exacto del azul del logo
- [ ] Comparar con `#185FA5` actual y decidir si se cambia o se mantiene
- [ ] Definir si necesitamos color de acento secundario o solo el azul + neutros
- [ ] Decidir tipografía (¿de body, de títulos, ambas?)
- [ ] Hacer mini-spec de tokens con archivo `brand-tokens.md` y mockup de muestra
- [ ] Aplicar retroactivamente con prompt a Claude Code
