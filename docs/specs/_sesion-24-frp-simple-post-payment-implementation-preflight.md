# Sesion 24 - FRP simple post-pago - preflight de implementacion

Fecha: 2026-05-07  
Estado: preflight tecnico, sin cambios de runtime en este documento.

## Objetivo

Implementar el flujo simplificado FRP sin volver al error anterior de depender del boton del cliente `Equipo conectado`.

Contrato de producto aprobado para implementar:

- El cliente sube comprobante en panel 3.
- Desde ese momento la orden existe en seguimiento del cliente y en el panel operador.
- La IA puede dejar el pago en revision, aprobarlo o enviarlo a revision humana.
- Cuando el pago queda aprobado, el operador procesa desde el panel y marca `Finalizado`.
- Si pasan 5 minutos sin conexion visible en USB Redirector, el panel cambia el estado visual a `No conecto` y permite avisar al cliente.
- Para el operador no debe existir una caja separada de `Pagos por aprobar`; el boton `Revisar` solo aparece cuando el pago aun no fue aprobado.
- Para ordenes de varios equipos, se conserva una sola orden agrupada con filas por equipo. Ejemplo: `ARD-0002` con `ARD-0002-01` a `ARD-0002-07`.

## Fuentes externas usadas como criterio

- MDN documenta `EventSource` y SSE como conexion persistente de eventos desde servidor a navegador. Esto respalda mantener el operador y seguimiento cliente sincronizados con `/api/operator/frp/events` y `/api/portal/orders/events`, no con estados duplicados en UI.
- PostgreSQL documenta `SELECT ... FOR UPDATE` y bloqueos de fila para proteger actualizaciones concurrentes. Esto respalda que aprobar pago, finalizar equipo y actualizar seguimiento cliente deban ir en transacciones granulares.
- Stripe documenta idempotency keys para evitar que reintentos creen efectos duplicados. Esto respalda que acciones como aprobar pago/finalizar/avisar cliente sean idempotentes o tengan guardas contra doble click/reintento.

## Hechos confirmados por lectura estatica

### Backend

- `server.js` enruta `/api/frp/*` hacia `server/frp/frp-routes.js`.
- `server.js` publica SSE de operador en `/api/operator/frp/events`.
- `server/portal/portal-routes.js` publica SSE de cliente en `/api/portal/orders/events`.
- `POST /api/portal/orders/frp` ya crea orden cliente, items, `frpOrder` y `frpJobs` al subir comprobante.
- `POST /api/portal/orders/:id/notify-connected` y `POST /api/portal/orders/:orderId/items/:itemId/ready` siguen siendo dependencias del flujo viejo.
- `PATCH /api/frp/orders/:id/payment-review` es el punto actual para aprobar/rechazar/revisar pagos.
- `PATCH /api/frp/jobs/:id/finalize` hoy finaliza jobs `EN_PROCESO`; no debe debilitarse sin una decision explicita porque protege ownership y casos de tecnico.
- `server/portal/serializers.js` todavia deriva textos tipo `marca que estas listo para conectar`.
- `server/frp/serializers.js` publica `orders`, `jobs`, `finishedTodayJobs` y metricas, pero no una proyeccion unica de `Ordenes FRP` para el nuevo panel.

### Frontend operador

- `public/app.js` todavia renderiza:
  - `Trabajo actual`.
  - `Tomar siguiente`.
  - `Esperando conexion`.
  - `Cola - listos`.
  - `Pagos por revisar`.
- Los handlers siguen apuntando a `take-next`, `take-specific`, `finalize`, `review`, `show-proof`.
- La nueva maqueta elimina `Tomar` como operacion principal y deja `Finalizar` como accion directa cuando el pago ya fue aprobado.

### Frontend cliente

- `public/portal.html` todavia contiene el boton `Equipo conectado`.
- `public/portal-modules/flow-state.js` y `panel-4-connection.js` todavia dependen de `notify-connected`.
- `public/portal-modules/orders.js` solo muestra algunas ordenes en `Mis ordenes`; debe mostrar tambien pago en revision/aprobado/rechazado.
- `public/portal-modules/order-state.js` todavia instruye al cliente a conectar desde paso 4 como accion obligatoria.

### Pruebas afectadas

