import assert from "node:assert/strict";
import test from "node:test";

import {
  customerLoginAttempt,
  customerRateLimitCheck,
  customerSessionDelete,
  customerSessionLookup,
  operatorLoginAttempt,
  operatorRateLimitCheck,
  operatorSessionLookup,
  preserveCurrentAuthRowsBeforeLegacyReplace,
} from "../server/db/postgres-auth.js";

const nowMs = Date.parse("2026-05-08T15:00:00.000Z");
const nowIso = new Date(nowMs).toISOString();

function labelSql(sql) {
  const normalized = String(sql || "").replace(/\s+/g, " ").trim().toLowerCase();
  if (normalized === "begin") return "BEGIN";
  if (normalized === "commit") return "COMMIT";
  if (normalized === "rollback") return "ROLLBACK";
  if (normalized.startsWith("set local search_path")) return "set search_path";
  if (normalized.includes("pg_advisory_xact_lock")) return "advisory_lock";
  if (normalized.startsWith("delete from portal_rate_limits")) return "delete old rate limits";
  if (normalized.includes("count(*)::int as attempts") && normalized.includes("ip_hash = $2")) return "count rate ip";
  if (normalized.includes("count(*)::int as attempts") && normalized.includes("key_hash = $2")) return "count rate key";
  if (normalized.startsWith("insert into portal_rate_limits")) return "insert rate attempt";
  if (normalized.includes("from customer_users u")) return "select customer login";
  if (normalized.startsWith("insert into customer_devices")) return "upsert customer device";
  if (normalized.includes("from customer_device_authorizations")) return "select customer auth";
  if (normalized.startsWith("delete from customer_sessions where expires_at")) return "delete old customer sessions";
  if (normalized.startsWith("insert into customer_sessions")) return "insert customer session";
  if (normalized.startsWith("select s.*") && normalized.includes("from customer_sessions s")) return "select customer session";
  if (normalized.startsWith("update customer_sessions")) return "touch customer session";
  if (normalized.startsWith("update customer_devices")) return "touch customer device";
  if (normalized.startsWith("delete from customer_sessions where token_hash")) return "delete customer session";
  if (normalized.startsWith("select * from operator_users")) return "select operator login";
  if (normalized.startsWith("insert into operator_devices")) return "upsert operator device";
  if (normalized.includes("from operator_device_admin_users where device_id = $1 and user_id = $2")) return "select operator device trust";
  if (normalized.includes("from operator_device_admin_users where user_id = $1")) return "select operator trusted exists";
  if (normalized.startsWith("update operator_devices")) return "trust operator device";
  if (normalized.startsWith("insert into operator_device_admin_users")) return "insert operator admin device";
  if (normalized.startsWith("insert into operator_device_approvals")) return "insert operator approval";
  if (normalized.startsWith("delete from operator_sessions where expires_at")) return "delete old operator sessions";
  if (normalized.startsWith("insert into operator_sessions")) return "insert operator session";
  if (normalized.startsWith("select s.*") && normalized.includes("from operator_sessions s")) return "select operator session";
  if (normalized.startsWith("delete from operator_sessions where token_hash")) return "delete operator session";
  if (normalized.startsWith("insert into ariad.audit_events")) return "insert audit";
  return normalized.slice(0, 120);
}

class MockClient {
  constructor(responses = {}) {
    this.responses = responses;
    this.calls = [];
  }

  async query(sql, params = []) {
    const label = labelSql(sql);
    this.calls.push(label);
    const handler = this.responses[label];
    if (typeof handler === "function") return handler({ sql, params, calls: this.calls });
    if (handler) return handler;
    return { rows: [], rowCount: 0 };
  }
}

function baseDeviceInfo() {
  return {
    tokenHash: "device-token-hash",
    userAgent: "node-test",
    ipHash: "ip-hash",
    nowIso,
    nowMs,
  };
}

function rateLimitResponses({ ipAttempts = 0, keyAttempts = 0 } = {}) {
  return {
    "count rate ip": { rows: [{ attempts: ipAttempts }] },
    "count rate key": { rows: [{ attempts: keyAttempts }] },
  };
}

