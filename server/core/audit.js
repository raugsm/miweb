import crypto from "node:crypto";
import { nowIso } from "./dates.js";

export const auditEventLimit = 2000;

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
  db.audit = Array.isArray(db.audit) ? db.audit : [];
  db.audit.unshift(event);
  db.audit = db.audit.slice(0, auditEventLimit);
  return event;
}

export function audit(db, actorId, action, targetId, detail = {}) {
  return pushAuditEvent(db, createAuditEvent(actorId, action, targetId, detail));
}
