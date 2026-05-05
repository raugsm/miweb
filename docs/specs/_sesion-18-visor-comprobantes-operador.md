# Sesion 18 - Visor de comprobantes operador

Estado: implementacion inicial aplicada, pendiente de validacion visual de Bryam en flujo real.
Fecha: 2026-05-05.

## Objetivo

Redisenar el visor de comprobantes del operador para que pueda validar pagos sin salir de la mesa FRP Express.

El operador debe poder ver bien imagenes y PDF, aprobar o rechazar, y tener los datos minimos de la orden a la vista.

## Alcance aprobado para este paso

Este paso solo toca el visor/modal de comprobantes del operador.

Incluye:

- imagen con zoom;
- arrastre/pan con mouse;
- scroll cuando aplique;
- boton o accion `Ver grande` dentro del mismo modal/panel;
- PDF visible dentro del modal usando PDF.js;
- datos minimos: orden, cliente, monto esperado y metodo si esta disponible;
- botones de aprobar/rechazar usando el endpoint actual.

No incluye:

- redisenar toda la mesa operativa;
- cambiar backend de aprobacion/rechazo;
- cambiar flujo de tomar/finalizar;
- cambiar tecnico activo;
- cambiar pricing;
- cambiar SSE;
- cambiar portal cliente.

## Estado actual confirmado

Frontend operador:

- El modal real existe en `public/index.html` como `#frpProofDialog`.
- La logica real abre el modal en `public/app.js` con `openFrpProofDialog(orderId)`.
- Aprobar/rechazar llama `PATCH /api/frp/orders/:id/payment-review`.
- El contenedor actual pinta cada comprobante como `<img>`.
- El CSS actual usa imagen de 140px con `object-fit: cover`, lo que recorta comprobantes verticales de celular.

Backend:

- El backend acepta comprobantes como imagen o PDF.
- `sanitizePaymentProofImages` permite `image/png`, `image/jpeg`, `image/webp` y `application/pdf`.
- El mismo comprobante se sincroniza entre orden cliente y orden FRP.

## Problema real

La mayoria de comprobantes de pago son capturas verticales de celular.

El modal actual:

- es pequeno para validar bien;
- recorta imagenes;
- no tiene zoom/pan;
- no trata PDF como PDF;
- muestra poco contexto de la orden.

Esto aumenta el riesgo de aprobar mal, rechazar mal o perder tiempo abriendo archivos fuera del flujo.

## Decision PDF

Se elige PDF.js como direccion tecnica para PDF.

Motivo:

- evita depender solo del visor nativo del navegador;
- permite mantener PDF dentro del modal;
- permite controlar zoom/scroll;
- se integra mejor con el flujo Express.

Implementacion recomendada:

- cargar/renderizar PDF dentro del visor;
- mostrar paginas dentro del modal;
- mantener acciones de aprobar/rechazar visibles;
- si PDF.js falla, mostrar error claro y no dejar una pantalla vacia.

## Fallback obligatorio

Si un comprobante no se puede mostrar:

- no debe quedar el visor en blanco;
- debe decir que el comprobante fue recibido pero no se pudo previsualizar;
- debe mostrar nombre/tipo del archivo;
- aprobar/rechazar debe seguir disponible solo si Bryam confirma que ese fallback es aceptable en operacion.

Este punto queda como decision pendiente antes de cerrar implementacion.

## Comportamiento esperado para imagen

- Mostrar la imagen completa sin recortarla.
- Permitir zoom con rueda del mouse.
- Permitir mover la imagen con arrastre cuando tenga zoom.
- Doble click o boton para resetear vista.
- Mantener el comprobante dentro del modal, sin abrir otra pagina.

## Comportamiento esperado para PDF

- Mostrar PDF dentro del modal.
- Permitir scroll vertical de paginas.
- Permitir zoom.
- No abrir otra pestana.
- No descargar automaticamente.

## Rechazo y reemplazo

Si el operador rechaza:

- debe pedir motivo;
- debe usar el endpoint actual de rechazo;
- el cliente podra subir otro comprobante desde el portal segun flujo existente;
- cuando el cliente suba uno nuevo, el operador debe ver el comprobante nuevo, no el anterior.

Si el precio sube y el cliente sube diferencia:

- el visor debe poder mostrar el comprobante de diferencia;
- debe quedar claro si el caso es pago inicial, reenvio por rechazo o diferencia de precio.

La clasificacion visual de esos casos puede quedar para el rediseno de mesa, pero el visor no debe impedir verla.

## Archivos previstos

