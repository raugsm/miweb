import { escapeHtml } from "./dom.js";

export function operationCode(order, item = null) {
  const base = order?.code || "CL-YYYYMMDD-001";
  const sequence = Number(item?.sequence || 1);
  return `${base}-${String(sequence).padStart(2, "0")}`;
}

// PR-2a-final.fase4: "Código del proceso" formato FINAL §7 — orden + cantidad
// equipos (ej. "47892-5"). Fijo durante toda la orden (no por equipo).
export function processCode(order) {
  const base = String(order?.code || "").trim() || "CL-YYYYMMDD-000";
  const quantity = Math.max(1, Number(order?.quantity || 1));
  return `${base}-${quantity}`;
}

function downloadStepHtml(customerModuleUrl) {
  const url = String(customerModuleUrl || "").trim();
  if (!url) {
    return `<small>Pidelo por WhatsApp 3.</small>`;
  }
  return `<a class="redirector-download-btn" href="${escapeHtml(url)}" target="_blank" rel="noopener">Descargar Redirector v2.5</a>
    <small class="redirector-download-meta">Archivo firmado · No requiere instalación · 4.2 MB</small>`;
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

function processCodeFieldHtml(order) {
  const value = processCode(order);
  return `<div class="copy-field" data-copy-field="processCode">
    <code data-copy-value>${escapeHtml(value)}</code>
    ${copyButtonHtml("processCode", "Copiar Código del proceso")}
  </div>`;
}

// PR-2a-final.fase4: paso 4 al spec FINAL §7. Estructura:
//  - Banner verde "Pago confirmado. Tu orden está activa."
//  - Botón azul grande "Descargar Redirector v2.5" + meta del archivo
//  - Card datos: Technician ID + "Código del proceso" (formato 47892-5)
//  - Botón discreto "¿Dónde pegar estos códigos?" (modal)
//  - Link al pie "¿Necesitás más ayuda? Contactá por WhatsApp"
//
// ELIMINADO segun FINAL §7:
//  - Lista 4 pasos sideload ("Click en Connect dentro del modulo")
//  - Link "¿Primera vez? Ver video tutorial"
//  - "Tu codigo" → ahora "Código del proceso" con format orden-cantidad
//  - "Customer Module" → "Redirector v2.5"
export function stepGuideMarkup({ order = null, technicianState = null, customerModuleUrl = "" } = {}) {
  return `
    <div class="step-guide" data-step-guide="true">
      <div class="paso4-confirm-banner" role="status">
        <strong>Pago confirmado.</strong> Tu orden está activa.
      </div>
      <div class="paso4-download">
        ${downloadStepHtml(customerModuleUrl)}
      </div>
      <div class="paso4-credentials">
        <div class="paso4-cred-row">
          <small>Technician ID</small>
          ${technicianFieldHtml(technicianState)}
        </div>
        <div class="paso4-cred-row">
          <small>Código del proceso</small>
          ${processCodeFieldHtml(order)}
        </div>
      </div>
      <button type="button" class="paso4-where-paste-btn" data-action="open-where-paste">
        ¿Dónde pegar estos códigos?
      </button>
      <p class="paso4-help-link">
        <a href="https://wa.me/51993357553?text=Necesito%20ayuda%20con%20la%20conexion%20del%20Redirector"
           target="_blank" rel="noopener">¿Necesitás más ayuda? Contactá por WhatsApp</a>
      </p>
    </div>
  `;
}