const customerRow = {
  id: "11111111-1111-4111-8111-111111111111",
  client_id: "22222222-2222-4222-8222-222222222222",
  name: "Bryams Zuniga",
  email: "bryams@example.com",
  password_hash: "stored-customer-hash",
  role: "OWNER",
  active: true,
  created_at: nowIso,
  updated_at: nowIso,
  legacy_json: {
    id: "11111111-1111-4111-8111-111111111111",
    clientId: "22222222-2222-4222-8222-222222222222",
    name: "Bryams Zuniga",
    email: "bryams@example.com",
    passwordHash: "stored-customer-hash",
    active: true,
  },
  client_id_row: "22222222-2222-4222-8222-222222222222",
  master_client_id: "",
  client_name: "Bryams Zuniga",
  whatsapp: "+51999999999",
  country: "PE",
  client_status: "EMAIL_VERIFICADO",
  primary_email: "bryams@example.com",
  client_created_at: nowIso,
  client_updated_at: nowIso,
  client_legacy_json: {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Bryams Zuniga",
    status: "EMAIL_VERIFICADO",
  },
};

const customerDeviceRow = {
  id: "33333333-3333-4333-8333-333333333333",
  token_hash: "device-token-hash",
  user_agent: "node-test",
  first_ip_hash: "ip-hash",
  last_seen_at: nowIso,
  created_at: nowIso,
  legacy_json: {
    id: "33333333-3333-4333-8333-333333333333",
    tokenHash: "device-token-hash",
    authorizedClientIds: ["22222222-2222-4222-8222-222222222222"],
  },
};

test("customerRateLimitCheck uses advisory lock before counting and records the attempt", async () => {
  const client = new MockClient(rateLimitResponses());

  const result = await customerRateLimitCheck("bryams@example.com", baseDeviceInfo(), {
    client,
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000,
  });

  assert.equal(result.allowed, true);
  assert.deepEqual(client.calls, [
    "BEGIN",
    "set search_path",
    "advisory_lock",
    "delete old rate limits",
    "count rate ip",
    "count rate key",
    "insert rate attempt",
    "COMMIT",
  ]);
});

test("operatorRateLimitCheck blocks once the window has max attempts", async () => {
  const client = new MockClient(rateLimitResponses({ ipAttempts: 5, keyAttempts: 2 }));

  const result = await operatorRateLimitCheck("admin@example.com", baseDeviceInfo(), {
    client,
    maxAttempts: 5,
  });

  assert.equal(result.allowed, false);
  assert.equal(result.attempts, 6);
});

test("customerLoginAttempt creates session without holding a transaction during password verification", async () => {
  const client = new MockClient({
    ...rateLimitResponses(),
    "select customer login": { rows: [customerRow] },
    "upsert customer device": { rows: [customerDeviceRow] },
    "select customer auth": { rows: [{ client_id: "22222222-2222-4222-8222-222222222222" }] },
    "insert customer session": {
      rows: [{
        id: "44444444-4444-4444-8444-444444444444",
        user_id: "11111111-1111-4111-8111-111111111111",
        client_id: "22222222-2222-4222-8222-222222222222",
        token_hash: "session-token-hash",
        device_id: "33333333-3333-4333-8333-333333333333",
        version: 1,
        last_seen_at: nowIso,
        expires_at: new Date(nowMs + 3600_000).toISOString(),
        created_at: nowIso,
        legacy_json: {
          id: "44444444-4444-4444-8444-444444444444",
          userId: "11111111-1111-4111-8111-111111111111",
          clientId: "22222222-2222-4222-8222-222222222222",
          tokenHash: "session-token-hash",
          expiresAt: nowMs + 3600_000,
        },
      }],
    },
  });

  const result = await customerLoginAttempt("bryams@example.com", "secret", baseDeviceInfo(), {
    client,
    sessionTokenHash: "session-token-hash",
    sessionVersion: 1,
    sessionMaxAgeSeconds: 3600,
    verifyPassword: async () => {
      client.calls.push("verify-password");
      return true;
    },
  });

  assert.equal(result.status, "ok");
  assert.deepEqual(client.calls, [
    "BEGIN",
    "set search_path",
    "advisory_lock",
    "delete old rate limits",
    "count rate ip",
    "count rate key",
    "insert rate attempt",
    "COMMIT",
    "set search_path",
    "select customer login",
    "set search_path",
    "upsert customer device",
    "select customer auth",
    "verify-password",
    "BEGIN",
    "set search_path",
    "delete old customer sessions",
    "insert customer session",
    "COMMIT",
    "insert audit",
  ]);
});

