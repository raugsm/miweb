# Sesion 16 - Correcciones cliente/operador en curso

**Fecha:** 2026-05-04  
**Rama:** `feat-b008-fix`  
**Estado:** en curso  
**Objetivo inmediato:** conectar correctamente cliente + operador para poder validar local y preparar subida online.

---

## Reglas de trabajo de esta fase

1. Primero se verifica el codigo y la pantalla actual.
2. Cada correccion queda anotada antes o durante el cambio.
3. Cada cambio debe tener prueba concreta: test automatico, prueba local visible o ambas.
4. No se mezclan problemas visuales con problemas de flujo si no dependen entre si.
5. No se sube online sin validacion local y aprobacion de Bryam.

---

## Hechos confirmados

- Existen dos webs servidas por el mismo proyecto:
  - Cliente: `/cliente` en local, `ariadgsm.com` en produccion.
  - Operador/tecnico: `/` en local, `ops.ariadgsm.com` en produccion.
- La ruta revisada por Codex es:
  - `C:\Users\Bryams\Documents\Codex\2026-04-29\Bryams\.deploy-miweb`
- El servidor local de vista previa se levanto en:
  - `http://127.0.0.1:4183/cliente`
  - `http://127.0.0.1:4183/`
- La vista previa usa data temporal fuera del repo para no tocar usuarios reales:
  - `C:\Users\Bryams\Documents\Codex\2026-05-04\hola-ahora-si-entramos-a-seguir\deploy-miweb-preview-data-4183`

---

## Cambio ya aplicado en codigo

### S16-FIX-001 - La orden desaparece tras aprobar comprobante

**Sintoma:** el cliente subia comprobante, el operador lo veia en pagos por revisar, lo aprobaba y luego la orden desaparecia de la cola tecnica.

**Causa confirmada:** el endpoint `POST /api/portal/orders/:id/notify-connected` marcaba que el cliente habia conectado, pero no promovia el trabajo ligado a la orden hacia `LISTO_PARA_TECNICO`.

**Correccion aplicada:**

- Archivo: `server/portal/portal-routes.js`
- Al confirmar "Equipo conectado", el backend ahora actualiza el job ligado a la orden del portal:
  - `clientConnected = true`
  - `requiredStateConfirmed = true`
  - `modelSupported = true` cuando aplica
  - status `LISTO_PARA_TECNICO` si el modelo es apto
  - status `REQUIERE_REVISION` si el modelo no queda apto

**Prueba agregada:**

- Archivo: `test/phase4.smoke.test.js`
- La prueba ahora confirma que, despues de aprobar el pago y llamar `notify-connected`, el job aparece como `LISTO_PARA_TECNICO`.

**Resultado de pruebas:**

- `npm.cmd test`
- Resultado: 12 tests pasaron, 0 fallaron.

### S16-FIX-002 - Panel 4 conectado a Technician ID real y notify-connected

**Sintoma:** Panel 4 mostraba un Technician ID de prueba y el boton "Equipo conectado" seguia como no-op en el frontend.

**Causa confirmada:**

- `panel-4-connection.js` caia al valor de prueba `1000 9983 5478`.
- `events.js` tenia el listener del boton, pero no llamaba a `notifyEquipoConectado`.
- El backend no exponia en la orden publica el Technician ID congelado para que el cliente lo siguiera viendo despues del click.

**Correccion aplicada:**

- Panel 4 ahora lee primero el ID congelado de la orden.
- Si aun no hay ID congelado, usa `state.activeTechnician.redirectorId`.
- Si no hay tecnico activo, muestra "Tecnico no disponible" y no deja copiar un valor falso.
- El boton "Equipo conectado" llama a `POST /api/portal/orders/:id/notify-connected`.
- El backend congela `technicianId`/`redirectorId` en la orden cuando el cliente confirma conexion.
- La orden publica ahora devuelve `technicianId` y `redirectorId`.

**Prueba agregada/ampliada:**

- `test/phase4.smoke.test.js` ahora configura un Technician ID real en el admin de prueba.
- La prueba confirma que `notify-connected` congela `1000 9983 5478` en la orden.
- La prueba confirma que el job ligado al portal queda `LISTO_PARA_TECNICO`.

**Resultado de pruebas:**

- `npm.cmd run test:smoke`: paso.
- `npm.cmd test`: paso, 12 tests, 0 fallos.

### S16-VAL-001 - Operador ve la orden en pagos por revisar

**Prueba visible en navegador local:**

- URL operador: `http://127.0.0.1:4183/`
- Usuario temporal: `operador.preview@local.test`
- Rol: `ATENCION_TECNICA`
- Canal: `WhatsApp 3`
- Technician ID activo: `1000 9983 5478`

**Resultado observado:**

- La orden `ORD-20260504-001` aparece en `Pagos por revisar · 1`.
- Cliente mostrado: `Cliente Prueba Local`.
- Monto mostrado: `S/ 281.25`.
- La cola `Cola · listos` sigue vacia.

**Interpretacion:** este estado es correcto para este punto del flujo. La orden todavia no debe aparecer como lista para tecnico porque primero falta aprobar/rechazar el comprobante. Despues de aprobar pago y confirmar conexion del cliente, debe pasar a la cola tecnica.

### S16-FIX-003 - Operador no puede abrir "Ver comprobante"

**Sintoma visible:** la orden aparece en `Pagos por revisar`, pero el boton `Ver comprobante` no abre nada.

**Causa confirmada:** el boton estaba renderizado como `disabled` porque el frontend usaba permisos generales de pagos (`ADMIN` o `COORDINADOR`). El backend tambien rechazaba `PATCH /api/frp/orders/:id/payment-review` para usuarios `ATENCION_TECNICA`, aunque esten en `WhatsApp 3`.

**Riesgo:** el flujo real queda bloqueado para el trabajador. El cliente puede subir comprobante, pero el operador/tecnico de WhatsApp 3 no puede validarlo.

**Correccion aplicada:**

- `public/app.js`: la seccion FRP usa permiso especifico `canReviewFrpPayments()`.
- `server.js`: pagos FRP ahora pueden ser validados por `ADMIN`, `COORDINADOR` o usuario activo con canal `WhatsApp 3`.
- `public/index.html`: se versiona `app.js` con `?v=s16-fix003` para evitar que el navegador mantenga el JS viejo cacheado.
- No se cambia el permiso general de tickets; el cambio queda limitado a FRP.

**Decision aprobada por Bryam:**

Puede validar pagos FRP:

- `ADMIN`.
- `COORDINADOR`.
- Usuario activo asignado a `WhatsApp 3`.

No puede validar pagos FRP:

- Usuario inactivo.
- Operador de otro WhatsApp.
- Cliente.

**Prueba agregada:**

- `test/phase4.smoke.test.js` crea un usuario `ATENCION_TECNICA` en `WhatsApp 3`.
- Ese usuario aprueba el comprobante FRP del portal.
- La prueba tambien crea un usuario `ATENCION_TECNICA` activo en `WhatsApp 1` y confirma que recibe `403` al intentar validar un pago FRP.
- Luego se confirma que el job ligado aparece en el panel operador como `LISTO_PARA_TECNICO`.

### S16-FIX-004 - Orden aprobada queda invisible antes de conexion del cliente

**Sintoma visible:** el operador aprueba el comprobante y la orden deja de aparecer en `Pagos por revisar`, pero todavia no aparece en `Cola · listos`.

**Causa confirmada:** despues de aprobar pago, la orden queda en estado intermedio:

- `frpOrder.paymentStatus = COMPROBANTE_RECIBIDO`
- `frpOrder.orderStatus = PAGO_VALIDADO`
- jobs en `ESPERANDO_PREPARACION`
- checklist de conexion todavia incompleto

La pantalla operador solo mostraba:

- pagos pendientes (`PAGO_EN_VALIDACION`);
- jobs listos (`LISTO_PARA_TECNICO`);
- jobs en revision (`REQUIERE_REVISION`);
- finalizados.

