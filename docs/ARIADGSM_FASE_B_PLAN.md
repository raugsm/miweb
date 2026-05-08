# AriadGSM Fase B.2 - Plan de migracion auth granular

Fecha: 2026-05-08

Alcance: plan sin codigo para migrar login, logout y validacion de sesiones a SQL granular bajo Postgres. La ejecucion queda para B.3. El objetivo es reducir latencia, evitar `writeDb(db)` en auth y bajar el riesgo de perdida de sesiones por reemplazo legacy.

Estado base:

- Produccion esta estable tras Fase A: Standard 2 GB, `POSTGRES_RUNTIME_WRITE_RETRIES=1`, `NODE_OPTIONS=--max-old-space-size=1536`.
- Mediciones post-Fase A: deadlocks 24h = 0, login cliente = 6-8s, memoria <48%, sesiones cliente se pierden antes de 30-60 min.
- No hay PR Previews en Render. Rollout debe ser con feature flags y rollback por variables.

Flags aprobadas:

```text
POSTGRES_AUTH_GRANULAR_CUSTOMER=0|1
POSTGRES_AUTH_GRANULAR_OPERATOR=0|1
```

Default: `0`. Solo aplican si `ARIAD_STORAGE_DRIVER=postgres`.

## 1. Esquema SQL

### `portal_rate_limits`

La tabla ya existe en `migrations/001_initial_postgres.sql`.

DDL actual:

```sql
create table portal_rate_limits (
  id uuid primary key,
  bucket text not null,
  ip_hash text not null default '',
  key_hash text not null default '',
  created_at timestamptz not null,
  legacy_json jsonb not null default '{}'::jsonb
);

create index portal_rate_limits_bucket_created_idx on portal_rate_limits(bucket, created_at);
create index portal_rate_limits_key_idx on portal_rate_limits(key_hash);
create index portal_rate_limits_ip_idx on portal_rate_limits(ip_hash);
```

No hace falta crear la tabla. Si B.3 necesita mejor performance, proponer una migracion nueva solo con indices compuestos:

```sql
create index if not exists portal_rate_limits_bucket_ip_created_idx
  on portal_rate_limits(bucket, ip_hash, created_at desc);

create index if not exists portal_rate_limits_bucket_key_created_idx
  on portal_rate_limits(bucket, key_hash, created_at desc);
```

Justificacion: el rate limit granular consultara por `bucket + ip_hash + created_at` y por `bucket + key_hash + created_at`. Los indices actuales sirven parcialmente, pero pueden obligar a combinar filtros de forma menos eficiente.

No propongo FK en `portal_rate_limits`: los registros son intentos anonimos o semi-anonimos; deben sobrevivir aunque no exista usuario.

### `customer_sessions`

Tabla existente:

```sql
create table customer_sessions (
  id uuid primary key,
  user_id uuid not null references customer_users(id) on delete cascade,
  client_id uuid not null references customer_clients(id) on delete cascade,
  token_hash text not null unique,
  device_id uuid references customer_devices(id) on delete set null,
  version integer not null,
  last_seen_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null,
  legacy_json jsonb not null default '{}'::jsonb
);

create index customer_sessions_client_idx on customer_sessions(client_id);
create index customer_sessions_expires_at_idx on customer_sessions(expires_at);
```

`token_hash text not null unique` ya crea un indice unico en Postgres. No hace falta indice explicito adicional para lookup por token.

Indice opcional si la tabla crece mucho:

```sql
create index if not exists customer_sessions_token_valid_idx
  on customer_sessions(token_hash, version, expires_at);
```

No lo recomiendo en B.3 inicial salvo que `EXPLAIN` muestre problema. El indice unico por `token_hash` debe ser suficiente.

### `operator_sessions`

Tabla existente:

```sql
create table operator_sessions (
  id uuid primary key,
  user_id uuid not null references operator_users(id) on delete cascade,
  token_hash text not null unique,
  device_id uuid references operator_devices(id) on delete set null,
  version integer not null,
  last_seen_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null,
  legacy_json jsonb not null default '{}'::jsonb
);

create index operator_sessions_user_id_idx on operator_sessions(user_id);
create index operator_sessions_expires_at_idx on operator_sessions(expires_at);
```

