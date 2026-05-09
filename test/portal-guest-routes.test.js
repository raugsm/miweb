import assert from "node:assert/strict";
import test from "node:test";

import { createPortalRoutes } from "../server/portal/portal-routes.js";

function res() {
  return {
    status: 0,
    body: null,
    setHeader() {},
  };
}

function deps(overrides = {}) {
  return {
    readDb: async () => ({ catalog: true }),
    publicPortalCatalog: () => ({ services: [], paymentMethods: [] }),
    sendJson: (target, status, body) => {
      target.status = status;
      target.body = body;
      return body;
    },
    usePortalGuestEnabled: () => false,
    ...overrides,
  };
}

test("guest routes return 404 when PORTAL_GUEST_ENABLED is off", async () => {
  const handler = createPortalRoutes(deps({
    readDb: async () => {
      throw new Error("disabled guest route must not read db");
    },
  }));
  const routes = [
    ["GET", "/api/portal/guest/state"],
    ["POST", "/api/portal/guest/orders"],
    ["PATCH", "/api/portal/guest/orders/ARD-0001/payment-proof"],
    ["GET", "/api/portal/guest/orders/ARD-0001"],
    ["GET", "/api/portal/guest/orders/ARD-0001/events"],
    ["POST", "/api/portal/guest/claim-preview"],
    ["POST", "/api/portal/guest/claim"],
    ["GET", "/api/portal/guest/orders/ARD-0001/comprobante.pdf"],
  ];

  for (const [method, path] of routes) {
    const target = res();
    await handler({ method, url: path, cookies: {}, headers: {} }, target, path);
    assert.equal(target.status, 404, `${method} ${path}`);
  }
});

test("guest state route returns catalog when PORTAL_GUEST_ENABLED is on", async () => {
  const handler = createPortalRoutes(deps({
    usePortalGuestEnabled: () => true,
    publicPortalCatalog: () => ({ services: [{ code: "PORTAL-XIAOMI-FRP" }], paymentMethods: [] }),
  }));
  const target = res();

  await handler({ method: "GET", url: "/api/portal/guest/state", cookies: {}, headers: {} }, target, "/api/portal/guest/state");

  assert.equal(target.status, 200);
  assert.equal(target.body.guest.enabled, true);
  assert.equal(target.body.catalog.services[0].code, "PORTAL-XIAOMI-FRP");
});
