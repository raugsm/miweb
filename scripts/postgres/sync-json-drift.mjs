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
import { readPostgresLegacyDb } from "../../server/db/postgres-legacy-read.js";

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

const allowedCollectionDiffs = new Set(["customerDevices", "audit"]);

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

function parseArgs(argv) {
  const args = {
    input: path.join("storage", "users.json"),
    report: "",
    apply: false,
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
    "  npm run postgres:sync-drift -- --input /opt/render/project/src/storage/users.json --report /tmp/postgres-sync-drift-plan.json",
    "  npm run postgres:sync-drift:apply -- --input /opt/render/project/src/storage/users.json --report /tmp/postgres-sync-drift-apply.json",
    "",
    "Opciones:",
    "  --input   Ruta al users.json activo. Default: storage/users.json",
    "  --report  Ruta para escribir reporte JSON sanitizado.",
    "  --apply   Inserta solo drift append-only permitido.",
    "  --strict  Sale con codigo 2 si el plan no queda OK.",
  ].join("\n");
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function uuidOrNull(value) {
  const text = String(value || "").trim();
  return uuidPattern.test(text) ? text : null;
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

function sanitizeLegacyJson(value) {
  if (Array.isArray(value)) return value.map((item) => sanitizeLegacyJson(item));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !sensitiveKeys.has(key))
      .map(([key, item]) => [key, sanitizeLegacyJson(item)]),
  );
}

function jsonb(value) {
  return JSON.stringify(value === undefined ? null : value);
}

function legacyJson(value) {
  return jsonb(sanitizeLegacyJson(value || {}));
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
  if (pattern) throw new Error(`Reporte bloqueado por patron sensible: ${pattern}`);
}

async function writeReport(reportPath, report) {
  if (!reportPath) return;
  const resolved = path.resolve(reportPath);
  await mkdir(path.dirname(resolved), { recursive: true });
  await writeFile(resolved, `${JSON.stringify(report, null, 2)}\n`);
}

function ids(rows) {
  return new Set(rows.map((row) => String(row.id || "")).filter(Boolean));
}

async function readExistingIds(client) {
  const deviceResult = await client.query("select id from customer_devices");
  const auditResult = await client.query("select id from audit_events");
  const clientResult = await client.query("select id from customer_clients");
  return {
    customerDevices: ids(deviceResult.rows),
    auditEvents: ids(auditResult.rows),
    customerClients: ids(clientResult.rows),
  };
}

function plannedCustomerDeviceRows(db, existing, warnings) {
  const rows = [];
  const authorizationRows = [];
  for (const device of Array.isArray(db.customerDevices) ? db.customerDevices : []) {
    const id = String(device?.id || "");
    if (!id || existing.customerDevices.has(id)) continue;
    if (!device.tokenHash) {
      warnings.push({ code: "missingCredentialDigest", table: "customer_devices", id });
      continue;
    }
    rows.push({
      id: requiredUuid(id, "customerDevices.id"),
      token_hash: stringValue(device.tokenHash),
      user_agent: stringValue(device.userAgent),
      first_ip_hash: stringValue(device.firstIpHash),
      last_seen_at: timestampFromAny(device, ["lastSeenAt", "lastSeenAtMs"]),
      created_at: timestampValue(device.createdAt, new Date().toISOString()),
      legacy_json: legacyJson(device),
    });
    const authorizedClientIds = Array.isArray(device.authorizedClientIds) ? device.authorizedClientIds : [];
    for (const clientIdValue of authorizedClientIds) {
      const clientId = uuidOrNull(clientIdValue);
      if (!clientId || !existing.customerClients.has(clientId)) {
        warnings.push({ code: "missingCustomerDeviceAuthorizationClient", deviceId: id });
        continue;
      }
      authorizationRows.push({
        device_id: requiredUuid(id, "customerDeviceAuthorizations.deviceId"),
        client_id: clientId,
        authorized_at: timestampValue(device.authorizedAt || device.createdAt, new Date().toISOString()),
      });
    }
  }
  return { rows, authorizationRows };
}

function plannedAuditRows(db, existing) {
  const rows = [];
  for (const event of Array.isArray(db.audit) ? db.audit : []) {
    const id = String(event?.id || "");
    if (!id || existing.auditEvents.has(id)) continue;
    rows.push({
      id: requiredUuid(id, "audit.id"),
      actor_id: uuidOrNull(event.actorId),
      action: stringValue(event.action),
      target_id: stringValue(event.targetId) || null,
      detail: jsonb(event.detail || {}),
      created_at: timestampValue(event.createdAt, new Date().toISOString()),
      legacy_json: legacyJson(event),
    });
  }
  return rows;
}

