# Sesion 19 - Cutover controlado de runtime a PostgreSQL

Fecha: 2026-05-06

## Objetivo

Definir el corte controlado desde `users.json` hacia PostgreSQL como fuente de verdad de runtime, sin repetir el error de hacer parches sobre produccion ni tocar endpoints sin contrato.

Este documento es una puerta de diseno. No activa PostgreSQL en runtime.

## Fuentes externas usadas como criterio

- Render Postgres recomienda usar Internal Database URL cuando el servicio y la base estan en la misma region para reducir latencia: https://render.com/docs/postgresql-creating-connecting
- node-postgres recomienda usar connection pool para aplicaciones web y mantener un numero limitado de conexiones: https://node-postgres.com/features/pooling
- node-postgres exige usar el mismo `client` para todos los statements dentro de una transaccion: https://node-postgres.com/features/transactions
- PostgreSQL define transacciones con `BEGIN`, `COMMIT` y `ROLLBACK`, y garantiza que los cambios de una transaccion sean visibles como una unidad al confirmar: https://www.postgresql.org/docs/17/tutorial-transactions.html

## Estado real antes del cutover

Hechos:

- Render Postgres existe y responde con `DATABASE_URL` interno.
- DDL aplicado:
  - `001_initial_postgres.sql`;
  - `002_preserve_client_link_suggestion_actor.sql`.
- Import inicial aplicado con `ok: true`.
- Snapshot importado:
  - `/tmp/postgres-import-source-users.json`;
  - `sourceSha256`: `b81bcac3be2aefaa93be14884458677e561a5717fb3c39fee7108ad2a780e52f`.
- Verificacion anti doble-importacion confirmada:
  - `targetEmpty: false`;
  - `wouldWrite: false`;
  - `ok: false`;
  - error esperado: `Dry-run bloqueado porque la DB destino no esta vacia.`
- El runtime de la aplicacion sigue leyendo y escribiendo `users.json`.
- `server.js` contiene la frontera actual:
  - `readDb()`;
  - `writeDb(db)`.
- `portal-routes.js` y `frp-routes.js` reciben `readDb` y `writeDb` por inyeccion.
- Ya existe `server/db/postgres.js` con pool, conexion y transacciones.

Inferencias:

- La frontera mas barata y menos riesgosa para el cutover es `readDb/writeDb`, no cada endpoint individual.
- Una reescritura endpoint por endpoint multiplicaria el riesgo de romper login, verificacion email, ordenes FRP, comprobantes, sesiones y tecnico activo.
- El primer adapter PostgreSQL puede reconstruir el shape legacy de `users.json` desde tablas SQL para mantener los serializers y reglas actuales sin reescribir todo el dominio en la misma fase.

Supuestos:

- La app tendra una sola instancia escritora en Render durante el primer cutover.
- `DATABASE_URL` seguira apuntando a la Internal Database URL.
- El objetivo inmediato es estabilidad y raiz de corrupcion JSON, no optimizacion fina de queries.
- La capa legacy `db` puede seguir existiendo temporalmente como contrato interno mientras se migran repositorios por dominio.

Riesgos:

- Si `readDb()` reconstruye todo el estado en cada request, puede ser suficiente para el volumen actual, pero no es la arquitectura final.
- Si `writeDb(db)` reemplaza muchas tablas completas en PostgreSQL, hay riesgo de carrera si dos requests escriben estados derivados de lecturas distintas.
- Si se activa Postgres sin modo rollback, cualquier bug de adapter impacta login y validaciones.
- Si se mantiene escritura dual JSON + Postgres en runtime, se puede crear divergencia. No se recomienda para el primer corte.

## Decision de arquitectura

Decision:

Crear un adapter de storage con seleccion explicita por variable de entorno:

- `ARIAD_STORAGE_DRIVER=json` usa el runtime actual de `users.json`.
- `ARIAD_STORAGE_DRIVER=postgres` usa PostgreSQL.
- Si la variable no existe, default inicial: `json`.

Razon:

- Permite deployar codigo sin activar Postgres.
- Permite smoke test en Render con `json` antes de mover el runtime.
- Permite rollback rapido cambiando variable de entorno a `json` y redeploy.
- Evita tocar todos los endpoints en la primera fase.

No se aprueba:

- Activar Postgres automaticamente solo porque `DATABASE_URL` existe.
- Hacer escritura dual por defecto.
- Reimportar `users.json` sobre una DB poblada.
- Reescribir endpoints FRP/portal en SQL directo antes de tener adapter probado.

## Contrato del adapter

El adapter debe exponer una interfaz minima:

```js
const storage = {
  driver: "json" | "postgres",
  readDb,
  writeDb,
  health,
};
```

`readDb()`:

