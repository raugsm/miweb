# AriadGSM Fase B.3 - Runbook auth granular

Fecha: 2026-05-08

Alcance: rollout y rollback operativo de la migracion auth granular Postgres para cliente y operador. Este runbook no cambia Render por API; Bryams aplica variables desde Render Dashboard.

## Variables nuevas

### `POSTGRES_AUTH_GRANULAR_CUSTOMER`

Default de codigo: `0`.

Valores:

- `0`: portal cliente usa auth legacy (`readDb()`/`writeDb(db)` en login/logout/session).
- `1`: portal cliente usa SQL granular para login, logout y `GET /api/portal/session`.

Condicion adicional: solo aplica si `ARIAD_STORAGE_DRIVER=postgres`. Con storage JSON, el flag no activa nada.

### `POSTGRES_AUTH_GRANULAR_OPERATOR`

Default de codigo: `0`.

Valores:

- `0`: operador usa auth legacy.
- `1`: operador usa SQL granular para login/logout y lookup de identidad en `getCurrentUser()`.

Condicion adicional: solo aplica si `ARIAD_STORAGE_DRIVER=postgres`.

## Que incluye B.3

- Modulo `server/db/postgres-auth.js`.
- Rate limit granular usando la tabla existente `portal_rate_limits`.
- Login/logout/session cliente gated por `POSTGRES_AUTH_GRANULAR_CUSTOMER`.
- Login/logout/session identity operador gated por `POSTGRES_AUTH_GRANULAR_OPERATOR`.
- Merge guard antes de `replacePostgresLegacyRuntime()` para preservar sesiones y devices creados por auth granular frente a snapshots legacy viejos.
- Tests unitarios con mocks de `client.query`.

## Que NO incluye B.3

- No aplica la migracion opcional de indices compuestos para `portal_rate_limits`.
- No migra registro cliente.
- No migra verificacion de email.
- No migra password reset.
- No migra orders/pagos/FRP del portal cliente.
- No migra el dashboard operador completo. `GET /api/session` valida identidad granular si el flag operador esta activo, pero el payload del panel sigue usando lectura legacy.
- No elimina `readDb()`/`writeDb(db)` fuera de auth.
- No separa credenciales ni toca la capa HMAC/audit endurecida.

## Deuda tecnica conocida

La migracion `003_portal_rate_limits_indices.sql` queda archivada en `migrations/pending/` y no se aplica en el rollout inicial de B.3.

Razon: los indices compuestos de `portal_rate_limits` son una optimizacion opcional. `CREATE INDEX IF NOT EXISTS` es idempotente, pero puede bloquear escrituras durante la creacion. La alternativa correcta para tablas con trafico es `CREATE INDEX CONCURRENTLY IF NOT EXISTS`, pero el runner actual ejecuta migraciones dentro de `BEGIN/COMMIT` y Postgres no permite `CONCURRENTLY` dentro de una transaccion.

Condiciones para aplicarla despues:

- medir tamano real de `portal_rate_limits` en produccion; o
- adaptar el migration runner para soportar migraciones sin transaccion; y
- cambiar la migracion a `CREATE INDEX CONCURRENTLY IF NOT EXISTS` si el tamano o trafico lo justifican.

## Deploy inicial con flags apagadas

1. Confirmar que los commits B.3 estan en `main` local y revisados.
2. Push a `origin main` solo cuando Bryams lo autorice.
3. En Render, mantener:

```text
POSTGRES_AUTH_GRANULAR_CUSTOMER=0
POSTGRES_AUTH_GRANULAR_OPERATOR=0
```

4. Esperar deploy.
5. Verificar:
   - `/api/health` responde 200.
   - Login cliente funciona como antes.
   - Login operador funciona como antes.
   - Logs sin `ReferenceError`, `SyntaxError`, `operatorLoginAttempt`, `customerLoginAttempt` fallando import.
   - Memoria sigue bajo el rango post-Fase A.

Decision: no activar flags hasta tener 2-4 horas sin `Instance failed` ni aumento de HTTP 500.

## Activar cliente primero

En Render Dashboard:

```text
POSTGRES_AUTH_GRANULAR_CUSTOMER=1
POSTGRES_AUTH_GRANULAR_OPERATOR=0
```

