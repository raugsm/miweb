import crypto from "node:crypto";
import { withPostgresClient, withTransaction } from "./postgres.js";
import { insertAuditEventWithClient } from "./postgres-audit.js";

const defaultRateLimitWindowMs = 15 * 60 * 1000;
const defaultMaxLoginAttempts = 5;
const defaultSessionTouchMs = 10 * 1000;

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function nowIso() {
  return new Date().toISOString();
}

function dateFromMs(ms) {
  return new Date(ms).toISOString();
}

function timestampMs(value) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function legacyObject(row) {
  return row?.legacy_json && typeof row.legacy_json === "object" && !Array.isArray(row.legacy_json)
    ? { ...row.legacy_json }
    : {};
}

function jsonObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function toBool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === null || value === undefined) return fallback;
  return !["0", "false", "no"].includes(String(value).trim().toLowerCase());
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function defaultDeviceInfo(deviceInfo = {}) {
  const now = Number(deviceInfo.nowMs || Date.now());
  return {
    tokenHash: String(deviceInfo.tokenHash || ""),
    userAgent: String(deviceInfo.userAgent || "unknown").slice(0, 180),
    ipHash: String(deviceInfo.ipHash || ""),
    nowIso: String(deviceInfo.nowIso || dateFromMs(now)),
    nowMs: now,
  };
}

function rateLimitKeyHash(email) {
  const normalized = normalizeEmail(email);
  return normalized ? sha256(normalized) : "";
}

function auditEvent(actorId, action, targetId, detail = {}, createdAt = nowIso()) {
  return {
    id: crypto.randomUUID(),
    actorId: actorId || null,
    action,
    targetId: targetId || null,
    detail: jsonObject(detail),
    createdAt,
  };
}

async function safeInsertAudit(client, event, label) {
  try {
    await insertAuditEventWithClient(client, event);
  } catch (error) {
    console.warn(`[postgres-auth] audit ${label || event.action} failed:`, error?.message || error);
  }
}

async function usingClient(options, callback) {
  if (options?.client) return callback(options.client);
  return withPostgresClient(callback);
}

async function usingTransaction(options, callback) {
  if (options?.client) {
    await options.client.query("BEGIN");
    try {
      const result = await callback(options.client);
      await options.client.query("COMMIT");
      return result;
    } catch (error) {
      await options.client.query("ROLLBACK").catch(() => {});
      throw error;
    }
  }
  return withTransaction(callback);
}

function customerClientFromRow(row) {
  if (!row) return null;
  const legacy = legacyObject(row);
  return {
    ...legacy,
    id: row.id || legacy.id || "",
    masterClientId: row.master_client_id || legacy.masterClientId || "",
    name: row.name || legacy.name || "",
    whatsapp: row.whatsapp || legacy.whatsapp || "",
    country: row.country || legacy.country || "",
    whatsappCountryIso: row.whatsapp_country_iso || legacy.whatsappCountryIso || "",
    whatsappDetectedCountry: row.whatsapp_detected_country || legacy.whatsappDetectedCountry || "",
    status: row.status || legacy.status || "",
    primaryEmail: row.primary_email || legacy.primaryEmail || "",
    emailVerifiedAt: row.email_verified_at ? new Date(row.email_verified_at).toISOString() : legacy.emailVerifiedAt || "",
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : legacy.createdAt || "",
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : legacy.updatedAt || "",
  };
}

function customerUserFromRow(row) {
  if (!row) return null;
  const legacy = legacyObject(row);
  return {
    ...legacy,
    id: row.id || legacy.id || "",
    clientId: row.client_id || legacy.clientId || "",
    name: row.name || legacy.name || "",
    email: row.email || legacy.email || "",
    passwordHash: row.password_hash || legacy.passwordHash || "",
    role: row.role || legacy.role || "OWNER",
    active: row.active === undefined ? legacy.active !== false : toBool(row.active, true),
    emailVerifiedAt: row.email_verified_at ? new Date(row.email_verified_at).toISOString() : legacy.emailVerifiedAt || "",
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : legacy.createdAt || "",
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : legacy.updatedAt || "",
  };
}

function operatorUserFromRow(row) {
  if (!row) return null;
  const legacy = legacyObject(row);
  return {
    ...legacy,
    id: row.id || legacy.id || "",
    name: row.name || legacy.name || "",
    email: row.email || legacy.email || "",
    passwordHash: row.password_hash || legacy.passwordHash || "",
    role: row.role || legacy.role || "PENDIENTE",
    workChannel: row.work_channel || legacy.workChannel || "",
    permissions: jsonObject(row.permissions || legacy.permissions),
    operatorPinHash: row.operator_pin_hash || legacy.operatorPinHash || "",
    technicianRedirectorId: row.technician_redirector_id || legacy.technicianRedirectorId || "",
    active: row.active === undefined ? legacy.active !== false : toBool(row.active, true),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : legacy.createdAt || "",
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : legacy.updatedAt || "",
  };
}

function customerDeviceFromRow(row, authorizedClientIds = []) {
  if (!row) return null;
  const legacy = legacyObject(row);
  return {
    ...legacy,
    id: row.id || legacy.id || "",
    tokenHash: row.token_hash || legacy.tokenHash || "",
    authorizedClientIds: authorizedClientIds.length ? authorizedClientIds : Array.isArray(legacy.authorizedClientIds) ? legacy.authorizedClientIds : [],
    userAgent: row.user_agent || legacy.userAgent || "",
    firstIpHash: row.first_ip_hash || legacy.firstIpHash || "",
    lastSeenAt: row.last_seen_at ? new Date(row.last_seen_at).toISOString() : legacy.lastSeenAt || "",
    lastSeenAtMs: row.last_seen_at ? timestampMs(row.last_seen_at) : Number(legacy.lastSeenAtMs || 0),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : legacy.createdAt || "",
  };
}

function operatorDeviceFromRow(row, adminUserIds = []) {
  if (!row) return null;
  const legacy = legacyObject(row);
  return {
    ...legacy,
    id: row.id || legacy.id || "",
    tokenHash: row.token_hash || legacy.tokenHash || "",
    adminUserIds: adminUserIds.length ? adminUserIds : Array.isArray(legacy.adminUserIds) ? legacy.adminUserIds : [],
    userAgent: row.user_agent || legacy.userAgent || "",
    firstIpHash: row.first_ip_hash || legacy.firstIpHash || "",
    trustVersion: row.trust_version === null || row.trust_version === undefined ? legacy.trustVersion : Number(row.trust_version),
    trustedAt: row.trusted_at ? new Date(row.trusted_at).toISOString() : legacy.trustedAt || "",
    lastSeenAt: row.last_seen_at ? new Date(row.last_seen_at).toISOString() : legacy.lastSeenAt || "",
    lastSeenAtMs: row.last_seen_at ? timestampMs(row.last_seen_at) : Number(legacy.lastSeenAtMs || 0),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : legacy.createdAt || "",
  };
}