test("customerLoginAttempt records failed login and never inserts a session", async () => {
  const client = new MockClient({
    ...rateLimitResponses(),
    "select customer login": { rows: [customerRow] },
    "upsert customer device": { rows: [customerDeviceRow] },
    "select customer auth": { rows: [] },
  });

  const result = await customerLoginAttempt("bryams@example.com", "bad", baseDeviceInfo(), {
    client,
    sessionTokenHash: "session-token-hash",
    verifyPassword: async () => false,
  });

  assert.equal(result.status, "invalid_credentials");
  assert.equal(client.calls.includes("insert customer session"), false);
  assert.equal(client.calls.at(-1), "insert audit");
});

test("customerSessionLookup returns null for expired or missing sessions", async () => {
  const client = new MockClient({
    "select customer session": { rows: [] },
  });

  const result = await customerSessionLookup("missing", "device-token-hash", {
    client,
    sessionVersion: 1,
  });

  assert.equal(result.user, null);
  assert.deepEqual(client.calls, ["set search_path", "select customer session"]);
});

test("customerSessionLookup touches active session and device after the presence interval", async () => {
  const oldIso = new Date(nowMs - 60_000).toISOString();
  const client = new MockClient({
    "select customer session": {
      rows: [{
        id: "44444444-4444-4444-8444-444444444444",
        user_id: "11111111-1111-4111-8111-111111111111",
        client_id: "22222222-2222-4222-8222-222222222222",
        token_hash: "session-token-hash",
        device_id: "33333333-3333-4333-8333-333333333333",
        version: 1,
        last_seen_at: oldIso,
        expires_at: new Date(nowMs + 3600_000).toISOString(),
        created_at: oldIso,
        legacy_json: {
          id: "44444444-4444-4444-8444-444444444444",
          userId: "11111111-1111-4111-8111-111111111111",
          clientId: "22222222-2222-4222-8222-222222222222",
          tokenHash: "session-token-hash",
          deviceId: "33333333-3333-4333-8333-333333333333",
          version: 1,
          lastSeenAt: oldIso,
          lastSeenAtMs: nowMs - 60_000,
          expiresAt: nowMs + 3600_000,
        },
        user_id_row: "11111111-1111-4111-8111-111111111111",
        user_client_id: "22222222-2222-4222-8222-222222222222",
        user_name: "Bryams Zuniga",
        user_email: "bryams@example.com",
        user_password_hash: "stored-customer-hash",
        user_role: "OWNER",
        user_active: true,
        user_created_at: oldIso,
        user_updated_at: oldIso,
        user_legacy_json: customerRow.legacy_json,
        client_id_row: "22222222-2222-4222-8222-222222222222",
        client_name: "Bryams Zuniga",
        client_status: "EMAIL_VERIFICADO",
        client_created_at: oldIso,
        client_updated_at: oldIso,
        client_legacy_json: customerRow.client_legacy_json,
        device_id_row: "33333333-3333-4333-8333-333333333333",
        device_token_hash: "device-token-hash",
        device_user_agent: "node-test",
        device_first_ip_hash: "ip-hash",
        device_last_seen_at: oldIso,
        device_created_at: oldIso,
        device_legacy_json: customerDeviceRow.legacy_json,
      }],
    },
    "select customer auth": { rows: [{ client_id: "22222222-2222-4222-8222-222222222222" }] },
  });

  const result = await customerSessionLookup("session-token-hash", "device-token-hash", {
    client,
    nowMs,
    nowIso,
    sessionVersion: 1,
    presenceWriteIntervalMs: 10_000,
  });

  assert.equal(result.user.email, "bryams@example.com");
  assert.equal(result.deviceAuthorizedForBenefits, true);
  assert.equal(client.calls.includes("touch customer session"), true);
  assert.equal(client.calls.includes("touch customer device"), true);
});

