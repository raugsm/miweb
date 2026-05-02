import { $ } from "./dom.js";
// PR-2a-final.2: normalizeForMatch removido junto con customerCanRequestApprovalOptions.
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
  return count;
}

// QUE: estimacion del cliente. Devuelve `base` (precio nominal por unidad,
// constante FINAL §4 — paso 1 siempre lo muestra), `unit` (precio efectivo
// con tier por volumen / monthly / VIP aplicado, usado en total) y `total`
// (= unit * qty).
// POR QUE: paso 1 es "precio en vivo del momento por unidad sin descuento".
// El descuento por volumen se aplica al total del paso 2/3, no al unitario
// del paso 1. Antes paso 1 mostraba `unit` y caia con cantidades altas.
export function estimatePortalPrice(quantity) {
  const qty = Math.max(1, Math.min(50, Number.parseInt(quantity, 10) || 1));
  const service = state.catalog?.services?.[0];
  const base = Number(service?.baseUnitPrice || 25);
  const benefit = state.customer?.benefit;
  if (!benefit?.usableNow) {
    return { unit: base, base, total: base * qty, label: "Precio base. Beneficios bloqueados para este dispositivo." };
  }
  const quantityTier = (state.catalog?.quantityTiers || [])
    .filter((tier) => qty >= Number(tier.minQty || 0))
    .sort((a, b) => Number(a.unitPrice) - Number(b.unitPrice))[0];
  const monthlyUsage = Number(state.customer?.monthlyUsage || 0);
  const monthlyTier = (state.catalog?.monthlyTiers || [])
    .filter((tier) => monthlyUsage >= Number(tier.minJobs || 0))
    .sort((a, b) => Number(a.unitPrice) - Number(b.unitPrice))[0];
  // PR-2a.5-fix: precio VIP = costo proveedor + vipUnitMargin (calculado en backend
  // y expuesto como vipEffectiveUnitPrice). Al cambiar el costo del proveedor, este
  // valor cambia automaticamente — el margen del operador se preserva.
  const vipEffective = Number(benefit.vipEffectiveUnitPrice || 0);
  const vipTier = vipEffective > 0 ? { unitPrice: vipEffective, label: "VIP aprobado" } : null;
  const selected = [quantityTier, monthlyTier, vipTier]
    .filter(Boolean)
    .sort((a, b) => Number(a.unitPrice) - Number(b.unitPrice))[0] || { unitPrice: base, label: "Precio base" };
  return {
    unit: Number(selected.unitPrice || base),
    base,
    total: Number(selected.unitPrice || base) * qty,
    label: selected.label || "Precio base",
  };
}

// PR-2a-final.2: customerCanRequestApprovalOptions REMOVIDO — la UI de
// "Opciones sujetas a aprobacion" se elimino del portal. El postpago VIP
// queda manejado puramente por client.status="VIP" + benefit.vipUnitMargin
// (ver server.js#portalFrpPriceSuggestion).

export function parseItems(text, quantity) {
  const lines = itemLinesFromText(text);
  return Array.from({ length: quantity }, (_, index) => {
    const line = lines[index] || "";
    const imei = (line.match(/\b\d{14,16}\b/) || [])[0] || "";
    return { raw: line, model: line.replace(imei, "").trim(), imei };
  });
}
