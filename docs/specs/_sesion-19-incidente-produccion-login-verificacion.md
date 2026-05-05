# Sesion 19 - Incidente produccion login y verificacion Gmail

Fecha: 2026-05-05

## Estado

Incidente activo en produccion. No subir deploy nuevo ni empujar el commit del visor de comprobantes hasta rescatar primero el archivo de datos.

Commit local listo pero no desplegado:

- `62b8d48 Add FRP operator proof viewer`

## Sintoma reportado

- Cliente no puede iniciar sesion en `https://ariadgsm.com`.
- Consola del navegador muestra 500 en:
  - `GET /api/portal/session`
  - `GET /api/portal/active-technician`
  - `POST /api/portal/login`
- Mensaje visible:
  - `Unexpected non-whitespace character after JSON at position 4866635 (line 16670 column 2)`
- Varios clientes no pudieron validar Gmail. Al abrir el enlace de validacion, terminaban en la web sin completar la validacion.

## Evidencia tomada en produccion

Comandos ejecutados desde esta maquina el 2026-05-05 aprox. 17:36 Lima:

```powershell
curl.exe -i --max-time 20 https://ariadgsm.com/api/health
curl.exe -i --max-time 20 https://ariadgsm.com/api/portal/session
curl.exe -i --max-time 20 https://ariadgsm.com/api/portal/catalog
curl.exe -i --max-time 20 "https://ariadgsm.com/cliente?verifyEmail=test"
```

Resultados:

- `/api/health` responde 200, por tanto el proceso web esta vivo.
- `/api/portal/session` responde 500 con error de parseo JSON.
- `/api/portal/catalog` responde 500 con el mismo error de parseo JSON.
- `/cliente?verifyEmail=test` responde 200 y sirve `AriadGSM Portal Cliente`, por tanto la ruta estatica `/cliente` existe en produccion.

Evidencia adicional desde Render Shell, recibida por captura:

- `sourceSha256`: `db29bed9166665c510f13b7389de3161c7a989e21b8434fd950d06c6313a5e38`
- `parseOk`: false
- error: `Unexpected non-whitespace character after JSON at position 4866635 (line 16670 column 2)`

Conclusion: el `users.json` real del persistent disk esta corrupto. La migracion PostgreSQL queda bloqueada hasta rescatar el JSON.

## Hechos del codigo real

- `server.js:336` define `readDb()`.
- `readDb()` lee `users.json` y ejecuta `JSON.parse(raw)`.
- `server.js:440` define `writeDb(db)` con escritura directa sobre `users.json`.
- `server.js:2753` define `getCurrentCustomerContext(req)`.
- `getCurrentCustomerContext()` llama `readDb()`, crea o actualiza dispositivo cliente y termina escribiendo `users.json` aun cuando no hay sesion de cliente.
- `server/portal/portal-routes.js:170` usa `readDb()` para `/api/portal/catalog`.
- `server/portal/portal-routes.js:175` usa `readDb()` para `/api/portal/active-technician`.
- `server/portal/portal-routes.js:180` usa `getCurrentCustomerContext()` para `/api/portal/session`.
- `server/portal/portal-routes.js:189` usa `readDb()` para `/api/portal/verify-email`.
- `server/portal/portal-routes.js:369` usa `readDb()` para `/api/portal/login`.
- `public/portal.js:26` llama `loadSession()` al arrancar.
- `public/portal.js:34` ejecuta `applyEmailVerification` solo despues de que `loadSession()` termina bien.
- `public/portal-modules/session.js:7` carga en paralelo `/api/portal/session` y `loadActiveTechnician()`.
- `public/portal-modules/deep-links.js:5` procesa `verifyEmail`.
- `public/portal-modules/deep-links.js:10` envia el token a `/api/portal/verify-email`.
- `render.yaml:12` configura `ARIAD_DATA_DIR=/opt/render/project/src/storage`.
- `render.yaml:20` declara un persistent disk montado en `/opt/render/project/src/storage`.

## Criterios externos usados

- Node.js documenta que es inseguro usar `fsPromises.writeFile()` varias veces sobre el mismo archivo sin esperar a que la promesa anterior termine. Fuente: https://nodejs.org/api/fs.html
- Render documenta que los persistent disks preservan cambios de filesystem entre deploys y reinicios. Fuente: https://render.com/docs/disks
- Render documenta que se puede iniciar Shell desde el dashboard del servicio. Fuente: https://render.com/docs/ssh
- Render documenta que un rollback de codigo no revierte el estado de un disk. Fuente: https://render.com/docs/rollbacks