- Devuelve el mismo shape que hoy espera `server.js`.
- Debe incluir todas las colecciones usadas por el runtime:
  - `users`;
  - `sessions`;
  - `devices`;
  - `deviceApprovals`;
  - `customerClients`;
  - `customerUsers`;
  - `customerSessions`;
  - `customerDevices`;
  - `customerRequests`;
  - `customerOrders`;
  - `customerOrderItems`;
  - `customerBenefits`;
  - `customerEmailVerificationTokens`;
  - `customerCounters`;
  - `masterClients`;
  - `clientLinks`;
  - `clientLinkSuggestions`;
  - `paymentLedgerEntries`;
  - `dailyCloses`;
  - `dailyCloseLines`;
  - `dailyAdjustments`;
  - `portalRateLimits`;
  - `clients`;
  - `audit`;
  - `tickets`;
  - `ticketCounters`;
  - `frpOrders`;
  - `frpJobs`;
  - `frpCounters`;
  - `frpProviderCostHistory`;
  - `frpPendingCostChanges`;
  - `passwordResetTokens`;
  - `passwordResetRequests`;
  - `pricingConfig`;
  - `activeTechnician`.

`writeDb(db)`:

- Debe ser transaccional en PostgreSQL.
- Debe usar un solo `client` dentro de la transaccion.
- Debe confirmar con `COMMIT` solo cuando todas las tablas necesarias quedan escritas.
- Debe hacer `ROLLBACK` si cualquier tabla falla.
- Debe preservar los hashes y secretos existentes sin exponerlos en reportes.

`health()`:

- Debe reportar:
  - driver activo;
  - conectividad Postgres si aplica;
  - migraciones aplicadas si aplica;
  - si el runtime esta en `json` o `postgres`.
- No debe exponer `DATABASE_URL`, hashes, tokens ni base64.

## Fases de cutover

### Fase A - Adapter sin activar

Objetivo:

- Crear modulo `server/db/storage.js`.
- Extraer el storage JSON actual a `server/db/json-storage.js`.
- Crear esqueleto Postgres en `server/db/postgres-storage.js`.
- Mantener `ARIAD_STORAGE_DRIVER=json` como default.

Validacion:

- `node --check`.
- `npm.cmd test`.
- Smoke local con driver JSON.
- `git diff` debe demostrar que el comportamiento default no cambio.

Riesgo aceptado:

- Bajo. No se activa Postgres.

### Fase B - Lector PostgreSQL de compatibilidad

Objetivo:

- Implementar `postgresStorage.readDb()` que reconstruya el shape legacy desde las tablas ya importadas.
- No implementar escritura Postgres todavia.
- Agregar script de comparacion:
  - source snapshot JSON;
  - Postgres readDb reconstruido;
  - conteos y campos publicos criticos.

Validacion:

- Comparar conteos de tablas ya importadas.
- Comparar endpoints publicos simulados contra snapshot:
  - catalogo;
  - session anonima;
  - tecnico activo;
  - ordenes cliente;
  - FRP state operador.

Riesgo aceptado:

- Medio. Hay transformacion SQL -> shape legacy, pero sin escritura runtime.

### Fase C - Escritura PostgreSQL transaccional

Objetivo:

- Implementar `postgresStorage.writeDb(db)` de forma transaccional.
- Primera version permitida: reemplazo controlado de tablas derivadas del shape completo.
- Version final posterior: repositorios por dominio con updates granulares.

Reglas:

- Usar `withTransaction`.
- No usar `pool.query` dentro de una transaccion multi-step.
- Bloquear escritura si falta migracion aplicada.
- Bloquear escritura si el driver no esta explicitamente en `postgres`.
- No escribir reportes con secretos.

Validacion:

- Fixture local con DB temporal o dry-run SQL planeado.
- Prueba de rollback forzado.
- Smoke completo con driver Postgres en entorno no productivo o instancia controlada.

Riesgo aceptado:

- Alto. Esta fase toca persistencia real, por eso no debe mezclarse con UI ni features.

### Fase D - Deploy con driver JSON

Objetivo:

- Subir codigo del adapter a produccion, pero con `ARIAD_STORAGE_DRIVER=json`.
- Confirmar que produccion sigue funcionando igual.

Validacion:

- `/api/health`.
- `/api/portal/catalog`.
- `/api/portal/session`.
- Login operador.
- Login cliente.
- Flujo de verificacion email.
- Modal de comprobantes.

Riesgo aceptado:

- Bajo. El codigo nuevo existe pero no esta activo.

### Fase E - Cutover controlado a PostgreSQL

Objetivo:

- Antes del cambio, congelar escrituras o elegir ventana de baja actividad.
- Crear backup/snapshot de `storage/users.json`.
- Confirmar Postgres poblado y migraciones aplicadas.
- Cambiar `ARIAD_STORAGE_DRIVER=postgres`.
- Redeploy.

Validacion inmediata:

- `/api/health` debe reportar driver `postgres`.
- `/api/portal/catalog` responde.
- `/api/portal/session` responde.
- Login operador responde.
- Login cliente responde.
- Verificacion email funciona.
- Orden FRP existente aparece.
- Subida/visor de comprobante no rompe.
- FRP operador puede ver cola/estado.

Rollback:

- Cambiar `ARIAD_STORAGE_DRIVER=json`.
- Redeploy.
- Confirmar que `users.json` sigue parseando.
- No reimportar automaticamente despues de rollback.

Riesgo aceptado:

- Alto pero controlado por bandera y rollback.

## Criterios para aceptar cutover

No se acepta activar `ARIAD_STORAGE_DRIVER=postgres` hasta cumplir:

- Repo limpio.
- Migraciones aplicadas.
- Import inicial documentado.
- Adapter documentado.
- `npm.cmd test` OK.
- `node --check` OK en archivos nuevos.
- Smoke local o Render controlado OK.
- Health reporta driver sin filtrar secretos.
- Plan de rollback escrito.
- Bryam aprueba explicitamente la activacion.

## Propuesta de archivos para Fase A

Archivos nuevos:

- `server/db/json-storage.js`
- `server/db/postgres-storage.js`
- `server/db/storage.js`
- `docs/specs/_sesion-19-cutover-postgres-runtime.md`

Archivos modificados:

- `server.js`
- `test/phase3a.contract.test.js` o nuevo test especifico de storage.
- `docs/specs/_sesion-19-cutover-postgres-runtime.md`

Nota:

- La Fase A debe mantener default JSON.
- La Fase A no debe requerir `DATABASE_URL` para correr tests locales.
- La Fase A no debe cambiar comportamiento publico.

## Siguiente paso unico

Antes de editar runtime:

1. Revisar `server.js` para separar `readDb/writeDb` sin cambiar logica.
2. Proponer el diff exacto de Fase A.
3. Esperar aprobacion.
4. Implementar adapter con default `json`.
5. Probar.
6. Documentar resultado.

## Resultado Fase A - Adapter sin activar

Fecha: 2026-05-06

Cambio aplicado:

- Se creo `server/db/json-storage.js`.
- Se creo `server/db/postgres-storage.js`.
- Se creo `server/db/storage.js`.
- `server.js` ya no contiene la escritura atomica directa de `users.json`; delega en `storage`.
- `readDb()` mantiene la normalizacion legacy en `server.js`.
- `writeDb(db)` delega en el adapter activo.

Decision implementada:

- `ARIAD_STORAGE_DRIVER=json` usa el storage JSON actual.
- Si `ARIAD_STORAGE_DRIVER` no existe, el default es `json`.
- `ARIAD_STORAGE_DRIVER=postgres` queda como stub bloqueado en Fase A.
- Activar `postgres` ahora falla de forma explicita: `ARIAD_STORAGE_DRIVER=postgres no esta implementado para runtime en Fase A.`

Lo que no se hizo:

- No se activo PostgreSQL en runtime.
- No se tocaron endpoints portal ni FRP.
- No se cambio `/api/health`.
- No se reimportaron datos.
- No se modificaron migraciones.

Lectura tecnica:

- La persistencia fisica quedo separada de la normalizacion de dominio.
- La frontera sigue siendo compatible con `readDb()` y `writeDb(db)`.
- El deploy con default `json` debe comportarse igual que antes.
- La siguiente fase ya puede trabajar sobre `postgresStorage.readDb()` sin arrastrar toda la logica de `server.js`.

Validacion local:

```sh
node --check server.js
node --check server/db/json-storage.js
node --check server/db/storage.js
node --check server/db/postgres-storage.js
npm.cmd test
```

Resultado:

- Checks de sintaxis: OK.
- `npm.cmd test`: 14/14 OK.

Siguiente paso unico:

- Commit y push de Fase A.

## Validacion publica post-Fase A

Fecha: 2026-05-06

Contexto:

- Commit local/remoto de Fase A: `71d3357 Add storage adapter gate`.
- Repo local: `main` alineado con `origin/main`.
- No se cambio `ARIAD_STORAGE_DRIVER`.
- El default esperado sigue siendo `json`.

Comandos ejecutados desde la maquina local:

```powershell
Invoke-WebRequest https://ariadgsm.com/api/health
Invoke-WebRequest https://ariadgsm.com/api/portal/catalog
Invoke-WebRequest https://ariadgsm.com/api/portal/session
```

Resultado:

- `https://ariadgsm.com/api/health`: HTTP 200, JSON, `ok: true`.
- `https://ariadgsm.com/api/portal/catalog`: HTTP 200, JSON.
- `https://ariadgsm.com/api/portal/session`: HTTP 200, JSON, crea dispositivo cliente anonimo.

Lectura:

- La web publica sigue respondiendo despues de subir Fase A.
- No hay evidencia publica de caida inmediata en health, catalogo ni sesion anonima.
- Esta validacion no prueba por si sola que Render ya este corriendo el commit `71d3357`, porque `/api/health` todavia no expone commit ni driver de storage.

Riesgo:

- Sin metadata de runtime en `/api/health`, la validacion post-deploy depende de observar el dashboard/logs de Render o de agregar una seccion sanitizada al health.

Siguiente paso unico:

- Agregar observabilidad minima y sanitizada a `/api/health`: `storageDriver`, `storageRuntimeImplemented` y, si se define por env, `releaseCommit`; sin exponer rutas locales, `DATABASE_URL`, hashes ni secretos.

## Resultado observabilidad minima de health

Fecha: 2026-05-06

Cambio aplicado:

- `/api/health` ahora incluye:
  - `storageDriver`;
  - `storageRuntimeImplemented`;
  - `releaseCommit` solo si existe una variable de entorno compatible.