`token_hash unique` ya cubre lookup por token. No hace falta indice explicito adicional para B.3.

### Usuarios, clientes y dispositivos

Ya existen indices/constraints suficientes para B.3:

- `customer_users.email unique`.
- `operator_users.email unique`.
- `customer_devices.token_hash unique`.
- `operator_devices.token_hash unique`.
- `customer_device_authorizations primary key (device_id, client_id)`.
- `operator_device_admin_users primary key (device_id, user_id)`.

### Decision de migracion SQL

B.3 puede empezar sin migracion obligatoria porque las tablas necesarias ya existen. La unica migracion recomendable, no bloqueante, seria agregar indices compuestos a `portal_rate_limits`.

## 2. Modulo `server/db/postgres-auth.js`

Nuevo modulo propuesto. Debe usar `withPostgresClient`, `withTransaction` y `insertAuditEventWithClient` cuando necesite auditoria en la misma transaccion. No debe llamar `readDb()` ni `writeDb(db)`.

Tipos conceptuales:

```js
type DeviceInfo = {
  tokenHash: string,
  userAgent: string,
  ipHash: string,
  nowIso: string,
  nowMs: number,
};

type RateLimitResult = {
  allowed: boolean,
  attempts: number,
  maxAttempts: number,
  resetAt: string,
  ipHash: string,
  keyHash: string,
};
```

### Funciones customer

#### `customerRateLimitCheck(email, deviceInfo, options = {})`

Hace rate limit granular para cliente.

Parametros:

```js
{
  email: string,
  deviceInfo: DeviceInfo,
  options?: { bucket?: string, windowMs?: number, maxAttempts?: number }
}
```

Return:

```js
RateLimitResult
```

Queries en orden:

1. `BEGIN`.
2. `set local search_path = ariad, public`.
3. `select pg_advisory_xact_lock(hashtext($bucket), hashtext($lockKey))`.
4. `delete from portal_rate_limits where bucket=$1 and created_at < $2 and (ip_hash=$3 or key_hash=$4)`.
5. `select count(*) from portal_rate_limits where bucket=$1 and ip_hash=$2 and created_at >= $3`.
6. Si hay `key_hash`: `select count(*) from portal_rate_limits where bucket=$1 and key_hash=$2 and created_at >= $3`.
7. `insert into portal_rate_limits (...) values (...)`.
8. `COMMIT`.

Manejo de errores:

- Si falla Postgres, propaga error controlado al handler.
- Si `email` esta vacio, `key_hash=''` y solo aplica por IP.
- El advisory lock evita doble conteo inconsistente con dos requests simultaneas del mismo email/IP, incluso con mas de una instancia Render.

#### `customerLoginAttempt(email, password, deviceInfo, options = {})`

Orquesta el login cliente granular. Recibe `password` para preservar la interfaz conceptual, pero la comparacion debe hacerse fuera de una transaccion larga.

Parametros:

```js
{
  email: string,
  password: string,
  deviceInfo: DeviceInfo,
  verifyPassword: (password, storedHash) => Promise<boolean>,
  sessionTokenHash: string,
  sessionVersion: number,
  sessionMaxAgeSeconds: number,
}
```

Return:

```js
{
  status: "ok" | "rate_limited" | "invalid_credentials" | "blocked",
  httpStatus: 200 | 401 | 403 | 429,
  user?: object,
  client?: object,
  device?: object,
  session?: object,
  rateLimit?: RateLimitResult,
}
```

Queries en orden:

1. Llama `customerRateLimitCheck(email, deviceInfo, ...)`.
2. Si no allowed: llama `customerLoginRecordRateLimit(email, deviceInfo)` y retorna `rate_limited`.
3. `customerLoginFindUser(email)`:
   ```sql
   select u.*, c.*
   from customer_users u
   join customer_clients c on c.id = u.client_id
   where u.email = $1 and u.active is not false
   limit 1
   ```