function sessionFromRow(row, type = "operator") {
  if (!row) return null;
  const legacy = legacyObject(row);
  const expiresMs = timestampMs(row.expires_at || legacy.expiresAt);
  const lastSeenMs = timestampMs(row.last_seen_at || legacy.lastSeenAt);
  return {
    ...legacy,
    id: row.id || legacy.id || "",
    userId: row.user_id || legacy.userId || "",
    ...(type === "customer" ? { clientId: row.client_id || legacy.clientId || "" } : {}),
    tokenHash: row.token_hash || legacy.tokenHash || "",
    deviceId: row.device_id || legacy.deviceId || "",
    version: Number(row.version || legacy.version || 0),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : legacy.createdAt || "",
    lastSeenAt: row.last_seen_at ? new Date(row.last_seen_at).toISOString() : legacy.lastSeenAt || "",
    lastSeenAtMs: lastSeenMs,
    expiresAt: Number(legacy.expiresAt || expiresMs || 0),
  };
}

function orderFromRow(row) {
  if (!row) return null;
  const legacy = legacyObject(row);
  return {
    ...legacy,
    id: row.id || legacy.id || "",
    code: row.code || legacy.code || "",
    clientId: row.client_id || legacy.clientId || "",
    masterClientId: row.master_client_id || legacy.masterClientId || "",
    userId: row.user_id || legacy.userId || "",
    frpOrderId: row.frp_order_id || legacy.frpOrderId || "",
    serviceCode: row.service_code || legacy.serviceCode || "",
    internalServiceCode: row.internal_service_code || legacy.internalServiceCode || "",
    serviceName: row.service_name || legacy.serviceName || "",
    quantity: toNumber(row.quantity, legacy.quantity || 1),
    unitPrice: toNumber(row.unit_price_usdt, legacy.unitPrice || 0),
    totalPrice: toNumber(row.total_price_usdt, legacy.totalPrice || 0),
    priceFormatted: row.price_formatted || legacy.priceFormatted || "",
    pricingSnapshot: row.pricing_snapshot || legacy.pricingSnapshot || {},
    paymentMethod: row.payment_method || legacy.paymentMethod || "",
    paymentLabel: row.payment_label || legacy.paymentLabel || "",
    publicStatus: row.public_status || legacy.publicStatus || "",
    frpOrderId: row.frp_order_id || legacy.frpOrderId || "",
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : legacy.createdAt || "",
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : legacy.updatedAt || "",
  };
}

function genericLegacyRow(row) {
  if (!row) return null;
  return {
    ...legacyObject(row),
    id: row.id || legacyObject(row).id || "",
  };
}

async function rateLimitCheck(bucket, email, deviceInfo, options = {}) {
  const info = defaultDeviceInfo(deviceInfo);
  const windowMs = Number(options.windowMs || defaultRateLimitWindowMs);
  const maxAttempts = Number(options.maxAttempts || defaultMaxLoginAttempts);
  const sinceIso = dateFromMs(info.nowMs - windowMs);
  const keyHash = options.keyHash || rateLimitKeyHash(email);
  const lockKey = keyHash || info.ipHash || "anonymous";
  return usingTransaction(options, async (client) => {
    await client.query("set local search_path = ariad, public");
    await client.query("select pg_advisory_xact_lock(hashtext($1), hashtext($2))", [bucket, lockKey]);
    const id = crypto.randomUUID();
    await client.query(
      `
        delete from portal_rate_limits
        where bucket = $1
          and created_at < $2
          and (ip_hash = $3 or key_hash = $4)
      `,
      [bucket, sinceIso, info.ipHash, keyHash],
    );
    const ipResult = await client.query(
      "select count(*)::int as attempts from portal_rate_limits where bucket = $1 and ip_hash = $2 and created_at >= $3",
      [bucket, info.ipHash, sinceIso],
    );
    let keyAttempts = 0;
    if (keyHash) {
      const keyResult = await client.query(
        "select count(*)::int as attempts from portal_rate_limits where bucket = $1 and key_hash = $2 and created_at >= $3",
        [bucket, keyHash, sinceIso],
      );
      keyAttempts = Number(keyResult.rows[0]?.attempts || 0);
    }
    const attempts = Math.max(Number(ipResult.rows[0]?.attempts || 0), keyAttempts);
    await client.query(
      `
        insert into portal_rate_limits
          (id, bucket, ip_hash, key_hash, created_at, legacy_json)
        values
          ($1, $2, $3, $4, $5, $6::jsonb)
      `,
      [
        id,
        bucket,
        info.ipHash,
        keyHash,
        info.nowIso,
        JSON.stringify({
          id,
          bucket,
          ipHash: info.ipHash,
          keyHash,
          createdAt: info.nowIso,
        }),
      ],
    );
    return {
      allowed: attempts < maxAttempts,
      attempts: attempts + 1,
      maxAttempts,
      resetAt: dateFromMs(info.nowMs + windowMs),
      ipHash: info.ipHash,
      keyHash,
    };
  });
}

export function customerRateLimitCheck(email, deviceInfo, options = {}) {
  return rateLimitCheck(options.bucket || "portal_login", email, deviceInfo, options);
}

export function operatorRateLimitCheck(email, deviceInfo, options = {}) {
  return rateLimitCheck(options.bucket || "operator_login", email, deviceInfo, options);
}

async function findCustomerLogin(email, options = {}) {
  return usingClient(options, async (client) => {
    await client.query("set local search_path = ariad, public");
    const result = await client.query(
      `
        select
          u.*,
          c.id as client_id_row,
          c.master_client_id,
          c.name as client_name,
          c.whatsapp,
          c.country,
          c.whatsapp_country_iso,
          c.whatsapp_detected_country,
          c.status as client_status,
          c.primary_email,
          c.email_verified_at as client_email_verified_at,
          c.created_at as client_created_at,
          c.updated_at as client_updated_at,
          c.legacy_json as client_legacy_json
        from customer_users u
        join customer_clients c on c.id = u.client_id
        where u.email = $1
        limit 1
      `,
      [normalizeEmail(email)],
    );
    const row = result.rows[0];
    if (!row) return { user: null, client: null };
    return {
      user: customerUserFromRow(row),
      client: customerClientFromRow({
        id: row.client_id_row,
        master_client_id: row.master_client_id,
        name: row.client_name,
        whatsapp: row.whatsapp,
        country: row.country,
        whatsapp_country_iso: row.whatsapp_country_iso,
        whatsapp_detected_country: row.whatsapp_detected_country,
        status: row.client_status,
        primary_email: row.primary_email,
        email_verified_at: row.client_email_verified_at,
        created_at: row.client_created_at,
        updated_at: row.client_updated_at,
        legacy_json: row.client_legacy_json,
      }),
    };
  });
}

