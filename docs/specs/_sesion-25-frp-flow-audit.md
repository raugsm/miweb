# Auditoria FRP post-pago - corte anti-parche

Fecha: 2026-05-07.

## Objetivo

Detener el ciclo de parches sobre el panel trabajador y cerrar el contrato real
del flujo FRP despues de subir comprobante:

1. Cliente ve precio.
2. Cliente elige cantidad de equipos.
3. Cliente sube comprobante.
4. Cliente recibe instrucciones de conexion, sin boton obligatorio `Equipo conectado`.
5. Operador ve la orden y la cierra cuando termina el servicio.

## Hechos verificados

- El flujo nuevo ya esta documentado como v2.0 en `docs/specs/operador/operador-frp-express.md`.
- La spec nueva dice que no debe existir `Trabajo actual`, `Tomar`, `Tomar siguiente` ni dependencia operativa de `Equipo conectado`.
- La orden amarilla `NO_CONNECTION` existe porque la web no puede confirmar sola lo que el operador ve en USB Redirector.
- La orden amarilla debe conservar salida operativa: si el operador completa el servicio, debe poder cerrar con `Finalizado`.
- El serializer del operador expone `finalizeAllowed: true` para pago aprobado aunque derive a `NO_CONNECTION`.
- La UI actual renderiza `Finalizar`, pero lo deshabilita si `isMeActive` es falso.
- El backend `PATCH /api/frp/jobs/:id/direct-finalize` tambien bloquea jobs sin `technicianId` cuando el usuario no es el tecnico activo global.
- Por eso, la pantalla puede mostrar una orden amarilla con `Finalizar` deshabilitado aunque el flujo de producto diga que el operador debe poder cerrarla.

## Brecha principal

El problema no es visual. El problema es de contrato.

El flujo deseado dice:

> Orden creada, orden finalizada.

El contrato viejo que quedo colado dice:

> Si el job no tiene dueno, solo el tecnico activo global puede finalizar.

Esas dos reglas chocan. Si se mantiene la regla del tecnico activo, el sistema
vuelve a comportarse como el flujo viejo de `Tomar`, aunque visualmente ya no
se llame `Tomar`.

## Fuentes externas usadas como criterio

- MDN documenta que un control HTML con `disabled` no funciona como control
  interactivo: no recibe foco ni se activa como accion normal. En este flujo,
  un boton `Finalizar` deshabilitado no es un estado cosmetico; es bloqueo real.
  Fuente: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/disabled
- Stripe separa el pago exitoso del fulfillment, y recomienda disparar el
  fulfillment desde eventos/estado durable, no desde una accion fragil del
  usuario en la pagina. En AriadGSM esto respalda separar `pago aprobado` de
  `cliente presiono Equipo conectado`.
  Fuente: https://docs.stripe.com/checkout/fulfillment
- Stately/XState modela transiciones con guards explicitos. El aprendizaje para
  este corte no es meter XState, sino escribir los guards de negocio como contrato:
  quien puede pasar de `PAYMENT_APPROVED` o `NO_CONNECTION` a `FINISHED`.
  Fuente: https://stately.ai/docs/guards

## Flujo real actual

### Cliente

1. Sube comprobante.
2. Se crea orden y items.
3. Si el pago esta en revision, no debe mostrarse codigo operativo procesable.
4. Si el pago se aprueba, el cliente ve instrucciones de conexion y mantiene el equipo conectado.
5. Ya no existe accion obligatoria `Equipo conectado` como umbral para operador.

### Operador

1. Ve ordenes por estado:
   - azul: pago en revision o requiere revision;
   - verde: pago aprobado;
   - amarillo: pago aprobado, sin avance operativo despues del plazo;
   - gris: finalizado.
2. Para azul, usa `Revisar`.
3. Para verde o amarillo, debe poder cerrar el equipo accionable con `Finalizado`.
4. Para amarillo, puede ademas usar `Avisar cliente`.
5. Para multi-equipo, solo el siguiente equipo accionable puede cerrarse.

## Hallazgos

### H1 - Critico - `Finalizar` amarillo sigue atado al tecnico activo

Evidencia:

- `public/app.js` calcula `canFinalize` con `isMeActive`.
- `server/frp/frp-routes.js` exige `requireActiveFrpTechnician` cuando el job no tiene `technicianId`.
- `test/phase3a.contract.test.js` todavia afirma ese mismo patron.

Impacto:

- Si Jack no es el tecnico activo global, ve el boton deshabilitado.
- Si se habilita solo en frontend, backend respondera 403.
- Esto explica la pantalla actual: `No conecto` + `Finalizar` gris.

Conclusion:

- No sirve otro parche visual. Hay que cambiar backend, UI y pruebas como un
  mismo contrato.

### H2 - Alto - Las pruebas validaron el caso facil, no el caso real

