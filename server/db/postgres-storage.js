import { checkPostgresConnection, hasPostgresConfig } from "./postgres.js";
import { readPostgresLegacyDb } from "./postgres-legacy-read.js";

function notImplementedError() {
  return new Error("ARIAD_STORAGE_DRIVER=postgres todavia no tiene escritura runtime implementada en Fase B.");
}

export function createPostgresStorage({ env = process.env } = {}) {
  async function ensureDb() {
    await checkPostgresConnection();
  }

  async function readDb() {
    return readPostgresLegacyDb();
  }

  async function writeDb() {
    throw notImplementedError();
  }

  async function health() {
    const configured = hasPostgresConfig(env);
    const report = {
      driver: "postgres",
      runtimeImplemented: false,
      phase: "B-read-only",
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
    runtimeImplemented: false,
    ensureDb,
    readDb,
    writeDb,
    health,
  };
}