Por eso la orden no se borra, pero queda fuera de cualquier seccion visible.

**Decision:** no mandar la orden directo a tecnico al aprobar pago. Eso saltaria la etapa de conexion del cliente y podria crear trabajo sin equipo conectado.

**Correccion aplicada:**

- `public/app.js`: nueva seccion `Esperando conexion`.
- Muestra ordenes con pago aprobado, jobs aun en `ESPERANDO_PREPARACION` o `ESPERANDO_CLIENTE`, y checklist de conexion incompleto.
- `public/styles.css`: estilo diferenciado para la tarjeta de espera.
- `public/index.html`: cache bust `?v=s16-fix004` para `styles.css` y `app.js`.

**Prueba agregada:**

- `test/phase4.smoke.test.js` ahora confirma que, despues de aprobar pago con tecnico WhatsApp 3, la orden sigue presente en `session.frp.orders` como pago aprobado y esperando conexion.

### S16-FIX-005 - Click "Equipo conectado" no llega al servidor

**Sintoma visible:** el cliente hace click en `Equipo conectado`, pero no cambia nada en cliente ni operador.

**Causa confirmada:** despues del click, la data seguia sin `customerConnectedAt`, sin `customerConnectionReadyAt` y los jobs seguian en `ESPERANDO_PREPARACION`. Eso prueba que el endpoint `POST /api/portal/orders/:id/notify-connected` no fue ejecutado.

**Causa tecnica probable:** cache de frontend. El servidor entregaba `.js` y `.css` con `Cache-Control: public, max-age=3600`, pero el proyecto no usa archivos con hash de build. Entonces el navegador podia seguir usando `events.js` viejo, donde el boton no llamaba al endpoint.

**Correccion aplicada:**

- `server.js`: `.js` y `.css` pasan a `Cache-Control: no-cache, must-revalidate`.
- `public/portal.html`: se versiona `portal.js` con `?v=s16-fix005`.
- `public/portal.js`: se versionan los imports principales del portal cliente con `?v=s16-fix005`, incluyendo `events.js`.

**Decision:** este arreglo es mas correcto que pedir "recargar duro" manualmente, porque tambien protege el deploy online mientras no exista build con assets hasheados.

**Validacion visible local:**

- En esa validacion historica, despues de recargar `/cliente`, el click en `Equipo conectado` mostro: `Conexion confirmada para CL-20260504-001`. Este aviso visual queda retirado en `S16-UI-010`.
- `customerConnectedAt` y `customerConnectionReadyAt` quedaron grabados.
- El primer job `ORD-20260504-001-1` paso a `LISTO_PARA_TECNICO`.
- El cliente ahora muestra la orden en `Mis ordenes` como `Listo para conexion`.

### S16-VAL-002 - Operador toma y finaliza el primer equipo

**Validacion visible/local:** Bryam tomo el pedido desde operador y marco finalizado.

**Resultado confirmado en data temporal:**

- `ORD-20260504-001-1` quedo en `FINALIZADO`.
- Se grabo `doneAt`.
- Se genero `ardCode = ARD001-AA`.
- El tecnico registrado fue `Operador Preview Local`.
- La orden FRP general quedo en `PARCIAL_LISTA` porque era una orden de 3 equipos.

**Punto pendiente detectado:** los equipos `ORD-20260504-001-2` y `ORD-20260504-001-3` siguen en `ESPERANDO_PREPARACION`. Esto puede ser correcto si cada equipo requiere una nueva confirmacion/conexion del cliente, pero si el trabajador debe continuar con el siguiente equipo sin pedir otra accion al cliente, falta una regla de avance automatico al finalizar cada job.

### S16-AUD-001 - Auditoria spec vs codigo de Mis ordenes

**Documento creado:** `docs/specs/_sesion-16-auditoria-spec-vs-codigo.md`

**Resultado:** la spec de `Mis ordenes` ya define una card por equipos individuales, pero la web local sigue usando la card vieja:

- boton `Actualizar`;
- barra de progreso general;
- `Comprobante (PDF)`;
- `Ayuda`;
- `Registro de actividad`;
- estado global de orden en vez de filas por equipo.

**Conclusion:** no conviene maquillar visualmente esa seccion. La siguiente correccion debe implementar `Mis ordenes v1 minimo funcional`:

- filas por equipo;
- estados Pendiente / Esperando tecnico / En proceso / Finalizado;
- boton `Equipo listo` para equipos pendientes;
- `Recibo de operacion` deshabilitado hasta finalizar todo;
- limpieza de elementos viejos descartados por la spec.

**Pendiente antes de codificar:** confirmar si el backend ya tiene endpoint para marcar un equipo/job pendiente como conectado por el cliente. Si no existe, agregarlo con prueba.

### S16-AUD-002 - Endpoint para `Equipo listo`

**Resultado:** no existe un endpoint de cliente especifico para marcar un item concreto como listo.

**Lo que existe hoy:**

- `POST /api/portal/orders/:id/notify-connected`
  - sirve para el primer equipo y hoy avanza el siguiente job pendiente de la orden;
  - no recibe `itemId`;
  - no garantiza que el cliente haya marcado una fila concreta.
- `PATCH /api/frp/jobs/:id/ready`
  - existe del lado operador/FRP;
  - no sirve directo para cliente porque requiere permisos de operador.

**Decision recomendada antes de implementar UI:** agregar endpoint de cliente:

- `POST /api/portal/orders/:orderId/items/:itemId/ready`

**Razon:** la spec de `Mis ordenes` pide botones por equipo pendiente. Si la UI muestra botones por fila pero el backend solo avanza "el siguiente", la pantalla puede mentirle al cliente.

---

## Hallazgos visuales actuales en cliente

### S16-UI-000 - Referencia visual objetivo aportada por Bryam

**Fuente:** captura compartida por Bryam durante sesion 16.

**Direccion visual esperada con el tiempo:**

- La pantalla logueada debe sentirse como herramienta operativa, no como landing.
- Los 4 paneles principales deben verse en una sola franja horizontal:
  - Metodo de pago.
  - Solicitud.
  - Datos de pago.
  - Conexion.
- Los paneles deben tener altura equilibrada y bastante aire interno.
- El Panel 4, antes de que exista una orden/comprobante, puede estar casi vacio:
  - titulo "Conexion";
  - boton "Descargar Redirector v2.5";
  - sin Technician ID ni codigo visible en estado inicial si todavia no corresponde operativamente.
- La seccion inferior de Mis ordenes debe verse como un bloque ancho, limpio y centrado:
  - mensaje principal: "Aun no tenes ordenes.";
  - mensaje secundario: "Tu primera orden aparecera aca.";
- El resumen superior de sesion/estado/equipos/dispositivo no aparece en la referencia visual objetivo.
- La referencia usa una densidad visual mayor que la pantalla actual: menos encabezado, mas foco en los paneles.

**Implicacion:** no conviene resolver esto con pequenos parches visuales sueltos. Hay que separar:

1. Correcciones funcionales bloqueantes para subir online.
2. Reduccion visual de la pantalla cliente hacia este objetivo.

**Decision por ahora:** mantener esta referencia documentada. La prioridad inmediata sigue siendo validar cliente -> operador completo; despues se puede hacer una pasada visual controlada contra esta referencia.

### S16-UI-001 - El bloque grande de marca sigue visible despues del login

**Hecho visible:** al entrar como cliente, la parte superior sigue mostrando el bloque grande "Xiaomi FRP Express con seguimiento en linea." y empuja la pantalla operativa hacia abajo.

**Riesgo:** el cliente no ve de inmediato la herramienta de trabajo. Para una pantalla operativa, esto se siente mas como landing que como portal de uso diario.

**Decision tecnica aplicada:** para la fase operativa, el bloque grande queda solo en login/registro. Despues del login se oculta y `appPanel` ocupa todo el ancho disponible.

**Por que:** la pantalla logueada no es una landing; es una herramienta de trabajo. El cliente debe ver los 4 paneles y Mis ordenes lo antes posible.

