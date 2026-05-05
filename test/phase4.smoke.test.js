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
    quantity: 3,
    paymentMethod: "PE_YAPE_BRYAMS",
    items: [
      { model: "Redmi Note 13", raw: "Redmi Note 13", imei: "123456789012345" },
      { model: "Redmi Note 13", raw: "Redmi Note 13", imei: "123456789012346" },
      { model: "Redmi Note 13", raw: "Redmi Note 13", imei: "123456789012347" },
    ],
    note: "phase 4 smoke",
  });
  assert.equal(response.status, 201);
  const portalOrder = response.data.order;
  assert.equal(portalOrder.totalPrice, 74.55);
  assert.match(portalOrder.priceFormatted || "", /S\/\s*279\.56/);
  assert.equal(portalOrder.items.length, 3);

  response = await http.request("PATCH", `/api/portal/orders/${encodeURIComponent(portalOrder.id)}/payment-proof`, {
    paymentProofs: [proofImage("portal-proof.png", onePixelPng)],
  });
  assert.equal(response.status, 200);
  assert.equal(response.data.order.paymentProofs.length, 1);

  response = await http.request("PATCH", `/api/portal/orders/${encodeURIComponent(portalOrder.id)}/payment-proof`, {
    paymentProofs: [proofImage("portal-proof-replacement.png", onePixelPng.replace("iVBOR", "kVBOR"))],
  });
  assert.equal(response.status, 200);
  assert.equal(response.data.order.paymentProofs.length, 1, "Reemplazar comprobante no debe acumular archivos");
  assert.equal(response.data.order.paymentProofs[0].name, "portal-proof-replacement.png");

  response = await http.request("POST", "/api/portal/orders/frp", {
    quantity: 1,
    paymentMethod: "PE_YAPE_BRYAMS",
    items: [
      { model: "Redmi Note 11", raw: "Redmi Note 11", imei: "123456789012349" },
    ],
    note: "phase 4 stale no-proof draft",
  });
  assert.equal(response.status, 201);
  const staleDraftOrder = response.data.order;
  assert.equal(staleDraftOrder.publicStatus, "ESPERANDO_PAGO");
  assert.equal(staleDraftOrder.paymentProofs.length, 0);

  response = await http.request("POST", "/api/portal/orders/frp", {
    quantity: 1,
    paymentMethod: "PE_YAPE_BRYAMS",
    items: [
      { model: "Redmi Note 10", raw: "Redmi Note 10", imei: "123456789012350" },
    ],
    paymentProofs: [proofImage("proofed-current-price.png", onePixelPng.replace("iVBOR", "mVBOR"))],
    note: "phase 4 proof creates fresh priced order",
  });
  assert.equal(response.status, 201);
  assert.equal(response.data.order.publicStatus, "PAGO_EN_REVISION");
  assert.equal(response.data.order.paymentProofs.length, 1);

  response = await http.request("GET", `/api/portal/orders/${encodeURIComponent(staleDraftOrder.id)}`);
  assert.equal(response.status, 200);
  assert.equal(response.data.order.publicStatus, "CANCELADO", "subir comprobante nuevo debe retirar borradores sin comprobante");

  // notify-connected debe rechazarse en PAGO_EN_REVISION (aun sin pago validado).
  response = await http.request("POST", `/api/portal/orders/${encodeURIComponent(portalOrder.id)}/notify-connected`);
  assert.equal(response.status, 409, "notify-connected debe bloquearse antes de pago validado");

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
  const adminUser = response.data.user;

  let rateUpdateResponse;
  const adminConfigRateEvent = await readAdminConfigEventAfter(baseUrl, async () => {
    rateUpdateResponse = await http.request("PATCH", "/api/pricing/exchange-rates/peru", {
      ratePerUsdt: 3.76,
    });
  }, "exchange_rate_changed");
  assert.equal(rateUpdateResponse.status, 200);
  assert.match(adminConfigRateEvent.text, /event: exchange_rate_changed/);
  assert.match(adminConfigRateEvent.text, /"currency":"PEN"/);
  assert.match(adminConfigRateEvent.text, /"ratePerUsdt":3\.76/);

  response = await http.request("GET", "/api/frp/pricing");
  assert.equal(response.status, 200);
  assert.ok(response.data.pricing.summary.available);
  const policyForCatalogEvent = response.data.pricing.policy;
  let frpPolicyUpdateResponse;
  const adminConfigCatalogEvent = await readAdminConfigEventAfter(baseUrl, async () => {
    frpPolicyUpdateResponse = await http.request("PATCH", "/api/frp/pricing/policy", {
      minMarginUsdt: policyForCatalogEvent.minMarginUsdt,
      targetMarginUsdt: policyForCatalogEvent.targetMarginUsdt,
      minSellPriceUsdt: policyForCatalogEvent.minSellPriceUsdt,
      maxWorkerCostChangePct: policyForCatalogEvent.maxWorkerCostChangePct,
    });
  }, "portal_catalog_changed");
  assert.equal(frpPolicyUpdateResponse.status, 200);
  assert.match(adminConfigCatalogEvent.text, /event: portal_catalog_changed/);
  assert.match(adminConfigCatalogEvent.text, /"scope":"frp_pricing"/);
  assert.match(adminConfigCatalogEvent.text, /"reason":"pricing_policy_updated"/);
  assert.match(adminConfigCatalogEvent.text, /"requiresSessionRefresh":true/);

  response = await http.request("PATCH", `/api/users/${encodeURIComponent(adminUser.id)}`, {
    technicianRedirectorId: "1000 9983 5478",
  });
  assert.equal(response.status, 200);
  assert.equal(response.data.user.technicianRedirectorId, "1000 9983 5478");

  response = await http.request("GET", "/api/portal/active-technician");
  assert.equal(response.status, 200);
  assert.equal(response.data.technician.redirectorId, null, "el administrador con Technician ID no debe quedar como tecnico activo");

  response = await http.request("POST", "/api/portal/orders/frp", {
    quantity: 1,
    paymentMethod: "PE_YAPE_BRYAMS",
    items: [
      { model: "Redmi Note 12", raw: "Redmi Note 12", imei: "123456789012348" },
    ],
    note: "phase 4 no active technician block",
  });
  assert.equal(response.status, 201);
  const noActiveTechOrder = response.data.order;

  response = await http.request("PATCH", `/api/portal/orders/${encodeURIComponent(noActiveTechOrder.id)}/payment-proof`, {
    paymentProofs: [proofImage("no-tech-proof.png", onePixelPng)],
  });
  assert.equal(response.status, 200);

  response = await http.request("GET", "/api/session");
  assert.equal(response.status, 200);
  const noActiveTechFrpOrder = (response.data.frp?.orders || []).find((order) => order.portalOrderId === noActiveTechOrder.id);
  assert.ok(noActiveTechFrpOrder, "admin debe ver la orden portal usada para probar bloqueo sin tecnico");

  response = await http.request("PATCH", `/api/frp/orders/${encodeURIComponent(noActiveTechFrpOrder.id)}/payment-review`, { action: "approve" });
  assert.equal(response.status, 200);

  response = await http.request("POST", `/api/portal/orders/${encodeURIComponent(noActiveTechOrder.id)}/notify-connected`);
  assert.equal(response.status, 409, "notify-connected debe bloquearse si no hay tecnico activo valido");

  const technicianEmail = `phase4-tech-${Date.now()}@example.com`;
  const technicianPassword = "Tech12345!";
  response = await http.request("POST", "/api/register", {
    name: "Tecnico FRP Phase",
    email: technicianEmail,
    password: technicianPassword,
    workChannel: "WhatsApp 3",
  });
  assert.equal(response.status, 201);
  const technicianUser = response.data.user;

  response = await http.request("PATCH", `/api/users/${encodeURIComponent(technicianUser.id)}`, {
    role: "ATENCION_TECNICA",
    active: true,
    technicianRedirectorId: "2000 1122 3344",
  });
  assert.equal(response.status, 200);
  assert.equal(response.data.user.role, "ATENCION_TECNICA");

  response = await http.request("GET", "/api/portal/active-technician");
  assert.equal(response.status, 200);
  assert.equal(response.data.technician.redirectorId, "2000 1122 3344");

  const technicianJar = new CookieJar();
  const technicianHttp = createHttpClient(baseUrl, technicianJar);
  response = await technicianHttp.request("POST", "/api/login", {
    email: technicianEmail,
    password: technicianPassword,
  });
  assert.equal(response.status, 200);
  assert.equal(response.data.user.role, "ATENCION_TECNICA");

  const otherChannelEmail = `phase4-other-channel-${Date.now()}@example.com`;
  const otherChannelPassword = "Other12345!";
  response = await http.request("POST", "/api/register", {
    name: "Operador Otro Canal Phase",
    email: otherChannelEmail,
    password: otherChannelPassword,
    workChannel: "WhatsApp 1",
  });
  assert.equal(response.status, 201);
  const otherChannelUser = response.data.user;

  response = await http.request("PATCH", `/api/users/${encodeURIComponent(otherChannelUser.id)}`, {
    role: "ATENCION_TECNICA",
    active: true,
    workChannel: "WhatsApp 1",
  });
  assert.equal(response.status, 200);
  assert.equal(response.data.user.workChannel, "WhatsApp 1");

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
  assert.equal(response.status, 403, "admin no puede tomar FRP si no es el tecnico activo");

  response = await technicianHttp.request("POST", "/api/frp/jobs/take-next");
  assert.equal(response.status, 200);
  internalJob = response.data.job;
  assert.equal(internalJob.status, "EN_PROCESO");

  response = await technicianHttp.request("PATCH", `/api/frp/jobs/${encodeURIComponent(internalJob.id)}/finalize`, {
    finalLog: "Smoke finalizado Paso 4",
  });
  assert.equal(response.status, 200);
  assert.equal(response.data.job.status, "FINALIZADO");

  // QUE: validar el endpoint POST /api/portal/orders/:id/notify-connected en happy path.
  // Previo: la orden del portal sigue en PAGO_EN_REVISION porque el admin nunca aprobo
  // su comprobante (solo aprobo el de la orden manual). Aqui localizamos la frpOrder
  // ligada al portalOrder via session.frp.orders y aprobamos su pago, lo que hace que la
  // derivacion publica suba a EN_PREPARACION. Recien ahi podemos ejercer notify-connected.
  response = await http.request("GET", "/api/session");
  assert.equal(response.status, 200);
  const portalFrpOrder = (response.data.frp?.orders || []).find((order) => order.portalOrderId === portalOrder.id);
  assert.ok(portalFrpOrder, "session.frp.orders debe incluir el frpOrder ligado al portalOrder");
  assert.equal(portalFrpOrder.paymentProofs.length, 1, "operador debe ver solo el comprobante vigente");
  assert.equal(portalFrpOrder.paymentProofs[0].name, "portal-proof-replacement.png");

  const otherChannelJar = new CookieJar();
  const otherChannelHttp = createHttpClient(baseUrl, otherChannelJar);
  response = await otherChannelHttp.request("POST", "/api/login", {
    email: otherChannelEmail,
    password: otherChannelPassword,
  });
  assert.equal(response.status, 200);
  assert.equal(response.data.user.role, "ATENCION_TECNICA");
  assert.equal(response.data.user.workChannel, "WhatsApp 1");

  response = await otherChannelHttp.request("PATCH", `/api/frp/orders/${encodeURIComponent(portalFrpOrder.id)}/payment-review`, { action: "approve" });
  assert.equal(response.status, 403, "operador fuera de WhatsApp 3 no puede validar pagos FRP");

  response = await technicianHttp.request("PATCH", `/api/frp/orders/${encodeURIComponent(portalFrpOrder.id)}/payment-review`, { action: "approve" });
  assert.equal(response.status, 200);
  assert.equal(response.data.order.checklist.paymentValidated, true);

  response = await technicianHttp.request("GET", "/api/session");
  assert.equal(response.status, 200);
  const waitingConnectionOrder = (response.data.frp?.orders || []).find((order) => order.id === portalFrpOrder.id);
  assert.ok(waitingConnectionOrder, "el panel operador debe conservar visible la orden aprobada");
  assert.equal(waitingConnectionOrder.paymentStatus, "COMPROBANTE_RECIBIDO");
  assert.ok(
    (waitingConnectionOrder.jobs || []).some((job) => job.status === "ESPERANDO_PREPARACION"),
    "despues de aprobar pago, la orden debe quedar esperando conexion del cliente",
  );

  response = await http.request("POST", `/api/portal/orders/${encodeURIComponent(portalOrder.id)}/notify-connected`);
  assert.equal(response.status, 200, "notify-connected debe aceptar tras pago validado");
  assert.ok(response.data.order.customerConnectionReadyAt, "el portal debe reflejar customerConnectionReadyAt");
  assert.equal(response.data.order.technicianId, "2000 1122 3344", "notify-connected debe congelar el Technician ID activo real");
  assert.equal(
    response.data.order.items.find((item) => item.sequence === 1)?.status,
    "LISTO_PARA_TECNICO",
    "notify-connected debe mandar el primer equipo a cola tecnica",
  );
  assert.equal(
    response.data.order.items.find((item) => item.sequence === 2)?.status,
    "ESPERANDO_PREPARACION",
    "los equipos restantes deben seguir pendientes hasta que el cliente los marque listos",
  );

  const secondPortalItem = response.data.order.items.find((item) => item.sequence === 2);
  assert.ok(secondPortalItem, "la orden portal debe exponer el segundo item");
  response = await http.request("POST", `/api/portal/orders/${encodeURIComponent(portalOrder.id)}/items/${encodeURIComponent(secondPortalItem.id)}/ready`);
  assert.equal(response.status, 200, "Equipo listo por item debe aceptar un equipo pendiente");
  assert.equal(
    response.data.order.items.find((item) => item.sequence === 2)?.status,
    "LISTO_PARA_TECNICO",
    "Equipo listo por item debe mandar el equipo elegido a cola tecnica",
  );

  const thirdPortalItem = response.data.order.items.find((item) => item.sequence === 3);
  assert.ok(thirdPortalItem, "la orden portal debe exponer el tercer item");
  response = await http.request("POST", `/api/portal/orders/${encodeURIComponent(portalOrder.id)}/items/${encodeURIComponent(thirdPortalItem.id)}/cancel`, {
    reason: "CUSTOMER_ITEM_CANCEL",
  });
  assert.equal(response.status, 200, "Cancelar equipo debe aceptar un equipo pendiente");
  assert.equal(
    response.data.order.items.find((item) => item.sequence === 3)?.status,
    "CANCELADO",
    "Cancelar equipo debe marcar solo el item elegido como CANCELADO",
  );
  assert.equal(response.data.order.publicStatus, "LISTO_PARA_CONEXION", "cancelar un pendiente no debe sacar de cola los equipos listos");

  response = await technicianHttp.request("GET", "/api/session");
  assert.equal(response.status, 200);
  const readyPortalJobs = (response.data.frp?.jobs || []).filter((job) => job.orderId === portalFrpOrder.id && job.status === "LISTO_PARA_TECNICO");
  assert.equal(readyPortalJobs.length, 2, "el panel operador debe recibir dos equipos listos sin desaparecer la orden");
  const canceledPortalJobs = (response.data.frp?.jobs || []).filter((job) => job.orderId === portalFrpOrder.id && job.status === "CANCELADO");
  assert.equal(canceledPortalJobs.length, 1, "el panel operador debe ver el equipo cancelado para trazabilidad");

  response = await http.request("POST", `/api/portal/orders/${encodeURIComponent(noActiveTechOrder.id)}/abort`, {
    reason: "CUSTOMER_ORDER_ABORT",
  });
  assert.equal(response.status, 200, "Abortar pedido debe aceptar una orden activa del cliente");
  assert.equal(response.data.order.publicStatus, "CANCELADO", "Abortar pedido debe cerrar la orden cliente como CANCELADO");

  response = await technicianHttp.request("GET", "/api/session");
  assert.equal(response.status, 200);
  const abortedFrpOrder = (response.data.frp?.orders || []).find((order) => order.portalOrderId === noActiveTechOrder.id);
  assert.equal(abortedFrpOrder?.orderStatus, "CANCELADA", "Abortar pedido debe notificar al panel operador como orden tecnica cancelada");
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

async function readAdminConfigEventAfter(baseUrl, trigger, expectedEvent) {
  const controller = new AbortController();
  const deadline = Date.now() + 5_000;
  const timer = setTimeout(() => controller.abort(), 5_000);
  let reader;
  try {
    const res = await fetch(`${baseUrl}/api/portal/admin-config/events`, {
      signal: controller.signal,
    });
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") || "", /text\/event-stream/);
    reader = res.body.getReader();
    await trigger();
    const decoder = new TextDecoder();
    let text = "";
    while (Date.now() < deadline) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value || new Uint8Array(), { stream: true });
      if (text.includes(`event: ${expectedEvent}`)) {
        await reader.cancel();
        return {
          status: res.status,
          contentType: res.headers.get("content-type") || "",
          text,
        };
      }
    }
    throw new Error(`Expected admin-config SSE event ${expectedEvent}, got:\n${text}`);
  } finally {
    clearTimeout(timer);
    controller.abort();
    if (reader) {
      try {
        await reader.cancel();
      } catch {
        // The reader may already be closed after finding the expected event.
      }
    }
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
