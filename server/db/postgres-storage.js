import { checkPostgresConnection, hasPostgresConfig } from "./postgres.js";

function notImplementedError() {
  return new Error("ARIAD_STORAGE_DRIVER=postgres no esta implementado para runtime en Fase A.");
}

export function createPostgresStorage({ env = process.env } = {}) {
  async function ensureDb() {
    throw notImplementedError();
  }

  async function readDb() {
    throw notImplementedError();
  }

  async function writeDb() {
    throw notImplementedError();
  }

  async function health() {
    const configured = hasPostgresConfig(env);
    const report = {
      driver: "postgres",
      runtimeImplemented: false,
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
