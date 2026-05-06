# Sesion 20 - PostgreSQL permission-denial audit implementation

Fecha: 2026-05-06

Estado: implementado localmente, pendiente de deploy/validacion en Render.

Preflight base:

- `docs/specs/_sesion-20-postgres-permission-denials-granular-preflight.md`

## Objetivo

Ejecutar el segundo corte granular aprobado:

```text
auditoria granular para denegaciones de permisos compartidas
```

Este corte elimina reemplazos completos del runtime cuando la ruta solo necesita registrar auditoria y devolver `403`.

## Archivos modificados

- `server.js`

## Cambio aplicado

Se reemplazo el patron:

```js
audit(db, user.id, action, targetId, detail);
await writeDb(db);
```

por:

```js
const event = audit(db, user.id, action, targetId, detail);
await persistAuditEventOnly(event, {
  db,
  alreadyInDb: true,
  label: "permission_denied_*",
});
```

Helpers cambiados:

| Helper | Label granular | Resultado esperado |
| --- | --- | --- |
| `denySensitiveRoute` | `permission_denied_admin` | registra auditoria y responde `403` |
| `requireFrpAccess` | `permission_denied_frp_access` | registra auditoria y responde `403` |
| `requireActiveFrpTechnician` | `permission_denied_active_technician` | registra auditoria y responde `403` |
| `requireFrpCostManagerWithAudit` | `permission_denied_frp_cost` | registra auditoria y responde `403` |
| `requireFrpPaymentReviewer` | `permission_denied_frp_payment_review` | registra auditoria y responde `403` |

## Lo que no se toco

No se migraron en este corte:

- payment-review exitoso/rechazado;
- take/take-next exitoso;
- finalize/cancel/review;
- pricing provider updates exitosos;
- daily close mutations;
- login/register/reset;
- creacion de orden portal;
- subida de comprobantes.

Razon:

- esas rutas mutan negocio real;
- requieren transacciones por dominio;
- mezclarlas con permission denials aumentaria el riesgo y romperia el alcance aprobado.

## Contrato de seguridad

Hechos:

- Las ramas modificadas no mutan negocio cuando deniegan.
- El comportamiento visible sigue siendo `403`.
- En PostgreSQL la auditoria se inserta granularmente en `audit_events`.
- En JSON la auditoria sigue persistiendo mediante el flujo compatible del helper.

Inferencia:

- Una denegacion normal ya no deberia disparar `POSTGRES_RUNTIME_DESTRUCTIVE_WRITE_BLOCKED`.
- Si falla la escritura granular de auditoria, la denegacion debe seguir respondiendo `403` y no convertirse en reemplazo completo.

## Verificacion local

Comandos ejecutados:

```powershell
node --check server.js
npm.cmd test
git diff --check
```

Resultados:

- `node --check server.js`: OK.
- `npm.cmd test`: 20 tests OK.
- `git diff --check`: OK, con aviso esperado de line endings.
- Conteo `writeDb(` en `server.js`: bajo de 58 a 53 despues de este corte.

## Validacion pendiente post-deploy

En Render:

```bash
cd /opt/render/project/src
curl -fsS https://ops.ariadgsm.com/api/health
curl -fsS https://ariadgsm.com/api/health
npm run postgres:read-check -- --report /tmp/postgres-live-after-permission-denials.json --strict
cat /tmp/postgres-live-after-permission-denials.json
```

Smoke recomendado:

1. login admin;
2. login cliente;
3. abrir panel FRP en ambos;
4. ejecutar una accion normal de FRP sin errores 500;
5. si hay una denegacion controlada disponible, confirmar que devuelve `403`, no `500`;
6. confirmar que no aparece `POSTGRES_RUNTIME_DESTRUCTIVE_WRITE_BLOCKED`;
7. confirmar `postgres:read-check` vivo sin `--input` con `ok: true`.

## Siguiente paso despues de deploy

Si este corte queda estable, el siguiente paso tecnico debe pasar a preflight de mutaciones FRP core:

```text
FRP core transaccional: payment-review, take/take-next y finalize
```

No conviene mezclarlo con mas helpers globales sin un mapa nuevo de rutas, tablas afectadas, invariantes y pruebas.
