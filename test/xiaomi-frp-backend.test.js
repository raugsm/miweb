import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer as createNetServer } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const onePixelPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

test("xiaomi frp backend supports public order flow and operator actions", { timeout: 60_000 }, async () => {
  const server = await startServer();
  try {
    const jar = new CookieJar();
    const http = createHttpClient(server.baseUrl, jar);

    let response = await http.request("GET", "/api/xiaomi-frp/bootstrap", undefined, { "cf-ipcountry": "PE" });
    assert.equal(response.status, 200);
    assert.equal(response.data.countryIso, "PE");
    assert.equal(response.data.price.unitPriceUsdt, 4);
    assert.equal(response.data.paymentMethods.some((method) => method.code === "PAYPAL"), false);
    assert.ok(response.data.paymentMethods.some((method) => method.code === "PE_YAPE_BRYAMS"));

    response = await http.request("POST", "/api/register", {
      name: "Admin Xiaomi FRP",
      email: `xiaomi-frp-admin-${Date.now()}@example.com`,
      password: "Admin12345!",
      workChannel: "WhatsApp 3",
      setupToken: server.setupToken,
    });
    assert.equal(response.status, 201);

    response = await http.request("POST", "/api/login", {
      email: response.data.user.email,
      password: "Admin12345!",
      operatorPin: server.setupToken,
    });
    assert.equal(response.status, 200);

    response = await http.request("PATCH", "/api/pricing/exchange-rates/peru", { ratePerUsdt: 3.75 });
    assert.equal(response.status, 200);

    response = await http.request("POST", "/api/xiaomi-frp/orders", {
      whatsapp: "+51 999 888 777",
      countryIso: "PE",
      quantity: 2,
      paymentMethod: "PE_YAPE_BRYAMS",
    });
    assert.equal(response.status, 201);
    assert.match(response.data.access.code, /^AG-0001$/);
    assert.match(response.data.access.token, /^[A-Za-z0-9]{10}$/);
    assert.equal(response.data.order.totalUsdt, 8.3);
    assert.equal(response.data.order.paymentAmount, 31.13);
    const { code, token } = response.data.access;

    response = await http.request("GET", `/api/xiaomi-frp/orders/${code}`);
    assert.equal(response.status, 404);

    response = await http.request("GET", `/api/xiaomi-frp/orders/${code}?t=${encodeURIComponent(token)}`);
    assert.equal(response.status, 200);
    assert.equal(response.data.order.code, code);
    assert.equal(Object.hasOwn(response.data.order, "publicAccessTokenHash"), false);

    response = await http.request("POST", `/api/xiaomi-frp/orders/${code}/payment-proof?t=${encodeURIComponent(token)}`, {
      proof: {
        name: "proof.png",
        type: "image/png",
        size: 68,
        dataUrl: `data:image/png;base64,${onePixelPng}`,
      },
    });
    assert.equal(response.status, 200);
    assert.equal(response.data.order.status, "PAGO_EN_REVISION");

    response = await http.request("GET", "/api/xiaomi-frp/operator/queue");
    assert.equal(response.status, 200);
    const queued = response.data.queue.find((order) => order.code === code);
    assert.ok(queued);
    assert.equal(queued.status, "PAGO_EN_REVISION");

    response = await http.request("POST", `/api/xiaomi-frp/operator/orders/${code}/payment-review`, { action: "approve" });
    assert.equal(response.status, 200);
    assert.equal(response.data.order.status, "LISTO_PARA_CONEXION");
    const firstJob = response.data.order.jobs[0];
    assert.ok(firstJob?.id);

    response = await http.request("POST", `/api/xiaomi-frp/operator/processes/${encodeURIComponent(firstJob.id)}/connected`, {});
    assert.equal(response.status, 200);
    assert.equal(response.data.order.status, "EN_COLA");

    response = await http.request("POST", `/api/xiaomi-frp/operator/processes/${encodeURIComponent(firstJob.id)}/done`, {});
    assert.equal(response.status, 200);
    assert.equal(response.data.order.completed, 1);
    assert.equal(response.data.order.remaining, 1);
    assert.equal(response.data.order.status, "LISTO_PARA_CONEXION");

    response = await http.request("GET", "/api/xiaomi-frp/operator/audit");
    assert.equal(response.status, 200);
    assert.ok(response.data.audit.some((entry) => entry.action === "XIAOMI_FRP_ORDER_CREATED"));
    assert.ok(response.data.audit.some((entry) => entry.action === "XIAOMI_FRP_PROCESS_DONE"));
  } finally {
    await server.stop();
  }
});

async function startServer() {
  const dataDir = await mkdtemp(path.join(tmpdir(), "ariadgsm-xiaomi-frp-"));
  const port = await availablePort();
  const setupToken = `xiaomi-${Date.now()}`;
  const logs = [];
  const child = spawn(process.execPath, ["server.js"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      ARIAD_DATA_DIR: dataDir,
      ARIAD_SETUP_TOKEN: setupToken,
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
    await Promise.race([once(child, "exit"), delay(2_000)]);
    await rm(dataDir, { recursive: true, force: true });
    throw error;
  }
  return {
    baseUrl,
    setupToken,
    async stop() {
      if (!child.killed && child.exitCode === null) child.kill();
      await once(child, "exit");
      await rm(dataDir, { recursive: true, force: true });
    },
  };
}

function createHttpClient(baseUrl, jar) {
  return {
    async request(method, pathname, body, extraHeaders = {}) {
      const headers = { origin: baseUrl, ...extraHeaders };
      if (body !== undefined) headers["content-type"] = "application/json";
      const cookie = jar.header();
      if (cookie) headers.cookie = cookie;
      const res = await fetch(`${baseUrl}${pathname}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
      jar.store(res.headers);
      const contentType = res.headers.get("content-type") || "";
      const data = contentType.includes("application/json") ? await res.json() : await res.text();
      return { status: res.status, headers: res.headers, data };
    },
  };
}

async function waitForHealth(baseUrl, child, logs) {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server exited early: ${logs.join("\n")}`);
    try {
      const res = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(1_000) });
      if (res.ok) return;
    } catch {
      await delay(100);
    }
  }
  throw new Error(`server did not become healthy: ${logs.join("\n")}`);
}

function availablePort() {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class CookieJar {
  #cookies = new Map();

  store(headers) {
    const values = typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : splitSetCookie(headers.get("set-cookie"));
    for (const value of values) {
      const first = value.split(";")[0];
      const index = first.indexOf("=");
      if (index > 0) this.#cookies.set(first.slice(0, index), first.slice(index + 1));
    }
  }

  header() {
    return Array.from(this.#cookies.entries()).map(([key, value]) => `${key}=${value}`).join("; ");
  }
}

function splitSetCookie(value) {
  if (!value) return [];
  return String(value).split(/,(?=\s*[^;,\s]+=)/g).map((item) => item.trim()).filter(Boolean);
}
