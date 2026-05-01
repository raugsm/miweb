import { escapeHtml } from "./dom.js";

export function operationCode(order, item = null) {
  const base = order?.code || "CL-YYYYMMDD-001";
  const sequence = Number(item?.sequence || 1);
  return `${base}-${String(sequence).padStart(2, "0")}`;
}

export function connectionGuideText(order = null) {
  const firstItem = order?.items?.[0] || null;
  const ticketCode = order ? operationCode(order, firstItem) : "CL-YYYYMMDD-001-01";
  return [
    "AriadGSM - Conexion Xiaomi FRP Express",
    order?.code ? `Pedido: ${order.code}` : "",
    "",
    "1. Abre USB Redirector Technician Edition.",
    "2. En Technician ID escribe la DDNS indicada por AriadGSM.",
    `3. En Additional information escribe: ${ticketCode}`,
    "4. Pulsa Connect y no desconectes el equipo mientras el tecnico procesa.",
    "",
    "Cuando estes listo, marca 'Estoy listo para conectar' en el portal.",
  ].filter(Boolean).join("\n");
}

export function redirectorMiniGuideMarkup(order = null) {
  const firstItem = order?.items?.[0] || null;
  const code = order ? operationCode(order, firstItem) : "CL-YYYYMMDD-001-01";
  return `
    <div class="redirector-mini" aria-label="Guia visual USB Redirector">
      <div class="redirector-stage">
        <div class="redirector-screen redirector-welcome">
          <div class="usb-cover" aria-hidden="true"></div>
          <div>
            <strong>Welcome to USB Redirector</strong>
            <span>Technician Edition</span>
          </div>
          <button class="redirector-next" type="button" disabled>Next</button>
        </div>
        <div class="redirector-screen redirector-connect">
          <div class="window-bar">Connect With Technician</div>
          <label>Technician ID <code class="typed-value typed-ddns">DDNS AriadGSM</code></label>
          <label>Additional information <code class="typed-value typed-code">${escapeHtml(code)}</code></label>
          <button class="redirector-connect-button" type="button" disabled>Connect</button>
        </div>
      </div>
    </div>
  `;
}
