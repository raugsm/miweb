import crypto from "node:crypto";
import { nowIso } from "./dates.js";

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
