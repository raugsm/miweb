import { api } from "./api.js";
import { escapeHtml, setMessage } from "./dom.js";
import { state } from "./state.js";

const bannerId = "guestClaimBanner";

function candidateCodes() {
  return (state.customer?.guestClaimCandidates || [])
    .map((candidate) => candidate.code)
    .filter(Boolean);
}

function existingBanner() {
  return document.getElementById(bannerId);
}

export function renderGuestClaimBanner() {
  existingBanner()?.remove();
  const codes = candidateCodes();
  const logged = Boolean(state.customer?.user && state.customer?.client);
  if (!logged || !codes.length) return;
  const target = document.querySelector("#appPanel .app-header");
  if (!target) return;
  const banner = document.createElement("section");
  banner.id = bannerId;
  banner.className = "guest-claim-banner";
  banner.innerHTML = `
    <div>
      <strong>Encontramos ${codes.length} orden${codes.length === 1 ? "" : "es"} anterior${codes.length === 1 ? "" : "es"} con tu WhatsApp.</strong>
      <span>${codes.map((code) => escapeHtml(code)).join(" · ")}</span>
      <p class="message" id="guestClaimMessage" aria-live="polite"></p>
    </div>
    <div class="guest-claim-actions">
      <button type="button" class="primary-btn" data-guest-claim="confirm">Asociar a mi cuenta</button>
      <button type="button" class="ghost" data-guest-claim="dismiss">Ahora no</button>
    </div>
  `;
  target.insertAdjacentElement("afterend", banner);
}

async function confirmGuestClaim() {
  const message = document.getElementById("guestClaimMessage");
  setMessage(message, "");
  const payload = await api("/api/portal/guest/claim", {
    method: "POST",
    body: JSON.stringify({ confirm: true, codes: candidateCodes() }),
  });
  state.customer = payload.customer;
  setMessage(message, `Ordenes asociadas: ${payload.claimed || 0}.`, "success");
  document.dispatchEvent(new CustomEvent("ariad:customer-updated"));
}

export function wireGuestClaimEvents() {
  document.addEventListener("click", (event) => {
    const action = event.target?.dataset?.guestClaim;
    if (!action) return;
    if (action === "dismiss") {
      existingBanner()?.remove();
      state.customer.guestClaimCandidates = [];
      return;
    }
    confirmGuestClaim().catch((error) => {
      setMessage(document.getElementById("guestClaimMessage"), error.message, "error");
    });
  });
}
