#!/usr/bin/env node

import crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  closePostgresPool,
  hasPostgresConfig,
  redactedPostgresUrl,
} from "../../server/db/postgres.js";
import {
  readPostgresLegacyDb,
  readPostgresTableCounts,
} from "../../server/db/postgres-legacy-read.js";

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

const reportBlockPatterns = [
  /passwordHash/i,
  /operatorPinHash/i,
  /tokenHash/i,
  /dataUrl/i,
  /base64/i,
  /legacy_data_url/i,
];

let activeReportPath = "";

function parseArgs(argv) {
  const args = {
    input: "",
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
    "  npm run postgres:read-check -- --report /tmp/postgres-read-check.json",
    "  npm run postgres:read-check -- --input /tmp/postgres-import-source-users.json --report /tmp/postgres-read-check.json --strict",
    "",
    "Opciones:",
    "  --input   Snapshot users.json contra el cual comparar conteos. Opcional.",
    "  --report  Ruta para escribir reporte JSON sanitizado.",
    "  --strict  Sale con codigo 2 si hay diferencias contra --input.",
  ].join("\n");
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function arrayOf(db, key) {
  return Array.isArray(db?.[key]) ? db[key] : [];
}

function objectOf(db, key) {
  return db?.[key] && typeof db[key] === "object" && !Array.isArray(db[key]) ? db[key] : {};
}

function duplicateCount(rows, getKey) {
  const counts = new Map();
  let duplicates = 0;
  for (const row of rows) {
    const key = String(getKey(row) || "").trim().toLowerCase();
    if (!key) continue;
    const count = (counts.get(key) || 0) + 1;
    counts.set(key, count);
    if (count > 1) duplicates += 1;
  }
  return duplicates;
}

function paymentProofEntries(db) {
  const entries = [];
  for (const collection of [arrayOf(db, "customerOrders"), arrayOf(db, "frpOrders"), arrayOf(db, "tickets")]) {
    for (const owner of collection) {
      for (const proof of Array.isArray(owner.paymentProofs) ? owner.paymentProofs : []) {
        entries.push(proof);
      }
    }
  }
  return entries;
}

function finalImageEntries(db) {
  const entries = [];
  for (const job of arrayOf(db, "frpJobs")) {
    for (const image of Array.isArray(job.finalImages) ? job.finalImages : []) {
      entries.push(image);
    }
  }
  return entries;
}

function digestOf(value) {
  return String(value?.hash || value?.sha256 || "").trim();
}

function inlinePayloadCount(rows) {
  return rows.filter((row) => typeof row?.dataUrl === "string" && row.dataUrl).length;
}

function tableProjection(db) {
  const pricingConfig = objectOf(db, "pricingConfig");
  const frpPricing = objectOf(pricingConfig, "frpPricing");
  const fileDigests = new Set();
  const proofs = paymentProofEntries(db);
  const finalImages = finalImageEntries(db);
  for (const proof of proofs) {
    const digest = digestOf(proof);
    if (digest) fileDigests.add(digest);
  }
  for (const image of finalImages) {
    const digest = digestOf(image);
    if (digest) fileDigests.add(digest);
  }
  return {
    operator_users: arrayOf(db, "users").length,
    operator_devices: arrayOf(db, "devices").length,
    operator_device_approvals: arrayOf(db, "deviceApprovals").length,
    operator_sessions: arrayOf(db, "sessions").length,
    password_reset_tokens: arrayOf(db, "passwordResetTokens").length,
    password_reset_requests: arrayOf(db, "passwordResetRequests").length,
    master_clients: arrayOf(db, "masterClients").length,
    customer_clients: arrayOf(db, "customerClients").length,
    customer_users: arrayOf(db, "customerUsers").length,
    internal_clients: arrayOf(db, "clients").length,
    client_links: arrayOf(db, "clientLinks").length,
    client_link_suggestions: arrayOf(db, "clientLinkSuggestions").length,
    customer_benefits: arrayOf(db, "customerBenefits").length,
    customer_devices: arrayOf(db, "customerDevices").length,
    customer_sessions: arrayOf(db, "customerSessions").length,
    customer_email_verification_tokens: arrayOf(db, "customerEmailVerificationTokens").length,
    exchange_rates: Array.isArray(pricingConfig.exchangeRates) ? pricingConfig.exchangeRates.length : 0,
    service_pricing_rules: Array.isArray(pricingConfig.serviceRules) ? pricingConfig.serviceRules.length : 0,
    payment_method_overrides: Array.isArray(pricingConfig.paymentMethodOverrides) ? pricingConfig.paymentMethodOverrides.length : 0,
    frp_pricing_providers: Array.isArray(frpPricing.providers) ? frpPricing.providers.length : 0,
    frp_provider_cost_history: arrayOf(db, "frpProviderCostHistory").length,
    frp_pending_cost_changes: arrayOf(db, "frpPendingCostChanges").length,
    customer_requests: arrayOf(db, "customerRequests").length,
    customer_orders: arrayOf(db, "customerOrders").length,
    customer_order_items: arrayOf(db, "customerOrderItems").length,
    service_tickets: arrayOf(db, "tickets").length,
    stored_files: fileDigests.size,
    payment_proofs: proofs.length,
    frp_orders: arrayOf(db, "frpOrders").length,
    frp_jobs: arrayOf(db, "frpJobs").length,
    frp_job_files: finalImages.length,
    active_technician_state: db.activeTechnician ? 1 : 0,
    payment_ledger_entries: arrayOf(db, "paymentLedgerEntries").length,
    daily_closes: arrayOf(db, "dailyCloses").length,
    daily_close_lines: arrayOf(db, "dailyCloseLines").length,
    daily_adjustments: arrayOf(db, "dailyAdjustments").length,
    portal_rate_limits: arrayOf(db, "portalRateLimits").length,
    audit_events: arrayOf(db, "audit").length,
  };
}

function summarizeDb(db) {
  const proofs = paymentProofEntries(db);
  const finalImages = finalImageEntries(db);
  const collections = Object.fromEntries(collectionNames.map((name) => [name, arrayOf(db, name).length]));
  const projectionTables = tableProjection(db);
  return {
    collections,
    projectionTables,
    summaryChecks: {
      customerUsersMatch: collections.customerUsers === projectionTables.customer_users,
      customerClientsMatch: collections.customerClients === projectionTables.customer_clients,
      customerOrdersMatch: collections.customerOrders === projectionTables.customer_orders,
      customerOrderItemsMatch: collections.customerOrderItems === projectionTables.customer_order_items,
      frpOrdersMatch: collections.frpOrders === projectionTables.frp_orders,
      frpJobsMatch: collections.frpJobs === projectionTables.frp_jobs,
      ticketsMatch: collections.tickets === projectionTables.service_tickets,
      operatorEmailDuplicates: duplicateCount(arrayOf(db, "users"), (user) => user.email),
      customerEmailDuplicates: duplicateCount(arrayOf(db, "customerUsers"), (user) => user.email),
      proofMissingDigest: proofs.filter((proof) => !digestOf(proof)).length,
      finalImageMissingDigest: finalImages.filter((image) => !digestOf(image)).length,
      proofInlinePayloads: inlinePayloadCount(proofs),
      finalImageInlinePayloads: inlinePayloadCount(finalImages),
    },
  };
}

function compareCounts(expected, actual) {
  return Object.entries(expected)
    .filter(([key, expectedCount]) => Number(actual[key] || 0) !== Number(expectedCount || 0))
    .map(([key, expectedCount]) => ({
      key,
      expected: Number(expectedCount || 0),
      actual: Number(actual[key] || 0),
    }));
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

async function loadSourceSummary(input) {
  if (!input) return null;
  const inputPath = path.resolve(input);
  const raw = await readFile(inputPath, "utf8");
  const db = JSON.parse(raw);
  return {
    sourceName: path.basename(inputPath),
    sourceSha256: sha256(raw),
    ...summarizeDb(db),
  };
}

async function main() {
  const args = parseArgs(process.argv);
  activeReportPath = args.report;
  if (args.help) {
    console.log(usage());
    return;
  }

  const report = {
    kind: "ariadgsm-postgres-read-compat-check",
    generatedAt: new Date().toISOString(),
    sanitized: true,
    readOnly: true,
    connection: redactedPostgresUrl(),
  };

  if (!hasPostgresConfig()) {
    report.ok = false;
    report.error = "DATABASE_URL no configurado.";
    ensureReportSafe(report);
    await writeReport(args.report, report);
    console.error(JSON.stringify(report, null, 2));
    process.exitCode = 1;
    return;
  }

  const [sourceSummary, postgresDb, tableCounts] = await Promise.all([
    loadSourceSummary(args.input),
    readPostgresLegacyDb(),
    readPostgresTableCounts(),
  ]);
  const postgresSummary = summarizeDb(postgresDb);
  report.postgres = {
    collections: postgresSummary.collections,
    projectionTables: postgresSummary.projectionTables,
    actualTables: tableCounts,
    summaryChecks: postgresSummary.summaryChecks,
  };
  report.tableProjectionMismatches = compareCounts(postgresSummary.projectionTables, tableCounts)
    .filter((item) => item.key !== "migration_runs" && item.key !== "sequence_counters");

  if (sourceSummary) {
    report.source = {
      sourceName: sourceSummary.sourceName,
      sourceSha256: sourceSummary.sourceSha256,
      collections: sourceSummary.collections,
      projectionTables: sourceSummary.projectionTables,
      summaryChecks: sourceSummary.summaryChecks,
    };
    report.sourceComparison = {
      collectionMismatches: compareCounts(sourceSummary.collections, postgresSummary.collections),
      projectionMismatches: compareCounts(sourceSummary.projectionTables, postgresSummary.projectionTables),
    };
  }

  const sourceMismatchCount = report.sourceComparison
    ? report.sourceComparison.collectionMismatches.length + report.sourceComparison.projectionMismatches.length
    : 0;
  report.ok = !report.tableProjectionMismatches.length && sourceMismatchCount === 0;
  if (!report.ok) report.error = "Lectura PostgreSQL reconstruida con diferencias.";

  ensureReportSafe(report);
  await writeReport(args.report, report);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok && args.strict) process.exitCode = 2;
}

main()
  .catch(async (error) => {
    const report = {
      kind: "ariadgsm-postgres-read-compat-check",
      generatedAt: new Date().toISOString(),
      sanitized: true,
      readOnly: true,
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
