# Paso 2.B - Plan de implementacion guest sin registro

Fecha: 2026-05-08  
Repo: `raugsm/miweb`  
Alcance: plan solamente. No modifica codigo, migraciones ni tests.

## 0. Decisiones base y tabla canonica de pricing

Decisiones aceptadas para este plan:

- Guest puede crear y procesar orden completa sin login.
- Guest usa `customer_client` sintetico con `account_type='guest'`.
- La orden sigue viviendo en `customer_orders`, `customer_order_items`, `frp_orders` y `frp_jobs`.
- `PORTAL_GUEST_ENABLED` controla activacion del flujo guest y default debe ser `0`.
- Pricing nuevo:

```text
precio_total = (costo_unitario * N)
             + (ganancia_por_equipo * N)
             + fee_operario_orden
             + (guest_surcharge * N si guest)

costo_unitario = frp_pricing_providers activo
ganancia_por_equipo = frp_pricing_policy.target_margin_usdt = 1.00
fee_operario_orden = PORTAL_OPERATOR_FEE_USDT = 0.30
guest_surcharge = PORTAL_GUEST_SURCHARGE_PER_EQUIPMENT_USDT = 0.20
N = 1..10
```

Tabla canonica oficial para Paso 2.C con `costo_unitario=3.00`:

| Tipo | N=1 | N=2 | N=3 | N=5 | N=10 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Registrado | 4.30 | 8.30 | 12.30 | 20.30 | 40.30 |
| Guest | 4.50 | 8.70 | 12.90 | 21.30 | 42.30 |

Ejemplos:

- Registrado N=1: `3.00 + 1.00 + 0.30 = 4.30`.
- Registrado N=10: `(3.00*10) + (1.00*10) + 0.30 = 40.30`.
- Guest N=1: `3.00 + 1.00 + 0.30 + 0.20 = 4.50`.
- Guest N=10: `(3.00*10) + (1.00*10) + 0.30 + (0.20*10) = 42.30`.

## 1. Esquema SQL

### 1.1 Migracion nueva: `customer_clients.account_type`

Archivo propuesto para Paso 2.C.1:

```text
migrations/004_portal_guest_flow.sql
```

DDL propuesto:

```sql
alter table customer_clients
  add column if not exists account_type text not null default 'registered';

do $$
begin
  alter table customer_clients
    add constraint customer_clients_account_type_chk
    check (account_type in ('registered', 'guest'))
    not valid;
exception
  when duplicate_object then null;
end $$;

alter table customer_clients
  validate constraint customer_clients_account_type_chk;

create index if not exists customer_clients_account_type_whatsapp_idx
  on customer_clients(account_type, whatsapp);
```

Notas:

- `default 'registered'` preserva todos los clientes existentes.
- No se cambia `customer_clients.status`; ese campo sigue representando estado de cuenta/cliente.
- `account_type` es el discriminador de producto: registrado vs guest.
- La columna debe agregarse tambien al mapping de Postgres legacy:
  - `server/db/postgres-legacy-read.js`
  - `server/db/postgres-legacy-plan.js`
  - serializers que lean customer clients.

### 1.2 Migracion nueva: tokens guest

Decision: tabla nueva `guest_session_tokens`, no columna directa en `customer_orders`.

Razones:

- Una orden puede necesitar rotacion/revocacion de token sin tocar la orden.
- Permite varios tokens temporales si en el futuro hay recuperacion o reenvio manual.
- Evita guardar token/hash en `legacy_json`.
- Permite expiracion y auditoria por token.

DDL propuesto:

```sql
create table if not exists guest_session_tokens (
  id uuid primary key,
  order_id uuid not null references customer_orders(id) on delete cascade,
  client_id uuid not null references customer_clients(id) on delete cascade,
  token_hash text not null unique,
  token_hint text not null default '',
  scope text not null default 'order',
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null,
  legacy_json jsonb not null default '{}'::jsonb,
  check (scope in ('order'))
);

create index if not exists guest_session_tokens_order_idx
  on guest_session_tokens(order_id);

create index if not exists guest_session_tokens_client_idx
  on guest_session_tokens(client_id);

create index if not exists guest_session_tokens_active_expiry_idx
  on guest_session_tokens(expires_at)
  where revoked_at is null;
```

Semantica:

- `token_hash`: SHA-256 del token opaco. Nunca guardar token raw.
- `token_hint`: ultimos 4-6 chars no sensibles para soporte interno, opcional.
- `expires_at`: recomendado 90 dias para MVP. Ajustable despues si Bryams quiere.
- `revoked_at`: se llena al claim exitoso o si se rota link.

### 1.3 Cambio de `frp_pricing_policy.target_margin_usdt`

No debe ser migracion de schema. Es configuracion de negocio.

Procedimiento recomendado:

1. Antes o durante deploy de Paso 2.C, Bryams ajusta desde panel operador:
   - `Costos FRP`
   - `Ganancia objetivo`
   - valor `1.00`
2. Alternativa SQL directa si el panel no esta disponible:

```sql
update frp_pricing_policy
set
  target_margin_usdt = 1.00,
  updated_at = now()
where id = 'current';
```

No usar variable de entorno para `target_margin_usdt` porque ya vive en DB y el panel lo administra.

### 1.4 Otras migraciones

No se requieren mas migraciones para MVP si:

- `account_type` se guarda en `customer_clients`.
- Los tokens guest viven en `guest_session_tokens`.
- El desglose de pricing se guarda en `pricing_snapshot` JSONB existente.

