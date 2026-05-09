# Paso 2.A - Auditoria flujo guest sin registro

Fecha: 2026-05-08  
Repo: `raugsm/miweb`  
Alcance: auditoria solamente. No modifica codigo, migraciones, tests ni auth B.3.

## 1. Flujo actual del cliente registrado

### Boot de pantalla

| Paso | Ruta / archivo | Handler / codigo | DB / tablas | Datos requeridos |
| --- | --- | --- | --- | --- |
| Carga inicial | `public/portal-modules/session.js:6` | `loadSession()` llama `GET /api/portal/session` y `GET /api/portal/active-technician` | via backend | Cookie `ariad_customer_session` si existe; cookie `ariad_customer_device` |
| Render auth/app | `public/portal-modules/auth-forms.js:173` | `renderCustomer()` oculta `#appPanel` si no hay `customer.user && customer.client` | no DB | Estado frontend `state.customer` |
| Catalogo | `GET /api/portal/catalog`, `server/portal/portal-routes.js:185` | Devuelve `publicPortalCatalog(db)` | lee pricing, metodos de pago, exchange rates, eligibility hints | Ninguno; publico |
| Sesion cliente | `GET /api/portal/session`, `server/portal/portal-routes.js:195` | Legacy: `getCurrentCustomerContext()` + `publicCustomerState()` + `publicPortalCatalog()` | `customer_sessions`, `customer_users`, `customer_clients`, `customer_devices`, `customer_orders`, `customer_order_items`, `frp_orders`, `frp_jobs`, pricing/config | Cookie sesion cliente; device cookie |
| Tecnico activo | `GET /api/portal/active-technician`, `server/portal/portal-routes.js:190` | Devuelve `publicActiveTechnician` | `active_technician_state` via snapshot | Ninguno |

### Login / registro

| Paso | Ruta | Handler | DB / tablas | Datos requeridos |
| --- | --- | --- | --- | --- |
| Login | `POST /api/portal/login`, `server/portal/portal-routes.js:412` | Con flag B.3=0 usa `readDb()`, `enforcePortalRateLimit`, busca `customerUsers`, crea `customerSessions`, audita y `writeDb(db)`. Con flag=1 usa `customerLoginAttempt` granular. | Legacy: `portal_rate_limits`, `customer_users`, `customer_clients`, `customer_devices`, `customer_sessions`, `audit_events`. Granular: `server/db/postgres-auth.js`. | email + password |
| Registro | `POST /api/portal/register`, `server/portal/portal-routes.js:266` | Valida nombre/email/password/WhatsApp, crea `customer_client`, `customer_user`, device autorizado, benefit default, sesion y token de email. | `customer_clients`, `customer_users`, `customer_devices`, `customer_device_authorizations`, `customer_benefits`, `customer_sessions`, `customer_email_verification_tokens`, `audit_events` | nombre, email, password, WhatsApp E.164, pais |
| Verificacion email | `POST /api/portal/verify-email`, `server/portal/portal-routes.js:232` | Marca token usado, cliente/user verificado, reconcilia master link. | `customer_email_verification_tokens`, `customer_users`, `customer_clients`, `client_links`, `master_clients`, `audit_events` | token |
| Reenvio email | `POST /api/portal/resend-verification`, `server/portal/portal-routes.js:381` | Requiere customer actual; rate limit + nuevo token. | `portal_rate_limits`, `customer_email_verification_tokens`, `audit_events` | sesion cliente |
| Logout | `POST /api/portal/logout`, `server/portal/portal-routes.js:512` | Legacy elimina `customerSessions`; granular borra por token hash. | `customer_sessions` | cookie sesion |

### Crear orden, pagar y recibir codigo

