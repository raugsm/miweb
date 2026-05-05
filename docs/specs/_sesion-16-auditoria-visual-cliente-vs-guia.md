# Auditoria visual cliente vs guia - 4 paneles

Estado: diagnostico documentado. Sin cambios de UI aplicados en esta auditoria.

## Objetivo

Explicar por que la pantalla cliente actual no queda igual al diseno de referencia de los 4 paneles, aunque exista guia previa.

Esta auditoria separa:

- lo que dice la guia;
- lo que realmente ejecuta el codigo;
- que decisiones posteriores cambiaron el alcance visual;
- que riesgos hay si se corrige rapido sin contrato visual.

## Evidencia revisada

- Referencia visual enviada por Bryam: 4 paneles compactos, misma altura visual, panel 4 limpio con descarga centrada.
- Pantalla actual en `http://127.0.0.1:4183/cliente`.
- `docs/specs/cliente/pantalla-principal-cliente.md`.
- `docs/specs/cliente/mockups/pantalla-principal-cliente.html`.
- `public/portal.html`.
- `public/portal-styles/05-frp-flow.css`.
- `public/portal-styles/06-flow-grid.css`.
- `public/portal-styles/13-panel-3.css`.
- `public/portal-styles/14-panel-4.css`.

## Hechos

1. La guia si define el modelo correcto: una pantalla unica con 4 paneles paralelos visibles a la vez, mas `Mis ordenes` debajo.

2. La guia documenta breakpoints esperados para la pantalla principal:

   - mobile menor a 640px: 1 columna;
   - tablet 640-899px: 2 columnas;
   - laptop 900-1199px: 4 columnas;
   - desktop 1200-1799px: 4 columnas comodas;
   - ultrawide desde 1800px: max-width 1400px centrado.

3. El CSS real de `.panels-row` no usa exactamente esos breakpoints. Usa:

   - 1 columna por defecto;
   - 2 columnas desde 768px;
   - 4 columnas desde 1024px;
   - max-width 1400px desde 1280px.

4. El CSS real de `.panels-row` tiene `align-items: start`. Eso permite que cada panel mida su propia altura segun su contenido. Por eso la fila no queda como 4 cajas con la misma altura visual.

5. La clase base `.panel` no tiene contrato de altura compartida. Tiene `display: flex`, `flex-direction: column`, `gap: 16px` y `padding: 20px`, pero no fija altura minima comun ni estiramiento de la fila.

6. El panel 4 cambio por una decision posterior. La referencia visual antigua muestra casi solo el boton `Descargar Redirector v2.5`, pero `14-panel-4.css` documenta una decision posterior donde las cards de `Technician ID`, `Codigo del proceso`, el boton `Donde pegar` y la descarga son siempre visibles desde login.

7. El panel 3 cambia de forma segun el metodo de pago. La referencia usa Yape Peru, que es mas compacto y tiene boton `Mostrar QR`. La pantalla actual usa Mexico STP, que incluye numero de tarjeta, institucion y beneficiario. Ese contenido ocupa mas altura.

8. El panel 2 actual tiene contenido extra que no se ve con la misma fuerza en la referencia, como el texto de precio base y beneficios bloqueados.

9. Hay CSS historico dentro de `05-frp-flow.css` relacionado con estructuras antiguas de pasos. Aunque varias partes estan comentadas como legacy, aumenta el riesgo de confusion porque conviven estilos nuevos `.panel-*` con restos `.flow-*` y `.step-*`.

## Inferencias

1. La diferencia visual no viene de un solo bug. Viene de una combinacion de:

   - guia conceptual;
   - mockups parcialmente desactualizados;
   - decisiones posteriores sobre panel 4;
   - contenido real mas pesado que el contenido de referencia;
   - CSS que no fija altura ni ritmo visual comun para los 4 paneles.

2. El codigo puede estar cumpliendo parte del flujo funcional y aun asi fallar visualmente contra la referencia. Es decir: no es suficiente que los 4 paneles existan; falta un contrato visual explicito.

3. La referencia visual de Bryam debe tratarse como contrato visual vigente solo en las partes que no hayan sido reemplazadas por una decision posterior. Donde hay conflicto, hay que decidir cual manda antes de tocar codigo.

