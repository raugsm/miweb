# Sesion 17 - Auditoria Usuarios y roles vs flujo FRP

**Fecha:** 2026-05-05  
**Estado:** auditoria documentada. Sin cambios de codigo operativo.  
**Alcance:** revisar la pagina `Usuarios y roles` y su relacion con el nuevo flujo cliente -> operador FRP.

## Protocolo aplicado

Se aplica `docs/specs/protocolo-trabajo-codex.md`:

1. Revisar codigo antes de tocar.
2. Explicar que existe hoy.
3. Separar hechos, inferencias, riesgos y supuestos.
4. Proponer opciones.
5. Esperar aprobacion antes de redisenar o cambiar logica.

Bryam pidio documentar la auditoria, por eso se crea este archivo. No se modifica frontend, backend, estilos ni tests.

## Objetivo operativo real

Para empezar a procesar FRP en la web real, Bryam necesita:

1. Ver que dos tecnicos esten conectados a la web.
2. Poder decidir cual tecnico queda activo para recibir/procesar FRP.
3. Evitar que campos administrativos antiguos confundan permisos reales del flujo cliente.

La pantalla actual no esta disenada para ese objetivo. Es una tabla administrativa general.

## Archivos revisados

- `public/index.html`
  - Navegacion `Usuarios`: linea 113.
  - Panel `Usuarios y roles`: lineas 478-503.
  - Widget de tecnico activo: lineas 130-140.
- `public/app.js`
  - Render de usuarios: lineas 497-548.
  - Guardado de usuario: lineas 3242-3256.
  - Permisos frontend FRP: lineas 1941-1947.
  - Visibilidad del widget tecnico: lineas 3777-3785 y 3809-3815.
  - Presencia online: lineas 340-342 y 2768-2774.
- `server.js`
  - Publicacion de usuarios al frontend: lineas 446-458.
  - Reglas FRP: lineas 890-909.
  - Login bloquea usuarios inactivos: lineas 3769-3771.
  - Presencia online: lineas 2781-2806.
  - Sesion devuelve usuarios solo a ADMIN: lineas 3628-3642.
  - `PATCH /api/users/:id`: lineas 4640-4686.
- `server/config/catalog.js`
  - Roles: lineas 1-5.
  - Canales: linea 7.
  - FRP asignado a `WhatsApp 3`: linea 159.
- `server/operator/technician.js`
  - Tecnicos elegibles: lineas 7-16.
  - Tecnico activo por defecto: lineas 19-33.
  - Resolucion de tecnico activo: lineas 72-89.
  - Switch tecnico: lineas 142-152.
- `server/portal/portal-routes.js`
  - Cliente lee tecnico activo: lineas 88-111.

## Hechos confirmados

1. La pantalla `Usuarios y roles` solo aparece para `ADMIN`.
2. La tabla permite cambiar canal, rol, permiso de costos FRP, Technician ID, estado activo e inactivo.
3. El boton Guardar envia todos esos campos juntos a `PATCH /api/users/:id`.
4. Los roles existentes son `ADMIN`, `COORDINADOR` y `ATENCION_TECNICA`.
5. FRP Express esta ligado a `WhatsApp 3`.
6. Un usuario activo de `WhatsApp 3` puede entrar al modulo FRP aunque no sea necesariamente el tecnico activo.
7. Para validar pagos FRP, la regla actual permite `ADMIN`, `COORDINADOR` o usuario activo asignado a `WhatsApp 3`.
8. Para ser tecnico elegible en el switch, hoy basta con `active !== false` y tener `technicianRedirectorId`.
9. La elegibilidad tecnica no exige rol `ATENCION_TECNICA` ni canal `WhatsApp 3`.
10. El widget superior de tecnico activo se oculta si no hay tecnico activo.
11. Si no hay tecnico activo, el backend puede elegir uno por defecto solo si ya existe algun usuario elegible.
12. La presencia online existe en backend, pero la pantalla de usuarios solo muestra un contador en Inicio; no muestra dos tecnicos conectados ni su estado por fila.

## Hallazgos

### AUD-USR-001 - La pagina mezcla conceptos distintos

**Hecho:** en una sola fila se mezclan `Canal`, `Rol`, `FRP costos`, `PIN`, `Technician ID` y `Activo`.

**Problema:** para el flujo FRP esos campos no significan lo mismo:

- `Activo` = puede iniciar sesion.
- `Canal WhatsApp 3` = puede ver/usar FRP.
- `FRP costos delegado` = puede cambiar costos/proveedores, no procesar equipos.
- `Technician ID` = puede ser elegido como tecnico para Redirector.
- `Tecnico activo` = quien recibe el trabajo ahora.

**Riesgo:** Bryam puede creer que Jack esta listo por tener `WhatsApp 3`, `Atencion tecnica` y `Delegado`, pero igual no podra tomar jobs si no es tecnico activo o si no tiene Technician ID real.

**Clasificacion:** roto por confusion operativa. No es solo visual.

### AUD-USR-002 - `FRP costos / Delegado` no sirve para procesar equipos

**Hecho:** el checkbox `Delegado` controla `permissions.frpCostManager`.

**Problema:** ese permiso permite modificar costos FRP. No permite tomar equipos ni ser tecnico activo.

**Riesgo:** en la pantalla actual parece un permiso FRP general. Para operacion diaria esto confunde.

**Recomendacion:** moverlo a una seccion de administracion de costos o renombrarlo claramente como `Puede cambiar costos FRP`.

### AUD-USR-003 - `Technician ID` no tiene validacion suficiente

**Hecho:** el frontend permite cualquier texto hasta 64 caracteres. El backend tambien recorta a 64 y guarda.

**Problema:** el Redirector necesita un ID correcto. Un valor mal escrito puede llegar al cliente.

**Riesgo:** cliente pega un Technician ID invalido y el proceso se bloquea fuera de la web.

**Recomendacion:** validar formato antes de guardar. Minimo: permitir solo digitos y espacios, normalizar grupos, mostrar estado `Valido / Incompleto / No configurado`.

### AUD-USR-004 - Tecnico elegible es demasiado amplio

**Hecho:** `eligibleTechnicians(db)` solo exige usuario activo y Technician ID.

**Problema:** un ADMIN o usuario de otro canal con Technician ID puede quedar como tecnico elegible.

**Riesgo:** el cliente podria ver un Technician ID que no pertenece al tecnico correcto de WhatsApp 3.

**Recomendacion:** definir regla formal. Para el flujo actual parece mas seguro: `activo + rol ATENCION_TECNICA + WhatsApp 3 + Technician ID valido`.

### AUD-USR-005 - Si no hay tecnico activo, el widget desaparece

**Hecho:** `paintTechnicianWidget()` oculta el widget si `!status?.active`.

**Problema:** justo cuando no hay tecnico activo, Bryam necesita una forma visible de elegirlo.

**Riesgo:** en produccion aparece `Sin tecnico activo` y el admin no tiene una accion clara para repararlo desde la UI.

**Recomendacion:** el admin debe ver un estado vacio con accion `Asignar tecnico activo`, no ocultar el widget.

### AUD-USR-006 - El tecnico activo puede quedar viejo o inconsistente

**Hecho:** cuando se cambia `technicianRedirectorId`, rol, canal o estado activo de un usuario, `PATCH /api/users/:id` no sincroniza automaticamente `db.activeTechnician`.

**Problema:** si el usuario activo cambia su Technician ID, se desactiva o deja de ser valido, el estado `activeTechnician` puede conservar datos viejos.

**Riesgo:** el cliente puede seguir viendo un Redirector ID anterior o el operador puede ver `Sin tecnico activo` mientras el portal aun devuelve un ID viejo.

**Recomendacion:** al guardar usuario, validar si afecta al tecnico activo y recalcular/sincronizar estado.

### AUD-USR-007 - No hay vista clara de "2 tecnicos conectados"

**Hecho:** `publicPresence(db)` ya calcula usuarios online dentro de una ventana de 45 segundos.

**Problema:** la UI solo muestra un contador, no una lista util por tecnico.

**Riesgo:** Bryam no puede confirmar rapidamente si Jack y Angelo estan conectados antes de decidir el activo.

**Recomendacion:** crear una vista de `Tecnicos FRP` con tarjetas: conectado/desconectado, canal, Technician ID, activo actual, boton para activar.

### AUD-USR-008 - `PIN` no pertenece al flujo tecnico FRP

**Hecho:** la columna PIN solo muestra `Configurado` o `Pendiente`.

**Problema:** para procesar FRP no ayuda a decidir tecnico activo ni estado online.

**Riesgo:** ocupa espacio en una pantalla que ya es dificil de leer.

