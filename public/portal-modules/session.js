import { api } from "./api.js";
import { renderCatalog, renderCustomer } from "./auth-forms.js";
import { state } from "./state.js";

export async function loadSession() {
  const payload = await api("/api/portal/session");
  state.customer = payload.customer;
  state.catalog = payload.catalog;
  renderCatalog();
  renderCustomer();
}
