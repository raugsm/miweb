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

test("operator current job renders frozen redirector before active technician fallback", async () => {
  const appJs = await readFile(new URL("../public/app.js", import.meta.url), "utf8");

  assert.match(appJs, /function frpOpsV2JobRedirectorId\(job, \{ swapInProgress, tech \} = \{\}\)/);
  assert.match(appJs, /order\.redirectorId \|\| order\.technicianId/);
  assert.match(appJs, /if \(swapInProgress\) return "-";/);
  assert.match(appJs, /frpOpsV2JobRedirectorId\(job, \{ swapInProgress, tech \}\)/);
});

test("operator workbench treats other active jobs as plural observer state", async () => {
  const appJs = await readFile(new URL("../public/app.js", import.meta.url), "utf8");

  assert.match(appJs, /const otherActiveJobs = jobs\.filter\(\(j\) => j\.status === "EN_PROCESO"/);
  assert.doesNotMatch(appJs, /otherActiveJob = !myActiveJob[\s\S]{0,180}jobs\.find/);
  assert.match(appJs, /frpOpsV2RenderOtherActiveSection\(\{ jobs: otherActiveJobs, tech \}\)/);
  assert.match(appJs, /frp-ops-v2-other-active-list/);
  assert.match(appJs, /currentHtml = frpOpsV2RenderCurrentEmpty\(\{ queueState, isMeActive, hasActiveTechnician, swapInProgress \}\);/);
});

test("operator empty workbench distinguishes no active technician from another active technician", async () => {
  const appJs = await readFile(new URL("../public/app.js", import.meta.url), "utf8");

  assert.match(appJs, /const hasActiveTechnician = Boolean\(tech\?\.active\?\.userId\);/);
  assert.match(appJs, /function frpOpsV2RenderCurrentEmpty\(\{ queueState, isMeActive, hasActiveTechnician, swapInProgress \}\)/);
  assert.match(appJs, /function frpOpsV2RenderQueueCard\(job, \{ isMeActive, hasActiveTechnician, swapInProgress, hasMyActive \}\)/);
  assert.match(appJs, /: !hasActiveTechnician \? "Sin tecnico activo"[\s\S]*: !isMeActive \? "No sos el tecnico activo"/);
  assert.match(appJs, /frpOpsV2RenderQueueCard\(j, \{ isMeActive, hasActiveTechnician, swapInProgress, hasMyActive \}\)/);
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

test("operator VIP queue filter keeps take-next aligned with visible jobs", async () => {
  const appJs = await readFile(new URL("../public/app.js", import.meta.url), "utf8");

  assert.match(appJs, /function frpOpsV2QueueViewState\(queueJobs\)/);
  assert.match(appJs, /const queueState = frpOpsV2QueueViewState\(queueJobs\);/);
  assert.match(appJs, /const showJobs = vipOnly && !fallbackToAll \? vipJobs : sortedJobs;/);
  assert.match(appJs, /const takeSpecificJobId = queueState\?\.vipOnly && !queueState\?\.fallbackToAll/);
  assert.match(appJs, /data-frp-take-next-job-id="\$\{escapeHtml\(takeSpecificJobId\)\}"/);
  assert.match(appJs, /if \(filteredJobId\) await takeSpecificFrpJob\(filteredJobId\);/);
  assert.match(appJs, /else await takeNextFrpJob\(\);/);
});

test("operator workbench v3 layout keeps existing action hooks", async () => {
  const appJs = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const stylesCss = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");

  assert.match(appJs, /function frpOpsV2RenderHeaderV3\(tech, \{ queueCount = 0, reviewCount = 0 \} = \{\}\)/);
  assert.match(appJs, /frpOpsV2RenderHeaderV3\(tech, \{ queueCount: queueState\.total, reviewCount: reviewJobs\.length \}\)/);
  assert.match(appJs, /frp-ops-v2-workspace/);
  assert.match(appJs, /frp-ops-v2-main-stack/);
  assert.match(appJs, /frp-ops-v2-side-stack/);
  assert.match(appJs, /data-frp-finalize="\$\{escapeHtml\(job\.id\)\}"/);
  assert.match(appJs, /data-frp-review="\$\{escapeHtml\(job\.id\)\}"/);
  assert.match(appJs, /data-frp-take-specific="\$\{escapeHtml\(job\.id\)\}"/);
  assert.match(appJs, /data-frp-show-proof="\$\{escapeHtml\(o\.id\)\}"/);
  assert.match(appJs, /data-frp-show-review="\$\{escapeHtml\(j\.id\)\}"/);
  assert.match(stylesCss, /\.frp-ops-v2-workspace\s*{[\s\S]*grid-template-columns:\s*minmax\(0, 1\.45fr\) minmax\(330px, 0\.8fr\);/);
  assert.match(stylesCss, /\.frp-ops-v2-status-strip\s*{[\s\S]*display:\s*flex;/);
});

test("operator specific take rejection refreshes stale active technician state", async () => {
  const appJs = await readFile(new URL("../public/app.js", import.meta.url), "utf8");

  assert.match(appJs, /async function takeSpecificFrpJob\(jobId\)/);
  assert.match(appJs, /catch \(error\) \{[\s\S]*frpMessage\.textContent = error\.message;[\s\S]*frpMessage\.dataset\.type = "error";[\s\S]*await refreshSession\(\);/);
});

test("operator current job actions follow ownership, not global active technician", async () => {
  const appJs = await readFile(new URL("../public/app.js", import.meta.url), "utf8");

  assert.match(appJs, /const myActiveJob = jobs\.find\(\(j\) => j\.status === "EN_PROCESO" && j\.technicianId === session\.user\?\.id\);/);
  assert.match(appJs, /function frpOpsV2RenderCurrentActive\(job, \{ swapInProgress, tech \}\)/);
  assert.match(appJs, /function frpOpsV2RenderActiveBanner\(jobId, \{ actionsDisabled = false \} = \{\}\)/);
  assert.match(appJs, /const actionsDisabled = swapInProgress;/);
  assert.match(appJs, /const disabledAttrs = actionsDisabled \? `disabled title="Cambio de tecnico en curso"` : "";/);
  assert.match(appJs, /frpOpsV2RenderActiveBanner\(job\.id, \{ actionsDisabled \}\)/);
  assert.match(appJs, /data-frp-finalize="\$\{escapeHtml\(job\.id\)\}"/);
  assert.match(appJs, /data-frp-review="\$\{escapeHtml\(job\.id\)\}"/);
  assert.match(appJs, /data-frp-cancel-timeout="\$\{escapeHtml\(jobId\)\}"/);
  assert.match(appJs, /currentHtml = frpOpsV2RenderCurrentActive\(myActiveJob, \{ swapInProgress, tech \}\);/);
});

test("operator review resolver cards are readonly for non-owner technicians", async () => {
  const appJs = await readFile(new URL("../public/app.js", import.meta.url), "utf8");

  assert.match(appJs, /function canResolveFrpReviewJob\(job\)/);
  assert.match(appJs, /\["ADMIN", "COORDINADOR"\]\.includes\(session\.user\?\.role\)/);
  assert.match(appJs, /job\?\.technicianId && job\.technicianId === session\.user\?\.id/);
  assert.match(appJs, /function frpOpsV2RenderAttentionGrid\(\{ pagosRevisar, reviewJobs, swapInProgress \}\)/);
  assert.match(appJs, /const canReview = canReviewFrpPayments\(\) && !swapInProgress;/);
  assert.match(appJs, /const disabledTitle = swapInProgress \? "Cambio de tecnico en curso" : "Permisos insuficientes";/);
  assert.match(appJs, /const canResolve = canResolveFrpReviewJob\(j\) && !swapInProgress;/);
  assert.match(appJs, /const reviewDisabledTitle = swapInProgress[\s\S]*\? "Cambio de tecnico en curso"[\s\S]*: "Solo quien reporto el caso, coordinador o administrador puede resolverlo";/);
  assert.match(appJs, /frpOpsV2RenderAttentionGrid\(\{ pagosRevisar, reviewJobs, swapInProgress \}\)/);
  assert.match(appJs, /canResolve \? "Resolver ->" : "Solo lectura"/);
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