**Recomendacion:** ocultar PIN de la vista operativa FRP. Mantenerlo en seguridad/admin si se necesita.

### AUD-USR-009 - Tabla demasiado ancha para una tarea operativa

**Hecho:** la tabla usa `min-width: 1120px` y muchos controles por fila.

**Problema:** sirve como panel tecnico antiguo de administracion, pero no como centro de control FRP.

**Riesgo:** seguir agregando columnas empeora la pagina y aumenta errores de configuracion.

**Recomendacion:** no seguir parches sobre la tabla. Redisenar como panel de control por secciones.

## Lo que no conviene eliminar todavia

1. No eliminar `role`, `workChannel`, `active` ni `technicianRedirectorId`: son funcionales.
2. No eliminar `permissions.frpCostManager`: sirve para costos, pero debe moverse o aclararse.
3. No eliminar presencia online: debe reutilizarse mejor.
4. No eliminar switch tecnico: debe corregirse para estado vacio y reglas de elegibilidad.

## Opciones de cambio

### Opcion 1 - Parche minimo

Cambiar textos y ocultar columnas confusas.

**Pros:** rapido.  
**Contras:** no resuelve tecnico activo, dos tecnicos online ni sincronizacion de datos.  
**Riesgo:** se maquilla el problema.

### Opcion 2 - Redisenio parcial de Usuarios para FRP

Crear dentro de Usuarios una seccion `Tecnicos FRP` y dejar la tabla completa debajo como administracion avanzada.

**Pros:** menor riesgo que borrar todo; da a Bryam control operativo rapido.  
**Contras:** conviven dos vistas por un tiempo.  
**Riesgo:** medio, pero controlable.

### Opcion 3 - Redisenio completo del modulo Usuarios y roles

Separar:

- Tecnicos FRP.
- Roles y accesos.
- Seguridad/PIN.
- Costos FRP.

**Pros:** arquitectura mas limpia.  
**Contras:** mas archivos, mas pruebas, mas riesgo antes de operar.  
**Riesgo:** alto si se hace de golpe.

## Recomendacion

Recomiendo Opcion 2.

Motivo: el objetivo inmediato no es crear una administracion perfecta. Es poder operar FRP con dos tecnicos conectados y que Bryam decida el tecnico activo sin confundir permisos.

## Propuesta de pantalla v1

Seccion nueva arriba de Usuarios:

### Tecnicos FRP

Por cada tecnico elegible:

- Nombre.
- Online / desconectado.
- Canal.
- Rol.
- Technician ID validado.
- Estado: Activo ahora / Disponible / No elegible.
- Boton: Activar.

Debajo:

### Administracion avanzada

Tabla actual, pero con mejoras:

- `FRP costos` renombrado a `Puede cambiar costos`.
- `PIN` oculto o movido.
- `Technician ID` con validacion visual.
- Mensajes de error antes de guardar.

## Archivos que se tocarian si Bryam aprueba

Frontend:

- `public/index.html`
- `public/app.js`
- `public/styles.css`

Backend probable:

- `server/operator/technician.js`
- `server.js`

Tests probables:

- `test/phase5.technician-swap.test.js`
- `test/phase4.smoke.test.js` si cambia elegibilidad FRP.

## Riesgos antes de implementar

1. Si se cambia elegibilidad tecnica, puede romper tests que hoy permiten ADMIN con Technician ID.
2. Si se sincroniza `activeTechnician` al guardar usuario, hay que cubrir casos de cambio de ID, usuario inactivo y tecnico eliminado.
3. Si se muestra presencia online, hay que explicar que online significa actividad reciente de sesion, no conexion USB.
4. Si se permite activar tecnico cuando no hay activo, debe quedar limitado al ADMIN.

## Siguiente paso unico recomendado

Antes de tocar UI, cerrar la regla de elegibilidad:

**Un tecnico FRP elegible debe ser: usuario activo + rol `ATENCION_TECNICA` + canal `WhatsApp 3` + Technician ID valido.**

Si Bryam aprueba esa regla, el siguiente cambio debe ser backend primero: ajustar elegibilidad y sincronizacion de `activeTechnician`, con pruebas. Despues se redisenia la pantalla.

## Auditoria de impacto antes de tocar backend

**Estado:** revision previa. No se aplico codigo.

### Regla propuesta a evaluar

Cambiar la elegibilidad tecnica desde:

```text
usuario activo + technicianRedirectorId
```

