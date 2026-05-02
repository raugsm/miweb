import { api } from "./api.js";
import { $, escapeHtml, setMessage } from "./dom.js";
import { money } from "./format.js";
import {
  ordersDisplayState,
  sortOrdersForDisplay,
} from "./order-state.js";
import { state } from "./state.js";

let customerUpdateHandler = () => {};

export function configureOrderRenderer({ onCustomerUpdate } = {}) {
  customerUpdateHandler = typeof onCustomerUpdate === "function" ? onCustomerUpdate : () => {};
}

// Punto de entrada para que otros modulos (live-orders SSE) gatillen el
// re-render completo del cliente sin importar auth-forms directamente.
export function notifyCustomerUpdated() {
  customerUpdateHandler();
}

// PR-2a-final.bundle2 item 4 — Mis Ordenes solo muestra ordenes en TRABAJO
// ACTIVO segun FINAL §8. Pre-conexion (PAGO_EN_REVISION/RECHAZADO/
// EN_PREPARACION sin customerConnectedAt) vive inline en pasos 3/4. Estados
// visibles aqui:
//   - LISTO_PARA_CONEXION: cliente conecto, esperando tecnico
//   - EN_PROCESO: tecnico tomo, procesando
//   - FINALIZADO: completado, cliente puede descargar comprobante
//   - REQUIERE_ATENCION: hubo problema durante procesamiento
const VISIBLE_IN_MY_ORDERS = new Set([
  "LISTO_PARA_CONEXION",
  "EN_PROCESO",
  "FINALIZADO",
  "REQUIERE_ATENCION",
]);

const STATUS_PILL_LABELS = {
  LISTO_PARA_CONEXION: { label: "Listo para conexión", stage: "ready" },
  EN_PROCESO: { label: "En proceso", stage: "process" },
  FINALIZADO: { label: "Finalizado", stage: "done" },
  REQUIERE_ATENCION: { label: "Requiere atención", stage: "warn" },
};

function statusPillFor(order) {
  return STATUS_PILL_LABELS[order.publicStatus] || { label: order.publicStatus || "Pedido", stage: "received" };
}

function buildHelpUrl(order) {
  const code = order?.code || "";
  const message = encodeURIComponent(
    `Hola, necesito ayuda con mi orden ${code}. Estado actual: ${order?.publicStatus || ""}.`
  );
  return `https://wa.me/51993357553?text=${message}`;
}

function renderProgress(card, order) {
  const node = card.querySelector(".order-progress");
  if (!node) return;
  const items = order.items || [];
  if (!items.length) {
    node.hidden = true;
    return;
  }
  const procesados = items.filter((item) => item.status === "FINALIZADO").length;
  const procesando = items.filter((item) => item.status === "EN_PROCESO").length;
  const total = items.length;
  const pct = total > 0 ? Math.round((procesados / total) * 100) : 0;
  const procesandoText = procesando > 0 ? ` · ${procesando} procesando ahora` : "";
  const pendientes = total - procesados - procesando;
  const pendientesText = pendientes > 0 ? ` · ${pendientes} pendiente${pendientes === 1 ? "" : "s"}` : "";
  node.innerHTML = `
    <div class="order-progress-line">
      <span><b>${procesados}</b> de ${total} procesados${procesandoText}${pendientesText}</span>
      <span class="order-progress-pct">${pct}%</span>
    </div>
    <div class="order-progress-bar">
      <span class="order-progress-fill" style="width: ${pct}%"></span>
    </div>
  `;
  node.hidden = false;
}

function renderActivityLog(card, order) {
  const list = card.querySelector(".order-activity-timeline");
  if (!list) return;
  const events = order.activityLog || [];
  if (!events.length) {
    list.innerHTML = `<li class="order-activity-empty">Sin actividad registrada todavía.</li>`;
    return;
  }
  list.innerHTML = events.map((event) => {
    const date = new Date(event.at);
    const time = date.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
    const day = date.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
    const actorTag = event.actor === "customer" ? ' <em class="order-activity-self">(vos)</em>' : "";
    const inProgress = event.inProgress ? " is-in-progress" : "";
    return `
      <li class="order-activity-event${inProgress}">
        <span class="order-activity-time">${escapeHtml(day)} ${escapeHtml(time)}</span>
        <span class="order-activity-label">${escapeHtml(event.label)}${actorTag}</span>
      </li>
    `;
  }).join("");
}

function renderLockBanner(card, order) {
  const lockNode = card.querySelector(".order-lock");
  if (!lockNode) return;
  const lockedAmount = Number(order.priceLocked || 0);
  const expiresAtMs = Date.parse(order.priceLockExpiresAt || "");
  const currentUnit = Number(order.currentUnitPrice || 0);
  const isExpiredAndUp = Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now() && currentUnit > lockedAmount;
  if (lockedAmount > 0 && Number.isFinite(expiresAtMs) && !isExpiredAndUp) {
    const expires = new Date(expiresAtMs).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
    lockNode.textContent = `🔒 Precio asegurado: ${lockedAmount.toFixed(2)} USDT por equipo · vence ${expires}`;
    lockNode.hidden = false;
  } else {
    lockNode.textContent = "";
    lockNode.hidden = true;
  }
}