No se agrega columna `guest_whatsapp` en `customer_orders`. El WhatsApp vive en `customer_clients.whatsapp` y se copia a `frp_orders.client_whatsapp` como hoy.

## 2. Cambios de pricing en codigo

### 2.1 `server/frp/pricing.js:129` - `frpCurrentPricing()`

Objetivo: dejar de tratar `targetMarginUsdt` como precio final completo y exponer componentes.

Cambios propuestos:

- Agregar lectura segura de env:
  - `PORTAL_OPERATOR_FEE_USDT`, default `0.30`.
  - `PORTAL_GUEST_SURCHARGE_PER_EQUIPMENT_USDT`, default `0.20`.
- Mantener compatibilidad:
  - `pricing.unitPrice` sigue siendo `internalCostUsdt + targetMarginUsdt`.
  - Nuevo campo `baseUnitPriceUsdt` igual a `unitPrice`.
  - Nuevo campo `operatorFeePerOrderUsdt`.
  - Nuevo campo `guestSurchargePerEquipmentUsdt`.
  - Nuevo campo `targetMarginUsdt`.

No aplicar aqui cantidad ni guest. `frpCurrentPricing()` no conoce `N`.

Pseudo-cambio:

```js
const internalCostUsdt = frpProviderCostUsdt(provider);
const targetMargin = moneyNumber(config.policy.targetMarginUsdt);
const baseUnitPriceUsdt = moneyNumber(internalCostUsdt + targetMargin);
const operatorFeePerOrderUsdt = envMoney("PORTAL_OPERATOR_FEE_USDT", 0.30);
const guestSurchargePerEquipmentUsdt = envMoney("PORTAL_GUEST_SURCHARGE_PER_EQUIPMENT_USDT", 0.20);

return {
  ...,
  internalCostUsdt,
  targetMarginUsdt: targetMargin,
  unitPrice: baseUnitPriceUsdt,
  baseUnitPriceUsdt,
  operatorFeePerOrderUsdt,
  guestSurchargePerEquipmentUsdt,
};
```

Afecta ordenes existentes: no. Las ordenes existentes conservan `unitPrice`, `totalPrice` y `pricingSnapshot` persistidos.

### 2.2 `server.js:1084` - `portalFrpPriceSuggestion()`

Objetivo: calcular total final registrado/guest.

Firma propuesta:

```js
function portalFrpPriceSuggestion(
  db,
  clientId,
  quantity,
  canUseBenefits,
  benefit,
  masterClientId = "",
  options = {}
)
```

`options`:

```js
{
  isGuest: false,
  disableBenefits: false
}
```

Formula nueva:

```js
const equipmentSubtotal = selected.unitPrice * safeQuantity;
const operatorFeeTotal = pricing.operatorFeePerOrderUsdt;
const guestSurchargeTotal = options.isGuest
  ? pricing.guestSurchargePerEquipmentUsdt * safeQuantity
  : 0;
const total = equipmentSubtotal + operatorFeeTotal + guestSurchargeTotal;
```

Recomendacion:

- Para guest: `disableBenefits=true`, sin descuentos VIP/volumen/mensual.
- Para registrado: aplicar la decision de producto. Si la formula nueva debe reemplazar por completo los tiers, tambien poner `disableBenefits=true` para registrados. Si Bryams quiere preservar VIP/benefits, documentarlo como excepcion de pricing.

Riesgo:

- El codigo actual tiene `quantityTier`, `monthlyTier`, `goalTier`, `vipTier`. La formula nueva no menciona esos beneficios. Paso 2.C debe decidir si se desactivan para FRP Express o se mantienen solo para clientes VIP. No improvisar.

Afecta ordenes existentes: no, solo nuevas ordenes.

### 2.3 `server/portal/serializers.js:485` - `publicPortalCatalog()`

Objetivo: exponer al frontend el breakdown, no solo `baseUnitPrice`.

Campos nuevos sugeridos en `catalog.pricing`:

```js
pricing: {
  version: "portal-pricing-v2",
  baseUnitPriceUsdt,
  internalCostUsdt, // solo si no es sensible para cliente; si no, omitir
  targetMarginUsdt,
  operatorFeePerOrderUsdt,
  guestSurchargePerEquipmentUsdt,
  registeredExample: { quantity: 1, totalUsdt: 4.30 },
  guestExample: { quantity: 1, totalUsdt: 4.50 }
}
```

Para cliente publico, si se decide no exponer costo interno, exponer solo:

- `registeredUnitBaseUsdt`
- `operatorFeePerOrderUsdt`
- `guestSurchargePerEquipmentUsdt`
- `quantityMin`
- `quantityMax`

### 2.4 `public/portal-modules/frp.js:60` - `estimatePortalPrice()`

Objetivo: que el frontend estime igual que backend.

Cambios:

- Recibir `isGuest` o leer `state.guest`.
- Usar `catalog.pricing` si existe.
- Total:

```js
const base = unitBase * quantity;
const operatorFee = pricing.operatorFeePerOrderUsdt;
const guestSurcharge = isGuest
  ? pricing.guestSurchargePerEquipmentUsdt * quantity
  : 0;
return base + operatorFee + guestSurcharge;
```

Restriccion:

- El backend sigue siendo autoridad. El frontend solo muestra estimacion.
- Si no hay `catalog.pricing`, caer al comportamiento actual para compatibilidad.

### 2.5 `public/portal-modules/payments.js:264`

Objetivo: que el resumen de pago y monto exacto usen el mismo total que `estimatePortalPrice()`.

Cambios:

- Recibir `isGuest`.
- Mostrar desglose:
  - `N equipos`
  - `Servicio`
  - `Fee operativo`
  - `Recargo guest`, solo si guest
  - `Total`