## Supuestos debiles detectados

1. Se asumio que "mismo estilo" bastaba para llegar al mismo resultado visual. No basta.

2. Se asumio que el mockup seguia completo como fuente de verdad, pero la propia guia marca partes parcialmente desactualizadas.

3. Se asumio que agregar contenido operativo al panel 4 no rompia el balance visual. Si lo rompe.

4. Se asumio que el grid de 4 columnas resolvia la apariencia por si solo. No la resuelve si cada panel crece libremente.

## Riesgos si se corrige sin decidir primero

1. Si solo se fuerza la misma altura, el contenido largo puede quedar aplastado o desbordado.

2. Si se limpia panel 4 para parecerse al mockup viejo, se puede perder informacion operativa que habia sido aprobada despues.

3. Si se elimina texto extra sin reglas de estado, se puede mejorar la vista pero empeorar el flujo del cliente.

4. Si se ajustan breakpoints sin revisar toda la pantalla, se puede arreglar desktop y romper tablet o laptop.

5. Si se sigue agregando CSS encima del CSS viejo, crece la deuda visual y sera mas dificil subir esto online con confianza.

## Evidencia adicional de resize

Bryam aporta tres vistas para comparar el comportamiento responsive:

1. **Pantalla adelgazada, aun en 4 columnas.**

   La pantalla conserva 4 paneles, pero el contenido interno empieza a comprimirse. Se ve truncado en el `Technician ID`, el boton de descarga parte el texto en dos lineas y los botones/campos quedan muy cerca. Esto confirma que el breakpoint de 4 columnas aguanta demasiado tiempo para ese contenido real.

2. **Pantalla grande, 4 columnas comodas.**

   La fila se ve mas respirada, pero los paneles siguen sin compartir la misma altura visual. El panel 3 y panel 2 crecen mas; panel 1 y panel 4 quedan mas bajos. Esto confirma que el problema no es solo falta de ancho: tambien falta regla de altura/alineacion comun.

3. **Vista revisada por Codex en navegador local.**

   En `http://127.0.0.1:4183/cliente`, con el navegador en ancho grande, se mantiene el mismo patron: 4 columnas, paneles alineados arriba, alturas distintas y panel 3 condicionado por el metodo de pago activo. En esa vista el metodo `USDT / Binance Pay` ocupa menos que `Mexico STP`, pero aun asi la fila no queda balanceada.

4. **Pantalla mas angosta, 2 columnas.**

   Cuando el ancho cae por debajo del corte real de 4 columnas, los paneles pasan a 2x2. En esa vista los paneles se vuelven mucho mas anchos y los componentes internos se estiran. Esto no es un bug aislado, es consecuencia directa del grid actual: 2 columnas desde 768px y 4 columnas desde 1024px.

### Conclusion de resize

Las capturas prueban dos problemas distintos:

1. **Problema de breakpoint:** el corte actual de 4 columnas (`1024px`) no coincide con la guia original (`900px`) y puede dejar 4 columnas demasiado apretadas en ciertos anchos reales.

2. **Problema de contrato visual:** aunque haya ancho suficiente, los paneles no quedan como una fila pareja porque el CSS permite que cada uno tenga su propia altura.

Por eso la correccion no debe empezar moviendo textos o botones. Debe empezar definiendo el contrato visual de layout:

- cuando usar 4 columnas;
- cuando pasar a 2 columnas;
- si las tarjetas deben compartir altura;
- cuanto contenido puede vivir dentro de cada panel antes de compactarse u ocultarse por estado.

## Evidencia adicional de pills del panel 1

Bryam aporta una captura donde la pill `Colombia` se sale o queda pegada al borde cuando el panel 1 esta angosto.

### Hechos

1. El HTML del panel 1 renderiza 6 slots fijos: `Peru`, `USDT`, `Mexico`, `Colombia`, `Chile` y un slot vacio.

2. El CSS anterior de `.panel-1-pills` usaba una grilla fija de 3 columnas:

   - `grid-template-columns: repeat(3, minmax(0, 1fr));`

