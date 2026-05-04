# Panel 3 — Datos de pago

**Versión:** 1.0 · **Fecha:** 4 de mayo 2026 · **Estado:** spec formal con las 8 piezas. Lista para implementación pendiente solo del archivo HTML standalone consolidado de la pantalla principal (entregado en la misma sesión 14) y del modal "¿Dónde pegar estos códigos?" que vive en spec del panel 4.

**Reemplaza a:** no había spec previa formal. Hereda decisiones del HANDOFF línea 593 ("paso 3: card TOTAL A PAGAR oscura, header método con icono, cards de cuentas con botón Copiar, lock 15 min azul, banner amarillo 'Revisá pasos 1 y 2', dropzone dasheada") con cambios significativos producto del modelo de paneles paralelos y de las correcciones técnicas pendientes.

---

## Contexto

Es el **panel 3 de los 4 paneles paralelos** que componen la pantalla principal cliente. Es donde el técnico (cliente B2B) ve los datos de la cuenta a la que tiene que pagar, sube su comprobante, y recibe la confirmación o el rechazo.

El panel 3 es el más activo del flujo: cambia visualmente según el método elegido en panel 1, según la cantidad de equipos del panel 2 (que define el monto), y a lo largo de los 6 estados del comprobante (default, subiendo, subido esperando, validado, rechazado, QR abierto).

**Audiencia:** técnico de tienda. Pago anticipado obligatorio antes de procesar el equipo (excepto VIPs postpago, fuera de scope de esta spec).

**Posición en el flow:** columna 3 de la fila horizontal de paneles paralelos (desktop) o tercer panel del stack vertical (mobile). Los paneles 1, 2 y 3 se **congelan** mientras hay un comprobante en revisión, y se **descongelan** cuando el cliente aprieta "Equipo conectado" en panel 4 o cuando el comprobante se rechaza.

---

## 1. Mockup visual

**Estado del mockup:** decisiones visuales validadas en sesión 14 con mockups en chat (6 estados del panel + 5 métodos de pago + modal del Redirector). Archivo HTML standalone se entrega en la misma sesión 14 como parte de los mockups consolidados de la pantalla principal completa.

### Estructura visual (desktop ~400px de ancho, mobile ~340px)

De arriba hacia abajo:

1. **Header:** título "Datos de pago" en 16px, weight 500. Sin numeración delante.
2. **Card oscura "TOTAL A PAGAR":** fondo `#2C2C2A`, label TOTAL A PAGAR en gris claro, fila con bandera del país al costado del monto principal grande (22-30px desktop, 22-26px mobile, weight 500, color blanco).
3. **Card de cuenta del método elegido:** border 0.5px tertiary, padding 12px. Contiene: header con avatar/logo del método + nombre, datos de la cuenta (número, titular, etc., variables según método), botón "Mostrar QR" si el método tiene QR.
4. **(Solo Yape Perú)** Link "Ver otra cuenta Yape" centrado, color info, debajo de la card de cuenta.
5. **Dropzone del comprobante:** rectángulo con borde dasheado, ícono de subida, texto "Subí tu comprobante", sub-texto "JPG, PNG o PDF · máx 5 MB". Cambia drásticamente según el estado (ver §2.4).

**No hay** banner amarillo "Revisá pasos 1 y 2" (descartado en sesión 14 — el modelo de paneles paralelos no requiere recordar pasos previos).

**No hay** contador de "Precio asegurado 15:00 minutos" ni equivalente. El sistema de tiempos completo vive en spec dedicada (ver §3 edge case 12 y la sección final "Decisiones cruzadas").

### Código HTML del mockup default (desktop, Yape Perú, sin comprobante)

```html
<div style="width: 400px; background: var(--color-background-primary); border: 0.5px solid var(--color-border-secondary); border-radius: var(--border-radius-lg); padding: 1.25rem 1.5rem;">

  <h3 style="font-size: 16px; font-weight: 500; margin: 0 0 1rem;">Datos de pago</h3>

  <div style="background: #2C2C2A; border-radius: var(--border-radius-md); padding: 12px 14px; margin-bottom: 1rem;">
    <div style="font-size: 10px; color: #B4B2A9; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">Total a pagar</div>
    <div style="display: flex; align-items: center; gap: 10px;">
      [bandera Perú circular 22x22]
      <div style="font-size: 24px; font-weight: 500; color: white; line-height: 1;">S/ 36.50</div>
    </div>
  </div>

  <div style="border: 0.5px solid var(--color-border-tertiary); border-radius: var(--border-radius-md); padding: 12px; margin-bottom: 8px;">
    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">
      [logo Yape circular morado #642B73 22x22 con "Y" blanca]
      <span style="font-size: 13px; font-weight: 500;">Yape Perú</span>
    </div>
    <p style="font-size: 11px; color: var(--color-text-secondary); margin: 0 0 3px;">Número</p>
    <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; background: var(--color-background-secondary); border-radius: var(--border-radius-md); margin-bottom: 8px;">
      <span style="font-family: var(--font-mono); font-size: 12px; font-weight: 500;">993 357 553</span>
      <button>Copiar</button>
    </div>
    <p style="font-size: 11px; color: var(--color-text-secondary); margin: 0 0 3px;">Titular</p>
    <p style="font-size: 12px; margin: 0 0 12px;">Bryams Zuñiga</p>
    <button style="width: 100%;">Mostrar QR</button>
  </div>

  <p style="text-align: center; font-size: 11px; color: var(--color-text-info); cursor: pointer; margin: 0 0 12px;">Ver otra cuenta Yape</p>

  <div style="border: 0.5px dashed var(--color-border-secondary); border-radius: var(--border-radius-md); padding: 18px 12px; display: flex; flex-direction: column; align-items: center; gap: 4px;">
    [ícono subida 20x20]
    <p style="font-size: 12px; font-weight: 500; margin: 0;">Subí tu comprobante</p>
    <p style="font-size: 10px; color: var(--color-text-secondary); margin: 0;">JPG, PNG o PDF · máx 5 MB</p>
  </div>

</div>
```

