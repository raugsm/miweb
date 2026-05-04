// Sub-commit 15a.2: helpers compartidos para los cajones (notices) que viven
// dentro de las cards oscuras del panel 1 (`#panel1EstimateNotice`) y panel 2
// (`#panel2Notice`).
//
// Spec panel-1-metodo-de-pago.md §3 edge 10:
//   "Si los dos eventos coinciden temporalmente, prevalece el primero que se
//    disparó. El segundo evento aplica su lógica funcional pero su cajón NO
//    se muestra hasta que el primero termine su duración."
//
// Implementación: el flag `prevailIfExisting` controla si un nuevo show
// reemplaza un cajón visible o se descarta. events.js (interacciones del
// cliente) usa default `false` para que el último click reemplace al cajón
// previo (UX inmediata). admin-config-stream.js (eventos SSE remotos) usa
// `true` para respetar la regla del spec — un evento admin no pisa un cajón
// del cliente que ya está visible.
//
// hidePanelNotice() siempre fuerza el ocultamiento (sirve cuando la condición
// que disparó el cajón ya no aplica, ej. cliente corrige modelo no soportado).

const noticeTimers = new Map();

export function showPanelNotice(nodeId, content, { durationMs = 15000, variant = "warning", prevailIfExisting = false } = {}) {
  const node = document.getElementById(nodeId);
  if (!node) return;
  if (prevailIfExisting && noticeTimers.has(nodeId)) {
    // Cajón anterior sigue activo y la regla pide preservarlo: descartamos el nuevo.
    return;
  }
  if (noticeTimers.has(nodeId)) clearTimeout(noticeTimers.get(nodeId));
  node.textContent = content;
  node.dataset.variant = variant;
  node.hidden = false;
  if (durationMs > 0) {
    noticeTimers.set(nodeId, setTimeout(() => hidePanelNotice(nodeId), durationMs));
  }
}

export function hidePanelNotice(nodeId) {
  const node = document.getElementById(nodeId);
  if (noticeTimers.has(nodeId)) {
    clearTimeout(noticeTimers.get(nodeId));
    noticeTimers.delete(nodeId);
  }
  if (node) {
    node.hidden = true;
    node.textContent = "";
    node.removeAttribute("data-variant");
  }
}

export function hasPanelNotice(nodeId) {
  return noticeTimers.has(nodeId);
}
