import { startAdminConfigStream } from "./portal-modules/admin-config-stream.js";
import { renderCustomer } from "./portal-modules/auth-forms.js";
import { applyEmailVerification, applyQueryTracking } from "./portal-modules/deep-links.js";
import { setMessage, $ } from "./portal-modules/dom.js";
import { wireEvents } from "./portal-modules/events.js";
import { configureOrderRenderer } from "./portal-modules/orders.js";
import { wirePaso4BannerActions } from "./portal-modules/paso4-timer.js";
import { loadSession } from "./portal-modules/session.js";

configureOrderRenderer({ onCustomerUpdate: renderCustomer });
wireEvents();
wirePaso4BannerActions();
loadSession()
  .then(() => {
    // Sub-commit 15a.2: arrancamos el stream admin-config DESPUÉS de loadSession
    // para que `state.catalog` esté hidratado antes de recibir el primer evento
    // (los handlers asumen que `state.catalog.exchangeRates` y `paymentMethods`
    // existen). El stream es global y se mantiene abierto incluso sin login.
    startAdminConfigStream();
  })
  .then(applyEmailVerification)
  .then(applyQueryTracking)
  .catch((error) => setMessage($("#authMessage"), error.message, "error"));
