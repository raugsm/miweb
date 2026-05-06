#!/usr/bin/env node

import {
  checkPostgresConnection,
  closePostgresPool,
  hasPostgresConfig,
  redactedPostgresUrl,
} from "../../server/db/postgres.js";

const report = {
  kind: "ariadgsm-postgres-connection-check",
  generatedAt: new Date().toISOString(),
  sanitized: true,
  connection: redactedPostgresUrl(),
};

try {
  if (!hasPostgresConfig()) {
    throw new Error("DATABASE_URL no configurado.");
  }
  report.ok = true;
  report.postgres = await checkPostgresConnection();
} catch (error) {
  report.ok = false;
  report.error = String(error?.message || error);
  process.exitCode = 1;
} finally {
  await closePostgresPool().catch(() => {});
  console.log(JSON.stringify(report, null, 2));
}