4. `customerDeviceUpsert(deviceInfo)`:
   ```sql
   insert into customer_devices (...)
   values (...)
   on conflict (token_hash) do update
     set last_seen_at = excluded.last_seen_at
   returning *
   ```
5. Verifica password en JS con `verifyPassword`.
6. Si falla: `customerLoginRecordFail(email, deviceInfo, clientId?)`.
7. Si cliente bloqueado: retorna `blocked`.
8. Si ok: `customerSessionInsert(userId, clientId, tokenHash, deviceId, ...)`.
9. Inserta audit `PORTAL_LOGIN_SUCCESS`.

Manejo de errores:

- No mantener transaccion abierta durante `verifyPassword`.
- No retornar si el email existe o no mas alla del error generico del handler.
- No loggear password, token ni hashes.

#### `customerLoginRecordFail(email, deviceInfo, clientId = null)`

Registra auditoria granular de fallo de login.

Queries:

1. `insert into audit_events (...)` con `PORTAL_LOGIN_FAILED`.

Manejo de errores:

- Si falla audit, el handler puede continuar devolviendo 401. No debe bloquear login fallido por fallo de auditoria.

#### `customerLoginRecordRateLimit(email, deviceInfo)`

Registra auditoria granular de rate limit.

Queries:

1. `insert into audit_events (...)` con `PORTAL_LOGIN_RATE_LIMITED`.

#### `customerSessionInsert(userId, clientId, tokenHash, deviceId, options = {})`

Inserta sesion cliente sin reemplazar runtime.

Queries en orden:

1. `BEGIN`.
2. `set local search_path = ariad, public`.
3. `delete from customer_sessions where expires_at <= $now or version <> $sessionVersion`.
4. `insert into customer_sessions (...) values (...) returning *`.
5. `COMMIT`.

Manejo de errores:

- Si choca `token_hash unique`, generar token nuevo en handler y reintentar una vez.
- No borrar sesiones validas de otros usuarios.

#### `customerSessionLookup(tokenHash, deviceTokenHash = "", options = {})`

Valida sesion cliente sin `readDb()`.

Queries en orden:

1. `select session + user + client + device` por `customer_sessions.token_hash`.
2. Filtrar en SQL: `expires_at > now()`, `version = $version`, `user.active is not false`, `client.status <> 'BLOQUEADO'`.
3. `select exists(...) from customer_device_authorizations where device_id=$1 and client_id=$2`.
4. Si `last_seen_at` esta viejo: `update customer_sessions set last_seen_at=$now where id=$sessionId`.
5. Si hay device: `update customer_devices set last_seen_at=$now where id=$deviceId`.

Return:

```js
{
  user,
  client,
  session,
  device,
  deviceAuthorizedForBenefits: boolean,
}
```

Manejo de errores:

- Si token no existe/expira: retorna `{ user:null, client:null }`, no lanza.
- Si user/client bloqueado: borra esa sesion por token en una transaccion corta y retorna null.

#### `customerSessionDelete(tokenHash)`

Logout cliente granular.

Queries:

```sql
delete from customer_sessions where token_hash = $1
```

Return:

```js
{ deleted: number }
```

### Funciones operator

#### `operatorRateLimitCheck(email, deviceInfo, options = {})`

Igual a `customerRateLimitCheck`, pero bucket default `operator_login` y max attempts `maxOperatorLoginFailuresPerWindow`.

#### `operatorLoginAttempt(email, password, deviceInfo, options = {})`

Orquesta login operador granular.

Parametros:

```js
{
  email: string,
  password: string,
  operatorPin?: string,
  setupToken?: string,
  deviceInfo: DeviceInfo,
  verifyPassword: (password, storedHash) => Promise<boolean>,
  sessionTokenHash: string,
  sessionVersion: number,
  trustedDeviceVersion: number,
  sessionMaxAgeSeconds: number,
}
```

Return:

```js
{
  status: "ok" | "rate_limited" | "invalid_credentials" | "inactive" |
          "admin_setup_pin_required" | "admin_approval_required",
  httpStatus: 200 | 401 | 403 | 409 | 429,
  user?: object,
  device?: object,
  session?: object,
  deviceTokenRequired?: boolean,
  pinLabel?: string,
}
```