async function findOperatorLogin(email, options = {}) {
  return usingClient(options, async (client) => {
    await client.query("set local search_path = ariad, public");
    const result = await client.query("select * from operator_users where email = $1 limit 1", [normalizeEmail(email)]);
    return operatorUserFromRow(result.rows[0]);
  });
}

async function upsertCustomerDevice(deviceInfo, options = {}) {
  const info = defaultDeviceInfo(deviceInfo);
  return usingClient(options, async (client) => {
    await client.query("set local search_path = ariad, public");
    const id = options.deviceId || crypto.randomUUID();
    const legacy = {
      id,
      tokenHash: info.tokenHash,
      authorizedClientIds: [],
      userAgent: info.userAgent,
      firstIpHash: info.ipHash,
      createdAt: info.nowIso,
      lastSeenAt: info.nowIso,
      lastSeenAtMs: info.nowMs,
    };
    const result = await client.query(
      `
        insert into customer_devices
          (id, token_hash, user_agent, first_ip_hash, last_seen_at, created_at, legacy_json)
        values
          ($1, $2, $3, $4, $5, $5, $6::jsonb)
        on conflict (token_hash) do update
          set last_seen_at = excluded.last_seen_at,
              user_agent = excluded.user_agent,
              legacy_json = customer_devices.legacy_json || jsonb_build_object(
                'lastSeenAt', excluded.last_seen_at,
                'lastSeenAtMs', $7::bigint,
                'userAgent', excluded.user_agent
              )
        returning *
      `,
      [id, info.tokenHash, info.userAgent, info.ipHash, info.nowIso, JSON.stringify(legacy), info.nowMs],
    );
    const authRows = await client.query(
      "select client_id from customer_device_authorizations where device_id = $1 order by authorized_at asc",
      [result.rows[0]?.id],
    );
    return customerDeviceFromRow(result.rows[0], authRows.rows.map((row) => row.client_id));
  });
}

async function upsertOperatorDevice(deviceInfo, options = {}) {
  const info = defaultDeviceInfo(deviceInfo);
  return usingClient(options, async (client) => {
    await client.query("set local search_path = ariad, public");
    const id = options.deviceId || crypto.randomUUID();
    const legacy = {
      id,
      tokenHash: info.tokenHash,
      adminUserIds: [],
      userAgent: info.userAgent,
      firstIpHash: info.ipHash,
      createdAt: info.nowIso,
      lastSeenAt: info.nowIso,
      lastSeenAtMs: info.nowMs,
    };
    const result = await client.query(
      `
        insert into operator_devices
          (id, token_hash, user_agent, first_ip_hash, last_seen_at, created_at, legacy_json)
        values
          ($1, $2, $3, $4, $5, $5, $6::jsonb)
        on conflict (token_hash) do update
          set last_seen_at = excluded.last_seen_at,
              user_agent = excluded.user_agent,
              legacy_json = operator_devices.legacy_json || jsonb_build_object(
                'lastSeenAt', excluded.last_seen_at,
                'lastSeenAtMs', $7::bigint,
                'userAgent', excluded.user_agent
              )
        returning *
      `,
      [id, info.tokenHash, info.userAgent, info.ipHash, info.nowIso, JSON.stringify(legacy), info.nowMs],
    );
    const adminRows = await client.query(
      "select user_id from operator_device_admin_users where device_id = $1 order by created_at asc",
      [result.rows[0]?.id],
    );
    return operatorDeviceFromRow(result.rows[0], adminRows.rows.map((row) => row.user_id));
  });
}

export async function customerLoginRecordFail(email, deviceInfo, clientId = null, options = {}) {
  const info = defaultDeviceInfo(deviceInfo);
  return usingClient(options, async (client) => {
    await safeInsertAudit(
      client,
      auditEvent(null, "PORTAL_LOGIN_FAILED", clientId, {
        emailHash: rateLimitKeyHash(email),
        ipHash: info.ipHash,
      }, info.nowIso),
      "customer_login_fail",
    );
  });
}

export async function customerLoginRecordRateLimit(email, deviceInfo, options = {}) {
  const info = defaultDeviceInfo(deviceInfo);
  return usingClient(options, async (client) => {
    await safeInsertAudit(
      client,
      auditEvent(null, "PORTAL_LOGIN_RATE_LIMITED", null, {
        emailHash: rateLimitKeyHash(email),
        ipHash: info.ipHash,
      }, info.nowIso),
      "customer_login_rate_limit",
    );
  });
}

export async function operatorLoginRecordFail(email, deviceInfo, userId = null, options = {}) {
  const info = defaultDeviceInfo(deviceInfo);
  return usingClient(options, async (client) => {
    await safeInsertAudit(
      client,
      auditEvent(null, "LOGIN_FAILED", userId, {
        emailHash: rateLimitKeyHash(email),
        ipHash: info.ipHash,
      }, info.nowIso),
      "operator_login_fail",
    );
  });
}

export async function operatorLoginRecordRateLimit(email, deviceInfo, userId = null, options = {}) {
  const info = defaultDeviceInfo(deviceInfo);
  return usingClient(options, async (client) => {
    await safeInsertAudit(
      client,
      auditEvent(null, "LOGIN_RATE_LIMITED", userId, {
        emailHash: rateLimitKeyHash(email),
        ipHash: info.ipHash,
      }, info.nowIso),
      "operator_login_rate_limit",
    );
  });
}

export async function customerSessionInsert(userId, clientId, tokenHash, deviceId, options = {}) {
  const now = Number(options.nowMs || Date.now());
  const createdAt = String(options.nowIso || dateFromMs(now));
  const maxAgeSeconds = Number(options.sessionMaxAgeSeconds || 14 * 24 * 60 * 60);
  const version = Number(options.sessionVersion || 1);
  const expiresAtMs = now + maxAgeSeconds * 1000;
  const id = options.sessionId || crypto.randomUUID();
  const legacy = {
    id,
    userId,
    clientId,
    tokenHash,
    deviceId,
    version,
    createdAt,
    lastSeenAt: createdAt,
    lastSeenAtMs: now,
    expiresAt: expiresAtMs,
  };
  return usingTransaction(options, async (client) => {
    await client.query("set local search_path = ariad, public");
    await client.query(
      "delete from customer_sessions where expires_at <= $1 or version <> $2",
      [createdAt, version],
    );
    const result = await client.query(
      `
        insert into customer_sessions
          (id, user_id, client_id, token_hash, device_id, version, last_seen_at, expires_at, created_at, legacy_json)
        values
          ($1, $2, $3, $4, $5, $6, $7, $8, $7, $9::jsonb)
        returning *
      `,
      [id, userId, clientId, tokenHash, deviceId || null, version, createdAt, dateFromMs(expiresAtMs), JSON.stringify(legacy)],
    );
    return sessionFromRow(result.rows[0], "customer");
  });
}

