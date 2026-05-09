import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import { createPortalRoutes } from "../server/portal/portal-routes.js";

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function createMockRes() {
  return {
    status: 0,
    body: null,
    headers: {},
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
  };
}

function baseDeps(overrides = {}) {
  const calls = [];
  return {
    calls,
    addAdminConfigStream: () => {},
    addPortalOrderStream: () => {},
    adminConfigSseHeartbeatMs: 25_000,
    audit: () => ({}),
    authorizeCustomerDevice: () => {},
    cleanText: (value) => String(value || ""),
    clientIp: () => "127.0.0.1",
    cookieHeader: (name, value) => `${name}=${value}; Path=/`,
    createCustomerEmailVerificationToken: () => ({ token: "email-token" }),
    createFrpOrderFromPortal: () => ({}),
    crypto,
    customerBenefitFor: () => null,
    customerCanUseBenefits: () => false,
    customerDeviceCookieName: "ariad_customer_device",
    customerDeviceMaxAgeSeconds: 3600,
    customerDeviceIsAuthorized: () => false,
    customerEmailIsVerified: () => true,
    customerPendingDebt: () => 0,
    customerSessionCookieName: "ariad_customer_session",
    customerSessionMaxAgeSeconds: 3600,
    customerSessionVersion: 1,
    defaultCustomerBenefit: () => null,
    enforcePortalRateLimit: () => true,
    ensureCustomerDevice: () => ({ token: "legacy-device-token", device: { id: "legacy-device" } }),
    formatPortalPaymentAmountFromUsdt: () => "",
    frpEligibilityResult: () => ({}),
    frpWorkChannel: "WHATSAPP_3",
    getCookie: (req, name) => req.cookies?.[name] || "",
    getCurrentCustomerContext: async () => ({ db: { id: "legacy-db" }, user: null, client: null, deviceToken: "legacy-device-token" }),
    hashPassword: async () => "hash",
    hashToken,
    maxPortalOrderRequestsPerWindow: 12,
    maxPortalProofRequestsPerWindow: 20,
    maxPortalRegisterRequestsPerWindow: 5,
    maxPortalVerificationEmailRequestsPerWindow: 3,
    nextCustomerOrderCode: () => "ARD-0001",
    normalizeCustomerStatus: (value) => value || "",
    normalizeEmail: (value) => String(value || "").trim().toLowerCase(),
    normalizePortalWhatsapp: (value) => String(value || ""),
    nowIso: () => "2026-05-08T15:00:00.000Z",
    parseJson: async (req) => req.body || {},
    phoneKey: (value) => String(value || ""),
    portalFrpPriceSuggestion: () => ({ available: true }),
    portalOrdersSseHeartbeatMs: 25_000,
    portalPublicServices: [],
    publicCustomerOrder: () => ({}),
    publicCustomerOrdersForClient: () => [],
    publicCustomerState: (db, context) => ({ user: context?.user || null, client: context?.client || null, orders: [] }),
    publicPortalCatalog: () => ({ services: [], paymentMethods: [] }),
    publishPortalOrders: () => {},
    publishFrpOps: () => {},
    publicActiveTechnician: () => null,
    customerModuleUrl: "",
    createAuditEvent: () => ({}),
    persistAuditEventOnly: async () => {},
    readDb: async () => {
      calls.push("readDb");
      return {};
    },
    renderOrderComprobantePdf: () => Buffer.from(""),
    reconcilePortalClientLink: () => {},
    removeAdminConfigStream: () => {},
    removePortalOrderStream: () => {},
    requireCustomer: () => true,
    resolvePortalPaymentForClient: () => null,
    sanitizePaymentProofImages: () => [],
    sendCustomerVerificationEmail: async () => {},
    sendJson: (res, status, body) => {
      res.status = status;
      res.body = body;
      return body;
    },
    sendSseEvent: () => {},
    summarizeFrpEligibility: () => "",
    syncFrpOrderStatus: () => {},
    validatePassword: () => ({ ok: true }),
    validatePortalCustomerName: () => ({ ok: true }),
    validateTurnstileIfConfigured: async () => ({ ok: true }),
    verifyPassword: async () => true,
    writeDb: async () => {
      calls.push("writeDb");
    },
    useGranularCustomerAuth: () => false,
    ...overrides,
  };
}

test("portal session keeps legacy path unchanged when customer granular flag is off", async () => {
  const deps = baseDeps();
  const handler = createPortalRoutes(deps);
  const res = createMockRes();

  await handler({ method: "GET", cookies: {} }, res, "/api/portal/session");

  assert.equal(res.status, 200);
  assert.equal(deps.calls.includes("readDb"), false);
  assert.equal(res.headers["set-cookie"], "ariad_customer_device=legacy-device-token; Path=/");
});