### 2.6 `pricingSnapshot` nuevo

Guardar en `customer_orders.pricing_snapshot` y `frp_orders.pricing_snapshot`:

```json
{
  "version": "portal-pricing-v2",
  "accountType": "registered",
  "providerId": "krypto",
  "providerName": "Krypto",
  "costMode": "FIXED_USDT",
  "internalCostUsdt": 3.00,
  "targetMarginUsdt": 1.00,
  "baseUnitPriceUsdt": 4.00,
  "quantity": 1,
  "equipmentSubtotalUsdt": 4.00,
  "operatorFeePerOrderUsdt": 0.30,
  "guestSurchargePerEquipmentUsdt": 0.00,
  "guestSurchargeTotalUsdt": 0.00,
  "totalUsdt": 4.30
}
```

Para guest:

```json
{
  "version": "portal-pricing-v2",
  "accountType": "guest",
  "internalCostUsdt": 3.00,
  "targetMarginUsdt": 1.00,
  "baseUnitPriceUsdt": 4.00,
  "quantity": 1,
  "equipmentSubtotalUsdt": 4.00,
  "operatorFeePerOrderUsdt": 0.30,
  "guestSurchargePerEquipmentUsdt": 0.20,
  "guestSurchargeTotalUsdt": 0.20,
  "totalUsdt": 4.50
}
```

## 3. Modulo `server/portal/guest.js`

Modulo nuevo. No debe tocar auth B.3.

### 3.1 `findOrCreateGuestClient(whatsapp, country, options = {})`

Signatura:

```js
async function findOrCreateGuestClient(client, { whatsapp, country, nowIso })
```

Hace:

- Normaliza WhatsApp fuera o dentro del helper usando la misma regla E.164 del portal.
- Busca `customer_clients.account_type='guest'` por WhatsApp.
- Si no existe, crea cliente guest sintetico.

Queries:

```sql
select *
from customer_clients
where account_type = 'guest'
  and whatsapp = $1
order by created_at asc
limit 1;
```

Para evitar duplicados por doble click/concurrencia:

```sql
select pg_advisory_xact_lock(hashtext('guest-client'), hashtext($1));
```

Insert:

```sql
insert into customer_clients (
  id, master_client_id, name, whatsapp, country,
  whatsapp_country_iso, whatsapp_detected_country,
  status, primary_email, email_verified_at,
  account_type, created_at, updated_at, legacy_json
) values (
  $id, null, $name, $whatsapp, $country,
  $country, $country,
  'REGISTRADO_NO_VERIFICADO', '', null,
  'guest', $now, $now, $legacyJson
)
returning *;
```

Errores:

- WhatsApp invalido: devolver `{ ok:false, status:400, error:"whatsapp_invalid" }`.
- Error DB: log estructurado sin datos sensibles y propagar 500.

### 3.2 `createGuestSessionToken(orderId)`

Signatura:

```js
async function createGuestSessionToken(client, { orderId, clientId, ttlDays = 90, nowIso })
```

Hace:

- Genera token opaco `crypto.randomBytes(32).toString("base64url")`.
- Guarda solo hash SHA-256.
- Retorna token raw solo al caller para cookie/link.

Query:

```sql
insert into guest_session_tokens (
  id, order_id, client_id, token_hash, token_hint,
  scope, expires_at, created_at, legacy_json
) values (
  $id, $orderId, $clientId, $tokenHash, $tokenHint,
  'order', $expiresAt, $now, '{}'::jsonb
)
returning id, order_id, client_id, expires_at;
```

Errores:

- Si `orderId` no existe: 404 o error interno segun caller.
- Si token hash colisiona: regenerar una vez; si repite, 500.

### 3.3 `validateGuestSessionToken(token)`

Signatura:

```js
async function validateGuestSessionToken(client, { token, orderId = null, nowIso })
```

Hace:

- Hashea token.
- Busca token activo.
- Opcionalmente exige `order_id`.
- Devuelve order/client minimos.

Query:

```sql
select
  gst.id as token_id,
  gst.order_id,
  gst.client_id,
  gst.expires_at,
  co.code as order_code,
  cc.whatsapp,
  cc.account_type
from guest_session_tokens gst
join customer_orders co on co.id = gst.order_id
join customer_clients cc on cc.id = gst.client_id
where gst.token_hash = $1
  and ($2::uuid is null or gst.order_id = $2::uuid)
  and gst.revoked_at is null
  and gst.expires_at > $3
  and cc.account_type = 'guest'
limit 1;
```

Touch:

```sql
update guest_session_tokens
set last_seen_at = $now
where id = $tokenId;
```

Errores:

- Token ausente/invalido/expirado: 404 para no revelar existencia de orden.

### 3.4 `generateGuestRecoveryLink(orderId)`

Signatura:

```js
function generateGuestRecoveryLink({ publicBaseUrl, orderCode, token })
```

Formato recomendado:

```text
https://ariadgsm.com/pedido/ARD-0001?t=<token>
```

El server puede servir esa URL como `portal.html` y el frontend lee `t` para llamar `GET /api/portal/guest/orders/:id`.

Errores:

- Si falta `token`, no generar link.
- No loggear URL completa porque contiene token.

### 3.5 `findGuestOrdersForClaimByWhatsapp(whatsapp)`

Signatura:

```js
async function findGuestOrdersForClaimByWhatsapp(client, { whatsapp, limit = 20 })
```

Hace:

- Busca ordenes guest candidatas por WhatsApp exacto E.164.
- Devuelve solo datos publicos: `orderId`, `publicCode`, `createdAt`, `quantity`, `publicStatus`.
- No devuelve comprobantes, payment details, token, token hash ni metadata interna.

Query:

```sql
select
  co.id,
  co.code,
  co.quantity,
  co.public_status,
  co.created_at
from customer_orders co
join customer_clients cc on cc.id = co.client_id
where cc.account_type = 'guest'
  and cc.whatsapp = $1
order by co.created_at desc
limit $2;
```

Errores:

- WhatsApp invalido: retornar lista vacia.
- DB error: log y 500.

### 3.6 `claimGuestOrders(targetClientId, sourceGuestClientIds)`

Signatura:

```js
async function claimGuestOrders(client, {
  targetClientId,
  targetUserId,
  sourceGuestClientIds,
  expectedWhatsapp,
  nowIso,
  actorIpHash
})
```

Hace:

- Requiere usuario registrado logueado.
- Verifica que `targetClientId` exista y `account_type='registered'`.
- Verifica que cada source sea `account_type='guest'` y tenga mismo WhatsApp.
- Transfiere requests, orders, items y revoca tokens.
- Inserta audit `PORTAL_GUEST_CLAIM`.

Queries principales en transaccion:

```sql
select pg_advisory_xact_lock(hashtext('guest-claim'), hashtext($targetClientId));

select *
from customer_clients
where id = $targetClientId
  and account_type = 'registered'
for update;

select *
from customer_clients
where id = any($sourceGuestClientIds::uuid[])
  and account_type = 'guest'
for update;

update customer_requests
set client_id = $targetClientId,
    user_id = $targetUserId,
    updated_at = $now
where client_id = any($sourceGuestClientIds::uuid[]);

update customer_orders
set client_id = $targetClientId,
    user_id = $targetUserId,
    updated_at = $now,
    legacy_json = jsonb_set(
      legacy_json,
      '{guestClaim}',
      jsonb_build_object('claimedAt', $now, 'fromClientIds', $sourceGuestClientIds::text[]),
      true
    )
where client_id = any($sourceGuestClientIds::uuid[]);

update customer_order_items
set client_id = $targetClientId,
    updated_at = $now
where client_id = any($sourceGuestClientIds::uuid[]);

update guest_session_tokens
set revoked_at = $now
where client_id = any($sourceGuestClientIds::uuid[]);
```

Sobre `frp_orders`:

- No es obligatorio cambiar `client_id` porque apunta a `internal_clients`, no a `customer_clients`.
- Si se actualiza algo, limitarlo a `master_client_id` cuando exista en target; no tocar `client_name` ni `client_whatsapp` historicos.

Errores:

- Source no pertenece al mismo WhatsApp: 403.
- Source ya no tiene ordenes pendientes: idempotente, devuelve `claimedCount=0`.
- DB deadlock: reintentar una vez como otros flujos Postgres, no bucles largos.

## 4. Rutas nuevas - pseudo-codigo

Todas las rutas bajo `/api/portal/guest/*` deben llamar primero:

```js
if (!portalGuestEnabled()) return sendJson(res, 404, { error: "not_found" });
```

`portalGuestEnabled()` lee `PORTAL_GUEST_ENABLED` y default es `0`.

### 4.1 `GET /api/portal/guest/state`

Inputs:

- Cookie guest opcional: `ariad_guest_order`.
- Query opcional: `orderId`, `t`.

Validaciones:

- Flag guest.
- Si hay token, validar con `validateGuestSessionToken`.

Pseudo-codigo:

```js
const db = await readDb();
const catalog = publicPortalCatalog(db, { isGuest: true });
const token = tokenFromQueryOrCookie(req);
const order = token ? await loadGuestOrderByToken(token) : null;
return sendJson(res, 200, {
  guest: {
    enabled: true,
    order: order ? publicGuestOrder(order) : null
  },
  catalog
});
```

Response:

```json
{
  "guest": { "enabled": true, "order": null },
  "catalog": {}
}
```

Error:

- Token invalido: no revelar; devolver `order:null` o 404 si ruta consulta orden especifica.

### 4.2 `POST /api/portal/guest/orders`

Inputs:

```json
{
  "whatsapp": "+51987654321",
  "country": "PE",
  "quantity": 1,
  "paymentMethod": "yape-1",
  "items": [{ "model": "", "imei": "", "raw": "" }],
  "paymentProofs": []
}
```

Validaciones:

- Flag guest.
- WhatsApp E.164 valido.
- `quantity` entre 1 y 10.
- Metodo de pago valido por pais.
- Rate limit por IP + phoneKey.
- Turnstile si esta configurado.
- Proofs sanitizados, tipo/tamano igual al flujo registrado.

Pseudo-codigo:

```js
const input = await parseJson(req);
const whatsapp = normalizePortalWhatsapp(input.whatsapp, input.country);
const country = cleanCountry(input.country);
const quantity = clamp(input.quantity, 1, 10);
await enforceGuestRateLimit({ bucket: "guest_order", key: phoneKey(whatsapp) || clientIp(req) });

await withPostgresOrLegacyTransaction(async (clientOrDb) => {
  const guestClient = await findOrCreateGuestClient({ whatsapp, country });
  const suggestion = portalFrpPriceSuggestion(db, guestClient.id, quantity, false, null, "", { isGuest: true, disableBenefits: true });
  const order = createCustomerOrderLikeRegistered({ guestClient, userId: null, suggestion, input });
  createFrpOrderFromPortal(db, guestClient, order, items);
  const token = await createGuestSessionToken({ orderId: order.id, clientId: guestClient.id });
  audit("PORTAL_GUEST_ORDER_CREATED", order.id, { quantity, phoneHash });
  return { order, token };
});

setGuestCookie(res, token);
return sendJson(res, 201, {
  order: publicGuestOrder(order),
  recoveryLink: generateGuestRecoveryLink(order.code, token)
});
```

