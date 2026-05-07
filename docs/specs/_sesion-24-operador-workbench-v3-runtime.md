# Sesion 24 - Implementacion runtime panel trabajador FRP v3

Fecha: 2026-05-07

Estado: fase 1 aplicada.

## Alcance aprobado

Aplicar el mockup visual v3 al panel real sin cambiar contratos backend.

Archivo base del mockup:

```text
docs/specs/operador/mockups/operador-frp-express-v3.html
```

## Fuentes externas usadas como criterio

- W3C APG Button: mantener acciones reales como botones y conservar estado deshabilitado cuando la accion no esta disponible.
  https://www.w3.org/WAI/ARIA/apg/patterns/button/
- W3C WCAG Status Messages: motivos de bloqueo y cambios de estado deben ser visibles sin mover foco innecesariamente.
  https://www.w3.org/WAI/WCAG21/Understanding/status-messages.html
- MDN EventSource: el estado live/SSE debe tratarse como conexion persistente con reconexion y error visibles.
  https://developer.mozilla.org/en-US/docs/Web/API/EventSource

## Cambios aplicados

- `public/app.js`
  - agrega `frpOpsV2RenderHeaderV3`;
  - cambia el workbench a dos zonas: `main-stack` y `side-stack`;
  - mantiene los hooks de accion existentes:
    - `data-frp-finalize`;
    - `data-frp-review`;
    - `data-frp-take-next`;
    - `data-frp-take-specific`;
    - `data-frp-show-proof`;
    - `data-frp-show-review`;
  - agrega motivos visibles para ownership y bloqueos del estado vacio.

- `public/styles.css`
  - agrega una capa visual v3 sobre `.frp-ops-v2`;
  - cambia la composicion a grid operativo desktop y una columna mobile;
  - baja ruido visual con chips compactos, radios maximos de 8px y paleta neutral con acentos;
  - conserva estilos de modales y flujos de comprobante/revision fuera del alcance.

- `test/phase3a.contract.test.js`
  - agrega cobertura estatica para layout v3 y preservacion de hooks de accion.

## No cambiado

- Endpoints FRP.
- Postgres.
- Reglas de ownership.
- Resolver revision.
- Tomar siguiente / tomar especifico.
- SSE backend.
- Modal de comprobante.
- Modal de revision.
- Costos FRP internos.

## Riesgos residuales

- Validacion visual real encontro un bug de fase 1: el workbench parecia un panel dentro de otro panel y el grid no hacia reflow correcto cuando el contenedor quedaba chico.
- El bloque `Clientes no confirmados` sigue como concepto de diseno; no se implemento porque el panel runtime aun no expone ese dato como lista dedicada.
- Costos FRP sigue como acordeon separado debajo del workbench; no se movio al side-stack para evitar mezclar pricing editable con renders de estado que se actualizan por SSE.

## Correccion visual post-deploy

Fecha: 2026-05-07

Motivo:

- la captura de produccion mostro doble contenedor visual: panel FRP dentro del panel FRP;
- en ancho chico, el grid seguia en columnas y partia texto/botones;
- el widget superior de tecnico activo competia con el contenido y sus botones quedaban fuera del lenguaje visual.

Criterio externo usado:

- CSS Grid debe usar tracks flexibles y contenedores directos para evitar columnas rigidas cuando el espacio cambia.
  https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_grid_layout/Basic_concepts_of_grid_layout
- `minmax()` permite definir tracks responsivos con minimo/maximo controlado.
  https://developer.mozilla.org/en-US/docs/Web/CSS/minmax
- WCAG Reflow: el contenido debe poder reacomodarse sin perdida de informacion ni scroll en dos direcciones para layouts comunes.
  https://www.w3.org/WAI/WCAG21/Understanding/reflow.html

Correccion:

- `#frp-workbench` vuelve a ser contenedor plano (`display: block`);
- `.frp-ops-v2` deja de pintar borde/fondo externo;
- se oculta el header interno duplicado de FRP v3;
- `.frp-ops-v2-workspace` usa `auto-fit` + `minmax(min(100%, 620px), 1fr)`;
- `.frp-ops-v2-grid-attention` usa `auto-fit` para no partir columnas de excepciones;
- el widget superior de tecnico activo queda mas compacto y sus botones no fuerzan ancho fijo.

Validacion local:

- `git diff --check`;
- `node --check public\app.js`;
- `npm.cmd test` (58 tests OK).

## Siguiente paso unico

Verificar visualmente en staging/produccion:

```text
1. abrir panel trabajador FRP;
2. confirmar header/chips;
3. confirmar dos zonas desktop;
4. confirmar una columna mobile;
5. hacer un FRP de prueba y validar que Tomar, Finalizar, Reportar, Ver comprobante y Resolver siguen operando.
```