hacia:

```text
usuario activo + rol ATENCION_TECNICA + canal WhatsApp 3 + Technician ID valido
```

### Impacto confirmado en backend

1. `server/operator/technician.js#eligibleTechnicians`
   - Hoy acepta cualquier usuario activo con `technicianRedirectorId`.
   - Si se cambia aqui, cambia automaticamente la lista de candidatos para el switch.
   - Riesgo positivo: deja fuera admins o usuarios de otros canales.
   - Riesgo negativo: si produccion solo tiene al propietario con Technician ID, la web quedaria sin tecnico activo hasta configurar Jack/Angelo correctamente.

2. `server/operator/technician.js#defaultActiveTechnician`
   - Hoy elige el primer elegible.
   - Con la regla nueva, podria devolver `null` si no hay tecnico real configurado.
   - Esto es correcto si falta configuracion, pero debe verse claro en UI.

3. `server/operator/technician.js#resolveActiveTechnician`
   - Hoy solo crea default si `db.activeTechnician` es `null`.
   - Problema: si ya existe `activeTechnician` pero el usuario deja de ser elegible, no lo limpia.
   - Riesgo: cliente puede seguir viendo un Technician ID viejo o invalido.
   - Necesita ajuste: detectar activo invalido y reemplazarlo por otro elegible o dejar `null`.

4. `server/operator/technician.js#startRevertSwap`
   - Hoy revierte a un usuario si existe y tiene `technicianRedirectorId`.
   - Con regla nueva debe verificar tambien rol/canal/activo.
   - Riesgo: auto-revert podria devolver el turno a alguien que ya no debe procesar FRP.

5. `server/operator/technician.js#operatorTechnicianStatus`
   - Hoy publica `active` si hay estado, aunque el usuario activo ya no sea valido.
   - Necesita mostrar estado invalido o depender de una resolucion previa que limpie `activeTechnician`.

6. `server.js#PATCH /api/users/:id`
   - Hoy guardar usuario no recalcula el tecnico activo.
   - Si admin cambia rol, canal, estado o Technician ID de Jack/Angelo, `activeTechnician` puede quedar desactualizado.
   - Necesita sincronizacion despues de guardar usuario.

7. `server/portal/portal-routes.js#GET /api/portal/active-technician`
   - Hoy devuelve el `redirectorId` de `db.activeTechnician`.
   - Si `activeTechnician` esta viejo, el cliente podria copiar un ID incorrecto.
   - Debe depender de un estado ya validado por `readDb()` o resolver antes de responder.

8. `server/portal/portal-routes.js#notify-connected`
   - Congela el Technician ID activo en la orden.
   - Si el activo es invalido o nulo, puede congelar vacio o un ID incorrecto.
   - Debe bloquear conexion o devolver mensaje claro si no hay tecnico activo valido.

### Impacto confirmado en frontend

1. `public/app.js#userIsEligibleTechnician`
   - Hoy considera elegible a cualquier usuario con Technician ID.
   - Si backend exige rol/canal, frontend debe dejar de usar esta regla simple o alinearla.
   - Riesgo: usuario no elegible podria ver widget que no le corresponde.

2. `public/app.js#paintTechnicianWidget`
   - Hoy oculta el widget cuando no hay `status.active`.
   - Si el backend deja `active=null` por seguridad, Bryam no tendra boton visible para asignar tecnico.
   - Necesita estado vacio visible para ADMIN: `Sin tecnico activo` + `Asignar tecnico`.

3. `public/app.js#openTechnicianSwitchModal`
   - Hoy se abre desde el widget visible.
   - Si el widget se oculta cuando no hay activo, no hay camino para elegir el primer tecnico.
   - Necesita entrada admin aunque no haya activo.

4. `public/app.js#renderUsers`
   - La tabla actual no explica que `Delegado` no procesa equipos.
   - Aunque backend quede seguro, la pantalla seguira confundiendo.
   - No bloquea el backend, pero debe redisenarse despues.

### Impacto confirmado en pruebas

1. `test/phase5.technician-swap.test.js`
   - Hoy el ADMIN recibe Technician ID y queda como tecnico activo inicial.
   - Con la regla nueva eso deberia dejar de ser valido.
   - La prueba tendria que cambiar: crear dos usuarios `ATENCION_TECNICA` de `WhatsApp 3` con Technician ID y usar esos como Jack/Angelo.

