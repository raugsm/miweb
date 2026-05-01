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
const onePixelPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

test("phase 4 smoke covers portal, FRP, SSE, panel, and daily close", { timeout: 90_000 }, async () => {
  const server = await startIsolatedServer();
  try {
    await runSmoke(server);
  } finally {
    await server.stop();
  }
});

async function runSmoke({ baseUrl, dataDir, setupToken }) {
  const jar = new CookieJar();
  const http = createHttpClient(baseUrl, jar);

  let response = await http.request("GET", "/api/health");
  assert.equal(response.status, 200);
  assert.equal(response.data.ok, true);

  response = await http.request("GET", "/api/portal/catalog");
  assert.equal(response.status, 200);
  assert.ok(response.data.catalog.services.some((service) => service.code === "PORTAL-XIAOMI-FRP"));

  const customerEmail = `phase4-customer-${Date.now()}@example.com`;
  const customerPassword = "Portal12345!";
  response = await http.request("POST", "/api/portal/register", {
    name: "Cliente Smoke Phase",
    email: customerEmail,
    password: customerPassword,
    whatsapp: "+51 999 999 999",
    country: "Peru",
  });
  assert.equal(response.status, 201);
  assert.ok(response.data.customer);

  await verifyCustomerAndSetPenRate(dataDir, customerEmail);

  response = await http.request("POST", "/api/portal/login", { email: customerEmail, password: customerPassword });
  assert.equal(response.status, 200);
  assert.ok(response.data.customer);

  response = await http.request("POST", "/api/portal/orders/frp", {
    quantity: 1,
    paymentMethod: "PE_YAPE_BRYAMS",
    items: [{ model: "Redmi Note 13", raw: "Redmi Note 13", imei: "123456789012345" }],
    note: "phase 4 smoke",
  });
  assert.equal(response.status, 201);
  const portalOrder = response.data.order;
  assert.equal(portalOrder.totalPrice, 25);
  assert.match(portalOrder.priceFormatted || "", /S\/\s*93\.75/);

  response = await http.request("PATCH", `/api/portal/orders/${encodeURIComponent(portalOrder.id)}/payment-proof`, {
    paymentProofs: [proofImage("portal-proof.png", onePixelPng)],
  });
  assert.equal(response.status, 200);
  assert.equal(response.data.order.paymentProofs.length, 1);

  response = await http.request("GET", "/api/portal/orders");
  assert.equal(response.status, 200);
  assert.ok(response.data.orders.some((order) => order.id === portalOrder.id));

  const sse = await readPortalOrdersEvent(baseUrl, jar);
  assert.equal(sse.status, 200);
  assert.match(sse.contentType, /text\/event-stream/);
  assert.match(sse.text, /event: orders|retry:/);

  response = await http.request("GET", "/api/session");
  assert.equal(response.status, 200);
  assert.equal(response.data.user, null);

  const adminEmail = `phase4-admin-${Date.now()}@example.com`;
  const adminPassword = "Admin12345!";
  response = await http.request("POST", "/api/register", {
    name: "Admin Smoke Phase",
    email: adminEmail,
    password: adminPassword,
    workChannel: "WhatsApp 3",
    setupToken,
  });
  assert.equal(response.status, 201);
  assert.equal(response.data.user.role, "ADMIN");

  response = await http.request("POST", "/api/login", {
    email: adminEmail,
    password: adminPassword,
    operatorPin: setupToken,
  });
  assert.equal(response.status, 200);
  assert.equal(response.data.user.role, "ADMIN");

  response = await http.request("GET", "/api/session");
  assert.equal(response.status, 200);
  assert.equal(response.data.user.role, "ADMIN");
  assert.ok(response.data.frp.enabled);

  response = await http.request("GET", "/api/daily-close");
  assert.equal(response.status, 200);
  assert.equal(response.data.dailyClose.status, "ABIERTO");
  assert.equal(response.data.dailyClose.timezone, "America/Lima");

  response = await http.request("GET", "/api/frp/pricing");
  assert.equal(response.status, 200);
  assert.ok(response.data.pricing.summary.available);

  const policy = response.data.pricing.policy;
  response = await http.request("PATCH", "/api/frp/pricing/policy", {
    minMarginUsdt: policy.minMarginUsdt,
    targetMarginUsdt: policy.targetMarginUsdt,
    minSellPriceUsdt: policy.minSellPriceUsdt,
    maxWorkerCostChangePct: policy.maxWorkerCostChangePct,
  });
  assert.equal(response.status, 200);
  assert.ok(response.data.pricing.summary.available);

  response = await http.request("POST", "/api/frp/orders", {
    clientText: "Cliente Interno +51 999 888 777 Peru",
    quantity: 1,
    paymentMethod: "PE_YAPE_BRYAMS",
  });
  assert.equal(response.status, 201);
  const internalOrder = response.data.order;
  let internalJob = internalOrder.jobs[0];
  assert.ok(internalJob);

  for (const key of ["priceSent", "connectionDataSent", "authorizationConfirmed"]) {
    response = await http.request("PATCH", `/api/frp/orders/${encodeURIComponent(internalOrder.id)}/checklist`, { key, value: true });
    assert.equal(response.status, 200);
    assert.equal(response.data.order.checklist[key], true);
  }

  response = await http.request("PATCH", `/api/frp/orders/${encodeURIComponent(internalOrder.id)}/payment-proof`, {
    paymentProofs: [proofImage("internal-proof.png", onePixelPng.replace("iVBOR", "jVBOR"))],
  });
  assert.equal(response.status, 200);
  assert.equal(response.data.order.paymentProofs.length, 1);

  response = await http.request("PATCH", `/api/frp/orders/${encodeURIComponent(internalOrder.id)}/payment-review`, { action: "approve" });
  assert.equal(response.status, 200);
  assert.equal(response.data.order.checklist.paymentValidated, true);

  for (const key of ["clientConnected", "requiredStateConfirmed", "modelSupported"]) {
    response = await http.request("PATCH", `/api/frp/jobs/${encodeURIComponent(internalJob.id)}/checklist`, { key, value: true });
    assert.equal(response.status, 200);
    assert.equal(response.data.job.checklist[key], true);
  }

  response = await http.request("PATCH", `/api/frp/jobs/${encodeURIComponent(internalJob.id)}/ready`);
  assert.equal(response.status, 200);
  assert.equal(response.data.job.status, "LISTO_PARA_TECNICO");

  response = await http.request("POST", "/api/frp/jobs/take-next");
  assert.equal(response.status, 200);
  internalJob = response.data.job;
  assert.equal(internalJob.status, "EN_PROCESO");

  response = await http.request("PATCH", `/api/frp/jobs/${encodeURIComponent(internalJob.id)}/finalize`, {
    finalLog: "Smoke finalizado Paso 4",
  });
  assert.equal(response.status, 200);
  assert.equal(response.data.job.status, "FINALIZADO");
}