- `server/db/json-storage.js` declara `runtimeImplemented: true`.
- `server/db/postgres-storage.js` declara `runtimeImplemented: false`.
- El health publico no expone:
  - rutas locales;
  - `DATABASE_URL`;
  - URLs de conexion;
  - hashes;
  - tokens;
  - base64;
  - datos de clientes.

Decision:

- `storageDriver` sirve para confirmar si runtime esta en `json` o `postgres`.
- `storageRuntimeImplemented` evita confundir `DATABASE_URL configurado` con `runtime Postgres listo`.
- `releaseCommit` se sanitiza a un SHA corto si Render u otro entorno lo define.

Validacion local:

```powershell
node --check server.js
node --check server/db/json-storage.js
node --check server/db/storage.js
node --check server/db/postgres-storage.js
npm.cmd test
```

Resultado:

- Checks de sintaxis: OK.
- `npm.cmd test`: 14/14 OK.

Prueba local directa de `/api/health`:

- Servidor temporal con:
  - `ARIAD_STORAGE_DRIVER=json`;
  - `ARIAD_DATA_DIR` aislado en `%TEMP%`;
  - `RENDER_GIT_COMMIT=71d3357abcdef1234567890`.
- Respuesta:

```json
{
  "ok": true,
  "appVersion": "frp-eligibility-v1",
  "sessionVersion": 7,
  "customerSessionVersion": 1,
  "trustedDeviceVersion": 3,
  "storageDriver": "json",
  "storageRuntimeImplemented": true,
  "releaseCommit": "71d3357abcde"
}
```

Lectura:

- La observabilidad minima funciona sin activar Postgres.
- La respuesta mantiene el runtime en JSON.
- La respuesta no incluye secretos ni rutas locales.

Siguiente paso unico:

- Commit y push, luego validar `https://ariadgsm.com/api/health` cuando Render despliegue.

## Validacion Render de health con metadata

Fecha: 2026-05-06

Contexto:

- Commit desplegado esperado: `43ec44f Expose storage runtime in health`.
- No se cambio `ARIAD_STORAGE_DRIVER`.
- El runtime esperado sigue siendo `json`.

Resultado de `https://ariadgsm.com/api/health`:

```json
{
  "ok": true,
  "appVersion": "frp-eligibility-v1",
  "sessionVersion": 7,
  "customerSessionVersion": 1,
  "trustedDeviceVersion": 3,
  "storageDriver": "json",
  "storageRuntimeImplemented": true,
  "releaseCommit": "43ec44f87e92"
}
```

Lectura:

- Render ya esta corriendo el commit de observabilidad.
- El driver activo en produccion es `json`.
- El runtime Postgres sigue desactivado.
- El health no expone rutas locales, `DATABASE_URL`, hashes, tokens, base64 ni datos de clientes.

Siguiente paso unico:

- Pasar a Fase B: disenar `postgresStorage.readDb()` de compatibilidad sin activar escritura PostgreSQL ni cambiar `ARIAD_STORAGE_DRIVER`.

## Resultado Fase B - Lector PostgreSQL read-only

Fecha: 2026-05-06

Cambio aplicado:

- Se creo `server/db/postgres-legacy-read.js`.
- `postgresStorage.readDb()` puede reconstruir el shape legacy de `users.json` desde PostgreSQL.
- `postgresStorage.writeDb()` sigue bloqueado.
- `runtimeImplemented` sigue en `false` para el driver `postgres`.
- Se agrego `npm run postgres:read-check`.
- No se cambio `ARIAD_STORAGE_DRIVER`.

Decision:

- La Fase B es solo lectura.
- El lector reconstruye colecciones desde `legacy_json` y recupera campos sensibles necesarios para runtime desde columnas tipadas:
  - credenciales de usuarios;
  - digests de sesiones/dispositivos/tokens;
  - comprobantes y evidencias finales desde `stored_files`.
- Los reportes del script no imprimen secretos ni archivos inline.
- El runtime productivo sigue en `json`.

Lectura tecnica:

- `legacy_json` no basta por si solo porque el importador lo sanitiza.
- Por eso el lector mezcla:
  - `legacy_json` para compatibilidad del shape viejo;
  - columnas tipadas para campos que el runtime necesita;
  - relaciones `payment_proofs`, `stored_files` y `frp_job_files` para reconstruir comprobantes y evidencias.
- Esto permite comprobar si Postgres puede leer el estado importado antes de escribir sobre la base.

Validacion local ejecutada:

```powershell
node --check server/db/postgres-legacy-read.js
node --check server/db/postgres-storage.js
node --check scripts/postgres/read-db-check.mjs
npm.cmd test
```

Resultado:

- Checks de sintaxis: OK.
- `npm.cmd test`: 14/14 OK.
- `npm run postgres:read-check` sin `DATABASE_URL`: fallo controlado con `ok: false` y `DATABASE_URL no configurado.`
- Reporte local sin `DATABASE_URL`: no contiene patrones sensibles.

Validacion en Render esperada:

```bash
cd /opt/render/project/src
npm run postgres:read-check -- --input /opt/render/project/src/storage/users.json --report /tmp/postgres-read-check.json --strict
cat /tmp/postgres-read-check.json
grep -E 'passwordHash|operatorPinHash|tokenHash|dataUrl|base64|legacy_data_url' /tmp/postgres-read-check.json || true
```