- `test/phase4.smoke.test.js` valida el flujo viejo `notify-connected` / `LISTO_PARA_TECNICO` / `take-next`.
- `test/frp-payment-review-postgres.test.js` es el punto natural para cubrir `pago aprobado -> orden operable`.
- `test/payment-verification-shadow.test.js` debe seguir validando que la IA no rompa datos cuando opere en modo sombra.
- `test/phase5.technician-swap.test.js` debe conservarse para no romper ownership, revision y permisos multioperador.

## Supuestos debiles

- No se debe asumir que la web puede detectar conexion USB Redirector. Hoy la conexion es visual para el operador.
- No se debe asumir que `Finalizar` puede reutilizar el endpoint viejo sin riesgo. El endpoint viejo protege jobs tomados por tecnico.
- No se debe asumir que la IA puede aprender sola desde el primer dia. La primera version debe ser motor configurado + revision humana + evidencias guardadas.
- No se debe asumir que un cron real es necesario para el aviso de 5 minutos. El primer corte puede derivar el estado por tiempo en snapshot/SSE.

## Decision tecnica recomendada

No modificar el contrato viejo de `PATCH /api/frp/jobs/:id/finalize` para aceptar cualquier job aprobado.

Crear una proyeccion nueva y una accion explicita para el flujo simplificado:

1. Backend expone una proyeccion estable `operatorOrders` en el snapshot FRP.
2. Cada fila tiene estado derivado:
   - `AI_REVIEWING`: azul, muestra `Revisar`.
   - `PAYMENT_APPROVED`: verde, muestra `Finalizar`.
   - `NO_CONNECTION`: amarillo, muestra `Avisar cliente`.
   - `FINISHED`: aparece en finalizados.
3. Se agrega una accion explicita para finalizar un item aprobado, por ejemplo:
   - `PATCH /api/frp/jobs/:id/direct-finalize`
   - o `PATCH /api/frp/orders/:orderId/items/:itemId/finalize`
4. Esa accion debe validar dentro de transaccion:
   - pago aprobado;
   - job pertenece a la orden;
   - job no esta finalizado/cancelado;
   - si la orden tiene varios equipos, solo finaliza el item elegido;
   - actualiza `frp_jobs`, `customer_order_items`, `customer_orders` y publica SSE operador/cliente.
5. Los endpoints viejos `notify-connected`, `item ready`, `take-next` pueden quedar temporalmente por compatibilidad, pero salen del flujo visual principal.

## Corte de implementacion propuesto

### Corte 1 - Backend projection, sin cambiar UI

Archivos probables:

- `server/frp/serializers.js`
- `server/portal/serializers.js`
- `server/frp/frp-routes.js`
- `server/db/postgres-frp-core.js`
- tests de serializers o FRP payment review si ya existen.

Cambios:

- Agregar `shortCode` derivado tipo `ARD-0001`.
- Agregar `operatorOrders` al snapshot de `/api/operator/frp/events`.
- Agregar estado derivado por orden/item sin romper `orders` y `jobs` existentes.
- Agregar pruebas para orden de 1 equipo y de 7 equipos.

Salida esperada:

- El frontend viejo puede seguir funcionando.
- La maqueta ya tiene un contrato real para consumir.
- Riesgo bajo porque no se elimina ningun endpoint viejo todavia.

### Corte 2 - Accion directa de finalizar

Archivos probables:

- `server/frp/frp-routes.js`
- `server/db/postgres-frp-core.js`
- `server/portal/serializers.js`
- tests FRP core + smoke.

Cambios:

- Crear endpoint explicito de finalizacion directa.
- Hacerlo transaccional e idempotente.
- Actualizar seguimiento cliente en la misma transaccion.

Salida esperada:

- El operador puede cerrar una orden aprobada sin esperar boton del cliente.
- Multi-equipo queda secuencial por item sin crear cajas duplicadas.

### Corte 3 - UI operador

Archivos probables:

- `public/app.js`
- `public/index.html` si faltan contenedores.
- docs/mockup aprobado.

Cambios:

- Renderizar `Ordenes FRP` desde `operatorOrders`.
- Quitar de la vista principal `Trabajo actual`, `Tomar`, `Cola - listos` y caja separada `Pagos por revisar`.
- Mostrar solo:
  - verde: pago aprobado, boton `Finalizar`;
  - azul: IA revisando/revision, boton `Revisar`;
  - amarillo: no conecto, boton `Avisar cliente`;
  - finalizados hoy.

### Corte 4 - UI cliente / seguimiento

Archivos probables:

- `public/portal.html`
- `public/portal-modules/flow-state.js`
- `public/portal-modules/panel-4-connection.js`
- `public/portal-modules/order-state.js`
- `public/portal-modules/orders.js`
- `public/portal-modules/live-orders.js`

Cambios:

- Quitar `Equipo conectado` como accion obligatoria.
- Paso 4 queda como instrucciones de preparacion.
- `Mis ordenes` muestra la orden desde pago en revision.
- Multi-equipo muestra una sola orden con filas por equipo.

## Riesgos

- Si se cambia `finalize` en lugar de crear accion explicita, se puede romper el contrato de ownership ya auditado.
- Si se cambia primero la UI sin proyeccion backend, se duplicara logica de estado en navegador y cliente/operador pueden divergir.
- Si se elimina `notify-connected` de backend de inmediato, se pueden romper pruebas y clientes con JS viejo.
- Si se deja el codigo real largo como identificador operativo principal, aumenta el riesgo de error humano. El corto debe ser el primario visual y el real debe quedar como respaldo.

## Verificacion minima antes de deploy

Comandos locales esperados por corte:

```powershell
node --check server/frp/frp-routes.js
node --check server/frp/serializers.js
node --check server/portal/portal-routes.js
node --check server/portal/serializers.js
node --check public/app.js
node --check public/portal-modules/orders.js
npm test
```

Despues de deploy:

```bash
curl -fsS https://ops.ariadgsm.com/api/health
curl -fsS https://ariadgsm.com/api/health
npm run postgres:read-check -- --report /tmp/postgres-live-after-frp-simple-post-payment.json --strict
cat /tmp/postgres-live-after-frp-simple-post-payment.json
```

## Siguiente paso unico

Implementar el Corte 1: proyeccion backend `operatorOrders` + `shortCode` + estados derivados, sin cambiar UI ni eliminar endpoints viejos.

Motivo: crea el contrato real entre panel operador y seguimiento cliente antes de tocar la vista. Es el cambio de menor riesgo y evita duplicar logica de negocio en `public/app.js`.

## Corte 1 implementado

Fecha: 2026-05-07

Archivos tocados:

- `server/frp/serializers.js`
- `server/portal/serializers.js`
- `test/frp-payment-review-postgres.test.js`

Cambios aplicados:

- `publicFrpState` ahora mantiene `orders`, `jobs` y `finishedTodayJobs` intactos, y agrega `operatorOrders`.
- `operatorOrders` agrupa una orden FRP como una sola card logica aunque tenga varios equipos.
- `operatorOrders` oculta drafts/cotizaciones sin comprobante (`ESPERANDO_COMPROBANTE`)
  para no presentar como `IA revisando` una orden que aun no tiene pago recibido.
- Se agrega `shortCode` estable en:
  - orden FRP;
  - job FRP;
  - orden cliente;
  - item cliente.
- Estados derivados iniciales para operador:
  - `AI_REVIEWING`;
  - `PAYMENT_APPROVED`;
  - `NO_CONNECTION`;
  - `NEEDS_ATTENTION`;
  - `IN_PROCESS`;
  - `FINISHED`;
  - `PAYMENT_REJECTED`.
- La alerta `NO_CONNECTION` se deriva cuando el pago esta aprobado, no hay avance operativo y pasan 5 minutos desde `paymentReviewedAt` / lock equivalente.
- No se elimino ni modifico el contrato viejo de `take-next`, `notify-connected` o `finalize`.

Pruebas agregadas:

- orden aprobada de 1 equipo expone `operatorOrders`, `shortCode` y accion `finalize`;
- orden sin comprobante conserva `orders` legacy, pero no entra en `operatorOrders`;
- orden de 7 equipos queda agrupada en una sola card logica con items `ARD-0023-01` a `ARD-0023-07`;
- pago aprobado sin avance por mas de 5 minutos deriva `NO_CONNECTION` y `notify_customer`.

Verificacion local:

```powershell
node --check server/frp/serializers.js
node --check server/portal/serializers.js
node --check test/frp-payment-review-postgres.test.js
node --test test/frp-payment-review-postgres.test.js
npm.cmd test
```

Resultado:

- Test enfocado: 17/17 pasando.
- Suite completa: 64/64 pasando.

Nota de entorno:

- `npm test` falla en PowerShell por bloqueo de `npm.ps1`.
- La ruta correcta en esta maquina es `npm.cmd test`.

## Corte 2 implementado