### Banderas en card "TOTAL A PAGAR"

Cada bandera al costado del monto es un SVG circular de 22×22px (20×20 mobile). La bandera **identifica la moneda/país del método elegido en panel 1**. NO es decoración — sirve de match visual con la pill seleccionada en panel 1 y con el header de la card en Mis órdenes cuando la orden nazca.

- **Perú:** rojo / blanco / rojo (vertical, tres franjas iguales)
- **México:** verde / blanco / rojo (vertical)
- **Chile:** blanco arriba / rojo abajo + cuadrado azul a la izquierda superior
- **Colombia:** amarillo (mitad superior) / azul (cuarto) / rojo (cuarto, abajo)
- **USDT:** logo Tether (círculo verde `#26A17B` con T blanca)

---

## 2. Componentes y estados

### 2.1 Card oscura "TOTAL A PAGAR"

Card oscura `#2C2C2A` con texto blanco/gris. Estados según contexto:

| Estado | Trigger | Apariencia |
|---|---|---|
| Default fiat | Pill país fiat seleccionada en panel 1 | Bandera + monto en moneda local. Sin conversión a USDT (decisión sesión 14: redundante, el cliente ya eligió moneda) |
| Default USDT | Pill USDT seleccionada en panel 1 | Logo Tether + monto en USDT |
| Sin método elegido | Panel 1 sin pill | Texto "Elegí un método de pago primero" en gris claro, sin monto. Edge case raro porque panel 1 autoelige país por perfil |
| Tasa no disponible | Admin no cargó tasa en Centro de configuración | Mensaje "Tasa no disponible, contactá soporte" en color rojo claro |

**Sin breakdown** "N equipos × S/ Y.YY" — el panel 2 ya muestra eso. Panel 3 solo muestra el total final.

### 2.2 Card de cuenta — comportamiento según método

5 métodos posibles, cada uno con datos distintos. **Solo se muestra la cuenta del método elegido en panel 1** (no se muestran todas las cuentas a la vez).

**Datos visibles por método (datos reales de Bryam):**

| Método | Avatar/logo | Datos de la cuenta | QR disponible |
|---|---|---|---|
| Yape Perú | Círculo morado `#642B73` con "Y" blanca | Número `993 357 553` (sombreado + Copiar) · Titular `Bryams Zuñiga` | ✅ |
| Binance Pay (USDT) | Cuadrado amarillo `#F0B90B` con "B" negra (logo Binance) | Pay ID `564181591` (sombreado + Copiar) · Titular `Ariadgsm` | ✅ |
| México (STP) | Ícono banco genérico | Número de tarjeta `7229 6906 9374 9504 08` (sombreado + Copiar) · Institución `STP` · Beneficiario `Javier Cruz Franco` | ❌ por ahora |
| Colombia (Bancolombia) | Ícono banco genérico | Cuenta de ahorros `00100002771` (sombreado + Copiar) · Beneficiario `Kendy Salazar` | ✅ |
| Chile (Mercado Pago) | Ícono banco genérico | Número de cuenta `1042449240` (sombreado + Copiar) · RUT `179040166` · Cuenta Vista · Beneficiario `Emanuel Iván Alarcón Gómez` · Email `melxcore01@gmail.com` | ❌ por ahora |

**Notas técnicas:**

- México y Chile **no tienen QR todavía** (Bryam está investigando). Cuando se agregue, se reflejará vía Centro de configuración → "Medios de pago" sin tocar esta spec.
- USDT real es **Binance Pay**, NO transferencia TRC20 directa. La pill USDT del panel 1 ya quedó sin mencionar red. En panel 3, el método se llama "Binance Pay" (no "USDT TRC20" ni "USDT BEP20"). Solo se necesita el Pay ID del titular, no dirección de wallet blockchain. **Esto corrige el hallazgo abierto del HANDOFF "USDT real es Binance Pay, no TRC20"**.
- Los datos reales se cargan desde el Centro de configuración (sub-sección "Medios de pago"). El panel 3 solo los lee.

### 2.3 Caso especial — Yape Perú con 2 cuentas

Yape Perú tiene **2 cuentas reales** (BRYAMS y PEREGRINA), distinto al resto de los métodos que tienen una sola.

**Visualización (decisión sesión 14):**

- Cuenta principal (`993 357 553` · Bryams Zuñiga) se muestra como cuenta default en la card.
- **Link "Ver otra cuenta Yape"** centrado, color info `--color-text-info`, font-size 11px, cursor pointer, justo debajo de la card.
- Click en el link → reemplaza los datos de la card por los de la segunda cuenta (`982 380 794` · Peregrina Sha.). El link cambia su texto a "Volver a la cuenta principal".
- El cliente puede pagar a cualquiera de las 2 cuentas indistintamente.