### S16-UI-002 - Panel 4 todavia muestra datos de tecnico de prueba antes de validar el flujo real

**Hecho visible:** Panel 4 muestra Technician ID y codigo del proceso desde el login.

**Riesgo:** si esos datos siguen hardcoded o no estan conectados al tecnico activo real, el cliente podria pegar datos incorrectos.

**Decision tecnica:** no maquillar visualmente esto antes de revisar el origen real de esos datos.

**Resultado de auditoria:** confirmado. El backend ya expone `GET /api/portal/active-technician` y `POST /api/portal/orders/:id/notify-connected`, pero el modulo cliente `panel-4-connection.js` todavia cae a `DEBUG_TECHNICIAN_ID = "1000 9983 5478"` cuando no encuentra un valor en la orden. Ademas, el click de "Equipo conectado" en `events.js` sigue documentado como no-op.

**Primer arreglo priorizado:** conectar Panel 4 a datos reales:

- leer `state.activeTechnician.redirectorId` antes de usar cualquier fallback;
- quitar el fallback visual hardcoded en flujo normal;
- activar el click "Equipo conectado" contra `notify-connected`;
- congelar el Technician ID real en la orden cuando el cliente confirma conexion.

### S16-FIX-006 - Mis ordenes v1 por equipo

**Problema confirmado:** despues de finalizar el primer equipo de una orden multi-equipo, los equipos 2..N quedaban pendientes en backend, pero el cliente no tenia una accion clara por fila para decir "este equipo ya esta conectado/listo".

**Riesgo:** usar `notify-connected` otra vez para avanzar "el siguiente equipo" seria ambiguo. Si el cliente toca el boton del equipo 3, el backend podria mover el equipo 2 porque esa ruta no recibe `itemId`.

**Decision tecnica aplicada:** agregar una ruta de cliente por item:

```text
POST /api/portal/orders/:orderId/items/:itemId/ready
```

**Reglas aplicadas:**

- la orden debe pertenecer al cliente logueado;
- el item debe pertenecer a esa orden;
- el pago debe estar validado;
- el job ligado debe estar en `ESPERANDO_PREPARACION` o `ESPERANDO_CLIENTE`;
- el job pasa a `LISTO_PARA_TECNICO` usando la misma regla de checklist que `notify-connected`;
- se publica refresco para cliente y operador.

**Frontend aplicado:** `Mis ordenes` ahora muestra filas por equipo:

- `Finalizado` para equipo terminado;
- `Esperando tecnico` para equipo ya enviado a cola;
- `Pendiente` + boton `Equipo listo` para equipo pendiente;
- `Recibo de operacion` queda deshabilitado hasta que todos los equipos esten finalizados.

### S16-VAL-006 - Validacion multi-equipo

**Prueba automatica:** `npm.cmd test` pasa completo.

**Cobertura nueva:** `test/phase4.smoke.test.js` ahora crea una orden portal de 3 equipos, valida pago, usa `notify-connected` para el primer equipo y usa `POST /api/portal/orders/:orderId/items/:itemId/ready` para el segundo. La prueba confirma que el operador recibe 2 jobs en `LISTO_PARA_TECNICO` sin que la orden desaparezca.

**Validacion en navegador local:** en `http://127.0.0.1:4183/cliente`, la orden `CL-20260504-001` muestra:

- equipo 1 finalizado;
- equipo 2 en `Esperando tecnico` despues del click `Equipo listo`;
- equipo 3 pendiente con su propio boton `Equipo listo`;
- recibo bloqueado mientras falte finalizar algun equipo.

**Consola navegador:** sin errores visibles despues del render y click.

### S16-UI-003 - Limpieza visual inmediata cliente

**Pedido de Bryam:** quitar elementos visuales que ensucian la pantalla operativa despues de validar `Mis ordenes`.

**Aplicado:**

- se quito el mensaje global `Equipo N enviado al tecnico` debajo de los 4 paneles;
- se quito el chip `WhatsApp 3` del encabezado del flujo cliente.

**Razon:** el estado real ya se ve en la fila del equipo (`Esperando tecnico`). Repetir el mensaje en otra zona mete ruido visual y no agrega informacion.

### S16-UI-004 - Avisos internos vacios en cards oscuras

**Pedido de Bryam:** revisar primero que funcion tenian los recuadros claros dentro de las cards oscuras de Panel 1 y Panel 2 antes de quitarlos.

**Hechos verificados:**

- Panel 1 usa `#panel1EstimateNotice`.
- Panel 2 usa `#panel2Notice`.
- Ambos nodos tienen funcion real: mostrar avisos temporales dentro de la card oscura.
- Panel 1 muestra avisos de tasa/cambio de metodo no disponible.
- Panel 2 muestra avisos de cantidad mayor a 10, modelo no soportado o modelo no reconocido.

**Causa:** los nodos estan en HTML con `hidden`, pero su CSS base define `display: flex`. Eso hace que el navegador los pinte como barras vacias aunque no haya aviso visible.

**Decision:** no eliminar los nodos. Corregir CSS para que `#panel1EstimateNotice[hidden]` y `#panel2Notice[hidden]` no se muestren. Asi se conserva la funcion y se quita el ruido visual.

**Validacion esperada:**

- al cargar la pantalla normal, no aparecen barras vacias;
- si en el futuro se dispara un aviso, el cajon sigue existiendo y podra mostrarse;
- no se toca el calculo de precio ni el flujo cliente-operador.

### S16-VAL-007 - Validacion pendiente de avisos reales

**Pregunta de Bryam:** confirmar si ademas de ocultar los avisos vacios se probo que sigan funcionando cuando el tecnico/admin cambia precio o tasa.

**Respuesta honesta inicial:** no estaba probado al momento de aplicar S16-UI-004. Solo se habia validado:

- pantalla normal sin barras vacias;
- consola navegador sin errores;
- `npm.cmd test` completo.

**Verificacion agregada despues de la pregunta:**

- Endpoint real de tasa ubicado: `PATCH /api/pricing/exchange-rates/:key`.
- Ese endpoint publica el evento SSE `exchange_rate_changed` por `/api/portal/admin-config/events`.
- El frontend cliente escucha ese evento en `public/portal-modules/admin-config-stream.js` y, si afecta la moneda seleccionada, muestra `#panel1EstimateNotice` con el mensaje "El tipo de cambio cambio, monto actualizado".
- Se agrego prueba automatica en `test/phase4.smoke.test.js`: abre el stream real `admin-config`, cambia la tasa PEN a `3.76` y confirma que llega `event: exchange_rate_changed` con `currency: PEN` y `ratePerUsdt: 3.76`.
- Resultado: `npm.cmd test` paso completo, 12 tests, 0 fallos.

**Brecha que queda abierta:**

- No se forzo el cambio en la preview visible `http://127.0.0.1:4183/cliente` con el admin real, porque el login admin de esa data pide PIN/dispositivo autorizado. Esa seguridad no se debe saltar.
- Falta una validacion visual controlada donde Bryam entre como admin autorizado, cambie la tasa desde operador y se confirme en pantalla cliente que el aviso aparece y vuelve a ocultarse sin dejar barra vacia.

**Aclaracion importante sobre "cambio de precio":**

- Cambio de tasa de moneda: probado por endpoint real + SSE.
- Cambio de costo/precio FRP interno (`/api/frp/pricing/...`): tiene pruebas de calculo y re-publica ordenes a clientes, pero no esta probado como aviso amarillo del Panel 1. Si queremos que el cliente vea un aviso especifico cuando sube/baja el costo FRP, eso requiere una decision aparte y prueba propia.

### S16-FIX-008 - Refresco correcto despues de Equipo conectado

**Problema confirmado por Bryam:** al presionar `Equipo conectado`, la orden avanzaba para el operador, pero la pantalla cliente quedaba con datos de la orden anterior:

- Panel 2 seguia mostrando la cantidad anterior;
- Panel 3 seguia mostrando `Comprobante validado`;
- Panel 4 volvia a estado A, pero perdia el codigo real y mostraba placeholder;
- los paneles 1-3 seguian tratados como bloqueados para nueva solicitud.