| Paso | Ruta | Handler | DB / tablas | Datos requeridos |
| --- | --- | --- | --- | --- |
| Crear orden con comprobante | `POST /api/portal/orders/frp`, `server/portal/portal-routes.js:634` | Requiere `getCurrentCustomerContext()` y `customerEmailIsVerified()`. Valida rate limit, Turnstile, metodo de pago, elegibilidad, pricing. Crea request/order/items, crea FRP order/jobs via `createFrpOrderFromPortal()`, adjunta proofs si vienen. | `customer_requests`, `customer_orders`, `customer_order_items`, `frp_orders`, `frp_jobs`, `internal_clients`, `client_links`, `master_clients`, `customer_benefits`, `stored_files`, `payment_proofs`, `portal_rate_limits`, `audit_events` | sesion cliente verificada, `quantity`, `paymentMethod`, `items`, optional `paymentProofs` |
| Crear FRP interno | `server.js:3540` | `createFrpOrderFromPortal(db, customerClient, customerOrder, customerItems)` crea/encuentra `internal_client`, `frp_order`, `frp_jobs`, enlaza `portalOrderId`. | `internal_clients`, `frp_orders`, `frp_jobs`, `client_links`, `master_clients` | `customerClient` existente |
| Subir/re-subir comprobante | `PATCH /api/portal/orders/:id/payment-proof`, `server/portal/portal-routes.js:1340` | Requiere sesion; valida rate limit, duplicados y tipo/tamano; actualiza order/frpOrder a revision. | `customer_orders`, `frp_orders`, `stored_files`, `payment_proofs`, `audit_events` | sesion cliente, order del cliente, proof JPG/PNG/WebP/PDF |
| Consultar orden | `GET /api/portal/orders/:id`, `server/portal/portal-routes.js:935` | Solo owner por `order.clientId === context.client.id`. | `customer_orders`, `customer_order_items`, `frp_orders`, `frp_jobs` | sesion cliente |
| Lista / realtime | `GET /api/portal/orders`, `server/portal/portal-routes.js:519`; `GET /api/portal/orders/events`, `server/portal/portal-routes.js:535` | Lista y SSE por cliente. | mismas tablas de orden; audit en stream | sesion cliente |
| Codigo visible | `server/portal/serializers.js:272` | `publicCustomerOrder()` deriva `shortCode` (`ARD-0000`) desde `frpOrder/code`. | `customer_orders`, `customer_order_items`, `frp_orders`, `frp_jobs` | order enlazada a `frp_order` |
| Descargar Redirector | `public/portal.html:294` | Link estatico `/downloads/usbredirector-customer-module.exe`. | no DB | Ninguno una vez visible en panel |
| Recibo final | `GET /api/portal/orders/:id/comprobante.pdf`, `server/portal/portal-routes.js:1298` | Solo owner; requiere public status `FINALIZADO`. | `customer_orders`, `customer_order_items`, `frp_jobs`, `customer_clients` | sesion cliente |

Observacion importante: el frontend actual esta auth-gated. `renderCustomer()` no muestra `#appPanel` si no hay user/client, y `startOrdersLive()` tambien exige usuario y cliente (`public/portal-modules/live-orders.js:46`). Guest requiere un modo de render separado, no solo quitar el login.

## 2. Pricing actual en codigo

Hechos:

- El costo unitario viene de `pricingConfig.frpPricing.providers`, normalizado en `server/frp/pricing.js`. Default actual: provider `krypto`, `fixedCostUsdt: 23.5` (`server/frp/pricing.js:28`), no 3.20.
- La ganancia objetivo vive como `targetMarginUsdt`, default `1` (`server/frp/pricing.js:14`) y se usa en `frpCurrentPricing()` (`server/frp/pricing.js:129`): `unitPrice = internalCostUsdt + targetMargin`.
- El calculo publico registrado esta en `portalFrpPriceSuggestion()` (`server.js:1084`), no en un modulo separado. Este helper decide precio base, beneficios por volumen/mensual/VIP y total.
- El frontend duplica parte de la estimacion en `public/portal-modules/frp.js:60` (`estimatePortalPrice()`), usando `state.catalog.services[0].baseUnitPrice`, tiers y beneficios.
- Los tiers de volumen siguen existiendo en `server/config/catalog.js:233`. Hoy descuentan sobre margen, con piso `frpPublicVolumeFloorMarginUsdt = 0.60` (`server/config/catalog.js:232`).
- No existe fee fijo `0.30` por orden ni `0.30 / N` como componente separado.
- No existe `guest_surcharge`.

Contradiccion detectada en la formula aprobada:

- El texto dice `costo_operario_total = 0.30 / N`.
- Los ejemplos dados solo cuadran si el fee total por orden es `0.30`, no `0.30 / N`.
- Ejemplo N=3: `(3.20*3) + (1*3) + 0.30 = 12.90`; con `0.30/N` daria `12.70`.