**Por qué link y no acordeón:** decisión visual sesión 14 — para no recargar la card y mantener la simetría con los otros 4 métodos que tienen una sola cuenta.

**Sub-elementos del Yape doble que viven en Centro de configuración:**

- Ambas cuentas son configurables por admin desde Centro de configuración → "Medios de pago".
- Admin puede activar/desactivar la segunda cuenta. Si está desactivada, el link "Ver otra cuenta Yape" no aparece.

### 2.4 QR del método (cuando aplica)

Botón "Mostrar QR" debajo de los datos de la cuenta. Click → toggle del QR.

**Visualización del QR abierto (decisión sesión 14):**

- El QR aparece **arriba** de los datos de la cuenta (empuja Número, Titular y botón hacia abajo).
- Datos visibles: QR centrado (160×160 desktop, 140×140 mobile, fondo blanco con border 0.5px tertiary y padding 4px) → Número (sombreado + Copiar) → Titular → botón "Ocultar QR".
- **No se muestra texto adicional** tipo "Escaneá con tu app Yape" — el QR de la app real ya trae su logo y el cliente entiende.
- Header "Yape Perú" / "Binance Pay" / etc. **se mantiene visible** arriba del QR (es la identidad de la card).

**Por qué QR arriba y no abajo:** decisión sesión 14 después de iterar 4 versiones — el cliente abre el QR para escanear, no para volver a leer el número. Pero quiere poder comparar el número del QR con el número escrito (el QR de Yape muestra el nombre del titular cuando se escanea). Por eso el número y titular siguen visibles abajo, no se ocultan.

**Botón "Ocultar QR":** vuelve al estado default. Mismo comportamiento toggle.

**QR como imagen estática:** las imágenes de QR las sube el admin desde Centro de configuración → "Medios de pago" como archivo (PNG/SVG). El sistema NO genera QR automáticamente.

### 2.5 Dropzone — 6 estados visuales

Las imágenes/mockups de cada estado se validaron en sesión 14. Cada estado tiene su layout distinto.

| Estado | Trigger | Apariencia |
|---|---|---|
| **Default** | Sin comprobante subido | Rectángulo dasheado tertiary, ícono de subida (flecha hacia arriba 20×20, color secondary), texto "Subí tu comprobante" (12px weight 500), sub-texto "JPG, PNG o PDF · máx 5 MB" (10px secondary) |
| **Hover (desktop)** | Mouse encima | Border secondary (más oscuro), background `--color-background-secondary` (suave) |
| **Drag over** | Cliente está arrastrando un archivo | Border 1px sólido `--color-border-info`, fondo `--color-background-info` muy suave |
| **Tipo no permitido** | Cliente suelta un archivo distinto a JPG/PNG/PDF (ej: docx, exe) | Border 1px sólido `#A32D2D`, ícono y texto en rojo, mensaje "Tipo no permitido. Solo JPG, PNG o PDF" durante 4 segundos, después vuelve al default. **No bloquea el panel.** |
| **Tamaño excedido** | Cliente sube un archivo >5 MB | Border 1px sólido `#A32D2D`, ícono y texto en rojo, mensaje "Archivo muy grande. Máximo 5 MB" durante 4 segundos, después vuelve al default |
| **Subiendo** | Archivo aceptado, en transferencia al backend | Spinner circular 22×22 (info color, 1s loop), texto "Subiendo comprobante…" (12px secondary). Sin barra de progreso, sin nombre del archivo, sin peso |

### 2.6 Estados del comprobante (post-subida)

Después del estado "Subiendo", la dropzone se reemplaza por una vista del comprobante con 4 estados:

| Estado | Trigger | Apariencia |
|---|---|---|
| **Subido (esperando validación)** | Subida exitosa, técnico aún no validó | Card de 48×48 con ícono según tipo (imagen para JPG/PNG / PDF rojo), texto "Comprobante listo" (13px), botón "Reemplazar" a la derecha. **Sin nombre del archivo, sin peso** (decidido sesión 14 para evitar ruido visual) |
| **Validado** | Técnico aprobó | El thumbnail **se oculta** (decisión sesión 14). Se reemplaza por cajón verde `#EAF3DE` ancho completo, ícono check verde (círculo `#639922` + check blanco), texto "Comprobante validado" (12px weight 500, color `#27500A`) |
| **Rechazado** | Técnico rechazó | Border `1px dashed #A32D2D`, fondo `#FFFAFA`. Thumbnail con opacity 0.5 + círculo rojo con X (16×16) sobre la esquina superior izquierda. Etiqueta "Comprobante" + texto "Rechazado" (10px color `#A32D2D` weight 500) al lado. Botón "Subir otro" (border `#A32D2D`, color `#A32D2D`) a la derecha. **Cliente puede arrastrar otro archivo encima de este** o apretar el botón "Subir otro". Texto centrado abajo "o arrastrá un archivo nuevo encima" (11px italic secondary) |
| **Cajón rojo con motivo de rechazo** | Aparece debajo del thumbnail rechazado | Background `#FCEBEB` con padding 10px, ícono info rojo, título del motivo (12px weight 500 color `#791F1F`), descripción de 1 línea (12px color `#791F1F`). Motivo de la lista prefabricada: Monto incorrecto · Comprobante ilegible · Cuenta destino equivocada · Comprobante duplicado · Fecha inválida · Otros |