2. `test/phase4.smoke.test.js`
   - Hoy congela el Technician ID del ADMIN en `notify-connected`.
   - Con la regla nueva, el active technician deberia ser un tecnico real, no el admin.
   - La prueba tendria que configurar tecnico activo real antes de que el cliente conecte.

3. Falta prueba nueva
   - Usuario `ATENCION_TECNICA` en `WhatsApp 1` con Technician ID no debe ser elegible.
   - Usuario `ADMIN` con Technician ID no debe ser tecnico elegible.
   - Usuario `ATENCION_TECNICA` en `WhatsApp 3` sin Technician ID no debe ser elegible.
   - Si el tecnico activo queda invalido despues de guardar usuario, se limpia o se reemplaza.

### Que podria romperse si se toca solo `eligibleTechnicians`

1. Produccion podria quedarse sin tecnico activo si Jack/Angelo no estan configurados exactamente.
2. El portal cliente podria mostrar `Tecnico no disponible`.
3. El widget admin podria desaparecer y dejar sin forma de asignar tecnico desde UI.
4. Las pruebas actuales fallarian porque usan al ADMIN como tecnico inicial.
5. Auto-revert podria conservar reglas viejas si no se actualiza completo.

### Que pasa si se toca el grupo completo

Grupo minimo coherente:

- `server/operator/technician.js`
- `server.js`
- `server/portal/portal-routes.js`
- `public/app.js`
- `test/phase5.technician-swap.test.js`
- `test/phase4.smoke.test.js`

**Pros:** regla consistente de punta a punta.  
**Contras:** mas cambios y requiere prueba local completa cliente-operador.

### Que pasa si no se toca nada

1. La pagina seguira confundiendo permisos.
2. Un usuario no tecnico podria quedar elegible si tiene Technician ID.
3. Jack/Angelo pueden seguir viendose configurados pero no tener control claro del turno.
4. El cliente puede recibir un Technician ID que no representa al tecnico real.

### Recomendacion tecnica despues de esta auditoria

No hacer un parche de una sola funcion.

Primero implementar backend coherente:

1. Crear helper unico de elegibilidad tecnica.
2. Usarlo para `eligibleTechnicians`, `startRevertSwap`, `resolveActiveTechnician` y validacion de `activeTechnician`.
3. Al guardar usuario, si cambia rol/canal/activo/Technician ID, recalcular tecnico activo.
4. Si no hay tecnico activo valido, el portal cliente debe responder sin ID y el panel operador debe mostrar estado reparable para ADMIN.
5. Actualizar pruebas para que ADMIN administre, pero no sea tecnico operativo.

Despues de pasar pruebas, redisenar la UI.

## Comparacion explicita entre las dos webs

**Estado:** revision de conexion cliente <-> operador. No se aplico codigo.

### Web cliente

Entrada principal:

- `public/portal.html`
- `public/portal.js`
- modulos en `public/portal-modules/*`

Endpoints principales que usa:

- `POST /api/portal/orders/frp`
- `PATCH /api/portal/orders/:id/payment-proof`
- `POST /api/portal/orders/:id/notify-connected`
- `POST /api/portal/orders/:orderId/items/:itemId/ready`
- `GET /api/portal/orders/events`
- `GET /api/portal/active-technician`

### Web operador

Entrada principal:

- `public/index.html`
- `public/app.js`

Endpoints principales que usa:

- `GET /api/session`
- `PATCH /api/frp/orders/:id/payment-review`
- `POST /api/frp/jobs/:id/take`
- `POST /api/frp/jobs/take-next`
- `PATCH /api/frp/jobs/:id/finalize`
- `GET /api/operator/frp/events`
- `GET /api/operator/technician/status`
- `POST /api/operator/technician/switch`

## Puentes reales entre cliente y operador

### Puente 1 - Cliente crea orden y sube comprobante

Cliente:

- `public/portal-modules/events.js` crea la orden con comprobante usando `POST /api/portal/orders/frp`.

Backend:

- `server/portal/portal-routes.js` crea `customerOrder`, `frpOrder` y jobs.
- Publica hacia cliente con `publishPortalOrders(...)`.
- Publica hacia operador con `publishFrpOps(..., "payment_review_needed")`.

Operador:

- `public/app.js#renderFrp` muestra la orden en `Pagos por revisar`.
- `GET /api/operator/frp/events` actualiza el panel operador en vivo.

