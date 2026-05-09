import { api } from "./api.js";
import { renderCatalog, renderCustomer } from "./auth-forms.js";
import { loadGuestState, renderGuest } from "./guest.js";
import { state } from "./state.js";
import { loadActiveTechnician } from "./technician.js";

export async function loadSession() {
  const [sessionPayload] = await Promise.all([
    api("/api/portal/session"),
    loadActiveTechnician(),
  ]);
  state.customer = sessionPayload.customer;
  state.catalog = sessionPayload.catalog;
  if (state.catalog?.customerModuleUrl) state.customerModuleUrl = state.catalog.customerModuleUrl;
  renderCatalog();
  renderCustomer();
  if (state.customer?.user) {
    renderGuest();
  } else {
    await loadGuestState();
  }
}
