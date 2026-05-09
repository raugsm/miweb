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