Resultado aceptable:

- `ok: true`.
- `tableProjectionMismatches: []`.
- `sourceComparison.collectionMismatches: []`.
- `sourceComparison.projectionMismatches: []`.
- El `grep` de patrones sensibles no imprime nada.

Riesgo restante:

- Si `users.json` de produccion cambio despues del import, el read-check con `--input storage/users.json` debe marcar diferencias.
- Si marca diferencias, no se debe activar Postgres. El siguiente paso seria decidir entre reimport controlado o sync incremental, con ventana de baja actividad.

Siguiente paso unico:

- Probar Fase B en local sin `DATABASE_URL`, luego subir y ejecutar el read-check en Render contra la base real.

## Resultado Fase B.1 - Sync final de drift JSON -> PostgreSQL

Fecha: 2026-05-06

Contexto:

- El read-check en Render con commit `a1f6478` probo que el lector reconstruye bien lo que ya esta en PostgreSQL:
  - `tableProjectionMismatches: []`.
- Tambien detecto drift porque `users.json` siguio recibiendo escrituras despues del import:
  - `customerDevices`: JSON `90`, PostgreSQL `89`;
  - `audit`: JSON `831`, PostgreSQL `830`.
- Se inspecciono el drift sin secretos:
  - 1 `customerDevice` nuevo;
  - 1 `auditEvent` `PORTAL_ORDERS_STREAM_CONNECTED`.

Decision:

- No activar PostgreSQL con drift pendiente.
- No insertar registros a mano desde la shell.
- Crear un sync final controlado con allowlist y transaccion.

Cambio aplicado:

- Se creo `scripts/postgres/sync-json-drift.mjs`.
- Se agregaron scripts:
  - `npm run postgres:sync-drift`;
  - `npm run postgres:sync-drift:apply`.

Contrato:

- El script solo puede sincronizar drift append-only permitido:
  - `customer_devices`;
  - `customer_device_authorizations`;
  - `audit_events`.
- Si detecta diferencias en cualquier otra coleccion legacy, bloquea.
- En modo dry-run no escribe.
- En modo apply usa transaccion.
- El reporte no imprime:
  - `passwordHash`;
  - `operatorPinHash`;
  - `tokenHash`;
  - `dataUrl`;
  - `base64`;
  - `legacy_data_url`.

Validacion local ejecutada:

```powershell
node --check scripts/postgres/sync-json-drift.mjs
npm.cmd test
```

Resultado:

- `node --check scripts/postgres/sync-json-drift.mjs`: OK.
- `npm.cmd test`: 14/14 OK.
- `npm run postgres:sync-drift` sin `DATABASE_URL`: fallo controlado con `ok: false` y `DATABASE_URL no configurado.`
- Reporte local sin `DATABASE_URL`: no contiene patrones sensibles.

Validacion en Render esperada:

```bash
cd /opt/render/project/src
npm run postgres:sync-drift -- --input /opt/render/project/src/storage/users.json --report /tmp/postgres-sync-drift-plan.json --strict
cat /tmp/postgres-sync-drift-plan.json
grep -E 'passwordHash|operatorPinHash|tokenHash|dataUrl|base64|legacy_data_url' /tmp/postgres-sync-drift-plan.json || true
```

Si el dry-run queda OK y solo muestra filas permitidas:

```bash
cd /opt/render/project/src
npm run postgres:sync-drift:apply -- --input /opt/render/project/src/storage/users.json --report /tmp/postgres-sync-drift-apply.json --strict
cat /tmp/postgres-sync-drift-apply.json
grep -E 'passwordHash|operatorPinHash|tokenHash|dataUrl|base64|legacy_data_url' /tmp/postgres-sync-drift-apply.json || true
npm run postgres:read-check -- --input /opt/render/project/src/storage/users.json --report /tmp/postgres-read-check-after-sync.json --strict
cat /tmp/postgres-read-check-after-sync.json
grep -E 'passwordHash|operatorPinHash|tokenHash|dataUrl|base64|legacy_data_url' /tmp/postgres-read-check-after-sync.json || true
```

Resultado aceptable:

- Sync dry-run:
  - `ok: true`;
  - `unsupportedCollectionMismatches: []`;
  - `plannedCounts.customerDevices` y `plannedCounts.auditEvents` iguales al drift detectado.
- Sync apply:
  - `ok: true`;
  - sin patrones sensibles.
- Read-check posterior:
  - `ok: true`;
  - `tableProjectionMismatches: []`;
  - `sourceComparison.collectionMismatches: []`;
  - `sourceComparison.projectionMismatches: []`.

Siguiente paso unico:

- Subir Fase B.1 y ejecutar dry-run en Render antes de aplicar.

## Validacion Render Fase B.1 aplicada

Fecha: 2026-05-06

Contexto:

- Commit desplegado: `093a3d8 Add Postgres JSON drift sync gate`.
- Runtime productivo todavia en `json`.
- PostgreSQL no esta activo como storage runtime.

Dry-run ejecutado en Render:

```bash
cd /opt/render/project/src
git rev-parse --short HEAD
npm run postgres:sync-drift -- --input /opt/render/project/src/storage/users.json --report /tmp/postgres-sync-drift-plan.json --strict
cat /tmp/postgres-sync-drift-plan.json
grep -E 'passwordHash|operatorPinHash|tokenHash|dataUrl|base64|legacy_data_url' /tmp/postgres-sync-drift-plan.json || true
```

Resultado dry-run:

- `ok: true`.
- `wouldWrite: true`.
- `unsupportedCollectionMismatches: []`.
- `warnings: []`.
- Drift permitido detectado:
  - `customerDevices`: `1`;
  - `customerDeviceAuthorizations`: `0`;
  - `auditEvents`: `1`.
- Filas planeadas:
  - `customerDevice`: `8dd1e33a-3979-4ec8-94db-591f76aee32b`.
  - `auditEvent`: `34be4da9-0ab0-41c6-bbfe-ec782602479a`, accion `PORTAL_ORDERS_STREAM_CONNECTED`.
- El grep de patrones sensibles no imprimio secretos.

Apply ejecutado en Render:

```bash
cd /opt/render/project/src
npm run postgres:sync-drift:apply -- --input /opt/render/project/src/storage/users.json --report /tmp/postgres-sync-drift-apply.json --strict
cat /tmp/postgres-sync-drift-apply.json
grep -E 'passwordHash|operatorPinHash|tokenHash|dataUrl|base64|legacy_data_url' /tmp/postgres-sync-drift-apply.json || true
```

Resultado apply:

- `ok: true`.
- `apply: true`.
- `afterCounts.customerDevices`: `90`.
- `afterCounts.auditEvents`: `831`.
- `warnings: []`.
- El reporte no expuso patrones sensibles.

Read-check posterior ejecutado en Render:

```bash
cd /opt/render/project/src
npm run postgres:read-check -- --input /opt/render/project/src/storage/users.json --report /tmp/postgres-read-check-after-sync.json --strict
cat /tmp/postgres-read-check-after-sync.json
grep -E 'passwordHash|operatorPinHash|tokenHash|dataUrl|base64|legacy_data_url' /tmp/postgres-read-check-after-sync.json || true
```

Resultado read-check posterior:

- `ok: true`.
- `tableProjectionMismatches: []`.
- `sourceComparison.collectionMismatches: []`.
- `sourceComparison.projectionMismatches: []`.
- Conteos alineados entre `users.json` y PostgreSQL:
  - `customerDevices`: `90`;
  - `audit`: `831`;
  - `customerOrders`: `13`;
  - `frpOrders`: `13`;
  - `frpJobs`: `14`;
  - `payment_proofs`: `32`.
- `proofMissingDigest: 0`.
- `finalImageMissingDigest: 0`.
- El reporte no expuso patrones sensibles.

Decision:

- La base PostgreSQL quedo alineada con el `users.json` activo en el momento del check.
- Fase B y Fase B.1 quedan aceptadas como evidencia de lectura y sync controlado.
- No se aprueba activar `ARIAD_STORAGE_DRIVER=postgres` todavia.

Riesgo restante:

- Mientras produccion siga en `json`, puede volver a aparecer drift antes del cutover.
- Antes de activar Postgres se debe repetir un read-check o sync final en ventana de baja actividad.
- La activacion sigue bloqueada porque `postgresStorage.writeDb()` todavia no implementa escritura runtime.

Siguiente paso unico:

- Pasar a Fase C: disenar e implementar `postgresStorage.writeDb(db)` con transaccion, pruebas de rollback y sin activar el driver Postgres en produccion.

## Propuesta ejecutable Fase C - Escritura PostgreSQL

Fecha: 2026-05-06

Hechos del codigo actual:

- `server.js` usa una sola frontera de persistencia:
  - `readDb()`;
  - `writeDb(db)`.
- `readDb()` no es puramente lectura: normaliza datos legacy, limpia sesiones/tokens expirados y puede llamar a `writeDb(db)` si detecta cambios.
- `postgresStorage.readDb()` ya reconstruye el shape legacy desde PostgreSQL.
- `postgresStorage.writeDb()` sigue bloqueado con error explicito.
- El importador `scripts/migration/import-users-json-to-postgres.mjs` ya contiene la transformacion completa de shape legacy a tablas SQL.
- El esquema tiene relaciones circulares controladas entre:
  - `customer_orders`;
  - `frp_orders`;
  - `customer_order_items`;
  - `frp_jobs`.

Inferencias:

- Fase C no debe escribir SQL manual duplicado dentro de `postgres-storage.js`.
- La opcion menos riesgosa es extraer la planificacion del importador a un modulo comun y reutilizarla para:
  - import inicial;
  - escritura runtime;
  - scripts de validacion.
- La primera escritura runtime viable debe ser reemplazo transaccional del estado completo, equivalente al modelo `users.json`.
- Ese reemplazo no es la arquitectura final, pero reduce el riesgo de cutover porque mantiene el contrato legacy intacto.

Opinion tecnica:

