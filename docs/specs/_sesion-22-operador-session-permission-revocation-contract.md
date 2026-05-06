# Sesion 22 - Panel trabajador: perdida de sesion y revocacion de permisos

Fecha: 2026-05-06

## Problema

El borde vivo era este:

```text
El panel FRP queda abierto y luego la sesion se pierde, el usuario hace logout
en otra pestana, o un admin revoca permisos/rol/canal/activo.
```

El riesgo no era solo que un boton pudiera fallar. El riesgo principal era que
un stream SSE ya abierto siguiera recibiendo estado FRP con una autorizacion
vieja.

## Fuentes externas usadas

- OWASP Authorization Cheat Sheet: los permisos deben validarse en cada request,
  sin confiar en que el cliente haya iniciado el flujo correctamente.
  https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
- OWASP Session Management Cheat Sheet: logout, destruccion de sesion y cambios
  de privilegio son eventos de seguridad que deben invalidar el estado de sesion
  aplicable.
  https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- MDN Server-sent events: `EventSource` reintenta automaticamente cuando la
  conexion se pierde; si el servidor corta un stream por revocacion, el cliente
  debe cerrar o refrescar su estado para no entrar en reconexion ambigua.
  https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events

## Hechos verificados

- Las mutaciones FRP criticas ya pasan por `requireFrpAccess`, por lo que un
  usuario sin FRP recibe 403 al intentar operar.
- `renderLayout()` ya detiene polling y SSE cuando el frontend queda sin usuario.
- El endpoint `GET /api/operator/frp/events` validaba permiso al conectar.
- El gap estaba despues de conectar: `publishFrpOps` no revalidaba `canUseFrp`
  para streams existentes.
- `canUseFrp(user)` no verificaba `user.active !== false`.

## Decision

El contrato queda asi:

1. `canUseFrp(user)` exige usuario activo y rol/canal FRP valido.
2. Cada `publishFrpOps` revalida al usuario del stream antes de enviar estado.
3. Si el usuario desaparece, queda inactivo o pierde FRP, el servidor envia un
   ultimo evento con `reason: "frp_access_revoked"` y `frp.enabled === false`,
   luego cierra el stream.
4. Si un usuario hace logout, el servidor cierra sus streams FRP abiertos con
   `reason: "operator_logged_out"`.
5. Si un admin cambia `active`, `role`, `workChannel` o `permissions`, el
   backend publica `operator_permissions_updated`; los streams que ya no tengan
   acceso reciben el cierre de revocacion.
6. El frontend, al recibir un payload FRP deshabilitado por revocacion/logout,
   ejecuta `stopFrpOpsLive()` y refresca `/api/session`.

## Contrato esperado

```text
Permisos cambian:
  PATCH /api/users/:id
  writeDb(db)
  publishFrpOps(db, "operator_permissions_updated")

Cada stream:
  buscar usuario actual
  si !usuario || !canUseFrp(usuario):
    enviar evento frp_access_revoked con frp.enabled=false
    cerrar stream
    no seguir emitiendo estado FRP

Frontend:
  recibe frp.enabled=false + reason de revocacion/logout
  stopFrpOpsLive()
  refreshSession()
```

## Riesgo cerrado

Se cierra el riesgo de exposicion visual viva por SSE stale tras revocacion de
permisos. Las mutaciones ya estaban protegidas, pero ahora tambien queda cerrado
el canal de lectura vivo del panel.

La prueba runtime cubre dos casos:

- operador pierde FRP por cambio de canal/permisos y el stream recibe
  `frp_access_revoked`;
- operador hace logout con el panel abierto y el stream recibe
  `operator_logged_out`.

## Riesgo residual

Este corte no reemplaza una politica global de revocacion de todas las sesiones
del usuario cuando cambian permisos. Lo que queda garantizado aqui es el panel
FRP: stream vivo cerrado, sesion refrescada y mutaciones denegadas.

## Validacion local

```bash
node --check server.js
node --check public/app.js
node --test test/phase3a.contract.test.js
node --test test/phase5.technician-swap.test.js
npm test
git diff --check
```

## Validacion post deploy

```bash
cd /opt/render/project/src
curl -fsS https://ops.ariadgsm.com/api/health
curl -fsS https://ariadgsm.com/api/health
npm run postgres:read-check -- --report /tmp/postgres-live-after-worker-session-permission-revocation.json --strict
cat /tmp/postgres-live-after-worker-session-permission-revocation.json
```

Resultado esperado:

```json
{ "ok": true, "tableProjectionMismatches": [] }
```
