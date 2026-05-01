import { $ } from "./dom.js";
import { normalizeForMatch } from "./format.js";
import { state } from "./state.js";

export function itemLinesFromText(text) {
  return String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

export function detectedItemCount() {
  const lines = itemLinesFromText($("#orderForm textarea[name='items']")?.value || "");
  return Math.max(1, Math.min(50, lines.length || 1));
}

export function syncDetectedItems() {
  const count = detectedItemCount();
  const quantityInput = $("#orderForm input[name='quantity']");
  if (quantityInput) quantityInput.value = String(count);
  const preview = $("#previewOperationCode");
  if (preview) {
    preview.textContent = count === 1
      ? "CL-YYYYMMDD-001-01"
      : `CL-YYYYMMDD-001-01 ... -${String(count).padStart(2, "0")}`;
  }
  return count;
}

export function estimatePortalPrice(quantity) {
  const qty = Math.max(1, Math.min(50, Number.parseInt(quantity, 10) || 1));
  const service = state.catalog?.services?.[0];
  const base = Number(service?.baseUnitPrice || 25);
  const benefit = state.customer?.benefit;
  if (!benefit?.usableNow) {
    return { unit: base, total: base * qty, label: "Precio base. Beneficios bloqueados para este dispositivo." };
  }
  const quantityTier = (state.catalog?.quantityTiers || [])
    .filter((tier) => qty >= Number(tier.minQty || 0))
    .sort((a, b) => Number(a.unitPrice) - Number(b.unitPrice))[0];
  const monthlyUsage = Number(state.customer?.monthlyUsage || 0);
  const monthlyTier = (state.catalog?.monthlyTiers || [])
    .filter((tier) => monthlyUsage >= Number(tier.minJobs || 0))
    .sort((a, b) => Number(a.unitPrice) - Number(b.unitPrice))[0];
  const vipTier = Number(benefit.vipUnitPrice || 0) > 0 ? { unitPrice: Number(benefit.vipUnitPrice), label: "VIP aprobado" } : null;
  const selected = [quantityTier, monthlyTier, vipTier]
    .filter(Boolean)
    .sort((a, b) => Number(a.unitPrice) - Number(b.unitPrice))[0] || { unitPrice: base, label: "Precio base" };
  return { unit: Number(selected.unitPrice || base), total: Number(selected.unitPrice || base) * qty, label: selected.label || "Precio base" };
}

export function customerCanRequestApprovalOptions() {
  const status = normalizeForMatch(state.customer?.client?.status || "");
  const markedClient = ["vip", "empresa"].includes(status);
  const benefit = state.customer?.benefit;
  return Boolean(markedClient || (benefit?.usableNow && Number(benefit?.vipUnitPrice || 0) > 0));
}

export function parseItems(text, quantity) {
  const lines = itemLinesFromText(text);
  return Array.from({ length: quantity }, (_, index) => {
    const line = lines[index] || "";
    const imei = (line.match(/\b\d{14,16}\b/) || [])[0] || "";
    return { raw: line, model: line.replace(imei, "").trim(), imei };
  });
}
