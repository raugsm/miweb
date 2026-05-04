// Sub-commit 15a.2: listener del canal SSE admin-config (broadcast).
//
// Conecta a `GET /api/portal/admin-config/events` y escucha dos eventos:
//   - exchange_rate_changed: { currency, ratePerUsdt, updatedAt }
//   - payment_method_toggled: { code, active, customMessage }
//
// Cada evento muta `state.catalog` localmente (sin re-fetch), recalcula la
// quote y dispara los cajones del panel 1 cuando aplica. Cuando llega un
// evento que invalida la pill seleccionada del cliente (método desactivado),
// también limpia `localStorage.ariad_lastPill` y vuelve la card a "Cargando".
//
// EventSource ya hace reconnect automático (el server emite `retry: 5000\n\n`
// en el handshake inicial). El módulo expone `start()` y `stop()` para que
// portal.js controle el ciclo de vida.

import { hidePanelNotice, showPanelNotice } from "./panel-notices.js";
import {
  clearLastSelectedPill,
  readLastSelectedPill,
  renderPaymentPills,
  setSelectedPayment,
  updateQuote,
} from "./payments.js";
import { state } from "./state.js";

let stream = null;

function selectedPaymentCode() {
  return document.getElementById("paymentSelect")?.value || "";
}

function paymentByCode(code) {
  return (state.catalog?.paymentMethods || []).find((m) => m.code === code) || null;
}

// Handler `exchange_rate_changed`: muta state.catalog.exchangeRates, recalcula
// quote del panel 1 y panel 2, y muestra cajón "El tipo de cambio cambió,
// monto actualizado" SOLO si la moneda actualizada coincide con la pill
// seleccionada del cliente (decisión P-D2 sesión 15).
function handleExchangeRateChanged(data) {
  if (!data?.currency) return;
  const rates = state.catalog?.exchangeRates;
  if (!Array.isArray(rates)) return;
  const rate = rates.find((r) => r.currency === data.currency);
  if (rate) {
    rate.ratePerUsdt = Number(data.ratePerUsdt || 0);
    rate.updatedAt = String(data.updatedAt || "");
  } else {
    rates.push({
      currency: data.currency,
      ratePerUsdt: Number(data.ratePerUsdt || 0),
      updatedAt: String(data.updatedAt || ""),
      country: "",
    });
  }
  updateQuote();
  // Cajón solo si afecta al monto que el cliente está viendo.
  const selected = paymentByCode(selectedPaymentCode());
  if (selected && selected.currency === data.currency) {
    showPanelNotice("panel1EstimateNotice", "El tipo de cambio cambió, monto actualizado", {
      durationMs: 15000,
      variant: "warning",
      prevailIfExisting: true,
    });
  }
}

// Handler `payment_method_toggled`: muta state.catalog.paymentMethods, re-render
// pills, y si la pill seleccionada se desactivó: deselect, limpia localStorage,
// muestra cajón con customMessage o default (4s), card vuelve a "Cargando".
// Decisión P-D1 sesión 15 + spec panel-1 §3 edge 8.
function handlePaymentMethodToggled(data) {
  if (!data?.code) return;
  const methods = state.catalog?.paymentMethods;
  if (!Array.isArray(methods)) return;
  const method = methods.find((m) => m.code === data.code);
  if (!method) {
    // El método no estaba en el catálogo expuesto al portal (ej. PAYPAL sin
    // ticketOption). Ignorar — el cliente no lo ve igualmente.
    return;
  }
  method.active = data.active === false ? false : true;
  method.customMessage = typeof data.customMessage === "string" ? data.customMessage : "";

  const wasSelected = selectedPaymentCode() === data.code;

  if (wasSelected && method.active === false) {
    // Pill seleccionada se desactivó: deselect + limpia localStorage + cajón + reload visual.
    setSelectedPayment("");
    if (readLastSelectedPill() === data.code) clearLastSelectedPill();
    const fallbackMessage = method.customMessage || "No disponible temporalmente";
    showPanelNotice("panel1EstimateNotice", fallbackMessage, {
      durationMs: 4000,
      variant: "warning",
      prevailIfExisting: true,
    });
  }

  // En todos los casos re-renderizamos pills (la desactivada cambia opacity,
  // o reaparece activa si admin la reactivó) y recalculamos la quote.
  renderPaymentPills();
  updateQuote();

  // Caso "todos los métodos del país desactivados" (decisión P-E1): NO hay
  // auto-fallback. La card oscura del panel 1 ya muestra "—" como amount cuando
  // no hay pill seleccionada (vía updateQuote). El dot pasa a `loading`.
  // Si el cliente termina sin pill activa, debe contactar soporte.
}

export function startAdminConfigStream() {
  if (stream) return;
  if (!window.EventSource) return;
  stream = new EventSource("/api/portal/admin-config/events");
  stream.addEventListener("connected", () => {
    // Handshake: nada que hacer, sólo confirmación de que el canal está vivo.
  });
  stream.addEventListener("exchange_rate_changed", (event) => {
    try {
      handleExchangeRateChanged(JSON.parse(event.data || "{}"));
    } catch (error) {
      console.warn("[admin-config-stream] payload inválido:", error?.message || error);
    }
  });
  stream.addEventListener("payment_method_toggled", (event) => {
    try {
      handlePaymentMethodToggled(JSON.parse(event.data || "{}"));
    } catch (error) {
      console.warn("[admin-config-stream] payload inválido:", error?.message || error);
    }
  });
  stream.onerror = () => {
    // EventSource maneja reconnect automáticamente con el `retry: 5000` del
    // server. Solo logueamos por consola para visibilidad en dev.
    // Sin status visual al cliente — los cajones admin-config son nice-to-have,
    // no críticos para el flujo principal.
  };
}

export function stopAdminConfigStream() {
  if (!stream) return;
  stream.close();
  stream = null;
  hidePanelNotice("panel1EstimateNotice");
}