Queries en orden:

1. `operatorRateLimitCheck(email, deviceInfo, ...)`.
2. Si no allowed: `operatorLoginRecordRateLimit(email, deviceInfo, userId?)`.
3. Buscar user:
   ```sql
   select * from operator_users where email=$1 limit 1
   ```
4. Upsert device:
   ```sql
   insert into operator_devices (...)
   on conflict (token_hash) do update set last_seen_at=excluded.last_seen_at
   returning *
   ```
5. Verificar password fuera de transaccion larga.
6. Si password falla: `operatorLoginRecordFail(...)`.
7. Si user inactivo: retorna `inactive`.
8. Si user admin:
   - consultar trust del device con `operator_device_admin_users`.
   - si no hay ningun trusted device y setupToken invalido: audit `ADMIN_DEVICE_SETUP_REQUIRED`.
   - si no hay ningun trusted device y setupToken valido: insertar trust.
   - si ya hay trusted device y PIN invalido: audit `ADMIN_DEVICE_PIN_REQUIRED`.
   - si ya hay trusted device y PIN valido: upsert approval pendiente y retornar `admin_approval_required`.
9. Si login permitido: `operatorSessionInsert(...)`.
10. Audit `LOGIN_SUCCESS`.

Manejo de errores:

- No mantener transaccion abierta durante scrypt del password/PIN.
- Preservar semantica actual: PIN valido en device nuevo no loguea directo si ya existe trusted device; crea solicitud de aprobacion.

#### `operatorLoginRecordFail(email, deviceInfo, userId = null)`

Inserta audit `LOGIN_FAILED`.

#### `operatorLoginRecordRateLimit(email, deviceInfo, userId = null)`

Inserta audit `LOGIN_RATE_LIMITED`.

#### `operatorSessionInsert(userId, tokenHash, deviceId, options = {})`

Inserta sesion operador.

Queries:

1. `delete from operator_sessions where expires_at <= $now or version <> $sessionVersion`.
2. `insert into operator_sessions (...) returning *`.

#### `operatorSessionLookup(tokenHash, deviceTokenHash = "", options = {})`

Valida sesion operador sin `readDb()`.

Queries en orden:

1. `select session + operator_user + operator_device` por `operator_sessions.token_hash`.
2. Filtrar `expires_at > now()`, version y `user.active = true`.
3. Si user `ADMIN`, validar que:
   - cookie device existe,
   - device token hash coincide,
   - session.device_id = device.id,
   - `device.trust_version = trustedDeviceVersion`,
   - existe `operator_device_admin_users(device_id,user_id)`.
4. Si admin device falla: borrar sesion y audit `ADMIN_SESSION_DEVICE_REJECTED`.
5. Actualizar `last_seen_at` de session/device si corresponde.

Return:

```js
{ user, session, device, rejected?: boolean }
```

#### `operatorSessionDelete(tokenHash)`

Logout operador granular.

Queries:

```sql
delete from operator_sessions where token_hash = $1
```

### Funcion transversal requerida

#### `preserveCurrentAuthRowsBeforeLegacyReplace(client, plan, options)`

Esta funcion no estaba en el minimo pedido, pero el plan la considera necesaria.

Problema: si auth granular inserta una sesion nueva, cualquier ruta legacy no-auth que haga `writeDb(db)` con un snapshot viejo puede truncar/reinsertar tablas runtime y borrar esa sesion. Migrar login/logout no basta para garantizar sesiones de 4h.

Mitigacion propuesta para B.3:

1. Justo antes de `replacePostgresLegacyRuntime(client, plan)`, leer filas actuales de:
   - `customer_sessions`
   - `operator_sessions`
   - `customer_devices`
   - `operator_devices`
   - `customer_device_authorizations`
   - `operator_device_admin_users`
2. Mergearlas al plan si son mas recientes o si no existen en el snapshot.
3. Ejecutar el replace con plan fusionado.

No recomiendo excluir tablas de sesion del `TRUNCATE`: por FKs, excluir solo sesiones y truncar devices puede romper integridad. El merge es menos peligroso.

## 3. Cambios en handlers

