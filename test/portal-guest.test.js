import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import {
  cleanupExpiredGuestTokens,
  createGuestSessionToken,
  findOrCreateGuestClient,
  validateGuestSessionToken,
} from "../server/portal/guest.js";

function hashToken(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

const deps = {
  cleanText: (value, max = 160) => String(value || "").trim().slice(0, max),
  crypto,
  hashToken,
  nowIso: () => "2026-05-09T10:00:00.000Z",
  normalizePortalWhatsapp: (whatsapp) => ({ ok: true, whatsapp, country: "Peru", countryIso: "PE", detectedCountry: "Peru" }),
  phoneKey: (value) => String(value || "").replace(/\D/g, ""),
};

test("findOrCreateGuestClient reuses guest client by normalized WhatsApp", () => {
  const db = { customerClients: [] };

  const first = findOrCreateGuestClient(db, "+51987654321", "PE", deps);
  const second = findOrCreateGuestClient(db, "+51 987 654 321", "PE", {
    ...deps,
    normalizePortalWhatsapp: () => ({ ok: true, whatsapp: "+51987654321", country: "Peru", countryIso: "PE", detectedCountry: "Peru" }),
  });

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(db.customerClients.length, 1);
  assert.equal(db.customerClients[0].accountType, "guest");
});

test("guest session token validates active order and cleans stale expired tokens", () => {
  const db = {
    customerClients: [{ id: "guest-client", accountType: "guest" }],
    customerOrders: [{ id: "guest-order", clientId: "guest-client" }],
    guestSessionTokens: [{
      id: "expired-token",
      orderId: "old-order",
      clientId: "guest-client",
      tokenHash: "expired",
      expiresAt: "2026-04-01T00:00:00.000Z",
      revokedAt: "",
      createdAt: "2026-03-01T00:00:00.000Z",
    }],
  };

  const { token } = createGuestSessionToken(db, "guest-order", deps);
  const result = validateGuestSessionToken(db, token, deps);

  assert.equal(result.order.id, "guest-order");
  assert.equal(result.client.id, "guest-client");
  assert.equal(db.guestSessionTokens.some((record) => record.id === "expired-token"), false);
});

test("cleanupExpiredGuestTokens removes at most 100 records per pass", () => {
  const db = {
    guestSessionTokens: Array.from({ length: 105 }, (_, index) => ({
      id: `expired-${index}`,
      expiresAt: "2026-04-01T00:00:00.000Z",
    })),
  };

  const removed = cleanupExpiredGuestTokens(db, deps);

  assert.equal(removed, 100);
  assert.equal(db.guestSessionTokens.length, 5);
});