**Auditoria aplicada antes del cambio:**

- tocar solo el mensaje o recargar la pagina no arreglaba la causa;
- tocar solo backend no correspondia, porque el backend ya movia la orden;
- tocar solo Panel 4 dejaba Panel 2 y Panel 3 con estado viejo;
- la opcion correcta era ajustar el estado visual completo del cliente despues de `connected`.

**Decision aprobada por Bryam:** aplicar opcion 2: al pasar de `awaiting_connection` a `connected`, el pedido pasa a seguimiento y los paneles 1-3 vuelven a modo borrador para el siguiente pedido.

**Cambios aplicados:**

- `public/portal-modules/auth-forms.js`: desbloquea paneles 1-3 en estado `connected` y limpia cantidad/modelo al cerrar la conexion.
- `public/portal.html`: cantidad inicial de nuevo pedido queda en `1`, no en `2`.
- `public/portal-modules/panel-3-account.js`: `Comprobante validado` solo aplica a orden validada pre-clic; despues de conectar vuelve la zona de subida normal.
- `public/portal-modules/panel-4-connection.js`: si existe orden viva en seguimiento, el codigo real se mantiene visible aunque el panel este en estado A.
- `public/portal-styles/14-panel-4.css`: el boton Copiar del codigo se oculta solo cuando no hay codigo real.

**Validacion automatica:**

- `node --check` paso en los modulos modificados.
- `npm.cmd test` paso completo: 12 pruebas, 0 fallos.

**Validacion visual en `http://127.0.0.1:4183/cliente`:**

- cantidad visible: `1`;
- Panel 3: dropzone visible, `Comprobante validado` oculto;
- Panel 4: codigo visible `CL-20260504-001`;
- boton Copiar de codigo visible;
- paneles 1, 2 y 3 sin clase `step-locked`;
- consola navegador: 0 errores.

### S16-FIX-009 - Reemplazar comprobante en revision

**Problema confirmado por Bryam:** despues de subir un comprobante, el boton `Reemplazar` aparecia pero no respondia.

**Hechos verificados antes de tocar codigo:**

- En navegador, `#panel3ProofAction` estaba visible y sin atributo `disabled`.
- El bloqueo real venia de `.panel-3.step-locked`.
- `.panel.step-locked` aplica `pointer-events: none`, por eso el click no llegaba al boton.
- El backend ya tenia `PATCH /api/portal/orders/:id/payment-proof`, pero acumulaba comprobantes con `concat`.

**Riesgo detectado:** si solo se desbloqueaba el boton, el cliente podia subir otro comprobante pero el operador veria varios comprobantes juntos. Eso no era reemplazar; era acumular, con riesgo de aprobar el archivo viejo.

**Decision aprobada por Bryam:** opcion 2: permitir `Reemplazar` y hacer reemplazo real del comprobante vigente.

**Cambios aplicados:**

- `public/portal-modules/auth-forms.js`: Panel 1 y Panel 2 siguen congelados durante `PAGO_EN_REVISION`, pero Panel 3 queda clickeable para `Reemplazar`.
- `server/portal/portal-routes.js`: `PATCH /payment-proof` reemplaza `paymentProofs` en la orden cliente y en la orden FRP ligada, en vez de acumularlos.
- `server/portal/portal-routes.js`: al reemplazar comprobante, limpia motivo/autor/fecha de rechazo anterior en la orden FRP.
- `test/phase4.smoke.test.js`: agrega prueba donde el cliente sube comprobante y luego lo reemplaza; confirma que el cliente y operador ven solo 1 comprobante vigente.

**Validacion automatica:**

- `node --check` paso en los archivos modificados.
- `npm.cmd test` paso completo: 12 pruebas, 0 fallos.

**Validacion visual en `http://127.0.0.1:4183/cliente`:**

- `#panel3Proof` queda en estado `uploaded`.
- Panel 1 bloqueado: si.
- Panel 2 bloqueado: si.
- Panel 3 bloqueado: no.
- Boton `Reemplazar` visible y habilitado.
- Consola navegador: 0 errores.

### S16-UI-010 - Quitar aviso verde despues de conectar equipo

**Problema confirmado por Bryam:** despues de usar `Equipo conectado`, la pantalla cliente mostraba una linea verde: `Conexion confirmada para CL-... El tecnico ya puede tomar el equipo.`

**Hechos verificados antes de tocar codigo:**

- El texto salia desde `public/portal-modules/events.js`, dentro del flujo `notify-connected`.
- `#orderMessage` tambien se usa para errores y otros avisos del portal.
- Quitar todo el bloque `#orderMessage` habria eliminado mensajes utiles cuando falla la subida, el pago o la conexion.

**Decision aplicada:** quitar solo el mensaje de exito despues de conectar equipo y conservar los mensajes de error.

**Cambio aplicado:**

- `public/portal-modules/events.js`: despues de `notifyEquipoConectado(order.id)`, la UI se refresca y `#orderMessage` queda vacio.

**Validacion:**

- `node --check public\portal-modules\events.js` paso.
- En navegador `http://127.0.0.1:4183/cliente`, `#orderMessage` quedo vacio.
- El texto `Conexion confirmada` ya no aparece.
- Consola navegador: 0 errores.

### S16-UI-011 - Redisenio inicial de Costos FRP como tarjetas

**Pedido de Bryam:** comenzar el redisenio de `Costos FRP` al mismo estilo visual de los pasos y seguimiento.

**Protocolo seguido antes de tocar codigo:**

- Se reviso `_costos-frp-redesign-pendiente.md`.
- Se reviso `renderFrpPricingBox` en `public/app.js`.
- Se confirmo que la funcionalidad depende de conservar los `data-*` actuales.
- Se mostraron 3 opciones en chat y Bryam aprobo la opcion 1.
- Se consultaron y aprobaron riesgos: no tocar politica admin, no limpiar CSS viejo todavia, conservar `data-*`.

**Cambio aplicado:**

- `public/app.js`: la tabla de proveedores se reemplaza por tarjetas por proveedor.
- `public/app.js`: se conservan los mismos controles: estado, modo, USDT fijo, creditos, USDT/credito, motivo, guardar, archivar y agregar proveedor.
- `public/styles.css`: se agregan estilos para tarjetas, etiquetas de estado y grilla responsive.
- No se tocaron endpoints ni reglas de precio.

**Validacion:**

- `node --check public\app.js` paso.
- `git diff --check -- public\app.js public\styles.css` paso sin errores.
- En navegador `http://127.0.0.1:4183/`, Costos FRP renderiza 3 tarjetas de proveedor.
- Se confirmo que hay 3 botones Guardar, 3 botones Archivar, 3 inputs de motivo y 1 boton Agregar proveedor.
- La tabla vieja ya no se renderiza dentro de proveedores.
- Consola navegador: 0 errores.
- `npm.cmd test` paso completo: 12 pruebas, 0 fallos.

**Pendiente visual para validar con Bryam:**

- En pantallas muy anchas, las acciones de cada tarjeta quedan lejos del contenido. No se ajusto mas sin validacion visual de Bryam.
- Bryam confirma que el bloque se ve ancho. Se conserva asi por ahora y queda pendiente para una fase de margenes globales del panel `FRP Express`, no como ajuste aislado de `Costos FRP`.
- Cuando se definan margenes del panel completo, revisar ancho maximo del contenido, distancia horizontal de acciones y ritmo visual entre `Tu trabajo actual`, `Seguimiento`, `Costos FRP` y futuros modulos.

### S16-AUD-012 - Auditoria visual cliente vs guia de 4 paneles

**Pedido de Bryam:** documentar y revisar por que la pantalla cliente actual se ve distinta al diseno de referencia, aunque exista guia previa.

**Resultado:** se creo `docs/specs/_sesion-16-auditoria-visual-cliente-vs-guia.md`.

**Hechos principales:**

