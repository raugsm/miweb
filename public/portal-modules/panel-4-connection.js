// Sub-commit 15c.1 — render del Panel 4 (Conexión) estructura visual.
// Spec: docs/specs/cliente/panel-4-conexion.md v1.1 §1-§7.
//
// QUE: el Panel 4 muestra siempre el botón "Descargar Redirector v2.5" y un
// contenido central que cambia entre 6 estados visuales (0/1/2/5 idénticos =
// solo Descargar; 3 = botón "Equipo conectado" prominente; 4 = cards con
// Technician ID + Código + botón "¿Dónde pegar estos códigos?"). El render
// reactivo deriva el estado de state.customer.orders[] por el publicStatus.
//
// NO INCLUYE EN 15c.1: SSE, descarga real, modal "¿Dónde pegar?" (mantiene
// listener desde 15b.x), POST notify-connected. Esos van en 15c.2/15c.3/15c.4.
//
// MECANISMO DE PRUEBA durante 15c.1 (sin SSE/backend conectado):
//
//   window.__panel4DebugState = "0" | "1" | "2" | "3" | "4" | "5"
//   updatePanel4()
//
//   Estado 4 muestra datos hardcoded de prueba:
//     Technician ID:  1000 9983 5478
//     Código proceso: CL-20260504-001-2
//
// El override sólo se aplica cuando window.__panel4DebugState es uno de los
// 6 valores válidos. Si no, el render sigue derivando del estado real de
// state.customer.orders[].

import { $ } from "./dom.js";
import { state } from "./state.js";

// Datos de prueba para el estado 4 cuando se usa el debug override.
// En 15c.4 se reemplazan por datos reales que vienen del backend en la orden.
const DEBUG_TECHNICIAN_ID = "1000 9983 5478";
const DEBUG_ORDER_CODE = "CL-20260504-001-2";

const VALID_DEBUG_STATES = new Set(["0", "1", "2", "3", "4", "5"]);

// Devuelve el estado visual del Panel 4 (string "0" a "5"). Si hay override
// de debug en window, lo respeta. Sino deriva del state real.
function deriveState() {
  const override = typeof window !== "undefined" ? window.__panel4DebugState : null;
  if (override && VALID_DEBUG_STATES.has(String(override))) return String(override);

  const customer = state.customer;
  const orders = customer?.orders || [];
  const orderRejected = orders.find((order) => order.publicStatus === "PAGO_RECHAZADO");
  if (orderRejected) return "5";
  // Estado 4: orden activa post-clic en "Equipo conectado". El backend la
  // mueve a LISTO_PARA_CONEXION o EN_PROCESO. Hasta que el botón se conecte
  // en 15c.4, también consideramos EN_PREPARACION con customerConnectedAt
  // setteado como "post-clic".
  const orderActive = orders.find((order) => (
    ["LISTO_PARA_CONEXION", "EN_PROCESO"].includes(order.publicStatus)
    || (order.publicStatus === "EN_PREPARACION" && order.customerConnectedAt)
  ));
  if (orderActive) return "4";
  // Estado 3: comprobante validado, cliente aún no apretó "Equipo conectado".
  const orderValidated = orders.find((order) => (
    order.publicStatus === "EN_PREPARACION" && !order.customerConnectedAt
  ));
  if (orderValidated) return "3";
  const orderInReview = orders.find((order) => order.publicStatus === "PAGO_EN_REVISION");
  if (orderInReview) return "2";
  // Estados 0 y 1 visualmente idénticos (sin orden / armando pedido).
  // No los diferenciamos en este módulo — caemos al default.
  return "0";
}

// Devuelve la orden activa (estado 4) o validada (estado 3) — la que tiene
// los datos a mostrar en cards Technician ID + Código.
function activeOrderForPanel4() {
  const orders = state.customer?.orders || [];
  return orders.find((order) => (
    order.publicStatus === "EN_PREPARACION"
    || order.publicStatus === "LISTO_PARA_CONEXION"
    || order.publicStatus === "EN_PROCESO"
  )) || null;
}

// Render principal. Llamado desde payments.js#updateQuote y disponible
// también en window.updatePanel4 para el debug manual.
export function updatePanel4(_context = {}) {
  const panel = $("#panel4");
  if (!panel) return;
  const visualState = deriveState();
  panel.dataset.state = visualState;

  // data-empty="true" en estados 0/1/2/5 → CSS centra el botón Descargar
  // verticalmente en el alto del panel (sólo elemento visible).
  const content = $("#panel4Content");
  if (content) {
    const isEmpty = ["0", "1", "2", "5"].includes(visualState);
    content.dataset.empty = isEmpty ? "true" : "false";
  }

  const usingDebug = typeof window !== "undefined"
    && VALID_DEBUG_STATES.has(String(window.__panel4DebugState || ""));

  // Datos para cards del estado 4. Si hay debug override sin orden real,
  // usamos los hardcoded. En producción vienen de la orden activa.
  let technicianId = "";
  let orderCode = "";
  if (visualState === "4") {
    const order = activeOrderForPanel4();
    if (order) {
      technicianId = String(order.technicianId || order.redirectorId || "").trim();
      orderCode = String(order.code || "").trim();
    }
    if (!technicianId && usingDebug) technicianId = DEBUG_TECHNICIAN_ID;
    if (!orderCode && usingDebug) orderCode = DEBUG_ORDER_CODE;
  }

  const tidValue = $("#panel4TechIdValue");
  const tidCopyBtn = $("#panel4TechIdCopy");
  const codeValue = $("#panel4OrderCodeValue");
  const codeCopyBtn = $("#panel4OrderCodeCopy");
  if (tidValue) tidValue.textContent = technicianId || "—";
  if (codeValue) codeValue.textContent = orderCode || "—";
  if (tidCopyBtn) tidCopyBtn.dataset.copyValue = technicianId;
  if (codeCopyBtn) codeCopyBtn.dataset.copyValue = orderCode;
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

// Handler del click en botones "Copiar" del estado 4. Usa
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
    // Falla silenciosa — el botón no muestra feedback. En 15c.4 puede
    // agregarse error toast si el clipboard falla persistentemente.
  }
}

// Exposición global para debug manual desde la consola del navegador.
// En 15c.4 cuando el SSE esté conectado, este re-render se dispara solo;
// el override sigue funcionando para QA visual de los 6 estados.
if (typeof window !== "undefined") {
  window.updatePanel4 = updatePanel4;
}