El test visual/local confirmo que el boton aparecia cuando el usuario era tecnico
activo. No probo el caso que hoy importa:

- orden aprobada o amarilla;
- job sin `technicianId`;
- operador con permiso FRP;
- operador NO es el tecnico activo global;
- finalizacion directa debe funcionar o debe quedar explicitamente prohibida.

Conclusion:

- La prueba fue insuficiente. Paso una version que no cubria el bloqueo real.

### H3 - Alto - `NO_CONNECTION` no significa certeza tecnica

La web no sabe si el equipo esta conectado en USB Redirector. Solo sabe que:

- el pago esta aprobado;
- no hubo avance operativo;
- paso el plazo configurado.

Por eso `No conecto` es una alerta de tiempo, no una prueba tecnica. La decision
visual puede mantener amarillo, pero el copy y las acciones no deben tratarlo
como una verdad absoluta.

### H4 - Alto - Documentos v1 siguen vivos debajo de v2

`docs/specs/cliente/panel-4-conexion.md` tiene una decision v2.0 arriba, pero
conserva mucho contenido historico que habla de `Equipo conectado`, freeze de
Technician ID y estado C pre-click.

Conclusion:

- El documento intenta resolverlo con una nota de prevalencia v2.0, pero sigue
  siendo facil que una persona o agente vuelva a leer una regla vieja y la
  implemente.

### H5 - Medio - `Avisar cliente` no resuelve cierre de servicio

`Avisar cliente` es util cuando el cliente no conecto o hay que escribirle, pero
no puede ser la unica salida de una orden amarilla. Si el operador mira Redirector
y puede procesar, debe cerrar. Si no, se vuelve a crear una caja muerta.

### H6 - Medio - Cancelacion sigue fuera de contrato

El pedido pagado que no conecta despues del plazo puede necesitar:

- aviso;
- ajuste de precio;
- reembolso;
- cancelacion operativa.

Eso no debe mezclarse con este corte. Si se mete ahora, se abre otro frente:
pagos, ledger, reembolsos, auditoria y experiencia cliente.

## Decision recomendada

Yo cambiaria el contrato asi:

### Regla nueva de finalizacion directa

Para jobs con pago aprobado en estado `PAYMENT_APPROVED` o `NO_CONNECTION`:

- si el job no tiene `technicianId`, cualquier operador elegible FRP puede
  finalizar el equipo accionable;
- al finalizar, backend asigna atomicamente `technicianId = user.id`;
- si el job ya tiene `technicianId` de otro operador, se rechaza salvo `ADMIN`;
- se conserva la regla secuencial multi-equipo;
- se conserva idempotencia si ya estaba finalizado;
- se registra auditoria con el operador que cerro.

### Lo que no haria

- No quitaria solo `disabled` en frontend.
- No reviviria `Tomar`.
- No haria que `Avisar cliente` sea salida obligatoria.
- No cambiaria AI de pagos a auto-aprobacion productiva en este mismo corte.
- No meteria reembolso/cancelacion en el mismo patch.

## Siguiente corte unico

**Corte 7 - Finalizacion directa sin cuello de tecnico activo para orden aprobada.**

Orden:

1. Actualizar contrato en docs:
   - `docs/specs/operador/operador-frp-express.md`;
   - este documento de auditoria queda como justificacion.
2. Backend first:
   - `server/frp/frp-routes.js`: quitar `requireActiveFrpTechnician` solo para
     direct-finalize de jobs sin dueno y pago aprobado.
   - `server/db/postgres-frp-core.js`: mantener asignacion atomica del dueno en
     `applyFrpJobDirectFinalizeLegacyState`.
3. Pruebas:
   - agregar caso: operador FRP no activo global finaliza `NO_CONNECTION` sin dueno.
   - agregar caso: job con dueno de otro operador sigue rechazado.
   - mantener caso multi-equipo secuencial.
4. UI:
   - `public/app.js`: `Finalizar` verde/amarillo no depende de `isMeActive` si
     la accion es `direct-finalize`.
   - `disabledTip` debe distinguir permisos reales de estado informativo.
5. Verificacion:
   - `node --check` en archivos tocados.
   - `node --test test/frp-payment-review-postgres.test.js`.
   - `npm.cmd test`.
   - prueba browser con operador no activo global y orden amarilla.
   - read-check live despues de deploy.

## Criterio de salida

Este corte queda cerrado solo si se cumple todo:

- Una orden amarilla de 1 equipo permite `Finalizar` a operador FRP elegible
  aunque no sea el tecnico activo global.
- Una orden verde de 1 equipo permite `Finalizar` bajo la misma regla.
- Una orden multi-equipo solo permite cerrar el siguiente equipo accionable.
- Un job tomado por otro operador sigue protegido.
- Cliente `Mis ordenes` se actualiza al finalizar.
- No reaparece `Equipo conectado` como accion obligatoria.
- No reaparece `Tomar` como paso operativo principal.