test("customerSessionDelete is idempotent by token hash", async () => {
  const client = new MockClient({
    "delete customer session": { rows: [], rowCount: 0 },
  });

  const result = await customerSessionDelete("session-token-hash", { client });

  assert.deepEqual(result, { deleted: 0 });
  assert.deepEqual(client.calls, ["set search_path", "delete customer session"]);
});

test("operatorLoginAttempt authorizes the first admin device and creates a session", async () => {
  const operatorRow = {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    name: "Admin",
    email: "admin@example.com",
    password_hash: "operator-hash",
    role: "ADMIN",
    active: true,
    created_at: nowIso,
    updated_at: nowIso,
    legacy_json: {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      email: "admin@example.com",
      passwordHash: "operator-hash",
      role: "ADMIN",
      active: true,
    },
  };
  const operatorDevice = {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    token_hash: "device-token-hash",
    user_agent: "node-test",
    first_ip_hash: "ip-hash",
    created_at: nowIso,
    legacy_json: {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      tokenHash: "device-token-hash",
      adminUserIds: [],
    },
  };
  const client = new MockClient({
    ...rateLimitResponses(),
    "select operator login": { rows: [operatorRow] },
    "upsert operator device": { rows: [operatorDevice] },
    "select operator device trust": { rows: [] },
    "select operator trusted exists": { rows: [] },
    "insert operator session": {
      rows: [{
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        token_hash: "session-token-hash",
        device_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        version: 7,
        last_seen_at: nowIso,
        expires_at: new Date(nowMs + 3600_000).toISOString(),
        created_at: nowIso,
        legacy_json: {
          id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          tokenHash: "session-token-hash",
          version: 7,
          expiresAt: nowMs + 3600_000,
        },
      }],
    },
  });

  const result = await operatorLoginAttempt("admin@example.com", "secret", baseDeviceInfo(), {
    client,
    sessionTokenHash: "session-token-hash",
    sessionVersion: 7,
    trustedDeviceVersion: 3,
    sessionMaxAgeSeconds: 3600,
    setupToken: "setup-ok",
    operatorPin: "setup-ok",
    verifyPassword: async () => true,
  });

  assert.equal(result.status, "ok");
  assert.equal(client.calls.includes("trust operator device"), true);
  assert.equal(client.calls.includes("insert operator admin device"), true);
  assert.equal(client.calls.includes("insert operator session"), true);
});

test("operatorSessionLookup rejects admin sessions when device trust does not match", async () => {
  const client = new MockClient({
    "select operator session": {
      rows: [{
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        token_hash: "session-token-hash",
        device_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        version: 7,
        last_seen_at: nowIso,
        expires_at: new Date(nowMs + 3600_000).toISOString(),
        created_at: nowIso,
        legacy_json: {
          id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          tokenHash: "session-token-hash",
          deviceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          version: 7,
          expiresAt: nowMs + 3600_000,
        },
        user_id_row: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        user_name: "Admin",
        user_email: "admin@example.com",
        user_password_hash: "operator-hash",
        user_role: "ADMIN",
        user_active: true,
        user_created_at: nowIso,
        user_updated_at: nowIso,
        user_legacy_json: {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          role: "ADMIN",
          active: true,
        },
        device_id_row: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        device_token_hash: "different-device-token-hash",
        device_user_agent: "node-test",
        device_first_ip_hash: "ip-hash",
        trust_version: 3,
        device_created_at: nowIso,
        device_legacy_json: {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          tokenHash: "different-device-token-hash",
          adminUserIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
        },
      }],
    },
  });

  const result = await operatorSessionLookup("session-token-hash", "device-token-hash", {
    client,
    nowMs,
    nowIso,
    sessionVersion: 7,
    trustedDeviceVersion: 3,
  });

  assert.equal(result, null);
  assert.equal(client.calls.includes("delete operator session"), true);
  assert.equal(client.calls.at(-1), "insert audit");
});