test("portal customer granular login/session/logout do not call readDb or writeDb", async () => {
  const calls = [];
  const deps = baseDeps({
    calls,
    useGranularCustomerAuth: () => true,
    readDb: async () => {
      throw new Error("readDb must not be called by granular auth endpoints");
    },
    writeDb: async () => {
      throw new Error("writeDb must not be called by granular auth endpoints");
    },
    customerLoginAttempt: async () => ({
      status: "ok",
      user: { id: "user-1" },
      client: { id: "client-1" },
      device: { id: "device-1" },
    }),
    customerSessionLookup: async () => ({
      user: { id: "user-1" },
      client: { id: "client-1" },
      device: { id: "device-1" },
    }),
    customerSessionBootstrap: async () => ({
      customer: { user: { id: "user-1" }, orders: [] },
      catalog: { services: [] },
    }),
    customerSessionDelete: async () => {
      calls.push("customerSessionDelete");
      return { deleted: 1 };
    },
  });
  const handler = createPortalRoutes(deps);

  const loginRes = createMockRes();
  await handler({
    method: "POST",
    cookies: {},
    headers: { "user-agent": "node-test" },
    body: { email: "bryams@example.com", password: "secret" },
  }, loginRes, "/api/portal/login");
  assert.equal(loginRes.status, 200);

  const sessionRes = createMockRes();
  await handler({
    method: "GET",
    cookies: {
      ariad_customer_session: "session-token",
      ariad_customer_device: "device-token",
    },
    headers: { "user-agent": "node-test" },
  }, sessionRes, "/api/portal/session");
  assert.equal(sessionRes.status, 200);

  const logoutRes = createMockRes();
  await handler({
    method: "POST",
    cookies: { ariad_customer_session: "session-token" },
    headers: { "user-agent": "node-test" },
  }, logoutRes, "/api/portal/logout");
  assert.equal(logoutRes.status, 200);
  assert.equal(calls.includes("customerSessionDelete"), true);
});

test("portal guest routes stay hidden when guest flag is off", async () => {
  const deps = baseDeps({
    usePortalGuestEnabled: () => false,
    readDb: async () => {
      throw new Error("guest disabled route must not read db");
    },
  });
  const handler = createPortalRoutes(deps);
  const res = createMockRes();

  await handler({ method: "GET", cookies: {} }, res, "/api/portal/guest/state");

  assert.equal(res.status, 404);
  assert.deepEqual(res.body, { error: "not_found" });
});

test("portal guest state returns catalog when guest flag is on", async () => {
  const deps = baseDeps({
    usePortalGuestEnabled: () => true,
    publicPortalCatalog: () => ({ services: [{ code: "PORTAL-XIAOMI-FRP" }], paymentMethods: [] }),
  });
  const handler = createPortalRoutes(deps);
  const res = createMockRes();

  await handler({ method: "GET", cookies: {} }, res, "/api/portal/guest/state");

  assert.equal(res.status, 200);
  assert.equal(res.body.guest.enabled, true);
  assert.equal(res.body.catalog.services[0].code, "PORTAL-XIAOMI-FRP");
});