Helper de flags:

```js
function envFlag(value) {
  return ["1", "true", "yes"].includes(String(value || "").trim().toLowerCase());
}

function useGranularCustomerAuth() {
  return storage.driver === "postgres" && envFlag(process.env.POSTGRES_AUTH_GRANULAR_CUSTOMER);
}

function useGranularOperatorAuth() {
  return storage.driver === "postgres" && envFlag(process.env.POSTGRES_AUTH_GRANULAR_OPERATOR);
}
```

### `POST /api/portal/login`

```text
if useGranularCustomerAuth():
  input = parseJson(req)
  email/password normalizados
  device token cookie o nuevo token
  deviceInfo = { tokenHash, ipHash, userAgent, now }
  sessionToken = random
  result = await customerLoginAttempt(email, password, deviceInfo, {
    verifyPassword,
    sessionTokenHash: hashToken(sessionToken),
    sessionVersion: customerSessionVersion,
    sessionMaxAgeSeconds: customerSessionMaxAgeSeconds
  })
  if result.status == rate_limited: set device cookie, 429
  if invalid: set device cookie, 401
  if blocked: set device cookie, 403
  payload = await customerSessionBootstrap(result.user, result.client, result.device)
  set customer session cookie + device cookie
  return 200 payload
else:
  flujo legacy actual intacto
```

Nota: `customerSessionBootstrap` debe ser granular o acotado. Si usa `readDb()` completo, login seguira cerca de 6-8s.

### `POST /api/portal/logout`

```text
if useGranularCustomerAuth():
  token = getCookie(ariad_customer_session)
  if token: await customerSessionDelete(hashToken(token))
  clear customer session cookie
  return 200
else:
  flujo legacy actual intacto
```

### `GET /api/portal/session`

```text
if useGranularCustomerAuth():
  token = getCookie(ariad_customer_session)
  deviceToken = getCookie(ariad_customer_device)
  context = token ? await customerSessionLookup(hashToken(token), hashToken(deviceToken)) : anonymous context
  if no customer:
    set/update device cookie if needed
    return { customer:null, catalog: await portalCatalogGranular() }
  state = await customerSessionBootstrap(context)
  set device cookie
  return { customer: state.customer, catalog: state.catalog }
else:
  flujo legacy actual intacto
```

### `POST /api/login` operador

```text
if useGranularOperatorAuth():
  input = parseJson(req)
  device token cookie o nuevo token
  sessionToken = random
  result = await operatorLoginAttempt(email, password, deviceInfo, {
    operatorPin,
    setupToken,
    verifyPassword,
    sessionTokenHash: hashToken(sessionToken),
    sessionVersion,
    trustedDeviceVersion,
    sessionMaxAgeSeconds
  })
  if result.status == rate_limited: 429
  if invalid_credentials: 401
  if inactive: 403
  if admin_setup_pin_required: set device cookie, 409
  if admin_approval_required: set device cookie, 409
  set ariad_session + ariad_device cookies
  return 200 { user: publicUser(result.user) }
else:
  flujo legacy actual intacto
```

### `POST /api/logout` operador

```text
if useGranularOperatorAuth():
  token = getCookie(ariad_session)
  user = await getCurrentUser(req) // granular por flag
  if token: await operatorSessionDelete(hashToken(token))
  if user: closeFrpOpsStreamsForUser(user.id, null, "operator_logged_out", "Sesion cerrada.")
  clear ariad_session cookie
  return 204
else:
  flujo legacy actual intacto
```

### `GET /api/session` operador

```text
getCurrentUser(req):
  if useGranularOperatorAuth():
    return await operatorSessionLookup(hashToken(sessionCookie), hashToken(deviceCookie))
  else:
    legacy readDb flow

GET /api/session:
  if !user: return { user:null, setupRequired }
  // B.2 no debe intentar granularizar todo el panel operador.
  // El payload actual sigue requiriendo readDb() para users, tickets, pricing, FRP, daily close.
  db = await readDb()
  return payload actual
```

Decision: operador login/logout/session identity migran a granular. El dashboard completo de operador queda para Fase C porque hacerlo aqui mezclaria auth con panel completo.