## Inferencias

- El archivo persistente `users.json` en Render probablemente esta corrupto.
- El error "Unexpected non-whitespace character after JSON" indica que hay un JSON valido seguido por bytes extra, o una escritura concatenada/parcial.
- El login no esta caido por credenciales; esta caido porque cualquier endpoint que necesita `readDb()` falla antes de validar usuario.
- La validacion Gmail queda bloqueada por dos vias:
  - Si `users.json` esta corrupto, `/api/portal/verify-email` tambien falla.
  - Aunque el enlace llegue a `/cliente`, `public/portal.js` ejecuta primero `loadSession()`. Si `/api/portal/session` cae, `applyEmailVerification()` no corre y el token no se procesa.

## Supuestos debiles

- No hemos visto aun el archivo real `/opt/render/project/src/storage/users.json`.
- No sabemos si los tokens Gmail siguen vigentes o si vencieron durante el incidente.
- No sabemos si Render tiene `ARIAD_CUSTOMER_PUBLIC_URL=https://ariadgsm.com` configurado fuera de `render.yaml`.
- No sabemos si algun cliente abrio enlaces desde Gmail que reescribieron parametros o bloquearon cookies.

## Riesgos

- Subir el commit actual no arregla `users.json`; podria reiniciar el servicio contra el mismo archivo corrupto.
- Un rollback de codigo no rescata el disk, porque el disk retiene estado aparte del deploy.
- Reparar `users.json` sin backup puede perder clientes, ordenes, comprobantes o tokens de verificacion.
- Seguir escribiendo el JSON sin serializar escrituras puede repetir la corrupcion bajo trafico real.
- La pagina muestra el mensaje tecnico del servidor al cliente. Eso empeora soporte y filtra detalles internos.

## Decision

Primero se rescata el dato persistente. Despues se corrige la arquitectura de escritura y el flujo Gmail. Despues se despliega.

No se debe hacer deploy del visor como intento de arreglo, porque seria un parche sin atacar la causa.

Actualizacion de decision: Bryam pidio no tratar esto como parche. La solucion raiz queda documentada en `docs/specs/_sesion-19-arquitectura-postgres-monolito-modular.md`: PostgreSQL como fuente de verdad y monolito modular como etapa correcta antes de microservicios.

## Plan operativo de rescate

Ejecutar desde Render Shell del servicio `ariadgsm-ops`, no desde one-off job.

1. Congelar deploys mientras dura el rescate.

2. Entrar al directorio del disk:

```sh
cd /opt/render/project/src/storage
pwd
ls -lh
```

3. Crear backup antes de tocar nada:

```sh
cp users.json "users.json.corrupt-$(date -u +%Y%m%dT%H%M%SZ).bak"
wc -c users.json
```

4. Confirmar el punto de ruptura sin imprimir datos sensibles completos:

```sh
node - <<'NODE'
const fs = require("fs");
const p = "users.json";
const raw = fs.readFileSync(p, "utf8");
try {
  JSON.parse(raw);
  console.log("JSON OK");
} catch (error) {
  const match = String(error.message).match(/position (\d+)/);
  const pos = match ? Number(match[1]) : -1;
  console.error(error.message);
  console.error({ bytes: raw.length, pos });
  if (pos >= 0) {
    console.error(raw.slice(Math.max(0, pos - 120), Math.min(raw.length, pos + 120)));
  }
  process.exit(1);
}
NODE
```

5. Intentar reparar por corte exacto solo si el prefijo parsea:

```sh
node - <<'NODE'
const fs = require("fs");
const src = "users.json";
const raw = fs.readFileSync(src, "utf8");
const match = (() => {
  try {
    JSON.parse(raw);
    return null;
  } catch (error) {
    return String(error.message).match(/position (\d+)/);
  }
})();
if (!match) throw new Error("El JSON ya parsea; no se repara.");
const pos = Number(match[1]);
const candidate = raw.slice(0, pos);
const parsed = JSON.parse(candidate);
fs.writeFileSync("users.repaired.json", candidate.endsWith("\n") ? candidate : `${candidate}\n`);
console.log({
  users: parsed.users?.length || 0,
  customerUsers: parsed.customerUsers?.length || 0,
  customerClients: parsed.customerClients?.length || 0,
  customerEmailVerificationTokens: parsed.customerEmailVerificationTokens?.length || 0,
  customerOrders: parsed.customerOrders?.length || 0,
  frpOrders: parsed.frpOrders?.length || 0,
  audit: parsed.audit?.length || 0
});
NODE
```