Fecha: 2026-05-07

Archivos tocados:

- `server/db/postgres-frp-core.js`
- `server/frp/frp-routes.js`
- `server.js`
- `test/frp-payment-review-postgres.test.js`

Cambios aplicados:

- Se agrega endpoint explicito:

```text
PATCH /api/frp/jobs/:id/direct-finalize
```

- Este endpoint no reemplaza ni debilita:
  - `PATCH /api/frp/jobs/:id/finalize`
  - `POST /api/frp/jobs/:id/take`
  - `POST /api/frp/jobs/take-next`
  - endpoints cliente `notify-connected` / item `ready`.
- La nueva accion solo permite finalizar un job cuando:
  - el pago esta aprobado (`COMPROBANTE_RECIBIDO`, `PAGO_VALIDADO` o checklist `paymentValidated`);
  - el job esta accionable (`ESPERANDO_PREPARACION`, `LISTO_PARA_TECNICO` o `EN_PROCESO`);
  - no pertenece a otro tecnico;
  - si es orden multi-equipo, los equipos anteriores ya estan finalizados;
  - si el job no tiene tecnico asignado, el usuario debe ser el tecnico activo.
- La accion es idempotente si el job ya estaba `FINALIZADO`.
- En Postgres corre dentro de transaccion:
  - bloquea job/order con `FOR UPDATE`;
  - bloquea item y pedido cliente vinculados cuando existen;
  - actualiza `frp_jobs`;
  - actualiza `frp_orders`;
  - actualiza `customer_order_items`;
  - actualiza `customer_orders`;
  - escribe auditoria;
  - devuelve snapshot reconstruido.

Pruebas agregadas:

- direct-finalize cierra un job aprobado sin `take` y actualiza item cliente;
- direct-finalize bloquea saltarse el equipo anterior en multi-equipo;
- direct-finalize es idempotente si el job ya estaba finalizado;
- direct-finalize rechaza pago no aprobado.

Verificacion local:

```powershell
node --check server/db/postgres-frp-core.js
node --check server/frp/frp-routes.js
node --check server.js
node --test test/frp-payment-review-postgres.test.js
npm.cmd test
```

Resultado:

- Test enfocado: 21/21 pasando.
- Suite completa: 68/68 pasando.

Siguiente paso recomendado:

Implementar Corte 3: adaptar `public/app.js` para consumir `frp.operatorOrders` y mostrar la tabla nueva sin `Trabajo actual`, `Tomar`, `Cola - listos` ni caja separada de pagos por aprobar.

## Corte 3 implementado

Fecha: 2026-05-07

Archivos tocados:

- `public/app.js`
- `public/styles.css`
- `test/phase3a.contract.test.js`

Cambios aplicados:

- `renderFrp()` deja de armar la vista principal desde `orders` + `jobs` separados.
- El panel operador ahora consume `session.frp.operatorOrders`.
- La vista principal queda reducida a:
  - `Ordenes FRP`;
  - `Resumen operativo`;
  - `Finalizados hoy`;
  - `Costos FRP` intacto.
- Se retiran del render principal:
  - `Trabajo actual`;
  - `Tomar siguiente`;
  - `Cola - listos`;
  - caja separada de pagos por aprobar;
  - caja separada de esperando conexion.
- Cada orden se renderiza como una card agrupada por pedido:
  - verde: pago aprobado / en proceso;
  - azul: IA revisando o pago rechazado;
  - amarillo: pago aprobado sin conexion visible dentro del plazo.
- Orden multi-equipo queda en una sola card con items `ARD-000X-01`, `ARD-000X-02`, etc.
- Solo el item accionable muestra cierre operativo; los siguientes quedan en espera.
- `Finalizados hoy` prefiere `shortCode` cuando existe para evitar confusiones con codigos largos.

Acciones UI conectadas:

- Orden aprobada:
  - boton `Finalizar` o `Finalizar equipo N`;
  - llama `PATCH /api/frp/jobs/:id/direct-finalize`.
- Orden en revision:
  - boton `Revisar`;
  - abre el modal existente de comprobante.
- Orden amarilla:
  - boton `Avisar cliente`;
  - usa el WhatsApp registrado como canal operativo temporal.
  - Nota: cuando exista chat interno, esta accion debe migrar a endpoint propio y no depender de `wa.me`.

Reglas conservadas:

- No se elimina el flujo viejo de `take`, `take-next`, `finalize`, `review` ni resolucion de revision.
- Esos endpoints quedan vivos para compatibilidad y para no romper rutas existentes.
- El nuevo render ya no los usa como experiencia principal del operador.
- Si no hay tecnico activo, si el tecnico activo es otro, o si hay swap en progreso, la UI bloquea las acciones y muestra motivo.

Pruebas actualizadas:

- Test estatico ahora valida `operatorOrders` como contrato de render.
- Test de layout protege:
  - cards por estado;
  - `direct-finalize`;
  - `Revisar` solo cuando corresponde;
  - `Avisar cliente` solo en `NO_CONNECTION`.
- Tests viejos que exigian `Trabajo actual`, `Tomar` y `Cola` fueron reorientados al nuevo contrato.

Verificacion local:

```powershell
node --check public/app.js
node --check test/phase3a.contract.test.js
git diff --check -- public/app.js public/styles.css test/phase3a.contract.test.js
npm.cmd test
```

Resultado:

- `node --check public/app.js`: OK.
- `node --check test/phase3a.contract.test.js`: OK.
- `git diff --check`: OK; solo avisos CRLF del checkout Windows.
- Suite completa: 68/68 pasando.

Pendiente para cerrar en deploy:

```bash
cd /opt/render/project/src
curl -fsS https://ops.ariadgsm.com/api/health
curl -fsS https://ariadgsm.com/api/health
npm run postgres:read-check -- --report /tmp/postgres-live-after-frp-operator-orders-ui.json --strict
cat /tmp/postgres-live-after-frp-operator-orders-ui.json
```

Siguiente paso recomendado:

Implementar Corte 4: adaptar seguimiento cliente para consumir y mostrar el mismo contrato de codigos cortos/estado post-pago, sin cambiar todavia el Paso 4 del cliente.

## Corte 4 implementado

Fecha: 2026-05-07

Archivos tocados:

- `server/portal/serializers.js`
- `public/portal-modules/orders.js`
- `public/portal-modules/order-state.js`
- `public/portal-styles/10-orders-tracking-proofs.css`
- `test/phase3a.contract.test.js`
- `test/phase4.smoke.test.js`

Cambios aplicados:

- El serializer cliente ahora expone en cada orden:
  - `shortCode`;
  - `frpOrderId`;
  - `operatorStatus`;
  - `paymentApprovedAt`;
  - `noConnectionAlertAt`;
  - `priceRevalidationStatus`.
- El estado publico del cliente queda alineado con el estado operativo:
  - `AI_REVIEWING` -> `PAGO_EN_REVISION`;
  - `PAYMENT_APPROVED` -> `EN_PREPARACION`;
  - `NO_CONNECTION` -> `REQUIERE_ATENCION`;
  - `IN_PROCESS` -> `EN_PROCESO`;
  - `FINISHED` -> `FINALIZADO`.
- `Mis ordenes` ahora muestra ordenes desde que el comprobante crea el pedido.
- `Mis ordenes` ya no depende de una accion posterior para que el operador trabaje.
- La card de seguimiento cliente usa:
  - codigo corto principal `ARD-0001`;
  - codigo real como referencia secundaria;
  - estado visual por color;
  - una sola card por pedido multi-equipo;
  - filas internas por equipo `ARD-0001-01`, `ARD-0001-02`, etc.
- Se retiraron del render de seguimiento los botones obligatorios:
  - `Equipo listo`;
  - `Cancelar este equipo`.
- El Paso 4 no fue modificado en este corte. Sus endpoints y UI quedan vivos para compatibilidad hasta el corte especifico de instrucciones/conexion.

Pruebas agregadas/actualizadas:

- `phase3a.contract.test.js` valida que `Mis ordenes`:
  - incluya `PAGO_EN_REVISION`, `PAGO_RECHAZADO`, `EN_PREPARACION`;
  - use `shortCode`;
  - exponga `operatorStatus`;
  - no renderice botones obligatorios por item;
  - tenga clases visuales para aprobado/revision/atencion.
- `phase4.smoke.test.js` valida que despues de aprobar pago:
  - `/api/portal/orders` devuelve la orden en seguimiento;
  - `shortCode` tiene formato `ARD-0000`;
  - `publicStatus` queda `EN_PREPARACION`;
  - `operatorStatus` queda `PAYMENT_APPROVED`;
  - `paymentApprovedAt` existe;
  - el primer item usa `ARD-0000-01`.

