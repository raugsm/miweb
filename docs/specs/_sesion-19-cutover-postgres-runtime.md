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