Render reinicia al guardar variables. No requiere redeploy manual.

Verificar inmediatamente:

- Login cliente en DevTools: objetivo menor a 2 segundos.
- `GET /api/portal/session` devuelve 200.
- Logout cliente devuelve 200 y limpia cookie.
- El portal vuelve a mostrar ordenes tras refresh.
- Logs no muestran escrituras legacy fallando desde:
  - `POST /api/portal/login`
  - `POST /api/portal/logout`
  - `GET /api/portal/session`

Validar durante 24-48h:

- Sesion cliente se mantiene 4h o mas con pestana abierta.
- Cero logout espontaneo sin accion del usuario.
- Deadlocks siguen en 0 o no aparecen en cadena.
- Memoria no sube respecto a Fase A.
- Rate limit de login no bloquea usuarios legitimos.

Rollback cliente:

```text
POSTGRES_AUTH_GRANULAR_CUSTOMER=0
```

Guardar variable en Render. El sistema vuelve al path legacy sin redeploy. Las sesiones creadas por granular viven en las mismas tablas, por lo que deben seguir siendo validas en legacy.

## Activar operador despues

Precondicion: cliente estable 24-48h.

En Render Dashboard:

```text
POSTGRES_AUTH_GRANULAR_CUSTOMER=1
POSTGRES_AUTH_GRANULAR_OPERATOR=1
```

Verificar:

- Login operador menor a 2 segundos.
- Logout operador cierra sesion y stream FRP.
- Admin device trust conserva semantica:
  - primer dispositivo requiere codigo de instalacion;
  - dispositivo nuevo posterior requiere PIN y aprobacion;
  - device mismatch invalida sesion admin.
- `GET /api/session` carga el panel operador.
- Operador puede procesar FRP normal.

Rollback operador:

```text
POSTGRES_AUTH_GRANULAR_OPERATOR=0
```

No redeploy. Si hay sintomas graves, tambien bajar customer a `0`.

## Logs a vigilar

Buscar:

- `ARIAD_STORAGE_DRIVER=postgres escritura fallo`
- `deadlock detected`
- `could not serialize access`
- `POSTGRES_RUNTIME_DESTRUCTIVE_WRITE_BLOCKED`
- `[postgres-auth] audit ... failed`
- `ADMIN_SESSION_DEVICE_REJECTED`
- HTTP 401 inesperado en `/api/portal/session`
- HTTP 500 en `/api/login`, `/api/portal/login`, `/api/session`, `/api/portal/session`

Interpretacion:

- Un `ADMIN_SESSION_DEVICE_REJECTED` aislado puede ser normal si el admin abre desde un device no autorizado.
- Repeticiones masivas de 401 en `/api/portal/session` indican problema de lookup granular o cookies.
- Deadlocks despues de B.3 significan que rutas fuera de auth siguen generando contencion; pasar a Fase C.

## Metricas de exito

- Cliente:
  - login 6-8s baja a menos de 2s;
  - sesion abierta 4h o mas;
  - cero perdida espontanea de sesion durante 24-48h.

- Operador:
  - login menor a 2s;
  - logout cierra stream FRP;
  - admin device flow igual al actual.

- Sistema:
  - cero `Instance failed`;
  - memoria estable bajo 50% de 2GB o no superior a Fase A;
  - deadlocks en 0 o no encadenados;
  - `npm test` verde antes de push.

## Si algo falla

1. Bajar el flag afectado a `0`.
2. Esperar restart Render.
3. Confirmar `/api/health`.
4. Probar login afectado.
5. Revisar logs exactos.
6. No hacer nuevo deploy hasta tener causa.

Rollback por flag es preferible a revert de commit porque:

- no cambia artefacto desplegado;
- reduce tiempo de recuperacion;
- mantiene el codigo listo para diagnostico con flags off.

## Proximo trabajo despues de B.3

Fase C debe migrar rutas calientes fuera de auth:

- orders/pagos/FRP del portal cliente;
- password reset y verificacion email;
- payload completo del dashboard operador;
- escrituras legacy restantes que siguen llamando `writeDb(db)`.
