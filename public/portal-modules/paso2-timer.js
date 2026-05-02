// PR-2a-final.bundle2 item 2 — timer de inactividad paso 2.
// Empieza al renderCustomer cuando el cliente esta autenticado/verificado y
// no hay orden in-flight. 30s sin tocar stepper/pills/buscador → banner azul
// info. 90s sin tocar → banner amarillo (warn) con el precio actual.
// Cualquier interaccion resetea desde 0. Banner se oculta al avanzar a paso 3
// (subir comprobante mueve la orden a PAGO_EN_REVISION+).
//
// Modulo separado para evitar ciclos de import entre auth-forms y events.

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
  clearTimers();
  hidePaso2Banner();
  if (!paso2BannerActive()) return;
  paso2InactivityState.timer1 = setTimeout(() => {
    if (!paso2BannerActive()) return;
    showPaso2Banner("info");
    paso2InactivityState.timer2 = setTimeout(() => {
      if (!paso2BannerActive()) return;
      showPaso2Banner("warn");
    }, 60 * 1000);
  }, 30 * 1000);
}

export function stopPaso2InactivityTimer() {
  clearTimers();
  hidePaso2Banner();
}