export async function operatorSessionInsert(userId, tokenHash, deviceId, options = {}) {
  const now = Number(options.nowMs || Date.now());
  const createdAt = String(options.nowIso || dateFromMs(now));
  const maxAgeSeconds = Number(options.sessionMaxAgeSeconds || 8 * 60 * 60);
  const version = Number(options.sessionVersion || 1);
  const expiresAtMs = now + maxAgeSeconds * 1000;
  const id = options.sessionId || crypto.randomUUID();
  const legacy = {
    id,
    userId,
    tokenHash,
    deviceId,
    version,
    createdAt,
    lastSeenAt: createdAt,
    lastSeenAtMs: now,
    expiresAt: expiresAtMs,
  };
  return usingTransaction(options, async (client) => {
    await client.query("set local search_path = ariad, public");
    await client.query(
      "delete from operator_sessions where expires_at <= $1 or version <> $2",
      [createdAt, version],
    );
    const result = await client.query(
      `
        insert into operator_sessions
          (id, user_id, token_hash, device_id, version, last_seen_at, expires_at, created_at, legacy_json)
        values
          ($1, $2, $3, $4, $5, $6, $7, $6, $8::jsonb)
        returning *
      `,
      [id, userId, tokenHash, deviceId || null, version, createdAt, dateFromMs(expiresAtMs), JSON.stringify(legacy)],
    );
    return sessionFromRow(result.rows[0], "operator");
  });
}

export async function customerSessionLookup(tokenHash, deviceTokenHash = "", options = {}) {
  const now = Number(options.nowMs || Date.now());
  const nowText = String(options.nowIso || dateFromMs(now));
  const version = Number(options.sessionVersion || 1);
  const touchMs = Number(options.presenceWriteIntervalMs || defaultSessionTouchMs);
  return usingClient(options, async (client) => {
    await client.query("set local search_path = ariad, public");
    const result = await client.query(
      `
        select
          s.*,
          u.id as user_id_row,
          u.client_id as user_client_id,
          u.name as user_name,
          u.email as user_email,
          u.password_hash as user_password_hash,
          u.role as user_role,
          u.active as user_active,
          u.email_verified_at as user_email_verified_at,
          u.created_at as user_created_at,
          u.updated_at as user_updated_at,
          u.legacy_json as user_legacy_json,
          c.id as client_id_row,
          c.master_client_id,
          c.name as client_name,
          c.whatsapp,
          c.country,
          c.whatsapp_country_iso,
          c.whatsapp_detected_country,
          c.status as client_status,
          c.primary_email,
          c.email_verified_at as client_email_verified_at,
          c.created_at as client_created_at,
          c.updated_at as client_updated_at,
          c.legacy_json as client_legacy_json,
          d.id as device_id_row,
          d.token_hash as device_token_hash,
          d.user_agent as device_user_agent,
          d.first_ip_hash as device_first_ip_hash,
          d.last_seen_at as device_last_seen_at,
          d.created_at as device_created_at,
          d.legacy_json as device_legacy_json
        from customer_sessions s
        join customer_users u on u.id = s.user_id
        join customer_clients c on c.id = s.client_id
        left join customer_devices d on d.id = s.device_id
        where s.token_hash = $1
          and s.expires_at > $2
          and s.version = $3
        limit 1
      `,
      [tokenHash, nowText, version],
    );
    const row = result.rows[0];
    if (!row) return { user: null, client: null, session: null, device: null, deviceAuthorizedForBenefits: false };
    const user = customerUserFromRow({
      id: row.user_id_row,
      client_id: row.user_client_id,
      name: row.user_name,
      email: row.user_email,
      password_hash: row.user_password_hash,
      role: row.user_role,
      active: row.user_active,
      email_verified_at: row.user_email_verified_at,
      created_at: row.user_created_at,
      updated_at: row.user_updated_at,
      legacy_json: row.user_legacy_json,
    });
    const clientRow = {
      id: row.client_id_row,
      master_client_id: row.master_client_id,
      name: row.client_name,
      whatsapp: row.whatsapp,
      country: row.country,
      whatsapp_country_iso: row.whatsapp_country_iso,
      whatsapp_detected_country: row.whatsapp_detected_country,
      status: row.client_status,
      primary_email: row.primary_email,
      email_verified_at: row.client_email_verified_at,
      created_at: row.client_created_at,
      updated_at: row.client_updated_at,
      legacy_json: row.client_legacy_json,
    };
    const clientRecord = customerClientFromRow(clientRow);
    if (!user?.active || clientRecord?.status === "BLOQUEADO") {
      await client.query("delete from customer_sessions where token_hash = $1", [tokenHash]);
      return { user: null, client: null, session: null, device: null, deviceAuthorizedForBenefits: false };
    }
    const authRows = row.device_id_row
      ? await client.query("select client_id from customer_device_authorizations where device_id = $1 order by authorized_at asc", [row.device_id_row])
      : { rows: [] };
    const device = customerDeviceFromRow({
      id: row.device_id_row,
      token_hash: row.device_token_hash,
      user_agent: row.device_user_agent,
      first_ip_hash: row.device_first_ip_hash,
      last_seen_at: row.device_last_seen_at,
      created_at: row.device_created_at,
      legacy_json: row.device_legacy_json,
    }, authRows.rows.map((entry) => entry.client_id));
    const session = sessionFromRow(row, "customer");
    if (now - Number(session.lastSeenAtMs || 0) > touchMs) {
      await client.query(
        `
          update customer_sessions
          set last_seen_at = $2,
              legacy_json = legacy_json || jsonb_build_object('lastSeenAt', $2::text, 'lastSeenAtMs', $3::bigint)
          where id = $1
        `,
        [session.id, nowText, now],
      );
      if (device?.id) {
        await client.query(
          `
            update customer_devices
            set last_seen_at = $2,
                legacy_json = legacy_json || jsonb_build_object('lastSeenAt', $2::text, 'lastSeenAtMs', $3::bigint)
            where id = $1
          `,
          [device.id, nowText, now],
        );
      }
    }
    const deviceAuthorizedForBenefits = Boolean(device?.authorizedClientIds?.includes(clientRecord.id));
    return { user, client: clientRecord, session, device, deviceAuthorizedForBenefits };
  });
}