**Sin límite de reintentos** — el cliente puede subir cuantos comprobantes quiera. Cada subida nueva reemplaza el thumbnail y borra el cajón de rechazo.

**Botón "Reemplazar":** mismo comportamiento que "Subir otro" — abre el selector de archivos del SO.

**Estado "Rechazado" descongela los paneles 1-2-3.** En estado "Rechazado", los paneles 1, 2 y 3 quedan DESCONGELADOS. El cliente puede cambiar método de pago (pill) y cantidad de equipos antes de subir el nuevo comprobante. Los paneles se vuelven a congelar cuando el nuevo comprobante entra al estado "Subiendo" (consistente con spec §3 edge 11).

---

## 3. Edge cases

1. **Cliente entra al panel sin haber tocado nada antes.** Panel 1 ya autoeligió país por perfil → panel 3 muestra la card del método correspondiente con monto calculado (cantidad por defecto del panel 2 = 2 equipos × costo unitario × tasa).

2. **Perfil del cliente sin país declarado.** Caso raro. Card oscura muestra "Elegí un método de pago primero". Card de cuenta NO se muestra. Dropzone visible pero al subir comprobante, falla validación frontend con mensaje "Elegí un método de pago primero".

3. **Cliente arrastra un archivo en cualquier parte del panel** (no solo en la dropzone). Solo la dropzone responde al evento drop; en el resto del panel el archivo se "rebota" al SO sin acción.

4. **Cliente sube un archivo con extensión correcta pero contenido falso** (ej: un .pdf que en realidad es ejecutable renombrado). El frontend valida solo extensión + MIME type; el backend hace validación profunda al recibir. Si el backend rechaza, frontend muestra mensaje "Archivo no válido. Subí otro" como cajón rojo similar al de rechazo manual.

5. **Cliente cambia método en panel 1 después de haber subido comprobante.** No puede. Paneles 1, 2 y 3 están **congelados** mientras hay comprobante en revisión. El click en pills del panel 1 no responde (sin cambio visual, regla heredada del panel 1).

6. **Cliente cambia cantidad en panel 2 después de haber subido comprobante.** Igual al edge 5: panel 2 congelado.

7. **Admin actualiza la tasa de cambio mientras el cliente está mirando el panel 3.** El monto en la card oscura se actualiza en vivo. El comprobante subido NO se invalida automáticamente — el técnico lo va a revisar y verá si el monto coincide con la tasa nueva o vieja. Esto cruza con sistema de tiempos (pendiente).

8. **Admin desactiva el método elegido por el cliente mientras está mirando el panel 3.** El panel 1 desactiva la pill (regla del panel 1). El panel 3 mantiene la card de cuenta visible con el método anterior pero el cliente no puede subir comprobante; al intentar, frontend rechaza con "Este método de pago ya no está disponible. Elegí otro en panel 1".

9. **Cliente cambia de método en panel 1 (con paneles editables).** Card de cuenta del panel 3 cambia inmediatamente al método nuevo. Si había QR abierto, se cierra automáticamente (porque era de otro método). Monto en card oscura se recalcula.

10. **Cliente alterna entre Yape principal y secundaria.** Click en "Ver otra cuenta Yape" → datos cambian. Click en "Volver a la cuenta principal" → vuelve. NO afecta al panel 2 ni al monto.

11. **Cliente subió un comprobante, técnico lo rechazó, cliente arrastra otro encima.** El thumbnail rechazado se reemplaza inmediatamente por el nuevo en estado "Subiendo". El cajón rojo de motivo desaparece. Paneles 1-2-3 se vuelven a congelar.

12. **Lock pricing y sistema de alertas.** **NO existen en esta spec.** El sistema completo de tiempos vive en spec dedicada (pausada). Cuando se haga, podrá agregar elementos visuales al panel 3 (ej: alertas a 1.5/3/5 min después de subir comprobante). Hasta entonces, el panel 3 NO muestra contadores ni alertas escaladas.

13. **Cliente sin conexión a internet al apretar "Subir comprobante".** El input file abre normalmente (es del SO). Al intentar la subida, el frontend espera 30s y muestra error "Sin conexión. Reintentá" como cajón rojo. Cliente puede reintentar.

14. **Cliente abre el QR, no escanea, vuelve a apretar "Mostrar QR".** No-op — el QR ya está abierto. (El botón ya cambió a "Ocultar QR" cuando el QR está visible, así que esta interacción no debería pasar.)

15. **Texto "Ver otra cuenta Yape" cuando admin desactiva la cuenta secundaria.** El link no se muestra. Solo aparece la cuenta principal.

16. **Yape principal desactivada y solo secundaria activa.** El sistema muestra la secundaria como única opción visible, sin link. Caso operativo de Bryam (ej: si la cuenta principal está siendo investigada por banco).

---

## 4. Responsive

**Sistema de breakpoints del portal (decisión vigente, NO se reabre):**

| Breakpoint | Rango | Layout de los 4 paneles |
|---|---|---|
| Mobile | <640px | 1 columna (paneles apilados) |
| Tablet | 640–899px | 2 columnas (2×2) |
| Laptop | 900–1199px | 4 columnas (estrechas pero legibles) |
| Desktop | 1200–1799px | 4 columnas cómodas |
| Ultrawide | ≥1800px | 4 columnas con `max-width: 1400px` centrado |

