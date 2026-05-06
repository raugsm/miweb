import pg from "pg";

const { Pool } = pg;

let pool = null;

function envFlag(value) {
  return ["1", "true", "yes", "require"].includes(String(value || "").trim().toLowerCase());
}

function databaseUrlFromEnv(env = process.env) {
  return String(env.DATABASE_URL || env.POSTGRES_URL || "").trim();
}

function poolMaxFromEnv(env = process.env) {
  const value = Number(env.PG_POOL_MAX || 5);
  return Number.isFinite(value) && value > 0 ? Math.min(Math.floor(value), 20) : 5;
}

function sslConfig(connectionString, env = process.env) {
  const explicit = String(env.DATABASE_SSL || env.PGSSL || "").trim().toLowerCase();
  if (["0", "false", "no", "disable"].includes(explicit)) return false;
  if (envFlag(explicit)) return { rejectUnauthorized: false };
  try {
    const url = new URL(connectionString);
    const sslMode = String(url.searchParams.get("sslmode") || "").toLowerCase();
    if (sslMode === "require" || sslMode === "verify-ca" || sslMode === "verify-full") {
      return { rejectUnauthorized: false };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function hasPostgresConfig(env = process.env) {
  return Boolean(databaseUrlFromEnv(env));
}

export function redactedPostgresUrl(value = databaseUrlFromEnv()) {
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.username) url.username = "user";
    if (url.password) url.password = "redacted";
    return url.toString();
  } catch {
    return "[invalid DATABASE_URL]";
  }
}

export function getPostgresPool() {
  const connectionString = databaseUrlFromEnv();
  if (!connectionString) {
    throw new Error("DATABASE_URL no configurado.");
  }
  if (!pool) {
    pool = new Pool({
      connectionString,
      max: poolMaxFromEnv(),
      ssl: sslConfig(connectionString),
    });
    pool.on("error", (error) => {
      console.error("[postgres] idle client error:", error?.message || error);
    });
  }
  return pool;
}

export async function withPostgresClient(callback) {
  const client = await getPostgresPool().connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

export async function withTransaction(callback) {
  return withPostgresClient(async (client) => {
    await client.query("BEGIN");
    try {
      const result = await callback(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    }
  });
}

export async function checkPostgresConnection() {
  const result = await getPostgresPool().query(`
    select
      current_database() as database_name,
      current_user as user_name,
      current_schema() as schema_name,
      now() as server_time
  `);
  const versionResult = await getPostgresPool().query("show server_version");
  return {
    database: result.rows[0]?.database_name || "",
    user: result.rows[0]?.user_name || "",
    schema: result.rows[0]?.schema_name || "",
    serverTime: result.rows[0]?.server_time || "",
    serverVersion: versionResult.rows[0]?.server_version || "",
  };
}

export async function closePostgresPool() {
  if (!pool) return;
  const current = pool;
  pool = null;
  await current.end();
}