**Estado:** conectado.

### Puente 2 - Operador valida o rechaza comprobante

Operador:

- `public/app.js#reviewFrpPayment` llama `PATCH /api/frp/orders/:id/payment-review`.

Backend:

- `server/frp/frp-routes.js` actualiza `paymentStatus`, checklist y proofs.
- Publica hacia cliente con `publishPortalOrdersForFrpOrder(...)`.
- Publica hacia operador con `publishFrpOps(..., "payment_review_resolved")`.

Cliente:

- `public/portal-modules/live-orders.js` escucha `GET /api/portal/orders/events`.
- Refresca ordenes, panel 3 y panel 4.

**Estado:** conectado.

### Puente 3 - Cliente confirma equipo conectado

Cliente:

- `public/portal-modules/events.js` escucha el boton `Equipo conectado`.
- Llama `POST /api/portal/orders/:id/notify-connected`.

Backend:

- `server/portal/portal-routes.js#notify-connected` marca `customerConnectedAt`.
- Congela el Technician ID activo en la orden.
- Mueve el siguiente job a `LISTO_PARA_TECNICO`.
- Publica hacia cliente con `publishPortalOrders(...)`.
- Publica hacia operador con `publishFrpOps(..., "frp_job_ready_for_technician")`.

Operador:

- `public/app.js#renderFrp` filtra jobs `LISTO_PARA_TECNICO` y los muestra en cola.

**Estado:** conectado, con riesgo si no hay tecnico activo valido.

### Puente 4 - Operador toma trabajo

Operador:

- `public/app.js#takeSpecificFrpJob` llama `POST /api/frp/jobs/:id/take`.
- `public/app.js#takeNextFrpJob` llama `POST /api/frp/jobs/take-next`.

Backend:

- `server/frp/frp-routes.js` cambia job a `EN_PROCESO` y guarda `technicianId = user.id`.
- Publica hacia cliente con `publishPortalOrdersForFrpOrder(...)`.
- Publica hacia operador con `publishFrpOps(..., "frp_job_taken")`.

Cliente:

- `live-orders.js` recibe SSE y actualiza `Mis ordenes`.

**Estado:** conectado, pero la UI bloquea tomar si el usuario no es tecnico activo.

### Puente 5 - Operador finaliza

Operador:

- `public/app.js#finalizeFrpJob` llama `PATCH /api/frp/jobs/:id/finalize`.

Backend:

- `server/frp/frp-routes.js` cambia job a `FINALIZADO`.
- Genera `ardCode` si falta.
- Sincroniza estado de la orden.
- Publica hacia cliente y operador.

Cliente:

- `Mis ordenes` debe mostrar finalizado / recibo cuando corresponda.

**Estado:** conectado.

## Donde las dos webs aun no estan bien amarradas

### CONN-001 - Tecnico activo no esta garantizado como tecnico real

La web cliente depende de `GET /api/portal/active-technician`.

La web operador depende de `GET /api/operator/technician/status`.

Ambas leen de `db.activeTechnician`, pero hoy ese estado puede venir de un usuario que solo tiene `technicianRedirectorId`, aunque no sea tecnico FRP real.

**Riesgo:** el cliente puede copiar un ID que no corresponde al tecnico que debe procesar.

### CONN-002 - Si no hay tecnico activo, el cliente puede llegar a conectar sin ID real

`notify-connected` llama `activeRedirectorIdFromDb(db)` y luego `freezeRedirectorId(...)`.

Si no hay redirector activo, `freezeRedirectorId` no guarda nada, pero el flujo sigue y puede mandar el job a la cola.

**Riesgo:** operador recibe trabajo, pero la orden no queda bien ligada al Technician ID que el cliente debia pegar.

### CONN-003 - La web operador bloquea por UI, pero backend no exige tecnico activo al tomar

En `public/app.js`, `Tomar` depende de `isMeActive`.

Pero en `server/frp/frp-routes.js`, `POST /api/frp/jobs/:id/take` solo exige acceso FRP y que el job este listo. No valida que el usuario sea el tecnico activo.

**Riesgo:** si alguien llama el endpoint directo o queda una UI vieja/cacheada, podria tomar un job sin ser tecnico activo.

### CONN-004 - La presencia online no esta integrada al control tecnico

El backend tiene `publicPresence(db)` y sabe usuarios online recientes.

Pero `operatorTechnicianStatus` no incluye conectado/desconectado por tecnico.