**El ancho del panel 3 NO es fijo 400px estricto.** El panel ocupa el ancho que le da el grid contenedor de la pantalla principal en cada breakpoint. Las medidas tipográficas y los spacings internos sí están fijos (ver tablas abajo); solo el ancho exterior es fluido dentro del breakpoint.

**Implementación esperada:**

```css
/* Default mobile-first */
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

Ver `public/portal-styles/00-breakpoints.css` (o equivalente, según estructura del repo al momento de implementar).

### 4.1 Mobile (<640px)

- Panel ocupa el ancho disponible del stack vertical de paneles. Ancho típico ~340px (depende del padding de la pantalla principal cliente).
- Padding interno: `1.25rem 1rem`.
- Header 16px (igual a desktop).
- Card oscura: padding `12px 14px`, monto principal 22-26px (dependiendo del largo de la moneda — `S/ 36.50` cabe 26px, `$42,000 COP` cabe 22px), bandera 20×20.
- Card de cuenta: padding 12px, font-size 12px de los valores, botón "Mostrar QR" full-width 11px.
- QR abierto: 140×140.
- Dropzone: padding 18px 12px, ícono 20×20.
- Modal del comprobante en estados subido/rechazado: thumbnail 40×40, botones 4×8 padding 10px.

### 4.2 Tablet (640–899px)

- 2 paneles por fila (2×2). Cada panel ocupa la mitad del ancho disponible menos el gap.
- Mismos spacings y tipografía que desktop.
- Card oscura: padding `12px 14px`, monto principal 22-30px, bandera 22×22.

### 4.3 Laptop / Desktop / Ultrawide (≥900px)

- 4 paneles por fila. En laptop pueden quedar más estrechos (~280-320px), en desktop normal ~350-400px, en ultrawide topan en max-width 1400px del contenedor / 4 paneles ≈ 340px efectivos por panel.
- Padding interno: `1.25rem 1.5rem`.
- Card oscura: padding `12px 14px`, monto principal 22-30px, bandera 22×22.
- Card de cuenta: padding 12px, font-size 12-13px, botón "Mostrar QR" full-width 11px.
- QR abierto: 160×160.
- Dropzone: padding 18px 12px o 24px 16px (según estado).

---

## 5. Comportamiento

| Acción | Resultado |
|---|---|
| Click en "Copiar" sobre el número/Pay ID | Copia el valor al portapapeles. Botón cambia a "Copiado ✓" durante 1.5s, después vuelve a "Copiar". |
| Click en "Mostrar QR" | Toggle: el QR aparece arriba del número, empujando todo hacia abajo. Botón cambia a "Ocultar QR". |
| Click en "Ocultar QR" | Toggle inverso. QR desaparece, datos vuelven a su posición default. |
| Click en "Ver otra cuenta Yape" | Reemplaza los datos de la card por la cuenta secundaria. Texto del link cambia a "Volver a la cuenta principal". |
| Click en dropzone (estado default) | Abre selector de archivos del SO. Si cliente elige un archivo: validar tipo + tamaño → si válido, pasa a estado "Subiendo"; si inválido, dropzone muestra error 4s y vuelve al default. |
| Drop de archivo en dropzone | Mismo comportamiento que el click. |
| Drop de archivo encima del thumbnail rechazado | El nuevo archivo reemplaza al rechazado, pasa a estado "Subiendo". El cajón rojo de motivo desaparece. |
| Click en "Reemplazar" (sobre thumbnail subido) | Abre selector de archivos del SO. El nuevo archivo reemplaza al actual. Solo aparece en estado "Subido (esperando validación)". |
| Click en "Subir otro" (sobre thumbnail rechazado) | Igual que "Reemplazar". |
| Tab keyboard nav | Tab order: pill anterior (panel 2) → botón Copiar de número → botón Mostrar QR → botón Ver otra cuenta Yape (si aplica) → dropzone → siguiente panel. |
| Recarga de página | Si el comprobante ya fue subido y está en validación: el estado se reconstruye desde el backend al cargar. Si el comprobante fue rechazado: el estado se reconstruye con el thumbnail + motivo. |
| Paneles 1-2-3 congelados | El panel 3 también pierde la capacidad de modificar la cuenta visible (el método queda fijo). El cliente NO puede subir otro comprobante mientras el actual está en revisión. La dropzone aparece en estado disabled (border más claro, sin hover). |

**Sincronización en vivo:**

- Cambios de tasa o desactivación de método: vía SSE `/api/portal/orders/events` o canal equivalente. Card oscura se actualiza en vivo sin recargar.
- Cambio de estado del comprobante (validado/rechazado): vía SSE. La dropzone/thumbnail se reemplaza en vivo.

**Sin polling externo, sin botón "Actualizar".**

---

## 6. Datos

### 6.1 Datos que necesita (inputs)

**Estado del panel 1:**

```json
{
  "selectedPill": "PE",
  "currency": "PEN",
  "estimatedAmountUsdt": 5.00,
  "estimatedAmountLocal": 18.25,
  "fxRate": 3.65
}
```

**Estado del panel 2:**

```json
{
  "quantity": 2,
  "deviceModel": "Redmi Note 13",
  "modelValidation": "apto" | "not_supported" | "not_recognized" | null,
  "totalUsdt": 10.00,
  "totalLocal": 36.50
}
```

**Cuenta de cobro del método elegido** (carga desde Centro de configuración → "Medios de pago"):

```json
{
  "method": "PE_YAPE_PRIMARY",
  "displayName": "Yape Perú",
  "logo": "yape",
  "fields": [
    { "label": "Número", "value": "993 357 553", "copyable": true, "monospace": true },
    { "label": "Titular", "value": "Bryams Zuñiga", "copyable": false }
  ],
  "qrImageUrl": "/api/config/payment-methods/PE_YAPE_PRIMARY/qr.png",
  "alternativeAccountKey": "PE_YAPE_SECONDARY"
}
```

Si `qrImageUrl` está vacío, el botón "Mostrar QR" no aparece. Si `alternativeAccountKey` está vacío, el link "Ver otra cuenta Yape" no aparece.

**Cuenta alternativa (Yape solo)** — se carga lazy cuando el cliente apreta el link:

```json
{
  "method": "PE_YAPE_SECONDARY",
  "displayName": "Yape Perú",
  "logo": "yape",
  "fields": [
    { "label": "Número", "value": "982 380 794", "copyable": true, "monospace": true },
    { "label": "Titular", "value": "Peregrina Sha.", "copyable": false }
  ],
  "qrImageUrl": "/api/config/payment-methods/PE_YAPE_SECONDARY/qr.png",
  "alternativeAccountKey": "PE_YAPE_PRIMARY"
}
```

**Estado del comprobante** (vive en backend, sincronizado vía SSE):

```json
{
  "status": "uploading" | "uploaded" | "validating" | "validated" | "rejected" | null,
  "rejectionReason": null | { "code": "AMOUNT_MISMATCH", "title": "Monto incorrecto", "detail": "El monto pagado no coincide con el total." }
}
```

### 6.2 Datos que produce

**Click en "Subir comprobante" (drop de archivo):**

```http
POST /api/portal/orders/payment-proofs
Content-Type: multipart/form-data

