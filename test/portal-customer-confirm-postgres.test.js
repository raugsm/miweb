import assert from "node:assert/strict";
import test from "node:test";

import { applyPortalCustomerManualConfirmation } from "../server/db/postgres-customer-admin.js";

const confirmedAt = "2026-05-06T17:00:00.000Z";
const actorId = "11111111-1111-4111-8111-111111111111";

test("manual portal customer confirmation verifies an unverified client and users", () => {
  const result = applyPortalCustomerManualConfirmation({
    client: {
      id: "22222222-2222-4222-8222-222222222222",
      status: "REGISTRADO_NO_VERIFICADO",
      emailVerifiedAt: "",
    },
    users: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        clientId: "22222222-2222-4222-8222-222222222222",
        emailVerifiedAt: "",
      },
    ],
    tokenCount: 2,
    actorId,
    confirmedAt,
    reason: "cliente no puede verificar desde celular",
  });

  assert.equal(result.ok, true);
  assert.equal(result.client.status, "EMAIL_VERIFICADO");
  assert.equal(result.client.emailVerifiedAt, confirmedAt);
  assert.equal(result.users[0].emailVerifiedAt, confirmedAt);
  assert.equal(result.auditDetail.previousStatus, "REGISTRADO_NO_VERIFICADO");
  assert.equal(result.auditDetail.newStatus, "EMAIL_VERIFICADO");
  assert.equal(result.auditDetail.consumedVerificationTokens, 2);
  assert.equal(result.auditEvent.action, "PORTAL_CLIENT_MANUALLY_CONFIRMED");
  assert.equal(result.auditEvent.actorId, actorId);
});

test("manual portal customer confirmation preserves VIP status", () => {
  const result = applyPortalCustomerManualConfirmation({
    client: {
      id: "22222222-2222-4222-8222-222222222222",
      status: "VIP",
      emailVerifiedAt: "",
    },
    users: [],
    actorId,
    confirmedAt,
  });

  assert.equal(result.ok, true);
  assert.equal(result.client.status, "VIP");
  assert.equal(result.client.emailVerifiedAt, confirmedAt);
});

test("manual portal customer confirmation rejects blocked clients", () => {
  const result = applyPortalCustomerManualConfirmation({
    client: {
      id: "22222222-2222-4222-8222-222222222222",
      status: "BLOQUEADO",
      emailVerifiedAt: "",
    },
    users: [],
    actorId,
    confirmedAt,
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
});