export async function operatorSessionLookup(tokenHash, deviceTokenHash = "", options = {}) {
  const now = Number(options.nowMs || Date.now());
  const nowText = String(options.nowIso || dateFromMs(now));
  const version = Number(options.sessionVersion || 1);
  const trustedDeviceVersion = Number(options.trustedDeviceVersion || 1);
  const touchMs = Number(options.presenceWriteIntervalMs || defaultSessionTouchMs);
  return usingClient(options, async (client) => {
    await client.query("set local search_path = ariad, public");
    const result = await client.query(
      `
        select
          s.*,
          u.id as user_id_row,
          u.name as user_name,
          u.email as user_email,
          u.password_hash as user_password_hash,
          u.role as user_role,
          u.work_channel,
          u.permissions,
          u.operator_pin_hash,
          u.technician_redirector_id,
          u.active as user_active,
          u.created_at as user_created_at,
          u.updated_at as user_updated_at,
          u.legacy_json as user_legacy_json,
          d.id as device_id_row,
          d.token_hash as device_token_hash,
          d.user_agent as device_user_agent,
          d.first_ip_hash as device_first_ip_hash,
          d.trust_version,
          d.trusted_at,
          d.last_seen_at as device_last_seen_at,
          d.created_at as device_created_at,
          d.legacy_json as device_legacy_json
        from operator_sessions s
        join operator_users u on u.id = s.user_id
        left join operator_devices d on d.id = s.device_id
        where s.token_hash = $1
          and s.expires_at > $2
          and s.version = $3
        limit 1
      `,
      [tokenHash, nowText, version],
    );
    const row = result.rows[0];
    if (!row) return null;
    const user = operatorUserFromRow({
      id: row.user_id_row,
      name: row.user_name,
      email: row.user_email,
      password_hash: row.user_password_hash,
      role: row.user_role,
      work_channel: row.work_channel,
      permissions: row.permissions,
      operator_pin_hash: row.operator_pin_hash,
      technician_redirector_id: row.technician_redirector_id,
      active: row.user_active,
      created_at: row.user_created_at,
      updated_at: row.user_updated_at,
      legacy_json: row.user_legacy_json,
    });
    if (!user?.active) return null;
    const adminRows = row.device_id_row
      ? await client.query("select user_id from operator_device_admin_users where device_id = $1 order by created_at asc", [row.device_id_row])
      : { rows: [] };
    const device = operatorDeviceFromRow({
      id: row.device_id_row,
      token_hash: row.device_token_hash,
      user_agent: row.device_user_agent,
      first_ip_hash: row.device_first_ip_hash,
      trust_version: row.trust_version,
      trusted_at: row.trusted_at,
      last_seen_at: row.device_last_seen_at,
      created_at: row.device_created_at,
      legacy_json: row.device_legacy_json,
    }, adminRows.rows.map((entry) => entry.user_id));
    const session = sessionFromRow(row, "operator");
    if (user.role === "ADMIN") {
      const trusted = Boolean(
        device
        && device.tokenHash === deviceTokenHash
        && session.deviceId === device.id
        && Number(device.trustVersion || 0) === trustedDeviceVersion
        && device.adminUserIds.includes(user.id)
      );
      if (!trusted) {
        await client.query("delete from operator_sessions where token_hash = $1", [tokenHash]);
        await safeInsertAudit(
          client,
          auditEvent(user.id, "ADMIN_SESSION_DEVICE_REJECTED", user.id, {
            sessionDeviceId: session.deviceId || "",
            currentDeviceId: device?.id || "",
          }, nowText),
          "operator_session_device_rejected",
        );
        return null;
      }
    }
    if (now - Number(session.lastSeenAtMs || 0) > touchMs) {
      await client.query(
        `
          update operator_sessions
          set last_seen_at = $2,
              legacy_json = legacy_json || jsonb_build_object('lastSeenAt', $2::text, 'lastSeenAtMs', $3::bigint)
          where id = $1
        `,
        [session.id, nowText, now],
      );
      if (device?.id) {
        await client.query(
          `
            update operator_devices
            set last_seen_at = $2,
                legacy_json = legacy_json || jsonb_build_object('lastSeenAt', $2::text, 'lastSeenAtMs', $3::bigint)
            where id = $1
          `,
          [device.id, nowText, now],
        );
      }
    }
    return user;
  });
}

export async function customerSessionDelete(tokenHash, options = {}) {
  return usingClient(options, async (client) => {
    await client.query("set local search_path = ariad, public");
    const result = await client.query("delete from customer_sessions where token_hash = $1", [tokenHash]);
    return { deleted: Number(result.rowCount || 0) };
  });
}

export async function operatorSessionDelete(tokenHash, options = {}) {
  return usingClient(options, async (client) => {
    await client.query("set local search_path = ariad, public");
    const result = await client.query("delete from operator_sessions where token_hash = $1", [tokenHash]);
    return { deleted: Number(result.rowCount || 0) };
  });
}

export async function customerLoginAttempt(email, password, deviceInfo, options = {}) {
  const info = defaultDeviceInfo(deviceInfo);
  const rateLimit = await customerRateLimitCheck(email, info, { ...options, ...(options.rateLimitOptions || {}) });
  if (!rateLimit.allowed) {
    await customerLoginRecordRateLimit(email, info, options);
    return { status: "rate_limited", httpStatus: 429, rateLimit };
  }
  const { user, client } = await findCustomerLogin(email, options);
  const device = await upsertCustomerDevice(info, options);
  const verifyPassword = options.verifyPassword;
  const passwordOk = user && typeof verifyPassword === "function"
    ? await verifyPassword(password, user.passwordHash)
    : false;
  if (!user || !passwordOk) {
    await customerLoginRecordFail(email, info, user?.clientId || null, options);
    return { status: "invalid_credentials", httpStatus: 401, rateLimit, device };
  }
  if (!client || client.status === "BLOQUEADO" || user.active === false) {
    return { status: "blocked", httpStatus: 403, user, client, device, rateLimit };
  }
  const session = await customerSessionInsert(
    user.id,
    client.id,
    options.sessionTokenHash,
    device?.id || null,
    {
      ...options,
      sessionVersion: options.sessionVersion,
      sessionMaxAgeSeconds: options.sessionMaxAgeSeconds,
      nowMs: info.nowMs,
      nowIso: info.nowIso,
    },
  );
  await usingClient(options, async (clientForAudit) => {
    await safeInsertAudit(
      clientForAudit,
      auditEvent(null, "PORTAL_LOGIN_SUCCESS", client.id, {
        email: user.email,
        deviceId: device?.id || "",
        authorizedForBenefits: Boolean(device?.authorizedClientIds?.includes(client.id)),
      }, info.nowIso),
      "customer_login_success",
    );
  });
  return { status: "ok", httpStatus: 200, user, client, device, session, rateLimit };
}

