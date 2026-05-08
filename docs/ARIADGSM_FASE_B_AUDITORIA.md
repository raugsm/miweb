# AriadGSM Fase B.1 - Auditoria de login y sesiones

Fecha: 2026-05-08

Alcance: auditoria sin cambios de codigo para preparar Fase B.2. La causa raiz ya conocida es la mezcla de rutas legacy `readDb()` / `writeDb(db)` completas sobre Postgres con rutas SQL granulares. Esta auditoria se concentra en login, logout, sesiones, rate limits y rutas relacionadas.

Restriccion operativa: el repo no tiene PR Previews en Render. La futura migracion debe salir con feature flag o ruta dual, tests locales fuertes y plan de rollback, porque no hay staging automatico por PR.

## 1. Mapa del flujo de login actual

### Handler cliente registrado

Confirmado: el handler de login cliente empieza en `server/portal/portal-routes.js:373`.

Ruta:

```text
POST /api/portal/login
```

Pseudo-codigo actual:

```text
1. parseJson(req)
2. normalizar email y password
3. db = await readDb()
4. ensureCustomerDevice(db, req)
5. enforcePortalRateLimit(db, req, "portal_login", email, maxPortalRegisterRequestsPerWindow)
6. si rate limit excedido:
   - audit(PORTAL_LOGIN_RATE_LIMITED)
   - await writeDb(db)
   - set-cookie customer device
   - 429
7. buscar customerUser en db.customerUsers por email
8. verifyPassword(password, customerUser.passwordHash)
9. si credenciales fallan:
   - audit(PORTAL_LOGIN_FAILED)
   - await writeDb(db)
   - set-cookie customer device
   - 401
10. buscar client en db.customerClients
11. si client faltante/bloqueado:
   - await writeDb(db)
   - set-cookie customer device
   - 403
12. generar token random
13. filtrar customerSessions expiradas
14. insertar nueva customerSession en snapshot
15. audit(PORTAL_LOGIN_SUCCESS)
16. await writeDb(db)
17. set-cookie ariad_customer_session + ariad_customer_device
18. 200 con publicCustomerState + catalog
```

### Llamadas DB del login cliente, en orden

| Paso | Llamada | Tablas tocadas | Volumen aproximado |
| --- | --- | --- | --- |
| 3 | `readDb()` | Todas las tablas runtime legacy via `readPostgresLegacyDb()` | O(total de filas runtime). Lee `select *` por tabla, sin limite ni paginacion. |
| 4 | mutacion en snapshot por `ensureCustomerDevice()` | `customer_devices` en snapshot | 0/1 device nuevo o actualizacion `lastSeen`. Se persiste solo si luego hay `writeDb`. |
| 5 | mutacion en snapshot por `enforcePortalRateLimit()` | `portal_rate_limits` en snapshot | Inserta 1 intento por login, incluso si login exitoso. |
| 7 | busqueda JS | `customer_users` ya cargada | O(numero de customer users) en memoria. No usa indice SQL aunque la tabla tenga `email unique`. |
| 8 | `verifyPassword()` | no DB | `crypto.scrypt`; no hay bcrypt. |
| 10 | busqueda JS | `customer_clients` ya cargada | O(numero de customer clients) en memoria. |
| 13-15 | mutacion en snapshot | `customer_sessions`, `audit_events` en snapshot | Limpia expiradas, inserta 1 sesion, inserta 1 audit event. |
| 16 | `writeDb(db)` | Reemplazo runtime completo en Postgres | Construye plan completo, toma advisory lock y llama `replacePostgresLegacyRuntime()`. Esta ruta puede terminar en `TRUNCATE` + reinsercion de tablas runtime. |

No hay logs de timing por paso en codigo. El tiempo real de produccion debe medirse desde navegador o logs de request. Por estructura, el coste dominante esperado no es `scrypt`, sino `readDb()` completo + `writeDb(db)` completo + lock/wait en Postgres.

### Handler operador

El handler de login operador empieza en `server.js:4383`.

