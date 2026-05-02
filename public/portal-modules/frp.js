import { $ } from "./dom.js";
import { normalizeForMatch } from "./format.js";
import { state } from "./state.js";

// PR-2a-final.fase2: paso 2 reescrito al spec FINAL §5 — sin textarea.
// detectedItemCount lee del stepper (#flowQuantityDisplay) y respeta el rango
// 1-50. syncDetectedItems refleja al hidden input que se manda en el body.
export function detectedItemCount() {
  const display = $("#flowQuantityDisplay");
  const raw = display?.textContent || $("#orderForm input[name='quantity']")?.value || "1";
  const parsed = Number.parseInt(raw, 10);
  return Math.max(1, Math.min(50, Number.isFinite(parsed) && parsed > 0 ? parsed : 1));
}

export function syncDetectedItems() {
  const count = detectedItemCount();
  const display = $("#flowQuantityDisplay");
  if (display) display.textContent = String(count);
  const quantityInput = $("#orderForm input[name='quantity']");
  if (quantityInput) quantityInput.value = String(count);
  return count;
}

export function setQuantity(next) {
  const safe = Math.max(1, Math.min(50, Number.parseInt(next, 10) || 1));
  const display = $("#flowQuantityDisplay");
  if (display) display.textContent = String(safe);
  const quantityInput = $("#orderForm input[name='quantity']");
  if (quantityInput) quantityInput.value = String(safe);
  return safe;
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

// PR-2a-final.fase2: parseItems acepta opcionalmente el modelo del buscador
// inverso para tagear todos los items con ese hint. Si no hay modelo, items
// quedan sin texto (cliente acepta default). El backend ya tolera empty.
export function parseItems(modelHint, quantity) {
  const trimmed = String(modelHint || "").trim();
  const fallback = trimmed
    ? { raw: trimmed, model: trimmed, imei: "" }
    : { raw: "", model: "", imei: "" };
  return Array.from({ length: quantity }, () => ({ ...fallback }));
}

// PR-2a-final.fase2: chequea un texto del buscador inverso contra
// state.catalog.eligibilityHints. FINAL §5 — solo verifica los NO soportados.
// Devuelve { status, message }. Si no hay match, asume soportado.
export function checkEligibilityHint(text) {
  const value = String(text || "").trim();
  if (!value) return { status: "EMPTY", message: "" };
  const target = ` ${normalizeForMatch(value)} `;
  const hints = state.catalog?.eligibilityHints || [];
  for (const hint of hints) {
    if (hint.status === "APTO_EXPRESS") continue;
    const matched = (hint.aliases || []).some((alias) => target.includes(` ${normalizeForMatch(alias)} `));
    if (matched) {
      return {
        status: hint.status,
        message: hint.publicMessage || (hint.status === "NO_APTO_MODO"
          ? "Este modelo no aplica para FRP Express. Contactanos por WhatsApp 3."
          : "Este modelo necesita revisión rápida antes de continuar."),
      };
    }
  }
  return { status: "ASSUMED_OK", message: "✓ Asumimos compatible (98% modelos lo están)." };
}
