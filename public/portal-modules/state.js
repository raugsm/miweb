// Estado global compartido entre todos los módulos del portal cliente.
//
// Persistencia adicional (NO vive acá, vive en localStorage):
//   - `ariad_lastPill` (sub-commit 15a.1): última pill del panel 1 elegida por
//     el cliente. Read/write helpers en `payments.js#readLastSelectedPill` /
//     `writeLastSelectedPill`. Clave global del browser; si el cliente cambia
//     de cuenta, la última pill recordada puede no matchear el país nuevo, en
//     cuyo caso `renderPaymentPills` cae al país del perfil.
export const state = {
  customer: null,
  guest: null,
  catalog: null,
  activeTab: "login",
  pollTimer: null,
  ordersStream: null,
  turnstileReady: null,
  activePaymentOrderId: "",
  activeTechnician: null,
  technicianPollTimer: null,
  customerModuleUrl: "",
  // Ultima fase de flujo conocida; usada para detectar la transicion non-draft -> draft
  // y disparar form.reset() solo cuando una orden cierra/cancela.
  lastFlowState: "draft",
};