Ruta:

```text
POST /api/login
```

Flujo equivalente:

```text
1. parseJson(req)
2. normalizar email/password
3. db = await readDb()
4. portalRateLimitState(db, req, "operator_login", email)
5. buscar user en db.users
6. si rate limit excedido: audit + writeDb + 429
7. si password falla: recordPortalRateLimitAttempt + audit + writeDb + 401
8. si user inactivo: 403 sin writeDb
9. ensureDevice(db, req)
10. si admin y device no trusted: ramas de setup/PIN/aprobacion con audit + writeDb
11. generar token
12. filtrar sessions expiradas
13. insertar session en db.sessions
14. audit(LOGIN_SUCCESS)
15. await writeDb(db)
16. set-cookie ariad_session + ariad_device
17. 200
```

Riesgo igual: `readDb()` completo y `writeDb(db)` completo. En operador hay ademas validacion de dispositivo admin y PIN operativo.

## 2. Almacenamiento de sesiones

### Modelo actual

Las sesiones son una mezcla de cookie opaca + tabla persistida:

- Cookie cliente: `ariad_customer_session`, valor token random. No contiene payload firmado; funciona como bearer token opaco.
- Cookie device cliente: `ariad_customer_device`.
- Cookie operador: `ariad_session`.
- Cookie device operador: `ariad_device`.
- En DB se guarda solo `token_hash`, no el token claro.

### Tablas Postgres

`operator_sessions`, definida en `migrations/001_initial_postgres.sql:77`:

```text
id uuid primary key
user_id uuid not null references operator_users(id) on delete cascade
token_hash text not null unique
device_id uuid references operator_devices(id) on delete set null
version integer not null
last_seen_at timestamptz
expires_at timestamptz not null
created_at timestamptz not null
legacy_json jsonb not null default '{}'::jsonb
```

Indices:

```text
operator_sessions_user_id_idx on user_id
operator_sessions_expires_at_idx on expires_at
```

`customer_sessions`, definida en `migrations/001_initial_postgres.sql:243`:

```text
id uuid primary key
user_id uuid not null references customer_users(id) on delete cascade
client_id uuid not null references customer_clients(id) on delete cascade
token_hash text not null unique
device_id uuid references customer_devices(id) on delete set null
version integer not null
last_seen_at timestamptz
expires_at timestamptz not null
created_at timestamptz not null
legacy_json jsonb not null default '{}'::jsonb
```

Indices:

```text
customer_sessions_client_idx on client_id
customer_sessions_expires_at_idx on expires_at
```

Observacion: no hay indice explicito por `token_hash` aparte del `unique`, que en Postgres crea indice unico.

### TTL

Constantes en `server/config/constants.js`:

- Operador: `sessionMaxAgeSeconds = 60 * 60 * 8` -> 8 horas.
- Cliente: `customerSessionMaxAgeSeconds = 60 * 60 * 24 * 14` -> 14 dias.

### Renovacion

No hay renovacion sliding de `expiresAt`. Se actualiza `lastSeenAt`/`lastSeenAtMs`, pero el vencimiento queda fijo desde login.

### Invalidacion

- Logout cliente: `POST /api/portal/logout`, `server/portal/portal-routes.js:429`, filtra `db.customerSessions` removiendo `tokenHash` y hace `writeDb(db)`.
- Logout operador: `POST /api/logout`, `server.js:4712`, filtra `db.sessions`, cierra streams FRP del usuario y hace `writeDb(db)`.
- Expiracion: en `readDb()` / helpers se filtran sesiones vencidas del snapshot, pero bajo Postgres las escrituras incidentales estan bloqueadas por `runtimeSnapshotWritesEnabled = false`.
- Usuario/cliente bloqueado: `getCurrentCustomerContext()` descarta sesion si user/client faltan o bloqueados; bajo Postgres no persiste esa limpieza por snapshot.

### Que pasa tras restart de Render

La hipotesis anterior "sesiones en memoria del proceso -> cada restart desloguea a todos" queda desmentida por codigo.