## 4. Interaccion con `getCurrentCustomerContext` / `getCurrentUser`

Decision recomendada: opcion (a). B.2 debe incluir variante granular de session lookup en ambos helpers, gated por las mismas flags.

Razon:

- Si solo migramos login/logout pero `getCurrentCustomerContext()` sigue haciendo `readDb()` completo, el cliente seguira pagando coste alto en cada refresh/SSE/orders.
- El objetivo `login <2s` requiere que el login no construya `publicCustomerState()` desde snapshot completo.
- El objetivo de sesion estable 4h no se cumple si sesiones nuevas siguen expuestas a reemplazos legacy sin merge de proteccion.

Alcance recomendado:

1. `getCurrentCustomerContext()`:
   - con flag customer=1: usar `customerSessionLookup()`.
   - devolver context granular.
   - rutas que necesiten estado completo pueden pedir un bootstrap granular acotado.

2. `getCurrentUser()`:
   - con flag operator=1: usar `operatorSessionLookup()`.
   - devolver `publicUser` compatible.
   - rutas que necesiten panel completo siguen leyendo legacy por ahora.

3. `GET /api/portal/session`:
   - con flag customer=1: no debe usar `readDb()` completo.
   - necesita `customerSessionBootstrap()` granular: user, client, device, benefit, orders del cliente, catalog/pricing/payment methods.

4. `GET /api/session` operador:
   - con flag operator=1: session identity granular.
   - payload completo legacy aceptado por ahora, porque contiene casi todo el panel. No vender esto como optimizacion completa del panel.

## 5. Plan de tests

### Unitarios `postgres-auth.js`

Crear `test/postgres-auth.test.js` con `client.query` mockeado.

Casos:

- `customerRateLimitCheck()`:
  - toma advisory lock antes de contar.
  - borra filas viejas del bucket/key.
  - cuenta por IP y por key.
  - inserta intento siempre.
  - devuelve 429 cuando count previo >= max.

- `customerLoginAttempt()`:
  - login exitoso: rate check -> select user/client -> upsert device -> verify -> insert session -> audit.
  - credenciales invalidas: no inserta session, si inserta audit fail.
  - rate limit: no consulta password, registra audit rate limit.
  - cliente bloqueado: no inserta session.

- `customerSessionLookup()`:
  - token valido retorna user/client/device.
  - token expirado retorna null.
  - cliente bloqueado retorna null y borra sesion.
  - actualiza last_seen si vencio ventana.

- `customerSessionDelete()`:
  - borra por token_hash.
  - idempotente si no existe.

- Equivalentes operador:
  - `operatorRateLimitCheck()`.
  - `operatorLoginAttempt()` happy path.
  - admin primer device con setup token.
  - admin device no trusted con PIN invalido.
  - admin device no trusted con PIN valido -> approval required, no session.
  - operador inactivo.
  - `operatorSessionLookup()` admin rechaza device mismatch.
  - `operatorSessionDelete()`.

### Race condition tests

Con mocks:

- Dos logins concurrentes del mismo cliente:
  - ambos pueden crear sesiones validas distintas.
  - rate limit no queda por debajo de conteo real.
  - no hay `writeDb()`.

- Logout mientras `GET /api/portal/session` esta en vuelo:
  - resultado aceptable A: session lookup gana y devuelve una vez, logout borra despues.
  - resultado aceptable B: logout gana y session devuelve null.
  - no debe lanzar 500.

- Login granular seguido de legacy write no-auth:
  - si se implementa merge guard, la sesion granular debe sobrevivir.
  - si no se implementa merge guard, marcar test como expected failure y no aprobar B.3 para rollout cliente.

### Rate limit granular

- 5 fallos seguidos permitidos/bloqueados segun semantica actual (`attempts < maxAttempts` antes de insertar).
- 6to intento devuelve 429.
- Ventana reinicia despues de `portalRateLimitWindowMs`.
- Misma IP + distinto email sigue limitado por IP.
- Mismo email + distinta IP sigue limitado por key.

### Sesion expirada