Response shape:

```json
{
  "order": {
    "id": "...",
    "code": "ARD-0001",
    "quantity": 1,
    "totalPrice": 4.50,
    "priceFormatted": "4.50 USDT",
    "publicStatus": "PAGO_EN_REVISION"
  },
  "recoveryLink": "https://ariadgsm.com/pedido/ARD-0001?t=..."
}
```

Errores:

- `400 whatsapp_invalid`
- `400 payment_method_invalid`
- `409 incompatible_model`
- `429 rate_limited`
- `503 pricing_unavailable`

### 4.3 `PATCH /api/portal/guest/orders/:id/payment-proof`

Inputs:

- Path `:id`: order UUID o codigo publico. Recomendado aceptar UUID interno solo desde respuesta y codigo desde link.
- Token en cookie o query `t`.
- Body con proof.

Validaciones:

- Flag guest.
- Token valido y vinculado a esa orden.
- Orden no finalizada/cancelada.
- Proof tipo permitido y no duplicado.
- Rate limit por order id + token hash.

Pseudo-codigo:

```js
const auth = await validateGuestSessionToken(token, { orderId });
const proof = sanitizePaymentProofImages(input.paymentProofs)[0];
if (!proof) return 400;
attachProofToCustomerAndFrpOrder(auth.orderId, proof);
audit("PORTAL_GUEST_PAYMENT_PROOF_UPLOADED", auth.orderId, { proofHash });
publishGuestOrder(auth.orderId, "payment_proof_uploaded");
return sendJson(res, 200, { order: publicGuestOrder(order) });
```

### 4.4 `GET /api/portal/guest/orders/:id`

Inputs:

- Token cookie or query `t`.

Validaciones:

- Flag guest.
- Token valido.

Pseudo-codigo:

```js
const auth = await validateGuestSessionToken(token, { orderId });
const order = await loadGuestOrderForPublic(auth.orderId);
return sendJson(res, 200, { order: publicGuestOrder(order) });
```

Error:

- Sin token, token invalido o order mismatch: `404`.

### 4.5 `GET /api/portal/guest/orders/:id/events`

SSE por orden, no por cliente.

Validaciones:

- Flag guest.
- Token valido antes de abrir stream.

Pseudo-codigo:

```js
const auth = await validateGuestSessionToken(token, { orderId });
openSse(res);
subscribeGuestOrder(orderId, (event) => {
  if (event.orderId === orderId) sendSse(res, event);
});
sendInitialGuestOrderState(res, orderId);
```

Errores:

- Si auth falla antes de stream: `404`.
- Si falla durante stream: cerrar conexion.

### 4.6 `POST /api/portal/guest/claim-preview`

Requiere sesion registrada.

Inputs:

```json
{ "whatsapp": "+51987654321" }
```

Si no se manda WhatsApp, usar `context.client.whatsapp`.

Validaciones:

- Flag guest.
- Sesion cliente registrada.
- WhatsApp valido.

Pseudo-codigo:

```js
const context = await getCurrentCustomerContext(req);
if (!requireCustomer(context, res)) return;
const whatsapp = normalizePortalWhatsapp(input.whatsapp || context.client.whatsapp);
if (whatsapp !== context.client.whatsapp) return 403;
const candidates = await findGuestOrdersForClaimByWhatsapp(whatsapp);
return sendJson(res, 200, {
  candidates: candidates.map(publicGuestClaimCandidate)
});
```

Response:

```json
{
  "candidates": [
    { "orderId": "...", "code": "ARD-0001", "quantity": 1, "createdAt": "...", "publicStatus": "FINALIZADO" }
  ]
}
```

No devolver:

- proof metadata
- payment details
- token
- internal ids de FRP

### 4.7 `POST /api/portal/guest/claim`

Inputs:

```json
{
  "sourceGuestClientIds": ["..."],
  "confirm": true
}
```

Alternativa mas segura: recibir `orderIds` candidatos y derivar guest clients en backend.

Validaciones:

- Flag guest.
- Sesion registrada.
- Confirmacion explicita.
- Guest orders corresponden al WhatsApp del cliente registrado.

Pseudo-codigo:

```js
const context = await getCurrentCustomerContext(req);
if (!requireCustomer(context, res)) return;
if (!input.confirm) return sendJson(res, 400, { error: "confirmation_required" });

const result = await claimGuestOrders({
  targetClientId: context.client.id,
  targetUserId: context.user.id,
  sourceGuestClientIds,
  expectedWhatsapp: context.client.whatsapp,
});

audit("PORTAL_GUEST_CLAIM", context.client.id, {
  claimedCount: result.claimedCount,
  sourceGuestClientIds: result.sourceGuestClientIds
});

return sendJson(res, 200, {
  claimedCount: result.claimedCount,
  customer: publicCustomerState(...)
});
```

Errores:

- `400 confirmation_required`
- `403 whatsapp_mismatch`
- `404 no_candidates`

### 4.8 `GET /api/portal/guest/orders/:id/comprobante.pdf`

Validaciones:

- Flag guest.
- Token valido.
- Orden finalizada.

Pseudo-codigo:

```js
const auth = await validateGuestSessionToken(token, { orderId });
const order = await loadGuestOrderForPublic(auth.orderId);
if (deriveStatus(order) !== "FINALIZADO") return 409;
return renderReceiptPdf(order);
```