Las sesiones viven en Postgres cuando `ARIAD_STORAGE_DRIVER=postgres`, por tanto deberian sobrevivir reinicios del contenedor si la cookie sigue presente y la fila de sesion no fue eliminada.

Riesgo real distinto: un `writeDb(db)` legacy con snapshot viejo puede reemplazar `customer_sessions` / `operator_sessions` y perder sesiones creadas por otra request concurrente. Eso si puede verse como "me desloguea al azar", pero no por memoria de proceso.

## 3. Rutas relacionadas a sesiones

### Cliente portal

| Ruta/helper | Archivo:linea | DB actual |
| --- | --- | --- |
| `GET /api/portal/session` | `server/portal/portal-routes.js:184` | `getCurrentCustomerContext()` -> `readDb()` completo; sin `writeDb()` bajo Postgres. |
| `POST /api/portal/register` | `server/portal/portal-routes.js:227` | `readDb()` completo; multiples `writeDb()` en validaciones, rate limit, creacion de client/user/session/token email/audit. |
| `POST /api/portal/verify-email` | `server/portal/portal-routes.js:193` | `readDb()` completo; `writeDb()` para marcar token usado, verificar email, auditar. |
| `POST /api/portal/resend-verification` | `server/portal/portal-routes.js:342` | `getCurrentCustomerContext()` + `writeDb()` para rate limit/token/audit y read/write adicional tras envio email. |
| `POST /api/portal/login` | `server/portal/portal-routes.js:373` | `readDb()` completo; `writeDb()` en rate limit, fallo, bloqueo y exito. |
| `POST /api/portal/logout` | `server/portal/portal-routes.js:429` | `readDb()` completo; `writeDb()` para remover sesion. |
| `GET /api/portal/orders/events` | `server/portal/portal-routes.js:447` | `getCurrentCustomerContext()` -> `readDb()` completo; audit granular via `persistAuditEventOnly()` bajo Postgres. |
| `requireCustomer(context,res)` | `server.js:3262` | No toca DB, solo valida context ya cargado. |
| `getCurrentCustomerContext(req)` | `server.js:3229` | `readDb()` completo, asegura device, busca sesion/user/client; evita `writeDb()` bajo Postgres por `runtimeSnapshotWritesEnabled=false`. |
| `ensureCustomerDevice(db,req)` | `server.js:1004` | Muta `customer_devices` en snapshot; se persiste solo si una ruta posterior llama `writeDb()`. |

### Operador/admin

| Ruta/helper | Archivo:linea | DB actual |
| --- | --- | --- |
| `GET /api/session` | `server.js:4153` | `getCurrentUser()` al inicio de `handleApi`; luego `readDb()` completo para payload de panel. |
| `POST /api/register` | `server.js:4340` | `readDb()` completo; `writeDb()` para crear operador/admin y auditar. |
| `POST /api/login` | `server.js:4383` | `readDb()` completo; `writeDb()` en rate limit, fallo, device setup/PIN/aprobacion y exito. |
| `POST /api/logout` | `server.js:4712` | `readDb()` completo; `writeDb()` para remover sesion y cerrar streams. |
| `POST /api/password-reset/request` | `server.js:4482` | `readDb()` completo; `writeDb()` para rate limit/token/audit; read/write adicional en fallo email. |
| `POST /api/password-reset/confirm` | `server.js:4540` | `readDb()` completo; `writeDb()` para usar token y actualizar password. |
| `POST /api/password-reset` | `server.js:4567` | Setup/admin reset legacy; `readDb()` completo y `writeDb()`. |
| `POST /api/me/password` | `server.js:4618` | `readDb()` completo y `writeDb()` para cambiar password. |
| `POST /api/me/operator-pin` | `server.js:4640` | `readDb()` completo y `writeDb()` para PIN. |
| `POST /api/me/revoke-devices` | `server.js:4674` | `readDb()` completo y `writeDb()` para revocar devices/sesiones. |
| `POST /api/me/device-approvals/:id/approve` | `server.js:4693` | `readDb()` completo y `writeDb()` para aprobar device. |
| `getCurrentUser(req)` | `server.js:3188` | `readDb()` completo; evita writes incidentales bajo Postgres salvo rutas que luego escriben. |