- `customerSessionLookup()` no retorna sesiones vencidas.
- `operatorSessionLookup()` no retorna sesiones vencidas.
- Cleanup de expiradas usa indice `expires_at`.

### Coexistencia flags

- Flags default 0:
  - smoke tests JSON existentes siguen verdes.
  - rutas usan legacy.

- Customer=1, Operator=0:
  - cliente granular.
  - operador legacy intacto.

- Customer=0, Operator=1:
  - operador granular.
  - cliente legacy intacto.

- Toggle en medio:
  - sesion creada con flag=1 sigue siendo valida con flag=0.
  - sesion creada con flag=0 sigue siendo valida con flag=1.

### Tests JSON existentes

Confirmar que siguen verdes con flags ausentes/0:

```text
npm test
```

Los smoke tests actuales arrancan con storage JSON por default; no deben cambiar comportamiento.

## 6. Plan de rollout en produccion

### Dia 1 - Deploy B.3 con flags apagadas

Render env:

```text
POSTGRES_AUTH_GRANULAR_CUSTOMER=0
POSTGRES_AUTH_GRANULAR_OPERATOR=0
```

Verificar:

- `/api/health` 200.
- Login cliente sigue como antes.
- Login operador sigue como antes.
- Logs sin excepciones de import/module.
- Memoria no sube respecto a Fase A.

Decision para avanzar: 2-4h sin `Instance failed`, sin aumento de 500.

### Dia 2 - Activar cliente

Render env:

```text
POSTGRES_AUTH_GRANULAR_CUSTOMER=1
POSTGRES_AUTH_GRANULAR_OPERATOR=0
```

Verificar:

- Login cliente en DevTools <2s.
- `GET /api/portal/session` responde cliente valido sin cortar sesion.
- Logout cliente funciona.
- Registro cliente legacy puede seguir legacy si no se migra en B.3; no mezclar hasta probar login/session.
- Logs no muestran `ARIAD_STORAGE_DRIVER=postgres escritura fallo` desde `/api/portal/login` o `/api/portal/logout`.

Medir 24-48h:

- Sesion cliente abierta 4h o mas.
- Cero perdida de sesion sin logout ni expiracion.
- Cero OOM.
- Deadlocks siguen en cero o no vienen en cadena.

### Dias 3-5 - Validacion cliente

No activar operador aun.

Buscar:

- Clientes reportando logout espontaneo.
- 401 inesperados en `/api/portal/session`.
- Aumento de filas en `portal_rate_limits` sin limpieza razonable.
- Errores FK en sessions/devices.

### Dia 6+ - Activar operador

Render env:

```text
POSTGRES_AUTH_GRANULAR_CUSTOMER=1
POSTGRES_AUTH_GRANULAR_OPERATOR=1
```

Verificar:

- Login operador <2s.
- Logout operador cierra sesion.
- Admin device trust/PIN/approval conserva semantica actual.
- `GET /api/session` devuelve panel.
- Operador puede procesar FRP.

### Si rompe

Rollback inmediato por variable:

```text
POSTGRES_AUTH_GRANULAR_CUSTOMER=0
POSTGRES_AUTH_GRANULAR_OPERATOR=0
```

No requiere redeploy; Render reinicia al guardar env vars.

## 7. Plan de rollback

### Sesiones creadas con flag=1 y luego flag=0

Deberian seguir siendo validas.

Razon:

- Las sesiones granulares se insertan en las mismas tablas `customer_sessions` y `operator_sessions`.
- El path legacy `readPostgresLegacyDb()` lee esas tablas y las mapea a `db.customerSessions` / `db.sessions`.
- Las cookies siguen usando los mismos nombres y `token_hash`.

Validacion obligatoria en tests:

```text
1. Crear sesion con granular.
2. Apagar flag.
3. Validar sesion por legacy.
```

### Sesiones creadas con flag=0 y luego flag=1

Tambien deberian seguir siendo validas si:

- `customerSessionLookup()` y `operatorSessionLookup()` aceptan filas legacy actuales.
- No dependen de campos nuevos fuera del schema actual.

### Riesgo de deslogueo masivo

Riesgo bajo por rollback de flag si las sesiones estan en tablas normales.

