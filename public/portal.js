import { startAdminConfigStream } from "./portal-modules/admin-config-stream.js?v=s16-fix008";
import { renderCustomer } from "./portal-modules/auth-forms.js?v=s16-fix007";
import { applyEmailVerification } from "./portal-modules/deep-links.js?v=s19-verify001";
import { setMessage, $ } from "./portal-modules/dom.js?v=s16-fix007";
import { wireEvents } from "./portal-modules/events.js?v=s16-fix009";
import { configureOrderRenderer } from "./portal-modules/orders.js?v=s16-fix007";
import { loadSession } from "./portal-modules/session.js?v=s16-fix007";

// Cleanup one-time del localStorage del banner viejo "Listo para conectar?".
// La key era `ariad.paso4ReadyDismissed.<orderId>`, una por orden.
try {
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key && key.startsWith("ariad.paso4ReadyDismissed.")) keysToRemove.push(key);
  }
  keysToRemove.forEach((key) => localStorage.removeItem(key));
} catch {
  // localStorage indisponible; sin accion necesaria.
}

configureOrderRenderer({ onCustomerUpdate: renderCustomer });
wireEvents();

async function bootPortal() {
  const hasEmailVerificationToken = new URLSearchParams(location.search).has("verifyEmail");
  if (hasEmailVerificationToken) {
    await applyEmailVerification();
  }
  await loadSession();
  // Arrancar el stream admin-config despues de loadSession para que `state.catalog`
  // este hidratado antes de recibir el primer evento.
  startAdminConfigStream();
}

bootPortal()
  .catch((error) => setMessage($("#authMessage"), error.message, "error"));