## 4. Alcance de `writeDb(db)` y `readDb()` en `server/`

### Definiciones centrales

| Archivo:linea | Funcion | Nota |
| --- | --- | --- |
| `server.js:769` | `readDb()` wrapper | Normaliza snapshot y, bajo JSON, puede persistir normalizaciones. Bajo Postgres evita escritura incidental. |
| `server.js:871` | `writeDb(db)` wrapper | Llama `storage.writeDb(db)`. Bajo Postgres entra al reemplazo runtime legacy. |
| `server/db/postgres-storage.js:84` | `readDb()` Postgres | Llama `readPostgresLegacyDb()`. |
| `server/db/postgres-storage.js:121` | `writeDb(db)` Postgres | Serializa en `writeQueue`, reintenta y envuelve errores. |
| `server/db/json-storage.js:44` | `writeDb(db)` JSON | Reemplazo atomico de `users.json`. |
| `server/db/json-storage.js:59` | `readDb()` JSON | Lee `users.json`. |

### Fase B - auth/sesiones

Prioridad B.2/B.3:

```text
server/portal/portal-routes.js:
  196,202,210,223  POST /api/portal/verify-email
  233,239,245,255,264,317,322,324,326,328  POST /api/portal/register
  350,355,359,362,364,366,368  POST /api/portal/resend-verification
  377,382,389,395,418  POST /api/portal/login
  431,434  POST /api/portal/logout

server.js:
  3191,3198,3203,3216,3225  getCurrentUser
  3231,3235,3244,3251,3258  getCurrentCustomerContext
  4350,4376  POST /api/register
  4387,4395,4404,4422,4438,4448,4473  POST /api/login
  4490,4506,4523,4527,4529,4534  POST /api/password-reset/request
  4548,4563  POST /api/password-reset/confirm
  4583,4614  POST /api/password-reset
  4626,4636  POST /api/me/password
  4642,4667  POST /api/me/operator-pin
  4676,4688  POST /api/me/revoke-devices
  4696,4708  POST /api/me/device-approvals/:id/approve
  4715,4718  POST /api/logout
```

Nota: las llamadas `getCurrentUser` y `getCurrentCustomerContext` ya no escriben bajo Postgres por `runtimeSnapshotWritesEnabled=false`, pero siguen leyendo snapshot completo en cada request autenticada.

### Fase C futura - orders/pagos/FRP/panel

Rutas fuera de B.1/B.2, pero aun peligrosas bajo Postgres si siguen usando `writeDb(db)`:

```text
server/portal/portal-routes.js:
  553,561,571,576,601,653,674,681,696,838  POST /api/portal/orders/frp
  882,900  PATCH /api/portal/orders/:id/connection-ready
  927,937,971  POST /api/portal/orders/:id/notify-connected
  1001,1026,1052  POST /api/portal/orders/:id/items/:itemId/ready
  1127  POST /api/portal/orders/:id/items/:itemId/cancel
  1198  POST /api/portal/orders/:id/abort
  1261,1268,1285,1324  PATCH /api/portal/orders/:id/payment-proof
  1403  POST /api/portal/orders/:id/price-decision

server/frp/frp-routes.js:
  77,84,102  FRP pricing policy
  113,179  FRP provider create
  188,223  FRP provider archive
  231,263,278,343,381  FRP provider patch
  394  FRP pending changes read
  417,436,464,479  FRP pending change actions
  486,509,520,594  FRP order create
  603,620  FRP order checklist
  629,667  FRP payment proof
  676,691,741  FRP payment review
  751,760  FRP job checklist
  767,777,803  FRP job ready
  820,830,857  FRP job take specific
  865,874,895  FRP take next
  905,937,954  FRP finalize
  976,1003,1042  FRP direct finalize
  1053,1083,1106  FRP cancel
  1116,1133,1146  FRP review

server.js:
  3145  publishPortalOrdersForAll async write
  4099,4107,4115,4121,4128  daily close
  4154  GET /api/session payload read
  4210,4225,4258  admin customer confirm
  4278,4320  admin VIP toggle
  4336  presence read
  4725,4732,4746,4759,4801,4807,4830  client master/link admin
  4835,4842,4848,4854  users/tickets/clients/pricing reads
  4862,4882,4901,4929,4941,4963  pricing mutations
  4981,4986,4993,5028,5075,5083,5132,5140,5194,5202,5237,5245,5251,5276  legacy tickets/clients
  5283,5343  user update
  5359  operator FRP SSE initial read
  5417,5425,5436,5449  technician status/switch
  5542  verification link static route read
```

