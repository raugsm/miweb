import { checkPostgresConnection, hasPostgresConfig, withTransaction } from "./postgres.js";
import { readPostgresLegacyDb } from "./postgres-legacy-read.js";
import {
  assertPostgresRequiredMigrations,
  buildPostgresLegacyPlan,
  replacePostgresLegacyRuntime,
  sanitizePostgresErrorMessage,
} from "./postgres-legacy-plan.js";

function integrityWarningsError(warnings = []) {
  const error = new Error(`ARIAD_STORAGE_DRIVER=postgres escritura bloqueada por ${warnings.length} warnings de integridad.`);
  error.code = "POSTGRES_RUNTIME_WRITE_WARNINGS";
  error.warningCount = warnings.length;
  return error;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    if (plan.warnings.length) throw integrityWarningsError(plan.warnings);
    return withTransaction(async (client) => {
      await assertPostgresRequiredMigrations(client);
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
        if (error?.code === "POSTGRES_RUNTIME_WRITE_WARNINGS") throw error;
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
