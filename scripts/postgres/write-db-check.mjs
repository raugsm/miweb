#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  closePostgresPool,
  hasPostgresConfig,
  redactedPostgresUrl,
  withPostgresClient,
} from "../../server/db/postgres.js";
import {
  assertPostgresRequiredMigrations,
  buildPostgresLegacyPlan,
  ensurePostgresReportSafe,
  plannedPostgresTableCounts,
  queryPostgresRuntimeCounts,
  replacePostgresLegacyRuntime,
  reportPostgresCountMismatches,
  sanitizePostgresErrorMessage,
  sha256,
} from "../../server/db/postgres-legacy-plan.js";

let activeReportPath = "";
let activeReport = null;

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
    "  npm run postgres:write-check -- --input /opt/render/project/src/storage/users.json --report /tmp/postgres-write-check.json --strict",
    "",
    "Opciones:",
    "  --input   Ruta del users.json fuente.",
    "  --report  Ruta para escribir reporte JSON sanitizado.",
    "  --strict  Falla si hay warnings de integridad.",
  ].join("\n");
}

async function writeReport(reportPath, report) {
  if (!reportPath) return;
  const resolved = path.resolve(reportPath);
  await mkdir(path.dirname(resolved), { recursive: true });
  await writeFile(resolved, `${JSON.stringify(report, null, 2)}\n`);
}

async function runRollbackWriteCheck(plan) {
  return withPostgresClient(async (client) => {
    await client.query("begin");
    let rolledBack = false;
    let beforeCounts = {};
    try {
      await client.query("set local search_path = ariad, public");
      await assertPostgresRequiredMigrations(client);
      beforeCounts = await queryPostgresRuntimeCounts(client, { includeMigrationRuns: false });
      const writeResult = await replacePostgresLegacyRuntime(client, plan);
      await client.query("rollback");
      rolledBack = true;
      const postRollbackCounts = await queryPostgresRuntimeCounts(client, { includeMigrationRuns: false });
      return {
        beforeCounts,
        expectedTables: writeResult.expectedTables,
        afterWriteCounts: writeResult.actualTables,
        writeMismatches: writeResult.mismatches,
        rolledBack,
        postRollbackCounts,
        rollbackMismatches: reportPostgresCountMismatches(beforeCounts, postRollbackCounts),
      };
    } catch (error) {
      if (!rolledBack) {
        await client.query("rollback").catch(() => {});
        rolledBack = true;
      }
      error.rolledBack = rolledBack;
      error.beforeCounts = beforeCounts;
      throw error;
    }
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
  const plan = buildPostgresLegacyPlan(db, path.basename(inputPath), sourceSha256);
  const expectedTables = plannedPostgresTableCounts(plan, { includeMigrationRuns: false });
  const report = {
    kind: "ariadgsm-postgres-write-rollback-check",
    generatedAt: new Date().toISOString(),
    sourceName: path.basename(inputPath),
    sourceSha256,
    sanitized: true,
    readOnlyAfterRollback: true,
    connection: redactedPostgresUrl(),
    collections: plan.collections,
    expectedTables,
    summaryChecks: plan.summaryChecks,
    warnings: plan.warnings,
  };
  activeReport = report;

  if (!hasPostgresConfig()) {
    report.ok = false;
    report.error = "DATABASE_URL no configurado.";
    ensurePostgresReportSafe(report);
    await writeReport(args.report, report);
    console.error(JSON.stringify(report, null, 2));
    process.exitCode = 1;
    return;
  }

  if (plan.warnings.length && args.strict) {
    report.ok = false;
    report.error = "Write-check bloqueado por warnings de integridad.";
    ensurePostgresReportSafe(report);
    await writeReport(args.report, report);
    console.error(JSON.stringify(report, null, 2));
    process.exitCode = 2;
    return;
  }

  const result = await runRollbackWriteCheck(plan);
  Object.assign(report, result);
  report.ok = report.rolledBack === true
    && report.writeMismatches.length === 0
    && report.rollbackMismatches.length === 0
    && plan.warnings.length === 0;
  if (!report.ok) report.error = "Write-check PostgreSQL no cumplio conteos, rollback o integridad.";

  ensurePostgresReportSafe(report);
  await writeReport(args.report, report);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 2;
}

main()
  .catch(async (error) => {
    const report = {
      ...(activeReport || {}),
      kind: "ariadgsm-postgres-write-rollback-check",
      generatedAt: new Date().toISOString(),
      sanitized: true,
      ok: false,
      error: sanitizePostgresErrorMessage(error.message || error),
    };
    if (typeof error?.rolledBack === "boolean") report.rolledBack = error.rolledBack;
    if (error?.beforeCounts) report.beforeCounts = error.beforeCounts;
    ensurePostgresReportSafe(report);
    await writeReport(activeReportPath, report);
    console.error(JSON.stringify(report, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePostgresPool().catch(() => {});
  });
