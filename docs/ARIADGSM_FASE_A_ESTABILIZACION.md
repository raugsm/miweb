# AriadGSM Fase A - Estabilizacion de runtime

Fecha: 2026-05-08

Alcance: estabilizacion operativa de ariadgsm.com despues de crashes por OOM en Render. Esta fase no corrige la causa raiz arquitectonica: rutas legacy que hacen `readDb()` / `writeDb()` completos bajo `ARIAD_STORAGE_DRIVER=postgres`, conviviendo con rutas SQL granulares.

## Estado confirmado

- Servicio web Render: `ariadgsm-ops`.
- Base Postgres Render: `ariadgsm_postgres`.
- Plan anterior: Starter, 512 MB RAM, 0.5 CPU.
- Plan actual confirmado por Bryams: Standard, 2 GB RAM, 1 CPU.
- Sintoma previo: memoria llegaba a 512 MB, proceso moria con status 134 / OOM, ciclo de reinicio cada 3-6 minutos.
- Sintoma posterior al upgrade: memoria estabilizada.

## Defaults leidos en codigo

### `POSTGRES_RUNTIME_WRITE_RETRIES`

Archivo: `server/db/postgres-storage.js`.

Codigo actual:

```js
const maxAttempts = Number(env.POSTGRES_RUNTIME_WRITE_RETRIES || 3);
const attempts = Number.isFinite(maxAttempts) && maxAttempts > 0 ? Math.min(Math.floor(maxAttempts), 5) : 3;
```

Default efectivo: `3` intentos totales.

Detalle importante: si `POSTGRES_RUNTIME_WRITE_RETRIES=0`, el codigo no usa cero. Por el `|| 3` y por la validacion `> 0`, termina volviendo a `3`. Por eso `0` no sirve como forma de desactivar reintentos sin cambio de codigo.

Interpretacion operativa: cada intento puede reconstruir el plan de reemplazo runtime completo y volver a tocar memoria pesada. En una condicion de deadlock, `3` amplifica el costo de heap y prolonga el bloqueo.

### `PG_POOL_MAX`

Archivo: `server/db/postgres.js`.

Codigo actual:

```js
const value = Number(env.PG_POOL_MAX || 5);
return Number.isFinite(value) && value > 0 ? Math.min(Math.floor(value), 20) : 5;
```

Default efectivo: `5` conexiones maximas en el pool.

Interpretacion operativa: para un servicio de 1 CPU y un runtime que todavia tiene transacciones pesadas, `5` es razonable. Subirlo podria aumentar concurrencia contra Postgres y hacer mas probables los lock conflicts. Bajarlo demasiado podria volver lento el login y el panel.

### `NODE_OPTIONS` / heap

Archivo: `package.json`.

Script actual:

```json
"start": "node server.js"
```

No hay `--max-old-space-size` en `npm start`, ni flags equivalentes en `package.json`.

Interpretacion operativa: Node usa su heuristica por defecto para old space. En Standard 2 GB conviene fijar un techo explicito para que V8 tenga margen suficiente sin consumir toda la memoria del contenedor.

### `readDb()` streaming o paginacion

Archivo: `server/db/postgres-legacy-read.js`.

El lector legacy hace:

```js
const result = await client.query(`select * from ${table} order by ${orderBy}`);
return result.rows;
```

No existe flag/env var para paginar ese `readDb()`. Tampoco hay streaming para el runtime legacy. El unico streaming observado es el endpoint read-only de audit cloud (`cloud-sync-audit.jsonl`), que no alivia el problema de `readDb()` Postgres.

Conclusion: Fase A no puede corregir el consumo estructural de memoria solo con variables. Solo reduce la probabilidad de OOM y la amplificacion por reintentos.

## Cambios propuestos en Render Dashboard

### 1. Instance Type

- Setting: Instance Type.
- Valor propuesto: `Standard` (2 GB RAM, 1 CPU).
- Estado: ya aplicado por Bryams.

Justificacion basada en el incidente: Starter daba 512 MB y el proceso llegaba al techo. Standard da margen para V8 heap, buffers, modulos nativos, conexiones de Postgres y picos de snapshot legacy.