function renderPriceDecisionBanner(card, order) {
  const banners = card.querySelector(".order-state-banners");
  if (!banners) return;
  banners.innerHTML = "";
  banners.hidden = true;
  if (ordersDisplayState(order) !== "price_decision_required") return;
  const locked = Number(order.priceLocked || 0).toFixed(2);
  const current = Number(order.currentUnitPrice || 0).toFixed(2);
  const delta = (Number(order.currentUnitPrice || 0) - Number(order.priceLocked || 0)).toFixed(2);
  banners.innerHTML = `
    <div class="order-state-banner is-price-up" role="alert">
      <strong>El precio del Xiaomi FRP subió.</strong>
      <span>Tu precio anclado: <b>${escapeHtml(locked)} USDT</b> · ahora: <b>${escapeHtml(current)} USDT</b> (+${escapeHtml(delta)} USDT por unidad).</span>
      <span>¿Qué querés hacer?</span>
      <div class="price-decision-buttons">
        <button type="button" class="ghost" data-price-action="second_proof">Subir 2do comprobante por la diferencia</button>
        <button type="button" class="ghost" data-price-action="wait">Esperar 1 hora a que baje</button>
        <button type="button" class="ghost danger" data-price-action="cancel">Cancelar y pedir reembolso</button>
      </div>
      <p class="price-decision-help">Reembolso manual vía ${escapeHtml(order.paymentLabel || "el método elegido")}, usualmente menos de 1 hora en horario activo.</p>
    </div>
  `;
  banners.hidden = false;
  card.querySelectorAll("[data-price-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const action = btn.dataset.priceAction;
      const cardMessage = card.querySelector(".order-message");
      if (action === "cancel" && !window.confirm("¿Cancelar la orden? El reembolso es manual y se procesa usualmente en menos de 1 hora en horario activo.")) {
        return;
      }
      card.querySelectorAll("[data-price-action]").forEach((b) => { b.disabled = true; });
      setMessage(cardMessage, "Registrando tu decisión...");
      try {
        const payload = await api(`/api/portal/orders/${order.id}/price-decision`, {
          method: "POST",
          body: JSON.stringify({ action }),
        });
        if (payload?.customer) state.customer = payload.customer;
        customerUpdateHandler();
        if (action === "second_proof") {
          const dropzone = document.querySelector("#flowPaymentDropzone");
          if (dropzone) {
            dropzone.scrollIntoView({ behavior: "smooth", block: "center" });
            setTimeout(() => {
              if (dropzone.dataset.disabled !== "true") dropzone.click();
            }, 350);
          }
        }
      } catch (error) {
        setMessage(cardMessage, error.message, "error");
        card.querySelectorAll("[data-price-action]").forEach((b) => { b.disabled = false; });
      }
    });
  });
}

export function renderOrders(orders) {
  const list = $("#ordersList");
  list.innerHTML = "";
  const visible = (orders || []).filter((order) => VISIBLE_IN_MY_ORDERS.has(order.publicStatus));
  if (!visible.length) {
    const empty = document.createElement("p");
    empty.className = "message";
    empty.textContent = "Todavía no tenés órdenes en proceso.";
    list.append(empty);
    return;
  }
  const template = $("#orderTemplate");
  sortOrdersForDisplay(visible).forEach((order) => {
    const card = template.content.firstElementChild.cloneNode(true);
    const pill = statusPillFor(order);
    card.dataset.publicStatus = order.publicStatus;
    card.querySelector(".order-code").textContent = order.code;
    card.querySelector(".order-meta").textContent = `${order.quantity} equipo${Number(order.quantity) === 1 ? "" : "s"} · ${order.priceFormatted || money(order.totalPrice)}`;
    const statusPill = card.querySelector(".status-pill");
    statusPill.textContent = pill.label;
    statusPill.dataset.stage = pill.stage;

    renderLockBanner(card, order);
    renderProgress(card, order);
    renderPriceDecisionBanner(card, order);
    renderActivityLog(card, order);

    // PR-2a-final.bundle2 item 4 — botones Comprobante (PDF) + Ayuda.
    // El endpoint /api/portal/orders/:id/comprobante.pdf lo provee item 4C
    // (PR siguiente). Hasta que aterrice, el link existe pero devuelve 404.
    const comprobanteLink = card.querySelector("[data-order-action='comprobante']");
    if (comprobanteLink) {
      comprobanteLink.href = `/api/portal/orders/${order.id}/comprobante.pdf?accessCode=${encodeURIComponent(order.accessCode || "")}`;
      // Solo habilitado en FINALIZADO — antes no hay servicio completo para certificar.
      const isFinalized = order.publicStatus === "FINALIZADO";
      comprobanteLink.classList.toggle("is-disabled", !isFinalized);
      comprobanteLink.setAttribute("aria-disabled", String(!isFinalized));
      if (!isFinalized) {
        comprobanteLink.title = "Disponible cuando la orden esté finalizada.";
        comprobanteLink.addEventListener("click", (event) => {
          if (!isFinalized) event.preventDefault();
        });
      }
    }
    const helpLink = card.querySelector("[data-order-action='help']");
    if (helpLink) helpLink.href = buildHelpUrl(order);

    list.append(card);
  });
}
