import { checkPostgresConnection, hasPostgresConfig, withTransaction } from "./postgres.js";
import { readPostgresLegacyDb } from "./postgres-legacy-read.js";
import {
  assertPostgresRequiredMigrations,
  buildPostgresLegacyPlan,
  queryPostgresRuntimeCounts,
  replacePostgresLegacyRuntime,
  sanitizePostgresErrorMessage,
} from "./postgres-legacy-plan.js";
import { preserveCurrentAuthRowsBeforeLegacyReplace } from "./postgres-auth.js";

const destructiveGuardTables = [
  "operator_users",
  "master_clients",
  "customer_clients",
  "customer_users",
  "internal_clients",
  "customer_orders",
  "customer_order_items",
  "stored_files",
  "payment_proofs",
  "frp_orders",
  "frp_jobs",
  "active_technician_state",
  "payment_ledger_entries",
  "audit_events",
];

function integrityWarningsError(warnings = []) {
  const error = new Error(`ARIAD_STORAGE_DRIVER=postgres escritura bloqueada por ${warnings.length} warnings de integridad.`);
  error.code = "POSTGRES_RUNTIME_WRITE_WARNINGS";
  error.warningCount = warnings.length;
  return error;
}

function envFlag(value) {
  return ["1", "true", "yes"].includes(String(value || "").trim().toLowerCase());
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function countValue(counts, table) {
  const count = Number(counts?.[table] || 0);
  return Number.isFinite(count) ? count : 0;
}

export function destructiveRuntimeWriteDiff(currentTables = {}, plannedTables = {}) {
  return destructiveGuardTables
    .map((table) => ({
      table,
      current: countValue(currentTables, table),
      planned: countValue(plannedTables, table),
    }))
    .filter((entry) => entry.current > 0 && entry.planned === 0);
}

function destructiveRuntimeWriteError(diffs) {
  const detail = diffs.map((entry) => `${entry.table}:${entry.current}->${entry.planned}`).join(", ");
  const error = new Error(`ARIAD_STORAGE_DRIVER=postgres escritura bloqueada por reemplazo destructivo (${detail}).`);
  error.code = "POSTGRES_RUNTIME_DESTRUCTIVE_WRITE_BLOCKED";
  error.diffs = diffs;
  return error;
}

function isTransientPostgresWriteError(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || error || "").toLowerCase();
  return code === "40P01"
    || code === "40001"
    || code === "55P03"
    || message.includes("deadlock detected")
    || message.includes("could not serialize access")
    || message.includes("lock timeout");
}

export function createPostgresStorage({ env = process.env } = {}) {
  let writeQueue = Promise.resolve();

  async function ensureDb() {
    await checkPostgresConnection();
  }

  async function readDb() {
    return readPostgresLegacyDb();
  }

  async function replaceRuntimeOnce(db) {
    const plan = buildPostgresLegacyPlan(db, "runtime-write", "runtime-write");
    return withTransaction(async (client) => {
      await assertPostgresRequiredMigrations(client);
      // Auth granular writes session/device rows directly in Postgres. While
      // legacy routes still replace runtime snapshots, merge the current auth
      // rows just before truncate so a stale snapshot cannot drop live sessions.
      await preserveCurrentAuthRowsBeforeLegacyReplace(client, plan);
      if (plan.warnings.length) throw integrityWarningsError(plan.warnings);
      if (!envFlag(env.POSTGRES_RUNTIME_ALLOW_DESTRUCTIVE_REPLACE)) {
        await client.query("select pg_advisory_xact_lock(hashtext($1), hashtext($2))", ["ariadgsm", "legacy-runtime-write"]);
        const currentTables = await queryPostgresRuntimeCounts(client, { includeMigrationRuns: false });
        const destructiveDiffs = destructiveRuntimeWriteDiff(currentTables, plan.tables);
        if (destructiveDiffs.length) throw destructiveRuntimeWriteError(destructiveDiffs);
      }
      return replacePostgresLegacyRuntime(client, plan);
    });
  }

  async function writeDbWithRetry(db) {
    const maxAttempts = Number(env.POSTGRES_RUNTIME_WRITE_RETRIES || 3);
    const attempts = Number.isFinite(maxAttempts) && maxAttempts > 0 ? Math.min(Math.floor(maxAttempts), 5) : 3;
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await replaceRuntimeOnce(db);
      } catch (error) {
        lastError = error;
        if (error?.code === "POSTGRES_RUNTIME_WRITE_WARNINGS" || !isTransientPostgresWriteError(error) || attempt >= attempts) {
          throw error;
        }
        await sleep(75 * attempt * attempt);
      }
    }
    throw lastError;
  }

  function writeDb(db) {
    const run = async () => {
      try {
        return await writeDbWithRetry(db);
      } catch (error) {
        if (
          error?.code === "POSTGRES_RUNTIME_WRITE_WARNINGS"
          || error?.code === "POSTGRES_RUNTIME_DESTRUCTIVE_WRITE_BLOCKED"
        ) {
          throw error;
        }
        throw new Error(`ARIAD_STORAGE_DRIVER=postgres escritura fallo: ${sanitizePostgresErrorMessage(error?.message || error)}`);
      }
    };
    const result = writeQueue.then(run, run);
    writeQueue = result.catch(() => {});
    return result;
  }

  async function health() {
    const configured = hasPostgresConfig(env);
    const report = {
      driver: "postgres",
      runtimeImplemented: true,
      phase: "C-write-ready",
      configured,
    };
    if (configured) {
      try {
        report.postgres = await checkPostgresConnection();
        report.ok = true;
      } catch (error) {
        report.ok = false;
        report.error = error?.message || String(error);
      }
    } else {
      report.ok = false;
      report.error = "DATABASE_URL no configurado.";
    }
    return report;
  }

  return {
    driver: "postgres",
    runtimeImplemented: true,
    ensureDb,
    readDb,
    writeDb,
    health,
  };
}
