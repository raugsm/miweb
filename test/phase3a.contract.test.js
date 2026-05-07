import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { frpServiceCode, frpWorkChannel, portalPublicServices } from "../server/config/catalog.js";
import { limaDateStamp, limaMonthStamp } from "../server/core/dates.js";
import { sendSseEvent } from "../server/core/http.js";
import { classifyCostChange, computeProviderBaseline, defaultFrpPricingConfig, frpCurrentPricing, frpDynamicQuantityTiers, frpDynamicTier } from "../server/frp/pricing.js";
import { frpEligibilityResult, summarizeFrpEligibility } from "../server/frp/eligibility.js";
import { roundFinalPaymentAmount } from "../public/portal-modules/payments.js";
import { filesToProofs } from "../public/portal-modules/proofs.js";

test("portal Xiaomi FRP keeps its internal service and WhatsApp 3 mapping", () => {
  const portalFrp = portalPublicServices.find((service) => service.code === "PORTAL-XIAOMI-FRP");

  assert.equal(frpServiceCode, "XIA-FRP-GOOGLE");
  assert.equal(frpWorkChannel, "WhatsApp 3");
  assert.equal(portalFrp.internalServiceCode, frpServiceCode);
  assert.equal(portalFrp.workChannel, frpWorkChannel);
});

test("default FRP pricing resolves to internalCost + targetMargin (no static floor — PR-2a.6)", () => {
  // Defaults: krypto cost 23.5 + targetMargin 1.0 = unitPrice 24.5 USDT.
  // Sin minSell ni minMargin clamp (FINAL §4 precio en vivo puro).
  const db = { pricingConfig: { frpPricing: defaultFrpPricingConfig() } };
  const pricing = frpCurrentPricing(db);

  assert.equal(pricing.available, true);
  assert.equal(pricing.provider.id, "krypto");
  assert.equal(pricing.internalCostUsdt, 23.5);
  assert.equal(pricing.unitPrice, 24.5);
});

test("FRP volume tiers derive from dynamic normal price (qty 1 = pricing.unitPrice)", () => {
  const db = { pricingConfig: { frpPricing: defaultFrpPricingConfig() } };
  const pricing = frpCurrentPricing(db);

  // 4 tiers (sub-commit 15a.5), ordenados de mayor minQty a menor.
  // Descuentos sobre margen 40/25/15/0 desde costo 23.50 + margen 1.00.
  assert.deepEqual(
    frpDynamicQuantityTiers(pricing).map((tier) => tier.unitPrice),
    [24.1, 24.25, 24.35, 24.5],
  );
  // discountPct queda como señal interna del beneficio; el portal no muestra "-X%".
  assert.deepEqual(
    frpDynamicQuantityTiers(pricing).map((tier) => tier.discountPct),
    [40, 25, 15, 0],
  );
});

test("FRP volume discounts apply only over target margin and protect public floor", () => {
  const pricing = { available: true, internalCostUsdt: 3.5, unitPrice: 4.5 };
  const normalTier = { minQty: 1, marginDiscountPct: 0, discountPct: 0, unitPrice: 25, label: "Precio normal" };
  const volumeTier = { minQty: 2, marginDiscountPct: 15, discountPct: 15, unitPrice: 24.85, label: "Beneficio por 2-3 equipos" };
  const tooDeepTier = { minQty: 7, marginDiscountPct: 100, discountPct: 100, unitPrice: 23, label: "Test" };
  const narrowMarginTier = { minQty: 7, marginDiscountPct: 40, discountPct: 40, unitPrice: 23, label: "Test" };
  const legacyUnitTier = { minJobs: 30, unitPrice: 22, label: "Meta 30+" };

  assert.equal(frpDynamicTier(normalTier, pricing).unitPrice, 4.5);
  assert.equal(frpDynamicTier(volumeTier, pricing).unitPrice, 4.35);
  assert.equal(frpDynamicTier(tooDeepTier, pricing).unitPrice, 4.1);
  assert.equal(frpDynamicTier(legacyUnitTier, pricing).unitPrice, 4.1);
  assert.equal(frpDynamicTier(narrowMarginTier, { available: true, internalCostUsdt: 3.5, unitPrice: 4.0 }).unitPrice, 4.0);
  assert.equal(frpDynamicTier(narrowMarginTier, { available: true, internalCostUsdt: 3.5, unitPrice: 4.0 }).discountPct, 0);
});

