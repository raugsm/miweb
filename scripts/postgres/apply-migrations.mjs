#!/usr/bin/env node

import crypto from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  closePostgresPool,
  hasPostgresConfig,
  redactedPostgresUrl,
  withPostgresClient,
} from "../../server/db/postgres.js";

function parseArgs(argv) {
  const args = {
    apply: false,
    migrationsDir: path.join(process.cwd(), "migrations"),
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") {
      args.apply = true;
    } else if (arg === "--migrations-dir") {
      args.migrationsDir = path.resolve(argv[index + 1] || "");
      index += 1;
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
    "  npm run postgres:migrate",
    "  npm run postgres:migrate:apply",
    "",
    "Opciones:",
    "  --apply             Aplica migraciones pendientes. Sin esto solo reporta.",
    "  --migrations-dir    Directorio de archivos .sql. Default: migrations",
  ].join("\n");
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function stripOuterTransaction(sql) {
  return sql
    .replace(/(^|\n)\s*begin\s*;\s*/i, "$1")
    .replace(/\s*commit\s*;\s*$/i, "")
    .trim();
}

async function loadMigrations(migrationsDir) {
  const entries = await readdir(migrationsDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".sql"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
  const migrations = [];
  for (const file of files) {
    const fullPath = path.join(migrationsDir, file);
    const sql = await readFile(fullPath, "utf8");
    migrations.push({
      version: file,
      path: fullPath,
      checksum: sha256(sql),
      sql,
    });
  }
  return migrations;
}

async function ensureSchemaMigrations(client) {
  await client.query("create schema if not exists ariad");
  await client.query(`
    create table if not exists ariad.schema_migrations (
      version text primary key,
      checksum text not null,
      applied_at timestamptz not null default now()
    )
  `);
}

async function appliedMigrations(client) {
  const exists = await client.query("select to_regclass('ariad.schema_migrations') as migration_table");
  if (!exists.rows[0]?.migration_table) return new Map();
  const result = await client.query("select version, checksum, applied_at from ariad.schema_migrations order by version");
  return new Map(result.rows.map((row) => [row.version, row]));
}

async function applyMigration(client, migration) {
  const sql = stripOuterTransaction(migration.sql);
  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query(
      "insert into ariad.schema_migrations(version, checksum) values ($1, $2)",
      [migration.version, migration.checksum],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(usage());
    return;
  }

  const report = {
    kind: "ariadgsm-postgres-migration-gate",
    generatedAt: new Date().toISOString(),
    sanitized: true,
    apply: args.apply,
    connection: redactedPostgresUrl(),
    migrationsDir: args.migrationsDir,
    dryRunWrites: false,
    migrations: [],
  };

  if (!hasPostgresConfig()) {
    report.ok = false;
    report.error = "DATABASE_URL no configurado.";
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = 1;
    return;
  }

  try {
    const migrations = await loadMigrations(args.migrationsDir);
    await withPostgresClient(async (client) => {
      if (args.apply) await ensureSchemaMigrations(client);
      const applied = await appliedMigrations(client);
      for (const migration of migrations) {
        const existing = applied.get(migration.version);
        if (existing && existing.checksum !== migration.checksum) {
          report.migrations.push({
            version: migration.version,
            status: "CHECKSUM_MISMATCH",
          });
          throw new Error(`Checksum distinto para migracion ya aplicada: ${migration.version}`);
        }
        if (existing) {
          report.migrations.push({
            version: migration.version,
            status: "APPLIED",
            checksum: migration.checksum,
            appliedAt: existing.applied_at,
          });
          continue;
        }
        if (args.apply) {
          await applyMigration(client, migration);
        }
        report.migrations.push({
          version: migration.version,
          status: args.apply ? "APPLIED_NOW" : "PENDING",
          checksum: migration.checksum,
        });
      }
    });
    report.ok = true;
  } catch (error) {
    report.ok = false;
    report.error = String(error?.message || error);
    process.exitCode = 1;
  } finally {
    await closePostgresPool().catch(() => {});
    console.log(JSON.stringify(report, null, 2));
  }
}

main().catch(async (error) => {
  await closePostgresPool().catch(() => {});
  console.error(error);
  process.exit(1);
});