3. Cada pill usa `justify-content: center`, `white-space: nowrap` en la etiqueta y padding horizontal.

4. La spec anterior del panel 1 decia que texto largo no aplicaba porque los nombres eran cortos. Esa suposicion queda corregida: `Colombia` si puede fallar cuando el panel se angosta.

### Inferencia

El problema no es solo que el texto este centrado. La causa real es:

> grilla fija de 3 columnas + texto sin salto + panel angosto + padding interno.

Cuando el panel pierde ancho, cada columna se vuelve demasiado pequena para `Colombia`.

### Regla aprobada

Las pills del panel 1 deben reacomodarse segun el ancho disponible y nunca desbordar su contenedor.

La solucion no debe empezar por achicar fuente ni cortar texto. El layout debe permitir que cada pill use el ancho que necesita y baje de linea si hace falta.

### Implementacion aplicada

Archivo modificado: `public/portal-styles/05-frp-flow.css`.

Decision tecnica:

- cambiar `.panel-1-pills` de grid fijo a `flex-wrap`;
- limitar el cambio al panel 1;
- mantener el orden que ya renderiza `payments.js`;
- ocultar el slot vacio heredado para que no reserve espacio;
- ajustar el padding horizontal solo dentro del panel 1 para conservar 3+2 cuando el ancho lo permite.

Validacion:

- vista local revisada en `http://127.0.0.1:4183/cliente`;
- `Colombia` ya no desborda;
- en ancho grande queda 3 pills arriba y 2 abajo;
- `npm.cmd test` paso con 12 pruebas correctas.

### Efecto lateral corregido

Despues de aplicar `flex-wrap`, Bryam detecto un hueco: `Chile` podia caber al lado de `Mexico`, pero bajaba porque `Colombia` estaba antes en el orden del DOM.

Causa:

- `flex-wrap` respeta el orden estricto de los elementos;
- no reubica automaticamente un elemento mas corto para llenar un hueco anterior;
- el orden logico seguia siendo correcto, pero el orden visual necesitaba una excepcion en panel estrecho.

Correccion:

- en el rango estrecho de 4 columnas (`1024px-1199.98px`), `Chile` puede aparecer visualmente antes que `Colombia`;
- el cambio se limita a `.panel-1-pills`;
- `payments.js` no cambia.

Riesgo aceptado:

- en ese rango, el orden visual puede ser `Mexico / Chile / Colombia` aunque el orden logico siga siendo `Mexico / Colombia / Chile`.
- Se acepta porque evita huecos y desbordes sin tocar comportamiento.

Validacion final con Bryam:

- en el ancho exacto donde aparecia el hueco, `Mexico` y `Chile` quedan juntos;
- `Colombia` baja sola, pero ya no desborda;
- el bug de pills se cierra;
- el hecho de que el panel quede alto se mantiene como evidencia para revisar el breakpoint general de los 4 paneles.

## Decision que tomaria

No tocaria aun el codigo visual. Primero cerraria un contrato visual corto para la pantalla cliente.

Ese contrato debe definir:

1. Si los 4 paneles deben tener la misma altura en desktop.
2. Cual es la altura minima o maxima aceptable.
3. Que informacion se muestra en panel 4 antes de subir pago, durante revision, despues de aprobar y despues de conectar.
4. Si el boton `Donde pegar estos codigos` queda visible siempre o solo cuando ya hay codigo real.
5. Si el texto de precio base/beneficios del panel 2 se conserva, se reduce o se mueve.
6. Si se usan los breakpoints de la guia original o los breakpoints Tailwind que ya usa el repo.
7. Que fuente manda cuando hay conflicto: mockup, guia escrita o decision posterior documentada.

## Propuesta de siguiente paso

Siguiente paso unico: cerrar con Bryam el contrato visual de los 4 paneles antes de tocar CSS o HTML.

La primera decision que debe responderse es:

> En desktop, los 4 paneles deben verse como una fila de tarjetas de la misma altura, aunque algunos tengan menos contenido?

Si la respuesta es si, la correccion tecnica deberia empezar por el contrato de layout de `.panels-row` y `.panel`, no por mover elementos sueltos de cada panel.
