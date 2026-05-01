export const state = {
  customer: null,
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