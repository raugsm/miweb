import { renderCustomer } from "./portal-modules/auth-forms.js";
import { applyEmailVerification, applyQueryTracking } from "./portal-modules/deep-links.js";
import { setMessage, $ } from "./portal-modules/dom.js";
import { wireEvents } from "./portal-modules/events.js";
import { configureOrderRenderer } from "./portal-modules/orders.js";
import { loadSession } from "./portal-modules/session.js";

configureOrderRenderer({ onCustomerUpdate: renderCustomer });
wireEvents();
loadSession()
  .then(applyEmailVerification)
  .then(applyQueryTracking)
  .catch((error) => setMessage($("#authMessage"), error.message, "error"));