test("preserveCurrentAuthRowsBeforeLegacyReplace keeps granular sessions missing from stale legacy snapshots", async () => {
  const currentCustomerDevice = {
    id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    token_hash: "customer-device-token-hash",
    user_agent: "node-test",
    first_ip_hash: "ip-hash",
    last_seen_at: nowIso,
    created_at: nowIso,
    legacy_json: { id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", tokenHash: "customer-device-token-hash" },
  };
  const currentCustomerSession = {
    id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    user_id: "11111111-1111-4111-8111-111111111111",
    client_id: "22222222-2222-4222-8222-222222222222",
    token_hash: "fresh-customer-session-hash",
    device_id: currentCustomerDevice.id,
    version: 1,
    last_seen_at: nowIso,
    expires_at: new Date(nowMs + 3600_000).toISOString(),
    created_at: nowIso,
    legacy_json: { id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", tokenHash: "fresh-customer-session-hash" },
  };
  const currentOperatorDevice = {
    id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    token_hash: "operator-device-token-hash",
    user_agent: "node-test",
    first_ip_hash: "ip-hash",
    trust_version: 3,
    trusted_at: nowIso,
    last_seen_at: nowIso,
    created_at: nowIso,
    legacy_json: { id: "ffffffff-ffff-4fff-8fff-ffffffffffff", tokenHash: "operator-device-token-hash" },
  };
  const currentOperatorSession = {
    id: "99999999-9999-4999-8999-999999999999",
    user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    token_hash: "fresh-operator-session-hash",
    device_id: currentOperatorDevice.id,
    version: 7,
    last_seen_at: nowIso,
    expires_at: new Date(nowMs + 3600_000).toISOString(),
    created_at: nowIso,
    legacy_json: { id: "99999999-9999-4999-8999-999999999999", tokenHash: "fresh-operator-session-hash" },
  };
  const client = new MockClient({
    "select * from operator_devices order by created_at asc, id asc": { rows: [currentOperatorDevice] },
    "select * from operator_device_admin_users order by created_at asc, user_id asc": {
      rows: [{ device_id: currentOperatorDevice.id, user_id: currentOperatorSession.user_id, created_at: nowIso }],
    },
    "select * from operator_sessions order by created_at asc, id asc": { rows: [currentOperatorSession] },
    "select * from customer_devices order by created_at asc, id asc": { rows: [currentCustomerDevice] },
    "select * from customer_device_authorizations order by authorized_at asc, client_id asc": {
      rows: [{ device_id: currentCustomerDevice.id, client_id: currentCustomerSession.client_id, authorized_at: nowIso }],
    },
    "select * from customer_sessions order by created_at asc, id asc": { rows: [currentCustomerSession] },
  });
  client.query = async function query(sql, params = []) {
    const normalized = String(sql || "").replace(/\s+/g, " ").trim().toLowerCase();
    this.calls.push(normalized.startsWith("set local search_path") ? "set search_path" : normalized);
    const handler = this.responses[normalized];
    return handler || { rows: [], rowCount: 0 };
  };
  const plan = {
    rows: {
      operator_devices: [],
      operator_device_admin_users: [],
      operator_sessions: [],
      customer_devices: [],
      customer_device_authorizations: [],
      customer_sessions: [],
    },
    tables: {},
  };

  await preserveCurrentAuthRowsBeforeLegacyReplace(client, plan);

  assert.equal(plan.rows.customer_sessions[0].token_hash, "fresh-customer-session-hash");
  assert.equal(plan.rows.operator_sessions[0].token_hash, "fresh-operator-session-hash");
  assert.equal(plan.rows.customer_devices[0].id, currentCustomerDevice.id);
  assert.equal(plan.rows.operator_devices[0].id, currentOperatorDevice.id);
  assert.equal(plan.rows.customer_device_authorizations.length, 1);
  assert.equal(plan.rows.operator_device_admin_users.length, 1);
  assert.equal(plan.tables.customer_sessions, 1);
  assert.equal(plan.tables.operator_sessions, 1);
});