async function operatorDeviceHasAdminTrust(deviceId, userId, options = {}) {
  return usingClient(options, async (client) => {
    await client.query("set local search_path = ariad, public");
    const result = await client.query(
      "select 1 from operator_device_admin_users where device_id = $1 and user_id = $2 limit 1",
      [deviceId, userId],
    );
    return Boolean(result.rows[0]);
  });
}

async function operatorHasTrustedDevice(userId, options = {}) {
  return usingClient(options, async (client) => {
    await client.query("set local search_path = ariad, public");
    const result = await client.query(
      "select 1 from operator_device_admin_users where user_id = $1 limit 1",
      [userId],
    );
    return Boolean(result.rows[0]);
  });
}

async function trustOperatorDevice(device, userId, options = {}) {
  const trustedAt = String(options.nowIso || nowIso());
  const trustedDeviceVersion = Number(options.trustedDeviceVersion || 1);
  return usingTransaction(options, async (client) => {
    await client.query("set local search_path = ariad, public");
    await client.query(
      `
        update operator_devices
        set trust_version = $2,
            trusted_at = $3,
            legacy_json = legacy_json || jsonb_build_object(
              'trustVersion', $2::int,
              'trustedAt', $3::text
            )
        where id = $1
      `,
      [device.id, trustedDeviceVersion, trustedAt],
    );
    await client.query(
      `
        insert into operator_device_admin_users (device_id, user_id, created_at)
        values ($1, $2, $3)
        on conflict (device_id, user_id) do nothing
      `,
      [device.id, userId, trustedAt],
    );
    await safeInsertAudit(
      client,
      auditEvent(userId, "ADMIN_DEVICE_AUTHORIZED", userId, { deviceId: device.id, firstTrustedDevice: true }, trustedAt),
      "admin_device_authorized",
    );
  });
}

async function requestOperatorDeviceApproval(user, device, deviceInfo, options = {}) {
  const info = defaultDeviceInfo(deviceInfo);
  const id = options.approvalId || crypto.randomUUID();
  const expiresAtMs = info.nowMs + Number(options.deviceApprovalExpiresMs || 15 * 60 * 1000);
  const legacy = {
    id,
    adminUserId: user.id,
    deviceId: device.id,
    userAgent: info.userAgent,
    ipHash: info.ipHash,
    createdAt: info.nowIso,
    expiresAt: expiresAtMs,
    approvedAt: "",
  };
  return usingTransaction(options, async (client) => {
    await client.query("set local search_path = ariad, public");
    await client.query(
      `
        insert into operator_device_approvals
          (id, admin_user_id, device_id, user_agent, ip_hash, created_at, expires_at, approved_at, legacy_json)
        values
          ($1, $2, $3, $4, $5, $6, $7, null, $8::jsonb)
        on conflict (id) do nothing
      `,
      [id, user.id, device.id, info.userAgent, info.ipHash, info.nowIso, dateFromMs(expiresAtMs), JSON.stringify(legacy)],
    );
    await safeInsertAudit(
      client,
      auditEvent(user.id, "ADMIN_DEVICE_APPROVAL_REQUESTED", user.id, { deviceId: device.id }, info.nowIso),
      "admin_device_approval_requested",
    );
  });
}

export async function operatorLoginAttempt(email, password, deviceInfo, options = {}) {
  const info = defaultDeviceInfo(deviceInfo);
  const rateLimit = await operatorRateLimitCheck(email, info, { ...options, ...(options.rateLimitOptions || {}) });
  const user = await findOperatorLogin(email, options);
  if (!rateLimit.allowed) {
    await operatorLoginRecordRateLimit(email, info, user?.id || null, options);
    return { status: "rate_limited", httpStatus: 429, user, rateLimit };
  }
  const device = await upsertOperatorDevice(info, options);
  const verifyPassword = options.verifyPassword;
  const passwordOk = user && typeof verifyPassword === "function"
    ? await verifyPassword(password, user.passwordHash)
    : false;
  if (!user || !passwordOk) {
    await operatorLoginRecordFail(email, info, user?.id || null, options);
    return { status: "invalid_credentials", httpStatus: 401, user, device, rateLimit };
  }
  if (!user.active) return { status: "inactive", httpStatus: 403, user, device, rateLimit };
  if (user.role === "ADMIN") {
    const trusted = await operatorDeviceHasAdminTrust(device.id, user.id, options);
    if (!trusted) {
      const trustedDeviceExists = await operatorHasTrustedDevice(user.id, options);
      const setupTokenIsValid = Boolean(options.setupToken && String(options.operatorPin || "") === String(options.setupToken));
      const pinIsValid = user.operatorPinHash && typeof verifyPassword === "function"
        ? await verifyPassword(String(options.operatorPin || ""), user.operatorPinHash)
        : false;
      if (!trustedDeviceExists) {
        if (!setupTokenIsValid) {
          await operatorLoginRecordFail(email, info, user.id, options);
          return {
            status: "admin_setup_pin_required",
            httpStatus: 409,
            user,
            device,
            deviceTokenRequired: true,
            pinLabel: "Codigo de instalacion",
            rateLimit,
          };
        }
        await trustOperatorDevice(device, user.id, {
          ...options,
          trustedDeviceVersion: options.trustedDeviceVersion,
          nowIso: info.nowIso,
        });
      } else {
        if (!pinIsValid) {
          await operatorLoginRecordFail(email, info, user.id, options);
          return {
            status: "admin_setup_pin_required",
            httpStatus: 409,
            user,
            device,
            deviceTokenRequired: true,
            pinLabel: "PIN operativo",
            rateLimit,
          };
        }
        await requestOperatorDeviceApproval(user, device, info, options);
        return {
          status: "admin_approval_required",
          httpStatus: 409,
          user,
          device,
          deviceTokenRequired: true,
          rateLimit,
        };
      }
    }
  }
  const session = await operatorSessionInsert(
    user.id,
    options.sessionTokenHash,
    device?.id || null,
    {
      ...options,
      sessionVersion: options.sessionVersion,
      sessionMaxAgeSeconds: options.sessionMaxAgeSeconds,
      nowMs: info.nowMs,
      nowIso: info.nowIso,
    },
  );
  await usingClient(options, async (clientForAudit) => {
    await safeInsertAudit(
      clientForAudit,
      auditEvent(user.id, "LOGIN_SUCCESS", user.id, {}, info.nowIso),
      "operator_login_success",
    );
  });
  return { status: "ok", httpStatus: 200, user, device, session, rateLimit };
}

