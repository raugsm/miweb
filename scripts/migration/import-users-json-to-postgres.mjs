#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  closePostgresPool,
  hasPostgresConfig,
  redactedPostgresUrl,
  withPostgresClient,
  withTransaction,
} from "../../server/db/postgres.js";
import {
  applyPostgresImport,
  buildPostgresLegacyPlan,
  ensurePostgresReportSafe,
  nonEmptyPostgresTables,
  queryPostgresTargetCounts,
  reportPostgresCountMismatches,
  sanitizePostgresErrorMessage,
  sha256,
} from "../../server/db/postgres-legacy-plan.js";

let activeReportPath = "";
let activeReport = null;

function parseArgs(argv) {
  const args = {
    apply: false,
    input: path.join("data", "users.json"),
    report: "",
    strict: false,
    allowNonEmpty: false,
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
    } else if (arg === "--allow-non-empty") {
      args.allowNonEmpty = true;
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
    "  --input            Ruta del users.json fuente. Default: data/users.json",
    "  --report           Ruta para escribir reporte JSON sanitizado.",
    "  --apply            Inserta datos. Sin esto solo valida y no escribe.",
    "  --strict           Falla si hay warnings.",
    "  --allow-non-empty  Permite DB destino no vacia para dry-run o apply controlado.",
  ].join("\n");
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
  const plan = buildPostgresLegacyPlan(db, path.basename(inputPath), sourceSha256);
  const report = buildBaseReport(args, inputPath, sourceSha256, plan);
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

  if (args.apply && plan.warnings.length) {
    report.ok = false;
    report.error = "Import bloqueado por warnings de integridad.";
    ensurePostgresReportSafe(report);
    await writeReport(args.report, report);
    console.error(JSON.stringify(report, null, 2));
    process.exitCode = 2;
    return;
  }

  if (args.apply) {
    const result = await withTransaction(async (client) => {
      await client.query("set local search_path = ariad, public");
      const beforeCounts = await queryPostgresTargetCounts(client);
      const nonEmpty = nonEmptyPostgresTables(beforeCounts);
      if (nonEmpty.length && !args.allowNonEmpty) {
        return { beforeCounts, nonEmpty, blocked: true };
      }
      const afterCounts = await applyPostgresImport(client, plan);
      return { beforeCounts, afterCounts, blocked: false };
    });
    report.currentTables = result.beforeCounts;
    report.targetEmpty = !nonEmptyPostgresTables(result.beforeCounts).length;
    report.nonEmptyTables = result.nonEmpty || [];
    if (result.blocked) {
      report.ok = false;
      report.error = "Import bloqueado porque la DB destino no esta vacia.";
      ensurePostgresReportSafe(report);
      await writeReport(args.report, report);
      console.error(JSON.stringify(report, null, 2));
      process.exitCode = 2;
      return;
    }
    report.actualTables = result.afterCounts;
    report.mismatches = reportPostgresCountMismatches(plan.tables, result.afterCounts);
    report.ok = !report.mismatches.length;
    if (!report.ok) report.error = "Import aplicado pero los conteos no coinciden.";
  } else {
    const currentTables = await withPostgresClient(async (client) => {
      await client.query("set search_path = ariad, public");
      return queryPostgresTargetCounts(client);
    });
    const nonEmpty = nonEmptyPostgresTables(currentTables);
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

  ensurePostgresReportSafe(report);
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
      error: sanitizePostgresErrorMessage(error.message || error),
    };
    ensurePostgresReportSafe(report);
    await writeReport(activeReportPath, report);
    console.error(JSON.stringify(report, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePostgresPool().catch(() => {});
  });
