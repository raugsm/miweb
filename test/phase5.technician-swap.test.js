import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer as createNetServer } from "node:net";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const SWAP_MS = 200;

test("phase 5: technician switch with swap window and auto-revert", { timeout: 30_000 }, async () => {
  const server = await startIsolatedServer({ swapMs: SWAP_MS });
  try {
    const jar = new CookieJar();
    const http = createHttpClient(server.baseUrl, jar);

    let response = await http.request("GET", "/api/health");
    assert.equal(response.status, 200);

    const adminEmail = `phase5-admin-${Date.now()}@example.com`;
    const adminPassword = "Admin12345!";
    response = await http.request("POST", "/api/register", {
      name: "Admin Phase 5",
      email: adminEmail,
      password: adminPassword,
      workChannel: "WhatsApp 3",
      setupToken: server.setupToken,
    });
    assert.equal(response.status, 201);

    response = await http.request("POST", "/api/login", {
      email: adminEmail,
      password: adminPassword,
      operatorPin: server.setupToken,
    });
    assert.equal(response.status, 200);
    const adminUser = response.data.user;

    response = await http.request("PATCH", `/api/users/${adminUser.id}`, {
      technicianRedirectorId: "1000 9983 5478",
    });
    assert.equal(response.status, 200);
    assert.equal(response.data.user.technicianRedirectorId, "1000 9983 5478");

    const angeloEmail = `phase5-angelo-${Date.now()}@example.com`;
    const angeloPassword = "Angelo12345!";
    response = await http.request("POST", "/api/register", {
      name: "Angelo",
      email: angeloEmail,
      password: angeloPassword,
      workChannel: "WhatsApp 3",
    });
    assert.equal(response.status, 201);
    const angeloId = response.data.user.id;

    response = await http.request("PATCH", `/api/users/${angeloId}`, {
      role: "ATENCION_TECNICA",
      active: true,
      technicianRedirectorId: "2000 4422 1188",
    });
    assert.equal(response.status, 200);

    response = await http.request("GET", "/api/portal/active-technician");
    assert.equal(response.status, 200);
    assert.equal(response.data.technician.swapInProgress, false);
    assert.equal(response.data.technician.redirectorId, "1000 9983 5478");

    response = await http.request("GET", "/api/operator/technician/status");
    assert.equal(response.status, 200);
    assert.equal(response.data.technician.active.userId, adminUser.id);
    assert.equal(response.data.technician.eligible.length, 2);

    response = await http.request("POST", "/api/operator/technician/switch", {
      targetUserId: angeloId,
    });
    assert.equal(response.status, 200);
    assert.equal(response.data.technician.swap.inProgress, true);

    response = await http.request("GET", "/api/portal/active-technician");
    assert.equal(response.status, 200);
    assert.equal(response.data.technician.swapInProgress, true);
    assert.equal(response.data.technician.redirectorId, null);

    await delay(SWAP_MS + 80);

    response = await http.request("GET", "/api/portal/active-technician");
    assert.equal(response.status, 200);
    assert.equal(response.data.technician.swapInProgress, false);
    assert.equal(response.data.technician.redirectorId, "2000 4422 1188");

    response = await http.request("GET", "/api/operator/technician/status");
    assert.equal(response.data.technician.active.userId, angeloId);

    const revertSeconds = 1.0;
    response = await http.request("POST", "/api/operator/technician/switch", {
      targetUserId: adminUser.id,
      durationMinutes: revertSeconds / 60,
    });
    assert.equal(response.status, 200);
    assert.ok(response.data.technician.autoRevert);
    assert.equal(response.data.technician.autoRevert.toUserId, angeloId);

    await delay(SWAP_MS + 80);
    response = await http.request("GET", "/api/portal/active-technician");
    assert.equal(response.data.technician.redirectorId, "1000 9983 5478");

    await delay(revertSeconds * 1000 + 80);
    response = await http.request("GET", "/api/portal/active-technician");
    assert.equal(response.data.technician.swapInProgress, true);

    await delay(SWAP_MS + 80);
    response = await http.request("GET", "/api/portal/active-technician");
    assert.equal(response.data.technician.swapInProgress, false);
    assert.equal(response.data.technician.redirectorId, "2000 4422 1188");

    response = await http.request("POST", "/api/operator/technician/switch", {
      targetUserId: adminUser.id,
    });
    assert.equal(response.status, 200);

    // Wait for the swap to commit so the next assertion observes a stable active=admin
    await delay(SWAP_MS + 80);
    response = await http.request("GET", "/api/portal/active-technician");
    assert.equal(response.data.technician.swapInProgress, false);
    assert.equal(response.data.technician.redirectorId, "1000 9983 5478");

    await http.request("POST", "/api/logout");

    response = await http.request("POST", "/api/login", {
      email: angeloEmail,
      password: angeloPassword,
      operatorPin: server.setupToken,
    });
    assert.equal(response.status, 200);

    response = await http.request("POST", "/api/operator/technician/switch", {
      targetUserId: angeloId,
    });
    assert.equal(response.status, 403, "non-active eligible operator must be blocked");
  } finally {
    await server.stop();
  }
});

async function startIsolatedServer({ swapMs }) {
  const dataDir = await mkdtemp(path.join(tmpdir(), "ariadgsm-phase5-"));
  const port = await getAvailablePort();
  const setupToken = `phase5-${Date.now()}`;
  const logs = [];
  const child = spawn(process.execPath, ["server.js"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      ARIAD_DATA_DIR: dataDir,
      ARIAD_SETUP_TOKEN: setupToken,
      ARIAD_TECHNICIAN_SWAP_MS: String(swapMs),
      PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => logs.push(String(chunk)));
  child.stderr.on("data", (chunk) => logs.push(String(chunk)));
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await waitForHealth(baseUrl, child, logs);
  } catch (error) {
    if (!child.killed && child.exitCode === null) child.kill();
    await Promise.race([onceExit(child), delay(2_000)]);
    await rm(dataDir, { recursive: true, force: true });
    throw error;
  }
  return {
    baseUrl,
    dataDir,
    setupToken,
    async stop() {
      if (!child.killed && child.exitCode === null) child.kill();
      await onceExit(child);
      await rm(dataDir, { recursive: true, force: true });
    },
  };
}

function createHttpClient(baseUrl, jar) {
  return {
    async request(method, pathname, body) {
      const headers = { origin: baseUrl };
      if (body !== undefined) headers["content-type"] = "application/json";
      const cookie = jar.header();
      if (cookie) headers.cookie = cookie;
      const res = await fetch(`${baseUrl}${pathname}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      jar.store(res.headers);
      const ct = res.headers.get("content-type") || "";
      const data = ct.includes("application/json") ? await res.json() : await res.text();
      return { status: res.status, headers: res.headers, data };
    },
  };
}

class CookieJar {
  constructor() {
    this.cookies = new Map();
  }
  store(headers) {
    const setCookies = headers.getSetCookie ? headers.getSetCookie() : headers.raw?.()?.["set-cookie"] || [];
    for (const cookie of setCookies) {
      const [pair] = cookie.split(";");
      const [name, ...rest] = pair.split("=");
      const value = rest.join("=");
      if (name) this.cookies.set(name.trim(), value);
    }
  }
  header() {
    return Array.from(this.cookies.entries()).map(([name, value]) => `${name}=${value}`).join("; ");
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function onceExit(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null) return resolve();
    child.once("exit", () => resolve());
  });
}

function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForHealth(baseUrl, child, logs) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`server exited early: ${logs.join("")}`);
    }
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) return;
    } catch {}
    await delay(100);
  }
  throw new Error("server health timeout");
}