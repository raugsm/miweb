// Sesion 24 / corte 5 - render del Panel 4 (Conexion) como guia.
// Spec vigente: docs/specs/cliente/panel-4-conexion.md v2.0.
//
// QUE: el Panel 4 muestra SIEMPRE las cards Technician ID + Código del proceso
// + boton "¿Dónde pegar?" + boton Descargar. La diferencia entre estados es:
//   A — Inicial         : Card Código en placeholder, sin botón Copiar de
//                         Código, sin "Equipo conectado".
//   B — Comprobante     : Card Código sigue en placeholder, sin botón Copiar
//      en validacion      de Código, sin botón de conexión. Aplica tambien a
//      o rechazado        comprobante rechazado.
//   C — Pago aprobado   : Card Codigo con valor real + instrucciones. Sin
//      o servicio vivo    boton obligatorio de conexion.
//
// El modelo viejo de 6 estados (v1.0/v1.1) se reorganizó en estos 3 según la
// mini-spec de sesión 15c (commit a5a8a4c).
//
// MECANISMO DE PRUEBA durante 15c.1-bis (sin SSE/backend conectado):
//
//   window.__panel4DebugState = "A" | "B" | "C"
//   updatePanel4()
//
//   Datos hardcoded de prueba:
//     Technician ID:  1000 9983 5478  (siempre visible)
//     Código proceso: CL-20260504-001-2  (visible solo en C)
//
// El override sólo se aplica cuando window.__panel4DebugState es "A", "B" o "C".
// Si no, el render deriva del estado real de state.customer.orders[]:
//   - Sin orden                                                        → A
//   - Orden con publicStatus PAGO_EN_REVISION o PAGO_RECHAZADO          → B
//   - Orden con publicStatus EN_PREPARACION/LISTO_PARA_CONEXION/
//     EN_PROCESO/REQUIERE_ATENCION                                      → C
//   - Orden FINALIZADA o sin orden viva                                  → A
//
// Compatibilidad:
//   - notify-connected queda vivo para cache/clientes antiguos, pero oculto en UI.

import { $ } from "./dom.js";
import { state } from "./state.js";

const DEBUG_ORDER_CODE = "CL-20260504-001-2";
const PLACEHOLDER_CODE_TEXT = "Aparecerá cuando tu pago sea aprobado";

const VALID_DEBUG_STATES = new Set(["A", "B", "C"]);
const PREPARATION_STATES = new Set([
  "EN_PREPARACION",
  "LISTO_PARA_CONEXION",
  "EN_PROCESO",
  "REQUIERE_ATENCION",
]);

// Devuelve "A" | "B" | "C". Si hay override de debug en window, lo respeta.
// Sino deriva del state real.
function deriveState() {
  const override = typeof window !== "undefined" ? window.__panel4DebugState : null;
  if (override && VALID_DEBUG_STATES.has(String(override).toUpperCase())) {
    return String(override).toUpperCase();
  }

  const customer = state.customer;
  const orders = customer?.orders || [];

  // B — comprobante en validación o rechazado: PAGO_EN_REVISION o PAGO_RECHAZADO.
  const orderInReviewOrRejected = orders.find((order) => (
    order.publicStatus === "PAGO_EN_REVISION" || order.publicStatus === "PAGO_RECHAZADO"
  ));
  if (orderInReviewOrRejected) return "B";

  // C - pago aprobado o servicio activo: el cliente prepara/mantiene el equipo.
  const orderReadyForPreparation = orders.find((order) => PREPARATION_STATES.has(order.publicStatus));
  if (orderReadyForPreparation) return "C";

  // A — todo lo demás: sin orden, finalizado, o estados no contemplados.
  return "A";
}

// Devuelve la orden cuyo Technician ID y código son los que mostramos en
// las cards. Prioridad: orden activa post-clic (Tech ID congelado) > orden
// pre-clic > sin orden (caller decide hardcoded/SSE).
function orderForCards() {
  const orders = state.customer?.orders || [];
  // Tech ID congelado: orden post-pago o servicio activo.
  const orderActive = orders.find((order) => (
    PREPARATION_STATES.has(order.publicStatus)
  ));
  if (orderActive) return orderActive;
  // Validación en curso: conserva la orden para el copy de estado, pero el
  // código no se muestra hasta que el pago quede aprobado.
  const orderWithCode = orders.find((order) => (
    ["PAGO_EN_REVISION", "PAGO_RECHAZADO"].includes(order.publicStatus)
  ));
  return orderWithCode || null;
}

