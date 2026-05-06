# Sesion 20 - PostgreSQL audit_events granular preflight

Fecha: 2026-05-06

Estado: preflight tecnico, pendiente de aprobacion para implementar.

Base local: `5eba1a9` (`Document Postgres write surface audit`).

## Objetivo

Preparar el primer corte despues de la auditoria de superficie:

```text
audit_events append-only transaccional y sin writeDb(db) en SSE/GET auditables
```

Este documento no cambia runtime. Define exactamente que se tocaria, que no se tocaria y como se probaria.

## Fuentes tecnicas usadas

- HTTP GET debe ser tratado como metodo seguro: no debe cambiar estado observable del servidor salvo logging controlado e intencional.
- EventSource puede reconectar automaticamente; por eso connect/disconnect no debe disparar reemplazos globales del runtime.
- PostgreSQL ya provee transacciones e insert atomico por fila; para auditoria append-only no hace falta reconstruir todas las tablas.

## Estado actual confirmado

### Funcion audit actual

Archivo:

- `server/core/audit.js`

Implementacion actual:

```js
export function audit(db, actorId, action, targetId, detail = {}) {
  db.audit.unshift({
    id: crypto.randomUUID(),
    actorId: actorId || null,
    action,
    targetId: targetId || null,
    detail,
    createdAt: nowIso(),
  });
  db.audit = db.audit.slice(0, 2000);
}
```

Hecho:

- `audit()` solo muta `db.audit`.
- La persistencia ocurre despues, cuando la ruta llama `writeDb(db)`.

### Tabla Postgres existente

Archivo:

- `migrations/001_initial_postgres.sql`

Tabla:

```sql
create table audit_events (
  id uuid primary key,
  actor_id uuid,
  action text not null,
  target_id text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null,
  legacy_json jsonb not null default '{}'::jsonb
);
```

Hecho:

- La tabla ya existe.
- Tiene primary key por `id`.
- Permite `actor_id` nulo.
- `target_id` es texto.
- `detail` y `legacy_json` son JSONB.

### Persistencia legacy actual

Archivo:

- `server/db/postgres-legacy-plan.js`

Mapping actual:

```js
rows.audit_events.push({
  id: requiredUuid(event.id, "audit.id"),
  actor_id: uuidOrNull(event.actorId),
  action: stringValue(event.action),
  target_id: stringValue(event.targetId),
  detail: jsonb(event.detail || {}),
  created_at: timestampValue(event.createdAt, nowIso),
  legacy_json: legacyJson(event),
});
```

Hecho:

- El formato de fila ya esta definido.
- La nueva escritura granular debe conservar este mismo contrato.

## Rutas objetivo del primer corte

No se migran todas las auditorias en este paso.

Solo se cambia el grupo de alta frecuencia o GET/SSE:

| Ruta | Archivo | Lineas actuales | Cambio propuesto |
| --- | --- | ---: | --- |
| `GET /api/portal/orders/events` blocked | `server/portal/portal-routes.js` | 447-451 | Insert granular audit; no `writeDb(db)`. |
| `GET /api/portal/orders/events` connected | `server/portal/portal-routes.js` | 455-459 | Insert granular audit; no `writeDb(db)`. |
| `GET /api/portal/orders/events` disconnected | `server/portal/portal-routes.js` | 494-498 | Insert granular audit; no `readDb()` extra para solo auditoria. |
| `GET /api/operator/frp/events` connected | `server.js` | 4813-4817 | Insert granular audit; no `writeDb(db)`. |
| `GET /api/operator/frp/events` disconnected | `server.js` | 4852-4856 | Insert granular audit; no `readDb()` extra para solo auditoria. |
| `GET /api/portal/orders/:id` lookup blocked | `server/portal/portal-routes.js` | 844-848 | Insert granular audit; no `writeDb(db)`. |
| `GET /api/portal/orders/:id/comprobante.pdf` | `server/portal/portal-routes.js` | 1237-1238 | Opcion preferida: no auditar por defecto; alternativa: insert granular. |
| `GET /api/daily-close/:date/export` | `server.js` | 3662-3667 | Insert granular audit; no `writeDb(db)`. |

## Diseno propuesto

### 1. Separar creacion del evento de su persistencia

Archivo a tocar:

- `server/core/audit.js`

Propuesta:

```js
export function createAuditEvent(actorId, action, targetId, detail = {}) {
  return {
    id: crypto.randomUUID(),
    actorId: actorId || null,
    action,
    targetId: targetId || null,
    detail,
    createdAt: nowIso(),
  };
}

export function pushAuditEvent(db, event) {
  db.audit.unshift(event);
  db.audit = db.audit.slice(0, 2000);
  return event;
}

export function audit(db, actorId, action, targetId, detail = {}) {
  return pushAuditEvent(db, createAuditEvent(actorId, action, targetId, detail));
}
```

Razon:

- Mantiene compatibilidad con todas las rutas existentes.
- Permite que una ruta obtenga el evento creado y lo inserte granularmente si esta en Postgres.

### 2. Crear insert granular Postgres

Archivo nuevo propuesto:

- `server/db/postgres-audit.js`

Propuesta:

```js
import { withPostgresClient } from "./postgres.js";

export async function insertAuditEvent(event) {
  return withPostgresClient(async (client) => {
    await client.query("set local search_path = ariad, public");
    await client.query(
      `
        insert into audit_events
          (id, actor_id, action, target_id, detail, created_at, legacy_json)
        values
          ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb)
        on conflict (id) do nothing
      `,
      [
        event.id,
        event.actorId || null,
        event.action,
        event.targetId || null,
        JSON.stringify(event.detail || {}),
        event.createdAt,
        JSON.stringify(event),
      ],
    );
  });
}
```

Razon:

- Una fila, una transaccion implicita.
- No trunca tablas.
- No usa el plan legacy.
- `on conflict` hace idempotente el retry del mismo evento.

Punto a validar durante implementacion:

- Si `actorId` puede no ser UUID en alguna ruta objetivo, se debe normalizar a `null` para `actor_id` y conservar el valor original en `legacy_json`. En las rutas objetivo conocidas, `actorId` viene de usuarios UUID o `null`.

### 3. Adaptador de auditoria runtime

Archivo a tocar:

- `server.js`

Propuesta:

```js
async function persistAuditEvent(event) {
  if (storage.driver === "postgres") {
    await insertAuditEvent(event);
    return;
  }
  const db = await readDb();
  pushAuditEvent(db, event);
  await writeDb(db);
}
```

Pero para rutas que ya tienen `db` cargado, se recomienda:

```js
const event = audit(db, actorId, action, targetId, detail);
if (storage.driver === "postgres") {
  await insertAuditEvent(event);
} else {
  await writeDb(db);
}
```

Razon:

- En JSON mantiene comportamiento persistente.
- En Postgres evita reemplazo completo.
- En rutas con cambios de negocio reales, no se toca nada en este corte.

### 4. Inyectar helper a portal-routes

Archivo a tocar:

- `server/portal/portal-routes.js`

Hoy `createPortalRoutes` recibe `audit`, `readDb`, `writeDb`.

Propuesta:

- agregar `persistAuditOnly` o `insertAuditEventForRuntime` como dependencia;
- usarlo solo en rutas objetivo GET/SSE.

No se debe hacer:

- convertir todas las auditorias portal de una vez;
- cambiar create-order/payment-proof/notify-connected/item-ready todavia;
- alterar estados FRP.

## Riesgos del cambio

### Riesgo 1: auditoria duplicada

Causa:

- llamar `audit(db, ...)` y tambien insertar un evento creado aparte.

Control:

- `audit()` debe devolver el evento creado.
- insertar exactamente ese evento.

### Riesgo 2: auditoria no visible en respuesta inmediata

Causa:

- en Postgres se inserta en DB, pero el objeto `db` que ya esta en memoria puede no incluir el evento si no se llama `audit(db, ...)`.

Control:

- mantener `audit(db, ...)` para que el snapshot usado por serializadores locales siga coherente.

### Riesgo 3: actor_id no UUID

Causa:

- `audit_events.actor_id` es UUID.

Control:

- aceptar solo UUID o `null` para `actor_id`;
- conservar cualquier valor raro dentro de `legacy_json`.

### Riesgo 4: silenciar un error real de auditoria

Causa:

- si se ignora fallo de insert, se pierde visibilidad.

Control:

- en rutas bloqueantes, si falla audit granular se puede responder igual si la ruta era solo GET/SSE, pero loguear `console.warn`.
- no debe convertirse en reemplazo global de emergencia.

## Pruebas requeridas

### Local estatico

```powershell
node --check server.js
node --check server/core/audit.js
node --check server/db/postgres-audit.js
node --check server/portal/portal-routes.js
npm.cmd test
```

### Prueba unitaria nueva recomendada

Archivo:

- `test/postgres-audit-event.test.js`

Cobertura minima:

- `audit()` devuelve un evento.
- `pushAuditEvent()` conserva limite de 2000.
- helper de mapeo Postgres produce:
  - `id`
  - `actor_id`
  - `action`
  - `target_id`
  - `detail`
  - `created_at`
  - `legacy_json`

Nota:

- No debe requerir conexion real a Postgres.
- Debe poder correr local con `npm.cmd test`.

### Render post-deploy

Comandos:

```bash
cd /opt/render/project/src
curl -fsS https://ops.ariadgsm.com/api/health
curl -fsS https://ariadgsm.com/api/health
npm run postgres:read-check -- --report /tmp/postgres-live-after-audit-events.json --strict
cat /tmp/postgres-live-after-audit-events.json
```

Smoke manual:

- login admin;
- login cliente;
- abrir panel admin FRP 60-90 segundos;
- abrir portal cliente 60-90 segundos;
- verificar en DevTools que `session`, `presence`, `status`, `events`, `active-technician` sigan 200;
- verificar que no aparezca `POSTGRES_RUNTIME_DESTRUCTIVE_WRITE_BLOCKED`.

## Decision recomendada

Implementar solo este corte:

1. `audit()` devuelve evento y se agrega helper para crear/pushear evento.
2. se agrega insert granular de `audit_events`.
3. se cambia solo SSE/GET auditables listados en este documento.
4. se deja todo FRP/pagos/ordenes de negocio con `writeDb(db)` por ahora.

No recomiendo reiniciar de cero antes de este corte.

Razon:

- el sistema ya opera;
- este corte reduce la superficie de riesgo mas frecuente;
- no toca dinero ni estados FRP principales;
- crea el patron para migrar luego payment-review/take/finalize de forma ordenada.

## Autorizacion requerida

Para implementar, aprobar explicitamente:

```text
aprobado audit_events granular
```