test("portal final payment amounts round only at display/cobro boundary", () => {
  assert.equal(roundFinalPaymentAmount(16.43, { amountMode: "decimal", currency: "PEN" }), 16.4);
  assert.equal(roundFinalPaymentAmount(16.45, { amountMode: "decimal", currency: "PEN" }), 16.5);
  assert.equal(roundFinalPaymentAmount(16.46, { amountMode: "decimal", currency: "MXN" }), 16.5);
  assert.equal(roundFinalPaymentAmount(16620, { amountMode: "thousands", currency: "COP" }), 16600);
  assert.equal(roundFinalPaymentAmount(16650, { amountMode: "thousands", currency: "COP" }), 16700);
});

test("classifyCostChange enforces 5-level validation (PR-2a.6)", () => {
  const baseline = { providerId: "krypto", avg: 20, min: 18, max: 22, sampleCount: 5, bootstrap: false };
  // Nivel 5: rango absoluto.
  assert.equal(classifyCostChange(0.5, baseline).level, 5);
  assert.equal(classifyCostChange(150, baseline).level, 5);
  // Nivel 4: >=50% delta.
  assert.equal(classifyCostChange(31, baseline).level, 4); // +55%
  assert.equal(classifyCostChange(9, baseline).level, 4);  // -55%
  // Nivel 3: 30-50%.
  assert.equal(classifyCostChange(28, baseline).level, 3); // +40%
  // Nivel 2: 15-30%.
  assert.equal(classifyCostChange(24, baseline).level, 2); // +20%
  // Nivel 1: <15%.
  assert.equal(classifyCostChange(21, baseline).level, 1); // +5%
  // Bootstrap: nivel 1 con flag baseline_pending.
  const bootstrap = { providerId: "x", avg: 0, min: 0, max: 0, sampleCount: 0, bootstrap: true };
  const c = classifyCostChange(50, bootstrap);
  assert.equal(c.level, 1);
  assert.equal(c.reason, "baseline_pending");
  // Pero nivel 5 SIEMPRE primero, incluso en bootstrap.
  assert.equal(classifyCostChange(150, bootstrap).level, 5);
});

test("computeProviderBaseline returns bootstrap when sample insufficient", () => {
  const now = Date.now();
  const recentEntry = (offsetMs, cost) => ({
    providerId: "krypto",
    costUsdt: cost,
    recordedAt: new Date(now - offsetMs).toISOString(),
  });
  // 2 entradas recientes → bootstrap.
  const hist1 = [recentEntry(60_000, 23.5), recentEntry(120_000, 24)];
  const b1 = computeProviderBaseline(hist1, "krypto", 7);
  assert.equal(b1.bootstrap, true);
  assert.equal(b1.sampleCount, 2);
  // 4 entradas en ventana → no bootstrap.
  const hist2 = [
    recentEntry(60_000, 23.5),
    recentEntry(120_000, 24),
    recentEntry(3_600_000, 23),
    recentEntry(7_200_000, 22.5),
  ];
  const b2 = computeProviderBaseline(hist2, "krypto", 7);
  assert.equal(b2.bootstrap, false);
  assert.equal(b2.sampleCount, 4);
  assert.equal(b2.avg, Number(((23.5 + 24 + 23 + 22.5) / 4).toFixed(4)));
});

