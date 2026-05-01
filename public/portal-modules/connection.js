import { escapeHtml } from "./dom.js";

export function operationCode(order, item = null) {
  const base = order?.code || "CL-YYYYMMDD-001";
  const sequence = Number(item?.sequence || 1);
  return `${base}-${String(sequence).padStart(2, "0")}`;
}


function customerCodeFor(order, customerName) {
  const code = operationCode(order, order?.items?.[0] || null);
  const name = String(customerName || "").trim();
  return name ? `${name} - ${code}` : code;
}

function downloadStepHtml(customerModuleUrl) {
  const url = String(customerModuleUrl || "").trim();
  if (!url) {
    return `<small>Pidelo por WhatsApp 3.</small>`;
  }
  return `<a class="download-btn" href="${escapeHtml(url)}" target="_blank" rel="noopener">Descargar Customer Module</a>`;
}

const CLIPBOARD_ICON_SVG = `<svg class="copy-icon copy-icon-clipboard" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="9" height="11" rx="1.5"></rect><path d="M6 3V2.25A1.25 1.25 0 0 1 7.25 1h2.5A1.25 1.25 0 0 1 11 2.25V3"></path></svg>`;
const CHECK_ICON_SVG = `<svg class="copy-icon copy-icon-check" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5l3 3 6-7"></path></svg>`;

function copyButtonHtml(target, ariaLabel) {
  return `<button type="button" class="copy-field-button" data-copy-target="${target}" aria-label="${ariaLabel}">${CLIPBOARD_ICON_SVG}${CHECK_ICON_SVG}</button>`;
}

function technicianFieldHtml(technicianState) {
  if (technicianState?.swapInProgress) {
    const seconds = Math.max(1, Number(technicianState.swapSecondsLeft || 0));
    return `<div class="swap-warning-banner" data-swap-banner="true">
      <strong>Estamos cambiando de tecnico</strong>
      Espera <span data-swap-countdown>${seconds}</span> segundos antes de conectar para evitar engancharte al ID equivocado.
    </div>`;
  }
  const id = String(technicianState?.redirectorId || "").trim();
  if (!id) {
    return `<div class="step-guide-empty" data-technician-empty="true">Tecnico todavia no asignado. Refresca en unos segundos.</div>`;
  }
  return `<div class="copy-field" data-copy-field="technicianId">
    <code data-copy-value>${escapeHtml(id)}</code>
    ${copyButtonHtml("technicianId", "Copiar Technician ID")}
  </div>`;
}

function customerCodeFieldHtml(order, customerName) {
  const value = customerCodeFor(order, customerName);
  return `<div class="copy-field" data-copy-field="customerCode">
    <code data-copy-value>${escapeHtml(value)}</code>
    ${copyButtonHtml("customerCode", "Copiar tu codigo")}
  </div>`;
}

export function stepGuideMarkup({ order = null, technicianState = null, customerName = "", customerModuleUrl = "" } = {}) {
  return `
    <div class="step-guide" data-step-guide="true">
      <div class="step-row">
        <div class="step-row-number">1</div>
        <div class="step-row-content">
          <strong>Descarga el Customer Module</strong>
          ${downloadStepHtml(customerModuleUrl)}
        </div>
      </div>
      <p class="step-guide-tutorial">
        <a href="#" data-tutorial-link="connect">¿Primera vez? Ver video tutorial</a>
      </p>
      <div class="step-row">
        <div class="step-row-number">2</div>
        <div class="step-row-content">
          <strong>Pega estos dos datos en el modulo</strong>
          <small>Technician ID</small>
          ${technicianFieldHtml(technicianState)}
          <small>Tu codigo</small>
          ${customerCodeFieldHtml(order, customerName)}
        </div>
      </div>
      <div class="step-row">
        <div class="step-row-number">3</div>
        <div class="step-row-content">
          <strong>Click en Connect dentro del modulo</strong>
          <small>No desconectes el equipo hasta recibir el Done.</small>
        </div>
      </div>
    </div>
  `;
}