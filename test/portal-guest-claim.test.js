import assert from "node:assert/strict";
import test from "node:test";

import { claimGuestOrders, findGuestOrdersForClaimByWhatsapp } from "../server/portal/guest.js";

const deps = {
  nowIso: () => "2026-05-09T10:00:00.000Z",
  phoneKey: (value) => String(value || "").replace(/\D/g, ""),
};

function claimDb() {
  return {
    customerClients: [
      { id: "registered-client", accountType: "registered", whatsapp: "+51987654321", masterClientId: "master-1" },
      { id: "guest-client", accountType: "guest", whatsapp: "+51 987 654 321", masterClientId: "" },
    ],
    customerOrders: [{ id: "order-1", code: "ARD-0001", clientId: "guest-client", masterClientId: "", publicStatus: "PAGO_EN_REVISION" }],
    customerOrderItems: [{ id: "item-1", orderId: "order-1", clientId: "guest-client", masterClientId: "" }],
    customerRequests: [{ id: "request-1", clientId: "guest-client", masterClientId: "" }],
    guestSessionTokens: [{ id: "token-1", clientId: "guest-client", orderId: "order-1", revokedAt: "" }],
  };
}

test("findGuestOrdersForClaimByWhatsapp returns only public order metadata", () => {
  const db = claimDb();

  const candidates = findGuestOrdersForClaimByWhatsapp(db, "+51987654321", deps);

  assert.deepEqual(candidates, [{ id: "order-1", code: "ARD-0001", clientId: "guest-client", status: "PAGO_EN_REVISION", createdAt: "" }]);
});

test("claimGuestOrders moves guest orders, items, requests and revokes tokens", () => {
  const db = claimDb();

  const result = claimGuestOrders(db, "registered-client", ["guest-client"], deps);

  assert.equal(result.ordersClaimed, 1);
  assert.equal(db.customerOrders[0].clientId, "registered-client");
  assert.equal(db.customerOrders[0].masterClientId, "master-1");
  assert.equal(db.customerOrderItems[0].clientId, "registered-client");
  assert.equal(db.customerRequests[0].clientId, "registered-client");
  assert.equal(db.guestSessionTokens[0].clientId, "registered-client");
  assert.equal(db.guestSessionTokens[0].revokedAt, "2026-05-09T10:00:00.000Z");
});

test("claimGuestOrders is idempotent after the first transfer", () => {
  const db = claimDb();

  claimGuestOrders(db, "registered-client", ["guest-client"], deps);
  const second = claimGuestOrders(db, "registered-client", ["guest-client"], deps);

  assert.equal(second.ordersClaimed, 0);
});