test("portal guest order creation uses guest pricing and returns recovery link", async () => {
  const db = {
    customerClients: [],
    customerOrders: [],
    customerOrderItems: [],
    customerRequests: [],
    guestSessionTokens: [],
    frpOrders: [],
    frpJobs: [],
    tickets: [],
  };
  const pricingCalls = [];
  const deps = baseDeps({
    usePortalGuestEnabled: () => true,
    portalPublicServices: [{ code: "PORTAL-XIAOMI-FRP", enabled: true, internalServiceCode: "XIA-FRP-GOOGLE", name: "Xiaomi FRP" }],
    readDb: async () => db,
    normalizePortalWhatsapp: (whatsapp) => ({ ok: true, whatsapp, country: "Peru", countryIso: "PE", detectedCountry: "Peru" }),
    phoneKey: (value) => String(value || "").replace(/\D/g, ""),
    resolvePortalPaymentForClient: () => ({ code: "BINANCE_PAY", label: "Binance Pay", details: [] }),
    portalFrpPriceSuggestion: (...args) => {
      pricingCalls.push(args);
      return {
        available: true,
        quantity: 1,
        isGuest: Boolean(args[6]?.isGuest),
        unitPrice: 4.5,
        total: 4.5,
        label: "Precio fijo",
        monthlyUsage: 0,
        discountLocked: false,
        nextMonthlyTier: null,
        pricingSnapshot: { version: "frp-pricing-v2", baseUnitPrice: 4, total: 4.5 },
      };
    },
    formatPortalPaymentAmountFromUsdt: () => "4.50 USDT",
    frpEligibilityResult: () => ({ status: "APTO_EXPRESS" }),
    summarizeFrpEligibility: () => ({ blocked: [], review: [] }),
    createFrpOrderFromPortal: () => ({}),
    publicCustomerOrder: (order) => ({
      id: order.id,
      code: order.code,
      shortCode: "ARD-0001",
      publicStatus: order.publicStatus,
    }),
  });
  const handler = createPortalRoutes(deps);
  const res = createMockRes();

  await handler({
    method: "POST",
    cookies: {},
    headers: { "user-agent": "node-test" },
    body: { whatsapp: "+51987654321", country: "PE", quantity: 1, paymentMethod: "BINANCE_PAY" },
  }, res, "/api/portal/guest/orders");

  assert.equal(res.status, 201);
  assert.match(res.headers["set-cookie"], /^ariad_guest_order=/);
  assert.equal(db.customerClients[0].accountType, "guest");
  assert.equal(db.customerOrders.length, 1);
  assert.equal(db.guestSessionTokens.length, 1);
  assert.equal(pricingCalls[0][6].isGuest, true);
  assert.match(res.body.recoveryLink, /^\/pedido\/ARD-0001\?t=/);

  const recoveryUrl = new URL(`http://localhost${res.body.recoveryLink}`);
  const recoveryRes = createMockRes();
  await handler({
    method: "GET",
    cookies: {},
    url: `/api/portal/guest/orders/ARD-0001?t=${encodeURIComponent(recoveryUrl.searchParams.get("t"))}`,
  }, recoveryRes, "/api/portal/guest/orders/ARD-0001");
  assert.equal(recoveryRes.status, 200);
  assert.match(recoveryRes.headers["set-cookie"], /^ariad_guest_order=/);
});

test("portal guest claim requires confirmation and transfers only public candidates", async () => {
  const registeredClient = { id: "client-registered", whatsapp: "+51987654321", accountType: "registered", name: "Bryams" };
  const guestClient = { id: "client-guest", whatsapp: "+51987654321", accountType: "guest", name: "Cliente invitado" };
  const db = {
    customerClients: [registeredClient, guestClient],
    customerOrders: [{ id: "order-guest", code: "ARD-0002", clientId: guestClient.id, publicStatus: "PAGO_EN_REVISION", createdAt: "2026-05-08T15:00:00.000Z" }],
    customerOrderItems: [{ id: "item-guest", orderId: "order-guest", clientId: guestClient.id }],
    customerRequests: [{ id: "request-guest", clientId: guestClient.id }],
    guestSessionTokens: [{ id: "token-guest", clientId: guestClient.id, orderId: "order-guest", revokedAt: "" }],
  };
  const auditEvents = [];
  const deps = baseDeps({
    usePortalGuestEnabled: () => true,
    usePortalGuestClaimEnabled: () => true,
    getCurrentCustomerContext: async () => ({ db, user: { id: "user-registered" }, client: registeredClient, deviceToken: "" }),
    publicCustomerState: (currentDb, context) => ({ user: context.user, client: context.client, orders: currentDb.customerOrders.filter((order) => order.clientId === context.client.id) }),
    audit: (_db, _actor, action, _target, detail) => auditEvents.push({ action, detail }),
  });
  const handler = createPortalRoutes(deps);

  const previewRes = createMockRes();
  await handler({ method: "POST", cookies: {}, body: {} }, previewRes, "/api/portal/guest/claim-preview");
  assert.equal(previewRes.status, 200);
  assert.deepEqual(previewRes.body.candidates, [{ code: "ARD-0002", status: "PAGO_EN_REVISION", createdAt: "2026-05-08T15:00:00.000Z" }]);
  assert.equal(JSON.stringify(previewRes.body).includes("+51987654321"), false);

  const rejectedRes = createMockRes();
  await handler({ method: "POST", cookies: {}, body: { confirm: false } }, rejectedRes, "/api/portal/guest/claim");
  assert.equal(rejectedRes.status, 400);

  const claimRes = createMockRes();
  await handler({ method: "POST", cookies: {}, body: { confirm: true, codes: ["ARD-0002"] } }, claimRes, "/api/portal/guest/claim");
  assert.equal(claimRes.status, 200);
  assert.equal(db.customerOrders[0].clientId, registeredClient.id);
  assert.equal(db.customerOrderItems[0].clientId, registeredClient.id);
  assert.equal(db.customerRequests[0].clientId, registeredClient.id);
  assert.ok(db.guestSessionTokens[0].revokedAt);
  assert.equal(auditEvents.some((event) => event.action === "PORTAL_GUEST_CLAIM"), true);
  assert.equal(JSON.stringify(auditEvents).includes("+51987654321"), false);
});