function panel4InstructionCopy(order, visualState) {
  if (order?.publicStatus === "PAGO_EN_REVISION") {
    return {
      kicker: "Pago en revisión",
      title: "Prepara Redirector",
      text: "Tu comprobante fue recibido. Puedes abrir Redirector y dejar el equipo listo mientras AriadGSM revisa el pago.",
    };
  }
  if (order?.publicStatus === "PAGO_RECHAZADO") {
    return {
      kicker: "Pago rechazado",
      title: "Revisa el comprobante",
      text: "Sube un nuevo comprobante desde el paso 3. El botón de conexión no desbloquea esta orden.",
    };
  }
  if (visualState === "C") {
    return {
      kicker: "Pago aprobado",
      title: "Mantén el equipo conectado",
      text: "Abre USB Redirector, conecta en modo sideload y no desconectes el equipo. AriadGSM puede procesar la orden sin otro botón.",
    };
  }
  return {
    kicker: "Paso 4",
    title: "Prepara el equipo",
    text: "Descarga Redirector y ten el equipo listo. Cuando subas el comprobante, la orden quedará en seguimiento automáticamente.",
  };
}

// Render principal. Llamado desde payments.js#updateQuote y disponible
// también en window.updatePanel4 para el debug manual.
export function updatePanel4(_context = {}) {
  const panel = $("#panel4");
  if (!panel) return;
  const visualState = deriveState();
  panel.dataset.state = visualState;

  const usingDebug = typeof window !== "undefined"
    && VALID_DEBUG_STATES.has(String(window.__panel4DebugState || "").toUpperCase());

  // Tech ID: siempre visible. Primero usa el ID congelado en la orden; si aun
  // no existe, usa el tecnico activo cargado por GET /api/portal/active-technician.
  const order = orderForCards();
  let technicianId = String(order?.technicianId || order?.redirectorId || "").trim();
  if (!technicianId && state.activeTechnician && !state.activeTechnician.swapInProgress) {
    technicianId = String(state.activeTechnician.redirectorId || "").trim();
  }
  const technicianText = technicianId
    || (state.activeTechnician?.swapInProgress ? "Cambio de técnico en curso" : "Técnico no disponible");

  // Código del proceso: real solo en estado C. En revisión/rechazo se mantiene
  // placeholder para no sugerir que el proceso técnico ya está listo.
  let orderCode = "";
  const canShowProcessCode = visualState === "C";
  if (canShowProcessCode) {
    orderCode = String(order?.shortCode || order?.code || "").trim();
    if (!orderCode && usingDebug) orderCode = DEBUG_ORDER_CODE;
  }

  const tidValue = $("#panel4TechIdValue");
  const tidCopyBtn = $("#panel4TechIdCopy");
  const codeValue = $("#panel4OrderCodeValue");
  const codeCopyBtn = $("#panel4OrderCodeCopy");
  const statusKicker = $("#panel4StatusKicker");
  const statusTitle = $("#panel4StatusTitle");
  const statusText = $("#panel4StatusText");

  if (tidValue) {
    tidValue.textContent = technicianText;
    tidValue.classList.toggle("is-placeholder", !technicianId);
  }
  if (tidCopyBtn) {
    tidCopyBtn.dataset.copyValue = technicianId;
    tidCopyBtn.hidden = !technicianId;
  }

  if (codeValue) {
    if (orderCode) {
      codeValue.textContent = orderCode;
      codeValue.classList.remove("is-placeholder");
    } else {
      codeValue.textContent = PLACEHOLDER_CODE_TEXT;
      codeValue.classList.add("is-placeholder");
    }
  }
  if (codeCopyBtn) {
    codeCopyBtn.dataset.copyValue = orderCode;
    codeCopyBtn.hidden = !orderCode;
  }

  const instruction = panel4InstructionCopy(order, visualState);
  if (statusKicker) statusKicker.textContent = instruction.kicker;
  if (statusTitle) statusTitle.textContent = instruction.title;
  if (statusText) statusText.textContent = instruction.text;
}

// Helper de feedback "Copiado ✓" 1500ms — copiado del patrón de
// panel-3-account.js#flashCopyFeedback. Cada botón mantiene su propio timer.
const copyTimers = new WeakMap();
export function flashPanel4CopyFeedback(button) {
  if (!button) return;
  const original = button.dataset.originalLabel || button.textContent;
  if (!button.dataset.originalLabel) button.dataset.originalLabel = original;
  button.textContent = "Copiado ✓";
  button.classList.add("is-copied");
  const previous = copyTimers.get(button);
  if (previous) clearTimeout(previous);
  const timer = setTimeout(() => {
    button.textContent = original;
    button.classList.remove("is-copied");
    copyTimers.delete(button);
  }, 1500);
  copyTimers.set(button, timer);
}

// Handler del click en botones "Copiar" de las cards. Usa
// navigator.clipboard.writeText() para escribir el valor exacto del
// data-copy-value. Si no hay valor, no-op.
export async function handlePanel4Copy(button) {
  if (!button) return;
  const value = String(button.dataset.copyValue || "").trim();
  if (!value) return;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      const helper = document.createElement("textarea");
      helper.value = value;
      document.body.appendChild(helper);
      helper.select();
      document.execCommand("copy");
      helper.remove();
    }
    flashPanel4CopyFeedback(button);
  } catch {
    // Falla silenciosa.
  }
}

// Exposición global para debug manual desde la consola del navegador.
if (typeof window !== "undefined") {
  window.updatePanel4 = updatePanel4;
}