selectedPill: "PE"
quantity: 2
deviceModel: "Redmi Note 13"
modelValidation: "apto"
totalLocal: 36.50
totalUsdt: 10.00
fxRate: 3.65
file: [JPG/PNG/PDF, max 5 MB]
```

Backend valida todo antes de aceptar, persiste el archivo, crea un registro de comprobante en estado `uploaded` y notifica al panel operador vía SSE.

**Click en "Reemplazar" o "Subir otro":**

Mismo endpoint. Backend reemplaza el comprobante anterior por el nuevo. Si el comprobante anterior estaba `rejected`, el motivo se borra.

### 6.3 Validaciones

**Frontend (durante subida):**

- Tipo permitido: `image/jpeg`, `image/png`, `application/pdf`. Cualquier otro tipo MIME → rechazo inline 4s.
- Tamaño máximo: 5 MB (5,242,880 bytes). Cualquier archivo más grande → rechazo inline 4s.
- Estado del panel 1: `selectedPill` debe estar definido. Si no → mensaje "Elegí un método de pago primero".
- Estado del panel 2: `quantity` debe ser entre 1 y 10. Si no → mensaje similar.

**Backend (cuando recibe el comprobante):**

- Re-validar tipo, tamaño, MIME real (no solo extensión).
- Re-validar `selectedPill`, `quantity`, `totalLocal`, `totalUsdt`, `fxRate` contra la configuración actual del backend (anti-manipulación).
- Verificar que el método de pago esté activo al momento de recibir.
- Verificar que `fxRate` enviado coincide con la tasa actual del backend (sin tolerancia, debe coincidir exactamente).
- Si validación falla, devolver 400 con código de error específico (ej: `FX_OUTDATED`, `METHOD_DEACTIVATED`, `AMOUNT_OUT_OF_RANGE`, `FILE_TOO_LARGE`, `FILE_TYPE_INVALID`).

---

## 7. Acceptance criteria

**Layout y estilo:**

1. Header dice "Datos de pago" sin numeración delante.
2. Card oscura tiene fondo `#2C2C2A` con texto blanco/gris.
3. Card oscura muestra bandera al costado del monto principal (no arriba ni abajo).
4. Card oscura NO muestra conversión a USDT (excepto cuando el método elegido ES USDT, donde muestra el monto en USDT directo).
5. Card oscura NO muestra breakdown "N equipos × monto unitario".
6. Card de cuenta tiene avatar/logo del método + nombre como header.
7. Número/Pay ID/CLABE/cuenta tiene fondo `--color-background-secondary` y botón "Copiar" alineado a la derecha.
8. Para Yape Perú, link "Ver otra cuenta Yape" centrado debajo de la card.
9. Dropzone tiene border dasheado tertiary en estado default.
10. No existe contador "Precio asegurado XX:XX".
11. No existe banner amarillo "Revisá pasos 1 y 2".

**Comportamiento — copiar:**

12. Click en "Copiar" copia el valor exacto al portapapeles (sin formato, solo el string).
13. Botón cambia a "Copiado ✓" durante 1.5s, después vuelve a "Copiar".
14. Botón "Copiar" tiene `aria-label="Copiar [campo]"`.

**Comportamiento — QR:**