Riesgo si el valor esta mal: si se baja de nuevo a Starter antes de Fase B, el ciclo OOM puede volver.

Rollback: volver a Starter solo despues de eliminar `writeDb()` legacy del trafico web y observar memoria estable.

### 2. `POSTGRES_RUNTIME_WRITE_RETRIES`

- Variable: `POSTGRES_RUNTIME_WRITE_RETRIES`.
- Valor propuesto: `1`.

Justificacion basada en codigo: el default actual es `3`. Cada intento vuelve a ejecutar `replaceRuntimeOnce(db)`, que construye plan completo y llama al reemplazo runtime. Con deadlocks, `3` puede triplicar trabajo pesado y memoria retenida. `1` deja un unico intento total; no reintenta. Esto reduce amplificacion de memoria y evita que una operacion condenada siga ocupando heap.

Por que no `0`: el codigo actual interpreta `0` como invalido y vuelve a `3`, asi que no logra el objetivo.

Por que no `2`: `2` baja algo la amplificacion, pero todavia duplica trabajo pesado en el peor momento. Para estabilizacion inmediata, `1` es mas conservador con memoria.

Riesgo si el valor esta mal: ante un deadlock verdaderamente transitorio, una operacion que antes podia recuperarse en el segundo/tercer intento ahora fallara rapido con 500. Es preferible a retener snapshots pesados hasta OOM, porque OOM reinicia todo el servicio.

Rollback: eliminar la variable o volver a `3`. Hacerlo solo si se confirma que los 500 por deadlock aumentan pero la memoria ya no esta en riesgo.

### 3. `NODE_OPTIONS`

- Variable: `NODE_OPTIONS`.
- Valor propuesto: `--max-old-space-size=1536`.

Justificacion basada en el plan actual: Standard tiene 2 GB RAM. Un old space de 1536 MB deja aproximadamente 512 MB para C++ heap, buffers I/O, librerias nativas, pool de Postgres, stacks, overhead del runtime y el sistema del contenedor. Es un limite alto pero no consume todo el plan.

Flags no recomendados ahora:

- `--expose-gc`: no sirve si el codigo no llama `global.gc()` y puede llevar a parches manuales fragiles.
- `--gc-interval`: no ataca la retencion de snapshots ni locks; puede empeorar latencia.

Riesgo si el valor esta mal: si se pone demasiado alto, el proceso puede acercarse al limite total del contenedor y el OOM killer de Render puede matar la instancia. Si se pone demasiado bajo, se vuelve al mismo sintoma de heap OOM.

Rollback: quitar `NODE_OPTIONS` o bajar a `--max-old-space-size=1024` si Render muestra memoria total demasiado cerca del limite.

### 4. `PG_POOL_MAX`

- Variable: `PG_POOL_MAX`.
- Valor propuesto: no agregar por ahora; mantener default `5`.

Justificacion basada en codigo: el default ya es `5` y esta capado a `20`. Con 1 CPU y transacciones legacy pesadas, subir pool aumenta concurrencia contra las mismas tablas y puede agravar locks/deadlocks. Bajarlo a `2` o `3` podria reducir lock contention, pero tambien puede hacer que login/panel esperen por conexion.

Riesgo si se cambia mal: valores altos pueden empeorar deadlocks; valores bajos pueden aumentar latencia y timeouts.

Rollback: eliminar la variable para volver al default `5`.

Uso futuro si Fase A no basta: probar `PG_POOL_MAX=3` solo si los logs muestran muchos deadlocks simultaneos aun con RAM estable. Debe medirse contra latencia de login.

## Cambios de codigo minimos evaluados, no aplicados

No se aplico ningun cambio de codigo en esta fase.

Hallazgos:

- Rate limit cloud sync/audit usa `Map` en memoria. No parece causa principal: esta acotado por pocos tokens/agentes y no esta relacionado con login o portal.
- SSE usa `Map`/`Set` para streams y tiene limpieza en `close` y al detectar streams cerrados. No parece causa primaria del OOM.
- `parseJson()` acumula body en memoria con limite global de 12 MB. Es mejorable, pero no explica por si solo el ciclo de OOM si no hay muchas subidas grandes simultaneas.
- El problema dominante sigue siendo `readDb()` sin paginacion + `writeDb()` con reemplazo runtime completo + reintentos.