Recomendacion para Paso 2.B: implementar segun los ejemplos, es decir fee fijo total por orden `0.30`, y documentarlo como `operatorFeePerOrderUsdt`. Si se implementa literalmente `0.30 / N`, los totales no coincidiran con la decision de producto.

## 3. Esquema de ordenes y clientes

Tablas principales en `migrations/001_initial_postgres.sql`:

- `customer_clients` (`migrations/001_initial_postgres.sql:125`):
  - `id`
  - `master_client_id`
  - `name`
  - `whatsapp`
  - `country`
  - `whatsapp_country_iso`
  - `whatsapp_detected_country`
  - `status`
  - `primary_email`
  - `email_verified_at`
- `customer_users` (`migrations/001_initial_postgres.sql:144`):
  - `client_id uuid not null references customer_clients(id)`
  - `email text not null unique`
  - `password_hash`
  - `role`
  - `active`
- `customer_orders` (`migrations/001_initial_postgres.sql:374`):
  - `client_id uuid not null references customer_clients(id)`
  - `user_id uuid references customer_users(id)`
  - `code`, `request_id`, `service_code`, `quantity`, `unit_price_usdt`, `total_price_usdt`, `pricing_snapshot`, `payment_method`, `public_status`, `frp_order_id`, `internal_client_id`, `note`, timestamps.
  - index por cliente: `customer_orders_client_idx` (`migrations/001_initial_postgres.sql:405`).
- `customer_order_items` (`migrations/001_initial_postgres.sql:408`):
  - `client_id uuid not null references customer_clients(id)`
  - `order_id uuid not null references customer_orders(id)`
  - `frp_order_id`, `frp_job_id`, `sequence`, `status`, `eligibility_*`.
- `frp_orders` (`migrations/001_initial_postgres.sql:486`):
  - usa `internal_clients`, pero tambien guarda `client_whatsapp`, `portal_order_id`, `source`.
- `stored_files` y `payment_proofs` (`migrations/001_initial_postgres.sql:452`, `:470`) guardan comprobantes normalizados por el plan Postgres (`server/db/postgres-legacy-plan.js:368`, `:1019`, `:1024`).

Relacion actual:

- Una orden de cliente requiere `customer_orders.client_id`.
- Cada item tambien requiere `customer_order_items.client_id`.
- La orden operativa FRP se enlaza por `frp_orders.portal_order_id -> customer_orders.id`.
- El panel operador consume `frp_orders`/`frp_jobs`; el serializer resuelve `portalOrder` para VIP/codigos (`server/frp/serializers.js:108`).

WhatsApp:

- Existe en `customer_clients.whatsapp`, no en `customer_users`.
- Existe tambien en `frp_orders.client_whatsapp`.
- Backend ya normaliza WhatsApp con `libphonenumber-js/max` (`server.js:10`) y `normalizePortalWhatsapp()` (`server.js:3671`) devuelve E.164 (`parsed.number`).
- `phoneKey()` (`server.js:3795`) compara por digitos.

## 4. Campo faltante para guest

El requisito "orden sin customer_id valido pero con WhatsApp" choca con el schema actual: `customer_orders.client_id` y `customer_order_items.client_id` son `not null` y referencian `customer_clients`. No conviene hacerlos nullable sin un redisenio mayor.

### Opcion A - `guest_whatsapp` directo en `customer_orders`

Pros:

- Query de claim directa por `guest_whatsapp`.
- Parece simple en superficie.

Contras:

- No resuelve `customer_orders.client_id not null`.
- No resuelve `customer_order_items.client_id not null`.
- Duplica WhatsApp en `customer_clients`, `customer_orders`, `frp_orders`.
- Obliga a tocar serializers que hoy filtran por `clientId`.
- Para estado guest igual haria falta token o sesion guest para no exponer orden por UUID/codigo.

Veredicto: no es suficiente sola. Solo sirve como metadata adicional si igualmente se crea cliente sintetico.

### Opcion B - tabla `guest_orders` separada

Pros:

- Aisla guest del modelo registrado.
- Permite schema exacto para WhatsApp + token.

Contras:

- Duplica flujo de ordenes, comprobantes, pricing, SSE, recibo y operator bridge.
- El panel operador hoy vive de `frp_orders` y `portalOrderId`; habria que crear adaptadores paralelos.
- La asociacion post-registro seria migracion entre dominios, no solo update.

Veredicto: alto costo y alto riesgo. No recomendable para MVP.