15. Botón "Mostrar QR" solo aparece si el método tiene `qrImageUrl` definido.
16. Click en "Mostrar QR" muestra el QR arriba del número, empujando todo hacia abajo.
17. Click en "Ocultar QR" cierra el QR y datos vuelven a su posición.
18. QR es 160×160 desktop, 140×140 mobile, fondo blanco con border 0.5px y padding 4px.
19. Header del método ("Yape Perú", "Binance Pay", etc.) se mantiene visible cuando QR está abierto.

**Comportamiento — Yape doble:**

20. Link "Ver otra cuenta Yape" solo aparece si el método tiene `alternativeAccountKey` definido.
21. Click en el link reemplaza datos de la card por la cuenta alternativa.
22. Texto del link cambia a "Volver a la cuenta principal" cuando se está mostrando la alternativa.

**Comportamiento — dropzone:**

23. Click en dropzone abre selector de archivos del SO.
24. Drag-over visible: border 1px sólido info, fondo info muy suave.
25. Tipo no permitido: dropzone pasa a border rojo + mensaje 4s, después vuelve a default.
26. Tamaño excedido (>5 MB): dropzone pasa a border rojo + mensaje 4s, después vuelve a default.
27. Solo se permiten extensiones JPG, PNG, PDF (validación por MIME y por extensión).

**Comportamiento — subida:**

28. Estado "Subiendo": spinner + texto "Subiendo comprobante…", sin nombre de archivo, sin peso.
29. Estado "Subido": ícono según tipo + texto "Comprobante listo" + botón "Reemplazar".
30. Click en "Reemplazar" abre selector de archivos del SO y reemplaza el comprobante actual.

**Comportamiento — validación:**

31. Estado "Validado": cajón verde ancho completo con check + texto "Comprobante validado". Thumbnail oculto.
32. Estado "Rechazado": thumbnail con opacity 0.5 + X roja en esquina + etiqueta "Rechazado". Botón "Subir otro" a la derecha. Texto centrado abajo "o arrastrá un archivo nuevo encima". Cajón rojo con motivo.
33. Drop de archivo encima del thumbnail rechazado lo reemplaza (no requiere apretar el botón).
34. Click en "Subir otro" abre selector de archivos del SO.
35. Sin límite de reintentos.

**Comportamiento — sincronización en vivo:**

36. Cambio de tasa admin: monto se actualiza en vivo sin recargar.
37. Cambio de método (admin lo desactiva): cliente ve mensaje al intentar subir comprobante.
38. Cambio de estado del comprobante (validated/rejected): UI cambia en vivo vía SSE.

**Resiliencia:**

39. Recarga de página: estado del comprobante se reconstruye desde el backend.
40. SSE caído: panel sigue funcional con datos cargados, mensaje en sección Mis órdenes (no en este panel).
41. Sin conexión al subir: error inline 30s después de timeout, cliente puede reintentar.

**Accesibilidad:**

42. Tab order: dropzone es focuseable y tiene `role="button"` con `aria-label="Subir comprobante"`.
43. Botones tienen `aria-label` descriptivos.
44. Dropzone aceptando drag tiene `aria-dropeffect`.
45. Cajón rojo de rechazo tiene `role="alert"` (lectores anuncian).
46. Cajón verde de validado tiene `role="status"` (informativo, no urgente).

---

## 8. Open questions

**Estado al cierre de sesión 14:** las decisiones principales del panel 3 quedaron cerradas. Quedan OQ-residuales para refinar en sesiones siguientes.

### OQ-residuales (sesión 14)

**OQ-R1 — Imágenes reales de QR para los 5 métodos.**

Cada método con QR (Yape Perú principal, Yape Perú secundaria, Binance Pay, Bancolombia) requiere una imagen real del QR. Las imágenes las sube Bryam desde el Centro de configuración → "Medios de pago" cuando esa spec exista. Pendiente: que Bryam genere los QR desde sus apps de pago y los suba a una carpeta del repo o al admin cuando esté disponible. **No bloquea esta spec** — el campo `qrImageUrl` en la config es suficiente.

**OQ-R2 — QR de México (STP) y Chile (Mercado Pago).**

México (STP) y Chile (Mercado Pago) **no tienen QR todavía**. Bryam está investigando si esos métodos generan QR estándar. Cuando se confirme, se agregan vía Centro de configuración. **No bloquea esta spec** — el botón "Mostrar QR" simplemente no aparece para esos métodos hasta que se cargue la imagen.

**OQ-R3 — Comportamiento si el cliente queda en estado "Subiendo" mucho tiempo.**

Si la subida tarda más de 30s (conexión lenta), ¿cómo se comporta? Decisión provisional: timeout a 30s con error "Sin conexión. Reintentá" y opción de reintentar. Pendiente confirmar duración exacta del timeout y comportamiento de reintento automático vs manual.

**OQ-R4 — Lista exacta y final de motivos de rechazo de comprobante.**

Lista preliminar definida: Monto incorrecto · Comprobante ilegible · Cuenta destino equivocada · Comprobante duplicado · Fecha inválida · Otros. Falta confirmar con Bryam si se agregan/sacan motivos cuando se haga la spec del panel operador.

### OQ heredadas (cierran en otras specs)