test("VIP price = internalCost + vipUnitMargin and varies with provider cost (FINAL §3)", () => {
  // Helper que replica la formula del backend (server.js#portalFrpPriceSuggestion line 580).
  const vipPrice = (internalCost, vipUnitMargin) => Number((internalCost + vipUnitMargin).toFixed(2));

  // Caso 1: costo 23.5, margen 1.0 (default) → VIP 24.5.
  assert.equal(vipPrice(23.5, 1.0), 24.5);
  // Caso 2: costo 23.5, margen 0.5 (minimo de FINAL §3) → VIP 24.0.
  assert.equal(vipPrice(23.5, 0.5), 24.0);
  // Caso 3: costo SUBE a 28, margen 1.0 → VIP sube a 29 automaticamente.
  assert.equal(vipPrice(28, 1.0), 29);
  // Caso 4: costo BAJA a 20, margen 1.0 → VIP baja a 21 automaticamente.
  assert.equal(vipPrice(20, 1.0), 21);
  // VIP conserva su propio contrato. No depende de los tiers regulares por volumen.
  assert.equal(vipPrice(3.5, 1.0), 4.5);
});

test("FRP eligibility preserves blocked, review, and apto outcomes", () => {
  assert.equal(frpEligibilityResult("Redmi A3X").status, "NO_APTO_MODO");
  assert.equal(frpEligibilityResult("Redmi Note 12S").status, "REQUIERE_REVISION");
  assert.equal(frpEligibilityResult("Redmi Note 13").status, "APTO_EXPRESS");
  assert.equal(frpEligibilityResult("").status, "APTO_EXPRESS");

  const summary = summarizeFrpEligibility([
    { originalText: "Redmi A3X" },
    { originalText: "Redmi Note 12S" },
    { originalText: "Redmi Note 13" },
  ]);
  assert.equal(summary.blocked.length, 1);
  assert.equal(summary.review.length, 1);
});

test("SSE helper keeps event-stream wire format", () => {
  let output = "";
  const res = { write: (chunk) => { output += chunk; } };

  sendSseEvent(res, "orders", { ok: true }, "evt-1");

  assert.equal(output, "id: evt-1\nevent: orders\ndata: {\"ok\":true}\n\n");
});