Verificacion local enfocada:

```powershell
node --check server/portal/serializers.js
node --check public/portal-modules/orders.js
node --check public/portal-modules/order-state.js
node --check test/phase3a.contract.test.js
node --check test/phase4.smoke.test.js
node --test test/phase3a.contract.test.js
node --test test/phase4.smoke.test.js
```

Resultado enfocado:

- `phase3a.contract.test.js`: 25/25 pasando.
- `phase4.smoke.test.js`: OK.

Pendiente de cierre:

- `git diff --check`: OK; solo avisos CRLF del checkout Windows.
- `npm.cmd test`: 69/69 pasando.

Siguiente paso recomendado:

Corte 5: adaptar el Paso 4 para que deje de ser boton obligatorio y pase a instrucciones de conexion/preparacion, preservando compatibilidad temporal con `notify-connected`.

Pendiente para cerrar en deploy:

```bash
cd /opt/render/project/src
curl -fsS https://ops.ariadgsm.com/api/health
curl -fsS https://ariadgsm.com/api/health
npm run postgres:read-check -- --report /tmp/postgres-live-after-frp-client-tracking-contract.json --strict
cat /tmp/postgres-live-after-frp-client-tracking-contract.json
```

## Corte 5 implementado

Fecha: 2026-05-07

Archivos tocados:

- `public/portal.html`
- `public/portal-modules/panel-4-connection.js`
- `public/portal-modules/flow-state.js`
- `public/portal-modules/auth-forms.js`
- `public/portal-modules/events.js`
- `public/portal-modules/panel-3-account.js`
- `public/portal-modules/order-state.js`
- `public/portal-styles/14-panel-4.css`
- `docs/specs/cliente/panel-4-conexion.md`
- `test/phase3a.contract.test.js`

Cambios aplicados:

- El Panel 4 deja de mostrar el boton obligatorio `Equipo conectado`.
- Se agrega un bloque `role="status"` con instrucciones segun estado:
  - sin orden;
  - pago en revision;
  - pago rechazado;
  - pago aprobado / servicio activo.
- El boton viejo `#panel4EquipoConectado` queda oculto con `hidden`,
  `aria-hidden="true"` y `tabindex="-1"`.
- `notify-connected` no se elimina del backend ni del handler JS; queda como
  compatibilidad temporal para cache o clientes antiguos.
- `EN_PREPARACION` ya no deriva a `awaiting_connection` en el estado cliente.
- Los paneles 1-3 ya no quedan bloqueados por esperar conexion web.
- Panel 3 deja de usar `EN_PREPARACION` para pintar el cajon verde como estado
  bloqueante; el seguimiento cliente queda como fuente visible del pedido aprobado.
- El codigo visible del Panel 4 prioriza `shortCode` antes de `code`.

Fuentes externas usadas como criterio:

- MDN `disabled`: un control deshabilitado no recibe foco/eventos ni participa como control.
- MDN `aria-live` / `role=status`: para cambios de estado no criticos, conviene una region viva polite/status en vez de un boton sin accion real.

Verificacion local:

```powershell
node --check public/portal-modules/panel-4-connection.js
node --check public/portal-modules/flow-state.js
node --check public/portal-modules/auth-forms.js
node --check public/portal-modules/events.js
node --check public/portal-modules/panel-3-account.js
node --check test/phase3a.contract.test.js
node --test test/phase3a.contract.test.js
node --test test/phase4.smoke.test.js
git diff --check -- public/portal.html public/portal-modules/panel-4-connection.js public/portal-modules/flow-state.js public/portal-modules/auth-forms.js public/portal-modules/events.js public/portal-modules/panel-3-account.js public/portal-styles/14-panel-4.css test/phase3a.contract.test.js
npm.cmd test
```

Resultado:

- `node --check` enfocado: OK.
- `node --test test/phase3a.contract.test.js`: 26/26 pasando.
- `node --test test/phase4.smoke.test.js`: OK.
- `git diff --check`: OK; solo avisos CRLF del checkout Windows.
- `npm.cmd test`: 70/70 pasando.

Verificacion navegador local:

- URL probada: `http://127.0.0.1:4173/cliente`.
- Caso controlado local: cliente temporal con orden FRP aprobada.
- Estado observado en DOM real del navegador:
  - `#panel4[data-state="C"]`.
  - `#panel4Status` visible con `role="status"`.
  - Mensaje visible: `Pago aprobado` / `Manten el equipo conectado`.
  - `#panel4EquipoConectado` sigue en DOM solo por compatibilidad, pero oculto con
    `hidden` y `aria-hidden="true"`.
  - Codigo visible: `ARD-0001`.
  - Mis ordenes muestra `ARD-0001`, codigo real interno y item `ARD-0001-01`.
- Resultado: OK. El flujo post-pago ya no depende visualmente ni funcionalmente del
  boton obligatorio `Equipo conectado`.

Pendiente para cerrar en deploy:

```bash
cd /opt/render/project/src
curl -fsS https://ops.ariadgsm.com/api/health
curl -fsS https://ariadgsm.com/api/health
npm run postgres:read-check -- --report /tmp/postgres-live-after-frp-step4-instructions.json --strict
cat /tmp/postgres-live-after-frp-step4-instructions.json
```

## Corte 6 implementado

Fecha: 2026-05-07

Archivos tocados:

- `public/app.js`
- `public/portal-modules/panel-4-connection.js`
- `docs/specs/cliente/panel-4-conexion.md`
- `docs/specs/operador/operador-frp-express.md`
- `test/phase3a.contract.test.js`
- `test/frp-payment-review-postgres.test.js`

Cambios aplicados:

- Las ordenes amarillas `NO_CONNECTION` conservan accion `Finalizar` ademas de `Avisar cliente`.
- La accion `Finalizar` sigue usando el endpoint seguro `PATCH /api/frp/jobs/:id/direct-finalize`.
- No se reutiliza `PATCH /api/frp/jobs/:id/cancel` para amarillas sin conexion porque ese endpoint pertenece al contrato viejo de jobs ya tomados/en proceso.
- El Panel 4 cliente deja de mostrar `Codigo del proceso` durante `PAGO_EN_REVISION` o `PAGO_RECHAZADO`.
- El codigo del proceso se muestra solo cuando el estado visual del Panel 4 es `C`: pago aprobado o servicio vivo.
- El placeholder pasa a `Aparecera cuando tu pago sea aprobado`.

Razonamiento:

- La web no puede confirmar conexion USB Redirector por si sola; esa lectura sigue siendo operativa/externa.
- Si el operador completa el servicio desde una orden amarilla, no debe quedar bloqueado por un estado visual de aviso.
- Mostrar codigo antes de aprobar pago puede hacer que el cliente confunda comprobante recibido con proceso tecnico listo.

Cancelacion:

- No se agrega cancelacion irreversible en este corte.
- Cancelar una orden pagada toca politica de reembolso y seguimiento cliente; requiere endpoint/contrato propio para no usar un endpoint viejo con semantica distinta.

Verificacion local:

```powershell
node --check public/app.js
node --check public/portal-modules/panel-4-connection.js
node --check test/phase3a.contract.test.js
node --check test/frp-payment-review-postgres.test.js
node --test test/phase3a.contract.test.js
node --test test/frp-payment-review-postgres.test.js
npm.cmd test
```

Resultado:

- `node --check` enfocado: OK.
- `node --test test/phase3a.contract.test.js`: 26/26 pasando.
- `node --test test/frp-payment-review-postgres.test.js`: 22/22 pasando.
- `git diff --check`: OK; solo avisos CRLF del checkout Windows.
- `npm.cmd test`: 71/71 pasando.

Verificacion navegador local aislada:

- URL temporal: `http://127.0.0.1:4184`.
- Datos usados: `ARIAD_DATA_DIR` temporal, sin tocar runtime real ni Postgres.
- Cliente con pago en revision:
  - `#panel4[data-state="B"]`.
  - `#panel4OrderCodeValue`: `Aparecera cuando tu pago sea aprobado`.
  - `#panel4OrderCodeCopy` oculto con `hidden`.
- Cliente con pago aprobado:
  - `#panel4[data-state="C"]`.
  - `#panel4OrderCodeValue`: `ARD-0002`.
  - `#panel4OrderCodeCopy` visible.
- Operador FRP:
  - Se confirmo 1 card `.frp-ops-v2-order-card.is-no-connection`.
  - Se confirmo 1 boton visible `[data-frp-direct-finalize]`, habilitado.
  - Se confirmo 1 boton visible `[data-frp-notify-customer]`, habilitado.
  - Consola del navegador: sin errores JS (`tab.dev.logs({ levels: ["error"] })` vacio).