**Riesgo:** Bryam no puede decidir bien entre dos tecnicos conectados desde el panel.

### CONN-005 - Cambio de tecnico activo no publica al cliente por SSE directo

El cliente actualiza Technician ID con polling cada 5 segundos via `public/portal-modules/technician.js`.

El operador se actualiza por polling acelerado en switch.

**Riesgo:** funciona, pero no es conexion inmediata real entre webs. Para el flujo actual puede ser aceptable, pero hay que saber que no es SSE directo para tecnico activo.

## Conclusion de conexion entre webs

El flujo de ordenes si esta conectado:

```text
cliente sube comprobante -> operador revisa -> cliente conecta -> operador toma -> operador finaliza -> cliente ve estado
```

El punto debil no es la orden. El punto debil es el contrato de tecnico:

```text
quien esta conectado + quien es tecnico FRP real + quien esta activo + que Technician ID ve el cliente
```

Por eso la correccion de usuarios/roles no puede tratarse como un redisenio aislado. Debe cerrar primero el contrato de tecnico activo compartido por ambas webs.

## Siguiente paso unico actualizado

Antes de redisenar `Usuarios y roles`, definir e implementar el contrato backend de tecnico activo:

1. Elegibilidad estricta de tecnico FRP.
2. Sincronizacion de `activeTechnician` cuando cambian usuarios.
3. Bloqueo de `notify-connected` si no hay Technician ID activo valido.
4. Bloqueo backend de `take` si el usuario no es tecnico activo.
5. Estado online de tecnicos expuesto para que la UI pueda mostrar Jack/Angelo conectados.

Recien despues conviene redisenar la pagina visual.

## Implementacion cerrada - tecnico activo compartido

Fecha: 2026-05-05.

### Cambios aplicados

1. `server/operator/technician.js`
   - `eligibleTechnicians(db)` ahora solo acepta usuarios:
     - activos;
     - rol `ATENCION_TECNICA`;
     - canal `WhatsApp 3`;
     - `Technician ID` valido de 12 digitos.
   - Se agrego normalizacion de Technician ID para aceptar `100099835478` o `1000 9983 5478` y guardar formato espaciado.
   - `resolveActiveTechnician(...)` ahora limpia o reemplaza `activeTechnician` si el usuario activo dejo de ser elegible.
   - `startRevertSwap(...)` ya no puede revertir hacia un usuario que no sea tecnico FRP elegible.
   - Se agrego `isActiveFrpTechnician(...)` para que el backend pueda bloquear toma de jobs.

2. `server.js`
   - `PATCH /api/users/:id` valida Technician ID antes de guardar.
   - Al cambiar usuario, rol, canal, activo o Technician ID, se resincroniza `db.activeTechnician`.
   - `GET /api/operator/technician/status` ahora devuelve `online: true/false` para activo y elegibles.
   - Se agrego guardia backend para exigir tecnico activo antes de tomar FRP.

3. `server/portal/portal-routes.js`
   - `POST /api/portal/orders/:id/notify-connected` ahora bloquea si no hay tecnico activo valido.
   - `POST /api/portal/orders/:orderId/items/:itemId/ready` tambien bloquea si no hay tecnico activo valido.

4. `server/frp/frp-routes.js`
   - `POST /api/frp/jobs/:id/take` bloquea si el usuario no es el tecnico activo.
   - `POST /api/frp/jobs/take-next` bloquea igual.

5. `public/app.js`
   - El widget de tecnico usa la misma regla visual basica: rol `ATENCION_TECNICA`, canal `WhatsApp 3`, Technician ID.
   - El admin puede ver el widget aunque todavia no haya tecnico activo, para poder elegir uno.
   - El widget/modal muestra `Conectado` o `Desconectado` segun presencia backend.

### Pruebas ejecutadas

Comando:

```powershell
npm.cmd test
```

Resultado:

```text
12 tests passed
0 failed
```

Cobertura relevante:

- Admin con Technician ID ya no queda como tecnico activo.
- Un tecnico de `WhatsApp 1` con Technician ID no entra a elegibles.
- Jack/Angelo en `ATENCION_TECNICA` + `WhatsApp 3` + Technician ID valido si entran a elegibles.
- `GET /api/portal/active-technician` devuelve el Technician ID del tecnico real activo.
- `notify-connected` rechaza la conexion si no hay tecnico activo valido.
- Admin no puede tomar trabajos FRP si no es tecnico activo.
- Tecnico activo si puede tomar y finalizar.
- Switch Jack/Angelo mantiene ventana de cambio y auto-revert.
- Un tecnico elegible pero no activo no puede cambiar el turno.