Riesgo alto si B.3 no implementa proteccion contra legacy write:

- Una ruta no-auth con `writeDb(db)` puede reinsertar snapshot viejo y borrar sesiones creadas granularmente.
- Eso se percibiria como logout espontaneo aunque auth granular este activo.

Mitigacion: incluir merge guard de sesiones/devices actuales antes de legacy replace, o aceptar explicitamente que B.3 no puede prometer 4h de sesion.

## 8. Criterios de exito medibles

B.3 se considera lista para rollout si:

- Tests unitarios de `postgres-auth.js` pasan.
- Smoke tests JSON existentes pasan con flags=0.
- Con flag customer=1:
  - `POST /api/portal/login` no llama `writeDb(db)`.
  - `POST /api/portal/logout` no llama `writeDb(db)`.
  - `GET /api/portal/session` no llama `writeDb(db)`.
  - Ideal: `GET /api/portal/session` tampoco llama `readDb()` completo.
- Con flag operator=1:
  - `POST /api/login` no llama `writeDb(db)`.
  - `POST /api/logout` no llama `writeDb(db)`.
  - `getCurrentUser()` no llama `readDb()` completo para validar identidad.
- Login cliente baja de 6-8s a menos de 2s en DevTools.
- Login operador baja a menos de 2s.
- Sesion cliente sobrevive 4h o mas con pagina abierta.
- Memoria en produccion no sube respecto a Fase A.
- Deadlocks no reaparecen en cadena.

## 9. Riesgos restantes

### Rate limits previos

Los contadores actuales ya viven en `portal_rate_limits` bajo Postgres, pero su origen fue legacy snapshot. No hace falta migrarlos. Si se pierden durante rollout, el impacto es bajo: se resetean intentos de rate limit, no datos de clientes.

### Dos instancias Render

Si Render corre dos instancias durante deploy/rolling restart:

- El rate limit nuevo debe usar advisory locks en Postgres, no memoria.
- Las sesiones deben depender de unique constraints en DB.
- No asumir single process.

### Legacy `writeDb()` sigue vivo fuera de auth

Este es el riesgo mayor.

B.2/B.3 auth granular no elimina todos los `writeDb(db)`:

- orders/pagos/FRP siguen con rutas legacy.
- pricing/panel/tickets siguen con rutas legacy.
- esos writes pueden seguir causando lock contention.

Por eso B.3 no cierra causa raiz completa; solo corta la ruta mas caliente de auth.

### Sesiones vs legacy replace

Como se explico arriba, las sesiones granulares siguen en tablas que el legacy replace puede truncar/reinsertar. Sin merge guard, una escritura legacy concurrente puede borrar sesiones nuevas.

Decision recomendada: B.3 debe incluir merge guard de auth rows actuales antes de replace, o bajar expectativa de "sesion 4h" hasta Fase C.

### Operator dashboard completo

`GET /api/session` operador arma un payload grande con users, clients, tickets, pricing, daily close, links y FRP. Granularizarlo completo no es auth; es Fase C. En B.3, migrar identity lookup del operador, no todo el dashboard.

### Registro y password reset

Este plan cubre login/logout/session. Registro, verify-email, resend-verification y password reset tambien usan `writeDb(db)`. Si siguen activos con trafico real, pueden afectar sesiones por el riesgo de legacy replace. Deben entrar en B.4 o C temprana.

## Decision recomendada

Ejecutar B.3 con este orden tecnico:

1. Crear `server/db/postgres-auth.js` con customer + operator helpers.
2. Agregar flags separadas customer/operator.
3. Branch por driver/flag en login/logout/session.
4. Implementar `customerSessionBootstrap()` granular para el portal cliente.
5. Implementar merge guard de sesiones/devices actuales antes de legacy replace mientras existan rutas legacy.
6. Tests unitarios con mocks y smoke JSON.
7. Deploy con flags=0.
8. Activar customer primero.
9. Activar operator despues de 24-48h estables.

Sin el paso 5, el plan mejora login y reduce writes de auth, pero no garantiza que las sesiones sobrevivan a escrituras legacy de otras rutas.