Conclusion: B.2 debe empezar por auth/sesiones, pero no debe venderse como correccion completa de deadlocks. Aun quedara Fase C para orders/pagos/FRP/panel.

## 5. Tests existentes

### Tests que cubren login/sesion

| Test | Tipo | Cobertura |
| --- | --- | --- |
| `test/phase4.smoke.test.js` | Integracion contra servidor real local, storage JSON por defecto | Registro cliente, login cliente, GET orders, SSE cliente, GET `/api/session`, registro admin, login admin y flujo FRP amplio. |
| `test/phase5.technician-swap.test.js` | Integracion contra servidor real local, storage JSON por defecto | Login operador, rate limit de login operador, logout operador, GET `/api/session`, cierre de stream FRP al logout, multiples casos de presencia/swap. |
| `test/postgres-storage-guard.test.js` | Unitario puro | Guard de reemplazo destructivo Postgres; no prueba login real. |
| `test/frp-payment-review-postgres.test.js` | Unitario de funciones SQL/estado FRP | Prueba funciones granulares FRP, no login/sesiones. |
| `test/portal-customer-confirm-postgres.test.js` | Unitario de admin customer Postgres | No cubre login/sesiones. |

### Limitacion critica de tests actuales

Los smoke tests arrancan `server.js` con `ARIAD_DATA_DIR` temporal, pero no setean `ARIAD_STORAGE_DRIVER=postgres` ni `DATABASE_URL`. Por default `storageDriverFromEnv()` usa `json`. Por tanto los flujos de login/sesion estan probados contra JSON, no contra Postgres real.

No encontre test que cubra:

- Login cliente exitoso contra Postgres real.
- Login cliente fallido contra Postgres real.
- Logout cliente contra Postgres real.
- Sesion cliente expirada contra Postgres real.
- Login concurrente contra Postgres.
- Logout concurrente contra request de session.
- Reintento/deadlock en auth.
- Preservacion de sesiones ante restart bajo Postgres.

Para B.2, esto obliga a crear tests unitarios granulares de las nuevas funciones Postgres y, si es posible, un test de integracion con Postgres disposable. Si no hay Postgres local/staging, minimo usar mocks de `client.query` con orden de queries verificado.

## 6. Storage driver y compatibilidad

Decision del driver:

```text
ARIAD_STORAGE_DRIVER unset -> json
ARIAD_STORAGE_DRIVER=json -> createJsonStorage()
ARIAD_STORAGE_DRIVER=postgres -> createPostgresStorage()
otro valor -> error
```

Valores aceptados: `json`, `postgres`.

Compatibilidad si migramos login a SQL granular:

- JSON debe seguir funcionando para tests actuales y modo local simple.
- Postgres debe usar ruta granular nueva para evitar `writeDb(db)`.
- Esto implica rama explicita por driver en handlers o helpers:

```text
if (storage.driver === "postgres") {
  usar helper SQL granular
} else {
  conservar flujo legacy readDb/writeDb
}
```