6. Si `users.repaired.json` parsea y los conteos tienen sentido, reemplazar conservando el original:

```sh
node -e 'JSON.parse(require("fs").readFileSync("users.repaired.json", "utf8")); console.log("repaired JSON OK")'
mv users.json "users.json.broken-active-$(date -u +%Y%m%dT%H%M%SZ)"
cp users.repaired.json users.json
```

Resultado recibido por captura de Render Shell:

- `generatedAt`: `2026-05-05T23:24:24.110Z`
- `sourceSha256`: `db29bed9166665c510f13b7389de3161c7a989e21b8434fd950d06c6313a5e38`
- `sourceParseOk`: false
- `cutPosition`: `4866635`
- `repairedSha256`: `d4020e385c3b307616087b1a90fed0a3ea59d0683aa1c0182c82d2529f9413cb6`
- `repairedParseOk`: true
- conteos sanitizados:
  - `users`: 5
  - `customerClients`: 16
  - `customerUsers`: 16
  - `customerSessions`: 21
  - `customerDevices`: 82
  - `customerRequests`: 13
  - `customerOrders`: 13
  - `customerOrderItems`: 14
  - `frpOrders`: 13
  - `frpJobs`: 14
  - `tickets`: 0
  - `paymentLedgerEntries`: 13
  - `frpProviderCostHistory`: 8
  - `audit`: 790

Decision:

- El reemplazo queda habilitado solo como rescate operativo controlado.
- El backup corrupto ya existe y el candidato reparado existe.
- Esto no cierra la causa raiz. La causa raiz sigue siendo el uso de `users.json` como almacenamiento transaccional de produccion.

Resultado del reemplazo controlado:

- `users.repaired.json OK`.
- `users.json` activo parsea correctamente despues del reemplazo.
- Conteos activos sanitizados:
  - `users`: 5
  - `customerClients`: 16
  - `customerUsers`: 16
  - `customerOrders`: 13
  - `frpOrders`: 13
  - `frpJobs`: 14
  - `audit`: 790
- Endpoints verificados:
  - `/api/health`: HTTP 200.
  - `/api/portal/catalog`: HTTP 200.
  - `/api/portal/session`: HTTP 200.
- `/api/portal/session` devolvio un dispositivo nuevo y cookie `ariad_customer_device`.

Conclusion operativa:

- La caida de login/catalogo por JSON corrupto quedo recuperada.
- El incidente de Gmail debe probarse despues de esta recuperacion, porque la validacion dependia indirectamente de que `/api/portal/session` no fallara.
- Aunque el servicio volvio, no se considera solucion de raiz hasta mover persistencia transaccional a PostgreSQL o, como minimo temporal, agregar escritura atomica y backups rotativos.

Estado de tokens Gmail despues del rescate:

```json
{
  "total": 5,
  "activeUnused": 5,
  "expiredUnused": 0,
  "used": 0
}
```

Lectura:

- Hay 5 tokens de verificacion creados.
- Ninguno expiro.
- Ninguno fue consumido.
- Esto apoya la hipotesis de que los usuarios no pudieron completar la validacion mientras el portal fallaba por `users.json` corrupto.
- Todavia no prueba que el flujo de Gmail este sano; falta validar un enlace real con token activo.

Resultado de prueba manual posterior:

- Bryam probo un enlace real de Gmail despues del rescate de `users.json`.
- El enlace no verifico el correo.
- La navegacion llevo al portal AriadGSM otra vez.

Lectura actualizada:

- La caida por JSON corrupto explica el primer bloqueo general del portal.
- El flujo Gmail sigue abierto como posible segundo bug.
- El siguiente corte de diagnostico es revisar si el click genero `PORTAL_EMAIL_VERIFICATION_FAILED` en `audit`.
- Si hay audit de fallo, el backend recibio el token y lo rechazo.
- Si no hay audit de fallo, el frontend/link no esta enviando el token a `/api/portal/verify-email`.

