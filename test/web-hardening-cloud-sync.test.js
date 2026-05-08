import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

function sign(body, token) {
  const digest = crypto.createHmac("sha256", token).update(body).digest("hex");
  return `sha256=${digest}`;
}

function canonicalQuery(params) {
  return [...params.entries()]
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      if (leftKey !== rightKey) return leftKey < rightKey ? -1 : 1;
      if (leftValue === rightValue) return 0;
      return leftValue < rightValue ? -1 : 1;
    })
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

function signAudit(pathname, params, timestamp, token) {
  return sign(Buffer.from(["GET", pathname, canonicalQuery(params), timestamp].join("\n")), token);
}

async function waitForServer(baseUrl) {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return response;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error("server did not start");
}

async function postBatch(baseUrl, token, payload, signature) {
  const body = JSON.stringify(payload);
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Authorization": `Bearer ${token}`,
    "Idempotency-Key": payload.idempotencyKey,
  };
  if (signature !== null) headers["X-AriadGSM-Signature"] = signature;
  const response = await fetch(`${baseUrl}/api/operativa-v2/cloud/sync`, {
    method: "POST",
    headers,
    body,
  });
  const data = await response.json();
  return { response, data };
}

async function getAudit(baseUrl, token, query = "", options = {}) {
  const url = new URL(`${baseUrl}/api/operativa-v2/cloud/audit${query}`);
  const timestamp = options.timestamp || new Date().toISOString();
  const headers = {};
  if (options.auth !== "missing") {
    headers["X-AriadGSM-Timestamp"] = timestamp;
    headers["X-AriadGSM-Signature"] =
      options.signature || signAudit(url.pathname, url.searchParams, timestamp, token);
  }
  const response = await fetch(url, { headers });
  const data = await response.json();
  return { response, data };
}

test("cloud sync hardening enforces HMAC, rate limit, headers, and audit log", async () => {
  const token = "cloud-hardening-test-token";
  const port = await freePort();
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "ariadgsm-cloud-hardening-"));
  const child = spawn(process.execPath, ["server.js"], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      ARIAD_DATA_DIR: dataDir,
      OPERATIVA_AGENT_KEY: token,
      ARIADGSM_CLOUD_SYNC_RATE_LIMIT_PER_MINUTE: "2",
      ARIADGSM_CLOUD_AUDIT_RATE_LIMIT_PER_MINUTE: "3",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let exited = false;
  child.once("exit", () => {
    exited = true;
  });

  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    const health = await waitForServer(baseUrl);
    assert.match(health.headers.get("strict-transport-security") || "", /preload/);
    assert.equal((health.headers.get("content-security-policy") || "").includes("unsafe-inline"), false);

    const payload = {
      id: "hardening-batch-1",
      idempotencyKey: "hardening-batch-1",
      schemaVersion: "cloud_sync_payload_v1",
      actor: "desktop_agent",
      source: "ariadgsm_local_agent",
      events: [],
    };
    const body = JSON.stringify(payload);

    const missing = await postBatch(baseUrl, token, payload, null);
    assert.equal(missing.response.status, 401);
    assert.equal(missing.data.error, "signature_missing");

    const invalid = await postBatch(baseUrl, token, payload, "sha256=bad");
    assert.equal(invalid.response.status, 401);
    assert.equal(invalid.data.error, "signature_invalid");

    const first = await postBatch(baseUrl, token, payload, sign(body, token));
    assert.equal(first.response.status, 200);
    assert.equal(first.data.duplicate, false);
    assert.equal(first.data.batch.payloadHash.length, 64);

    const duplicate = await postBatch(baseUrl, token, payload, sign(body, token));
    assert.equal(duplicate.response.status, 200);
    assert.equal(duplicate.data.duplicate, true);

    const ratePayload = { ...payload, id: "hardening-batch-2", idempotencyKey: "hardening-batch-2" };
    const rateBody = JSON.stringify(ratePayload);
    const limited = await postBatch(baseUrl, token, ratePayload, sign(rateBody, token));
    assert.equal(limited.response.status, 429);
    assert.equal(limited.data.error, "rate_limited");
    assert.ok(Number(limited.response.headers.get("retry-after")) >= 1);

    const auditRaw = await readFile(path.join(dataDir, "cloud-sync-audit.jsonl"), "utf8");
    const audit = auditRaw.trim().split(/\r?\n/).map((line) => JSON.parse(line));
    const verdicts = audit.map((entry) => entry.verdict);
    assert.ok(verdicts.includes("new"));
    assert.ok(verdicts.includes("duplicate"));
    assert.ok(verdicts.includes("rejected"));
    assert.ok(audit.every((entry) => entry.timestamp && entry.hash && entry.lote_id && entry.agent_id));

    const missingAuditAuth = await getAudit(baseUrl, token, "?limit=3", { auth: "missing" });
    assert.equal(missingAuditAuth.response.status, 401);
    assert.equal(missingAuditAuth.data.error, "timestamp_missing");

    const invalidAuditAuth = await getAudit(baseUrl, token, "?limit=3", { signature: "sha256=bad" });
    assert.equal(invalidAuditAuth.response.status, 401);
    assert.equal(invalidAuditAuth.data.error, "signature_invalid");

    const auditResponse = await getAudit(baseUrl, token, "?limit=10");
    assert.equal(auditResponse.response.status, 200);
    assert.ok(Array.isArray(auditResponse.data));
    assert.ok(auditResponse.data.length >= 4);
    assert.ok(auditResponse.data.every((entry) => {
      return entry.lote_id && entry.agent_id && entry.timestamp && entry.hash_body && entry.verdict;
    }));
    assert.ok(auditResponse.data.every((entry) => !("body" in entry) && !("signature" in entry) && !("hash" in entry)));
    assert.ok(auditResponse.data.some((entry) => entry.verdict === "new"));
    assert.ok(auditResponse.data.some((entry) => entry.verdict === "duplicate"));
    assert.ok(auditResponse.data.some((entry) => entry.verdict === "rejected" && entry.error_code));

    const rejectedOnly = await getAudit(baseUrl, token, "?limit=10&verdict=rejected");
    assert.equal(rejectedOnly.response.status, 200);
    assert.ok(rejectedOnly.data.length >= 1);
    assert.ok(rejectedOnly.data.every((entry) => entry.verdict === "rejected"));

    const rateOne = await getAudit(baseUrl, token, "?limit=1&verdict=new");
    assert.equal(rateOne.response.status, 200);
    const rateTwo = await getAudit(baseUrl, token, "?limit=1&verdict=duplicate");
    assert.equal(rateTwo.response.status, 429);
    assert.equal(rateTwo.data.error, "rate_limited");
    assert.ok(Number(rateTwo.response.headers.get("retry-after")) >= 1);
  } finally {
    if (!exited) {
      child.kill();
      await new Promise((resolve) => child.once("exit", resolve));
    }
    await rm(dataDir, { recursive: true, force: true });
  }
});
