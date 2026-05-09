const guestTokenMaxAgeDays = 90;
const guestTokenCleanupGraceDays = 7;

function requireDbArray(db, key) {
  if (!db || typeof db !== "object") throw new Error("db_required");
  if (!Array.isArray(db[key])) db[key] = [];
  return db[key];
}

function defaultNowIso() {
  return new Date().toISOString();
}

function addDays(iso, days) {
  const base = Date.parse(iso);
  const timestamp = Number.isFinite(base) ? base : Date.now();
  return new Date(timestamp + days * 24 * 60 * 60 * 1000).toISOString();
}

function stablePhoneKey(value, options = {}) {
  if (typeof options.phoneKey === "function") return options.phoneKey(value);
  return String(value || "").replace(/\D/g, "");
}

function clean(value, max = 160, options = {}) {
  if (typeof options.cleanText === "function") return options.cleanText(value, max);
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function randomToken(options = {}) {
  const crypto = options.crypto;
  if (!crypto?.randomBytes) throw new Error("crypto_random_required");
  return crypto.randomBytes(32).toString("base64url");
}

function randomId(options = {}) {
  const crypto = options.crypto;
  if (!crypto?.randomUUID) throw new Error("crypto_uuid_required");
  return crypto.randomUUID();
}

function tokenHash(token, options = {}) {
  if (typeof options.hashToken !== "function") throw new Error("hash_token_required");
  return options.hashToken(token);
}

function normalizeGuestWhatsapp(whatsapp, country = "", options = {}) {
  if (typeof options.normalizePortalWhatsapp !== "function") {
    throw new Error("normalize_portal_whatsapp_required");
  }
  const validation = options.normalizePortalWhatsapp(whatsapp, country);
  if (!validation?.ok) {
    const error = new Error(validation?.error || "WhatsApp invalido.");
    error.status = 400;
    throw error;
  }
  return validation;
}

function findOrCreateGuestClient(db, whatsapp, country = "", options = {}) {
  const validation = normalizeGuestWhatsapp(whatsapp, country, options);
  const clients = requireDbArray(db, "customerClients");
  const phone = stablePhoneKey(validation.whatsapp, options);
  let client = clients.find((candidate) => {
    return candidate.accountType === "guest" && stablePhoneKey(candidate.whatsapp, options) === phone;
  });
  const timestamp = (options.nowIso || defaultNowIso)();
  if (client) {
    let changed = false;
    if (client.whatsapp !== validation.whatsapp) {
      client.whatsapp = validation.whatsapp;
      changed = true;
    }
    if (!client.country && validation.country) {
      client.country = validation.country;
      changed = true;
    }
    if (!client.whatsappCountryIso && validation.countryIso) {
      client.whatsappCountryIso = validation.countryIso;
      changed = true;
    }
    if (!client.whatsappDetectedCountry && validation.detectedCountry) {
      client.whatsappDetectedCountry = validation.detectedCountry;
      changed = true;
    }
    if (changed) client.updatedAt = timestamp;
    return { client, created: false, validation };
  }
  client = {
    id: randomId(options),
    masterClientId: "",
    name: "Cliente invitado",
    whatsapp: validation.whatsapp,
    country: validation.country || clean(country, 40, options),
    whatsappCountryIso: validation.countryIso || "",
    whatsappDetectedCountry: validation.detectedCountry || "",
    status: "REGISTRADO_NO_VERIFICADO",
    primaryEmail: "",
    emailVerifiedAt: "",
    accountType: "guest",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  clients.unshift(client);
  return { client, created: true, validation };
}

function createGuestSessionToken(db, orderId, options = {}) {
  const orders = requireDbArray(db, "customerOrders");
  const tokens = requireDbArray(db, "guestSessionTokens");
  const order = orders.find((candidate) => candidate.id === orderId);
  if (!order) {
    const error = new Error("guest_order_not_found");
    error.status = 404;
    throw error;
  }
  const rawToken = randomToken(options);
  const timestamp = (options.nowIso || defaultNowIso)();
  const record = {
    id: randomId(options),
    orderId: order.id,
    clientId: order.clientId,
    tokenHash: tokenHash(rawToken, options),
    tokenHint: rawToken.slice(-6),
    scope: "order",
    expiresAt: addDays(timestamp, options.maxAgeDays || guestTokenMaxAgeDays),
    revokedAt: "",
    lastSeenAt: "",
    createdAt: timestamp,
  };
  tokens.push(record);
  return { token: rawToken, tokenRecord: record, order };
}

function cleanupExpiredGuestTokens(db, options = {}) {
  const tokens = requireDbArray(db, "guestSessionTokens");
  const now = Date.parse((options.nowIso || defaultNowIso)());
  const cutoff = now - guestTokenCleanupGraceDays * 24 * 60 * 60 * 1000;
  let removed = 0;
  db.guestSessionTokens = tokens.filter((record) => {
    if (removed >= 100) return true;
    const expired = Date.parse(record.expiresAt || "") < cutoff;
    if (expired) {
      removed += 1;
      return false;
    }
    return true;
  });
  return removed;
}

function validateGuestSessionToken(db, token, options = {}) {
  const tokens = requireDbArray(db, "guestSessionTokens");
  const hash = tokenHash(token, options);
  const timestamp = (options.nowIso || defaultNowIso)();
  const now = Date.parse(timestamp);
  const record = tokens.find((candidate) => {
    if (candidate.tokenHash !== hash) return false;
    if (candidate.revokedAt) return false;
    if (Date.parse(candidate.expiresAt || "") <= now) return false;
    if (options.orderId && candidate.orderId !== options.orderId) return false;
    return true;
  });
  const result = record
    ? {
        tokenRecord: record,
        order: requireDbArray(db, "customerOrders").find((order) => order.id === record.orderId) || null,
        client: requireDbArray(db, "customerClients").find((client) => client.id === record.clientId) || null,
      }
    : null;
  if (record) record.lastSeenAt = timestamp;
  try {
    cleanupExpiredGuestTokens(db, options);
  } catch (error) {
    if (typeof options.onCleanupError === "function") options.onCleanupError(error);
  }
  return result;
}

function generateGuestRecoveryLink(orderId, options = {}) {
  const db = options.db;
  const orders = db ? requireDbArray(db, "customerOrders") : [];
  const order = orders.find((candidate) => candidate.id === orderId) || options.order || null;
  const publicCode = clean(order?.shortCode || order?.publicCode || order?.code || orderId, 80, options);
  const token = String(options.token || "");
  if (!publicCode || !token) throw new Error("guest_recovery_link_requires_code_and_token");
  const baseUrl = String(options.publicBaseUrl || "").replace(/\/+$/, "");
  const path = `/pedido/${encodeURIComponent(publicCode)}?t=${encodeURIComponent(token)}`;
  return baseUrl ? `${baseUrl}${path}` : path;
}

function findGuestOrdersForClaimByWhatsapp(db, whatsapp, options = {}) {
  const phone = stablePhoneKey(whatsapp, options);
  if (!phone) return [];
  const clients = requireDbArray(db, "customerClients")
    .filter((client) => client.accountType === "guest" && stablePhoneKey(client.whatsapp, options) === phone);
  const clientIds = new Set(clients.map((client) => client.id));
  return requireDbArray(db, "customerOrders")
    .filter((order) => clientIds.has(order.clientId))
    .filter((order) => !["CANCELADO", "FINALIZADO_ELIMINADO"].includes(order.publicStatus || order.status || ""))
    .map((order) => ({
      id: order.id,
      code: order.shortCode || order.publicCode || order.code,
      clientId: order.clientId,
      status: order.publicStatus || order.status || "",
      createdAt: order.createdAt || "",
    }));
}

function claimGuestOrders(db, targetClientId, sourceGuestClientIds, options = {}) {
  const target = requireDbArray(db, "customerClients").find((client) => client.id === targetClientId);
  if (!target || target.accountType === "guest") {
    const error = new Error("target_registered_client_required");
    error.status = 400;
    throw error;
  }
  const sourceIds = new Set((sourceGuestClientIds || []).filter(Boolean));
  const timestamp = (options.nowIso || defaultNowIso)();
  let ordersClaimed = 0;
  for (const order of requireDbArray(db, "customerOrders")) {
    if (!sourceIds.has(order.clientId)) continue;
    order.clientId = target.id;
    order.masterClientId = target.masterClientId || order.masterClientId || "";
    order.updatedAt = timestamp;
    ordersClaimed += 1;
  }
  for (const item of requireDbArray(db, "customerOrderItems")) {
    if (!sourceIds.has(item.clientId)) continue;
    item.clientId = target.id;
    item.masterClientId = target.masterClientId || item.masterClientId || "";
    item.updatedAt = timestamp;
  }
  for (const request of requireDbArray(db, "customerRequests")) {
    if (!sourceIds.has(request.clientId)) continue;
    request.clientId = target.id;
    request.masterClientId = target.masterClientId || request.masterClientId || "";
    request.updatedAt = timestamp;
  }
  for (const tokenRecord of requireDbArray(db, "guestSessionTokens")) {
    if (!sourceIds.has(tokenRecord.clientId)) continue;
    tokenRecord.clientId = target.id;
    tokenRecord.revokedAt ||= timestamp;
  }
  return { ordersClaimed, sourceGuestClientIds: [...sourceIds], targetClientId: target.id };
}

export {
  cleanupExpiredGuestTokens,
  createGuestSessionToken,
  findGuestOrdersForClaimByWhatsapp,
  findOrCreateGuestClient,
  generateGuestRecoveryLink,
  validateGuestSessionToken,
  claimGuestOrders,
};
