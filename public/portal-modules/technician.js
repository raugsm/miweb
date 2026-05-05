import { api } from "./api.js";
import { state } from "./state.js";

export async function loadActiveTechnician() {
  try {
    const payload = await api("/api/portal/active-technician");
    state.activeTechnician = payload.technician || null;
    return state.activeTechnician;
  } catch {
    return state.activeTechnician;
  }
}

export function startTechnicianPolling(onUpdate, intervalMs = 5_000) {
  stopTechnicianPolling();
  const refresh = async () => {
    const previous = state.activeTechnician;
    const next = await loadActiveTechnician();
    if (typeof onUpdate === "function") {
      const snapPrev = previous ? `${previous.redirectorId || ""}|${previous.swapInProgress}|${previous.swapSecondsLeft}` : "";
      const snapNext = next ? `${next.redirectorId || ""}|${next.swapInProgress}|${next.swapSecondsLeft}` : "";
      if (snapPrev !== snapNext) onUpdate(next);
    }
  };
  refresh();
  state.technicianPollTimer = setInterval(refresh, Math.max(1_000, intervalMs));
}

export function stopTechnicianPolling() {
  if (state.technicianPollTimer) {
    clearInterval(state.technicianPollTimer);
    state.technicianPollTimer = null;
  }
}

export function wireCopyButtonsWithin(root) {
  if (!root) return;
  root.querySelectorAll("[data-copy-target]").forEach((button) => {
    if (button.dataset.copyWired) return;
    button.dataset.copyWired = "true";
    button.addEventListener("click", async () => {
      const field = button.closest(".copy-field");
      const codeEl = field?.querySelector("[data-copy-value]");
      const value = codeEl?.textContent?.trim() || "";
      if (!value) return;
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(value);
        } else {
          const range = document.createRange();
          range.selectNodeContents(codeEl);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          document.execCommand("copy");
          sel.removeAllRanges();
        }
        if (field) {
          field.dataset.copied = "true";
          button.dataset.copied = "true";
          setTimeout(() => {
            field.dataset.copied = "false";
            button.dataset.copied = "false";
          }, 1_500);
        }
      } catch {
        // silencio: sin clipboard, el usuario puede seleccionar manualmente
      }
    });
  });
}