Riesgo: hoy `portal-routes.js` recibe helpers por inyeccion desde `server.js`, pero no recibe `storage.driver` ni helpers Postgres de auth. B.2 probablemente necesita introducir un modulo `server/db/postgres-auth.js` y pasar funciones al router, o encapsular el branch en helpers inyectados desde `server.js`.

## 7. Senales de produccion post-Fase A

Bryams debe revisar antes de autorizar B.2:

### Deadlocks

- Render logs: contar ocurrencias de `deadlock detected` por hora.
- Postgres logs/dashboard: buscar `40P01`.
- Comparar ventana antes/despues de `POSTGRES_RUNTIME_WRITE_RETRIES=1`.

Meta: no necesariamente cero todavia, pero no deben venir en cadena ni terminar en OOM.

### Tiempo real de login

Medir desde navegador:

- DevTools -> Network -> `POST /api/portal/login`.
- Registrar `Waiting for server response` y `Duration`.
- Hacer 5 intentos espaciados, no concurrentes.

Meta provisional Fase A: menor a 3 segundos.

### Perdida de sesiones

Prueba manual:

1. Iniciar sesion cliente.
2. Mantener pagina abierta 30-60 min.
3. Revisar si `GET /api/portal/session` sigue devolviendo customer.
4. Cruzar con Render Events: si no hubo restart y la sesion desaparece, sospechar perdida por `writeDb()` legacy concurrente.

### Memoria

- Render metrics: memoria debe mantenerse por debajo de 75% de 2 GB durante 30 min como minimo.
- Si sube linealmente aun sin crashes, Fase B debe acelerarse.

## 8. Riesgos detectados para B.2/B.3

1. `readDb()` sigue en el path de validacion de sesion.
   - Aunque no escriba bajo Postgres, cada request autenticada carga snapshot completo.
   - Migrar solo login/logout reduce escrituras peligrosas, pero no elimina costo de lectura.

2. Login y rate limit estan mezclados.
   - `enforcePortalRateLimit()` muta `portalRateLimits` dentro del snapshot.
   - En Postgres granular, rate limit debe ser SQL propio o alternativa in-memory/DB, no depender de `writeDb()`.

3. `ensureCustomerDevice()` muta device en snapshot.
   - Login exitoso y fallido persisten esa mutacion con `writeDb()`.
   - B.2 necesita decidir si device tracking sigue en SQL granular o si se reduce para auth.

4. Auditoria esta parcialmente resuelta.
   - Existe `insertAuditEvent()` granular para Postgres.
   - B.2 debe usarlo en vez de meter audit en snapshot y luego `writeDb()`.

5. Cookies no son stateless sessions.
   - Son tokens opacos con hash en DB. Esto esta bien, pero obliga a lookup SQL por `token_hash` para cada session check si se migra correctamente.

6. Sin PR Preview/staging.
   - Riesgo alto de desplegar auth rota a produccion.
   - B.2 deberia ir con feature flag tipo `POSTGRES_AUTH_GRANULAR=1` o branch por driver probado localmente, y rollback claro a legacy.

7. `writeDb()` legacy queda amplio fuera de auth.
   - Aunque B.2 salga bien, orders/pagos/FRP todavia pueden provocar deadlocks.
   - No declarar causa raiz cerrada hasta eliminar `writeDb()` de rutas web bajo Postgres.

## Recomendacion para B.2

No migrar "todo auth" de golpe. Hacer una rebanada pequena:

1. Crear helpers Postgres granulares para:
   - customer login success/fail/rate-limit
   - customer logout
   - customer session lookup
2. Mantener JSON legacy intacto.
3. Usar branch por driver.
4. Tests unitarios de helpers SQL con `client.query` mockeado y orden de queries.
5. Tests de smoke existentes deben seguir verdes en JSON.
6. Solo despues migrar operador login/logout/session.

Primer objetivo medible de B.2: `POST /api/portal/login`, `POST /api/portal/logout` y `GET /api/portal/session` no deben llamar `writeDb(db)` bajo `ARIAD_STORAGE_DRIVER=postgres`.