- La guia si define el modelo de 4 paneles paralelos.
- El CSS real usa breakpoints distintos a los escritos en la guia original.
- `.panels-row` usa `align-items: start`, por eso cada panel toma su propia altura.
- El panel 4 fue cambiado por una decision posterior: ahora muestra cards de `Technician ID`, `Codigo del proceso`, boton `Donde pegar` y descarga desde login.
- El contenido real de Mexico STP ocupa mas que la referencia de Yape Peru.
- Falta un contrato visual explicito que diga que manda cuando chocan mockup, guia y decisiones posteriores.

**Decision pendiente antes de tocar UI:** cerrar con Bryam el contrato visual de los 4 paneles, empezando por si en desktop deben verse como 4 tarjetas de la misma altura.

### S16-AUD-013 - Evidencia responsive de los 4 paneles cliente

**Pedido de Bryam:** comparar pantalla adelgazada, pantalla grande y vista local revisada por Codex.

**Resultado:** se amplio `docs/specs/_sesion-16-auditoria-visual-cliente-vs-guia.md` con la seccion `Evidencia adicional de resize`.

**Hallazgo:** hay dos problemas separados:

- Breakpoint: el grid real cambia a 4 columnas desde 1024px, no desde 900px como la guia original.
- Contrato visual: incluso en pantalla grande, los paneles no comparten altura porque cada uno crece segun su contenido.

**Regla para no repetir el error:** el proximo cambio visual debe decidir primero el contrato de layout, no mover botones o textos sueltos.

### S16-AUD-014 - Pill Colombia desborda en panel 1 angosto

**Pedido de Bryam:** revisar si las pills de pais deben reacomodarse porque `Colombia` se sale cuando el panel se adelgaza.

**Resultado:** se documento la regla en `docs/specs/_sesion-16-auditoria-visual-cliente-vs-guia.md` y se corrigio la suposicion falsa en `docs/specs/cliente/panel-1-metodo-de-pago.md`.

**Hechos:**

- El panel 1 usa una grilla fija de 3 columnas para las pills.
- Cada pill centra bandera + texto y la etiqueta no permite salto.
- `Colombia` puede desbordar cuando el panel 1 queda estrecho dentro del grid de 4 paneles.

**Decision aprobada:** las pills deben reacomodarse segun el ancho disponible y nunca salirse del contenedor. No resolver primero bajando fuente ni cortando texto.

**Pendiente antes de tocar CSS:** presentar propuesta tecnica exacta para `.panel-1-pills` y `.flow-payment-pill`. Cerrado en `S16-UI-015`.

### S16-UI-015 - Correccion responsive de pills del panel 1

**Aprobacion de Bryam:** aplicar la correccion propuesta, manteniendo revision de impacto antes de tocar codigo.

**Impacto revisado antes de editar:**

- `public/portal-modules/payments.js` arma el orden y los datos de las pills; no se toco.
- `public/portal.html` solo contiene el contenedor `#flowPaymentPills`; no se toco.
- La correccion debia quedar limitada a `public/portal-styles/05-frp-flow.css`.
- No debia afectar backend, calculo de precios, metodo seleccionado ni modal de cuentas.

**Cambio aplicado:**

- `.panel-1-pills` paso de grilla fija de 3 columnas a `flex-wrap`.
- Las pills del panel 1 usan ancho por contenido para evitar que `Colombia` desborde.
- El slot vacio heredado del layout 3+2 ya no reserva espacio.
- Se ajusto solo el padding horizontal del panel 1 para conservar 3+2 cuando hay ancho suficiente.

**Validacion:**

- En navegador `http://127.0.0.1:4183/cliente`, el panel 1 quedo 3 pills arriba y 2 abajo en ancho grande, sin desborde de `Colombia`.
- `git diff --check` paso sin errores; solo aviso normal LF/CRLF de Windows.
- `npm.cmd test` paso completo: 12 pruebas, 0 fallos.

### S16-UI-016 - Correccion del hueco creado por flex-wrap en pills

**Problema detectado por Bryam:** la correccion `flex-wrap` evito el desborde de `Colombia`, pero creo un hueco visual: `Chile` podia caber al lado de `Mexico`, pero bajaba porque `Colombia` estaba antes en el orden del DOM.

**Auditoria antes de tocar codigo:**

- `payments.js` renderiza el orden logico `Peru -> USDT -> Mexico -> Colombia -> Chile`.
- Cada boton trae `data-pill-country`, por lo que el ajuste podia hacerse sin tocar JavaScript.
- El problema estaba en el layout visual, no en seleccion, precios, cuentas ni backend.
- Se detecto otro riesgo: el ocultamiento del slot vacio habia quedado demasiado global.

**Cambio aplicado:**

- Se mantuvo el cambio limitado a `public/portal-styles/05-frp-flow.css`.
- El slot vacio quedo scopeado a `.panel-1-pills .flow-payment-pill-empty`.
- En el rango estrecho de 4 columnas (`1024px-1199.98px`), `Chile` se permite antes de `Colombia` visualmente para llenar el hueco.
- La logica y el orden interno de `payments.js` no cambian.

**Validacion:**

- En vista grande local, las pills siguen 3 arriba y 2 abajo.
- `git diff --check` paso sin errores; solo aviso normal LF/CRLF de Windows.
- `npm.cmd test` paso completo: 12 pruebas, 0 fallos.

**Validacion con Bryam:** cerrada. En el ancho exacto de la captura ya no queda hueco entre `Mexico` y `Chile`, y `Colombia` no desborda.

**Pendiente separado:** la vista sigue confirmando que el breakpoint de 4 columnas queda apretado. Ese problema no pertenece al bug de pills; queda para el contrato visual general de los 4 paneles.

### S16-UI-017 - Reubicar avisos de comprobante al Panel 3

**Problema confirmado por Bryam:** al subir un comprobante duplicado aparecia el mensaje global `Ese comprobante ya fue cargado antes.` debajo de los 4 paneles. Esa zona dejaba un espacio visual que ya no pertenece al flujo actual.

**Hechos verificados antes de tocar codigo:**

- El backend conserva correctamente la validacion de comprobante duplicado en `POST /api/portal/orders/frp` y `PATCH /api/portal/orders/:id/payment-proof`.
- `#orderMessage` no se podia eliminar completo todavia porque tambien lo usan mensajes de Panel 4, correo, modal de pago y links de seguimiento.
- El Panel 3 ya tenia estados propios para tipo invalido, tamano excedido, subiendo, subido, validado y rechazado.

**Decision aplicada:** mover solo los mensajes del comprobante al Panel 3 y eliminar los mensajes globales redundantes de subida exitosa. `#orderMessage` queda vivo temporalmente para otros flujos, pero ya no reserva espacio cuando esta vacio.

**Cambio aplicado:**

- `public/portal-modules/proofs.js`: el reemplazo de comprobante ya no escribe en `#orderMessage`; si no hay orden valida, lanza error para que Panel 3 lo muestre.
- `public/portal-modules/events.js`: errores de comprobante tipo/red/backend se muestran con `flashPanel3DropzoneError`; el mensaje global se limpia.
- `public/portal-styles/13-panel-3.css`: nuevo estado visual `error-backend` con el mismo cajon rojo del Panel 3.
- `public/portal-styles/03-auth-forms.css`: `.message:empty` no ocupa espacio.

**Validacion:**

- `node --check` paso para `events.js`, `proofs.js` y `panel-3-account.js`.
- `git diff --check` paso sin errores; solo aviso normal LF/CRLF de Windows.
- `npm.cmd test` paso completo: 12 pruebas, 0 fallos.

**Pendiente intencional:** reubicar en tareas separadas los mensajes que no pertenecen al comprobante: errores de Panel 4, reenvio de correo, copiar cuenta desde modal y link de seguimiento.

### S16-ARCH-018 - Precio FRP en vivo como evento de catalogo

**Problema confirmado por Bryam:** al cambiar el precio FRP desde el panel operador/admin de `3.50` a `4.00` USDT, la pantalla cliente no actualizo el precio en vivo. Solo cambio despues de recargar.

