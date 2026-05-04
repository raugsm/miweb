// Sub-commit 15c.1-bis — render del Panel 4 (Conexión) modelo de 3 estados.
// Spec: docs/specs/cliente/panel-4-conexion.md v1.2 §2.1-§2.8 + §7.
//
// QUE: el Panel 4 muestra SIEMPRE las cards Technician ID + Código del proceso
// + botón "¿Dónde pegar?" + botón Descargar. La diferencia entre estados es:
//   A — Inicial         : Card Código en placeholder ("Aparecerá cuando subas
//                         tu pago"), sin botón Copiar de Código, sin "Equipo
//                         conectado".
//   B — Comprobante     : Card Código con valor real (con botón Copiar), sin
//      en validación      "Equipo conectado". Aplica también a comprobante
//      o rechazado        rechazado (el código se queda, ver spec §2.3).
//   C — Validado        : Igual que B + botón "Equipo conectado" prominente.
//      pre-clic
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
//     Código proceso: CL-20260504-001-2  (visible en B y C)
//
// El override sólo se aplica cuando window.__panel4DebugState es "A", "B" o "C".
// Si no, el render deriva del estado real de state.customer.orders[]:
//   - Sin orden                                                        → A
//   - Orden con publicStatus PAGO_EN_REVISION o PAGO_RECHAZADO          → B
//   - Orden con publicStatus EN_PREPARACION (post-validación pre-clic)  → C
//   - Orden con publicStatus LISTO_PARA_CONEXION/EN_PROCESO/FINALIZADO  → A
//     (el clic en "Equipo conectado" mueve la orden allí — el Panel 4 vuelve
//     a A; el Tech ID se "freeze-a" en la orden si aplica, ver spec §2.2)
//
// 15c.4 reemplaza:
//   - Tech ID hardcoded por consumo real de GET /api/portal/active-technician
//     y SSE para refresh en vivo.
//   - Botón "Equipo conectado" no-op por POST /api/portal/orders/:id/notify-connected.
//   - Botón Descargar no-op por descarga real del Redirector.

import { $ } from "./dom.js";
import { state } from "./state.js";

const DEBUG_TECHNICIAN_ID = "1000 9983 5478";
const DEBUG_ORDER_CODE = "CL-20260504-001-2";
const PLACEHOLDER_CODE_TEXT = "Aparecerá cuando subas tu pago";

const VALID_DEBUG_STATES = new Set(["A", "B", "C"]);

// Devuelve "A" | "B" | "C". Si hay override de debug en window, lo respeta.
// Sino deriva del state real.
function deriveState() {
  const override = typeof window !== "undefined" ? window.__panel4DebugState : null;
  if (override && VALID_DEBUG_STATES.has(String(override).toUpperCase())) {
    return String(override).toUpperCase();
  }

  const customer = state.customer;
  const orders = customer?.orders || [];

  // C — validado pre-clic: orden EN_PREPARACION sin customerConnectedAt.
  const orderValidatedPreClick = orders.find((order) => (
    order.publicStatus === "EN_PREPARACION" && !order.customerConnectedAt
  ));
  if (orderValidatedPreClick) return "C";

  // B — comprobante en validación o rechazado: PAGO_EN_REVISION o PAGO_RECHAZADO.
  const orderInReviewOrRejected = orders.find((order) => (
    order.publicStatus === "PAGO_EN_REVISION" || order.publicStatus === "PAGO_RECHAZADO"
  ));
  if (orderInReviewOrRejected) return "B";

  // A — todo lo demás: sin orden, post-clic (LISTO_PARA_CONEXION / EN_PROCESO /
  // FINALIZADO), o estados no contemplados. Spec §2.1 equivalencia: estado 4
  // antiguo (orden activa post-clic) → vuelve a A.
  return "A";
}

// Devuelve la orden cuyo Technician ID y código son los que mostramos en
// las cards. Prioridad: orden activa post-clic (Tech ID congelado) > orden
// pre-clic > sin orden (caller decide hardcoded/SSE).
function orderForCards() {
  const orders = state.customer?.orders || [];
  // Tech ID congelado: orden post-clic con LISTO_PARA_CONEXION / EN_PROCESO.
  const orderActive = orders.find((order) => (
    ["LISTO_PARA_CONEXION", "EN_PROCESO"].includes(order.publicStatus)
    || (order.publicStatus === "EN_PREPARACION" && order.customerConnectedAt)
  ));
  if (orderActive) return orderActive;
  // Pre-clic o validación en curso: orden con código real pero sin freeze.
  const orderWithCode = orders.find((order) => (
    ["EN_PREPARACION", "PAGO_EN_REVISION", "PAGO_RECHAZADO"].includes(order.publicStatus)
  ));
  return orderWithCode || null;
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

  // Tech ID: siempre visible. En 15c.4 viene de GET /api/portal/active-technician
  // (en vivo) o congelado de la orden post-clic. Hasta entonces, hardcoded.
  const order = orderForCards();
  let technicianId = String(order?.technicianId || order?.redirectorId || "").trim();
  if (!technicianId) technicianId = DEBUG_TECHNICIAN_ID;

  // Código del proceso: real en estados B y C, placeholder en estado A.
  let orderCode = "";
  if (visualState === "B" || visualState === "C") {
    orderCode = String(order?.code || "").trim();
    if (!orderCode && usingDebug) orderCode = DEBUG_ORDER_CODE;
  }

  const tidValue = $("#panel4TechIdValue");
  const tidCopyBtn = $("#panel4TechIdCopy");
  const codeValue = $("#panel4OrderCodeValue");
  const codeCopyBtn = $("#panel4OrderCodeCopy");

  if (tidValue) tidValue.textContent = technicianId || "—";
  if (tidCopyBtn) tidCopyBtn.dataset.copyValue = technicianId;

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
    // El botón Copiar de la card Código está oculto cuando se muestra el
    // placeholder (decisión 5 de la mini-spec). data-state="A" del panel padre
    // controla el `display: none` vía CSS.
  }
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