- Yo no activaria Postgres con updates granulares por dominio todavia. Eso mezclaria dos migraciones:
  - cambiar motor de persistencia;
  - redisenar repositorios del dominio.
- Primero haria un writer transaccional compatible con el shape actual. Despues, con Postgres ya estable, se separan repositorios por dominio.

Supuestos debiles:

- Produccion seguira con una sola instancia escritora durante el cutover.
- El volumen actual permite reconstruir y reinsertar el estado completo por write.
- La ventana de activacion tendra baja actividad para minimizar escrituras concurrentes basadas en lecturas viejas.

Riesgos:

- Reemplazo completo hereda el riesgo de "last write wins" que ya existe con `users.json`.
- Durante una escritura se toman locks sobre tablas runtime.
- Si el planificador genera warnings de integridad, la escritura debe bloquearse y no intentar "arreglar" datos en silencio.
- Si se borra `migration_runs` en runtime, se pierde evidencia historica del import. Por eso runtime no debe truncar ni reinsertar `migration_runs`.

Archivos propuestos:

- Nuevo: `server/db/postgres-legacy-plan.js`.
- Modificado: `scripts/migration/import-users-json-to-postgres.mjs`.
- Modificado: `server/db/postgres-storage.js`.
- Nuevo: `scripts/postgres/write-db-check.mjs`.
- Modificado: `package.json`.
- Modificado: `docs/specs/_sesion-19-cutover-postgres-runtime.md`.

Cambio exacto propuesto:

1. Extraer del importador a `server/db/postgres-legacy-plan.js`:
   - lista de tablas runtime;
   - orden de insercion;
   - columnas por tabla;
   - sanitizacion de `legacy_json`;
   - `buildPostgresLegacyPlan(db, options)`;
   - `insertPostgresRows(client, table, rows)`;
   - `applyPostgresLegacyInsert(client, plan, options)`;
   - `queryPostgresTargetCounts(client, options)`.
2. Mantener `migration_runs` solo para import inicial:
   - el importador puede seguir insertando `migration_runs`;
   - `writeDb(db)` no debe truncar ni reinsertar `migration_runs`.
3. Implementar `postgresStorage.writeDb(db)`:
   - construir plan desde `db`;
   - bloquear si hay warnings;
   - abrir `withTransaction`;
   - `set local search_path = ariad, public`;
   - tomar lock transaccional con advisory lock;
   - truncar solo tablas runtime allowlisted en un statement;
   - reinsertar filas en orden controlado;
   - actualizar FKs circulares despues de insertar;
   - comparar conteos esperados vs reales;
   - hacer `COMMIT` solo si todo coincide.
4. Actualizar `postgresStorage.health()`:
   - `runtimeImplemented: true`;
   - `phase: "C-write-ready"`;
   - sin exponer `DATABASE_URL` ni secretos.
5. Agregar `npm run postgres:write-check`:
   - carga un `users.json`;
   - ejecuta el mismo writer dentro de una transaccion;
   - fuerza `ROLLBACK` al final;
   - reporta conteos y mismatches;
   - bloquea reportes con secretos.

No se hara en Fase C:

- No cambiar `ARIAD_STORAGE_DRIVER` en Render.
- No activar Postgres en produccion.
- No escribir dual JSON + Postgres.
- No reescribir endpoints portal/FRP.
- No eliminar `storage/users.json`.
- No borrar `migration_runs` ni `schema_migrations`.

Validacion minima antes de deploy:

```powershell
node --check server/db/postgres-legacy-plan.js
node --check server/db/postgres-storage.js
node --check scripts/migration/import-users-json-to-postgres.mjs
node --check scripts/postgres/write-db-check.mjs
npm.cmd test
```

Validacion Render despues de deploy, aun con runtime `json`:

```bash
cd /opt/render/project/src
git rev-parse --short HEAD
npm run postgres:write-check -- --input /opt/render/project/src/storage/users.json --report /tmp/postgres-write-check.json --strict
cat /tmp/postgres-write-check.json
grep -E 'passwordHash|operatorPinHash|tokenHash|dataUrl|base64|legacy_data_url' /tmp/postgres-write-check.json || true
```

Criterio de aceptacion:

- `postgres:write-check` termina con `ok: true`.
- El reporte indica rollback intencional.
- No hay mismatches de conteo.
- El grep de patrones sensibles no imprime nada.
- Como el write-check hace rollback, `postgres:read-check` posterior solo debe exigirse despues de un sync final de drift.

Siguiente paso unico:

- Implementar Fase C exactamente con este alcance y mantener `ARIAD_STORAGE_DRIVER=json` en produccion.

## Resultado local Fase C - Writer transaccional preparado

Fecha: 2026-05-06

Cambio aplicado:

- Se creo `server/db/postgres-legacy-plan.js`.
- Se refactorizo `scripts/migration/import-users-json-to-postgres.mjs` para usar el planificador comun.
- Se implemento `postgresStorage.writeDb(db)` con:
  - plan legacy compartido;
  - bloqueo por warnings de integridad;
  - `withTransaction`;
  - gate de migraciones requeridas;
  - advisory lock transaccional;
  - reemplazo completo de tablas runtime;
  - comparacion de conteos antes de confirmar.
