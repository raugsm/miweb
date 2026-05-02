import { api } from "./api.js";
import { operationCode, stepGuideMarkup } from "./connection.js";
import { wireCopyButtonsWithin } from "./technician.js";
import { $, copyText, escapeHtml, setMessage } from "./dom.js";
import { money } from "./format.js";
import {
  compactOrderMeta,
  customerNextAction,
  itemStatusLabel,
  orderAlertText,
  orderBadges,
  orderHasPaymentProof,
  ordersDisplayState,
  sortOrdersForDisplay,
  statusLabel,
  trackingStage,
  trackingStageLabel,
} from "./order-state.js";
import { state } from "./state.js";

let customerUpdateHandler = () => {};

export function configureOrderRenderer({ onCustomerUpdate } = {}) {
  customerUpdateHandler = typeof onCustomerUpdate === "function" ? onCustomerUpdate : () => {};
}

// QUE: punto de entrada para que otros modulos (live-orders SSE) gatillen el
// re-render completo del cliente sin importar auth-forms directamente.
// POR QUE: renderCustomer corre applyFlowState + updateFlowPaymentDropzone +
// applyStep4Visibility — necesario para que la transicion approve/reject del
// operador propague al paso 4 / paso 3 banner / locks.
export function notifyCustomerUpdated() {
  customerUpdateHandler();
}

// QUE: pinta los banners contextuales segun el estado de presentacion (PR-0.6 + PR-2a.3).
// POR QUE: estados 1-3 piden banners visuales especificos dentro de la card de orden.
// El existing .order-alert (amarillo generico) no es suficiente para distinguir
// "validando" (azul info) vs "rechazado" (rojo) vs "esperando conexion" (verde+azul)
// vs "precio subio" (naranja con 3 botones).
function renderOrderStateBanners(card, order, displayState) {
  const banners = card.querySelector(".order-state-banners");
  if (!banners) return;
  banners.innerHTML = "";
  if (!displayState) {
    banners.hidden = true;
    return;
  }
  if (displayState === "price_decision_required") {
    const locked = Number(order.priceLocked || 0).toFixed(2);
    const current = Number(order.currentUnitPrice || 0).toFixed(2);
    const delta = (Number(order.currentUnitPrice || 0) - Number(order.priceLocked || 0)).toFixed(2);
    banners.innerHTML = `
      <div class="order-state-banner is-price-up" role="alert" data-order-id="${escapeHtml(order.id)}">
        <strong>El precio del Xiaomi FRP subió.</strong>
        <span>Tu precio anclado: <b>${escapeHtml(locked)} USDT</b> · ahora: <b>${escapeHtml(current)} USDT</b> (+${escapeHtml(delta)} USDT por unidad).</span>
        <span>¿Qué querés hacer?</span>
        <div class="price-decision-buttons">
          <button type="button" class="ghost" data-price-action="second_proof" data-order-id="${escapeHtml(order.id)}">Subir 2do comprobante por la diferencia</button>
          <button type="button" class="ghost" data-price-action="wait" data-order-id="${escapeHtml(order.id)}">Esperar 1 hora a que baje</button>
          <button type="button" class="ghost danger" data-price-action="cancel" data-order-id="${escapeHtml(order.id)}">Cancelar y pedir reembolso</button>
        </div>
        <p class="price-decision-help">Reembolso manual vía ${escapeHtml(order.paymentLabel || "el método elegido")}, usualmente menos de 1 hora en horario activo.</p>
      </div>
    `;
    banners.hidden = false;
    // El order-alert generico amarillo no aplica aqui — esta accion crítica pisa.
    card.querySelector(".order-alert")?.classList.add("hidden");
    return;
  }
  if (displayState === "payment_review") {
    banners.innerHTML = `
      <div class="order-state-banner is-review" role="status">
        <span class="order-state-pulse" aria-hidden="true"></span>
        <div>
          <strong>Validando comprobante.</strong>
          <span>Te avisaremos en cuanto el técnico apruebe el pago.</span>
        </div>
      </div>
    `;
  } else if (displayState === "payment_rejected") {
    const reason = String(order.paymentRejectedReason || "").trim() || "Comprobante rechazado.";
    banners.innerHTML = `
      <div class="order-state-banner is-rejected" role="alert">
        <strong>Tu pago fue rechazado.</strong>
        <span>Motivo: ${escapeHtml(reason)} Subí un nuevo comprobante.</span>
      </div>
    `;
    // El order-alert generico amarillo dice lo mismo en otro tono — lo silenciamos
    // para evitar repetir el mensaje en dos cajas distintas.
    card.querySelector(".order-alert")?.classList.add("hidden");
  } else if (displayState === "awaiting_connection") {
    banners.innerHTML = `
      <div class="order-state-banner is-confirmed" role="status">
        <strong>Pago confirmado por nuestro técnico.</strong>
      </div>
      <div class="order-state-banner is-connect-prompt" role="status">
        <strong>Conectá tu equipo para continuar.</strong>
        <span>Andá al paso 4, descargá el Redirector y apretá <em>Equipo conectado</em>.</span>
      </div>
    `;
  }
  banners.hidden = false;
}

