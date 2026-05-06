import { createJsonStorage } from "./json-storage.js";
import { createPostgresStorage } from "./postgres-storage.js";

export function storageDriverFromEnv(env = process.env) {
  return String(env.ARIAD_STORAGE_DRIVER || "json").trim().toLowerCase() || "json";
}

export function createStorage({ dataDir, defaultDb, env = process.env } = {}) {
  const driver = storageDriverFromEnv(env);
  if (driver === "json") {
    return createJsonStorage({ dataDir, defaultDb });
  }
  if (driver === "postgres") {
    return createPostgresStorage({ env });
  }
  throw new Error(`ARIAD_STORAGE_DRIVER no soportado: ${driver}`);
}
