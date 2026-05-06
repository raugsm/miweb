# Sesion 21 - Investigacion mobile proof upload

Fecha: 2026-05-06

## Sintoma reportado

Cliente reporta que Chrome se cierra cuando intenta abrir/subir el comprobante desde el portal cliente.

No hay todavia evidencia directa del dispositivo del cliente. El reporte no distingue si Chrome se cierra:

- al tocar la zona "Subi tu comprobante";
- al abrir el picker del sistema;
- despues de elegir camara/galeria/archivo;
- durante la lectura/subida del archivo.

Esa distincion cambia la causa probable.

## Hechos locales

- El selector del comprobante vive en `public/portal.html`.
- La dropzone es un `label` con `role="button"` y `tabindex="0"`.
- El input real es:

```html
<input type="file" id="panel3ProofInput" accept="image/jpeg,image/png,image/webp,application/pdf" hidden />
```

- El input usa el atributo HTML `hidden`, por lo que no esta renderizado.
- `public/portal-modules/events.js` depende del comportamiento implicito del label para click/tap y usa `panel3ProofInput.click()` en teclado y en el boton "Reemplazar".
- `public/portal-modules/proofs.js` lee cada archivo con `FileReader.readAsDataURL(file)` y envia `dataUrl` dentro de JSON.
- El backend ya valida el proof como Data URL y limita cantidad/tamano/tipo. No hay evidencia de que el cierre de Chrome empiece en Postgres o en los endpoints.
- La decision consolidada existente marca `Mobile UX` de pago/comprobante como "pendiente de implementacion". Esa seccion pide un label tappable, `accept="image/*,application/pdf"`, sin `capture`, manejo de picker cancelado, formato invalido y conexion perdida.

## Fuentes externas usadas

- MDN, File API: permite seleccionar archivos con `<input type="file">` o drag and drop, y expone `FileList` por evento `change`.
- MDN, hidden file input with label: cuando se usa `label` para disparar un file input, el input no debe ocultarse con `display: none` ni `visibility: hidden`; recomienda tecnica "visually hidden".
- MDN, `<input type="file"> accept`: `accept` es una pista para el navegador, no validacion; debe respaldarse con validacion de servidor. `accept="image/*"` suele habilitar camara en moviles.
- web.dev, capturing images: en Chrome/Safari mobile, `accept="image/*"` ofrece elegir app/camara/archivo; `capture` fuerza mas el camino de camara y en Android puede quitar la opcion de elegir imagen existente.
- MDN, `FileReader.readAsDataURL()`: el resultado queda como Data URL con contenido base64. Esto confirma que el flujo actual materializa el archivo completo como string antes de enviarlo.

## Inferencias

### Causa probable 1: selector movil fragil por input realmente oculto

La implementacion actual combina `label` como area tappable con un input `hidden`. MDN desaconseja ocultar asi el input cuando el label debe abrir el picker sin JS.

Esto encaja con un fallo al "abrir para subir comprobante", antes de que exista request de red.

### Causa probable 2: memoria/peso despues de seleccionar archivo

Si el cliente logra abrir el picker y Chrome se cierra despues de elegir foto/PDF, el punto sospechoso pasa a `FileReader.readAsDataURL()`.

El flujo actual convierte hasta 4 archivos de hasta 5 MB cada uno a Data URL/base64 y los mete en JSON. Eso es aceptable para pruebas controladas, pero no es el contrato mas robusto para moviles con poca memoria.

### Causa menos probable: backend/Postgres

Si Chrome se cierra antes de request visible en Network, backend/Postgres no es causa primaria. Si se ve request 500/413/timeout, entonces hay que reabrir la rama backend.

## Decision tecnica recomendada

Aplicar primero un hardening minimo del selector:

1. Reemplazar `hidden` por clase visualmente oculta.
2. Asociar explicitamente el label con `for="panel3ProofInput"`.
3. Usar `accept="image/*,.pdf,application/pdf"` para permitir camara/galeria/archivo en moviles y mantener PDF.
4. Mantener `capture` ausente.
5. Hacer la validacion frontend tolerante a `file.type === ""` usando extension controlada, sin relajar backend.
6. Agregar test estatico para impedir que vuelva `hidden` en `panel3ProofInput`.

Esto no reescribe almacenamiento ni endpoints. Ataca el punto mas cercano al sintoma.

## Cambio aplicado en esta sesion

- `public/portal.html`: `panel3ProofInput` deja de usar `hidden`, queda antes del label y el label se asocia explicitamente con `for="panel3ProofInput"`.
- `public/portal-styles/13-panel-3.css`: nueva clase `panel-3-proof-input` con tecnica visually-hidden.
- `public/portal.html`: `accept` cambia a `image/*,.pdf,application/pdf`, sin `capture`.
- `public/portal-modules/proofs.js`: si el picker movil entrega `file.type === ""`, se infiere el MIME desde extension permitida y se normaliza el prefijo Data URL.
- `test/phase3a.contract.test.js`: contrato estatico para impedir reintroducir `hidden` y test de archivo `.jpg` sin MIME.

## Siguiente fase si persiste

Si el cliente sigue reportando cierre despues de seleccionar archivo, el siguiente cambio ya no debe ser cosmetico:

- dejar de enviar proofs como JSON base64;
- mover proof upload a `multipart/form-data` o flujo Blob;
- considerar compresion/redimensionado cliente-side para fotos;
- registrar telemetria ligera de `proof_picker_open`, `proof_selected`, `proof_read_started`, `proof_read_failed`, `proof_upload_started`, sin datos sensibles.

## Datos que faltan del cliente

- Android/iOS y version de Chrome.
- Si el cierre ocurre antes o despues de elegir archivo.
- Fuente del archivo: camara, galeria, WhatsApp/archivos, PDF.
- Peso aproximado del archivo.
- Si en DevTools/Network aparece alguna request antes del cierre.