Errores:

- Sin token/invalido: `404`.
- No finalizada: `409`.

## 5. Frontend - modulo `public/portal-modules/guest.js`

### 5.1 Estado

Nuevo estado:

```js
state.guest = {
  enabled: false,
  whatsapp: "",
  order: null,
  token: "",
  recoveryLink: "",
  events: null,
  loading: false,
  error: ""
};
```

Regla:

- `state.customer` queda reservado para usuario registrado.
- `state.guest` nunca debe simular `customer.user`.

### 5.2 Render condicional

Logica:

```text
si state.customer.user && state.customer.client:
  render registrado
si no hay sesion registrada y guest enabled:
  render guest
si no hay sesion registrada y guest disabled:
  render login actual
```

### 5.3 Pantalla guest

Debe mostrar:

- Banner discreto: `Quieres guardar tu historial? Crea cuenta`.
- WhatsApp obligatorio con codigo de pais.
- Cantidad 1-10.
- Metodo de pago por pais.
- Total con desglose.
- Subida de comprobante.
- Codigo ARD grande tras crear orden.
- Boton descargar USB Redirector cuando pago este aprobado.
- Seguimiento por SSE.

No mostrar:

- `Sesion cliente`
- `Salir`
- `Mis ordenes` historicas
- Datos de perfil registrado

### 5.4 Recuperacion con cookie/link

Camino cookie:

- Al crear orden, backend setea cookie guest HttpOnly.
- `GET /api/portal/guest/state` devuelve orden activa.

Camino link:

- Link `https://ariadgsm.com/pedido/ARD-0001?t=<token>`.
- Frontend lee token de query una sola vez, llama backend y backend renueva cookie.
- Frontend limpia URL con `history.replaceState()` para no dejar token visible despues de cargar.

### 5.5 Manejo "ya pague, donde esta mi codigo"

UI:

- Si hay orden guest en estado `PAGO_EN_REVISION`, mostrar codigo ARD y texto corto:
  - `Estamos verificando tu comprobante. Guarda este codigo.`
- Boton WhatsApp soporte manual.
- No prometer automatizacion WhatsApp.

### 5.6 Tamano de componentes

La regla frontend se mantiene:

- Ningun componente/modulo nuevo debe crecer sin control.
- Si `guest.js` supera ~300 lineas, dividir en:
  - `guest-state.js`
  - `guest-render.js`
  - `guest-api.js`

## 6. Asociacion post-registro

### 6.1 Deteccion en `/api/portal/session`

Cuando el usuario registrado tiene `context.client.whatsapp`, el backend busca candidatas:

```sql
select co.id, co.code, co.quantity, co.public_status, co.created_at
from customer_orders co
join customer_clients cc on cc.id = co.client_id
where cc.account_type = 'guest'
  and cc.whatsapp = $1
order by co.created_at desc
limit 20;
```

Response agregado:

```json
{
  "customer": {},
  "catalog": {},
  "guestClaimCandidates": {
    "count": 2,
    "orders": [
      { "id": "...", "code": "ARD-0001", "quantity": 1, "publicStatus": "FINALIZADO" }
    ]
  }
}
```

### 6.2 Deteccion en `/api/portal/register`

Al terminar registro:

- Normalizar WhatsApp.
- Crear cliente registrado como hoy.
- Buscar candidatas guest por mismo WhatsApp.
- Incluir `guestClaimCandidates` en response.
- No auto-transferir.

### 6.3 UI

Opcion recomendada: banner persistente, no modal bloqueante.

Texto:

```text
Encontramos N ordenes anteriores con tu WhatsApp.
[Asociar a mi cuenta] [Ahora no]
```

Datos visibles:

- Conteo.
- Codigos publicos `ARD-XXXX`.
- Cantidad.
- Estado publico.

No mostrar:

- Comprobantes.
- Payment details.
- Token.
- Logs.
- Datos internos FRP.

### 6.4 `POST /api/portal/guest/claim`

Ya descrito en seccion 4.7.

Auditoria:

```text
PORTAL_GUEST_CLAIM
```

Payload audit minimo:

```json
{
  "targetClientId": "...",
  "claimedCount": 2,
  "sourceGuestClientIds": ["..."],
  "phoneHash": "..."
}
```

No auditar WhatsApp raw.

### 6.5 Feature flag adicional

Agregar:

```text
PORTAL_GUEST_CLAIM_ENABLED=1
```

Default recomendado:

- Si `PORTAL_GUEST_ENABLED=0`, claim tambien queda apagado.
- Si `PORTAL_GUEST_ENABLED=1`, claim puede apagarse por separado con `PORTAL_GUEST_CLAIM_ENABLED=0`.

Esto permite rollback parcial si el flujo guest funciona pero claim presenta riesgo.

## 7. Panel operario

### 7.1 Serializer

Agregar flag en serializer de orden FRP:

```js
isGuest: customerClient?.accountType === "guest"
```

Fuente:

- Desde `frpOrder.portalOrderId` encontrar `customer_order`.
- Desde `customer_order.clientId` encontrar `customer_client`.
- Si `account_type='guest'`, marcar payload.

Campos sugeridos:

```json
{
  "isGuest": true,
  "accountType": "guest"
}
```

### 7.2 Frontend operador

En la tarjeta de orden:

- Renderizar badge `Guest`.
- No cambiar botones ni estados.
- No cambiar flujo de aprobar pago, DONE, cancelar, incompatibilidad o reembolso.

### 7.3 Comunicacion

