// PR-2a-final.bundle2 item 2 — timer de inactividad paso 2 (DESHABILITADO en
// sub-commit 15a.1).
//
// HISTORIA: empezaba al renderCustomer cuando el cliente estaba autenticado/
// verificado y no había orden in-flight. 30s sin tocar stepper/pills/buscador
// → banner azul info. 90s sin tocar → banner amarillo (warn) con el precio
// actual. Banner DOM (#flowPaso2InactivityBanner) ya no existe en portal.html
// post sub-commit 15a.1.
//
// PAUSA (sesión 15, decisión D6): el sistema completo de tiempos (alertas
// escaladas, lock pricing, banners de inactividad) se está rediseñando como
// spec dedicada — ver HANDOFF "Inputs crudos para spec futura" → "Sistema de
// tiempo y alertas". Cuando esa spec esté lista, este módulo se reescribe o
// elimina. Mientras tanto las funciones quedan como no-op para que callers
// existentes (auth-forms.js#renderCustomer) sigan compilando.

import { state } from "./state.js";

const paso2InactivityState = { timer1: null, timer2: null };

const IN_FLIGHT_STATES = new Set([
  "PAGO_EN_REVISION",
  "EN_PREPARACION",
  "LISTO_PARA_CONEXION",
  "EN_PROCESO",
  "REVISION_COMPATIBILIDAD",
]);

function paso2BannerActive() {
  const customer = state.customer;
  if (!customer?.user || !customer?.client) return false;
  if (!customer.client.emailVerified) return false;
  // Solo cuando NO hay orden in-flight ni comprobante subido. Si ya esta en
  // PAGO_EN_REVISION+, no hace falta presionar (ya pago).
  return !(customer.orders || []).some((order) => IN_FLIGHT_STATES.has(order.publicStatus));
}

function showPaso2Banner(level) {
  const banner = document.querySelector("#flowPaso2InactivityBanner");
  if (!banner) return;
  const titleEl = banner.querySelector("[data-paso2-title]");
  const msgEl = banner.querySelector("[data-paso2-message]");
  if (!titleEl || !msgEl) return;
  if (level === "info") {
    banner.dataset.level = "info";
    titleEl.textContent = "💡 Los precios son en vivo";
    msgEl.textContent = "El costo del proveedor puede cambiar minuto a minuto. Pagá ahora para asegurar este precio por 15 minutos.";
  } else {
    banner.dataset.level = "warn";
    const display = document.querySelector("#flowQuantityUnitPrice");
    const priceText = (display?.textContent || "").trim() || "el precio actual";
    titleEl.textContent = "⚠️ El precio puede cambiar pronto";
    msgEl.textContent = `Llevás más de un minuto en esta página. Pagá para asegurar ${priceText} USDT.`;
  }
  banner.hidden = false;
}

function hidePaso2Banner() {
  const banner = document.querySelector("#flowPaso2InactivityBanner");
  if (banner) banner.hidden = true;
}

function clearTimers() {
  if (paso2InactivityState.timer1) clearTimeout(paso2InactivityState.timer1);
  if (paso2InactivityState.timer2) clearTimeout(paso2InactivityState.timer2);
  paso2InactivityState.timer1 = null;
  paso2InactivityState.timer2 = null;
}

export function resetPaso2InactivityTimer() {
  // Dormante en sub-commit 15a.1 — ver comentario al inicio del archivo.
  // No-op intencional: callers (auth-forms.js#renderCustomer) la siguen
  // invocando, y mantenemos la firma para no romper imports.
  clearTimers();
  hidePaso2Banner();
}

export function stopPaso2InactivityTimer() {
  // Dormante en sub-commit 15a.1 — ver comentario al inicio del archivo.
  clearTimers();
  hidePaso2Banner();
}