### Opcion C - `customer_client` sintetico guest

Idea:

- Crear un `customer_clients` para guest con `whatsapp` E.164, `country` detectado, `primary_email=''` y sin `customer_user`.
- Crear ordenes normales con `customer_orders.client_id` apuntando a ese cliente.
- Marcarlo como guest con metadata explicita (`accountType: "guest"` en `legacy_json` o, preferible en Paso 2.B, columna nueva `account_type`).
- Guardar token de acceso guest para consultar estado sin login.

Pros:

- Preserva FKs y la mayor parte del pipeline existente.
- Reutiliza `customer_orders`, `customer_order_items`, `frp_orders`, `frp_jobs`, comprobantes, recibo y cola operador.
- Claim post-registro es un update/merge de cliente, no una migracion entre modelos.
- El operador procesa igual porque `frp_orders` ya contiene nombre/WhatsApp/source.

Contras:

- Requiere distinguir guest de registrado de forma clara.
- Hay que evitar que beneficios/VIP/email verification se apliquen accidentalmente a guest.
- El estado actual de `customer_clients.status` no tiene `GUEST`; usar `REGISTRADO_NO_VERIFICADO` como guest seria semanticamente sucio.

Veredicto: recomendada.

### Opcion D - identidad/contacto separado (`order_contacts`)

Pros:

- Modelo mas limpio a largo plazo: una orden puede tener `customer_client_id` o `contact_id`.

Contras:

- Requiere reescribir mas consultas y serializers que la opcion C.
- No compra suficiente valor para Paso 2.

Veredicto: no para este paso.

Recomendacion: Opcion C. En Paso 2.B definir si el marcador guest sera columna (`customer_clients.account_type`) o `legacy_json`. Como decision de arquitectura, prefiero columna porque el claim y filtros futuros no deberian depender de JSON.

## 5. Rutas nuevas propuestas

Todas deben estar detras de `PORTAL_GUEST_ENABLED`.

| Ruta | Tipo | Hace | Equivalente registrado |
| --- | --- | --- | --- |
| `GET /api/portal/guest/state` | nueva | Devuelve catalogo guest, pricing guest, estado de orden guest si hay token/cookie. | `GET /api/portal/session` |
| `POST /api/portal/guest/orders` | nueva | Crea orden guest con WhatsApp, cantidad, metodo de pago, items y opcionalmente proofs en una request. | `POST /api/portal/orders/frp` |
| `PATCH /api/portal/guest/orders/:id/payment-proof` | nueva | Re-subida de comprobante guest, con token guest. | `PATCH /api/portal/orders/:id/payment-proof` |
| `GET /api/portal/guest/orders/:id` | nueva | Consulta estado de orden guest con token/cookie. | `GET /api/portal/orders/:id` |
| `GET /api/portal/guest/orders/:id/events` | nueva | SSE por orden guest. Mejor que stream global por cliente porque no hay sesion registrada. | `GET /api/portal/orders/events` |
| `POST /api/portal/guest/claim-preview` | nueva o integrada en session | Devuelve candidatas por WhatsApp para usuario registrado. | no existe |
| `POST /api/portal/guest/claim` | nueva | Asocia ordenes guest confirmadas a cuenta registrada. | no existe |
| `GET /api/portal/guest/orders/:id/comprobante.pdf` | nueva | Recibo final con token guest. | `GET /api/portal/orders/:id/comprobante.pdf` |

Nota de seguridad: no basta con `:id`. La consulta guest debe exigir token opaco guardado como hash. Sin token, cualquiera con UUID/codigo podria consultar estado o descargar recibo.

## 6. Asociacion post-registro

Recomendacion de flujo:

1. Guest crea orden con WhatsApp E.164.
2. Backend crea/reutiliza `customer_client` guest por `phoneKey(whatsapp)`.
3. Al registrarse o al primer `GET /api/portal/session`, si el cliente registrado tiene el mismo WhatsApp, backend devuelve `guestClaimCandidates` con conteo y codigos publicos, no con datos sensibles.
4. Frontend muestra confirmacion.
5. `POST /api/portal/guest/claim` transfiere/une ordenes.

Query conceptual para encontrar candidatas:

```sql
select o.*
from ariad.customer_orders o
join ariad.customer_clients c on c.id = o.client_id
where regexp_replace(c.whatsapp, '\\D', '', 'g') = regexp_replace($1, '\\D', '', 'g')
  and c.id <> $2
  and coalesce(c.legacy_json->>'accountType', '') = 'guest'
order by o.created_at desc;
```

Si se agrega columna `account_type`, reemplazar el filtro JSON por `c.account_type = 'guest'`.

Procedimiento de transferencia:

- Opcion preferida si el guest client solo tiene ordenes del mismo WhatsApp: fusionar el guest client dentro del client registrado:
  - actualizar `customer_orders.clientId/client_id`;
  - actualizar `customer_order_items.clientId/client_id`;
  - actualizar `customer_requests.clientId/userId` si existen;
  - actualizar `customer_benefits` o mover beneficios al master si aplica;
  - mantener `frp_orders.portalOrderId`; no hace falta recrear FRP orders/jobs;
  - actualizar `client_links` / `master_clients` via helpers existentes.
- Alternativa cuando el usuario se registra despues y aun no tiene ordenes: crear el `customer_user` directamente sobre el `customer_client` guest existente. Es mas limpio, pero requiere cuidado si hay multiples guest clients con el mismo WhatsApp.

Casos edge:

- Multiples ordenes con el mismo WhatsApp: deben mostrarse juntas y confirmarse en lote.
- Multiples guest clients con mismo WhatsApp: consolidar por `phoneKey`.
- Cliente registrado antiguo con el mismo WhatsApp: mostrar claim tambien en login/session, no solo en registro nuevo.
- WhatsApp mal normalizado historico: usar `phoneKey()` como fallback, pero guardar E.164 nuevo.
- Sin SMS/WhatsApp API: el claim es de buena fe; no debe mostrar datos sensibles antes de confirmar.

## 7. Normalizacion de WhatsApp internacional

Estado actual:

- Backend ya usa `libphonenumber-js/max` (`server.js:10`).
- `normalizePortalWhatsapp()` exige `+`, valida E.164 basico y usa `parsePhoneNumberFromString()` (`server.js:3671`).
- Guarda `parsed.number`, que es E.164.
- Frontend hace validacion ligera en `public/portal-modules/auth-forms.js` y `events.js`, apoyada por `portalPhoneCountryHints`.

Recomendacion:

- Formato canonico de almacenamiento: E.164, ejemplo `+51987654321`.
- Backend: reutilizar `normalizePortalWhatsapp()` para guest. No crear validador paralelo.
- Frontend: puede seguir con validacion ligera para UX, pero backend debe ser autoridad. Si se quiere validar mejor en cliente, reutilizar `libphonenumber-js` ya presente en `package.json`; no agregar otra libreria.
- Matching de claim: `phoneKey(E.164)` para tolerar separadores, pero persistir E.164.

## 8. Feature flag

Propuesta:

```text
PORTAL_GUEST_ENABLED=0
```

Comportamiento:

- Default `0`.
- Con `0`: rutas `/api/portal/guest/*` devuelven `404`. La UI principal sigue como hoy.
- Con `1`: UI muestra entrada "procesar sin cuenta" y rutas guest quedan activas.
- No debe interactuar con `POSTGRES_AUTH_GRANULAR_CUSTOMER` ni `POSTGRES_AUTH_GRANULAR_OPERATOR`. Son banderas de auth; guest es producto/flujo.

Recomendacion de rollout: deploy con flag `0`, pruebas smoke, activar en Render solo cuando Bryams valide UI local.

## 9. Impacto en panel operario

Si se usa cliente sintetico guest:

- La orden operativa aparece igual en `frp_orders`/`frp_jobs`.
- `publicFrpState()` ya devuelve `operatorOrders` desde `frp_orders` (`server/frp/serializers.js:227`).
- La tarjeta operador ya muestra `clientName`, `clientWhatsapp`, `country`, `quantity`, payment status y jobs (`server/frp/serializers.js:108`).
- El flujo de aprobar pago, tomar job, finalizar, cancelar y review no necesita distinguir guest para funcionar.

Sorpresas:

- El panel operador podria mostrar `customerStatus` vacio o `REGISTRADO_NO_VERIFICADO` si no hay marcador guest claro.
- Si el guest no tiene nombre, hay que decidir label: por ejemplo `Guest +51987654321` o `Cliente WhatsApp +51987654321`.
- Notificaciones manuales WhatsApp son viables porque `frp_orders.clientWhatsapp` ya existe.
- No hay diferencia tecnica en `DONE`/finalizar; la comunicacion al cliente depende del SSE guest nuevo o de WhatsApp manual.