Operario contacta guest por WhatsApp si hace falta. No se implementa WhatsApp API.

## 8. Plan de tests

### 8.1 Unitarios `server/portal/guest.js`

Casos:

- `findOrCreateGuestClient` reutiliza cliente guest existente por WhatsApp.
- `findOrCreateGuestClient` crea cliente si no existe.
- Concurrencia: dos requests mismo WhatsApp no crean duplicados cuando hay advisory lock.
- `createGuestSessionToken` retorna token raw y persiste solo hash.
- `validateGuestSessionToken` acepta token valido.
- `validateGuestSessionToken` rechaza token expirado.
- `validateGuestSessionToken` rechaza token revocado.
- `findGuestOrdersForClaimByWhatsapp` devuelve solo datos publicos.
- `claimGuestOrders` transfiere orders/items/requests y revoca tokens.
- `claimGuestOrders` es idempotente.
- `claimGuestOrders` rechaza WhatsApp mismatch.

### 8.2 Pricing

Tests con Krypto `fixedCostUsdt=3.00`, margin `1.00`, fee `0.30`, surcharge `0.20`.

Esperados por formula:

| Tipo | N | Total |
| --- | ---: | ---: |
| registrado | 1 | 4.30 |
| registrado | 2 | 8.30 |
| registrado | 3 | 12.30 |
| registrado | 5 | 20.30 |
| registrado | 10 | 40.30 |
| guest | 1 | 4.50 |
| guest | 2 | 8.70 |
| guest | 3 | 12.90 |
| guest | 5 | 21.30 |
| guest | 10 | 42.30 |

### 8.3 Rutas guest

Con `PORTAL_GUEST_ENABLED=0`:

- Todas las rutas `/api/portal/guest/*` devuelven 404.
- UI registrada no cambia.

Con `PORTAL_GUEST_ENABLED=1`:

- `GET /api/portal/guest/state` devuelve catalog.
- `POST /api/portal/guest/orders` crea orden.
- `PATCH payment-proof` adjunta proof.
- `GET order` exige token.
- `GET events` abre SSE con token valido.
- `GET comprobante.pdf` exige token y orden finalizada.

### 8.4 Claim

Casos:

- Session devuelve candidatas cuando WhatsApp coincide.
- Registro devuelve candidatas cuando WhatsApp coincide.
- Preview no filtra datos sensibles.
- Claim transfiere ordenes.
- Claim no mezcla WhatsApp distinto.
- Claim puede apagarse con `PORTAL_GUEST_CLAIM_ENABLED=0`.

### 8.5 WhatsApp normalization

Casos:

- `+51987654321` guarda y busca exacto.
- Formatos con espacios/guiones normalizan al mismo E.164.
- Numero sin pais falla o pide pais.
- Claim usa valor canonico.

### 8.6 SSE guest

Casos:

- Se recibe evento al aprobar pago.
- Se recibe evento al marcar DONE.
- Token invalido no abre stream.
- Stream se cierra sin leaks al desconectar.

### 8.7 Smoke existente

- Smoke JSON y tests existentes deben seguir verdes.
- Auth B.3 con flags `0` debe seguir sin cambio.

## 9. Estructura de commits propuesta para Paso 2.C

Cada commit debe correr tests relevantes antes de seguir.

1. `Paso 2.C.1: migraciones guest`
   - `004_portal_guest_flow.sql`.
   - Mapping Postgres read/write para `account_type` y `guest_session_tokens`.

2. `Paso 2.C.2: ajuste pricing operacional`
   - Runbook o script one-off para bajar `target_margin_usdt` a `1.00`.
   - No hardcodear update automatico si Bryams prefiere panel admin.

3. `Paso 2.C.3: modulo guest sin hooks`
   - `server/portal/guest.js`.
   - Helpers exportados, no rutas aun.

4. `Paso 2.C.4: pricing v2 backend`
   - `server/frp/pricing.js`.
   - `server.js portalFrpPriceSuggestion`.
   - `server/portal/serializers.js`.
   - Snapshot v2.

5. `Paso 2.C.5: rutas guest gated`
   - Rutas `/api/portal/guest/*`.
   - `PORTAL_GUEST_ENABLED`.
   - Cookies guest.

6. `Paso 2.C.6: frontend guest module`
   - `public/portal-modules/guest.js`.
   - Integracion con render cuando no hay sesion.
   - Mantener modulos bajo 300 lineas o dividir.

7. `Paso 2.C.7: asociacion post-registro`
   - `guestClaimCandidates`.
   - `POST /api/portal/guest/claim`.
   - `PORTAL_GUEST_CLAIM_ENABLED`.

8. `Paso 2.C.8: badge operario`
   - Serializer y render badge `Guest`.
   - Sin cambio de flujo operativo.

9. `Paso 2.C.9: tests guest y pricing`
   - Unitarios, rutas, SSE, claim, pricing.
   - Smoke existente verde.

10. `Paso 2.C.10: runbook rollout guest`
   - Variables Render.
   - SQL/manual para margin.
   - Rollback.

## 10. Plan de rollout

### Dia 0 - Preparacion

Antes del deploy:

- Agregar en Render:
  - `PORTAL_GUEST_ENABLED=0`
  - `PORTAL_GUEST_CLAIM_ENABLED=0`
  - `PORTAL_OPERATOR_FEE_USDT=0.30`
  - `PORTAL_GUEST_SURCHARGE_PER_EQUIPMENT_USDT=0.20`
- Confirmar Krypto activo en DB con costo `3.00`.

### Dia 1 - Deploy con guest apagado

Acciones:

1. Deploy de Paso 2.C con `PORTAL_GUEST_ENABLED=0`.
2. Ajustar `frp_pricing_policy.target_margin_usdt=1.00`.
3. Verificar `/api/health`.
4. Verificar portal registrado:
   - N=1 muestra `4.30`.
   - Login sigue alrededor de 3s o menos.
   - Orden registrada crea normalmente.

Si rompe:

- Bajar `PORTAL_OPERATOR_FEE_USDT=0`.
- Restaurar `target_margin_usdt=1.50`.
- Mantener `PORTAL_GUEST_ENABLED=0`.

### Dia 2-3 - Validacion pricing registrado

Monitorear:

- Que clientes registrados vean `4.30` para N=1.
- Que operador reciba ordenes normalmente.
- Que recibos y comprobantes usen total correcto.
- Que no aparezcan errores en pricing snapshot.

### Dia 4 - Activar guest

Acciones:

1. `PORTAL_GUEST_ENABLED=1`.
2. Mantener `PORTAL_GUEST_CLAIM_ENABLED=0` inicialmente.
3. Crear 1 orden guest sintetica controlada.
4. Verificar:
   - Guest N=1 total correcto.
   - Comprobante sube.
   - Operario ve badge Guest.
   - SSE actualiza estado.
   - Link/cookie recuperan orden.

### Dia 5+ - Activar claim

Acciones:

1. `PORTAL_GUEST_CLAIM_ENABLED=1`.
2. Probar con cuenta nueva y WhatsApp de orden guest sintetica.
3. Confirmar que preview muestra solo codigos publicos.
4. Confirmar claim transfiere orden.

## 11. Plan de rollback

### Rollback guest

- Poner `PORTAL_GUEST_ENABLED=0`.
- Rutas guest vuelven a 404.
- Ordenes guest ya creadas quedan en DB y el operador puede seguir procesandolas.
- Links guest dejan de funcionar mientras la flag este apagada.

### Rollback claim

- Poner `PORTAL_GUEST_CLAIM_ENABLED=0`.
- Guest sigue funcionando.
- No se muestran candidatas ni se permite asociar.

### Rollback pricing

Si el nuevo pricing causa problemas:

1. Restaurar en DB:

```sql
update frp_pricing_policy
set target_margin_usdt = 1.50,
    updated_at = now()
where id = 'current';
```

2. Poner env:

```text
PORTAL_OPERATOR_FEE_USDT=0
```

Resultado esperado con Krypto `3.00`: `3.00 + 1.50 + 0 = 4.50`.

No basta con restaurar margin a `1.50` si `PORTAL_OPERATOR_FEE_USDT` queda `0.30`; eso daria `4.80`.

### Rollback schema

- `customer_clients.account_type` queda con default `registered`; no afecta flujos existentes.
- `guest_session_tokens` puede quedar sin uso.
- No hacer DROP en caliente.

## 12. Criterios de exito medibles

Segun formula confirmada:

- Tabla canonica de pricing con Krypto `3.00`:

| Tipo | N=1 | N=2 | N=3 | N=5 | N=10 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Registrado | 4.30 | 8.30 | 12.30 | 20.30 | 40.30 |
| Guest | 4.50 | 8.70 | 12.90 | 21.30 | 42.30 |

- Login registrado sigue funcionando y no toca auth B.3.
- Operario ve ordenes guest con badge `Guest`.
- Cliente guest puede recuperar su orden por cookie.
- Cliente guest puede recuperar su orden por link con token.
- Asociacion post-registro funciona solo tras confirmacion explicita.
- Preview de claim no filtra datos sensibles.
- `PORTAL_GUEST_ENABLED=0` apaga todo guest sin redeploy.
- `PORTAL_GUEST_CLAIM_ENABLED=0` apaga solo claim sin redeploy.
- Tests pasan al 100%.

## 13. Riesgos restantes

### 13.1 Precio registrado baja de 4.50 a 4.30

Aceptado por Bryams. Riesgo comercial: clientes habituales pueden notar cambio. Mitigacion: silencio operativo o mensaje breve si preguntan; no requiere UI.

### 13.2 Claim sin verificacion SMS

Aceptado por Bryams. Riesgo: alguien registra WhatsApp ajeno y reclama ordenes. Mitigacion MVP:

- Preview solo muestra codigos publicos y conteo.
- No mostrar comprobantes ni detalles.
- Audit `PORTAL_GUEST_CLAIM`.
- Posibilidad de desactivar claim con flag.

### 13.3 Token guest en URL

Riesgo: si el cliente comparte link, otra persona puede ver estado/recibo.

Mitigacion:

- Token opaco de alta entropia.
- Hash en DB.
- Expira 90 dias.
- Revocable en claim.
- Frontend limpia query con `history.replaceState()`.

### 13.4 Dos paneles frontend paralelos

Riesgo: duplicar logica registrado/guest.

Mitigacion:

- Compartir helpers de pricing, payments y order state.
- `guest.js` solo orquesta estado guest.
- Dividir si pasa 300 lineas.

### 13.5 SSE guest

Riesgo: listeners por orden quedan abiertos.

Mitigacion:

- Cleanup en `close`.
- Stream solo por order id validado.
- Tests de desconexion.

### 13.6 Arquitectura legacy writeDb

El flujo de ordenes sigue usando snapshot legacy. Esto ya existe y no se corrige en Paso 2. Mitigacion:

- No tocar auth B.3.
- Mantener feature flags.
- Monitorear memoria/deadlocks despues de activar guest.
- Si guest aumenta trafico, Fase C debe migrar order creation a SQL granular.