function makeUploadProofButton() {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "order-primary-button";
  btn.textContent = "Subir nuevo comprobante";
  btn.addEventListener("click", () => {
    const dropzone = document.querySelector("#flowPaymentDropzone");
    if (!dropzone) return;
    dropzone.scrollIntoView({ behavior: "smooth", block: "center" });
    // Disparamos el file picker tras el scroll para que el cliente pueda elegir
    // archivo sin un segundo tap.
    setTimeout(() => {
      if (dropzone.dataset.disabled !== "true") dropzone.click();
    }, 350);
  });
  return btn;
}

function makeGoToStep4Button() {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "order-primary-button";
  btn.textContent = "Ir al paso 4";
  btn.addEventListener("click", () => {
    const step4 = document.querySelector(".flow-connect-card");
    if (!step4 || step4.hidden) return;
    step4.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  return btn;
}

export function orderCopyText(order) {
  return [
    `Pedido ${order.code}`,
    `${order.serviceName}`,
    `Equipos: ${order.quantity}`,
    `Total: ${order.priceFormatted || money(order.totalPrice)}`,
    `Estado: ${statusLabel(order.publicStatus)}`,
    `Proxima accion: ${customerNextAction(order)}`,
    `Seguimiento: ${location.origin}/cliente?orden=${encodeURIComponent(order.code)}&codigo=${encodeURIComponent(order.accessCode || "")}`,
  ].join("\n");
}

export function orderDoneText(order) {
  const doneItems = (order?.items || []).filter((item) => item.ardCode || item.finalLog);
  const lines = [
    `${order.priceFormatted || money(order.totalPrice)} - Done`,
    ...doneItems.map((item) => item.ardCode || operationCode(order, item)),
    "",
    order.serviceName || "Xiaomi FRP Express",
    ...doneItems.map((item) => item.finalLog).filter(Boolean),
  ];
  return lines.filter((line, index) => line || lines[index - 1]).join("\n").trim();
}

export function trackingMarkup(order) {
  const stage = trackingStage(order);
  const steps = [
    { code: "RECEIVED", label: "Pedido recibido" },
    { code: "PROCESS", label: "En proceso" },
    { code: "DONE", label: "Done" },
  ];
  const activeIndex = steps.findIndex((step) => step.code === stage);
  return `
    <strong>Seguimiento</strong>
    <div class="tracking-steps" aria-label="Estado principal del pedido">
      ${steps.map((step, index) => `
        <span class="tracking-step ${index < activeIndex ? "done" : ""} ${index === activeIndex ? "active" : ""}">
          ${escapeHtml(step.label)}
        </span>
      `).join("")}
    </div>
  `;
}

export function renderOrders(orders) {
  const list = $("#ordersList");
  list.innerHTML = "";
  if (!orders.length) {
    const empty = document.createElement("p");
    empty.className = "message";
    empty.textContent = "Todavia no tienes ordenes.";
    list.append(empty);
    return;
  }
  const template = $("#orderTemplate");
  sortOrdersForDisplay(orders).forEach((order) => {
    const card = template.content.firstElementChild.cloneNode(true);
    const stage = trackingStage(order);
    const displayState = ordersDisplayState(order);
    card.classList.toggle("is-finalized", stage === "DONE");
    if (displayState) card.dataset.displayState = displayState;
    $(".order-code", card).textContent = order.code;
    $(".order-service", card).textContent = order.serviceName;
    const statusPill = $(".status-pill", card);
    if (displayState === "price_decision_required") {
      statusPill.textContent = "Decidí: precio subió";
      statusPill.dataset.stage = "price_decision_required";
    } else if (displayState === "payment_review") {
      statusPill.textContent = "Pago en revisión";
      statusPill.dataset.stage = "payment_review";
    } else if (displayState === "payment_rejected") {
      statusPill.textContent = "Pago rechazado";
      statusPill.dataset.stage = "payment_rejected";
    } else if (displayState === "awaiting_connection") {
      statusPill.textContent = "Esperando conexión";
      statusPill.dataset.stage = "awaiting_connection";
    } else {
      statusPill.textContent = trackingStageLabel(order);
      statusPill.dataset.stage = stage.toLowerCase();
    }
    $(".order-meta", card).textContent = compactOrderMeta(order);
    // PR-2a-final.1: indicador "Precio asegurado" — copy + dato de vencimiento
    // (lock 15 min con renovacion). Se oculta cuando el lock expiro Y el costo
    // subio (el frontend muestra 3 opciones en ese caso). Si el costo es favorable
    // o igual, server renueva silencioso y el cliente sigue viendo el banner
    // verde con la nueva expiracion.
    const lockNode = $(".order-lock", card);
    if (lockNode) {
      const lockedAmount = Number(order.priceLocked || 0);
      const expiresAtMs = Date.parse(order.priceLockExpiresAt || "");
      const currentUnit = Number(order.currentUnitPrice || 0);
      const nowMs = Date.now();
      const isExpiredAndUp = Number.isFinite(expiresAtMs) && expiresAtMs <= nowMs && currentUnit > lockedAmount;
      if (lockedAmount > 0 && Number.isFinite(expiresAtMs) && !isExpiredAndUp) {
        const expires = new Date(expiresAtMs);
        const expiresStr = expires.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
        lockNode.textContent = `🔒 Precio asegurado: ${lockedAmount.toFixed(2)} USDT por equipo · vence ${expiresStr}`;
        lockNode.hidden = false;
      } else {
        lockNode.textContent = "";
        lockNode.hidden = true;
      }
    }
    const inCompatibilityReview = order.publicStatus === "REVISION_COMPATIBILIDAD";
    $(".tracking-panel", card).innerHTML = trackingMarkup(order);
    const alertText = orderAlertText(order);
    const alertNode = $(".order-alert", card);
    alertNode.classList.toggle("hidden", !alertText);
    alertNode.textContent = alertText;
    renderOrderStateBanners(card, order, displayState);
    if (displayState === "price_decision_required") {
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
    $(".next-action", card).innerHTML = [
      `<strong>Proxima accion</strong>`,
      `<span>${escapeHtml(customerNextAction(order))}</span>`,
      orderBadges(order).length ? `<div class="order-badges">${orderBadges(order).map((badge) => `<em>${escapeHtml(badge)}</em>`).join("")}</div>` : "",
    ].join("");
    $(".payment-block", card).innerHTML = [
      "<strong>Pago</strong>",
      inCompatibilityReview
        ? "<span>En revision de compatibilidad.</span>"
        : `<span>${escapeHtml(orderHasPaymentProof(order) ? "Comprobante recibido." : "Pendiente en paso 3.")}</span>`,
    ].join("");
    $(".item-list", card).innerHTML = (order.items || []).map((item) => {
      const detail = [item.model, item.imei].filter(Boolean).join(" / ") || "Equipo sin detalle";
      const done = item.ardCode ? ` - ${item.ardCode}` : "";
      const message = item.eligibilityMessage || item.reviewReason || "";
      const reason = message ? `<br><small class="danger-text">${escapeHtml(message)}</small>` : "";
      return `<div class="item-row">#${item.sequence} ${escapeHtml(detail)}<br><small>${escapeHtml(itemStatusLabel(item.status))}${escapeHtml(done)}</small>${reason}</div>`;
    }).join("");
    const connectionCodes = (order.items || []).map((item) => `
      <div class="connection-code-row">
        <span>#${item.sequence} ${escapeHtml(item.model || item.raw || "Equipo")}</span>
        <code>${escapeHtml(operationCode(order, item))}</code>
      </div>
    `).join("");
    $(".connection-block", card).innerHTML = `
      <strong>Preparacion de conexion</strong>
      <span>Sigue los 4 pasos: descarga, sideload, copia datos, conecta.</span>
      ${stepGuideMarkup({
        order,
        technicianState: state.activeTechnician,
        customerName: state.customer?.client?.name || "",
        customerModuleUrl: state.catalog?.customerModuleUrl || state.customerModuleUrl || "",
      })}
      <div class="connection-codes">${connectionCodes || `<div class="connection-code-row"><span>Equipo</span><code>${escapeHtml(operationCode(order))}</code></div>`}</div>
    `;
    wireCopyButtonsWithin($(".connection-block", card));
    const loggedCustomer = Boolean(state.customer?.user && state.customer?.client);
    const copyOrderButton = $(".copy-order", card);
    const details = $(".order-details", card);
    const detailsToggle = $(".details-toggle", card);
    const primary = $(".order-primary", card);
    const canPrepareConnection = (order.paymentProofs || []).length > 0
      || order.postpayStatus === "APROBADO"
      || ["PAGO_EN_REVISION", "EN_PREPARACION", "LISTO_PARA_CONEXION", "EN_PROCESO"].includes(order.publicStatus);
    copyOrderButton.textContent = stage === "DONE" ? "Copiar Done" : "Copiar datos";
    const openDetails = () => {
      const isOpen = details.classList.toggle("hidden") === false;
      detailsToggle.textContent = isOpen ? "Ocultar detalles" : "Ver detalles";
      detailsToggle.setAttribute("aria-expanded", String(isOpen));
    };
    detailsToggle.addEventListener("click", openDetails);
    const detailsPrimaryButton = document.createElement("button");
    detailsPrimaryButton.type = "button";
    detailsPrimaryButton.className = "order-primary-button";
    detailsPrimaryButton.textContent = alertText ? "Ver indicacion" : "Ver detalles";
    detailsPrimaryButton.addEventListener("click", openDetails);
    const setPrimaryAction = (element) => {
      if (!element) return;
      element.classList.add("order-primary-button");
      primary.append(element);
    };
    if (displayState === "price_decision_required") {
      // Las 3 acciones viven en el banner naranja. Sin primary button extra.
    } else if (displayState === "payment_rejected") {
      setPrimaryAction(makeUploadProofButton());
    } else if (displayState === "awaiting_connection") {
      setPrimaryAction(makeGoToStep4Button());
    } else if (stage === "DONE") {
      setPrimaryAction(copyOrderButton);
    } else if (inCompatibilityReview || order.publicStatus === "REQUIERE_ATENCION") {
      setPrimaryAction(detailsPrimaryButton);
    } else {
      setPrimaryAction(detailsPrimaryButton);
    }
    copyOrderButton.addEventListener("click", () => copyText(stage === "DONE" ? orderDoneText(order) : orderCopyText(order), $(".order-message", card)));
    list.append(card);
  });
}