**Hechos verificados antes de tocar codigo funcional:**

- El cliente calcula Panel 1 y Panel 2 desde `state.catalog.services[0].baseUnitPrice`, `state.catalog.quantityTiers` y `state.catalog.monthlyTiers`.
- El cambio de tasa de moneda ya usa SSE por `/api/portal/admin-config/events` con `exchange_rate_changed`.
- El cambio de precio FRP (`/api/frp/pricing/...`) hoy llama `publishPortalOrdersForAll(...)`, que republica ordenes del cliente.
- El payload de ordenes contiene `orders`, `reason` y `updatedAt`, pero no contiene el catalogo completo ni los beneficios del cliente.
- `/api/portal/session` ya devuelve juntos `customer` y `catalog`, calculados con permisos correctos para ese cliente.

**Fuentes externas usadas para la decision:**

- MDN `EventSource`: SSE es adecuado cuando el servidor necesita enviar actualizaciones al navegador en una sola direccion. Fuente: https://developer.mozilla.org/en-US/docs/Web/API/EventSource
- MDN `Using server-sent events`: SSE permite eventos con nombre (`event`) y payload en `data`. Fuente: https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events
- WHATWG HTML Server-Sent Events: el stream puede usar eventos, datos e id para mensajes estructurados y reconexion. Fuente: https://html.spec.whatwg.org/dev/server-sent-events.html
- OWASP API3:2023: no se deben exponer propiedades sensibles que el usuario no debe leer. Por eso un canal publico no debe transportar beneficios privados del cliente. Fuente: https://owasp.org/API-Security/editions/2023/en/0xa3-broken-object-property-level-authorization/

**Decision de arquitectura:**

- No meter el precio FRP dentro de `Seguimiento`, porque `Seguimiento` representa ordenes privadas del cliente.
- No mandar beneficios, VIP, deuda o estado privado por el SSE publico `admin-config`.
- Crear un evento formal de catalogo, por ejemplo:

```text
event: portal_catalog_changed
data: {
  "scope": "frp_pricing",
  "reason": "pricing_provider_updated",
  "updatedAt": "...",
  "requiresSessionRefresh": true
}
```

- Cuando el cliente reciba ese evento, debe recargar `/api/portal/session` y volver a pintar `catalog`, `customer`, Panel 1, Panel 2, Panel 3, Panel 4 y Mis ordenes segun el estado real.

**Por que esta opcion y no otra:**

- Tocar solo el numero visible seria un parche: podria dejar mal descuentos, VIP o tiers.
- Meter todo en el SSE publico seria riesgo de seguridad.
- Hacer polling repetido volveria a una arquitectura mas pesada y menos limpia que el SSE ya elegido.
- Reutilizar `/api/portal/session` evita duplicar calculos y respeta permisos por cliente.

**Impacto previsto antes de implementar:**

- Backend: emitir `portal_catalog_changed` cuando cambie politica/proveedor FRP o se apruebe un cambio pendiente de costo.
- Frontend cliente: escuchar `portal_catalog_changed`, recargar sesion y re-renderizar.
- Tests: agregar prueba automatica que confirme que un cambio de precio FRP dispara el SSE correcto.

**Resultado implementado:**

- `server.js`: se agrego `publishPortalCatalogChanged(...)` y `publishPortalOrdersForAll(...)` ahora emite `portal_catalog_changed` cuando cambia pricing FRP.
- `public/portal-modules/admin-config-stream.js`: escucha `portal_catalog_changed`, recarga `/api/portal/session` usando `loadSession()` y muestra el aviso `Precio FRP actualizado`.
- `public/portal.js` y `public/portal.html`: se actualizo el cache-busting a `s16-fix008` para que el navegador cargue el modulo nuevo.
- `test/phase4.smoke.test.js`: se agrego prueba que abre el SSE `admin-config`, actualiza politica FRP y confirma `event: portal_catalog_changed` con `scope: frp_pricing`, `reason: pricing_policy_updated` y `requiresSessionRefresh: true`.

**Validacion:**

- `node --check server.js` paso.
- `node --check public/portal-modules/admin-config-stream.js` paso.
- `node --check public/portal.js` paso.
- `node --check test/phase4.smoke.test.js` paso.
- `git diff --check` paso sin errores; solo avisos normales LF/CRLF de Windows.
- `npm.cmd test` paso completo: 12 pruebas, 0 fallos.

### S16-FIX-019 - Orden sin comprobante no congela Panel 2/3

**Problema confirmado por Bryam:** despues de cambiar el precio FRP online, Panel 1 si actualizaba el precio vivo, pero Panel 2 y Panel 3 quedaban con el precio anterior hasta que el cliente cambiara estado o recargara.

**Hechos verificados antes de tocar codigo:**

- `public/portal-modules/frp.js` calcula Panel 1 desde el catalogo vivo (`baseUnitPrice`, tiers y beneficios).
- `public/portal-modules/payments.js` calcula Panel 2/3 desde `activePaymentContext()`.
- `activePaymentContext()` usa `targetOrder.totalPrice` cuando `paymentUploadTargetOrder()` encuentra una orden pendiente de comprobante.
- `paymentUploadTargetOrder()` dependia de `orderNeedsPaymentProof(order)`.
- Antes de esta correccion, una orden `ESPERANDO_PAGO` sin comprobante calificaba como pendiente de pago y heredaba su `totalPrice` viejo.
- El backend guarda `totalPrice` al crear la orden. Eso es correcto para una orden real, pero no debe congelar una orden que todavia no tiene comprobante.

**Decision aprobada por Bryam (opcion 3):**

- Una orden `ESPERANDO_PAGO` sin comprobante se trata como borrador, no como orden activa para Panel 2/3.
- Mientras no exista comprobante, Panel 2 y Panel 3 deben usar la cotizacion viva del catalogo.
- Al subir un comprobante nuevo se crea una orden nueva con el precio vigente en ese momento.
- Si existian borradores viejos sin comprobante del mismo cliente, se retiran para no dejar basura operativa en el panel.

**Riesgos revisados:**

- No se tocan ordenes con comprobante.
- No se tocan ordenes rechazadas; siguen pudiendo recibir reemplazo de comprobante.
- No se tocan ordenes aprobadas, en preparacion, listas, en proceso, finalizadas ni canceladas reales.
- El cambio puede cancelar borradores `ESPERANDO_PAGO` sin comprobante cuando el cliente sube un comprobante real. Esto es intencional porque esos borradores no representan pago ni trabajo validado.

**Resultado implementado:**

- `public/portal-modules/order-state.js`: `orderNeedsPaymentProof()` ya no considera `ESPERANDO_PAGO` sin comprobante como orden objetivo; solo mantiene `PAGO_RECHAZADO` como reemplazable.
- `public/portal-modules/flow-state.js`: `ESPERANDO_PAGO` sin comprobante sale de los estados activos del flujo cliente.
- `server/portal/portal-routes.js`: al crear una orden con comprobante, se retiran borradores anteriores sin comprobante del mismo cliente y sus registros tecnicos vinculados quedan cancelados.
- `test/phase4.smoke.test.js`: se agrego prueba que crea un borrador sin comprobante, luego crea una orden con comprobante y verifica que el borrador viejo queda cancelado.

**Validacion:**

- `node --check public/portal-modules/order-state.js` paso.
- `node --check public/portal-modules/flow-state.js` paso.
- `node --check server/portal/portal-routes.js` paso.
- `node --check test/phase4.smoke.test.js` paso.
- `git diff --check` paso sin errores; solo avisos normales LF/CRLF de Windows.
- `npm.cmd test` paso completo: 12 pruebas, 0 fallos.

### S16-FIX-020 - Contrato unico de precio normal FRP

**Problema confirmado por Bryam:** en la web online, despues de cambiar el precio normal a 4.50 USDT, Panel 1 mostraba 4.50 USDT pero Panel 2 y Panel 3 seguian calculando 5.00 USDT para cantidad 1.

**Hechos verificados antes de tocar codigo:**