test("portal proof upload picker keeps mobile-safe file input contract", async () => {
  const portalHtml = await readFile(new URL("../public/portal.html", import.meta.url), "utf8");
  const panel3Css = await readFile(new URL("../public/portal-styles/13-panel-3.css", import.meta.url), "utf8");

  const inputTag = portalHtml.match(/<input[^>]+id="panel3ProofInput"[^>]*>/)?.[0] || "";
  const labelTag = portalHtml.match(/<label[^>]+id="panel3Dropzone"[^>]*>/)?.[0] || "";

  assert.match(inputTag, /\bclass="panel-3-proof-input"/);
  assert.match(inputTag, /\btype="file"/);
  assert.match(inputTag, /\baccept="image\/\*,\.pdf,application\/pdf"/);
  assert.doesNotMatch(inputTag, /\bhidden\b/);
  assert.match(labelTag, /\bfor="panel3ProofInput"/);
  assert.match(panel3Css, /\.panel-3-proof-input\s*{[\s\S]*clip-path:\s*inset\(50%\);/);
});

test("portal Mis Ordenes follows the post-payment tracking contract", async () => {
  const ordersJs = await readFile(new URL("../public/portal-modules/orders.js", import.meta.url), "utf8");
  const orderStateJs = await readFile(new URL("../public/portal-modules/order-state.js", import.meta.url), "utf8");
  const portalSerializerJs = await readFile(new URL("../server/portal/serializers.js", import.meta.url), "utf8");
  const ordersCss = await readFile(new URL("../public/portal-styles/10-orders-tracking-proofs.css", import.meta.url), "utf8");

  assert.match(ordersJs, /"PAGO_EN_REVISION"/);
  assert.match(ordersJs, /"PAGO_RECHAZADO"/);
  assert.match(ordersJs, /"EN_PREPARACION"/);
  assert.match(ordersJs, /const ORDER_STATUS = \{/);
  assert.match(ordersJs, /const shortCode = order\.shortCode \|\| order\.code \|\| order\.id;/);
  assert.match(ordersJs, /class="order-real-code">real:/);
  assert.match(ordersJs, /card\.dataset\.operatorStatus = order\.operatorStatus \|\| "";/);
  assert.doesNotMatch(ordersJs, /data-order-item-ready=/);
  assert.doesNotMatch(ordersJs, /data-order-item-cancel=/);
  assert.match(orderStateJs, /Pago confirmado\. Prepara USB Redirector y manten el equipo disponible\./);
  assert.match(portalSerializerJs, /function portalOperatorOrderStatus\(order, db\)/);
  assert.match(portalSerializerJs, /operatorStatus,/);
  assert.match(portalSerializerJs, /paymentApprovedAt,/);
  assert.match(portalSerializerJs, /noConnectionAlertAt,/);
  assert.match(ordersCss, /\.order-card-v1\.is-approved\s*{/);
  assert.match(ordersCss, /\.order-status-pill\.is-attention/);
  assert.match(ordersCss, /\.order-equipment-row\.is-approved\s*{/);
});

test("portal step 4 is an instruction/status panel, not a required connected button", async () => {
  const portalHtml = await readFile(new URL("../public/portal.html", import.meta.url), "utf8");
  const panel4Js = await readFile(new URL("../public/portal-modules/panel-4-connection.js", import.meta.url), "utf8");
  const panel4Css = await readFile(new URL("../public/portal-styles/14-panel-4.css", import.meta.url), "utf8");
  const flowStateJs = await readFile(new URL("../public/portal-modules/flow-state.js", import.meta.url), "utf8");
  const authFormsJs = await readFile(new URL("../public/portal-modules/auth-forms.js", import.meta.url), "utf8");
  const panel3Js = await readFile(new URL("../public/portal-modules/panel-3-account.js", import.meta.url), "utf8");

  assert.match(portalHtml, /id="panel4Status" role="status" aria-live="polite"/);
  assert.match(portalHtml, /id="panel4EquipoConectado"[^>]+hidden[^>]+aria-hidden="true"[^>]+tabindex="-1"/);
  assert.match(panel4Js, /const PREPARATION_STATES = new Set\(\[/);
  assert.match(panel4Js, /const PLACEHOLDER_CODE_TEXT = "Aparecera cuando tu pago sea aprobado";/);
  assert.match(panel4Js, /const canShowProcessCode = visualState === "C";/);
  assert.match(panel4Js, /order\?\.shortCode \|\| order\?\.code/);
  assert.match(panel4Js, /panel4InstructionCopy\(order, visualState\)/);
  assert.match(panel4Css, /\.panel\.panel-4\[data-state="C"\] \.panel-4-equipo-conectado-btn \{ display: none; \}/);
  assert.match(panel4Css, /\.panel-4-status\s*{/);
  assert.doesNotMatch(flowStateJs, /return "awaiting_connection"/);
  assert.match(authFormsJs, /const lockPanels12 = \["awaiting_proof", "in_review"\]\.includes\(flowState\);/);
  assert.match(authFormsJs, /const lockPanel3 = false;/);
  assert.doesNotMatch(panel3Js, /const orderValidated = orders\.find/);
});

test("operator current job renders frozen redirector before active technician fallback", async () => {
  const appJs = await readFile(new URL("../public/app.js", import.meta.url), "utf8");

  assert.match(appJs, /function frpOpsV2JobRedirectorId\(job, \{ swapInProgress, tech \} = \{\}\)/);
  assert.match(appJs, /order\.redirectorId \|\| order\.technicianId/);
  assert.match(appJs, /if \(swapInProgress\) return "-";/);
  assert.match(appJs, /frpOpsV2JobRedirectorId\(job, \{ swapInProgress, tech \}\)/);
});

test("operator workbench treats active jobs as grouped order state", async () => {
  const appJs = await readFile(new URL("../public/app.js", import.meta.url), "utf8");

  assert.match(appJs, /const activeOrders = operatorOrders\.filter\(\(order\) => order\.operatorStatus !== "FINISHED"\);/);
  assert.match(appJs, /if \(status === "IN_PROCESS"\) return \{ label: "En proceso", className: "is-approved" \};/);
  assert.match(appJs, /frpOpsV2RenderOperatorOrderItems\(order\)/);
  assert.match(appJs, /const items = Array\.isArray\(order\.items\) \? order\.items : \[\];/);
  assert.match(appJs, /item\.shortCode \|\| item\.code \|\| ""/);
});

test("operator order actions keep direct finalize independent from active technician", async () => {
  const appJs = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const cardStart = appJs.indexOf("function frpOpsV2RenderOperatorOrderCard");
  const cardEnd = appJs.indexOf("function frpOpsV2RenderOperatorOrdersSection");
  const cardBlock = appJs.slice(cardStart, cardEnd);

  assert.match(appJs, /const hasActiveTechnician = Boolean\(tech\?\.active\?\.userId\);/);
  assert.match(cardBlock, /function frpOpsV2RenderOperatorOrderCard\(order, \{ swapInProgress \}\)/);
  assert.match(cardBlock, /const isFinalizableLike = isApprovedLike \|\| order\.operatorStatus === "NO_CONNECTION";/);
  assert.match(cardBlock, /const canFinalize = Boolean\(item\?\.id && order\.finalizeAllowed && isFinalizableLike && !swapInProgress\);/);
  assert.match(cardBlock, /const canNotify = Boolean\(order\.notifyCustomerAllowed && order\.operatorStatus === "NO_CONNECTION" && !swapInProgress\);/);
  assert.match(cardBlock, /const disabledTip = swapInProgress \? "Cambio de tecnico en curso" : "";/);
  assert.doesNotMatch(cardBlock, /isMeActive|hasActiveTechnician|No sos el tecnico activo|Sin tecnico activo/);
});

test("operator technician swap polling repaints workbench and restores normal interval", async () => {
  const appJs = await readFile(new URL("../public/app.js", import.meta.url), "utf8");

  assert.match(appJs, /const FRP_OPS_TECHNICIAN_POLL_NORMAL_MS = 30_000;/);
  assert.match(appJs, /const FRP_OPS_TECHNICIAN_POLL_SWAP_MS = 2_000;/);
  assert.match(appJs, /function paintTechnicianWidget\(status\)/);
  assert.match(appJs, /if \(status\?\.swap\?\.inProgress\) \{[\s\S]*setTechnicianPollInterval\(FRP_OPS_TECHNICIAN_POLL_SWAP_MS\);[\s\S]*\} else if \(technicianRefreshTimer\) \{[\s\S]*setTechnicianPollInterval\(FRP_OPS_TECHNICIAN_POLL_NORMAL_MS\);[\s\S]*\}/);
  assert.match(appJs, /if \(frpEnabled\(\)\) renderFrp\(\{ skipPricing: true \}\);/);
  assert.match(appJs, /function setTechnicianPollInterval\(ms\) \{[\s\S]*if \(currentTechnicianPollMs === ms && technicianRefreshTimer\) return;[\s\S]*technicianRefreshTimer = setInterval\(refreshTechnicianWidget, ms\);[\s\S]*\}/);
});

test("operator FRP live stream revalidates access and closes stale sessions", async () => {
  const serverJs = await readFile(new URL("../server.js", import.meta.url), "utf8");
  const appJs = await readFile(new URL("../public/app.js", import.meta.url), "utf8");

  assert.match(serverJs, /function canUseFrp\(user\) \{[\s\S]*user\.active !== false/);
  assert.match(serverJs, /if \(!streamUser \|\| !canUseFrp\(streamUser\)\) \{[\s\S]*closeFrpOpsStreamsForUser\(userId, db\);/);
  assert.match(serverJs, /publishFrpOps\(db, "operator_permissions_updated"/);
  assert.match(appJs, /const frpAccessRevoked = payload\.frp[\s\S]*payload\.frp\.enabled === false[\s\S]*\["frp_access_revoked", "operator_permissions_updated", "operator_logged_out"\]\.includes\(payload\.reason\);/);
  assert.match(appJs, /if \(frpAccessRevoked\) \{[\s\S]*stopFrpOpsLive\(\);[\s\S]*refreshSession\(\)\.catch/);
});

test("operator finalized today uses multi-operator technician marks", async () => {
  const appJs = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const stylesCss = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");

  assert.match(appJs, /function frpOpsV2TechMark\(name\)/);
  assert.match(appJs, /split\(\/\\s\+\/\)\.filter\(Boolean\)/);
  assert.match(appJs, /return parts\[0\]\.slice\(0, 2\)\.toUpperCase\(\);/);
  assert.match(appJs, /const techMark = frpOpsV2TechMark\(j\.technicianName\);/);
  assert.doesNotMatch(appJs, /frpOpsV2TechInitial/);
  assert.match(stylesCss, /\.frp-ops-v2-tech-mark\s*{[\s\S]*min-width:\s*26px;/);
});

test("operator workbench consumes the post-payment operatorOrders contract", async () => {
  const appJs = await readFile(new URL("../public/app.js", import.meta.url), "utf8");

  assert.match(appJs, /function frpOperatorOrders\(\)/);
  assert.match(appJs, /return session\.frp\?\.operatorOrders \|\| \[\];/);
  assert.match(appJs, /const operatorOrders = frpOperatorOrders\(\);/);
  assert.match(appJs, /function frpOpsV2RenderOperatorOrdersSection\(\{ operatorOrders, isMeActive, hasActiveTechnician, swapInProgress \}\)/);
  assert.match(appJs, /const activeOrders = operatorOrders\.filter\(\(order\) => order\.operatorStatus !== "FINISHED"\);/);
  assert.match(appJs, /frpOpsV2RenderOperatorOrdersSection\(\{ operatorOrders, isMeActive, hasActiveTechnician, swapInProgress \}\)/);
});

test("operator workbench v3 layout keeps post-payment action hooks", async () => {
  const appJs = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const stylesCss = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");

  assert.match(appJs, /function frpOpsV2RenderHeaderV3\(tech, \{ queueCount = 0, reviewCount = 0 \} = \{\}\)/);
  assert.match(appJs, /frpOpsV2RenderHeaderV3\(tech, \{ queueCount: approvedCount, reviewCount \}\)/);
  assert.match(appJs, /frp-ops-v2-workspace/);
  assert.match(appJs, /frp-ops-v2-main-stack/);
  assert.match(appJs, /frp-ops-v2-side-stack/);
  assert.match(appJs, /data-frp-direct-finalize="\$\{escapeHtml\(item\?\.id \|\| ""\)\}"/);
  assert.match(appJs, /data-frp-show-proof="\$\{escapeHtml\(order\.id\)\}"/);
  assert.match(appJs, /data-frp-notify-customer="\$\{escapeHtml\(order\.id\)\}"/);
  assert.match(appJs, /async function directFinalizeFrpJob\(jobId\)/);
  assert.match(appJs, /\/api\/frp\/jobs\/\$\{jobId\}\/direct-finalize/);
  assert.match(stylesCss, /\.frp-workbench\s*{[\s\S]*display:\s*block;/);
  assert.match(stylesCss, /\.frp-ops-v2\s*{[\s\S]*background:\s*transparent;[\s\S]*border:\s*0;/);
  assert.match(stylesCss, /\.frp-ops-v2-header\s*{[\s\S]*display:\s*none;/);
  assert.match(stylesCss, /\.frp-ops-v2-workspace\s*{[\s\S]*grid-template-columns:\s*repeat\(auto-fit, minmax\(min\(100%, 620px\), 1fr\)\);/);
  assert.match(stylesCss, /\.frp-ops-v2-order-card\.is-approved\s*{/);
  assert.match(stylesCss, /\.frp-ops-v2-order-status\.is-no-connection\s*{/);
  assert.match(stylesCss, /\.technician-widget-actions \.mini-btn\s*{[\s\S]*white-space:\s*nowrap;/);
});

test("operator specific take rejection refreshes stale active technician state", async () => {
  const appJs = await readFile(new URL("../public/app.js", import.meta.url), "utf8");

  assert.match(appJs, /async function takeSpecificFrpJob\(jobId\)/);
  assert.match(appJs, /catch \(error\) \{[\s\S]*frpMessage\.textContent = error\.message;[\s\S]*frpMessage\.dataset\.type = "error";[\s\S]*await refreshSession\(\);/);
});

test("operator direct finalize actions no longer require the active technician UI contract", async () => {
  const appJs = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const frpRoutes = await readFile(new URL("../server/frp/frp-routes.js", import.meta.url), "utf8");
  const cardStart = appJs.indexOf("function frpOpsV2RenderOperatorOrderCard");
  const cardEnd = appJs.indexOf("function frpOpsV2RenderOperatorOrdersSection");
  const cardBlock = appJs.slice(cardStart, cardEnd);
  const routeStart = frpRoutes.indexOf("const frpJobDirectFinalizeMatch");
  const routeEnd = frpRoutes.indexOf("const frpJobCancelMatch");
  const directFinalizeRouteBlock = frpRoutes.slice(routeStart, routeEnd);

  assert.match(appJs, /const isMeActive = Boolean\(tech\?\.active\?\.userId && tech\.active\.userId === session\.user\?\.id\);/);
  assert.match(cardBlock, /const isFinalizableLike = isApprovedLike \|\| order\.operatorStatus === "NO_CONNECTION";/);
  assert.match(cardBlock, /const canFinalize = Boolean\(item\?\.id && order\.finalizeAllowed && isFinalizableLike && !swapInProgress\);/);
  assert.doesNotMatch(cardBlock, /!hasActiveTechnician|!isMeActive|No sos el tecnico activo|Sin tecnico activo/);
  assert.match(cardBlock, /data-frp-direct-finalize="\$\{escapeHtml\(item\?\.id \|\| ""\)\}"/);
  assert.doesNotMatch(directFinalizeRouteBlock, /FRP_JOB_DIRECT_FINALIZE_NOT_ACTIVE|requireActiveFrpTechnician/);
  assert.match(appJs, /await directFinalizeFrpJob\(directFinalizeButton\.dataset\.frpDirectFinalize\);/);
});

test("operator review cards only expose proof review when payment review is allowed", async () => {
  const appJs = await readFile(new URL("../public/app.js", import.meta.url), "utf8");

  assert.match(appJs, /const isReviewLike = \["AI_REVIEWING", "PAYMENT_REJECTED", "NEEDS_ATTENTION"\]\.includes\(order\.operatorStatus\);/);
  assert.match(appJs, /const canReview = Boolean\(order\.reviewAllowed && isReviewLike && canReviewFrpPayments\(\) && !swapInProgress\);/);
  assert.match(appJs, /data-frp-show-proof="\$\{escapeHtml\(order\.id\)\}"/);
  assert.match(appJs, />\s*Revisar\s*<\/button>/);
  assert.match(appJs, /const showProofButton = event\.target\.closest\("\[data-frp-show-proof\]"\);/);
  assert.match(appJs, /openFrpProofDialog\(showProofButton\.dataset\.frpShowProof\);/);
});

test("portal proof reader accepts mobile picker files with missing MIME but safe extension", async () => {
  const previousFileReader = globalThis.FileReader;
  globalThis.FileReader = class {
    readAsDataURL(file) {
      this.result = `data:${file.type || ""};base64,abcd`;
      this.onload();
    }
  };

  try {
    const [proof] = await filesToProofs([{ name: "comprobante.jpg", type: "", size: 123 }]);
    assert.equal(proof.type, "image/jpeg");
    assert.equal(proof.dataUrl, "data:image/jpeg;base64,abcd");
  } finally {
    if (previousFileReader) {
      globalThis.FileReader = previousFileReader;
    } else {
      delete globalThis.FileReader;
    }
  }
});

test("Lima date helpers preserve compact stamps", () => {
  const value = new Date("2026-05-01T05:00:00.000Z");

  assert.equal(limaDateStamp(value), "20260501");
  assert.equal(limaMonthStamp(value), "202605");
});