Resultado audit posterior:

```json
{
  "counts": {
    "PORTAL_EMAIL_VERIFICATION_SENT": 15,
    "PORTAL_EMAIL_VERIFICATION_FAILED": 22,
    "PORTAL_EMAIL_VERIFIED": 9
  },
  "recent": [
    {
      "createdAt": "2026-05-05T23:32:10.085Z",
      "action": "PORTAL_EMAIL_VERIFICATION_SENT",
      "targetPresent": true,
      "reason": ""
    }
  ],
  "tokenState": {
    "total": 6,
    "activeUnused": 6,
    "expiredUnused": 0,
    "used": 0
  }
}
```

Lectura del audit:

- Despues del envio nuevo de `2026-05-05T23:32:10.085Z`, no aparece `PORTAL_EMAIL_VERIFICATION_FAILED` ni `PORTAL_EMAIL_VERIFIED`.
- Los tokens activos subieron a 6 y siguen sin usarse.
- Esto apunta a que el click no esta ejecutando el `POST /api/portal/verify-email`, o que el enlace abierto ya no conserva `?verifyEmail=`.
- No se debe regenerar masivamente tokens sin confirmar este corte, porque se podria crear ruido y seguir sin resolver el flujo.

## Segunda corrupcion despues del rescate

Despues de que Gmail finalmente verifico, se intento leer de nuevo `users.json` en Render Shell y el archivo volvio a fallar:

```txt
SyntaxError: Unexpected non-whitespace character after JSON at position 4874600 (line 16903 column 2)
```

Hechos:

- `users.json` habia quedado reparado y parseaba despues del primer reemplazo.
- Tras nuevas acciones reales de portal/Gmail, `users.json` volvio a quedar con contenido extra despues del JSON valido.
- `server.js` escribia `users.json` completo con `fs.writeFile`.
- `readDb()` tambien podia escribir si normalizaba o limpiaba datos vencidos.
- `publishPortalOrdersForAll()` tenia una escritura lanzada con `.catch(...)`, sin esperar en la ruta llamadora.

Fuente tecnica:

- Node.js documenta que es inseguro usar `fs.writeFile()` varias veces sobre el mismo archivo sin esperar la escritura anterior.
- Referencia: `https://nodejs.org/api/fs.html#fswritefilefile-data-options-callback`

Decision:

- Se aprueba hotfix de persistencia antes de seguir probando Gmail o regenerando correos.
- El hotfix no reemplaza PostgreSQL.
- El objetivo del hotfix es evitar corrupcion inmediata de archivo mientras se prepara la migracion estructural.

Cambio aplicado:

- `server.js`: se agrego cola global `dbWriteQueue` para serializar escrituras a `users.json`.
- `server.js`: `writeDb()` ahora escribe primero a archivo temporal.
- `server.js`: el JSON generado se valida con `JSON.parse` antes de reemplazar.
- `server.js`: antes del reemplazo, si el archivo activo parsea, se guarda `users.json.last-good.bak`.
- `server.js`: el reemplazo final se hace con `fs.rename`.
- `server.js`: la escritura interna de `readDb()` ahora usa `writeDb(db)`.

Riesgo residual:

- La cola reduce corrupcion fisica del archivo, pero no convierte `users.json` en base de datos transaccional.
- Persisten riesgos de perdida logica por lecturas/escrituras concurrentes sobre snapshots viejos.
- La solucion de raiz sigue siendo PostgreSQL con transacciones.

Validacion local del hotfix:

- `node --check server.js`: OK.
- `node --check public/app.js`: OK.
- `node --check public/portal.js`: OK.
- `node --check scripts/migration/users-json-to-postgres.mjs`: OK.
- `npm.cmd test`: 14/14 OK.
- Prueba local de estres con `ARIAD_DATA_DIR=.local-preview-data/write-stress`:
  - 80 requests concurrentes a `/api/portal/session`.
  - 80 respuestas HTTP 200.
  - `users.json` final parseo correctamente.
  - `users.json.last-good.bak` fue creado.

Lectura de la prueba de estres:

- El hotfix protege mejor contra corrupcion fisica del archivo.
- No demuestra seguridad transaccional completa.
- La prioridad siguiente sigue siendo desplegar el hotfix, reparar el JSON activo una ultima vez y continuar migracion PostgreSQL.