## Implementacion Corte 7

Fecha: 2026-05-07.

Archivos tocados:

- `server/frp/frp-routes.js`
- `public/app.js`
- `test/frp-payment-review-postgres.test.js`
- `test/phase3a.contract.test.js`
- `docs/specs/operador/operador-frp-express.md`
- `docs/specs/_sesion-25-frp-flow-audit.md`

Cambios aplicados:

- `PATCH /api/frp/jobs/:id/direct-finalize` ya no exige
  `requireActiveFrpTechnician` cuando el job no tiene dueno.
- La proteccion contra job tomado por otro operador sigue vigente:
  `job.technicianId && job.technicianId !== user.id` rechaza salvo `ADMIN`.
- La mutacion de estado sigue asignando `technicianId = user.id` al operador que
  cierra el job sin dueno.
- La UI de orden verde/amarilla ya no usa `isMeActive` ni `hasActiveTechnician`
  para bloquear `Finalizar`.
- Durante `swapInProgress`, las acciones siguen bloqueadas temporalmente.
- Las pruebas de contrato ahora verifican que `direct-finalize` no vuelve a
  depender del tecnico activo global.

Verificacion local ejecutada:

```powershell
node --check server/frp/frp-routes.js
node --check server/db/postgres-frp-core.js
node --check public/app.js
node --check test/frp-payment-review-postgres.test.js
node --check test/phase3a.contract.test.js
node --test test/frp-payment-review-postgres.test.js
node --test test/phase3a.contract.test.js
npm.cmd test
```

Resultado:

- `frp-payment-review-postgres.test.js`: 24/24 pasando.
- `phase3a.contract.test.js`: 26/26 pasando.
- Suite completa `npm.cmd test`: 73/73 pasando.

Verificacion local de servidor:

- Se levanto una instancia local en `http://127.0.0.1:4190/`.
- `GET /api/health` respondio `ok: true`.
- `GET /app.js` contiene el contrato actualizado:
  `canFinalize = item + finalizeAllowed + estado finalizable + !swapInProgress`.

## Incidente post-deploy Corte 7.1

Fecha: 2026-05-07.

Sintoma reportado:

- El boton `Finalizar` ya aparece habilitado en una orden amarilla.
- Al hacer click, backend responde: `Solo puedes finalizar un equipo aprobado y accionable.`

Causa:

- Corte 7 quito el bloqueo por tecnico activo, pero dejo vivo otro guard viejo:
  `direct-finalize` solo aceptaba jobs en `ESPERANDO_PREPARACION`,
  `LISTO_PARA_TECNICO` o `EN_PROCESO`.
- Algunas ordenes amarillas vivas pueden derivar `NO_CONNECTION` aunque el job
  llegue con estado pendiente legacy vacio o `ESPERANDO_CLIENTE`.
- Esas ordenes son pago aprobado sin avance operativo; para el flujo v2 deben
  poder cerrarse si el operador confirma visualmente en Redirector.

Correccion aplicada:

- `direct-finalize` normaliza estado vacio/missing como `ESPERANDO_PREPARACION`.
- `direct-finalize` acepta tambien `ESPERANDO_CLIENTE`.
- Sigue rechazando jobs no aprobados, cancelados, de otro operador o fuera de
  secuencia multi-equipo.

## Incidente post-deploy Corte 7.2

Fecha: 2026-05-07.

Sintoma reportado:

- El panel seguia mostrando cards amarillas `No conecto` con boton `Finalizar`.
- Al inspeccionar las ordenes vivas `CL-20260505-003` y `CL-20260507-001`, los
  jobs e items ligados ya estaban en `CANCELADO`.
- El backend rechazo correctamente la accion con
  `Solo puedes finalizar un equipo aprobado y accionable.`

Causa:

- El serializer del panel operador excluia jobs `CANCELADO` para algunos
  calculos internos, pero `operatorOrderVisible` seguia considerando visible
  una orden con pago aprobado aunque todos sus jobs estuvieran cancelados.
- El frontend tambien tenia un fallback riesgoso: si no encontraba item
  accionable, podia usar `items[0]`, que en este incidente era un job
  cancelado.

Correccion aplicada:

- Ordenes FRP con `orderStatus` cancelado o con todos sus jobs en `CANCELADO`
  ya no entran a `operatorOrders`.
- El estado derivado `CANCELED` no es finalizable.
- El frontend ya no renderiza `CANCELED` como orden activa y no usa items
  cancelados/finalizados como fallback accionable.
- Se agrego cobertura para que una orden aprobada totalmente cancelada conserve
  historial tecnico, pero desaparezca del panel operativo.