async function readPricingConfig(client) {
  const [exchangeRates, serviceRules, overrides, policyRows, providerRows] = await Promise.all([
    client.query("select * from exchange_rates order by rate_key asc"),
    client.query("select * from service_pricing_rules order by service_code asc"),
    client.query("select * from payment_method_overrides order by code asc"),
    client.query("select * from frp_pricing_policy order by id asc limit 1"),
    client.query("select * from frp_pricing_providers order by priority asc, id asc"),
  ]);
  const policyRow = policyRows.rows[0] || {};
  return {
    exchangeRates: exchangeRates.rows.map((row) => ({
      ...legacyObject(row),
      key: row.rate_key || legacyObject(row).key || "",
      country: row.country || legacyObject(row).country || "",
      currency: row.currency || legacyObject(row).currency || "",
      ratePerUsdt: toNumber(row.rate_per_usdt, legacyObject(row).ratePerUsdt || 0),
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : legacyObject(row).updatedAt || "",
      updatedBy: row.updated_by || legacyObject(row).updatedBy || "",
    })),
    serviceRules: serviceRules.rows.map((row) => ({
      ...legacyObject(row),
      serviceCode: row.service_code || legacyObject(row).serviceCode || "",
      pricingMode: row.pricing_mode || legacyObject(row).pricingMode || "",
      baseCostUsdt: toNumber(row.base_cost_usdt, legacyObject(row).baseCostUsdt || 0),
      marginUsdt: toNumber(row.margin_usdt, legacyObject(row).marginUsdt || 0),
      authCostUsdt: toNumber(row.auth_cost_usdt, legacyObject(row).authCostUsdt || 0),
      criticalCostUsdt: toNumber(row.critical_cost_usdt, legacyObject(row).criticalCostUsdt || 0),
      toolCostUsdt: toNumber(row.tool_cost_usdt, legacyObject(row).toolCostUsdt || 0),
      serverCostUsdt: toNumber(row.server_cost_usdt, legacyObject(row).serverCostUsdt || 0),
      manualAdjustmentAllowed: toBool(row.manual_adjustment_allowed, legacyObject(row).manualAdjustmentAllowed !== false),
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : legacyObject(row).updatedAt || "",
      updatedBy: row.updated_by || legacyObject(row).updatedBy || "",
    })),
    paymentMethodOverrides: overrides.rows.map((row) => ({
      ...legacyObject(row),
      code: row.code || legacyObject(row).code || "",
      active: row.active === undefined ? legacyObject(row).active !== false : toBool(row.active, true),
      customMessage: row.custom_message || legacyObject(row).customMessage || "",
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : legacyObject(row).updatedAt || "",
      updatedBy: row.updated_by || legacyObject(row).updatedBy || "",
    })),
    frpPricing: {
      policy: {
        ...legacyObject(policyRow),
        minMarginUsdt: toNumber(policyRow.min_margin_usdt, legacyObject(policyRow).minMarginUsdt || 0),
        targetMarginUsdt: toNumber(policyRow.target_margin_usdt, legacyObject(policyRow).targetMarginUsdt || 1),
        minSellPriceUsdt: toNumber(policyRow.min_sell_price_usdt, legacyObject(policyRow).minSellPriceUsdt || 0),
        maxWorkerCostChangePct: toNumber(policyRow.max_worker_cost_change_pct, legacyObject(policyRow).maxWorkerCostChangePct || 30),
        updatedAt: policyRow.updated_at ? new Date(policyRow.updated_at).toISOString() : legacyObject(policyRow).updatedAt || "",
        updatedBy: policyRow.updated_by || legacyObject(policyRow).updatedBy || "",
      },
      providers: providerRows.rows.map((row) => ({
        ...legacyObject(row),
        id: row.id || legacyObject(row).id || "",
        name: row.name || legacyObject(row).name || "",
        status: row.status || legacyObject(row).status || "",
        costMode: row.cost_mode || legacyObject(row).costMode || "",
        fixedCostUsdt: toNumber(row.fixed_cost_usdt, legacyObject(row).fixedCostUsdt || 0),
        creditsPerProcess: toNumber(row.credits_per_process, legacyObject(row).creditsPerProcess || 0),
        creditUnitCostUsdt: toNumber(row.credit_unit_cost_usdt, legacyObject(row).creditUnitCostUsdt || 0),
        priority: toNumber(row.priority, legacyObject(row).priority || 99),
        reason: row.reason || legacyObject(row).reason || "",
        updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : legacyObject(row).updatedAt || "",
        updatedBy: row.updated_by || legacyObject(row).updatedBy || "",
      })),
    },
  };
}