async function startIsolatedServer() {
  const dataDir = await mkdtemp(path.join(tmpdir(), "ariadgsm-phase4-"));
  const port = await getAvailablePort();
  const setupToken = `phase4-${Date.now()}`;
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

async function verifyCustomerAndSetPenRate(dataDir, email) {
  const usersPath = path.join(dataDir, "users.json");
  const db = JSON.parse(await readFile(usersPath, "utf8"));
  const user = db.customerUsers.find((candidate) => candidate.email === email);
  const client = user && db.customerClients.find((candidate) => candidate.id === user.clientId);
  assert.ok(user, "registered customer user exists in isolated data");
  assert.ok(client, "registered customer client exists in isolated data");

  const now = new Date().toISOString();
  user.emailVerifiedAt = now;
  client.emailVerifiedAt = now;
  client.status = "EMAIL_VERIFICADO";
  const penRate = db.pricingConfig.exchangeRates.find((rate) => rate.currency === "PEN" || rate.key === "peru");
  assert.ok(penRate, "PEN exchange rate fixture exists");
  penRate.ratePerUsdt = 3.75;
  penRate.updatedAt = now;
  penRate.updatedBy = "phase4-smoke";

  await writeFile(usersPath, `${JSON.stringify(db, null, 2)}\n`);
}

function createHttpClient(baseUrl, jar) {
  return {
    async request(method, pathname, body) {
      const headers = { origin: baseUrl };
      if (body !== undefined) headers["content-type"] = "application/json";
      const cookie = jar.header();
      if (cookie) headers.cookie = cookie;

      const res = await fetchWithTimeout(`${baseUrl}${pathname}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      jar.store(res.headers);
      const contentType = res.headers.get("content-type") || "";
      const data = contentType.includes("application/json") ? await res.json() : await res.text();
      return { status: res.status, headers: res.headers, data };
    },
  };
}

async function readPortalOrdersEvent(baseUrl, jar) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const res = await fetch(`${baseUrl}/api/portal/orders/events`, {
      headers: { cookie: jar.header() },
      signal: controller.signal,
    });
    const reader = res.body.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value || new Uint8Array());
    await reader.cancel();
    return {
      status: res.status,
      contentType: res.headers.get("content-type") || "",
      text,
    };
  } finally {
    clearTimeout(timer);
  }
}

function proofImage(name, data) {
  return {
    name,
    type: "image/png",
    size: Buffer.from(data, "base64").length,
    dataUrl: `data:image/png;base64,${data}`,
  };
}

async function waitForHealth(baseUrl, child, logs) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Server exited early with ${child.exitCode}\n${logs.join("")}`);
    }
    try {
      const res = await fetchWithTimeout(`${baseUrl}/api/health`, {}, 750);
      if (res.status === 200) return;
    } catch {
      // The server may still be binding the port.
    }
    await delay(150);
  }
  throw new Error(`Server did not become ready\n${logs.join("")}`);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 8_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function onceExit(child) {
  if (child.exitCode !== null) return;
  await new Promise((resolve) => child.once("exit", resolve));
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