Validacion produccion despues del deploy:

- Fecha UTC observada: `2026-05-05T23:51:46Z`.
- `GET https://ariadgsm.com/api/health`: HTTP 200.
- `GET https://ariadgsm.com/api/portal/catalog`: HTTP 500.
- `GET https://ariadgsm.com/api/portal/session`: HTTP 500.
- Error activo:

```txt
Unexpected non-whitespace character after JSON at position 4874600 (line 16903 column 2)
```

Lectura:

- El deploy esta respondiendo.
- El archivo persistente activo seguia corrupto desde antes del hotfix.
- El hotfix no puede leer ni reparar automaticamente un `users.json` que ya no parsea.
- Siguiente accion: reparar una ultima vez `users.json` en Render Shell, ahora con el codigo de escritura segura ya desplegado.

Resultado Render Shell posterior:

```json
{
  "kind": "ariadgsm-final-json-repair-after-hotfix",
  "generatedAt": "2026-05-05T23:52:49.547Z",
  "sourceSha256": "f0970b38a3f02ec6b06328d1614d086d2ce51f9c39eee669a1f7dd6f91c11321",
  "sanitized": true,
  "sourceParseOk": true,
  "message": "users.json ya parsea; no se reemplazo"
}
```

Validacion externa final:

- `2026-05-05T23:53:12Z`:
  - `GET /api/health`: HTTP 200.
  - `GET /api/portal/catalog`: HTTP 200.
  - `GET /api/portal/session`: HTTP 200.
- Segunda lectura despues de una escritura de `/api/portal/session`:
  - `GET /api/portal/catalog`: HTTP 200.
  - `GET /api/portal/session`: HTTP 200.

Conclusion:

- Produccion quedo recuperada a nivel login/catalogo/session.
- El hotfix desplegado ya soporta al menos una escritura de sesion posterior sin repetir el error de parseo.
- La prueba Gmail puede retomarse, pero el cierre estructural sigue siendo PostgreSQL.

7. Reiniciar el servicio desde Render.

8. Verificar:

```sh
curl -i https://ariadgsm.com/api/health
curl -i https://ariadgsm.com/api/portal/catalog
curl -i https://ariadgsm.com/api/portal/session
```

9. Revisar Gmail despues del rescate:

```sh
node - <<'NODE'
const fs = require("fs");
const db = JSON.parse(fs.readFileSync("/opt/render/project/src/storage/users.json", "utf8"));
const now = Date.now();
const tokens = db.customerEmailVerificationTokens || [];
console.log({
  total: tokens.length,
  activeUnused: tokens.filter((token) => !token.usedAt && token.expiresAt > now).length,
  expiredUnused: tokens.filter((token) => !token.usedAt && token.expiresAt <= now).length,
  used: tokens.filter((token) => token.usedAt).length
});
NODE
```

No imprimir tokens reales en chat ni logs compartidos.

## Cambio estructural propuesto para aprobar despues del rescate

Archivos previstos:

- `server.js`
- `public/portal.js`
- `public/portal-modules/deep-links.js`
- pruebas existentes o nueva prueba de integridad de DB
- este documento

Cambios:

1. Cambiar `writeDb()` a una escritura serializada.
2. Escribir primero a un archivo temporal y luego hacer `rename` sobre `users.json`.
3. Evitar que `/api/portal/session` escriba en cada visita anonima si no hay cambio real que persistir.
4. Hacer que `verifyEmail` se procese antes o independiente de `loadSession()`, para que una falla de sesion/tecnico no bloquee el token.
5. Sanitizar errores de parseo DB hacia cliente con mensaje generico y log interno.
6. Verificar que produccion tenga `ARIAD_CUSTOMER_PUBLIC_URL=https://ariadgsm.com` si el correo debe abrir siempre el portal cliente publico.

## Pruebas esperadas para el parche

- `npm.cmd test`
- `node --check public/app.js`
- `node --check public/portal.js`
- `node --check public/portal-modules/deep-links.js`
- `node --check server.js`
- prueba local de escrituras concurrentes contra una copia temporal de DB
- prueba de deep link `?verifyEmail=` donde `/api/portal/session` falla pero el POST de verificacion se intenta primero
