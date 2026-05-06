#!/usr/bin/env node

import crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  closePostgresPool,
  hasPostgresConfig,
  redactedPostgresUrl,
  withPostgresClient,
  withTransaction,
} from "../../server/db/postgres.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const collectionNames = [
  "users",
  "sessions",
  "devices",
  "deviceApprovals",
  "customerClients",
  "customerUsers",
  "customerSessions",
  "customerDevices",
  "customerRequests",
  "customerOrders",
  "customerOrderItems",
  "customerBenefits",
  "customerEmailVerificationTokens",
  "masterClients",
  "clientLinks",
  "clientLinkSuggestions",
  "paymentLedgerEntries",
  "dailyCloses",
  "dailyCloseLines",
  "dailyAdjustments",
  "portalRateLimits",
  "clients",
  "tickets",
  "frpOrders",
  "frpJobs",
  "frpProviderCostHistory",
  "frpPendingCostChanges",
  "passwordResetTokens",
  "passwordResetRequests",
  "audit",
];

const targetTables = [
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

const insertOrder = [
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

const columnsByTable = {
  migration_runs: ["id", "source_name", "source_sha256", "started_at", "finished_at", "status", "collection_counts", "notes"],
  sequence_counters: ["scope", "bucket", "counter_key", "counter_value", "updated_at"],
  operator_users: ["id", "name", "email", "password_hash", "role", "work_channel", "permissions", "operator_pin_hash", "technician_redirector_id", "active", "created_at", "updated_at", "legacy_json"],
  operator_devices: ["id", "token_hash", "user_agent", "first_ip_hash", "trust_version", "trusted_at", "last_seen_at", "created_at", "legacy_json"],
  operator_device_admin_users: ["device_id", "user_id", "created_at"],
  operator_device_approvals: ["id", "admin_user_id", "device_id", "user_agent", "ip_hash", "created_at", "expires_at", "approved_at", "legacy_json"],
  operator_sessions: ["id", "user_id", "token_hash", "device_id", "version", "last_seen_at", "expires_at", "created_at", "legacy_json"],
  password_reset_tokens: ["id", "user_id", "token_hash", "created_at", "expires_at", "used_at", "legacy_json"],
  password_reset_requests: ["id", "email_hash", "ip_hash", "created_at", "legacy_json"],
  master_clients: ["id", "display_name", "primary_whatsapp", "country", "primary_email", "status", "source", "merged_into_master_client_id", "merged_at", "created_at", "updated_at", "legacy_json"],
  customer_clients: ["id", "master_client_id", "name", "whatsapp", "country", "whatsapp_country_iso", "whatsapp_detected_country", "status", "primary_email", "email_verified_at", "created_at", "updated_at", "legacy_json"],
  customer_users: ["id", "client_id", "name", "email", "password_hash", "role", "active", "email_verified_at", "created_at", "updated_at", "legacy_json"],
  internal_clients: ["id", "master_client_id", "name", "whatsapp", "country", "work_channel", "created_by", "created_by_actor", "created_at", "updated_at", "legacy_json"],
  client_links: ["id", "master_client_id", "source_type", "source_id", "confidence", "signals", "active", "unlinked_at", "unlinked_by", "unlinked_by_actor", "created_by", "created_by_actor", "created_at", "updated_at", "legacy_json"],
  client_link_suggestions: ["id", "source_type", "source_id", "candidate_master_client_id", "status", "reason", "signals", "reviewed_by", "reviewed_by_actor", "reviewed_at", "review_reason", "created_at", "updated_at", "legacy_json"],
  customer_benefits: ["id", "client_id", "master_client_id", "quantity_discount_enabled", "monthly_discount_enabled", "goal_discount_enabled", "vip_unit_margin", "monthly_goal", "device_required", "active", "created_at", "updated_at", "legacy_json"],
  customer_devices: ["id", "token_hash", "user_agent", "first_ip_hash", "last_seen_at", "created_at", "legacy_json"],
  customer_device_authorizations: ["device_id", "client_id", "authorized_at"],
  customer_sessions: ["id", "user_id", "client_id", "token_hash", "device_id", "version", "last_seen_at", "expires_at", "created_at", "legacy_json"],
  customer_email_verification_tokens: ["id", "user_id", "client_id", "email", "token_hash", "reason", "created_at", "expires_at", "used_at", "legacy_json"],
  exchange_rates: ["rate_key", "country", "currency", "rate_per_usdt", "updated_at", "updated_by", "legacy_json"],
  service_pricing_rules: ["service_code", "pricing_mode", "base_cost_usdt", "margin_usdt", "auth_cost_usdt", "critical_cost_usdt", "tool_cost_usdt", "server_cost_usdt", "manual_adjustment_allowed", "updated_at", "updated_by", "legacy_json"],
  payment_method_overrides: ["code", "active", "custom_message", "updated_at", "updated_by", "legacy_json"],
  frp_pricing_policy: ["id", "target_margin_usdt", "max_worker_cost_change_pct", "min_margin_usdt", "min_sell_price_usdt", "updated_at", "updated_by"],
  frp_pricing_providers: ["id", "name", "status", "cost_mode", "fixed_cost_usdt", "credits_per_process", "credit_unit_cost_usdt", "priority", "reason", "updated_at", "updated_by", "legacy_json"],
  frp_provider_cost_history: ["id", "provider_id", "cost_usdt", "recorded_at", "recorded_by", "reason", "legacy_json"],
  frp_pending_cost_changes: ["id", "provider_id", "from_cost_usdt", "to_cost_usdt", "level", "reason", "status", "created_by", "created_at", "reviewed_by", "reviewed_at", "legacy_json"],
  customer_requests: ["id", "client_id", "master_client_id", "user_id", "service_code", "service_name", "channel", "status", "created_at", "updated_at", "legacy_json"],
  customer_orders: ["id", "code", "request_id", "client_id", "master_client_id", "user_id", "service_code", "internal_service_code", "service_name", "work_channel", "quantity", "unit_price_usdt", "total_price_usdt", "price_formatted", "pricing_snapshot", "payment_method", "payment_label", "public_status", "compatibility_review_required", "frp_order_id", "internal_client_id", "customer_connection_ready_at", "debt_amount_usdt", "debt_cleared_at", "note", "created_at", "updated_at", "legacy_json"],
  customer_order_items: ["id", "request_id", "order_id", "client_id", "master_client_id", "sequence", "original_text", "model", "imei", "status", "eligibility_status", "eligibility_detected_match", "eligibility_matched_alias", "eligibility_internal_reason", "eligibility_public_message", "frp_order_id", "frp_job_id", "created_at", "updated_at", "legacy_json"],
  service_tickets: ["id", "code", "client_id", "master_client_id", "client_name", "country", "service_code", "service_name", "work_channel", "price_usdt", "payment_method", "payment_status", "operational_status", "created_by", "last_handled_by", "created_at", "updated_at", "legacy_json"],
  stored_files: ["id", "owner_type", "owner_id", "purpose", "name", "content_type", "size_bytes", "sha256", "storage_kind", "storage_key", "legacy_data_url", "created_at", "legacy_json"],
  payment_proofs: ["id", "source_type", "source_id", "stored_file_id", "review_status", "uploaded_by", "uploaded_at", "reviewed_by", "reviewed_at", "rejected_reason", "legacy_json"],
  frp_orders: ["id", "code", "client_id", "master_client_id", "client_name", "client_whatsapp", "country", "service_code", "service_name", "work_channel", "quantity", "unit_price_usdt", "total_price_usdt", "price_formatted", "pricing_snapshot", "payment_method", "payment_label", "payment_status", "order_status", "checklist", "payment_reviewed_by", "payment_reviewed_at", "payment_rejected_reason", "created_by", "portal_order_id", "compatibility_review_required", "source", "created_at", "updated_at", "legacy_json"],
  frp_jobs: ["id", "code", "order_id", "sequence", "total_jobs", "work_channel", "service_code", "service_name", "client_name", "country", "model", "imei", "original_text", "eligibility_status", "eligibility_detected_match", "eligibility_matched_alias", "eligibility_internal_reason", "eligibility_public_message", "status", "checklist", "technician_id", "portal_order_item_id", "final_log", "ard_code", "review_reason", "done_at", "canceled_at", "canceled_by", "cancel_reason", "created_at", "updated_at", "legacy_json"],
  frp_job_files: ["job_id", "stored_file_id", "purpose", "created_at"],
  active_technician_state: ["id", "user_id", "swap_in_progress", "swap_from_user_id", "swap_to_user_id", "swap_started_at", "swap_commits_at", "auto_revert_to_user_id", "auto_revert_at", "updated_at", "legacy_json"],
  payment_ledger_entries: ["id", "entry_type", "source_type", "source_id", "source_code", "client_id", "master_client_id", "client_name", "country", "service_code", "service_name", "work_channel", "quantity", "amount", "currency", "payment_method", "payment_label", "exchange_rate_to_usdt", "exchange_rate_date", "amount_usdt_estimate", "status", "validated_by", "validated_at", "proof_count", "voided_at", "created_at", "updated_at", "legacy_json"],
  daily_closes: ["id", "date_stamp", "status", "opened_at", "closed_at", "closed_by", "reopened_at", "reopened_by", "reopen_reason", "notes", "totals", "created_at", "updated_at", "legacy_json"],
  daily_close_lines: ["id", "daily_close_id", "date_stamp", "type", "currency", "payment_method", "work_channel", "service_code", "gross_amount", "refund_amount", "adjustment_amount", "net_amount", "payment_count", "equipment_count", "created_at", "legacy_json"],
  daily_adjustments: ["id", "date_stamp", "type", "status", "amount", "currency", "payment_method", "work_channel", "service_code", "reason", "created_by", "approved_by", "created_at", "updated_at", "legacy_json"],
  portal_rate_limits: ["id", "bucket", "ip_hash", "key_hash", "created_at", "legacy_json"],
  audit_events: ["id", "actor_id", "action", "target_id", "detail", "created_at", "legacy_json"],
};

const sensitiveKeys = new Set([
  "password",
  "passwordHash",
  "operatorPinHash",
  "pin",
  "token",
  "rawToken",
  "tokenHash",
  "dataUrl",
  "base64",
  "legacy_data_url",
]);

const reportBlockPatterns = [
  /passwordHash/i,
  /operatorPinHash/i,
  /tokenHash/i,
  /dataUrl/i,
  /base64/i,
  /legacy_data_url/i,
];

let activeReportPath = "";
let activeReport = null;

function parseArgs(argv) {
  const args = {
    input: path.join("data", "users.json"),
    report: "",
    apply: false,
    allowNonEmpty: false,
    strict: false,
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--input") {
      args.input = argv[index + 1] || "";
      index += 1;
    } else if (arg === "--report") {
      args.report = argv[index + 1] || "";
      index += 1;
    } else if (arg === "--apply") {
      args.apply = true;
    } else if (arg === "--allow-non-empty") {
      args.allowNonEmpty = true;
    } else if (arg === "--strict") {
      args.strict = true;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else {
      throw new Error(`Argumento no reconocido: ${arg}`);
    }
  }
  return args;
}

function usage() {
  return [
    "Uso:",
    "  npm run postgres:import -- --input /opt/render/project/src/storage/users.json --report /tmp/postgres-import-plan.json",
    "  npm run postgres:import:apply -- --input /opt/render/project/src/storage/users.json --report /tmp/postgres-import-apply.json",
    "",
    "Opciones:",
    "  --input            Ruta al users.json. Default: data/users.json",
    "  --report           Ruta para escribir reporte JSON sanitizado.",
    "  --apply            Inserta datos. Sin esto solo valida y no escribe.",
    "  --allow-non-empty  Permite importar sobre tablas con datos. No usar en produccion sin revision.",
    "  --strict           Sale con codigo 2 si hay warnings en modo dry-run.",
  ].join("\n");
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function uuidFromSeed(seed) {
  const bytes = Buffer.from(sha256(seed).slice(0, 32), "hex");
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function uuidOrNull(value) {
  const textValue = String(value || "").trim();
  return uuidPattern.test(textValue) ? textValue : null;
}

function requiredUuid(value, label) {
  const id = uuidOrNull(value);
  if (!id) throw new Error(`UUID invalido o faltante en ${label}.`);
  return id;
}

function stringValue(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  return String(value);
}

function normalizedEmail(value) {
  return stringValue(value).trim().toLowerCase();
}

function boolValue(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function numberValue(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function integerValue(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : fallback;
}

function timestampOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function timestampFromMsOrNull(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const date = new Date(numeric);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function timestampValue(value, fallback) {
  return timestampOrNull(value) || fallback;
}

function timestampFromAny(row, keys, fallback = null) {
  for (const key of keys) {
    const asIso = timestampOrNull(row?.[key]);
    if (asIso) return asIso;
  }
  for (const key of keys) {
    const asMs = timestampFromMsOrNull(row?.[key]);
    if (asMs) return asMs;
  }
  return fallback;
}

function enumValue(value, allowed, fallback) {
  const text = stringValue(value).trim();
  return allowed.includes(text) ? text : fallback;
}

function jsonb(value) {
  return JSON.stringify(value === undefined ? null : value);
}

function sanitizeLegacyJson(value) {
  if (Array.isArray(value)) return value.map((item) => sanitizeLegacyJson(item));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !sensitiveKeys.has(key))
      .map(([key, item]) => [key, sanitizeLegacyJson(item)]),
  );
}

function legacyJson(value) {
  return jsonb(sanitizeLegacyJson(value || {}));
}

function arrayOf(db, key, warnings) {
  if (Array.isArray(db[key])) return db[key];
  if (db[key] === undefined) {
    warnings.push({ code: "missingCollection", collection: key });
  } else {
    warnings.push({ code: "nonArrayCollection", collection: key, type: typeof db[key] });
  }
  return [];
}

function objectOf(db, key, warnings) {
  if (db[key] && typeof db[key] === "object" && !Array.isArray(db[key])) return db[key];
  if (db[key] === undefined) warnings.push({ code: "missingObject", collection: key });
  else warnings.push({ code: "nonObjectCollection", collection: key, type: typeof db[key] });
  return {};
}

function idSet(rows) {
  return new Set(rows.map((row) => uuidOrNull(row?.id)).filter(Boolean));
}

function duplicateCount(rows, getKey) {
  const counts = new Map();
  let duplicates = 0;
  for (const row of rows) {
    const key = stringValue(getKey(row)).trim().toLowerCase();
    if (!key) continue;
    const count = (counts.get(key) || 0) + 1;
    counts.set(key, count);
    if (count > 1) duplicates += 1;
  }
  return duplicates;
}

function refUuid(value, allowedSet, warnings, detail) {
  const id = uuidOrNull(value);
  if (!id) return null;
  if (allowedSet && !allowedSet.has(id)) {
    warnings.push({
      code: "droppedMissingReference",
      table: detail.table,
      field: detail.field,
      id: detail.id,
      target: detail.target,
    });
    return null;
  }
  return id;
}

function actorUuid(value, userIds, warnings, detail) {
  return refUuid(value, userIds, warnings, detail);
}

function legacyActor(value, userIds) {
  const raw = stringValue(value).trim();
  if (!raw) return { userId: null, actor: "" };
  const id = uuidOrNull(raw);
  if (id && userIds.has(id)) return { userId: id, actor: "" };
  return { userId: null, actor: raw };
}

function credentialDigest(value, table, id, warnings) {
  const digest = stringValue(value);
  if (!digest) warnings.push({ code: "missingCredentialDigest", table, id: String(id || "") });
  return digest;
}

function proofEntries(db) {
  const entries = [];
  const pushProofs = (sourceType, sourceId, proofs = []) => {
    if (!Array.isArray(proofs)) return;
    for (let index = 0; index < proofs.length; index += 1) {
      entries.push({ sourceType, sourceId: String(sourceId || ""), proof: proofs[index], index });
    }
  };
  for (const order of Array.isArray(db.customerOrders) ? db.customerOrders : []) {
    pushProofs("CUSTOMER_ORDER", order.id, order.paymentProofs);
  }
  for (const order of Array.isArray(db.frpOrders) ? db.frpOrders : []) {
    pushProofs("FRP_ORDER", order.id, order.paymentProofs);
  }
  for (const ticket of Array.isArray(db.tickets) ? db.tickets : []) {
    pushProofs("SERVICE_TICKET", ticket.id, ticket.paymentProofs);
  }
  return entries;
}

function finalImageEntries(db) {
  const entries = [];
  for (const job of Array.isArray(db.frpJobs) ? db.frpJobs : []) {
    if (!Array.isArray(job.finalImages)) continue;
    for (let index = 0; index < job.finalImages.length; index += 1) {
      entries.push({ jobId: String(job.id || ""), image: job.finalImages[index], index });
    }
  }
  return entries;
}

function fileDigest(value) {
  return stringValue(value?.hash || value?.sha256).trim();
}

function proofRelationId(entry, digest) {
  const legacyId = stringValue(entry.proof?.id).trim();
  const stableProofKey = legacyId || digest || `index:${entry.index}`;
  return uuidFromSeed(`payment-proof:${entry.sourceType}:${entry.sourceId}:${stableProofKey}:${entry.index}`);
}

function flattenCounters(scope, value, rows, pathParts = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  for (const [key, item] of Object.entries(value)) {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      flattenCounters(scope, item, rows, [...pathParts, key]);
    } else {
      const bucketParts = pathParts;
      rows.push({
        scope,
        bucket: bucketParts.join("."),
        counter_key: key,
        counter_value: integerValue(item, 0),
        updated_at: null,
      });
    }
  }
}

function tableRows() {
  return Object.fromEntries(targetTables.map((table) => [table, []]));
}

function buildImportPlan(db, sourceName, sourceSha256) {
  const warnings = [];
  const nowIso = new Date().toISOString();
  const rows = tableRows();

  const collections = Object.fromEntries(collectionNames.map((name) => [name, arrayOf(db, name, warnings).length]));
  const users = arrayOf(db, "users", warnings);
  const sessions = arrayOf(db, "sessions", warnings);
  const devices = arrayOf(db, "devices", warnings);
  const deviceApprovals = arrayOf(db, "deviceApprovals", warnings);
  const masterClients = arrayOf(db, "masterClients", warnings);
  const customerClients = arrayOf(db, "customerClients", warnings);
  const customerUsers = arrayOf(db, "customerUsers", warnings);
  const internalClients = arrayOf(db, "clients", warnings);
  const clientLinks = arrayOf(db, "clientLinks", warnings);
  const clientLinkSuggestions = arrayOf(db, "clientLinkSuggestions", warnings);
  const customerBenefits = arrayOf(db, "customerBenefits", warnings);
  const customerDevices = arrayOf(db, "customerDevices", warnings);
  const customerSessions = arrayOf(db, "customerSessions", warnings);
  const customerEmailVerificationTokens = arrayOf(db, "customerEmailVerificationTokens", warnings);
  const customerRequests = arrayOf(db, "customerRequests", warnings);
  const customerOrders = arrayOf(db, "customerOrders", warnings);
  const customerOrderItems = arrayOf(db, "customerOrderItems", warnings);
  const tickets = arrayOf(db, "tickets", warnings);
  const frpOrders = arrayOf(db, "frpOrders", warnings);
  const frpJobs = arrayOf(db, "frpJobs", warnings);
  const paymentLedgerEntries = arrayOf(db, "paymentLedgerEntries", warnings);
  const dailyCloses = arrayOf(db, "dailyCloses", warnings);
  const dailyCloseLines = arrayOf(db, "dailyCloseLines", warnings);
  const dailyAdjustments = arrayOf(db, "dailyAdjustments", warnings);
  const portalRateLimits = arrayOf(db, "portalRateLimits", warnings);
  const audit = arrayOf(db, "audit", warnings);
  const frpProviderCostHistory = arrayOf(db, "frpProviderCostHistory", warnings);
  const frpPendingCostChanges = arrayOf(db, "frpPendingCostChanges", warnings);
  const passwordResetTokens = arrayOf(db, "passwordResetTokens", warnings);
  const passwordResetRequests = arrayOf(db, "passwordResetRequests", warnings);
  const pricingConfig = objectOf(db, "pricingConfig", warnings);
  const frpPricing = pricingConfig.frpPricing && typeof pricingConfig.frpPricing === "object" ? pricingConfig.frpPricing : {};
  const frpPolicy = frpPricing.policy && typeof frpPricing.policy === "object" ? frpPricing.policy : {};
  const frpProviders = Array.isArray(frpPricing.providers) ? frpPricing.providers : [];
  const exchangeRates = Array.isArray(pricingConfig.exchangeRates) ? pricingConfig.exchangeRates : [];
  const serviceRules = Array.isArray(pricingConfig.serviceRules) ? pricingConfig.serviceRules : [];
  const paymentMethodOverrides = Array.isArray(pricingConfig.paymentMethodOverrides) ? pricingConfig.paymentMethodOverrides : [];
  const activeTechnician = db.activeTechnician && typeof db.activeTechnician === "object" ? db.activeTechnician : null;

  const userIds = idSet(users);
  const operatorDeviceIds = idSet(devices);
  const masterClientIds = idSet(masterClients);
  const customerClientIds = idSet(customerClients);
  const customerUserIds = idSet(customerUsers);
  const customerDeviceIds = idSet(customerDevices);
  const customerRequestIds = idSet(customerRequests);
  const customerOrderIds = idSet(customerOrders);
  const customerOrderItemIds = idSet(customerOrderItems);
  const internalClientIds = idSet(internalClients);
  const frpOrderIds = idSet(frpOrders);
  const frpJobIds = idSet(frpJobs);
  const dailyCloseIds = idSet(dailyCloses);
  const providerIds = new Set(frpProviders.map((provider) => stringValue(provider.id).trim()).filter(Boolean));

  const operatorEmailDuplicates = duplicateCount(users, (user) => user.email);
  const customerEmailDuplicates = duplicateCount(customerUsers, (user) => user.email);
  if (operatorEmailDuplicates) warnings.push({ code: "duplicateOperatorEmails", count: operatorEmailDuplicates });
  if (customerEmailDuplicates) warnings.push({ code: "duplicateCustomerEmails", count: customerEmailDuplicates });

  for (const [scope, value] of Object.entries({
    customerCounters: db.customerCounters,
    ticketCounters: db.ticketCounters,
    frpCounters: db.frpCounters,
  })) {
    flattenCounters(scope, value, rows.sequence_counters);
  }

  for (const user of users) {
    rows.operator_users.push({
      id: requiredUuid(user.id, "users.id"),
      name: stringValue(user.name),
      email: normalizedEmail(user.email),
      password_hash: credentialDigest(user.passwordHash, "operator_users", user.id, warnings),
      role: enumValue(user.role, ["ADMIN", "COORDINADOR", "ATENCION_TECNICA", "PENDIENTE"], "PENDIENTE"),
      work_channel: stringValue(user.workChannel),
      permissions: jsonb(user.permissions || {}),
      operator_pin_hash: stringValue(user.operatorPinHash) || null,
      technician_redirector_id: stringValue(user.technicianRedirectorId),
      active: boolValue(user.active, true),
      created_at: timestampValue(user.createdAt, nowIso),
      updated_at: timestampValue(user.updatedAt || user.createdAt, nowIso),
      legacy_json: legacyJson(user),
    });
  }

  for (const device of devices) {
    rows.operator_devices.push({
      id: requiredUuid(device.id, "devices.id"),
      token_hash: credentialDigest(device.tokenHash, "operator_devices", device.id, warnings),
      user_agent: stringValue(device.userAgent),
      first_ip_hash: stringValue(device.firstIpHash),
      trust_version: device.trustVersion === undefined ? null : integerValue(device.trustVersion),
      trusted_at: timestampOrNull(device.trustedAt),
      last_seen_at: timestampFromAny(device, ["lastSeenAt", "lastSeenAtMs"]),
      created_at: timestampValue(device.createdAt, nowIso),
      legacy_json: legacyJson(device),
    });
    const adminIds = Array.isArray(device.adminUserIds) ? device.adminUserIds : [];
    for (const adminUserId of adminIds) {
      const userId = refUuid(adminUserId, userIds, warnings, { table: "operator_device_admin_users", field: "user_id", id: device.id, target: "operator_users" });
      if (!userId) continue;
      rows.operator_device_admin_users.push({
        device_id: requiredUuid(device.id, "devices.id"),
        user_id: userId,
        created_at: timestampValue(device.trustedAt || device.createdAt, nowIso),
      });
    }
  }

  for (const approval of deviceApprovals) {
    rows.operator_device_approvals.push({
      id: requiredUuid(approval.id, "deviceApprovals.id"),
      admin_user_id: refUuid(approval.adminUserId, userIds, warnings, { table: "operator_device_approvals", field: "admin_user_id", id: approval.id, target: "operator_users" }),
      device_id: refUuid(approval.deviceId, operatorDeviceIds, warnings, { table: "operator_device_approvals", field: "device_id", id: approval.id, target: "operator_devices" }),
      user_agent: stringValue(approval.userAgent),
      ip_hash: stringValue(approval.ipHash),
      created_at: timestampValue(approval.createdAt, nowIso),
      expires_at: timestampValue(approval.expiresAt, nowIso),
      approved_at: timestampOrNull(approval.approvedAt),
      legacy_json: legacyJson(approval),
    });
  }

  for (const session of sessions) {
    rows.operator_sessions.push({
      id: requiredUuid(session.id, "sessions.id"),
      user_id: refUuid(session.userId, userIds, warnings, { table: "operator_sessions", field: "user_id", id: session.id, target: "operator_users" }),
      token_hash: credentialDigest(session.tokenHash, "operator_sessions", session.id, warnings),
      device_id: refUuid(session.deviceId, operatorDeviceIds, warnings, { table: "operator_sessions", field: "device_id", id: session.id, target: "operator_devices" }),
      version: integerValue(session.version, 1),
      last_seen_at: timestampFromAny(session, ["lastSeenAt", "lastSeenAtMs"]),
      expires_at: timestampValue(session.expiresAt, nowIso),
      created_at: timestampValue(session.createdAt, nowIso),
      legacy_json: legacyJson(session),
    });
  }

  for (const token of passwordResetTokens) {
    rows.password_reset_tokens.push({
      id: requiredUuid(token.id, "passwordResetTokens.id"),
      user_id: refUuid(token.userId, userIds, warnings, { table: "password_reset_tokens", field: "user_id", id: token.id, target: "operator_users" }),
      token_hash: credentialDigest(token.tokenHash, "password_reset_tokens", token.id, warnings),
      created_at: timestampValue(token.createdAt, nowIso),
      expires_at: timestampValue(token.expiresAt, nowIso),
      used_at: timestampOrNull(token.usedAt),
      legacy_json: legacyJson(token),
    });
  }

  for (const request of passwordResetRequests) {
    rows.password_reset_requests.push({
      id: uuidOrNull(request.id) || uuidFromSeed(`password-reset-request:${request.emailHash || ""}:${request.ipHash || ""}:${request.createdAt || ""}`),
      email_hash: stringValue(request.emailHash),
      ip_hash: stringValue(request.ipHash),
      created_at: timestampValue(request.createdAt, nowIso),
      legacy_json: legacyJson(request),
    });
  }

  for (const client of masterClients) {
    rows.master_clients.push({
      id: requiredUuid(client.id, "masterClients.id"),
      display_name: stringValue(client.displayName || client.name),
      primary_whatsapp: stringValue(client.primaryWhatsapp || client.whatsapp),
      country: stringValue(client.country),
      primary_email: normalizedEmail(client.primaryEmail || client.email),
      status: enumValue(client.status, ["ACTIVO", "PENDIENTE_VERIFICACION", "BLOQUEADO", "MERGED"], "PENDIENTE_VERIFICACION"),
      source: stringValue(client.source),
      merged_into_master_client_id: refUuid(client.mergedIntoMasterClientId, masterClientIds, warnings, { table: "master_clients", field: "merged_into_master_client_id", id: client.id, target: "master_clients" }),
      merged_at: timestampOrNull(client.mergedAt),
      created_at: timestampValue(client.createdAt, nowIso),
      updated_at: timestampValue(client.updatedAt || client.createdAt, nowIso),
      legacy_json: legacyJson(client),
    });
  }

  for (const client of customerClients) {
    rows.customer_clients.push({
      id: requiredUuid(client.id, "customerClients.id"),
      master_client_id: refUuid(client.masterClientId, masterClientIds, warnings, { table: "customer_clients", field: "master_client_id", id: client.id, target: "master_clients" }),
      name: stringValue(client.name),
      whatsapp: stringValue(client.whatsapp),
      country: stringValue(client.country),
      whatsapp_country_iso: stringValue(client.whatsappCountryIso),
      whatsapp_detected_country: stringValue(client.whatsappDetectedCountry),
      status: enumValue(client.status, ["REGISTRADO_NO_VERIFICADO", "EMAIL_VERIFICADO", "REGISTRADO", "VERIFICADO", "VIP", "EMPRESA", "BLOQUEADO"], "REGISTRADO_NO_VERIFICADO"),
      primary_email: normalizedEmail(client.primaryEmail || client.email),
      email_verified_at: timestampOrNull(client.emailVerifiedAt),
      created_at: timestampValue(client.createdAt, nowIso),
      updated_at: timestampValue(client.updatedAt || client.createdAt, nowIso),
      legacy_json: legacyJson(client),
    });
  }

  for (const user of customerUsers) {
    rows.customer_users.push({
      id: requiredUuid(user.id, "customerUsers.id"),
      client_id: refUuid(user.clientId, customerClientIds, warnings, { table: "customer_users", field: "client_id", id: user.id, target: "customer_clients" }),
      name: stringValue(user.name),
      email: normalizedEmail(user.email),
      password_hash: credentialDigest(user.passwordHash, "customer_users", user.id, warnings),
      role: stringValue(user.role || "OWNER"),
      active: boolValue(user.active, true),
      email_verified_at: timestampOrNull(user.emailVerifiedAt),
      created_at: timestampValue(user.createdAt, nowIso),
      updated_at: timestampValue(user.updatedAt || user.createdAt, nowIso),
      legacy_json: legacyJson(user),
    });
  }

  for (const client of internalClients) {
    const createdByActor = legacyActor(client.createdBy, userIds);
    rows.internal_clients.push({
      id: requiredUuid(client.id, "clients.id"),
      master_client_id: refUuid(client.masterClientId, masterClientIds, warnings, { table: "internal_clients", field: "master_client_id", id: client.id, target: "master_clients" }),
      name: stringValue(client.name),
      whatsapp: stringValue(client.whatsapp),
      country: stringValue(client.country),
      work_channel: stringValue(client.workChannel),
      created_by: createdByActor.userId,
      created_by_actor: createdByActor.actor,
      created_at: timestampValue(client.createdAt, nowIso),
      updated_at: timestampValue(client.updatedAt || client.createdAt, nowIso),
      legacy_json: legacyJson(client),
    });
  }

  for (const link of clientLinks) {
    const unlinkedByActor = legacyActor(link.unlinkedBy, userIds);
    const createdByActor = legacyActor(link.createdBy, userIds);
    rows.client_links.push({
      id: requiredUuid(link.id, "clientLinks.id"),
      master_client_id: refUuid(link.masterClientId, masterClientIds, warnings, { table: "client_links", field: "master_client_id", id: link.id, target: "master_clients" }),
      source_type: enumValue(link.sourceType, ["INTERNAL_CLIENT", "PORTAL_CLIENT"], "PORTAL_CLIENT"),
      source_id: requiredUuid(link.sourceId, "clientLinks.sourceId"),
      confidence: stringValue(link.confidence),
      signals: jsonb(link.signals || {}),
      active: boolValue(link.active, true),
      unlinked_at: timestampOrNull(link.unlinkedAt),
      unlinked_by: unlinkedByActor.userId,
      unlinked_by_actor: unlinkedByActor.actor,
      created_by: createdByActor.userId,
      created_by_actor: createdByActor.actor,
      created_at: timestampValue(link.createdAt, nowIso),
      updated_at: timestampValue(link.updatedAt || link.createdAt, nowIso),
      legacy_json: legacyJson(link),
    });
  }

  for (const suggestion of clientLinkSuggestions) {
    const reviewedByActor = legacyActor(suggestion.reviewedBy, userIds);
    rows.client_link_suggestions.push({
      id: requiredUuid(suggestion.id, "clientLinkSuggestions.id"),
      source_type: enumValue(suggestion.sourceType, ["INTERNAL_CLIENT", "PORTAL_CLIENT"], "PORTAL_CLIENT"),
      source_id: requiredUuid(suggestion.sourceId, "clientLinkSuggestions.sourceId"),
      candidate_master_client_id: refUuid(suggestion.candidateMasterClientId, masterClientIds, warnings, { table: "client_link_suggestions", field: "candidate_master_client_id", id: suggestion.id, target: "master_clients" }),
      status: enumValue(suggestion.status, ["PENDING", "REJECTED", "BLOCKED", "LINKED"], "PENDING"),
      reason: stringValue(suggestion.reason),
      signals: jsonb(suggestion.signals || {}),
      reviewed_by: reviewedByActor.userId,
      reviewed_by_actor: reviewedByActor.actor,
      reviewed_at: timestampOrNull(suggestion.reviewedAt),
      review_reason: stringValue(suggestion.reviewReason),
      created_at: timestampValue(suggestion.createdAt, nowIso),
      updated_at: timestampValue(suggestion.updatedAt || suggestion.createdAt, nowIso),
      legacy_json: legacyJson(suggestion),
    });
  }

  for (const benefit of customerBenefits) {
    rows.customer_benefits.push({
      id: requiredUuid(benefit.id, "customerBenefits.id"),
      client_id: refUuid(benefit.clientId, customerClientIds, warnings, { table: "customer_benefits", field: "client_id", id: benefit.id, target: "customer_clients" }),
      master_client_id: refUuid(benefit.masterClientId, masterClientIds, warnings, { table: "customer_benefits", field: "master_client_id", id: benefit.id, target: "master_clients" }),
      quantity_discount_enabled: boolValue(benefit.quantityDiscountEnabled, true),
      monthly_discount_enabled: boolValue(benefit.monthlyDiscountEnabled, true),
      goal_discount_enabled: boolValue(benefit.goalDiscountEnabled, false),
      vip_unit_margin: numberValue(benefit.vipUnitMargin, 0),
      monthly_goal: integerValue(benefit.monthlyGoal, 0),
      device_required: boolValue(benefit.deviceRequired, true),
      active: boolValue(benefit.active, true),
      created_at: timestampValue(benefit.createdAt, nowIso),
      updated_at: timestampValue(benefit.updatedAt || benefit.createdAt, nowIso),
      legacy_json: legacyJson(benefit),
    });
  }

  for (const device of customerDevices) {
    rows.customer_devices.push({
      id: requiredUuid(device.id, "customerDevices.id"),
      token_hash: credentialDigest(device.tokenHash, "customer_devices", device.id, warnings),
      user_agent: stringValue(device.userAgent),
      first_ip_hash: stringValue(device.firstIpHash),
      last_seen_at: timestampFromAny(device, ["lastSeenAt", "lastSeenAtMs"]),
      created_at: timestampValue(device.createdAt, nowIso),
      legacy_json: legacyJson(device),
    });
    const authorizedClientIds = Array.isArray(device.authorizedClientIds) ? device.authorizedClientIds : [];
    for (const clientIdValue of authorizedClientIds) {
      const clientId = refUuid(clientIdValue, customerClientIds, warnings, { table: "customer_device_authorizations", field: "client_id", id: device.id, target: "customer_clients" });
      if (!clientId) continue;
      rows.customer_device_authorizations.push({
        device_id: requiredUuid(device.id, "customerDevices.id"),
        client_id: clientId,
        authorized_at: timestampValue(device.authorizedAt || device.createdAt, nowIso),
      });
    }
  }

  for (const session of customerSessions) {
    rows.customer_sessions.push({
      id: requiredUuid(session.id, "customerSessions.id"),
      user_id: refUuid(session.userId, customerUserIds, warnings, { table: "customer_sessions", field: "user_id", id: session.id, target: "customer_users" }),
      client_id: refUuid(session.clientId, customerClientIds, warnings, { table: "customer_sessions", field: "client_id", id: session.id, target: "customer_clients" }),
      token_hash: credentialDigest(session.tokenHash, "customer_sessions", session.id, warnings),
      device_id: refUuid(session.deviceId, customerDeviceIds, warnings, { table: "customer_sessions", field: "device_id", id: session.id, target: "customer_devices" }),
      version: integerValue(session.version, 1),
      last_seen_at: timestampFromAny(session, ["lastSeenAt", "lastSeenAtMs"]),
      expires_at: timestampValue(session.expiresAt, nowIso),
      created_at: timestampValue(session.createdAt, nowIso),
      legacy_json: legacyJson(session),
    });
  }

  for (const token of customerEmailVerificationTokens) {
    rows.customer_email_verification_tokens.push({
      id: requiredUuid(token.id, "customerEmailVerificationTokens.id"),
      user_id: refUuid(token.userId, customerUserIds, warnings, { table: "customer_email_verification_tokens", field: "user_id", id: token.id, target: "customer_users" }),
      client_id: refUuid(token.clientId, customerClientIds, warnings, { table: "customer_email_verification_tokens", field: "client_id", id: token.id, target: "customer_clients" }),
      email: normalizedEmail(token.email),
      token_hash: credentialDigest(token.tokenHash, "customer_email_verification_tokens", token.id, warnings),
      reason: stringValue(token.reason),
      created_at: timestampValue(token.createdAt, nowIso),
      expires_at: timestampValue(token.expiresAt, nowIso),
      used_at: timestampOrNull(token.usedAt),
      legacy_json: legacyJson(token),
    });
  }

  for (const rate of exchangeRates) {
    rows.exchange_rates.push({
      rate_key: stringValue(rate.key || rate.country || rate.currency),
      country: stringValue(rate.country),
      currency: stringValue(rate.currency),
      rate_per_usdt: numberValue(rate.ratePerUsdt, 0),
      updated_at: timestampOrNull(rate.updatedAt),
      updated_by: actorUuid(rate.updatedBy, userIds, warnings, { table: "exchange_rates", field: "updated_by", id: rate.key || rate.country, target: "operator_users" }),
      legacy_json: legacyJson(rate),
    });
  }

  for (const rule of serviceRules) {
    rows.service_pricing_rules.push({
      service_code: stringValue(rule.serviceCode),
      pricing_mode: stringValue(rule.pricingMode || "MARGIN"),
      base_cost_usdt: numberValue(rule.baseCostUsdt, 0),
      margin_usdt: numberValue(rule.marginUsdt, 0),
      auth_cost_usdt: numberValue(rule.authCostUsdt, 0),
      critical_cost_usdt: numberValue(rule.criticalCostUsdt, 0),
      tool_cost_usdt: numberValue(rule.toolCostUsdt, 0),
      server_cost_usdt: numberValue(rule.serverCostUsdt, 0),
      manual_adjustment_allowed: boolValue(rule.manualAdjustmentAllowed, false),
      updated_at: timestampOrNull(rule.updatedAt),
      updated_by: actorUuid(rule.updatedBy, userIds, warnings, { table: "service_pricing_rules", field: "updated_by", id: rule.serviceCode, target: "operator_users" }),
      legacy_json: legacyJson(rule),
    });
  }

  for (const override of paymentMethodOverrides) {
    rows.payment_method_overrides.push({
      code: stringValue(override.code),
      active: boolValue(override.active, true),
      custom_message: stringValue(override.customMessage),
      updated_at: timestampOrNull(override.updatedAt),
      updated_by: actorUuid(override.updatedBy, userIds, warnings, { table: "payment_method_overrides", field: "updated_by", id: override.code, target: "operator_users" }),
      legacy_json: legacyJson(override),
    });
  }

  rows.frp_pricing_policy.push({
    id: "current",
    target_margin_usdt: numberValue(frpPolicy.targetMarginUsdt, 1),
    max_worker_cost_change_pct: numberValue(frpPolicy.maxWorkerCostChangePct, 30),
    min_margin_usdt: numberValue(frpPolicy.minMarginUsdt, 0),
    min_sell_price_usdt: numberValue(frpPolicy.minSellPriceUsdt, 0),
    updated_at: timestampOrNull(frpPolicy.updatedAt),
    updated_by: actorUuid(frpPolicy.updatedBy, userIds, warnings, { table: "frp_pricing_policy", field: "updated_by", id: "current", target: "operator_users" }),
  });

  for (const provider of frpProviders) {
    rows.frp_pricing_providers.push({
      id: stringValue(provider.id),
      name: stringValue(provider.name),
      status: enumValue(provider.status, ["ACTIVE", "BACKUP", "OFF", "ARCHIVED"], "OFF"),
      cost_mode: enumValue(provider.costMode, ["FIXED_USDT", "CREDITS"], "FIXED_USDT"),
      fixed_cost_usdt: numberValue(provider.fixedCostUsdt, 0),
      credits_per_process: numberValue(provider.creditsPerProcess, 0),
      credit_unit_cost_usdt: numberValue(provider.creditUnitCostUsdt, 0),
      priority: integerValue(provider.priority, 99),
      reason: stringValue(provider.reason),
      updated_at: timestampOrNull(provider.updatedAt),
      updated_by: actorUuid(provider.updatedBy, userIds, warnings, { table: "frp_pricing_providers", field: "updated_by", id: provider.id, target: "operator_users" }),
      legacy_json: legacyJson(provider),
    });
  }

  for (const item of frpProviderCostHistory) {
    rows.frp_provider_cost_history.push({
      id: requiredUuid(item.id, "frpProviderCostHistory.id"),
      provider_id: stringValue(item.providerId),
      cost_usdt: numberValue(item.costUsdt, 0),
      recorded_at: timestampValue(item.recordedAt, nowIso),
      recorded_by: actorUuid(item.recordedBy, userIds, warnings, { table: "frp_provider_cost_history", field: "recorded_by", id: item.id, target: "operator_users" }),
      reason: stringValue(item.reason || item.baselineNote),
      legacy_json: legacyJson(item),
    });
    if (item.providerId && !providerIds.has(stringValue(item.providerId))) {
      warnings.push({ code: "missingProviderReference", table: "frp_provider_cost_history", id: item.id });
    }
  }

  for (const change of frpPendingCostChanges) {
    rows.frp_pending_cost_changes.push({
      id: requiredUuid(change.id, "frpPendingCostChanges.id"),
      provider_id: stringValue(change.providerId),
      from_cost_usdt: numberValue(change.fromCostUsdt, 0),
      to_cost_usdt: numberValue(change.toCostUsdt, 0),
      level: integerValue(change.level, 0),
      reason: stringValue(change.reason),
      status: enumValue(change.status, ["PENDING", "APPROVED", "REJECTED"], "PENDING"),
      created_by: actorUuid(change.createdBy, userIds, warnings, { table: "frp_pending_cost_changes", field: "created_by", id: change.id, target: "operator_users" }),
      created_at: timestampValue(change.createdAt, nowIso),
      reviewed_by: actorUuid(change.reviewedBy, userIds, warnings, { table: "frp_pending_cost_changes", field: "reviewed_by", id: change.id, target: "operator_users" }),
      reviewed_at: timestampOrNull(change.reviewedAt),
      legacy_json: legacyJson(change),
    });
    if (change.providerId && !providerIds.has(stringValue(change.providerId))) {
      warnings.push({ code: "missingProviderReference", table: "frp_pending_cost_changes", id: change.id });
    }
  }

  for (const request of customerRequests) {
    rows.customer_requests.push({
      id: requiredUuid(request.id, "customerRequests.id"),
      client_id: refUuid(request.clientId, customerClientIds, warnings, { table: "customer_requests", field: "client_id", id: request.id, target: "customer_clients" }),
      master_client_id: refUuid(request.masterClientId, masterClientIds, warnings, { table: "customer_requests", field: "master_client_id", id: request.id, target: "master_clients" }),
      user_id: refUuid(request.userId, customerUserIds, warnings, { table: "customer_requests", field: "user_id", id: request.id, target: "customer_users" }),
      service_code: stringValue(request.serviceCode),
      service_name: stringValue(request.serviceName),
      channel: stringValue(request.channel),
      status: stringValue(request.status),
      created_at: timestampValue(request.createdAt, nowIso),
      updated_at: timestampValue(request.updatedAt || request.createdAt, nowIso),
      legacy_json: legacyJson(request),
    });
  }

  for (const order of customerOrders) {
    rows.customer_orders.push({
      id: requiredUuid(order.id, "customerOrders.id"),
      code: stringValue(order.code),
      request_id: refUuid(order.requestId, customerRequestIds, warnings, { table: "customer_orders", field: "request_id", id: order.id, target: "customer_requests" }),
      client_id: refUuid(order.clientId, customerClientIds, warnings, { table: "customer_orders", field: "client_id", id: order.id, target: "customer_clients" }),
      master_client_id: refUuid(order.masterClientId, masterClientIds, warnings, { table: "customer_orders", field: "master_client_id", id: order.id, target: "master_clients" }),
      user_id: refUuid(order.userId, customerUserIds, warnings, { table: "customer_orders", field: "user_id", id: order.id, target: "customer_users" }),
      service_code: stringValue(order.serviceCode),
      internal_service_code: stringValue(order.internalServiceCode),
      service_name: stringValue(order.serviceName),
      work_channel: stringValue(order.workChannel),
      quantity: integerValue(order.quantity, 1),
      unit_price_usdt: numberValue(order.unitPrice ?? order.baseUnitPrice, 0),
      total_price_usdt: numberValue(order.totalPrice, 0),
      price_formatted: stringValue(order.priceFormatted),
      pricing_snapshot: jsonb(order.pricingSnapshot || {}),
      payment_method: stringValue(order.paymentMethod),
      payment_label: stringValue(order.paymentLabel),
      public_status: stringValue(order.publicStatus || order.status),
      compatibility_review_required: boolValue(order.compatibilityReviewRequired, false),
      frp_order_id: null,
      internal_client_id: refUuid(order.internalClientId, internalClientIds, warnings, { table: "customer_orders", field: "internal_client_id", id: order.id, target: "internal_clients" }),
      customer_connection_ready_at: timestampOrNull(order.customerConnectionReadyAt),
      debt_amount_usdt: numberValue(order.debtAmountUsdt || order.pendingDebtUsdt, 0),
      debt_cleared_at: timestampOrNull(order.debtClearedAt),
      note: stringValue(order.note),
      created_at: timestampValue(order.createdAt, nowIso),
      updated_at: timestampValue(order.updatedAt || order.createdAt, nowIso),
      legacy_json: legacyJson(order),
    });
  }

  for (const item of customerOrderItems) {
    rows.customer_order_items.push({
      id: requiredUuid(item.id, "customerOrderItems.id"),
      request_id: refUuid(item.requestId, customerRequestIds, warnings, { table: "customer_order_items", field: "request_id", id: item.id, target: "customer_requests" }),
      order_id: refUuid(item.orderId, customerOrderIds, warnings, { table: "customer_order_items", field: "order_id", id: item.id, target: "customer_orders" }),
      client_id: refUuid(item.clientId, customerClientIds, warnings, { table: "customer_order_items", field: "client_id", id: item.id, target: "customer_clients" }),
      master_client_id: refUuid(item.masterClientId, masterClientIds, warnings, { table: "customer_order_items", field: "master_client_id", id: item.id, target: "master_clients" }),
      sequence: integerValue(item.sequence, 1),
      original_text: stringValue(item.originalText),
      model: stringValue(item.model),
      imei: stringValue(item.imei),
      status: stringValue(item.status),
      eligibility_status: stringValue(item.eligibilityStatus),
      eligibility_detected_match: stringValue(item.eligibilityDetectedMatch),
      eligibility_matched_alias: stringValue(item.eligibilityMatchedAlias),
      eligibility_internal_reason: stringValue(item.eligibilityInternalReason),
      eligibility_public_message: stringValue(item.eligibilityPublicMessage),
      frp_order_id: null,
      frp_job_id: null,
      created_at: timestampValue(item.createdAt, nowIso),
      updated_at: timestampValue(item.updatedAt || item.createdAt, nowIso),
      legacy_json: legacyJson(item),
    });
  }

  for (const ticket of tickets) {
    rows.service_tickets.push({
      id: requiredUuid(ticket.id, "tickets.id"),
      code: stringValue(ticket.code),
      client_id: refUuid(ticket.clientId, internalClientIds, warnings, { table: "service_tickets", field: "client_id", id: ticket.id, target: "internal_clients" }),
      master_client_id: refUuid(ticket.masterClientId, masterClientIds, warnings, { table: "service_tickets", field: "master_client_id", id: ticket.id, target: "master_clients" }),
      client_name: stringValue(ticket.clientName),
      country: stringValue(ticket.country),
      service_code: stringValue(ticket.serviceCode),
      service_name: stringValue(ticket.serviceName),
      work_channel: stringValue(ticket.workChannel),
      price_usdt: numberValue(ticket.priceUsdt || ticket.price, 0),
      payment_method: stringValue(ticket.paymentMethod),
      payment_status: stringValue(ticket.paymentStatus),
      operational_status: stringValue(ticket.operationalStatus),
      created_by: actorUuid(ticket.createdBy, userIds, warnings, { table: "service_tickets", field: "created_by", id: ticket.id, target: "operator_users" }),
      last_handled_by: actorUuid(ticket.lastHandledBy, userIds, warnings, { table: "service_tickets", field: "last_handled_by", id: ticket.id, target: "operator_users" }),
      created_at: timestampValue(ticket.createdAt, nowIso),
      updated_at: timestampValue(ticket.updatedAt || ticket.createdAt, nowIso),
      legacy_json: legacyJson(ticket),
    });
  }

  const storedFiles = new Map();
  const addStoredFile = ({ digest, ownerType, ownerId, purpose, file }) => {
    if (!digest || storedFiles.has(digest)) return;
    storedFiles.set(digest, {
      id: uuidFromSeed(`stored-file:${digest}`),
      owner_type: ownerType,
      owner_id: requiredUuid(ownerId, `storedFiles.${ownerType}.ownerId`),
      purpose,
      name: stringValue(file.name),
      content_type: stringValue(file.type || file.contentType),
      size_bytes: integerValue(file.size, 0),
      sha256: digest,
      storage_kind: "legacy_inline",
      storage_key: "",
      legacy_data_url: stringValue(file.dataUrl) || null,
      created_at: timestampValue(file.createdAt, nowIso),
      legacy_json: legacyJson(file),
    });
  };

  const proofs = proofEntries(db);
  let proofMissingHash = 0;
  for (const entry of proofs) {
    const digest = fileDigest(entry.proof);
    if (!digest) {
      proofMissingHash += 1;
      continue;
    }
    addStoredFile({ digest, ownerType: entry.sourceType, ownerId: entry.sourceId, purpose: "payment_proof", file: entry.proof });
  }

  const finalImages = finalImageEntries(db);
  let finalImageMissingHash = 0;
  for (const entry of finalImages) {
    const digest = fileDigest(entry.image);
    if (!digest) {
      finalImageMissingHash += 1;
      continue;
    }
    addStoredFile({ digest, ownerType: "FRP_JOB", ownerId: entry.jobId, purpose: "final_image", file: entry.image });
  }

  if (proofMissingHash) warnings.push({ code: "paymentProofsMissingDigest", count: proofMissingHash });
  if (finalImageMissingHash) warnings.push({ code: "finalImagesMissingDigest", count: finalImageMissingHash });
  rows.stored_files.push(...storedFiles.values());

  for (const entry of proofs) {
    const digest = fileDigest(entry.proof);
    const storedFile = digest ? storedFiles.get(digest) : null;
    rows.payment_proofs.push({
      id: proofRelationId(entry, digest),
      source_type: entry.sourceType,
      source_id: requiredUuid(entry.sourceId, `paymentProofs.${entry.sourceType}.sourceId`),
      stored_file_id: storedFile?.id || null,
      review_status: stringValue(entry.proof?.reviewStatus || entry.proof?.status || "PENDIENTE"),
      uploaded_by: actorUuid(entry.proof?.uploadedBy, userIds, warnings, { table: "payment_proofs", field: "uploaded_by", id: entry.sourceId, target: "operator_users" }),
      uploaded_at: timestampOrNull(entry.proof?.createdAt),
      reviewed_by: actorUuid(entry.proof?.reviewedBy, userIds, warnings, { table: "payment_proofs", field: "reviewed_by", id: entry.sourceId, target: "operator_users" }),
      reviewed_at: timestampOrNull(entry.proof?.reviewedAt),
      rejected_reason: stringValue(entry.proof?.rejectedReason),
      legacy_json: legacyJson(entry.proof || {}),
    });
  }

  for (const order of frpOrders) {
    rows.frp_orders.push({
      id: requiredUuid(order.id, "frpOrders.id"),
      code: stringValue(order.code),
      client_id: refUuid(order.clientId, internalClientIds, warnings, { table: "frp_orders", field: "client_id", id: order.id, target: "internal_clients" }),
      master_client_id: refUuid(order.masterClientId, masterClientIds, warnings, { table: "frp_orders", field: "master_client_id", id: order.id, target: "master_clients" }),
      client_name: stringValue(order.clientName),
      client_whatsapp: stringValue(order.clientWhatsapp),
      country: stringValue(order.country),
      service_code: stringValue(order.serviceCode),
      service_name: stringValue(order.serviceName),
      work_channel: stringValue(order.workChannel),
      quantity: integerValue(order.quantity, 1),
      unit_price_usdt: numberValue(order.unitPrice ?? order.baseUnitPrice, 0),
      total_price_usdt: numberValue(order.totalPrice, 0),
      price_formatted: stringValue(order.priceFormatted),
      pricing_snapshot: jsonb(order.pricingSnapshot || {}),
      payment_method: stringValue(order.paymentMethod),
      payment_label: stringValue(order.paymentLabel),
      payment_status: stringValue(order.paymentStatus),
      order_status: stringValue(order.orderStatus || order.status),
      checklist: jsonb(order.checklist || {}),
      payment_reviewed_by: actorUuid(order.paymentReviewedBy, userIds, warnings, { table: "frp_orders", field: "payment_reviewed_by", id: order.id, target: "operator_users" }),
      payment_reviewed_at: timestampOrNull(order.paymentReviewedAt),
      payment_rejected_reason: stringValue(order.paymentRejectedReason),
      created_by: stringValue(order.createdBy),
      portal_order_id: refUuid(order.portalOrderId, customerOrderIds, warnings, { table: "frp_orders", field: "portal_order_id", id: order.id, target: "customer_orders" }),
      compatibility_review_required: boolValue(order.compatibilityReviewRequired, false),
      source: stringValue(order.source),
      created_at: timestampValue(order.createdAt, nowIso),
      updated_at: timestampValue(order.updatedAt || order.createdAt, nowIso),
      legacy_json: legacyJson(order),
    });
  }

  for (const job of frpJobs) {
    rows.frp_jobs.push({
      id: requiredUuid(job.id, "frpJobs.id"),
      code: stringValue(job.code),
      order_id: refUuid(job.orderId, frpOrderIds, warnings, { table: "frp_jobs", field: "order_id", id: job.id, target: "frp_orders" }),
      sequence: integerValue(job.sequence, 1),
      total_jobs: integerValue(job.totalJobs, 1),
      work_channel: stringValue(job.workChannel),
      service_code: stringValue(job.serviceCode),
      service_name: stringValue(job.serviceName),
      client_name: stringValue(job.clientName),
      country: stringValue(job.country),
      model: stringValue(job.model),
      imei: stringValue(job.imei),
      original_text: stringValue(job.originalText),
      eligibility_status: stringValue(job.eligibilityStatus),
      eligibility_detected_match: stringValue(job.eligibilityDetectedMatch),
      eligibility_matched_alias: stringValue(job.eligibilityMatchedAlias),
      eligibility_internal_reason: stringValue(job.eligibilityInternalReason),
      eligibility_public_message: stringValue(job.eligibilityPublicMessage),
      status: stringValue(job.status),
      checklist: jsonb(job.checklist || {}),
      technician_id: refUuid(job.technicianId, userIds, warnings, { table: "frp_jobs", field: "technician_id", id: job.id, target: "operator_users" }),
      portal_order_item_id: refUuid(job.portalOrderItemId, customerOrderItemIds, warnings, { table: "frp_jobs", field: "portal_order_item_id", id: job.id, target: "customer_order_items" }),
      final_log: stringValue(job.finalLog),
      ard_code: stringValue(job.ardCode),
      review_reason: stringValue(job.reviewReason),
      done_at: timestampOrNull(job.doneAt),
      canceled_at: timestampOrNull(job.canceledAt),
      canceled_by: actorUuid(job.canceledBy, userIds, warnings, { table: "frp_jobs", field: "canceled_by", id: job.id, target: "operator_users" }),
      cancel_reason: stringValue(job.cancelReason),
      created_at: timestampValue(job.createdAt, nowIso),
      updated_at: timestampValue(job.updatedAt || job.createdAt, nowIso),
      legacy_json: legacyJson(job),
    });
  }

  for (const entry of finalImages) {
    const digest = fileDigest(entry.image);
    const storedFile = digest ? storedFiles.get(digest) : null;
    if (!storedFile) continue;
    rows.frp_job_files.push({
      job_id: requiredUuid(entry.jobId, "frpJobFiles.jobId"),
      stored_file_id: storedFile.id,
      purpose: "final_image",
      created_at: timestampValue(entry.image?.createdAt, nowIso),
    });
  }

  if (activeTechnician) {
    const swapInProgress = boolValue(activeTechnician.swapInProgress, false);
    rows.active_technician_state.push({
      id: "current",
      user_id: refUuid(activeTechnician.userId, userIds, warnings, { table: "active_technician_state", field: "user_id", id: "current", target: "operator_users" }),
      swap_in_progress: swapInProgress,
      swap_from_user_id: swapInProgress ? refUuid(activeTechnician.userId, userIds, warnings, { table: "active_technician_state", field: "swap_from_user_id", id: "current", target: "operator_users" }) : null,
      swap_to_user_id: refUuid(activeTechnician.pendingUserId, userIds, warnings, { table: "active_technician_state", field: "swap_to_user_id", id: "current", target: "operator_users" }),
      swap_started_at: timestampOrNull(activeTechnician.switchedAt),
      swap_commits_at: timestampFromMsOrNull(activeTechnician.swapEndsAt),
      auto_revert_to_user_id: refUuid(activeTechnician.autoRevertToUserId, userIds, warnings, { table: "active_technician_state", field: "auto_revert_to_user_id", id: "current", target: "operator_users" }),
      auto_revert_at: timestampFromMsOrNull(activeTechnician.autoRevertAt),
      updated_at: timestampOrNull(activeTechnician.switchedAt) || nowIso,
      legacy_json: legacyJson(activeTechnician),
    });
  }

  for (const entry of paymentLedgerEntries) {
    rows.payment_ledger_entries.push({
      id: requiredUuid(entry.id, "paymentLedgerEntries.id"),
      entry_type: stringValue(entry.entryType),
      source_type: stringValue(entry.sourceType),
      source_id: uuidOrNull(entry.sourceId) || uuidFromSeed(`payment-ledger-source:${entry.id}`),
      source_code: stringValue(entry.sourceCode),
      client_id: uuidOrNull(entry.clientId),
      master_client_id: refUuid(entry.masterClientId, masterClientIds, warnings, { table: "payment_ledger_entries", field: "master_client_id", id: entry.id, target: "master_clients" }),
      client_name: stringValue(entry.clientName),
      country: stringValue(entry.country),
      service_code: stringValue(entry.serviceCode),
      service_name: stringValue(entry.serviceName),
      work_channel: stringValue(entry.workChannel),
      quantity: integerValue(entry.quantity, 1),
      amount: numberValue(entry.amount, 0),
      currency: stringValue(entry.currency || "USDT"),
      payment_method: stringValue(entry.paymentMethod),
      payment_label: stringValue(entry.paymentLabel),
      exchange_rate_to_usdt: numberValue(entry.exchangeRateToUsdt, 1),
      exchange_rate_date: stringValue(entry.exchangeRateDate),
      amount_usdt_estimate: numberValue(entry.amountUsdtEstimate, 0),
      status: enumValue(entry.status, ["VALIDATED", "VOIDED"], "VALIDATED"),
      validated_by: actorUuid(entry.validatedBy, userIds, warnings, { table: "payment_ledger_entries", field: "validated_by", id: entry.id, target: "operator_users" }),
      validated_at: timestampOrNull(entry.validatedAt),
      proof_count: integerValue(entry.proofCount, 0),
      voided_at: timestampOrNull(entry.voidedAt),
      created_at: timestampValue(entry.createdAt, nowIso),
      updated_at: timestampValue(entry.updatedAt || entry.createdAt, nowIso),
      legacy_json: legacyJson(entry),
    });
  }

  for (const close of dailyCloses) {
    rows.daily_closes.push({
      id: requiredUuid(close.id, "dailyCloses.id"),
      date_stamp: stringValue(close.dateStamp || close.date),
      status: enumValue(close.status, ["ABIERTO", "CERRADO"], "ABIERTO"),
      opened_at: timestampOrNull(close.openedAt),
      closed_at: timestampOrNull(close.closedAt),
      closed_by: actorUuid(close.closedBy, userIds, warnings, { table: "daily_closes", field: "closed_by", id: close.id, target: "operator_users" }),
      reopened_at: timestampOrNull(close.reopenedAt),
      reopened_by: actorUuid(close.reopenedBy, userIds, warnings, { table: "daily_closes", field: "reopened_by", id: close.id, target: "operator_users" }),
      reopen_reason: stringValue(close.reopenReason),
      notes: stringValue(close.notes),
      totals: jsonb(close.totals || {}),
      created_at: timestampValue(close.createdAt, nowIso),
      updated_at: timestampOrNull(close.updatedAt),
      legacy_json: legacyJson(close),
    });
  }

  for (const line of dailyCloseLines) {
    rows.daily_close_lines.push({
      id: requiredUuid(line.id, "dailyCloseLines.id"),
      daily_close_id: refUuid(line.dailyCloseId || line.closeId, dailyCloseIds, warnings, { table: "daily_close_lines", field: "daily_close_id", id: line.id, target: "daily_closes" }),
      date_stamp: stringValue(line.dateStamp || line.date),
      type: stringValue(line.type),
      currency: stringValue(line.currency),
      payment_method: stringValue(line.paymentMethod),
      work_channel: stringValue(line.workChannel),
      service_code: stringValue(line.serviceCode),
      gross_amount: numberValue(line.grossAmount, 0),
      refund_amount: numberValue(line.refundAmount, 0),
      adjustment_amount: numberValue(line.adjustmentAmount, 0),
      net_amount: numberValue(line.netAmount, 0),
      payment_count: integerValue(line.paymentCount, 0),
      equipment_count: integerValue(line.equipmentCount, 0),
      created_at: timestampValue(line.createdAt, nowIso),
      legacy_json: legacyJson(line),
    });
  }

  for (const adjustment of dailyAdjustments) {
    rows.daily_adjustments.push({
      id: requiredUuid(adjustment.id, "dailyAdjustments.id"),
      date_stamp: stringValue(adjustment.dateStamp || adjustment.date),
      type: stringValue(adjustment.type),
      status: stringValue(adjustment.status || "ACTIVE"),
      amount: numberValue(adjustment.amount, 0),
      currency: stringValue(adjustment.currency),
      payment_method: stringValue(adjustment.paymentMethod),
      work_channel: stringValue(adjustment.workChannel),
      service_code: stringValue(adjustment.serviceCode),
      reason: stringValue(adjustment.reason),
      created_by: actorUuid(adjustment.createdBy, userIds, warnings, { table: "daily_adjustments", field: "created_by", id: adjustment.id, target: "operator_users" }),
      approved_by: actorUuid(adjustment.approvedBy, userIds, warnings, { table: "daily_adjustments", field: "approved_by", id: adjustment.id, target: "operator_users" }),
      created_at: timestampValue(adjustment.createdAt, nowIso),
      updated_at: timestampOrNull(adjustment.updatedAt),
      legacy_json: legacyJson(adjustment),
    });
  }

  for (const rateLimit of portalRateLimits) {
    rows.portal_rate_limits.push({
      id: uuidOrNull(rateLimit.id) || uuidFromSeed(`portal-rate-limit:${rateLimit.bucket || ""}:${rateLimit.keyHash || ""}:${rateLimit.ipHash || ""}:${rateLimit.createdAt || ""}`),
      bucket: stringValue(rateLimit.bucket),
      ip_hash: stringValue(rateLimit.ipHash),
      key_hash: stringValue(rateLimit.keyHash),
      created_at: timestampValue(rateLimit.createdAt, nowIso),
      legacy_json: legacyJson(rateLimit),
    });
  }

  for (const event of audit) {
    rows.audit_events.push({
      id: requiredUuid(event.id, "audit.id"),
      actor_id: uuidOrNull(event.actorId),
      action: stringValue(event.action),
      target_id: stringValue(event.targetId),
      detail: jsonb(event.detail || {}),
      created_at: timestampValue(event.createdAt, nowIso),
      legacy_json: legacyJson(event),
    });
  }

  for (const order of customerOrders) {
    const orderId = uuidOrNull(order.id);
    if (order.frpOrderId && !frpOrderIds.has(String(order.frpOrderId))) {
      warnings.push({ code: "missingFrpOrderReference", table: "customer_orders", id: order.id });
    }
    if (orderId && order.frpOrderId && frpOrderIds.has(String(order.frpOrderId))) {
      rows.customer_orders.find((row) => row.id === orderId).frp_order_id = String(order.frpOrderId);
    }
  }

  for (const item of customerOrderItems) {
    const itemId = uuidOrNull(item.id);
    const row = rows.customer_order_items.find((candidate) => candidate.id === itemId);
    if (!row) continue;
    if (item.frpOrderId && !frpOrderIds.has(String(item.frpOrderId))) {
      warnings.push({ code: "missingFrpOrderReference", table: "customer_order_items", id: item.id });
    } else if (item.frpOrderId) {
      row.frp_order_id = String(item.frpOrderId);
    }
    if (item.frpJobId && !frpJobIds.has(String(item.frpJobId))) {
      warnings.push({ code: "missingFrpJobReference", table: "customer_order_items", id: item.id });
    } else if (item.frpJobId) {
      row.frp_job_id = String(item.frpJobId);
    }
  }

  rows.migration_runs.push({
    id: uuidFromSeed(`migration-run:${sourceSha256}`),
    source_name: sourceName,
    source_sha256: sourceSha256,
    started_at: nowIso,
    finished_at: nowIso,
    status: "COMPLETED",
    collection_counts: jsonb(collections),
    notes: "users.json import executed by gated transactional importer",
  });

  const tables = Object.fromEntries(targetTables.map((table) => [table, rows[table].length]));
  const duplicatePrimaryKeys = findDuplicatePlannedPrimaryKeys(rows);
  if (duplicatePrimaryKeys.length) {
    warnings.push({
      code: "duplicatePlannedPrimaryKeys",
      count: duplicatePrimaryKeys.length,
      examples: duplicatePrimaryKeys.slice(0, 20),
    });
  }
  const summaryChecks = {
    customerUsersMatch: customerUsers.length === tables.customer_users,
    customerClientsMatch: customerClients.length === tables.customer_clients,
    customerOrdersMatch: customerOrders.length === tables.customer_orders,
    customerOrderItemsMatch: customerOrderItems.length === tables.customer_order_items,
    frpOrdersMatch: frpOrders.length === tables.frp_orders,
    frpJobsMatch: frpJobs.length === tables.frp_jobs,
    ticketsMatch: tickets.length === tables.service_tickets,
    operatorEmailDuplicates,
    customerEmailDuplicates,
    proofMissingHash,
    finalImageMissingHash,
  };

  return { rows, tables, collections, summaryChecks, warnings };
}

function findDuplicatePlannedPrimaryKeys(rows) {
  const primaryKeyColumns = {
    migration_runs: ["id"],
    sequence_counters: ["scope", "bucket", "counter_key"],
    operator_users: ["id"],
    operator_devices: ["id"],
    operator_device_admin_users: ["device_id", "user_id"],
    operator_device_approvals: ["id"],
    operator_sessions: ["id"],
    password_reset_tokens: ["id"],
    password_reset_requests: ["id"],
    master_clients: ["id"],
    customer_clients: ["id"],
    customer_users: ["id"],
    internal_clients: ["id"],
    client_links: ["id"],
    client_link_suggestions: ["id"],
    customer_benefits: ["id"],
    customer_devices: ["id"],
    customer_device_authorizations: ["device_id", "client_id"],
    customer_sessions: ["id"],
    customer_email_verification_tokens: ["id"],
    exchange_rates: ["rate_key"],
    service_pricing_rules: ["service_code"],
    payment_method_overrides: ["code"],
    frp_pricing_policy: ["id"],
    frp_pricing_providers: ["id"],
    frp_provider_cost_history: ["id"],
    frp_pending_cost_changes: ["id"],
    customer_requests: ["id"],
    customer_orders: ["id"],
    customer_order_items: ["id"],
    service_tickets: ["id"],
    stored_files: ["id"],
    payment_proofs: ["id"],
    frp_orders: ["id"],
    frp_jobs: ["id"],
    frp_job_files: ["job_id", "stored_file_id"],
    active_technician_state: ["id"],
    payment_ledger_entries: ["id"],
    daily_closes: ["id"],
    daily_close_lines: ["id"],
    daily_adjustments: ["id"],
    portal_rate_limits: ["id"],
    audit_events: ["id"],
  };
  const duplicates = [];
  for (const [table, columns] of Object.entries(primaryKeyColumns)) {
    const seen = new Map();
    for (const row of rows[table] || []) {
      const key = columns.map((column) => stringValue(row[column])).join("::");
      if (!key || key.split("::").some((part) => !part)) continue;
      const count = (seen.get(key) || 0) + 1;
      seen.set(key, count);
      if (count === 2) duplicates.push({ table, key });
    }
  }
  return duplicates;
}

function reportMismatches(expected, actual) {
  return Object.entries(expected)
    .filter(([table, count]) => Number(actual[table] || 0) !== Number(count))
    .map(([table, expectedCount]) => ({
      table,
      expected: expectedCount,
      actual: Number(actual[table] || 0),
    }));
}

function nonEmptyTables(counts) {
  return Object.entries(counts)
    .filter(([table, count]) => targetTables.includes(table) && Number(count) > 0)
    .map(([table, count]) => ({ table, count: Number(count) }));
}

async function queryTargetCounts(client) {
  const selects = targetTables.map((table) => `(select count(*)::int from ${table}) as ${table}`).join(",\n");
  const result = await client.query(`select ${selects}`);
  return result.rows[0] || {};
}

async function insertRows(client, table, rows) {
  if (!rows.length) return;
  const columns = columnsByTable[table];
  const chunkSize = Math.max(1, Math.floor(10_000 / columns.length));
  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize);
    const values = [];
    const rowSql = chunk.map((row, rowIndex) => {
      const placeholders = columns.map((column, columnIndex) => {
        values.push(row[column]);
        return `$${rowIndex * columns.length + columnIndex + 1}`;
      });
      return `(${placeholders.join(", ")})`;
    });
    await client.query(
      `insert into ${table} (${columns.join(", ")}) values ${rowSql.join(", ")}`,
      values,
    );
  }
}

async function applyImport(client, plan) {
  await client.query("set local search_path = ariad, public");
  for (const table of insertOrder) {
    const insertRowsForTable = table === "customer_orders"
      ? plan.rows[table].map((row) => ({ ...row, frp_order_id: null }))
      : table === "customer_order_items"
        ? plan.rows[table].map((row) => ({ ...row, frp_order_id: null, frp_job_id: null }))
        : plan.rows[table];
    await insertRows(client, table, insertRowsForTable);
  }
  for (const row of plan.rows.customer_orders.filter((order) => order.frp_order_id)) {
    await client.query("update customer_orders set frp_order_id = $1 where id = $2", [row.frp_order_id, row.id]);
  }
  for (const row of plan.rows.customer_order_items.filter((item) => item.frp_order_id || item.frp_job_id)) {
    await client.query(
      "update customer_order_items set frp_order_id = $1, frp_job_id = $2 where id = $3",
      [row.frp_order_id, row.frp_job_id, row.id],
    );
  }
  await insertRows(client, "migration_runs", plan.rows.migration_runs);
  return queryTargetCounts(client);
}

function sanitizeErrorMessage(message) {
  return String(message || "Error")
    .replace(/passwordHash/gi, "credentialDigest")
    .replace(/operatorPinHash/gi, "operatorPinDigest")
    .replace(/tokenHash/gi, "credentialDigest")
    .replace(/dataUrl/gi, "inlineFilePayload")
    .replace(/base64/gi, "encodedPayload")
    .replace(/legacy_data_url/gi, "inlineFilePayload");
}

function ensureReportSafe(report) {
  const text = JSON.stringify(report);
  const pattern = reportBlockPatterns.find((candidate) => candidate.test(text));
  if (pattern) {
    throw new Error(`Reporte bloqueado por patron sensible: ${pattern}`);
  }
}

async function writeReport(reportPath, report) {
  if (!reportPath) return;
  const resolved = path.resolve(reportPath);
  await mkdir(path.dirname(resolved), { recursive: true });
  await writeFile(resolved, `${JSON.stringify(report, null, 2)}\n`);
}

function buildBaseReport(args, inputPath, sourceSha256, plan) {
  return {
    kind: "ariadgsm-postgres-users-json-import",
    generatedAt: new Date().toISOString(),
    sourceName: path.basename(inputPath),
    sourceSha256,
    sanitized: true,
    apply: args.apply,
    allowNonEmpty: args.allowNonEmpty,
    connection: redactedPostgresUrl(),
    collections: plan.collections,
    expectedTables: plan.tables,
    summaryChecks: plan.summaryChecks,
    warnings: plan.warnings,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  activeReportPath = args.report;
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!args.input) throw new Error("Falta --input.");

  const inputPath = path.resolve(args.input);
  const raw = await readFile(inputPath, "utf8");
  const sourceSha256 = sha256(raw);
  const db = JSON.parse(raw);
  const plan = buildImportPlan(db, path.basename(inputPath), sourceSha256);
  const report = buildBaseReport(args, inputPath, sourceSha256, plan);
  activeReport = report;

  if (!hasPostgresConfig()) {
    report.ok = false;
    report.error = "DATABASE_URL no configurado.";
    ensureReportSafe(report);
    await writeReport(args.report, report);
    console.error(JSON.stringify(report, null, 2));
    process.exitCode = 1;
    return;
  }

  if (args.apply && plan.warnings.length) {
    report.ok = false;
    report.error = "Import bloqueado por warnings de integridad.";
    ensureReportSafe(report);
    await writeReport(args.report, report);
    console.error(JSON.stringify(report, null, 2));
    process.exitCode = 2;
    return;
  }

  if (args.apply) {
    const result = await withTransaction(async (client) => {
      await client.query("set local search_path = ariad, public");
      const beforeCounts = await queryTargetCounts(client);
      const nonEmpty = nonEmptyTables(beforeCounts);
      if (nonEmpty.length && !args.allowNonEmpty) {
        return { beforeCounts, nonEmpty, blocked: true };
      }
      const afterCounts = await applyImport(client, plan);
      return { beforeCounts, afterCounts, blocked: false };
    });
    report.currentTables = result.beforeCounts;
    report.targetEmpty = !nonEmptyTables(result.beforeCounts).length;
    report.nonEmptyTables = result.nonEmpty || [];
    if (result.blocked) {
      report.ok = false;
      report.error = "Import bloqueado porque la DB destino no esta vacia.";
      ensureReportSafe(report);
      await writeReport(args.report, report);
      console.error(JSON.stringify(report, null, 2));
      process.exitCode = 2;
      return;
    }
    report.actualTables = result.afterCounts;
    report.mismatches = reportMismatches(plan.tables, result.afterCounts);
    report.ok = !report.mismatches.length;
    if (!report.ok) report.error = "Import aplicado pero los conteos no coinciden.";
  } else {
    const currentTables = await withPostgresClient(async (client) => {
      await client.query("set search_path = ariad, public");
      return queryTargetCounts(client);
    });
    const nonEmpty = nonEmptyTables(currentTables);
    report.currentTables = currentTables;
    report.targetEmpty = !nonEmpty.length;
    report.nonEmptyTables = nonEmpty;
    report.mismatches = [];
    report.wouldWrite = false;
    report.ok = (!nonEmpty.length || args.allowNonEmpty) && !plan.warnings.length;
    if (nonEmpty.length && !args.allowNonEmpty) report.error = "Dry-run bloqueado porque la DB destino no esta vacia.";
    if (plan.warnings.length) report.error = "Dry-run detecto warnings de integridad.";
    if (args.strict && plan.warnings.length) report.ok = false;
  }

  ensureReportSafe(report);
  await writeReport(args.report, report);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 2;
}

main()
  .catch(async (error) => {
    const report = {
      ...(activeReport || {}),
      kind: "ariadgsm-postgres-users-json-import",
      generatedAt: new Date().toISOString(),
      sanitized: true,
      ok: false,
      error: sanitizeErrorMessage(error.message || error),
    };
    ensureReportSafe(report);
    await writeReport(activeReportPath, report).catch(() => {});
    console.error(JSON.stringify(report, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePostgresPool().catch(() => {});
  });
