import { withPostgresClient } from "./postgres.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function uuidOrNull(value) {
  const normalized = String(value || "").trim();
  return uuidPattern.test(normalized) ? normalized : null;
}

function jsonObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function auditEventToPostgresRow(event) {
  const legacy = {
    id: String(event?.id || ""),
    actorId: event?.actorId || null,
    action: String(event?.action || ""),
    targetId: event?.targetId || null,
    detail: jsonObject(event?.detail),
    createdAt: String(event?.createdAt || new Date().toISOString()),
  };
  return {
    id: legacy.id,
    actor_id: uuidOrNull(legacy.actorId),
    action: legacy.action,
    target_id: legacy.targetId === null ? null : String(legacy.targetId),
    detail: legacy.detail,
    created_at: legacy.createdAt,
    legacy_json: legacy,
  };
}

export async function insertAuditEvent(event) {
  await withPostgresClient(async (client) => {
    await insertAuditEventWithClient(client, event);
  });
}

export async function insertAuditEventWithClient(client, event) {
  const row = auditEventToPostgresRow(event);
  await client.query(
    `
      insert into ariad.audit_events
        (id, actor_id, action, target_id, detail, created_at, legacy_json)
      values
        ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb)
      on conflict (id) do nothing
    `,
    [
      row.id,
      row.actor_id,
      row.action,
      row.target_id,
      JSON.stringify(row.detail),
      row.created_at,
      JSON.stringify(row.legacy_json),
    ],
  );
}
