import { withPostgresClient } from "./postgres.js";

export const POSTGRES_TARGET_TABLES = [
  "migration_runs",
  "sequence_counters",
  "operator_users",
  "operator_devices",
  "operator_device_admin_users",
  "operator_device_approvals",
  "operator_sessions",
  "password_reset_tokens",
  "password_reset_requests",
  "master_clients",
  "customer_clients",
  "customer_users",
  "internal_clients",
  "client_links",
  "client_link_suggestions",
  "customer_benefits",
  "customer_devices",
  "customer_device_authorizations",
  "customer_sessions",
  "customer_email_verification_tokens",
  "exchange_rates",
  "service_pricing_rules",
  "payment_method_overrides",
  "frp_pricing_policy",
  "frp_pricing_providers",
  "frp_provider_cost_history",
  "frp_pending_cost_changes",
  "customer_requests",
  "customer_orders",
  "customer_order_items",
  "service_tickets",
  "stored_files",
  "payment_proofs",
  "frp_orders",
  "frp_jobs",
  "frp_job_files",
  "active_technician_state",
  "payment_ledger_entries",
  "daily_closes",
  "daily_close_lines",
  "daily_adjustments",
  "portal_rate_limits",
  "audit_events",
];

const legacyCollectionMap = [
  ["masterClients", "master_clients", "created_at asc, id asc"],
  ["customerClients", "customer_clients", "created_at asc, id asc"],
  ["clients", "internal_clients", "created_at asc, id asc"],
  ["clientLinks", "client_links", "created_at asc, id asc"],
  ["clientLinkSuggestions", "client_link_suggestions", "created_at asc, id asc"],
  ["customerBenefits", "customer_benefits", "created_at asc, id asc"],
  ["customerRequests", "customer_requests", "created_at asc, id asc"],
  ["customerOrders", "customer_orders", "created_at asc, id asc"],
  ["customerOrderItems", "customer_order_items", "created_at asc, id asc"],
  ["tickets", "service_tickets", "created_at asc, id asc"],
  ["frpOrders", "frp_orders", "created_at asc, id asc"],
  ["frpJobs", "frp_jobs", "created_at asc, id asc"],
  ["frpProviderCostHistory", "frp_provider_cost_history", "recorded_at asc, id asc"],
  ["frpPendingCostChanges", "frp_pending_cost_changes", "created_at asc, id asc"],
  ["paymentLedgerEntries", "payment_ledger_entries", "created_at asc, id asc"],
  ["dailyCloses", "daily_closes", "date_stamp asc"],
  ["dailyCloseLines", "daily_close_lines", "created_at asc, id asc"],
  ["dailyAdjustments", "daily_adjustments", "created_at asc, id asc"],
  ["portalRateLimits", "portal_rate_limits", "created_at asc, id asc"],
  ["audit", "audit_events", "created_at desc, id asc"],
];

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function legacyObject(row) {
  return isObject(row?.legacy_json) ? { ...row.legacy_json } : {};
}