- `/api/portal/catalog` exponia `services[0].baseUnitPrice = 4.50`.
- El mismo catalogo exponia `quantityTiers[minQty=1].unitPrice = 5.00`.
- Panel 1 usaba `baseUnitPrice`.
- Panel 2 y Panel 3 usaban el tier efectivo de `estimatePortalPrice()`.
- Backend creaba ordenes usando `portalFrpPriceSuggestion()`, que tambien podia tomar el tier de cantidad.
- La raiz estaba en `frpQuantityTiers`: cantidad 1 tenia `marginUsdt: 1.50`, separado de `pricing.unitPrice`.

**Decision aprobada por Bryam:**

- Cantidad 1 debe ser exactamente `pricing.unitPrice`.
- `pricing.unitPrice` nace de `costo proveedor + ganancia objetivo`.
- Panel 1, Panel 2, Panel 3, backend, recibo y tests deben seguir esa misma fuente.
- El margen oculto 1.50 USDT deja de ser fuente del precio normal.

**Riesgos revisados:**

- Si solo se tocaba frontend, la orden podia cobrarse distinto en backend.
- Si solo se tocaba backend, el cliente podia seguir viendo un total viejo.
- No se deben borrar otros `1.5` no relacionados: CSS, timers de feedback, alertas pausadas o documentos historicos.
- El cambio mantiene el modelo VIP separado: VIP sigue siendo `costo proveedor + margen VIP`.

**Resultado implementado:**

- `server/config/catalog.js`: `frpQuantityTiers` deja de usar `marginUsdt` y pasa a `discountUsdt` desde el precio normal dinamico. Cantidad 1 usa `discountUsdt: 0`.
- `server/frp/pricing.js`: `frpDynamicTier()` calcula tiers oficiales desde `pricing.unitPrice`; conserva soporte legacy para `marginUsdt` solo por compatibilidad.
- `server/frp/pricing.js`: default `targetMarginUsdt` pasa de 1.5 a 1.0 para no reintroducir el margen viejo en instalaciones nuevas.
- `server.js`: default legacy de `serviceRules` para `XIA-FRP-GOOGLE` pasa de `marginUsdt: 1.5` a `marginUsdt: 1`.
- `test/phase3a.contract.test.js`: pruebas actualizadas para bloquear la regresion: cantidad 1 = `pricing.unitPrice`.
- `test/phase4.smoke.test.js`: total esperado actualizado al contrato nuevo para una orden de 3 equipos.
- `docs/specs/cliente/panel-2-solicitud.md`: spec subida a v1.2 con el contrato nuevo.

**Validacion:**

- `node --check server/frp/pricing.js` paso.
- `node --check server/config/catalog.js` paso.
- `node --check server.js` paso.
- `node --check test/phase3a.contract.test.js` paso.
- `node --test test/phase3a.contract.test.js` paso: 10 pruebas, 0 fallos.
- `npm.cmd test` paso completo: 12 pruebas, 0 fallos.
- `rg "marginUsdt: 1.5|targetMarginUsdt: 1.5" server public test` no encontro restos activos en codigo runtime/test.
- `git diff --check` paso sin errores; solo avisos normales LF/CRLF de Windows.

### S16-FIX-021 - Retiro de consulta publica por codigo en login cliente

**Problema confirmado por Bryam:** en la pantalla de acceso cliente quedaban dos elementos que podian confundir: el pill "Multi-equipo" y el boton "Consultar pedido con codigo".

**Hechos verificados antes de tocar codigo:**

- "Multi-equipo" era solo texto visual en `public/portal.html`.
- "Consultar pedido con codigo" tenia UI, formulario, handlers JS y deep-link `?orden=&codigo=`.
- El endpoint `GET /api/portal/orders/:id?accessCode=...` permitia consulta publica si el `accessCode` coincidia.
- El endpoint tambien se usa para consulta autenticada del cliente dueño de la orden.
- El accessCode del recibo PDF queda fuera de este cambio porque vive en "Recibo de operacion", no en el login.

**Decision aprobada por Bryam:**

- Quitar de raiz el acceso de login para consultar pedido por codigo.
- El cliente debe ver sus ordenes entrando a su cuenta.
- Mantener la ruta de orden solo para el cliente logueado dueño de la orden.

**Riesgos revisados:**

- Borrar solo el boton dejaba una funcion oculta por URL.
- Borrar el endpoint completo rompia consultas internas de orden para clientes logueados.
- Borrar accessCode de recibos podia afectar "Recibo de operacion"; se deja para decision separada si se quiere cerrar recibos publicos.

**Resultado implementado:**

- `public/portal.html`: removido pill "Multi-equipo", boton "Consultar pedido con codigo" y formulario `trackForm`.
- `public/portal.js`: removido `applyQueryTracking()` y actualizado cache-busting a `s16-fix009`.
- `public/portal-modules/events.js`: removidos handlers de `showTrackLink`, `backToLoginLink` y submit de `trackForm`.
- `public/portal-modules/deep-links.js`: removida logica de consulta por `?orden=&codigo=`, queda solo verificacion de correo.
- `server/portal/portal-routes.js`: `GET /api/portal/orders/:id` ya no acepta `accessCode` para consulta publica; exige que la orden pertenezca al cliente logueado.

**Validacion:**

- `node --check public/portal.js` paso.
- `node --check public/portal-modules/events.js` paso.
- `node --check public/portal-modules/deep-links.js` paso.
- `node --check server/portal/portal-routes.js` paso.
- `rg` no encontro rastros activos de `Multi-equipo`, `Consultar pedido con codigo`, `trackForm`, `showTrackLink`, `applyQueryTracking` ni `renderTrackedOrder` en `public`, `server` o `test`.
- `npm.cmd test` paso completo: 12 pruebas, 0 fallos.
- `git diff --check` paso sin errores; solo avisos normales LF/CRLF de Windows.

---

### S16-FIX-022 - Beneficios por volumen sobre ganancia objetivo

**Problema confirmado por Bryam:** el portal mostraba badges como `-5%`, pero la formula real no aplicaba porcentaje. Restaba montos fijos desde el precio normal (`0.15`, `0.25`, `0.40` USDT). Eso podia confundir porque el porcentaje visual no coincidia con el calculo.

**Hechos verificados antes de tocar codigo:**

- `server/config/catalog.js` definia tiers con `discountUsdt` fijo y `discountPct` solo visual.
- `server/frp/pricing.js` calculaba `unitPrice = pricing.unitPrice - discountUsdt`.
- `public/portal-modules/frp.js` elegia el tier mas barato desde `state.catalog.quantityTiers`.
- `public/portal-modules/payments.js` mostraba `-${discountPct}%` en la card TOTAL y en el aviso de siguiente tier.
- `portalFrpPriceSuggestion()` en `server.js` tambien dependia del mismo `frpTierForQuantity()`, por lo que el backend cobraba con la misma formula vieja.

**Decision aprobada por Bryam:**

- El descuento por volumen debe aplicar solo sobre la ganancia objetivo, no sobre el costo interno ni sobre el precio total.
- Formula nueva: `precio = costo interno + ganancia objetivo * (1 - porcentaje)`.
- Tiers internos: 2-3 equipos = 15%, 4-6 equipos = 25%, 7-10 equipos = 40%.
- Piso publico: nunca bajar de `costo interno + 0.60 USDT`.
- El VIP futuro queda separado como `costo interno + 0.50 USDT`, para que tenga mejor precio que el volumen publico.
- El cliente no debe ver `-25%` porque podria entender descuento sobre total. La UI muestra "Volumen" y "Beneficio por X-Y equipos".

**Riesgos revisados:**

- Si solo se cambiaba frontend, el backend podia seguir cobrando con la formula fija vieja.
- Si se mostraba `-25%`, se creaba una promesa visual incorrecta para el cliente.
- Si el piso publico se aplicaba mal, una ganancia objetivo baja podia hacer que el volumen subiera por encima del precio normal. Se evita: cuando no hay espacio real para descuento, se mantiene precio normal y se oculta el beneficio.
- Los tiers mensuales legacy pasan por el mismo helper de precio. Se aplico el mismo piso publico a descuentos publicos legacy para no dejar una ruta que pueda bajar hasta costo interno.
- No se fuerza desde codigo una ganancia fija de `1.50`; la ganancia sigue siendo configurable desde Costos FRP.

