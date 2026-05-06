# Sesion 20 - PostgreSQL runtime write-surface audit

Fecha: 2026-05-06

Estado: auditoria estatica post-P0.

Base local: `82e60f8` (`Document Postgres runtime stabilization`).

Runtime estabilizado en produccion: `92868be21337` (`Stop Postgres snapshot writes from read paths`).

## Objetivo

Mapear que partes del sistema siguen afectadas por el contrato legacy:

```text
readDb() -> mutar db completo -> writeDb(db) -> reemplazo runtime PostgreSQL
```

La meta no es arreglar todo en este documento. La meta es evitar cambios a ciegas:

- saber que rutas aun escriben por snapshot global;
- separar el incendio ya estabilizado de los riesgos pendientes;
- definir que podria pasar si esos riesgos se activan;
- dejar un orden de remediacion antes de nuevos cambios funcionales.

## Alcance

Archivos revisados:

- `server.js`
- `server/portal/portal-routes.js`
- `server/frp/frp-routes.js`
- `server/db/postgres-storage.js`
- `docs/specs/_sesion-20-postgres-runtime-p0-estabilizacion.md`

Comando de inventario:

```bash
rg -n "writeDb\(|\.writeDb\(" server.js server/portal/portal-routes.js server/frp/frp-routes.js server/db -S
```

Conteo actual:

| Archivo | Coincidencias `writeDb` |
| --- | ---: |
| `server.js` | 60 |
| `server/portal/portal-routes.js` | 50 |
| `server/frp/frp-routes.js` | 23 |

Nota: el conteo incluye escrituras ya protegidas por `runtimeSnapshotWritesEnabled`. No significa que todas esten rotas; significa que siguen dentro del mapa de riesgo.

## Estado confirmado

Hechos:

- `ARIAD_STORAGE_DRIVER=postgres` esta activo en runtime.
- `server/db/postgres-storage.js` conserva el guard destructivo.
- El guard bloquea reemplazos que intentan pasar tablas criticas de `>0` a `0`.
- El P0 ya corto escrituras incidentales desde:
  - `readDb()`;
  - `getCurrentUser(req)`;
  - `getCurrentCustomerContext(req)`.
- El self-check vivo correcto es sin `--input`:

```bash
npm run postgres:read-check -- --report /tmp/postgres-live-self-check.json --strict
```

- La comparacion contra `storage/users.json` ya no es una prueba de salud viva; ese archivo es snapshot pre-cutover.

Inferencia:

- La aplicacion puede operar, pero aun existen muchas escrituras de negocio que reemplazan el snapshot completo.
- Mientras ese contrato exista, el guard destructivo es necesario. Quitar el guard seria volver al riesgo de perdida masiva.

Opinion tecnica:

- No conviene reiniciar de cero antes de completar este mapa. Reiniciar sin entender la superficie de escritura repetiria el mismo defecto arquitectonico en otra base.
- Tampoco conviene seguir agregando funciones encima del contrato snapshot global sin una cola de remediacion.

## Riesgo raiz pendiente

El problema raiz pendiente no es "la ruta X falla".

El problema pendiente es que `writeDb(db)` en PostgreSQL no es una escritura granular. Construye un plan legacy y reemplaza el runtime completo desde el objeto recibido.

Eso genera cuatro riesgos:

1. **Reemplazo destructivo bloqueado**
   - Sintoma: API responde 500 con `POSTGRES_RUNTIME_DESTRUCTIVE_WRITE_BLOCKED`.
   - Impacto: el usuario ve error, pero el guard protege datos.

2. **Lost update**
   - Sintoma: dos requests leen snapshots distintos, ambos mutan y escriben; el ultimo puede pisar cambios del primero.
   - Impacto: estados FRP, auditoria, sesiones o comprobantes pueden quedar incoherentes.

3. **Escrituras desde rutas no-idempotentes o ruidosas**
   - Sintoma: GET/SSE/polling escribe auditoria o presencia.
   - Impacto: crecimiento de `audit_events`, mas reemplazos globales, mas ventanas de carrera.

4. **Pruebas contra fuente equivocada**
   - Sintoma: `postgres:read-check --input storage/users.json --strict` falla despues de actividad real.
   - Impacto: falso positivo de perdida de datos; puede inducir a rehidratar desde snapshot viejo y borrar actividad nueva.

## Superficie afectada por dominio

### 1. P0 estabilizado: lectura, sesion y presencia base

Estado: estabilizado, mantener monitoreo.

Puntos:

- `server.js:458`
- `server.js:2744`
- `server.js:2749`
- `server.js:2762`
- `server.js:2771`
- `server.js:2781`
- `server.js:2790`
- `server.js:2797`
- `server.js:2804`

Riesgo antes del P0:

- `GET /api/portal/active-technician`, `GET /api/presence`, `GET /api/session` y helpers de sesion podian terminar escribiendo snapshot global.

Estado despues del P0:

- En PostgreSQL esas escrituras incidentales ya no persisten por snapshot global.
- En JSON se conserva comportamiento legacy.

Riesgo residual:

- Normalizaciones incidentales ya no se guardan automaticamente bajo Postgres.
- Si una futura ruta necesita persistir last-seen/session/device, debe hacerlo con una escritura granular, no reactivar snapshot global.

### 2. SSE, polling y GET con efectos laterales

Estado: riesgo alto por frecuencia, aunque no siempre rompe el flujo.

Rutas/puntos:

| Ruta o helper | Archivo | Lineas | Que escribe | Riesgo |
| --- | --- | ---: | --- | --- |
| `GET /api/portal/orders/events` | `server/portal/portal-routes.js` | 451, 459, 498 | audit stream blocked/connected/disconnected | Reintentos del navegador pueden multiplicar snapshots y auditoria. |
| `GET /api/operator/frp/events` | `server.js` | 4817, 4856 | audit stream connected/disconnected | EventSource admin puede generar escrituras con cada reconexion. |
| `GET /api/portal/orders/:id` bloqueado | `server/portal/portal-routes.js` | 848 | audit lookup blocked | Un GET no autenticado puede causar escritura global. |
| `GET /api/portal/orders/:id/comprobante.pdf` | `server/portal/portal-routes.js` | 1238 | audit PDF generated | Abrir/recargar PDF escribe. |
| `GET /api/daily-close/:date/export` | `server.js` | 3667 | audit/export side effect | Exportar reporte escribe durante GET. |

Que podria pasar:

- aumento innecesario de `audit_events`;
- 500 visible si el guard detecta snapshot destructivo;
- mayor latencia por reemplazos completos;
- mayor probabilidad de carrera con una escritura de negocio real.

Decision recomendada:

- Convertir estos eventos a insert-only en `audit_events` o eliminar auditoria de conect/disconnect.
- Los GET deberian ser idempotentes salvo una razon explicita y documentada.

### 3. Portal cliente: registro, verificacion, login y logout

Estado: funcional en el flujo probado, pero aun depende de snapshot global.

Puntos principales:

- verificacion email: `server/portal/portal-routes.js:198`, `206`, `219`
- registro cliente: `server/portal/portal-routes.js:235`, `241`, `251`, `260`, `313`, `320`, `324`
- reenvio verificacion: `server/portal/portal-routes.js:346`, `351`, `355`, `360`, `364`
- login cliente: `server/portal/portal-routes.js:378`, `385`, `391`, `414`
- logout cliente: `server/portal/portal-routes.js:430`

Tablas/colecciones afectadas:

- `customer_users`
- `customer_clients`
- `customer_sessions`
- `customer_devices`
- `customer_email_verification_tokens`
- `portal_rate_limits`
- `audit_events`

Que podria pasar:

- login/registro bloqueado con 500 si el guard detecta reemplazo destructivo;
- una sesion nueva puede pisar auditoria o rate-limit de otra request cercana;
- reintentos de verificacion/correo pueden inflar rate limits y auditoria;
- si se vuelve a rehidratar desde `users.json`, se pierden usuarios/verificaciones post-cutover.

Estado probado:

- login cliente verificado manualmente despues del P0.
- verificacion de correo se observo funcionando.

Falta validar:

- registro nuevo completo con correo, logout, re-login y rate-limit bajo Postgres vivo.

### 4. Portal cliente: orden FRP, pago, conexion y cancelaciones

Estado: camino feliz probado parcialmente, ramas de error no completas.

Puntos principales:

- crear orden FRP: `server/portal/portal-routes.js:550`, `558`, `568`, `573`, `598`, `650`, `671`, `678`, `693`, `826`
- `connection-ready`: `server/portal/portal-routes.js:870`, `888`
- `notify-connected`: `server/portal/portal-routes.js:915`, `925`, `959`
- item ready: `server/portal/portal-routes.js:989`, `1014`, `1040`
- cancelar item: `server/portal/portal-routes.js:1115`
- abortar orden: `server/portal/portal-routes.js:1186`
- subir comprobante: `server/portal/portal-routes.js:1251`, `1258`, `1275`, `1304`
- decision de precio: `server/portal/portal-routes.js:1383`

Tablas/colecciones afectadas:

- `customer_requests`
- `customer_orders`
- `customer_order_items`
- `stored_files`
- `payment_proofs`
- `frp_orders`
- `frp_jobs`
- `payment_ledger_entries`
- `audit_events`
- `portal_rate_limits`

Que podria pasar:

- pago aprobado en un snapshot y orden cliente no sincronizada en otro;
- comprobante almacenado sin reflejarse en el estado publico;
- `frp_jobs` y `customer_order_items` desalineados;
- doble alta de prueba o bloqueo falso por comprobante duplicado;
- perdida de una decision de precio si corre junto a aprobacion/cancelacion.

Estado probado:

- cliente pudo entrar, subir/usar flujo y pulsar `Equipo conectado`.
- el self-check vivo despues del flujo quedo `ok: true`.

Falta validar:

- cancelacion parcial;
- abort completo;
- segundo comprobante por diferencia;
- branches de compatibilidad/eligibilidad;
- descarga PDF bajo carga/reintentos.

### 5. Operador FRP: aprobacion, tomar, finalizar, cancelar y revisar

Estado: camino feliz probado, concurrencia pendiente.

Puntos principales:

- payment review: `server/frp/frp-routes.js:697`
- checklist orden/job: `server/frp/frp-routes.js:603`, `716`
- ready: `server/frp/frp-routes.js:738`
- tomar especifico: `server/frp/frp-routes.js:777`
- tomar siguiente: `server/frp/frp-routes.js:801`
- finalizar: `server/frp/frp-routes.js:842`
- cancelar: `server/frp/frp-routes.js:899`
- revision: `server/frp/frp-routes.js:922`

Tablas/colecciones afectadas:

- `frp_orders`
- `frp_jobs`
- `customer_orders`
- `customer_order_items`
- `payment_ledger_entries`
- `audit_events`
- `active_technician_state`

Que podria pasar:

- doble toma si dos tecnicos actuan sobre snapshots cercanos;
- finalizacion puede pisar una cancelacion o revision simultanea;
- pago puede quedar validado en FRP pero no reflejado en ledger/cliente;
- `publishPortalOrdersForFrpOrder` puede publicar desde un estado que luego no queda persistido si `writeDb` falla.

Estado probado:

- admin pudo aprobar pago, tomar pedido y finalizarlo.
- no se vieron 500 en el camino feliz despues del P0.

Falta validar:

- dos operadores intentando tomar el mismo job;
- rechazo de pago;
- cancelacion mientras cliente interactua;
- finalize con imagen/log final si se habilita ese flujo.

### 6. Admin, seguridad, dispositivos y cuentas operador

Estado: sensible por bloqueo de acceso.

Puntos principales:

- denegaciones con auditoria: `server.js:2899`, `2915`, `2929`, `2938`, `2947`
- registro operador: `server.js:3838`
- login/admin session/device: `server.js:3857`, `3866`, `3884`, `3900`, `3910`, `3935`
- password reset: `server.js:3968`, `3985`, `3991`, `3996`, `4025`, `4076`
- cambiar password/pin, revocar sesion, aprobar dispositivo: `server.js:4098`, `4129`, `4150`, `4170`
- logout: `server.js:4179`
- update usuario: `server.js:4799`

Tablas/colecciones afectadas:

- `operator_users`
- `operator_sessions`
- `operator_devices`
- `operator_device_approvals`
- `password_reset_tokens`
- `password_reset_requests`
- `audit_events`

Que podria pasar:

- bloqueo de login admin si el guard detecta snapshot destructivo;
- aprobacion de dispositivo perdida o duplicada;
- token reset consumido en un snapshot y no reflejado en otro;
- auditoria de denegacion puede convertir un 403 normal en 500 si la escritura global falla.

Estado probado:

- login admin funciono despues del P0.

Falta validar:

- nuevo dispositivo admin;
- aprobacion/rechazo de dispositivo;
- cambio de password/PIN;
- reset password completo.

### 7. Admin comercial: clientes, tickets, precios, links y cierres

Estado: no probado en el smoke post-P0.

Puntos principales:

- VIP toggle: `server.js:3782`
- client links/suggestions: `server.js:4207`, `4220`, `4262`, `4291`
- pricing/rules: `server.js:4343`, `4390`, `4424`
- clients/tickets: `server.js:4447`, `4489`, `4536`, `4593`, `4655`, `4698`, `4712`, `4737`
- daily close/export/adjustments: `server.js:3644`, `3650`, `3657`, `3667`

Tablas/colecciones afectadas:

- `master_clients`
- `customer_clients`
- `internal_clients`
- `client_links`
- `client_link_suggestions`
- `service_pricing_rules`
- `payment_method_overrides`
- `service_tickets`
- `daily_closes`
- `daily_close_lines`
- `daily_adjustments`
- `payment_ledger_entries`
- `audit_events`

Que podria pasar:

- cambio de precio no sincronizado con catalogo/ordenes;
- cierre diario o ajuste pisa ledger reciente;
- cambio de link cliente afecta acceso sin quedar reflejado;
- export de cierre escribe auditoria en GET y puede fallar innecesariamente.

Falta validar:

- cambio de precio y catalogo publico;
- cierre diario completo;
- ajuste diario;
- ticket creado/editado/cerrado.

### 8. FRP pricing/proveedores/costos

Estado: no probado en smoke post-P0.

Puntos principales:

- politica pricing: `server/frp/frp-routes.js:85`
- provider create/archive/update: `server/frp/frp-routes.js:162`, `206`, `246`, `261`
- cost history/pending: `server/frp/frp-routes.js:326`, `364`, `419`, `447`, `462`
- FRP order manual/admin: `server/frp/frp-routes.js:492`, `503`, `577`

Tablas/colecciones afectadas:

- `frp_pricing_policy`
- `frp_pricing_providers`
- `frp_provider_cost_history`
- `frp_pending_cost_changes`
- `frp_orders`
- `frp_jobs`
- `customer_orders`
- `audit_events`

Que podria pasar:

- un costo aprobado puede no reflejarse en la politica activa;
- precio cliente y costo proveedor pueden divergir;
- historial de costos puede quedar incompleto;
- orden FRP manual puede no empatar con orden cliente/ledger.

Falta validar:

- alta/baja de proveedor;
- cambio de costo pendiente y aprobacion;
- impacto del catalogo y calculo de precio.

## Observacion no-PostgreSQL: Google Fonts/CSP

Hecho:

- El navegador muestra bloqueo de Google Fonts por CSP.

Inferencia:

- Ese error no explica perdida de datos ni 500 de APIs.
- Puede afectar fuente visual, ruido de consola y percepcion de carga.
- La lentitud observada antes se mezclo con polling/EventSource y errores 500; despues del P0 las APIs quedaron en 200 en el flujo probado.

Decision:

- Tratarlo como auditoria de frontend/performance separada.
- No mezclarlo con la remediacion de storage.

## Matriz de severidad

| Severidad | Area | Razon |
| --- | --- | --- |
| P0 estabilizado | read/session/context incidental writes | Ya fue cortado para Postgres; mantener guard. |
| P1 | FRP cliente y operador | Toca dinero, ordenes, jobs, comprobantes y ledger. |
| P1 | admin auth/security | Puede bloquear acceso o alterar sesiones/dispositivos. |
| P2 | SSE/GET con auditoria | Alta frecuencia; aumenta carreras y latencia. |
| P2 | pricing/costos FRP | Puede afectar precios, margen y decisiones cliente. |
| P2 | daily close/ledger | Impacta finanzas y conciliacion. |
| P3 | tickets/client links/suggestions | Importante, pero menor impacto inmediato que FRP/pagos. |
| Separado | Google Fonts/CSP | No es storage; revisar en performance/frontend. |

## Reglas para futuras modificaciones

1. No desactivar `POSTGRES_RUNTIME_DESTRUCTIVE_WRITE_BLOCKED`.
2. No usar `storage/users.json` como fuente viva post-cutover.
3. No aceptar nuevas rutas `GET` que llamen `writeDb(db)` salvo decision documentada.
4. No agregar mas escrituras de auditoria por EventSource connect/disconnect sin escritura granular.
5. Toda ruta que toque dinero, ordenes, jobs, sesiones o seguridad debe migrarse hacia escritura transaccional por tabla antes de ampliar funcionalidad.
6. Si una ruta falla por guard destructivo, no rehidratar desde snapshot viejo como primera reaccion. Primero identificar que snapshot recibio `writeDb(db)`.

## Orden recomendado de remediacion

1. **Audit/event write path granular**
   - Convertir `audit_events` a append-only transaccional.
   - Quitar `writeDb(db)` de SSE connect/disconnect y GET auditables.
   - Impacto: reduce ruido, latencia y carreras sin tocar logica FRP principal.

2. **FRP core transaccional**
   - Migrar payment-review, take/take-next, finalize, cancel y review a updates atomicos.
   - Impacto: protege dinero, jobs y estado cliente-operador.

3. **Portal order core transaccional**
   - Migrar create-order, proof upload, notify-connected, item-ready, cancel/abort y price-decision.
   - Impacto: protege el flujo cliente completo.

4. **Auth/session/device transaccional**
   - Migrar login/logout/register/verify/reset/admin device approval.
   - Impacto: reduce riesgo de bloqueo y estado de sesion inconsistente.

5. **Admin comercial y cierres**
   - Migrar pricing, providers, ledger, daily close, clients/tickets.
   - Impacto: mejora estabilidad financiera/operativa.

## Siguiente paso unico

Antes de nuevos features, ejecutar el paso 1:

```text
disenar e implementar escritura granular append-only para audit_events y sacar writeDb(db) de SSE/GET auditables
```

Razon:

- es el corte menos invasivo;
- reduce carga y ruido;
- ataca el punto mas frecuente;
- no cambia la logica de negocio FRP validada en produccion.