function publicPlan(rows) {
  return {
    customerDevices: rows.customerDevices.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at || "",
      authorizedClientIds: rows.customerDeviceAuthorizations.filter((item) => item.device_id === row.id).length,
    })),
    auditEvents: rows.auditEvents.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      action: row.action,
      targetPresent: Boolean(row.target_id),
    })),
  };
}

function arrayOf(db, key) {
  return Array.isArray(db?.[key]) ? db[key] : [];
}

function collectionCounts(db) {
  return Object.fromEntries(collectionNames.map((name) => [name, arrayOf(db, name).length]));
}

function unsupportedCollectionMismatches(sourceCounts, postgresCounts) {
  return collectionNames
    .filter((key) => !allowedCollectionDiffs.has(key))
    .filter((key) => Number(sourceCounts[key] || 0) !== Number(postgresCounts[key] || 0))
    .map((key) => ({
      key,
      expected: Number(sourceCounts[key] || 0),
      actual: Number(postgresCounts[key] || 0),
    }));
}

async function insertRows(client, table, columns, rows) {
  if (!rows.length) return;
  const values = [];
  const sqlRows = rows.map((row, rowIndex) => {
    const placeholders = columns.map((column, columnIndex) => {
      values.push(row[column]);
      return `$${rowIndex * columns.length + columnIndex + 1}`;
    });
    return `(${placeholders.join(", ")})`;
  });
  await client.query(`insert into ${table} (${columns.join(", ")}) values ${sqlRows.join(", ")}`, values);
}

async function applyPlan(plan) {
  return withTransaction(async (client) => {
    await client.query("set local search_path = ariad, public");
    await insertRows(
      client,
      "customer_devices",
      ["id", "token_hash", "user_agent", "first_ip_hash", "last_seen_at", "created_at", "legacy_json"],
      plan.rows.customerDevices,
    );
    await insertRows(
      client,
      "customer_device_authorizations",
      ["device_id", "client_id", "authorized_at"],
      plan.rows.customerDeviceAuthorizations,
    );
    await insertRows(
      client,
      "audit_events",
      ["id", "actor_id", "action", "target_id", "detail", "created_at", "legacy_json"],
      plan.rows.auditEvents,
    );
    const counts = await readExistingIds(client);
    return {
      customerDevices: counts.customerDevices.size,
      auditEvents: counts.auditEvents.size,
    };
  });
}

async function buildPlan(db) {
  return withPostgresClient(async (client) => {
    await client.query("set search_path = ariad, public");
    const warnings = [];
    const existing = await readExistingIds(client);
    const devicePlan = plannedCustomerDeviceRows(db, existing, warnings);
    const auditRows = plannedAuditRows(db, existing);
    const rows = {
      customerDevices: devicePlan.rows,
      customerDeviceAuthorizations: devicePlan.authorizationRows,
      auditEvents: auditRows,
    };
    return {
      rows,
      warnings,
      publicPlan: publicPlan(rows),
      wouldWrite: rows.customerDevices.length + rows.customerDeviceAuthorizations.length + rows.auditEvents.length > 0,
      plannedCounts: {
        customerDevices: rows.customerDevices.length,
        customerDeviceAuthorizations: rows.customerDeviceAuthorizations.length,
        auditEvents: rows.auditEvents.length,
      },
    };
  });
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
  const report = {
    kind: "ariadgsm-postgres-json-drift-sync",
    generatedAt: new Date().toISOString(),
    sourceName: path.basename(inputPath),
    sourceSha256,
    sanitized: true,
    apply: args.apply,
    connection: redactedPostgresUrl(),
    allowlist: ["customer_devices", "customer_device_authorizations", "audit_events"],
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

  const plan = await buildPlan(db);
  const sourceCollections = collectionCounts(db);
  const postgresCollections = collectionCounts(await readPostgresLegacyDb());
  report.wouldWrite = plan.wouldWrite;
  report.plannedCounts = plan.plannedCounts;
  report.plannedRows = plan.publicPlan;
  report.warnings = plan.warnings;
  report.sourceCollections = sourceCollections;
  report.postgresCollections = postgresCollections;
  report.unsupportedCollectionMismatches = unsupportedCollectionMismatches(sourceCollections, postgresCollections);

  if (report.unsupportedCollectionMismatches.length) {
    report.ok = false;
    report.error = "Sync bloqueado por drift fuera de allowlist.";
  } else if (plan.warnings.length) {
    report.ok = false;
    report.error = "Sync bloqueado por warnings.";
  } else if (args.apply) {
    report.afterCounts = await applyPlan(plan);
    report.ok = true;
  } else {
    report.ok = true;
  }

  ensureReportSafe(report);
  await writeReport(args.report, report);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok && args.strict) process.exitCode = 2;
}

main()
  .catch(async (error) => {
    const report = {
      kind: "ariadgsm-postgres-json-drift-sync",
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