### Riesgos que quedan

1. La UI de `Usuarios y roles` sigue siendo la tabla vieja. El backend ya esta cerrado, pero la pantalla necesita redisenio para que Bryam pueda decidir entre tecnicos sin leer una tabla gigante.
2. El cliente sigue recibiendo cambio de Technician ID por polling, no por SSE directo. Para el flujo actual es aceptable, pero no es instantaneo garantizado.
3. El rescate operativo donde un admin necesite tomar un job en emergencia quedo bloqueado por contrato. Si se necesita en produccion, debe crearse una accion separada y auditada, no abrir el endpoint normal.

---

## Implementacion en curso - Mis ordenes funcional

### Motivo

Bryam pidio que `Mis ordenes` deje de ser solo una card visual y pase a conectar el flujo real:

- cliente ve las ordenes por equipo;
- cliente puede marcar `Equipo listo`;
- cliente puede cancelar un equipo pendiente;
- cliente puede abortar el pedido;
- operador/tecnico recibe la actualizacion por SSE;
- el reembolso queda manual, no automatico.

Tambien pidio que las cards usen mejor el ancho disponible y aparezcan de a 2 por fila en desktop.

### Decision aplicada

No se implementa reembolso automatico. La cancelacion crea estado real y auditoria, pero el dinero queda como proceso manual por WhatsApp/AriadGSM.

Esto evita abrir una pieza grande de politica de reembolso sin definicion completa.

### Cambios tecnicos

1. `server/portal/portal-routes.js`
   - Nuevo `POST /api/portal/orders/:orderId/items/:itemId/cancel`.
   - Solo acepta equipos pendientes: `ESPERANDO_PREPARACION` o `ESPERANDO_CLIENTE`.
   - Marca item y job como `CANCELADO`.
   - Publica SSE cliente y SSE operador.
   - Registra auditoria `PORTAL_CUSTOMER_ITEM_CANCELED`.
   - Si todos los jobs quedan cancelados, la orden pasa a `CANCELADO`.

2. `server/portal/portal-routes.js`
   - Nuevo `POST /api/portal/orders/:orderId/abort`.
   - Bloquea ordenes ya `FINALIZADO` o `CANCELADO`.
   - Cancela todos los jobs no finalizados.
   - Marca la orden cliente como `CANCELADO` y la orden tecnica como `CANCELADA`.
   - Publica SSE cliente y operador con aviso de reembolso manual.
   - Registra auditoria `PORTAL_CUSTOMER_ORDER_ABORTED`.

3. `server/portal/serializers.js`
   - La derivacion publica ahora ignora jobs `CANCELADO` para decidir si la orden restante esta en proceso, lista o finalizada.
   - Si todos los jobs estan cancelados, el estado publico es `CANCELADO`.
   - Los items publicos exponen `canceledAt` y `cancelReason`.

4. `public/portal-modules/orders.js`
   - Redisenio de card segun referencia: bandera, codigo, monto, fecha, resumen y filas compactas.
   - Boton `Equipo listo` sigue usando endpoint real.
   - Boton `Cancelar este equipo` usa el nuevo endpoint.
   - Menu de 3 puntos agrega `Abortar pedido`.
   - `Recibo de operacion` se habilita cuando los equipos no cancelados estan finalizados.

5. `public/portal-styles/10-orders-tracking-proofs.css`
   - Cards de `Mis ordenes` en 2 columnas desde desktop.
   - Estados por equipo: pendiente, esperando tecnico, en proceso, finalizado, revision y cancelado.

6. `test/phase4.smoke.test.js`
   - Se agrego cobertura para cancelar un equipo pendiente sin sacar de cola los demas.
   - Se agrego cobertura para abortar una orden activa y verla como `CANCELADA` en operador.

### Riesgos aceptados

1. El flujo de dinero no se mueve automatico. Queda manual por WhatsApp.
2. La confirmacion visual usa confirmacion simple del navegador; si luego Bryam quiere modal propio, se disena como mejora de UI, no como cambio de backend.
3. Un equipo cancelado queda visible como `Cancelado` para trazabilidad. No se borra silenciosamente.
