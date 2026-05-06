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

export function createPostgresStorage({ env = process.env } = {}) {
  async function ensureDb() {
    await checkPostgresConnection();
  }

  async function readDb() {
    return readPostgresLegacyDb();
  }

  async function writeDb(db) {
    try {
      const plan = buildPostgresLegacyPlan(db, "runtime-write", "runtime-write");
      if (plan.warnings.length) throw integrityWarningsError(plan.warnings);
      return await withTransaction(async (client) => {
        await assertPostgresRequiredMigrations(client);
        return replacePostgresLegacyRuntime(client, plan);
      });
    } catch (error) {
      if (error?.code === "POSTGRES_RUNTIME_WRITE_WARNINGS") throw error;
      throw new Error(`ARIAD_STORAGE_DRIVER=postgres escritura fallo: ${sanitizePostgresErrorMessage(error?.message || error)}`);
    }
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
