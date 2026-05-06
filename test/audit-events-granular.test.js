import assert from "node:assert/strict";
import test from "node:test";

import { audit, auditEventLimit, createAuditEvent, pushAuditEvent } from "../server/core/audit.js";
import { auditEventToPostgresRow } from "../server/db/postgres-audit.js";

test("audit returns the created event and stores it first", () => {
  const db = { audit: [] };
  const event = audit(db, "41976880-1f1e-4e0d-9083-2429d2733143", "TEST_ACTION", "target-1", { ok: true });

  assert.equal(db.audit[0], event);
  assert.equal(event.actorId, "41976880-1f1e-4e0d-9083-2429d2733143");
  assert.equal(event.action, "TEST_ACTION");
  assert.equal(event.targetId, "target-1");
  assert.deepEqual(event.detail, { ok: true });
});

test("pushAuditEvent preserves the legacy audit event limit", () => {
  const db = { audit: [] };

  for (let index = 0; index < auditEventLimit + 5; index += 1) {
    pushAuditEvent(db, createAuditEvent(null, `ACTION_${index}`, null));
  }

  assert.equal(db.audit.length, auditEventLimit);
  assert.equal(db.audit[0].action, `ACTION_${auditEventLimit + 4}`);
  assert.equal(db.audit.at(-1).action, "ACTION_5");
});

test("auditEventToPostgresRow preserves legacy JSON and normalizes actor uuid", () => {
  const event = {
    id: "f07e5438-569f-41ed-92de-b1a4f4d9987d",
    actorId: "not-a-uuid",
    action: "PORTAL_ORDERS_STREAM_CONNECTED",
    targetId: "client-1",
    detail: { streamId: "stream-1" },
    createdAt: "2026-05-06T14:26:00.375Z",
  };

  const row = auditEventToPostgresRow(event);

  assert.equal(row.id, event.id);
  assert.equal(row.actor_id, null);
  assert.equal(row.action, event.action);
  assert.equal(row.target_id, event.targetId);
  assert.deepEqual(row.detail, event.detail);
  assert.equal(row.created_at, event.createdAt);
  assert.deepEqual(row.legacy_json, event);
});