function isoOrEmpty(value) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function numberValue(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function setIfPresent(target, key, value) {
  if (value === undefined || value === null) return target;
  target[key] = value;
  return target;
}

function groupValues(rows, keyName, valueName) {
  const grouped = new Map();
  for (const row of rows) {
    const key = String(row[keyName] || "");
    const value = String(row[valueName] || "");
    if (!key || !value) continue;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(value);
  }
  return grouped;
}

function groupObjects(rows, keyName) {
  const grouped = new Map();
  for (const row of rows) {
    const key = String(row[keyName] || "");
    if (!key) continue;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }
  return grouped;
}

async function readTable(client, table, orderBy = "id asc") {
  const result = await client.query(`select * from ${table} order by ${orderBy}`);
  return result.rows;
}

async function readLegacyCollection(client, table, orderBy = "id asc") {
  return (await readTable(client, table, orderBy)).map(legacyObject);
}

async function readOperatorDevices(client) {
  const rows = await readTable(client, "operator_devices", "created_at asc, id asc");
  const adminRows = await readTable(client, "operator_device_admin_users", "created_at asc, user_id asc");
  const adminIdsByDevice = groupValues(adminRows, "device_id", "user_id");
  return rows.map((row) => ({
    ...legacyObject(row),
    tokenHash: row.token_hash || "",
    adminUserIds: adminIdsByDevice.get(String(row.id)) || [],
  }));
}

async function readCustomerDevices(client) {
  const rows = await readTable(client, "customer_devices", "created_at asc, id asc");
  const authorizationRows = await readTable(client, "customer_device_authorizations", "authorized_at asc, client_id asc");
  const clientIdsByDevice = groupValues(authorizationRows, "device_id", "client_id");
  return rows.map((row) => ({
    ...legacyObject(row),
    tokenHash: row.token_hash || "",
    authorizedClientIds: clientIdsByDevice.get(String(row.id)) || [],
  }));
}

async function readPricingConfig(client) {
  const exchangeRates = await readLegacyCollection(client, "exchange_rates", "rate_key asc");
  const serviceRules = await readLegacyCollection(client, "service_pricing_rules", "service_code asc");
  const paymentMethodOverrides = await readLegacyCollection(client, "payment_method_overrides", "code asc");
  const providerRows = await readTable(client, "frp_pricing_providers", "priority asc, id asc");
  const providers = providerRows.map((row) => ({
    ...legacyObject(row),
    id: row.id || "",
    name: row.name || "",
    status: row.status || "",
    costMode: row.cost_mode || "",
    fixedCostUsdt: numberValue(row.fixed_cost_usdt),
    creditsPerProcess: numberValue(row.credits_per_process),
    creditUnitCostUsdt: numberValue(row.credit_unit_cost_usdt),
    priority: Number.parseInt(row.priority, 10) || 99,
    reason: row.reason || "",
    updatedAt: isoOrEmpty(row.updated_at),
    updatedBy: row.updated_by || legacyObject(row).updatedBy || "",
  }));
  const policyRows = await readTable(client, "frp_pricing_policy", "id asc");
  const policyRow = policyRows[0] || {};
  const policy = {
    minMarginUsdt: numberValue(policyRow.min_margin_usdt),
    targetMarginUsdt: numberValue(policyRow.target_margin_usdt, 1),
    minSellPriceUsdt: numberValue(policyRow.min_sell_price_usdt),
    maxWorkerCostChangePct: numberValue(policyRow.max_worker_cost_change_pct, 30),
    updatedAt: isoOrEmpty(policyRow.updated_at),
    updatedBy: policyRow.updated_by || "",
  };
  return {
    exchangeRates,
    serviceRules,
    frpPricing: { policy, providers },
    paymentMethodOverrides,
  };
}

async function readCounters(client) {
  const counters = {
    customerCounters: {},
    ticketCounters: {},
    frpCounters: {},
  };
  const rows = await readTable(client, "sequence_counters", "scope asc, bucket asc, counter_key asc");
  for (const row of rows) {
    const scope = String(row.scope || "");
    if (!Object.prototype.hasOwnProperty.call(counters, scope)) continue;
    const bucket = String(row.bucket || "");
    const target = counters[scope];
    const parts = bucket ? bucket.split(".").filter(Boolean) : [];
    let cursor = target;
    for (const part of parts) {
      if (!isObject(cursor[part])) cursor[part] = {};
      cursor = cursor[part];
    }
    cursor[String(row.counter_key || "")] = Number.parseInt(row.counter_value, 10) || 0;
  }
  return counters;
}

async function readPaymentProofs(client) {
  const result = await client.query(`
    select
      p.*,
      f.name as file_name,
      f.content_type,
      f.size_bytes,
      f.sha256,
      f.legacy_data_url,
      f.legacy_json as file_legacy_json
    from payment_proofs p
    left join stored_files f on f.id = p.stored_file_id
    order by p.source_type asc, p.source_id asc, p.uploaded_at asc nulls last, p.id asc
  `);
  return result.rows.map((row) => {
    const proof = {
      ...legacyObject(row),
      id: legacyObject(row).id || row.id,
      reviewStatus: row.review_status || legacyObject(row).reviewStatus || "PENDIENTE",
      uploadedBy: row.uploaded_by || legacyObject(row).uploadedBy || "",
      uploadedAt: isoOrEmpty(row.uploaded_at) || legacyObject(row).uploadedAt || "",
      reviewedBy: row.reviewed_by || legacyObject(row).reviewedBy || "",
      reviewedAt: isoOrEmpty(row.reviewed_at) || legacyObject(row).reviewedAt || "",
      rejectedReason: row.rejected_reason || legacyObject(row).rejectedReason || "",
    };
    const fileLegacy = isObject(row.file_legacy_json) ? row.file_legacy_json : {};
    setIfPresent(proof, "name", proof.name || fileLegacy.name || row.file_name || "");
    setIfPresent(proof, "type", proof.type || fileLegacy.type || fileLegacy.contentType || row.content_type || "");
    setIfPresent(proof, "size", proof.size || fileLegacy.size || row.size_bytes || 0);
    setIfPresent(proof, "hash", proof.hash || proof.sha256 || fileLegacy.hash || fileLegacy.sha256 || row.sha256 || "");
    setIfPresent(proof, "sha256", proof.sha256 || proof.hash || fileLegacy.sha256 || fileLegacy.hash || row.sha256 || "");
    setIfPresent(proof, "dataUrl", row.legacy_data_url || fileLegacy.dataUrl || "");
    return {
      sourceType: row.source_type,
      sourceId: String(row.source_id || ""),
      proof,
    };
  });
}

async function readFinalImages(client) {
  const result = await client.query(`
    select
      jf.job_id,
      jf.created_at as relation_created_at,
      f.name as file_name,
      f.content_type,
      f.size_bytes,
      f.sha256,
      f.legacy_data_url,
      f.legacy_json as file_legacy_json
    from frp_job_files jf
    join stored_files f on f.id = jf.stored_file_id
    order by jf.job_id asc, jf.created_at asc, f.id asc
  `);
  return result.rows.map((row) => {
    const fileLegacy = isObject(row.file_legacy_json) ? row.file_legacy_json : {};
    const image = {
      ...fileLegacy,
      name: fileLegacy.name || row.file_name || "",
      type: fileLegacy.type || fileLegacy.contentType || row.content_type || "",
      size: fileLegacy.size || row.size_bytes || 0,
      hash: fileLegacy.hash || fileLegacy.sha256 || row.sha256 || "",
      sha256: fileLegacy.sha256 || fileLegacy.hash || row.sha256 || "",
      createdAt: fileLegacy.createdAt || isoOrEmpty(row.relation_created_at),
    };
    setIfPresent(image, "dataUrl", row.legacy_data_url || fileLegacy.dataUrl || "");
    return {
      jobId: String(row.job_id || ""),
      image,
    };
  });
}

function attachPaymentProofs(db, proofRows) {
  const groupedByType = new Map();
  for (const entry of proofRows) {
    const key = `${entry.sourceType}:${entry.sourceId}`;
    if (!groupedByType.has(key)) groupedByType.set(key, []);
    groupedByType.get(key).push(entry.proof);
  }
  const attach = (collection, sourceType) => {
    for (const item of collection) {
      item.paymentProofs = groupedByType.get(`${sourceType}:${item.id}`) || [];
    }
  };
  attach(db.customerOrders, "CUSTOMER_ORDER");
  attach(db.frpOrders, "FRP_ORDER");
  attach(db.tickets, "SERVICE_TICKET");
}

function attachFinalImages(db, imageRows) {
  const grouped = groupObjects(imageRows, "jobId");
  for (const job of db.frpJobs) {
    job.finalImages = (grouped.get(String(job.id || "")) || []).map((entry) => entry.image);
  }
}

async function readSensitiveCollections(client) {
  const userRows = await readTable(client, "operator_users", "created_at asc, id asc");
  const sessionRows = await readTable(client, "operator_sessions", "created_at asc, id asc");
  const deviceApprovalRows = await readTable(client, "operator_device_approvals", "created_at asc, id asc");
  const resetTokenRows = await readTable(client, "password_reset_tokens", "created_at asc, id asc");
  const resetRequestRows = await readTable(client, "password_reset_requests", "created_at asc, id asc");
  const customerUserRows = await readTable(client, "customer_users", "created_at asc, id asc");
  const customerSessionRows = await readTable(client, "customer_sessions", "created_at asc, id asc");
  const emailTokenRows = await readTable(client, "customer_email_verification_tokens", "created_at asc, id asc");
  return {
    users: userRows.map((row) => ({
      ...legacyObject(row),
      email: row.email || legacyObject(row).email || "",
      passwordHash: row.password_hash || "",
      operatorPinHash: row.operator_pin_hash || "",
    })),
    sessions: sessionRows.map((row) => ({
      ...legacyObject(row),
      tokenHash: row.token_hash || "",
    })),
    deviceApprovals: deviceApprovalRows.map(legacyObject),
    passwordResetTokens: resetTokenRows.map((row) => ({
      ...legacyObject(row),
      tokenHash: row.token_hash || "",
    })),
    passwordResetRequests: resetRequestRows.map((row) => ({
      ...legacyObject(row),
      emailHash: legacyObject(row).emailHash || row.email_hash || "",
      ipHash: legacyObject(row).ipHash || row.ip_hash || "",
    })),
    customerUsers: customerUserRows.map((row) => ({
      ...legacyObject(row),
      email: row.email || legacyObject(row).email || "",
      passwordHash: row.password_hash || "",
    })),
    customerSessions: customerSessionRows.map((row) => ({
      ...legacyObject(row),
      tokenHash: row.token_hash || "",
    })),
    customerEmailVerificationTokens: emailTokenRows.map((row) => ({
      ...legacyObject(row),
      email: row.email || legacyObject(row).email || "",
      tokenHash: row.token_hash || "",
    })),
  };
}

export async function queryPostgresTableCounts(client) {
  const selects = POSTGRES_TARGET_TABLES.map((table) => `(select count(*)::int from ${table}) as ${table}`).join(",\n");
  const result = await client.query(`select ${selects}`);
  return result.rows[0] || {};
}

export async function readPostgresTableCounts() {
  return withPostgresClient(async (client) => {
    await client.query("set search_path = ariad, public");
    return queryPostgresTableCounts(client);
  });
}

export async function readPostgresLegacyDb() {
  return withPostgresClient(async (client) => {
    await client.query("begin transaction isolation level repeatable read read only");
    try {
      await client.query("set local search_path = ariad, public");
      const db = {
        ...(await readSensitiveCollections(client)),
        devices: await readOperatorDevices(client),
        customerDevices: await readCustomerDevices(client),
        pricingConfig: await readPricingConfig(client),
        activeTechnician: null,
      };
      for (const [collection, table, orderBy] of legacyCollectionMap) {
        db[collection] = await readLegacyCollection(client, table, orderBy);
      }
      Object.assign(db, await readCounters(client));
      const activeTechnicianRows = await readLegacyCollection(client, "active_technician_state", "id asc");
      db.activeTechnician = activeTechnicianRows[0] || null;
      attachPaymentProofs(db, await readPaymentProofs(client));
      attachFinalImages(db, await readFinalImages(client));
      await client.query("commit");
      return db;
    } catch (error) {
      await client.query("rollback").catch(() => {});
      throw error;
    }
  });
}
