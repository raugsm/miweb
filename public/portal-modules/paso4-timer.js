// PR-2a-final.bundle2 item 3 — timer paso 4 post-aprobacion.
// Cuando el operador valida el pago, el cliente tiene 2 min para apretar
// "Equipo conectado". Si no lo hace, aparece un banner azul inline en paso 4
// con dos CTAs: "Ya estoy listo" (dismiss) y "Necesito ayuda por WhatsApp".
//
// Estado de "dismissed" persistido en localStorage por order.id — si el
// cliente cierra el banner una vez, no vuelve a aparecer aunque siga sin
// conectar (decision UX: no machacar).

import { activeOrderForFlow } from "./flow-state.js";
import { state } from "./state.js";

const TWO_MINUTES_MS = 2 * 60 * 1000;
let pollInterval = null;

function dismissedKey(orderId) {
  return `ariad.paso4ReadyDismissed.${orderId}`;
}

function isDismissed(orderId) {
  if (!orderId) return false;
  try {
    return localStorage.getItem(dismissedKey(orderId)) === "1";
  } catch {
    return false;
  }
}

function markDismissed(orderId) {
  if (!orderId) return;
  try {
    localStorage.setItem(dismissedKey(orderId), "1");
  } catch {
    // localStorage indisponible — el banner seguira mostrandose hasta que
    // la orden cambie de estado. No critical.
  }
}

function buildWhatsappLink(order) {
  const code = order?.code || "";
  const message = encodeURIComponent(
    `Hola, necesito ayuda para conectar mi equipo. Orden: ${code}`
  );
  return `https://wa.me/51993357553?text=${message}`;
}

function formatLockExpiry(order) {
  const expiresAtMs = Date.parse(order?.priceLockExpiresAt || "");
  if (!Number.isFinite(expiresAtMs)) return "";
  const expires = new Date(expiresAtMs);
  return expires.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

function evaluateBanner() {
  const banner = document.querySelector("#flowPaso4ReadyBanner");
  if (!banner) return;
  const order = activeOrderForFlow(state.customer);
  if (!order || order.publicStatus !== "EN_PREPARACION" || order.customerConnectedAt) {
    banner.hidden = true;
    return;
  }
  if (isDismissed(order.id)) {
    banner.hidden = true;
    return;
  }
  const approvalMs = Date.parse(order.paymentReviewedAt || "");
  if (!Number.isFinite(approvalMs)) {
    banner.hidden = true;
    return;
  }
  if (Date.now() - approvalMs < TWO_MINUTES_MS) {
    banner.hidden = true;
    return;
  }
  // Mostrar.
  const message = banner.querySelector("[data-paso4-message]");
  const dismissBtn = banner.querySelector("[data-paso4-action='dismiss']");
  const whatsappLink = banner.querySelector("[data-paso4-action='whatsapp']");
  const expiry = formatLockExpiry(order);
  if (message) {
    message.textContent = expiry
      ? `Tu precio está asegurado hasta las ${expiry}. Conectá tu equipo para que el técnico pueda procesarlo.`
      : "Conectá tu equipo para que el técnico pueda procesarlo.";
  }
  if (dismissBtn) dismissBtn.dataset.orderId = order.id;
  if (whatsappLink) whatsappLink.href = buildWhatsappLink(order);
  banner.hidden = false;
}

export function startPaso4ReadyMonitor() {
  if (pollInterval) clearInterval(pollInterval);
  // Chequeo cada 15s — suficiente para la granularidad de 2 min.
  pollInterval = setInterval(evaluateBanner, 15 * 1000);
  evaluateBanner();
}

export function stopPaso4ReadyMonitor() {
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = null;
  const banner = document.querySelector("#flowPaso4ReadyBanner");
  if (banner) banner.hidden = true;
}

export function refreshPaso4Banner() {
  evaluateBanner();
}

export function wirePaso4BannerActions() {
  const banner = document.querySelector("#flowPaso4ReadyBanner");
  if (!banner) return;
  banner.addEventListener("click", (event) => {
    const dismissBtn = event.target.closest("[data-paso4-action='dismiss']");
    if (!dismissBtn) return;
    event.preventDefault();
    const orderId = dismissBtn.dataset.orderId || activeOrderForFlow(state.customer)?.id;
    markDismissed(orderId);
    banner.hidden = true;
  });
}