async function readCustomerBootstrapDb(client, user, customerClient, device) {
  const clientId = customerClient?.id || "";
  const masterClientId = customerClient?.masterClientId || "";
  if (!clientId) {
    const pricingConfig = await readPricingConfig(client);
    return {
      users: [],
      sessions: [],
      devices: [],
      deviceApprovals: [],
      customerClients: [],
      customerUsers: [],
      customerSessions: [],
      customerDevices: device ? [device] : [],
      customerRequests: [],
      customerOrders: [],
      customerOrderItems: [],
      customerBenefits: [],
      customerEmailVerificationTokens: [],
      masterClients: [],
      clientLinks: [],
      clientLinkSuggestions: [],
      paymentLedgerEntries: [],
      dailyCloses: [],
      dailyCloseLines: [],
      dailyAdjustments: [],
      portalRateLimits: [],
      clients: [],
      tickets: [],
      frpOrders: [],
      frpJobs: [],
      frpProviderCostHistory: [],
      frpPendingCostChanges: [],
      passwordResetTokens: [],
      passwordResetRequests: [],
      audit: [],
      pricingConfig,
    };
  }
  const orderResult = await client.query(
    `
      select *
      from customer_orders
      where client_id = $1
      order by created_at desc, id desc
      limit 60
    `,
    [clientId],
  );
  const orders = orderResult.rows.map(orderFromRow);
  const orderIds = orders.map((order) => order.id).filter(Boolean);
  const frpOrderIds = orders.map((order) => order.frpOrderId).filter(Boolean);
  const itemsResult = orderIds.length
    ? await client.query("select * from customer_order_items where order_id = any($1::uuid[]) order by created_at asc, id asc", [orderIds])
    : { rows: [] };
  const items = itemsResult.rows.map(genericLegacyRow);
  const itemFrpOrderIds = items.map((item) => item.frpOrderId).filter(Boolean);
  const itemFrpJobIds = items.map((item) => item.frpJobId).filter(Boolean);
  const allFrpOrderIds = [...new Set(frpOrderIds.concat(itemFrpOrderIds))];
  const frpOrdersResult = allFrpOrderIds.length
    ? await client.query("select * from frp_orders where id = any($1::uuid[]) or portal_order_id = any($2::uuid[]) order by created_at desc, id desc", [allFrpOrderIds, orderIds])
    : { rows: [] };
  const allFrpJobOrderIds = frpOrdersResult.rows.map((row) => row.id).filter(Boolean);
  const frpJobsResult = allFrpJobOrderIds.length || itemFrpJobIds.length
    ? await client.query(
      "select * from frp_jobs where order_id = any($1::uuid[]) or id = any($2::uuid[]) order by created_at asc, id asc",
      [allFrpJobOrderIds, itemFrpJobIds],
    )
    : { rows: [] };
  const benefitsResult = await client.query(
    `
      select * from customer_benefits
      where client_id = $1 or ($2::uuid is not null and master_client_id = $2::uuid)
      order by created_at desc, id desc
    `,
    [clientId, masterClientId || null],
  );
  const linksResult = await client.query(
    `
      select * from client_links
      where source_id = $1 or ($2::uuid is not null and master_client_id = $2::uuid)
      order by created_at asc, id asc
    `,
    [clientId, masterClientId || null],
  );
  const mastersResult = masterClientId
    ? await client.query("select * from master_clients where id = $1", [masterClientId])
    : { rows: [] };
  const pricingConfig = await readPricingConfig(client);
  return {
    users: [],
    sessions: [],
    devices: [],
    deviceApprovals: [],
    customerClients: [customerClient],
    customerUsers: [user],
    customerSessions: [],
    customerDevices: device ? [device] : [],
    customerRequests: [],
    customerOrders: orders,
    customerOrderItems: items,
    customerBenefits: benefitsResult.rows.map(genericLegacyRow),
    customerEmailVerificationTokens: [],
    masterClients: mastersResult.rows.map(genericLegacyRow),
    clientLinks: linksResult.rows.map(genericLegacyRow),
    clientLinkSuggestions: [],
    paymentLedgerEntries: [],
    dailyCloses: [],
    dailyCloseLines: [],
    dailyAdjustments: [],
    portalRateLimits: [],
    clients: [],
    tickets: [],
    frpOrders: frpOrdersResult.rows.map(genericLegacyRow),
    frpJobs: frpJobsResult.rows.map(genericLegacyRow),
    frpProviderCostHistory: [],
    frpPendingCostChanges: [],
    passwordResetTokens: [],
    passwordResetRequests: [],
    audit: [],
    pricingConfig,
  };
}

export async function customerSessionBootstrap(user, client, device, options = {}) {
  return usingClient(options, async (pgClient) => {
    await pgClient.query("set local search_path = ariad, public");
    const db = await readCustomerBootstrapDb(pgClient, user, client, device);
    const publicCustomerState = options.publicCustomerState;
    const publicPortalCatalog = options.publicPortalCatalog;
    if (typeof publicCustomerState === "function" && typeof publicPortalCatalog === "function") {
      const customer = publicCustomerState(db, { db, user, client, device });
      const catalog = publicPortalCatalog(db);
      return {
        customer,
        catalog,
        orders: customer?.orders || [],
        paymentMethods: catalog?.paymentMethods || [],
        deviceAuthorizedForBenefits: Boolean(customer?.device?.authorizedForBenefits),
        db,
      };
    }
    return {
      customer: { user, client, device, orders: db.customerOrders },
      catalog: { paymentMethods: db.pricingConfig.paymentMethodOverrides || [] },
      orders: db.customerOrders,
      paymentMethods: db.pricingConfig.paymentMethodOverrides || [],
      deviceAuthorizedForBenefits: Boolean(device?.authorizedClientIds?.includes(client?.id)),
      db,
    };
  });
}

export async function preserveCurrentAuthRowsBeforeLegacyReplace(client, plan, options = {}) {
  await client.query("set local search_path = ariad, public");
  const [
    operatorDevices,
    operatorAdmins,
    operatorSessions,
    customerDevices,
    customerAuthorizations,
    customerSessions,
  ] = await Promise.all([
    client.query("select * from operator_devices order by created_at asc, id asc"),
    client.query("select * from operator_device_admin_users order by created_at asc, user_id asc"),
    client.query("select * from operator_sessions order by created_at asc, id asc"),
    client.query("select * from customer_devices order by created_at asc, id asc"),
    client.query("select * from customer_device_authorizations order by authorized_at asc, client_id asc"),
    client.query("select * from customer_sessions order by created_at asc, id asc"),
  ]);

  const mergeById = (table, rows) => {
    plan.rows[table] ||= [];
    const existing = new Map(plan.rows[table].map((row) => [String(row.id || ""), row]));
    for (const row of rows) {
      const key = String(row.id || "");
      if (!key) continue;
      if (!existing.has(key)) {
        plan.rows[table].push(row);
        existing.set(key, row);
        continue;
      }
      const planned = existing.get(key);
      const plannedMs = timestampMs(planned?.last_seen_at || planned?.updated_at || planned?.created_at);
      const currentMs = timestampMs(row?.last_seen_at || row?.updated_at || row?.created_at);
      if (currentMs > plannedMs) Object.assign(planned, row);
    }
  };

  const mergeByComposite = (table, rows, keyFn) => {
    plan.rows[table] ||= [];
    const existing = new Set(plan.rows[table].map(keyFn));
    for (const row of rows) {
      const key = keyFn(row);
      if (!key || existing.has(key)) continue;
      plan.rows[table].push(row);
      existing.add(key);
    }
  };

  mergeById("operator_devices", operatorDevices.rows);
  mergeByComposite("operator_device_admin_users", operatorAdmins.rows, (row) => `${row.device_id || ""}:${row.user_id || ""}`);
  mergeById("operator_sessions", operatorSessions.rows);
  mergeById("customer_devices", customerDevices.rows);
  mergeByComposite("customer_device_authorizations", customerAuthorizations.rows, (row) => `${row.device_id || ""}:${row.client_id || ""}`);
  mergeById("customer_sessions", customerSessions.rows);

  if (plan.tables) {
    for (const table of [
      "operator_devices",
      "operator_device_admin_users",
      "operator_sessions",
      "customer_devices",
      "customer_device_authorizations",
      "customer_sessions",
    ]) {
      plan.tables[table] = plan.rows[table]?.length || 0;
    }
  }

  if (options.mark) plan.authRowsPreserved = true;
  return plan;
}