Fixes propuestos para Fase B, no para Fase A:

1. Migrar login/register/logout/sesiones cliente y operador a SQL granular.
2. Eliminar `writeDb(db)` de rutas web bajo `ARIAD_STORAGE_DRIVER=postgres`.
3. Dejar `replacePostgresLegacyRuntime()` solo para migraciones/import offline.
4. Agregar guard de produccion para bloquear cualquier `writeDb(db)` legacy bajo Postgres en rutas web.

## Plan de deploy/configuracion ordenado

### Paso A.1 - Agregar variables en Render Dashboard

Render Dashboard -> `ariadgsm-ops` -> Environment -> Add Environment Variable:

```text
POSTGRES_RUNTIME_WRITE_RETRIES=1
NODE_OPTIONS=--max-old-space-size=1536
```

No agregar `PG_POOL_MAX` por ahora.

Guardar cambios. Render reiniciara el servicio automaticamente al cambiar variables.

### Paso A.2 - Esperar restart y verificar health

Verificar:

```text
https://ariadgsm.com/api/health
```

Esperado:

- HTTP 200.
- `ok: true`.
- `storageDriver: "postgres"`.
- `storageRuntimeImplemented: true`.

No debe exponer secretos ni `DATABASE_URL`.

### Paso A.3 - Monitorear 5 minutos

En Render Dashboard:

- Memory: debe quedar mas plana que antes.
- CPU: puede subir durante arranque, pero debe bajar.
- Events: no debe aparecer `Instance failed`.
- Logs: si aparece deadlock aislado, no debe encadenarse con OOM.

### Paso A.4 - Monitorear 30 minutos

Si los 5 minutos iniciales salen bien, mantener observacion hasta 30 minutos antes de hacer cualquier push.

No empujar codigo mientras la memoria siga creciendo sin techo.

### Paso A.5 - Push de pulidos solo si Fase A esta estable

SI Y SOLO SI la memoria esta estable y `/api/health` responde consistentemente, hacer push del commit local `560a024` (`Pulidos panel cliente Paso 1`) a `main`.

Render desplegara automaticamente si auto-deploy sigue activo.

### Paso A.6 - Verificacion final post-deploy

Verificar despues del deploy:

- `/api/health` responde 200.
- Render no registra `Instance failed`.
- Login cliente en menos de 3 segundos.
- Panel cliente carga.
- Panel operador carga.
- Memoria no vuelve al patron diente de sierra que termina en OOM.

## Criterios de exito de Fase A

Fase A se considera efectiva si durante 30 minutos:

- Memoria estable por debajo de 75% del plan Standard, idealmente menor a 1.5 GB.
- Cero events `Instance failed`.
- `/api/health` responde HTTP 200 de forma consistente.
- Login cliente y operador responden en menos de 3 segundos en condiciones normales.
- No aparece `FATAL ERROR: Ineffective mark-compacts near heap limit`.

Fase A se considera insuficiente si:

- La memoria sigue creciendo sin techo aunque el plan sea Standard.
- Vuelven crashes status 134 / OOM.
- Los deadlocks siguen en cadena y bloquean login/panel.
- `/api/health` falla intermitentemente.

Si Fase A es insuficiente, pasar a Fase B con urgencia: hotfix de sesiones/login a SQL granular y bloqueo de `writeDb()` legacy en rutas web bajo Postgres.

## Decision recomendada

Aplicar ahora en Render:

```text
POSTGRES_RUNTIME_WRITE_RETRIES=1
NODE_OPTIONS=--max-old-space-size=1536
```

Mantener:

```text
PG_POOL_MAX=(sin definir; default 5)
```

No hacer push de codigo hasta observar 30 minutos estables.

Esta es una estabilizacion, no una correccion raiz. La correccion raiz sigue siendo Fase B: sacar `readDb()`/`writeDb()` legacy del trafico web Postgres.
