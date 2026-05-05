import { $ } from "./dom.js";
import { normalizeForMatch } from "./format.js";
import { state } from "./state.js";

// Sub-commit 15a.1: stepper del panel 2 reescrito al spec panel-2-solicitud.md
// v1.0 §2.1 — input numérico EDITABLE A MANO (no más span). Cap frontend 1-10
// (decisión D3 sesión 15). Si cliente tipea >10, events.js lo cap a 10 + dispara
// cajón verde "Para más de 10 equipos, contactanos por WhatsApp" (15s).
//
// Backend sigue aceptando hasta 50 (server/portal/portal-routes.js#444 mantiene
// `Math.max(1, Math.min(50, ...))`) — NO se reduce en 15a.1, decisión D3.
const QUANTITY_MIN = 1;
const QUANTITY_MAX_FRONTEND = 10;

export function detectedItemCount() {
  const input = $("#panel2QuantityInput");
  const raw = input?.value || $("#orderForm input[name='quantity']")?.value || String(QUANTITY_MIN);
  const parsed = Number.parseInt(raw, 10);
  return Math.max(QUANTITY_MIN, Math.min(QUANTITY_MAX_FRONTEND, Number.isFinite(parsed) && parsed > 0 ? parsed : QUANTITY_MIN));
}

export function syncDetectedItems() {
  const count = detectedItemCount();
  const input = $("#panel2QuantityInput");
  if (input && input.value !== String(count)) input.value = String(count);
  const quantityHidden = $("#orderForm input[name='quantity']");
  if (quantityHidden) quantityHidden.value = String(count);
  return count;
}

export function setQuantity(next) {
  const safe = Math.max(QUANTITY_MIN, Math.min(QUANTITY_MAX_FRONTEND, Number.parseInt(next, 10) || QUANTITY_MIN));
  const input = $("#panel2QuantityInput");
  if (input) input.value = String(safe);
  const quantityHidden = $("#orderForm input[name='quantity']");
  if (quantityHidden) quantityHidden.value = String(safe);
  return safe;
}

// QUE: equivalente a setQuantity pero PERMITE valores fuera del rango — útil
// para detectar el caso "cliente tipeó >10" antes del cap. events.js lo usa
// para disparar el cajón verde de WhatsApp.
// Devuelve `{ value, capped }` donde `capped` es true si el valor excedió el
// rango y fue ajustado.
export function clampQuantityWithFlag(raw) {
  const parsed = Number.parseInt(String(raw || "").replace(/[^\d]/g, ""), 10);
  if (!Number.isFinite(parsed)) return { value: QUANTITY_MIN, capped: false };
  if (parsed > QUANTITY_MAX_FRONTEND) return { value: QUANTITY_MAX_FRONTEND, capped: true };
  if (parsed < QUANTITY_MIN) return { value: QUANTITY_MIN, capped: false };
  return { value: parsed, capped: false };
}

// QUE: estimacion del cliente. Devuelve `base` (precio nominal por unidad,
// constante — panel 1 siempre lo muestra), `unit` (precio efectivo con tier
// por volumen / monthly / VIP aplicado, usado en total), `total` (= unit * qty),
// `discountPct` (señal interna del beneficio, 0 si normal) e `isVip` (flag para
// que el panel 2 oculte el badge de volumen).
// POR QUE: spec panel-2-solicitud.md v1.3 §8 — descuentos por volumen sobre la
// ganancia objetivo. La UI evita mostrar "-X%" porque no descuenta sobre el total.
export function estimatePortalPrice(quantity) {
  const qty = Math.max(1, Math.min(50, Number.parseInt(quantity, 10) || 1));
  const service = state.catalog?.services?.[0];
  const base = Number(service?.baseUnitPrice || 25);
  const benefit = state.customer?.benefit;
  // Sub-commit 15a.5: VIP detectado por status="VIP" o vipEffectiveUnitPrice>0.
  // Para VIP, panel 2 NO muestra badge/label/aviso de volumen (spec §8).
  const isVip = String(state.customer?.client?.status || "").toUpperCase() === "VIP"
    || Number(benefit?.vipEffectiveUnitPrice || 0) > 0;
  if (!benefit?.usableNow) {
    return { unit: base, base, total: base * qty, label: "Precio base. Beneficios bloqueados para este dispositivo.", discountPct: 0, isVip };
  }
  const tiers = state.catalog?.quantityTiers || [];
  // Sub-commit 15a.5: VIP saltea volume tiers — sólo VIP price aplica.
  const quantityTier = !isVip
    ? tiers.filter((tier) => qty >= Number(tier.minQty || 0))
        .sort((a, b) => Number(a.unitPrice) - Number(b.unitPrice))[0]
    : null;
  const monthlyUsage = Number(state.customer?.monthlyUsage || 0);
  const monthlyTier = (state.catalog?.monthlyTiers || [])
    .filter((tier) => monthlyUsage >= Number(tier.minJobs || 0))
    .sort((a, b) => Number(a.unitPrice) - Number(b.unitPrice))[0];
  // PR-2a.5-fix: precio VIP = costo proveedor + vipUnitMargin (calculado en backend
  // y expuesto como vipEffectiveUnitPrice). Al cambiar el costo del proveedor, este
  // valor cambia automaticamente — el margen del operador se preserva.
  const vipEffective = Number(benefit.vipEffectiveUnitPrice || 0);
  const vipTier = vipEffective > 0 ? { unitPrice: vipEffective, label: "VIP aprobado", discountPct: 0 } : null;
  const selected = [quantityTier, monthlyTier, vipTier]
    .filter(Boolean)
    .sort((a, b) => Number(a.unitPrice) - Number(b.unitPrice))[0] || { unitPrice: base, label: "Precio normal", discountPct: 0 };
  return {
    unit: Number(selected.unitPrice || base),
    base,
    total: Number(selected.unitPrice || base) * qty,
    label: selected.label || "Precio normal",
    discountPct: Number(selected.discountPct || 0),
    isVip,
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