Probables archivos a tocar al implementar:

- `public/index.html`
- `public/app.js`
- `public/styles.css`

Posibles archivos si se agrega dependencia PDF.js:

- `package.json`
- `package-lock.json`
- archivo local en `public/vendor/` o integracion equivalente, segun decision tecnica.

No tocar sin nueva autorizacion:

- `server/frp/frp-routes.js`
- `server/portal/portal-routes.js`
- pricing;
- tests de backend salvo que se agregue una prueba necesaria.

## Implementacion aplicada

Archivos modificados:

- `public/index.html`: el modal `#frpProofDialog` ahora separa resumen de orden y visor.
- `public/app.js`: el visor elige comprobantes pendientes, renderiza imagenes completas y PDFs con PDF.js, agrega zoom con rueda, arrastre con mouse y doble click para resetear.
- `public/styles.css`: nuevo layout compacto del modal, panel de datos y escenario del comprobante.
- `server.js`: agrega soporte MIME para `.mjs`, necesario para cargar PDF.js y su worker.
- `package.json` y `package-lock.json`: agrega `pdfjs-dist@4.10.38`, compatible con Node 20.
- `public/vendor/pdfjs/`: copia local de `pdf.min.mjs` y `pdf.worker.min.mjs`.

Fuera de alcance, no modificado:

- `server/frp/frp-routes.js`
- backend de aprobar/rechazar pago
- tomar/finalizar
- tecnico activo
- pricing
- SSE
- portal cliente

## Verificacion aplicada

- `npm.cmd test`: 14 pruebas pasadas.
- `node --check public/app.js`: sintaxis valida.
- `node --check server.js`: sintaxis valida.
- servidor temporal en puerto 4331: `pdf.min.mjs` y `pdf.worker.min.mjs` responden `text/javascript; charset=utf-8`.
- servidor temporal eliminado al finalizar la prueba.

## Nota de control

Durante la implementacion se detecto un intento de reemplazo que podia introducir ruido de codificacion en `app.js`.
Se descarto ese cambio, se restauro el archivo y se reaplico con `apply_patch` para evitar arrastrar caracteres corruptos.
Esto queda registrado como incidente de proceso y ejemplo de por que no se deben hacer reemplazos amplios sin revisar diff.

## Correccion visual aprobada

Durante la validacion local con datos desechables se encontro que el campo de motivo de rechazo aparecia visible al abrir el modal.

Hecho:

- El HTML abre `.frp-proof-dialog-reason` con atributo `hidden`.
- Una regla CSS previa `.frp-proof-dialog-reason { display: grid; }` hacia visible el campo aunque siguiera marcado como `hidden`.

Decision:

- Mantener el flujo actual: el motivo solo aparece despues de apretar `Rechazar`.
- Corregir con CSS minimo: `.frp-proof-dialog-reason[hidden] { display: none; }`.

Archivo afectado:

- `public/styles.css`.

Validacion posterior:

- `npm.cmd test`: 14 pruebas pasadas.
- `node --check public/app.js`: sintaxis valida.
- `node --check server.js`: sintaxis valida.
- Servidor aislado en `http://127.0.0.1:55015` con `ARIAD_DATA_DIR` temporal.
- Imagen vertical: modal abre con motivo oculto, imagen completa visible, rechazo con motivo cierra el modal y deja el comprobante rechazado.
- PDF: modal abre con motivo oculto, PDF de 2 paginas renderiza dentro del visor, aprobar cierra el modal y deja el pago validado.
- Consola del navegador: sin errores ni warnings.

## Pruebas obligatorias

Antes de considerar listo:

1. Abrir modal con imagen vertical.
2. Confirmar que no se recorta.
3. Probar zoom.
4. Probar arrastre/pan.
5. Abrir modal con PDF.
6. Confirmar que PDF se ve dentro del modal.
7. Aprobar pago desde el modal.
8. Rechazar pago con motivo.
9. Verificar que el flujo no rompio `Tomar`, `Finalizar` ni tecnico activo.
10. Verificar en navegador local antes de subir.

## Riesgos

- PDF.js agrega peso o configuracion extra.
- Si se integra mal, puede fallar solo en deploy.
- Si se cambia demasiado HTML del modal, se pueden romper los botones actuales.
- Si se oculta informacion de orden, el operador podria validar un comprobante sin contexto.

## Decision de alcance

El primer cambio de codigo debe ser pequeno y controlado:

visor de comprobantes real con imagen/PDF y acciones actuales.

La mesa operativa completa se redisenara despues.