- Se agrego `scripts/postgres/write-db-check.mjs`.
- Se agrego `npm run postgres:write-check`.

Decision implementada:

- `migration_runs` queda reservado para import inicial.
- `writeDb(db)` no trunca ni reinserta `migration_runs`.
- `schema_migrations` no se toca.
- `ARIAD_STORAGE_DRIVER=postgres` pasa a reportar `runtimeImplemented: true` y `phase: "C-write-ready"`, pero no se activa en produccion.

Validacion local ejecutada:

```powershell
node --check server/db/postgres-legacy-plan.js
node --check server/db/postgres-storage.js
node --check scripts/migration/import-users-json-to-postgres.mjs
node --check scripts/postgres/write-db-check.mjs
npm.cmd test
npm.cmd run postgres:write-check -- --input data/users.json --report $env:TEMP\postgres-write-check-no-db.json --strict
npm.cmd run postgres:import -- --input data/users.json --report $env:TEMP\postgres-import-no-db.json --strict
```

Resultado local:

- Checks de sintaxis: OK.
- `npm.cmd test`: 14/14 OK.
- `postgres:write-check` sin `DATABASE_URL`: fallo controlado con `ok: false` y `DATABASE_URL no configurado.`
- `postgres:import` sin `DATABASE_URL`: fallo controlado con `ok: false` y `DATABASE_URL no configurado.`
- Los reportes locales no imprimieron patrones sensibles:
  - `passwordHash`;
  - `operatorPinHash`;
  - `tokenHash`;
  - `dataUrl`;
  - `base64`;
  - `legacy_data_url`.

Riesgo restante:

- La prueba local no ejecuta escritura real porque esta maquina no tiene `DATABASE_URL`.
- Falta ejecutar `postgres:write-check` en Render, donde si existe la base real.
- Mientras produccion siga en `json`, puede aparecer nuevo drift antes del cutover.

No se hizo:

- No se activo Postgres en Render.
- No se cambio `ARIAD_STORAGE_DRIVER`.
- No se borro ni modifico `storage/users.json`.
- No se ejecuto escritura real contra PostgreSQL desde local.

Siguiente paso unico:

- Subir Fase C y ejecutar en Render el `postgres:write-check` con rollback contra `/opt/render/project/src/storage/users.json`.

## Resultado Render Fase C - Primer write-check bloqueado

Fecha: 2026-05-06

Contexto:

- Commit desplegado: `ee48a3d`.
- Runtime productivo todavia en `json`.
- `ARIAD_STORAGE_DRIVER=postgres` no fue activado.

Resultado:

- `postgres:write-check` fallo con `ok: false`.
- Error: `relation "sequence_counters" does not exist`.
- El script reporto `rolledBack: true`.
- `beforeCounts` pudo leer `sequence_counters: 8`, lo que indica que la tabla existe y el problema esta en la resolucion de nombres durante la operacion de reemplazo.
- El grep de patrones sensibles no imprimio secretos.

Diagnostico:

- El conteo inicial usa `search_path` dentro de la transaccion y encontro las tablas.
- El `TRUNCATE` del writer dependia de nombres no calificados.
- Para no depender de `search_path`, el writer debe usar nombres calificados `ariad.<tabla>` en:
  - `TRUNCATE`;
  - conteos runtime usados despues de rollback, porque `SET LOCAL search_path` desaparece al hacer rollback.

Drift observado:

- Mientras la app sigue en `json`, `users.json` recibio nuevos eventos de auditoria.
- `read-check` posterior marco:
  - `audit`: JSON `833`, PostgreSQL `831`;
  - `audit_events`: JSON `833`, PostgreSQL `831`.
- Esto es drift esperado mientras Postgres no es el runtime activo.

Decision:

- No activar Postgres.
- Corregir el writer para calificar tablas con schema `ariad`.
- Repetir `postgres:write-check`.
- Cuando el writer pase, hacer sync final de drift antes de cualquier cutover.

## Resultado Render Fase C - Write-check aprobado

Fecha: 2026-05-06

Contexto:

- Commit desplegado: `09405d5`.
- Runtime productivo todavia en `json`.
- `ARIAD_STORAGE_DRIVER=postgres` no fue activado.

Resultado:

- `postgres:write-check` termino con `ok: true`.
- `warnings: []`.
- `writeMismatches: []`.
- `rolledBack: true`.
- `rollbackMismatches: []`.
- El grep de patrones sensibles no imprimio secretos.

Lectura:

- El writer transaccional pudo reconstruir el estado completo desde `users.json`.
- Dentro de la transaccion, PostgreSQL paso de:
  - `audit_events: 831`
  - a `audit_events: 833`.
- La transaccion hizo rollback intencional y PostgreSQL volvio a:
  - `audit_events: 831`.
- Esto valida que la escritura completa funciona y que el rollback no deja cambios.

Decision:

- Fase C queda aprobada como writer tecnicamente listo.
- No se aprueba cutover todavia.
- Como el write-check revierte, el drift sigue pendiente:
  - JSON `audit: 833`;
  - PostgreSQL `audit_events: 831`.

Siguiente paso unico:

- Ejecutar sync final de drift permitido y luego `read-check`.