**Resultado implementado:**

- `server/config/catalog.js`: los tiers dejan de usar `discountUsdt` activo y pasan a `marginDiscountPct` 15/25/40; se agrega `frpPublicVolumeFloorMarginUsdt = 0.60`.
- `server/frp/pricing.js`: `frpDynamicTier()` calcula volumen sobre margen (`unitPrice - internalCost`) y respeta piso publico `costo + 0.60`; el mismo piso se aplica a rutas legacy de descuento publico.
- `public/portal-modules/frp.js`: comentarios y hint quedan alineados al beneficio por volumen.
- `public/portal-modules/payments.js`: badge cambia de `-X%` a `Volumen`; el aviso deja de mostrar porcentaje.
- `docs/specs/cliente/panel-2-solicitud.md`: spec sube a v1.3 con el contrato nuevo.
- `test/phase3a.contract.test.js`: pruebas actualizadas para bloquear la formula nueva y el piso publico.

**Validacion:**

- `node --check server/config/catalog.js` paso.
- `node --check server/frp/pricing.js` paso.
- `node --check public/portal-modules/frp.js` paso.
- `node --check public/portal-modules/payments.js` paso.
- `node --check test/phase3a.contract.test.js` paso.
- `node --test test/phase3a.contract.test.js` paso: 10 pruebas, 0 fallos.
- `npm.cmd test` paso completo: 12 pruebas, 0 fallos.
- Calculo manual con `costo interno = 3.00` y `precio normal = 4.50`: tiers devuelven 4.50 / 4.275 / 4.125 / 3.90 USDT segun cantidad.
- Calculo manual legacy: un tier mensual agresivo tambien queda frenado por piso publico (`costo 3.50 + 0.60 = 4.10`).
- `git diff --check` paso sin errores; solo avisos normales LF/CRLF de Windows.

---

### S16-FIX-023 - Limpieza de textos auxiliares del Panel 2

**Problema confirmado por Bryam:** en el Panel 2 quedaban dos textos que cargaban visualmente la card: el aviso azul debajo del stepper ("Si sumas 1 mas...") y la etiqueta inferior de la card oscura ("Precio normal" / "Beneficio por X-Y equipos").

**Hechos verificados antes de tocar codigo:**

- `public/portal.html` contenia los nodos `#panel2NextTierHint` y `#panel2DiscountLabel`.
- `public/portal-modules/payments.js` los actualizaba desde `estimate.nextTierHint` y `estimate.label`.
- `public/portal-styles/05-frp-flow.css` tenia reglas dedicadas para ambos.
- `public/portal-modules/frp.js` calculaba `nextTierHint` solo para ese aviso azul.
- El calculo de precio real vive en `estimate.unit`, `estimate.total`, `state.catalog.quantityTiers` y backend; no dependia de esos dos textos.

**Decision aprobada por Bryam:**

- Quitar ambos textos del Panel 2.
- Mantener intacto el calculo de precios, Panel 3 y backend.
- Mantener el badge "Volumen" cuando haya beneficio real, porque ese si marca visualmente que el total tiene precio por volumen.

**Riesgos revisados:**

- Si se quitaba solo HTML, quedaba JS/CSS muerto.
- Si se quitaba el `label` de backend, se podia afectar recibos/seguimiento. No se toca.
- Si se quitaba el badge "Volumen", el cliente no tendria señal minima de que el total cambio por volumen.

**Resultado implementado:**

- `public/portal.html`: removidos `#panel2NextTierHint` y `#panel2DiscountLabel`.
- `public/portal-modules/payments.js`: removido render de ambos textos.
- `public/portal-modules/frp.js`: removido calculo frontend de `nextTierHint`.
- `public/portal-styles/05-frp-flow.css`: removidas reglas CSS de ambos textos.
- `docs/specs/cliente/panel-2-solicitud.md`: spec sube a v1.4.

**Validacion:**

- `node --check public/portal-modules/frp.js` paso.
- `node --check public/portal-modules/payments.js` paso.
- `rg` no encontro rastros activos en `public` de `panel2NextTierHint`, `panel2DiscountLabel`, `panel-2-next-tier-hint`, `panel-2-discount-label`, `nextTierHint` ni el texto "Si sumas".
- `npm.cmd test` paso completo: 12 pruebas, 0 fallos.
- `git diff --check` paso sin errores; solo avisos normales LF/CRLF de Windows.

---

## Checklist de esta fase

- [x] Revisar ruta correcta del repo.
- [x] Levantar vista local desde la ruta correcta.
- [x] Entrar a cliente con data temporal.
- [x] Corregir bug de desaparicion de orden tras aprobar comprobante.
- [x] Agregar prueba automatica para ese bug.
- [x] Ejecutar test completo.
- [ ] Auditar Panel 4: origen real de Technician ID y codigo.
- [x] Corregir Panel 4: Technician ID real + click Equipo conectado.
- [x] Corregir cliente logueado: ocultar bloque grande de marca.
- [x] Verificar operador: orden visible en Pagos por revisar.
- [x] Corregir operador: Ver comprobante habilitado para tecnico WhatsApp 3.
- [x] Corregir operador: orden aprobada visible en Esperando conexion.
- [x] Corregir cliente: evitar JS viejo en click Equipo conectado.
- [x] Auditar operador: cola, pagos por revisar, tomar siguiente y finalizar.
- [x] Auditar brecha `Mis ordenes` spec vs codigo.
- [x] Confirmar endpoint para `Equipo listo` por equipo pendiente.
- [x] Agregar endpoint cliente `Equipo listo` por item.
- [x] Implementar `Mis ordenes v1 minimo funcional`.
- [x] Corregir primer problema visual aprobado por Bryam.
- [x] Validar evento real de tasa por SSE admin-config.
- [ ] Validar visualmente aviso de tasa en navegador con admin autorizado.
- [x] Validar flujo cliente -> operador en navegador local.
- [x] Corregir refresco cliente despues de `Equipo conectado`.
- [x] Corregir reemplazo real de comprobante en revision.
- [x] Quitar aviso verde despues de `Equipo conectado` sin eliminar errores utiles.
- [x] Redisenar Costos FRP como tarjetas sin tocar backend.
- [x] Validar con Bryam distancia de botones en tarjetas Costos FRP.
- [ ] Definir margenes globales del panel FRP Express y ajustar ancho de Costos FRP dentro de esa decision.
- [x] Documentar auditoria visual cliente vs guia de 4 paneles.
- [x] Documentar evidencia responsive de pantalla angosta/grande/local.
- [x] Documentar regla responsive para pills del panel 1.
- [x] Mover avisos de comprobante al Panel 3 y quitar hueco de `#orderMessage` vacio.
- [x] Documentar decision de arquitectura para precio FRP en vivo como evento de catalogo.
- [x] Implementar `portal_catalog_changed` para refrescar precio FRP en vivo sin recargar la pagina completa.
- [x] Corregir Panel 2/3 para no heredar precio viejo de orden sin comprobante.
- [x] Aprobar y aplicar correccion tecnica de pills sin romper orden 3+2 en ancho grande.
- [x] Corregir efecto lateral donde `Chile` dejaba hueco en panel estrecho.
- [x] Validar con Bryam el ancho exacto donde aparecia el hueco de pills.
- [ ] Definir contrato visual definitivo de los 4 paneles cliente antes de tocar CSS.
- [ ] Preparar commit limpio.
- [ ] Preparar subida online solo despues de aprobacion.

---

## Proximo paso recomendado

Revisar con Bryam la pantalla cliente actual en navegador. Si aprueba esta base funcional, el siguiente paso unico es corregir el primer problema visual de la pantalla logueada sin tocar el flujo ya validado.