Recomendacion: no tocar panel operador en Paso 2 salvo que sea necesario para mostrar nombre/WhatsApp legible. Si se toca, limitarlo a una etiqueta visual guest.

## 10. Cambios en pricing

La formula confirmada no esta implementada.

Lugares que requeriran actualizacion:

- Backend central:
  - `server.js:1084` `portalFrpPriceSuggestion()`.
  - `server/frp/pricing.js:129` `frpCurrentPricing()` si se decide que el fee/surcharge pertenece al pricing base.
  - `server/portal/serializers.js:485` `publicPortalCatalog()` para exponer componentes de pricing al frontend.
- Frontend:
  - `public/portal-modules/frp.js:60` `estimatePortalPrice()`.
  - `public/portal-modules/payments.js:264` usa la estimacion para total local.
- Persistencia:
  - `pricingSnapshot` en `customer_orders` y `frp_orders` debe guardar componentes: cost, margin, operator fee, guest surcharge, quantity, total.

Recomendacion de configuracion:

- No hardcodear `guest_surcharge`.
- Preferible: config de negocio en DB dentro de pricing policy, con campos como:
  - `targetMarginUsdt` actual: 1.00.
  - `operatorFeePerOrderUsdt`: 0.30.
  - `guestSurchargePerEquipmentUsdt`: 0.20.
- Si se quiere evitar migracion en Paso 2.B, se puede usar env vars temporales:
  - `PORTAL_OPERATOR_FEE_USDT=0.30`
  - `PORTAL_GUEST_SURCHARGE_PER_EQUIPMENT_USDT=0.20`
  Pero esto no es ideal porque Bryams ajusta negocio desde panel, no desde deploy config.

Decision que debe quedar explicita en Paso 2.B:

- Seguir ejemplos aprobados: fee total fijo por orden `0.30`, no `0.30/N` como total.
- Si se quiere mostrar fee diluido por equipo, mostrarlo solo como breakdown: `0.30 / N` por equipo, pero sumar `0.30` al total.

## 11. Riesgos detectados

1. **DB no acepta orden sin cliente.** `customer_orders.client_id` y `customer_order_items.client_id` son `not null`. La opcion "orden guest sin customer_id" no es compatible con el schema actual.

2. **Email verification bloquea la creacion registrada.** `POST /api/portal/orders/frp` corta si `!customerEmailIsVerified(context.client)` (`server/portal/portal-routes.js:634`). Guest necesita ruta separada que no dependa de email.

3. **Frontend auth-gated.** El panel principal no se renderiza sin user/client. Guest necesita estado UI propio (`guestCustomer` o `guestOrder`) y no debe contaminar `state.customer` registrado sin cuidado.

4. **SSE actual es por cliente registrado.** `GET /api/portal/orders/events` exige contexto cliente. Guest necesita SSE por orden + token o polling fallback.

5. **Pricing duplicado backend/frontend.** Hoy el frontend estima y el backend calcula. Cualquier formula guest debe centralizarse y el frontend solo reflejar catalog/snapshot para evitar montos distintos.

6. **Formula aprobada tiene contradiccion textual.** Los ejemplos implican fee total fijo `0.30`; el texto `0.30/N` como total da otros numeros.

7. **Claim sin verificacion WhatsApp es buena fe.** Producto lo acepta, pero el sistema no debe revelar detalles de orden antes de confirmar; mostrar solo conteo/codigos publicos.

8. **Riesgo de mezclar con auth B.3.** Paso 2 debe evitar tocar `POSTGRES_AUTH_GRANULAR_*`. Guest puede tener su propia identidad/token sin modificar login/sesiones registradas.

## Recomendacion ejecutiva para Paso 2.B

Implementar guest sobre `customer_client` sintetico con WhatsApp E.164 y token de acceso por orden. Mantener `customer_orders` y `frp_orders` como fuente unica de ordenes para que el operador procese igual. Agregar `PORTAL_GUEST_ENABLED` default `0`. Antes de codificar, resolver la contradiccion del fee: usar fee total fijo `0.30` porque es lo unico que cuadra con los ejemplos aprobados.