- **OQ-H1 — Validación de precio que falló (hallazgo sesión 10).** Pendiente investigar empíricamente cuándo falla la validación de rango 0.5–100 USDT y por qué.
- **OQ-H2 — Sistema de tiempos / lock pricing / alertas escaladas.** Cuando se haga la spec dedicada del sistema de tiempos, podrá agregar elementos visuales al panel 3 (ej: alertas de 1.5/3/5 min después de subir comprobante). Hoy el panel 3 NO muestra contadores ni alertas.
- **OQ-H3 — PayPal como método nuevo.** Bryam mencionó PayPal con 20% adicional por comisiones. Queda como input crudo del HANDOFF para sesión dedicada (no se trabaja en sesión 14).

---

## Decisiones cruzadas que afectan otras specs

### Spec del Centro de configuración → "Medios de pago" (sesión futura)

El panel 3 lee toda la config de cuentas desde esta sub-sección del admin. La spec debe definir:

- Cómo se cargan las cuentas (formato de los `fields` por método).
- Cómo se sube la imagen del QR por cuenta.
- Cómo se activa/desactiva una cuenta en vivo.
- Cómo se maneja la cuenta secundaria de Yape Perú (alternativeAccountKey).
- Cómo se cargan los datos sensibles del método (CLABE, RUT, etc.) con validación.

### Spec del panel operador (sesión futura)

- Vista de comprobantes para revisar.
- Mecanismo de validación/rechazo (dropdown con motivos prefabricados + campo libre opcional).
- Lista exacta de motivos (Monto incorrecto · Comprobante ilegible · Cuenta destino equivocada · Comprobante duplicado · Fecha inválida · Otros).
- Notificación al cliente vía SSE cuando técnico valida/rechaza.

### Spec del sistema de tiempos / lock pricing (input crudo HANDOFF, pausada)

- Define alertas escaladas en panel 3 (1.5 / 3 / 5 min después de subir comprobante).
- Define qué pasa si cliente no apreta "Equipo conectado" en panel 4 después de tiempo X.
- Define si la tasa actualizada por admin invalida un comprobante en cola.

---

## Changelog

- **panel-3-datos-de-pago.md v1.0** (2026-05-04, sesión 14) — Spec inicial completa con las 8 piezas. Decisiones principales:
  - Header "Datos de pago" (no "Pago" ni "Pagar" — para evitar choque con panel 1 "Método de pago").
  - Sin numeración delante.
  - Sin botón Continuar (modelo paneles paralelos).
  - Card oscura con bandera al costado del monto.
  - Sin conversión a USDT en card oscura (excepto cuando método elegido es USDT).
  - Sin breakdown "N equipos × monto unitario".
  - Sin banner amarillo "Revisá pasos 1 y 2" (descartado, modelo de paneles paralelos no requiere recordar pasos).
  - Sin contador "Precio asegurado 15:00 minutos" (regla vieja desechada; sistema de tiempos completo vive en spec dedicada).
  - Una sola cuenta visible por método (la del método elegido en panel 1).
  - Yape Perú con 2 cuentas: principal default + link "Ver otra cuenta Yape" para alternar a la secundaria.
  - QR via botón "Mostrar QR" — aparece arriba del número (empuja contenido hacia abajo), datos visibles para que el cliente compare con el nombre del titular del QR escaneado.
  - QR como imagen estática cargada por admin (no se genera automáticamente).
  - Dropzone con 6 estados (default, hover, drag-over, tipo no permitido, tamaño excedido, subiendo).
  - Comprobante con 4 estados post-subida (subido esperando, validado, rechazado, rechazado con motivo).
  - Estado "Subido" sin nombre de archivo ni peso (decisión sesión 14 para evitar ruido visual).
  - Estado "Validado" oculta el thumbnail.
  - Estado "Rechazado" muestra thumbnail con X roja + botón "Subir otro" + cajón rojo con motivo + texto guía "o arrastrá un archivo nuevo encima".
  - Cliente puede arrastrar otro archivo encima del thumbnail rechazado para reemplazarlo.
  - Tipos permitidos: JPG, PNG, PDF.
  - Tamaño máximo: 5 MB (verificado con fuentes externas — Canon Europe usa 4 MB para comprobantes similares; 5 MB cubre fotos de celular sin compresión).
  - Sin límite de reintentos.
  - Datos reales de Bryam usados en mockups: Yape `993 357 553` Bryams Zuñiga · Yape `982 380 794` Peregrina Sha. · México STP `7229 6906 9374 9504 08` Javier Cruz Franco · Colombia Bancolombia `00100002771` Kendy Salazar · Chile Mercado Pago `1042449240` RUT `179040166` Emanuel Iván Alarcón Gómez · Binance Pay ID `564181591` Ariadgsm.
  - **Corrección USDT/Binance Pay confirmada:** USDT real es Binance Pay (no TRC20). Pill USDT panel 1 sin red mencionada. Panel 3 muestra Binance Pay como nombre del método con Pay ID. Esto cierra el hallazgo abierto del HANDOFF sesión 10.
  - **Sistema de breakpoints unificado documentado:** mobile <640px (1 col) → tablet 640px (2 cols) → laptop 900px (4 cols) → desktop 1200px → ultrawide 1800px con max-width 1400px. Decisión heredada del rediseño responsive del portal viejo. El ancho del panel 3 NO es fijo 400px — es fluido dentro del breakpoint.
  - 4 OQ-residuales identificadas (OQ-R1 a OQ-R4): imágenes de QR pendientes, QR de MX/CL pendientes, comportamiento de timeout largo, lista final de motivos de rechazo.
