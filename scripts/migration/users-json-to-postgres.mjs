#!/usr/bin/env node

import crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

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

const sensitiveReportPatterns = [
  /"passwordHash"\s*:/i,
  /"operatorPinHash"\s*:/i,
  /"tokenHash"\s*:/i,
  /"legacy_data_url"\s*:/i,
  /"dataUrl"\s*:/i,
  /"base64"\s*:/i,
];

function parseArgs(argv) {
  const args = {
    input: path.join("data", "users.json"),
    report: "",
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
    "  node scripts/migration/users-json-to-postgres.mjs --input data/users.json --report .local-preview-data/postgres-dry-run-report.json",
    "",
    "Opciones:",
    "  --input   Ruta al users.json o copia local. Default: data/users.json",
    "  --report  Ruta para escribir reporte JSON sanitizado.",
    "  --strict  Sale con codigo 2 si hay warnings.",
  ].join("\n");
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
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
  return new Set(rows.map((row) => String(row?.id || "")).filter(Boolean));
}

function countBy(rows, getKey) {
  const counts = new Map();
  for (const row of rows) {
    const key = String(getKey(row) || "").trim().toLowerCase();
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function duplicateCount(rows, getKey) {
  let duplicates = 0;
  for (const count of countBy(rows, getKey).values()) {
    if (count > 1) duplicates += count - 1;
  }
  return duplicates;
}

function safeHash(value) {
  return value ? sha256(String(value).trim().toLowerCase()).slice(0, 16) : "";
}

function warnMissingRelation(warnings, code, collection, id, targetCollection, targetId) {
  warnings.push({
    code,
    collection,
    id: String(id || ""),
    targetCollection,
    targetId: String(targetId || ""),
  });
}

function proofEntries(db) {
  const entries = [];
  const pushProofs = (sourceType, sourceId, proofs = []) => {
    if (!Array.isArray(proofs)) return;
    for (const proof of proofs) {
      entries.push({ sourceType, sourceId: String(sourceId || ""), proof });
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
    for (const image of job.finalImages) {
      entries.push({ jobId: String(job.id || ""), image });
    }
  }
  return entries;
}

function fileKeyFromProof(proof) {
  return String(proof?.hash || proof?.sha256 || "").trim();
}

function fileKeyFromImage(image) {
  return String(image?.hash || image?.sha256 || "").trim();
}

function buildDryRunReport(db, sourceName, sourceSha256) {
  const warnings = [];
  const collections = Object.fromEntries(collectionNames.map((name) => [name, arrayOf(db, name, warnings).length]));
  const pricingConfig = objectOf(db, "pricingConfig", warnings);
  const activeTechnician = db.activeTechnician && typeof db.activeTechnician === "object" ? db.activeTechnician : null;

  const users = arrayOf(db, "users", warnings);
  const sessions = arrayOf(db, "sessions", warnings);
  const devices = arrayOf(db, "devices", warnings);
  const deviceApprovals = arrayOf(db, "deviceApprovals", warnings);
  const customerClients = arrayOf(db, "customerClients", warnings);
  const customerUsers = arrayOf(db, "customerUsers", warnings);
  const customerSessions = arrayOf(db, "customerSessions", warnings);
  const customerDevices = arrayOf(db, "customerDevices", warnings);
  const customerRequests = arrayOf(db, "customerRequests", warnings);
  const customerOrders = arrayOf(db, "customerOrders", warnings);
  const customerOrderItems = arrayOf(db, "customerOrderItems", warnings);
  const customerBenefits = arrayOf(db, "customerBenefits", warnings);
  const customerEmailVerificationTokens = arrayOf(db, "customerEmailVerificationTokens", warnings);
  const masterClients = arrayOf(db, "masterClients", warnings);
  const clientLinks = arrayOf(db, "clientLinks", warnings);
  const clientLinkSuggestions = arrayOf(db, "clientLinkSuggestions", warnings);
  const paymentLedgerEntries = arrayOf(db, "paymentLedgerEntries", warnings);
  const dailyCloses = arrayOf(db, "dailyCloses", warnings);
  const dailyCloseLines = arrayOf(db, "dailyCloseLines", warnings);
  const dailyAdjustments = arrayOf(db, "dailyAdjustments", warnings);
  const portalRateLimits = arrayOf(db, "portalRateLimits", warnings);
  const clients = arrayOf(db, "clients", warnings);
  const tickets = arrayOf(db, "tickets", warnings);
  const frpOrders = arrayOf(db, "frpOrders", warnings);
  const frpJobs = arrayOf(db, "frpJobs", warnings);
  const frpProviderCostHistory = arrayOf(db, "frpProviderCostHistory", warnings);
  const frpPendingCostChanges = arrayOf(db, "frpPendingCostChanges", warnings);
  const passwordResetTokens = arrayOf(db, "passwordResetTokens", warnings);
  const passwordResetRequests = arrayOf(db, "passwordResetRequests", warnings);
  const audit = arrayOf(db, "audit", warnings);

  const userIds = idSet(users);
  const operatorDeviceIds = idSet(devices);
  const customerClientIds = idSet(customerClients);
  const customerUserIds = idSet(customerUsers);
  const customerDeviceIds = idSet(customerDevices);
  const customerRequestIds = idSet(customerRequests);
  const customerOrderIds = idSet(customerOrders);
  const customerOrderItemIds = idSet(customerOrderItems);
  const masterClientIds = idSet(masterClients);
  const internalClientIds = idSet(clients);
  const frpOrderIds = idSet(frpOrders);
  const frpJobIds = idSet(frpJobs);

  const operatorEmailDuplicates = duplicateCount(users, (user) => user.email);
  if (operatorEmailDuplicates) warnings.push({ code: "duplicateOperatorEmails", count: operatorEmailDuplicates });

  const customerEmailDuplicates = duplicateCount(customerUsers, (user) => user.email);
  if (customerEmailDuplicates) warnings.push({ code: "duplicateCustomerEmails", count: customerEmailDuplicates });

  for (const user of customerUsers) {
    if (user.clientId && !customerClientIds.has(String(user.clientId))) {
      warnMissingRelation(warnings, "missingCustomerUserClient", "customerUsers", user.id, "customerClients", user.clientId);
    }
  }

  for (const session of sessions) {
    if (session.userId && !userIds.has(String(session.userId))) {
      warnMissingRelation(warnings, "missingOperatorSessionUser", "sessions", session.id, "users", session.userId);
    }
    if (session.deviceId && !operatorDeviceIds.has(String(session.deviceId))) {
      warnMissingRelation(warnings, "missingOperatorSessionDevice", "sessions", session.id, "devices", session.deviceId);
    }
  }

  for (const session of customerSessions) {
    if (session.userId && !customerUserIds.has(String(session.userId))) {
      warnMissingRelation(warnings, "missingCustomerSessionUser", "customerSessions", session.id, "customerUsers", session.userId);
    }
    if (session.clientId && !customerClientIds.has(String(session.clientId))) {
      warnMissingRelation(warnings, "missingCustomerSessionClient", "customerSessions", session.id, "customerClients", session.clientId);
    }
    if (session.deviceId && !customerDeviceIds.has(String(session.deviceId))) {
      warnMissingRelation(warnings, "missingCustomerSessionDevice", "customerSessions", session.id, "customerDevices", session.deviceId);
    }
  }

  for (const order of customerOrders) {
    if (order.clientId && !customerClientIds.has(String(order.clientId))) {
      warnMissingRelation(warnings, "missingCustomerOrderClient", "customerOrders", order.id, "customerClients", order.clientId);
    }
    if (order.requestId && !customerRequestIds.has(String(order.requestId))) {
      warnMissingRelation(warnings, "missingCustomerOrderRequest", "customerOrders", order.id, "customerRequests", order.requestId);
    }
    if (order.frpOrderId && !frpOrderIds.has(String(order.frpOrderId))) {
      warnMissingRelation(warnings, "missingCustomerOrderFrpOrder", "customerOrders", order.id, "frpOrders", order.frpOrderId);
    }
  }

  for (const item of customerOrderItems) {
    if (item.orderId && !customerOrderIds.has(String(item.orderId))) {
      warnMissingRelation(warnings, "missingCustomerOrderItemOrder", "customerOrderItems", item.id, "customerOrders", item.orderId);
    }
    if (item.frpOrderId && !frpOrderIds.has(String(item.frpOrderId))) {
      warnMissingRelation(warnings, "missingCustomerOrderItemFrpOrder", "customerOrderItems", item.id, "frpOrders", item.frpOrderId);
    }
    if (item.frpJobId && !frpJobIds.has(String(item.frpJobId))) {
      warnMissingRelation(warnings, "missingCustomerOrderItemFrpJob", "customerOrderItems", item.id, "frpJobs", item.frpJobId);
    }
  }

  for (const order of frpOrders) {
    if (order.clientId && !internalClientIds.has(String(order.clientId))) {
      warnMissingRelation(warnings, "missingFrpOrderInternalClient", "frpOrders", order.id, "clients", order.clientId);
    }
    if (order.portalOrderId && !customerOrderIds.has(String(order.portalOrderId))) {
      warnMissingRelation(warnings, "missingFrpOrderPortalOrder", "frpOrders", order.id, "customerOrders", order.portalOrderId);
    }
  }

  for (const job of frpJobs) {
    if (job.orderId && !frpOrderIds.has(String(job.orderId))) {
      warnMissingRelation(warnings, "missingFrpJobOrder", "frpJobs", job.id, "frpOrders", job.orderId);
    }
    if (job.portalOrderItemId && !customerOrderItemIds.has(String(job.portalOrderItemId))) {
      warnMissingRelation(warnings, "missingFrpJobPortalItem", "frpJobs", job.id, "customerOrderItems", job.portalOrderItemId);
    }
  }

  for (const link of clientLinks) {
    if (link.masterClientId && !masterClientIds.has(String(link.masterClientId))) {
      warnMissingRelation(warnings, "missingClientLinkMaster", "clientLinks", link.id, "masterClients", link.masterClientId);
    }
  }

  const tokenRows = [...customerEmailVerificationTokens, ...passwordResetTokens];
  const missingTokenHashes = tokenRows.filter((row) => !row.tokenHash).length;
  if (missingTokenHashes) warnings.push({ code: "rowsMissingTokenHash", count: missingTokenHashes });

  const missingTokenExpiry = tokenRows.filter((row) => !row.expiresAt).length;
  if (missingTokenExpiry) warnings.push({ code: "rowsMissingTokenExpiry", count: missingTokenExpiry });

  const leakedRawTokenFields = tokenRows.filter((row) => Object.hasOwn(row, "token") || Object.hasOwn(row, "rawToken")).length;
  if (leakedRawTokenFields) warnings.push({ code: "rawTokenFieldPresent", count: leakedRawTokenFields });

  const proofs = proofEntries(db);
  const finalImages = finalImageEntries(db);
  const fileHashes = new Set();
  let proofMissingHash = 0;
  for (const entry of proofs) {
    const key = fileKeyFromProof(entry.proof);
    if (key) fileHashes.add(key);
    else proofMissingHash += 1;
  }
  let finalImageMissingHash = 0;
  for (const entry of finalImages) {
    const key = fileKeyFromImage(entry.image);
    if (key) fileHashes.add(key);
    else finalImageMissingHash += 1;
  }
  if (proofMissingHash) warnings.push({ code: "paymentProofsMissingHash", count: proofMissingHash });
  if (finalImageMissingHash) warnings.push({ code: "finalImagesMissingHash", count: finalImageMissingHash });

  const exchangeRates = Array.isArray(pricingConfig.exchangeRates) ? pricingConfig.exchangeRates : [];
  const serviceRules = Array.isArray(pricingConfig.serviceRules) ? pricingConfig.serviceRules : [];
  const paymentMethodOverrides = Array.isArray(pricingConfig.paymentMethodOverrides) ? pricingConfig.paymentMethodOverrides : [];
  const frpPricing = pricingConfig.frpPricing && typeof pricingConfig.frpPricing === "object" ? pricingConfig.frpPricing : {};
  const frpProviders = Array.isArray(frpPricing.providers) ? frpPricing.providers : [];

  const sequenceCounters = Object.entries({
    customerCounters: db.customerCounters,
    ticketCounters: db.ticketCounters,
    frpCounters: db.frpCounters,
  }).reduce((sum, [, value]) => sum + countCounterLeaves(value), 0);

  const tables = {
    migration_runs: 1,
    sequence_counters: sequenceCounters,
    operator_users: users.length,
    operator_devices: devices.length,
    operator_device_admin_users: devices.reduce((sum, device) => sum + (Array.isArray(device.adminUserIds) ? device.adminUserIds.length : 0), 0),
    operator_device_approvals: deviceApprovals.length,
    operator_sessions: sessions.length,
    password_reset_tokens: passwordResetTokens.length,
    password_reset_requests: passwordResetRequests.length,
    master_clients: masterClients.length,
    customer_clients: customerClients.length,
    customer_users: customerUsers.length,
    internal_clients: clients.length,
    client_links: clientLinks.length,
    client_link_suggestions: clientLinkSuggestions.length,
    customer_benefits: customerBenefits.length,
    customer_devices: customerDevices.length,
    customer_device_authorizations: customerDevices.reduce((sum, device) => sum + (Array.isArray(device.authorizedClientIds) ? device.authorizedClientIds.length : 0), 0),
    customer_sessions: customerSessions.length,
    customer_email_verification_tokens: customerEmailVerificationTokens.length,
    exchange_rates: exchangeRates.length,
    service_pricing_rules: serviceRules.length,
    payment_method_overrides: paymentMethodOverrides.length,
    frp_pricing_policy: 1,
    frp_pricing_providers: frpProviders.length,
    frp_provider_cost_history: frpProviderCostHistory.length,
    frp_pending_cost_changes: frpPendingCostChanges.length,
    customer_requests: customerRequests.length,
    customer_orders: customerOrders.length,
    customer_order_items: customerOrderItems.length,
    service_tickets: tickets.length,
    stored_files: fileHashes.size,
    payment_proofs: proofs.length,
    frp_orders: frpOrders.length,
    frp_jobs: frpJobs.length,
    frp_job_files: finalImages.length,
    active_technician_state: activeTechnician ? 1 : 0,
    payment_ledger_entries: paymentLedgerEntries.length,
    daily_closes: dailyCloses.length,
    daily_close_lines: dailyCloseLines.length,
    daily_adjustments: dailyAdjustments.length,
    portal_rate_limits: portalRateLimits.length,
    audit_events: audit.length,
  };

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

  const report = {
    kind: "ariadgsm-postgres-migration-dry-run",
    generatedAt: new Date().toISOString(),
    sourceName,
    sourceSha256,
    sanitized: true,
    collections,
    tables,
    summaryChecks,
    warnings,
  };

  const reportText = JSON.stringify(report);
  const unsafePattern = sensitiveReportPatterns.find((pattern) => pattern.test(reportText));
  if (unsafePattern) {
    throw new Error(`El reporte contiene un patron sensible no permitido: ${unsafePattern}`);
  }

  return report;
}

function countCounterLeaves(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return 0;
  let count = 0;
  for (const item of Object.values(value)) {
    if (item && typeof item === "object" && !Array.isArray(item)) count += countCounterLeaves(item);
    else count += 1;
  }
  return count;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!args.input) throw new Error("Falta --input.");

  const inputPath = path.resolve(args.input);
  const raw = await readFile(inputPath, "utf8");
  const sourceSha256 = sha256(raw);
  let db;
  try {
    db = JSON.parse(raw);
  } catch (error) {
    const parseReport = {
      kind: "ariadgsm-postgres-migration-dry-run",
      generatedAt: new Date().toISOString(),
      sourceName: path.basename(inputPath),
      sourceSha256,
      sanitized: true,
      parseOk: false,
      error: String(error.message || "JSON parse error"),
    };
    if (args.report) {
      const reportPath = path.resolve(args.report);
      await mkdir(path.dirname(reportPath), { recursive: true });
      await writeFile(reportPath, `${JSON.stringify(parseReport, null, 2)}\n`);
    }
    console.error(JSON.stringify(parseReport, null, 2));
    process.exitCode = 1;
    return;
  }

  const report = buildDryRunReport(db, path.basename(inputPath), sourceSha256);
  const output = `${JSON.stringify(report, null, 2)}\n`;
  if (args.report) {
    const reportPath = path.resolve(args.report);
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, output);
  }
  console.log(output);
  if (args.strict && report.warnings.length) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
