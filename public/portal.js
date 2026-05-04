import { startAdminConfigStream } from "./portal-modules/admin-config-stream.js";
import { renderCustomer } from "./portal-modules/auth-forms.js";
import { applyEmailVerification, applyQueryTracking } from "./portal-modules/deep-links.js";
import { setMessage, $ } from "./portal-modules/dom.js";
import { wireEvents } from "./portal-modules/events.js";
import { configureOrderRenderer } from "./portal-modules/orders.js";
import { loadSession } from "./portal-modules/session.js";

// Sub-commit 15c.1: cleanup one-time del localStorage del banner viejo
// "¿Listo para conectar?" (paso4-timer.js eliminado). La key era
// `ariad.paso4ReadyDismissed.<orderId>` — una por orden. Iteramos las keys
// para limpiar todas. Inocuo si no hay ninguna.
try {
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key && key.startsWith("ariad.paso4ReadyDismissed.")) keysToRemove.push(key);
  }
  keysToRemove.forEach((key) => localStorage.removeItem(key));
} catch {
  // localStorage indisponible — sin acción necesaria.
}

configureOrderRenderer({ onCustomerUpdate: renderCustomer });
wireEvents();
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
