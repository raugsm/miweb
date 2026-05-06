const authView = document.querySelector("#auth-view");
const dashboardView = document.querySelector("#dashboard-view");
const authMessage = document.querySelector("#auth-message");
const loginForm = document.querySelector("#login-form");
const registerForm = document.querySelector("#register-form");
const resetPasswordForm = document.querySelector("#reset-password-form");
const completeResetForm = document.querySelector("#complete-reset-form");
const resetTokenInput = document.querySelector("#reset-token-input");
const loginTab = document.querySelector("#login-tab");
const registerTab = document.querySelector("#register-tab");
const resetTab = document.querySelector("#reset-tab");
const loginPinField = document.querySelector("#login-pin-field");
const loginPinLabel = document.querySelector("#login-pin-label");
const setupTokenField = document.querySelector("#setup-token-field");
const setupTokenNote = document.querySelector("#setup-token-note");
const welcomeTitle = document.querySelector("#welcome-title");
const roleBadge = document.querySelector("#role-badge");
const adminChannelSwitcher = document.querySelector("#admin-channel-switcher");
const adminOperationalChannel = document.querySelector("#admin-operational-channel");
const currentRoleLabel = document.querySelector("#current-role-label");
const activeUsersCount = document.querySelector("#active-users-count");
const pendingUsersLabel = document.querySelector("#pending-users-label");
const pendingUsersCount = document.querySelector("#pending-users-count");
const workflowTitle = document.querySelector("#workflow-title");
const workflowStepList = document.querySelector("#workflow-step-list");
const changePasswordForm = document.querySelector("#change-password-form");
const changePasswordMessage = document.querySelector("#change-password-message");
const operatorPinForm = document.querySelector("#operator-pin-form");
const operatorPinMessage = document.querySelector("#operator-pin-message");
const revokeDevicesButton = document.querySelector("#revoke-devices-button");
const deviceApprovalsPanel = document.querySelector("#device-approvals-panel");
const usersTable = document.querySelector("#users-table");
const auditList = document.querySelector("#audit-list");
const pricingRatesTable = document.querySelector("#pricing-rates-table");
const pricingRulesTable = document.querySelector("#pricing-rules-table");
const pricingMessage = document.querySelector("#pricing-message");
const dailyCloseDate = document.querySelector("#daily-close-date");
const refreshDailyCloseButton = document.querySelector("#refresh-daily-close");
const exportDailyCloseButton = document.querySelector("#export-daily-close");
const closeDailyCloseButton = document.querySelector("#close-daily-close");
const reopenDailyCloseButton = document.querySelector("#reopen-daily-close");
const dailyCloseNotes = document.querySelector("#daily-close-notes");
const dailyCloseSummary = document.querySelector("#daily-close-summary");
const dailyCloseMessage = document.querySelector("#daily-close-message");
const dailyAdjustmentForm = document.querySelector("#daily-adjustment-form");
const dailyAdjustmentCurrency = document.querySelector("#daily-adjustment-currency");
const dailyAdjustmentPayment = document.querySelector("#daily-adjustment-payment");
const dailyAdjustmentChannel = document.querySelector("#daily-adjustment-channel");
const dailyAdjustmentService = document.querySelector("#daily-adjustment-service");
const dailyCurrencyTable = document.querySelector("#daily-currency-table");
const dailyPaymentTable = document.querySelector("#daily-payment-table");
const dailyChannelTable = document.querySelector("#daily-channel-table");
const dailyServiceTable = document.querySelector("#daily-service-table");
const dailyTechnicianTable = document.querySelector("#daily-technician-table");
const dailyValidatorTable = document.querySelector("#daily-validator-table");
const dailyProofTable = document.querySelector("#daily-proof-table");
const dailyAdjustmentTable = document.querySelector("#daily-adjustment-table");
const ticketForm = document.querySelector("#ticket-form");
const ticketClient = document.querySelector("#ticket-client");
const clientOptions = document.querySelector("#client-options");
const ticketService = document.querySelector("#ticket-service");
const ticketPrice = document.querySelector("#ticket-price");
const ticketPayment = document.querySelector("#ticket-payment");
const priceHint = document.querySelector("#price-hint");
const paymentPreview = document.querySelector("#payment-preview");
const copyPaymentPreview = document.querySelector("#copy-payment-preview");
const ticketMessage = document.querySelector("#ticket-message");
const manualCopyPanel = document.querySelector("#manual-copy-panel");
const manualCopyText = document.querySelector("#manual-copy-text");
const frpPricingBox = document.querySelector("#frp-pricing-box");
const frpMessage = document.querySelector("#frp-message");
const frpWorkbench = document.querySelector("#frp-workbench");
const ticketChannelFilter = document.querySelector("#ticket-channel-filter");
const ticketBoard = document.querySelector("#ticket-board");
const ticketsTable = document.querySelector("#tickets-table");
const paymentProofFiles = document.querySelector("#payment-proof-files");
const modelField = document.querySelector("#model-field");
const clientForm = document.querySelector("#client-form");
const clientMessage = document.querySelector("#client-message");
const clientsTable = document.querySelector("#clients-table");
const clientMasterSection = document.querySelector("#client-master-section");
const refreshClientMasters = document.querySelector("#refresh-client-masters");
const clientMasterSuggestions = document.querySelector("#client-master-suggestions");
const clientMasterMessage = document.querySelector("#client-master-message");
const finalLogModal = document.querySelector("#final-log-modal");
const finalLogForm = document.querySelector("#final-log-form");
const finalLogInput = document.querySelector("#final-log-input");
const finalLogTitle = document.querySelector("#final-log-title");
const finalLogCancel = document.querySelector("#final-log-cancel");
const finalLogDropzone = document.querySelector("#final-log-dropzone");
const finalLogFiles = document.querySelector("#final-log-files");
const finalLogImages = document.querySelector("#final-log-images");
const finalLogHelp = document.querySelector("#final-log-help");
const frpReviewDialog = document.querySelector("#frpReviewDialog");

function emptySession() {
  return {
    user: null,
    users: [],
    clients: [],
    audit: [],
    roles: [],
    tickets: [],
    presence: { onlineUsersCount: 0, onlineUsers: [] },
    deviceSecurity: { pendingApprovals: [] },
    pricingConfig: { exchangeRates: [], serviceRules: [] },
    dailyClose: null,
    clientMasterLinks: { masters: [], links: [], suggestions: [] },
    catalog: { services: [], paymentMethods: [] },
    frp: { enabled: false, orders: [], jobs: [], metrics: {}, statuses: { orders: [], jobs: [] } },
  };
}

let session = emptySession();
let pendingFinalLogResolve = null;
let pendingFinalLogImages = [];
let pendingPaymentProofTicketId = "";
let draggingTicketId = "";
let selectedChannelFilter = "mine";
let adminPreviewChannel = localStorage.getItem("ariad_admin_preview_channel") || "";
let lastPaymentCountryKey = "";
let resetMode = "request";
let presenceTimer = null;
const adminPanelIds = new Set(["users-panel", "audit-panel", "daily-close-panel"]);
const pricingManagerPanelIds = new Set(["pricing-panel"]);
const presenceRefreshMs = 15 * 1000;
const maxFinalLogImages = 4;
const maxFinalLogImageBytes = 2 * 1024 * 1024;
const finalizedBoardLimit = 5;
const paymentStatusLabels = {
  ESPERANDO_COMPROBANTE: "Esperando comprobante",
  PAGO_EN_VALIDACION: "Pago en validacion",
  COMPROBANTE_RECIBIDO: "Comprobante validado",
  COMPROBANTE_RECHAZADO: "Comprobante rechazado",
};
const suggestedPaymentByCountry = {
  mexico: "MX_STP",
  peru: "PE_YAPE_BRYAMS",
  colombia: "CO_BANCOLOMBIA_AHORROS",
  chile: "CL_MERCADO_PAGO",
  usdt: "BINANCE_PAY",
};
const pricingModeLabels = {
  USDT_BASE: "Desde USDT",
  COMPONENTS: "Componentes",
  MANUAL: "Manual",
};
const countryByFlagIso = {
  AR: "Argentina",
  BO: "Bolivia",
  CL: "Chile",
  CO: "Colombia",
  CR: "Costa Rica",
  DO: "Republica Dominicana",
  EC: "Ecuador",
  ES: "Espana",
  GT: "Guatemala",
  HN: "Honduras",
  MX: "Mexico",
  NI: "Nicaragua",
  PA: "Panama",
  PE: "Peru",
  PY: "Paraguay",
  SV: "El Salvador",
  US: "Estados Unidos",
  UY: "Uruguay",
  VE: "Venezuela",
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    credentials: "same-origin",
    ...options,
  });
  if (response.status === 204) return null;
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const text = await response.text();
    const error = new Error(
      text.trim().startsWith("<!DOCTYPE") || text.trim().startsWith("<html")
        ? "El servidor devolvio una pagina HTML en lugar de datos. Recarga la pagina y espera a que termine el deploy."
        : "El servidor devolvio una respuesta inesperada."
    );
    error.rawResponse = text.slice(0, 240);
    throw error;
  }
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload.error || "Operacion fallida.");
    Object.assign(error, payload);
    throw error;
  }
  return payload;
}

function showMessage(text, type = "neutral") {
  authMessage.textContent = text;
  authMessage.dataset.type = type;
}

function syncRegistrationSetupField() {
  const showSetupToken = Boolean(session.setupRequired);
  setupTokenField.classList.toggle("hidden", !showSetupToken);
  setupTokenNote.classList.toggle("hidden", !showSetupToken);
  registerForm.elements.setupToken.required = showSetupToken;
  if (!showSetupToken) registerForm.elements.setupToken.value = "";
}

function toggleLoginPinField(show, label = "PIN operativo") {
  loginPinField.classList.toggle("hidden", !show);
  loginPinLabel.textContent = label;
  loginForm.elements.operatorPin.required = show;
  if (!show) loginForm.elements.operatorPin.value = "";
}

function switchTab(tab) {
  const isLogin = tab === "login";
  const isRegister = tab === "register";
  const isReset = tab === "reset";
  loginTab.classList.toggle("active", isLogin);
  registerTab.classList.toggle("active", isRegister);
  resetTab.classList.toggle("active", isReset);
  loginForm.classList.toggle("active", isLogin);
  registerForm.classList.toggle("active", isRegister);
  resetPasswordForm.classList.toggle("active", isReset && resetMode === "request");
  completeResetForm.classList.toggle("active", isReset && resetMode === "complete");
  if (isRegister) syncRegistrationSetupField();
  if (!isLogin) toggleLoginPinField(false);
  showMessage("");
}

function isAdmin() {
  return session.user?.role === "ADMIN";
}

function canManagePricing() {
  return isAdmin();
}

function canManageFrpCosts() {
  return Boolean(session.frp?.pricing?.canManageCosts);
}

function canManageFrpPolicy() {
  return Boolean(session.frp?.pricing?.canManagePolicy);
}

function enabledServiceNames() {
  return servicesForCurrentChannel().map((service) => service.name || service.code).filter(Boolean);
}

function availableWorkChannels() {
  return session.catalog?.workChannels?.length
    ? session.catalog.workChannels
    : ["WhatsApp 1", "WhatsApp 2", "WhatsApp 3"];
}

function normalizeAdminPreviewChannel() {
  const channels = availableWorkChannels();
  if (!isAdmin()) return "";
  if (!channels.includes(adminPreviewChannel)) {
    adminPreviewChannel = channels.includes(session.user?.workChannel) ? session.user.workChannel : channels[0] || "";
    if (adminPreviewChannel) localStorage.setItem("ariad_admin_preview_channel", adminPreviewChannel);
  }
  return adminPreviewChannel;
}

function currentUserChannel() {
  if (isAdmin()) return normalizeAdminPreviewChannel();
  return session.user?.workChannel || "";
}

function servicesForCurrentChannel() {
  const channel = currentUserChannel();
  const serviceList = session.catalog?.services || [];
  return serviceList.filter((service) => !channel || service.workChannel === channel);
}

function ticketCurrentChannel(ticket) {
  return ticket.currentChannel || ticket.workerChannel || ticket.originChannel || "";
}

function ticketOriginChannel(ticket) {
  return ticket.originChannel || ticket.workerChannel || ticket.currentChannel || "";
}

function channelFilterTarget() {
  if (selectedChannelFilter === "all") return "";
  if (selectedChannelFilter === "mine") return currentUserChannel();
  return selectedChannelFilter;
}

function matchesSelectedChannel(channel) {
  const target = channelFilterTarget();
  if (!target) return true;
  return channel === target;
}

function filteredTickets() {
  return (session.tickets || []).filter((ticket) => matchesSelectedChannel(ticketCurrentChannel(ticket)));
}

function filteredClients() {
  return (session.clients || []).filter((client) => matchesSelectedChannel(client.workChannel || ""));
}

function normalizeChannelFilter() {
  if (selectedChannelFilter === "all" || selectedChannelFilter === "mine") return;
  if (!availableWorkChannels().includes(selectedChannelFilter)) {
    selectedChannelFilter = "mine";
  }
}

function canOpenPanel(panelId) {
  if (adminPanelIds.has(panelId)) return isAdmin();
  if (pricingManagerPanelIds.has(panelId)) return canManagePricing();
  return true;
}

function activatePanel(panelId) {
  const fallbackPanel = "overview-panel";
  const targetPanelId = canOpenPanel(panelId) ? panelId : fallbackPanel;
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("active"));
  document.querySelectorAll(".panel").forEach((panel) => panel.classList.remove("active"));
  document.querySelector(`.nav-item[data-panel="${targetPanelId}"]`)?.classList.add("active");
  document.querySelector(`#${targetPanelId}`)?.classList.add("active");
}

function syncNavigationForRole() {
  document.querySelectorAll("[data-admin-only='true']").forEach((item) => {
    item.classList.toggle("hidden", !isAdmin());
  });
  document.querySelectorAll("[data-pricing-manager-only='true']").forEach((item) => {
    item.classList.toggle("hidden", !canManagePricing());
  });
  const activePanel = document.querySelector(".panel.active")?.id || "overview-panel";
  if (!canOpenPanel(activePanel)) activatePanel("overview-panel");
}

function renderPresence() {
  activeUsersCount.textContent = String(session.presence?.onlineUsersCount || 0);
}

function renderChannelFilter() {
  if (!ticketChannelFilter) return;
  normalizeChannelFilter();
  const myChannel = currentUserChannel();
  const filters = [
    { value: "mine", label: myChannel ? `Mi canal - ${myChannel}` : "Mi canal" },
    { value: "all", label: "Todos" },
    ...availableWorkChannels().map((channel) => ({ value: channel, label: channel })),
  ];
  ticketChannelFilter.innerHTML = filters
    .map((filter) => `
      <button class="channel-chip${selectedChannelFilter === filter.value ? " active" : ""}" type="button" data-channel-filter="${escapeHtml(filter.value)}">
        ${escapeHtml(filter.label)}
      </button>
    `)
    .join("");
}

function renderAdminChannelSwitcher() {
  if (!adminChannelSwitcher || !adminOperationalChannel) return;
  adminChannelSwitcher.classList.toggle("hidden", !isAdmin());
  if (!isAdmin()) return;
  const channels = availableWorkChannels();
  const selected = normalizeAdminPreviewChannel();
  adminOperationalChannel.innerHTML = channels
    .map((channel) => `<option value="${escapeHtml(channel)}" ${channel === selected ? "selected" : ""}>${escapeHtml(channel)}</option>`)
    .join("");
}

function renderDeviceApprovals() {
  const approvals = session.deviceSecurity?.pendingApprovals || [];
  if (!isAdmin() || !approvals.length) {
    deviceApprovalsPanel.innerHTML = "";
    return;
  }
  deviceApprovalsPanel.innerHTML = `
    <strong>Dispositivos pendientes</strong>
    ${approvals.map((approval) => `
      <div class="device-approval-row">
        <span>${escapeHtml(formatDate(approval.createdAt))}<small>${escapeHtml(approval.userAgent || "Navegador desconocido")}</small></span>
        <button class="mini-btn" type="button" data-approve-device="${escapeHtml(approval.id)}">Aprobar</button>
      </div>
    `).join("")}
  `;
}

function renderSecurityForRole() {
  const showAdminSecurity = isAdmin();
  operatorPinForm.classList.toggle("hidden", !showAdminSecurity);
  deviceApprovalsPanel.classList.toggle("hidden", !showAdminSecurity);
  revokeDevicesButton.classList.toggle("hidden", !showAdminSecurity);
  if (!showAdminSecurity) {
    operatorPinMessage.textContent = "";
    deviceApprovalsPanel.innerHTML = "";
  }
}

function renderOverviewForRole() {
  if (isAdmin()) {
    pendingUsersLabel.textContent = "Pendientes";
    pendingUsersCount.textContent = String(session.users.filter((user) => !user.active).length);
    workflowTitle.textContent = "Base operativa v0.1";
    workflowStepList.innerHTML = `
      <span>Login</span>
      <span>Registro</span>
      <span>Asignacion de rol</span>
      <span>Auditoria</span>
      <span>Siguiente: tickets</span>
    `;
    return;
  }

  pendingUsersLabel.textContent = "Mi canal";
  pendingUsersCount.textContent = currentUserChannel() || "-";
  workflowTitle.textContent = "Operacion del canal";
  const services = enabledServiceNames();
  workflowStepList.innerHTML = services.length
    ? services.map((service) => `<span>${escapeHtml(service)}</span>`).join("")
    : `<span>Sin servicios habilitados</span>`;
}

function stopPresenceRefresh() {
  if (!presenceTimer) return;
  clearInterval(presenceTimer);
  presenceTimer = null;
}

function startPresenceRefresh() {
  if (presenceTimer || !session.user) return;
  presenceTimer = setInterval(refreshPresence, presenceRefreshMs);
}

function renderLayout() {
  const loggedIn = Boolean(session.user);
  syncRegistrationSetupField();
  authView.classList.toggle("hidden", loggedIn);
  dashboardView.classList.toggle("hidden", !loggedIn);
  if (!loggedIn) {
    stopPresenceRefresh();
    stopTechnicianWidgetPolling();
    stopFrpOpsLive();
    return;
  }

  welcomeTitle.textContent = `Hola, ${session.user.name}`;
  roleBadge.textContent = session.user.roleLabel;
  currentRoleLabel.textContent = session.user.roleLabel;
  renderAdminChannelSwitcher();
  syncNavigationForRole();
  startPresenceRefresh();

  renderPresence();
  renderDeviceApprovals();
  renderSecurityForRole();
  renderOverviewForRole();

  renderChannelFilter();
  renderUsers();
  renderAudit();
  renderCatalog();
  renderClients();
  renderPortalCustomers();
  renderPricing();
  renderDailyClose();
  renderFrp();
  renderTicketBoard();
  renderTickets();
  startTechnicianWidgetPolling();
  // FRP Ops v2 SSE — arranca solo si el user tiene acceso FRP (guard interno
  // en startFrpOpsLive). Llamarlo despues del primer renderFrp asegura que
  // session.frp ya esta poblada — el snapshot inicial del backend reemplaza
  // ese state pero coincide en shape, sin race observable.
  startFrpOpsLive();
}

function renderCatalog() {
  const services = servicesForCurrentChannel();
  const clients = filteredClients();
  clientOptions.innerHTML = clients
    .map((client) => `<option value="${escapeHtml([client.name, client.country].filter(Boolean).join(" "))}"></option>`)
    .join("");
  ticketService.innerHTML = services.length
    ? services
      .map((service) => `<option value="${service.code}">${escapeHtml(service.name)}</option>`)
      .join("")
    : `<option value="">Sin servicios para este WhatsApp</option>`;
  ticketService.disabled = !services.length;
  normalizeTicketClientDisplay();
  syncPaymentOptions();
  syncSelectedService();
  syncPaymentPreview();
}

function renderUsers() {
  if (session.user?.role !== "ADMIN") {
    usersTable.innerHTML = `<tr><td colspan="9" class="muted-cell">Solo el administrador puede ver y modificar usuarios.</td></tr>`;
    return;
  }

  usersTable.innerHTML = session.users
    .map((user) => {
      const isSelfUser = user.id === session.user.id;
      const roleOptions = session.roles
        .map((role) => `<option value="${role.value}" ${user.role === role.value ? "selected" : ""}>${role.label}</option>`)
        .join("");
      const channelOptions = (session.catalog?.workChannels || ["WhatsApp 1", "WhatsApp 2", "WhatsApp 3"])
        .map((channel) => `<option value="${channel}" ${user.workChannel === channel ? "selected" : ""}>${channel}</option>`)
        .join("");
      return `
        <tr>
          <td>${escapeHtml(user.name)}</td>
          <td>${escapeHtml(user.email)}</td>
          <td>
            <select class="table-input" data-user-channel="${user.id}">
              ${channelOptions}
            </select>
          </td>
          <td>
            <select data-user-role="${user.id}" ${isSelfUser ? "disabled" : ""}>
              ${roleOptions}
            </select>
            ${isSelfUser ? `<span class="table-subtext">Protegido</span>` : ""}
          </td>
          <td>
            <label class="inline-check compact-check">
              <input type="checkbox" data-user-frp-cost-manager="${user.id}" ${user.permissions?.frpCostManager ? "checked" : ""} ${user.role !== "ADMIN" && user.workChannel !== "WhatsApp 3" ? "disabled" : ""} />
              Delegado
            </label>
          </td>
          <td><span class="table-subtext">${user.operatorPinSet ? "Configurado" : "Pendiente"}</span></td>
          <td>
            <input type="text" class="table-input" data-user-technician-redirector="${user.id}" value="${escapeHtml(user.technicianRedirectorId || "")}" placeholder="ej. 1000 9983 5478" maxlength="64" />
          </td>
          <td>
            <label class="inline-check">
              <input type="checkbox" data-user-active="${user.id}" ${user.active ? "checked" : ""} ${isSelfUser ? "disabled" : ""} />
              ${user.active ? "Activo" : "Pendiente"}
            </label>
          </td>
          <td>
            <button class="mini-btn" type="button" data-save-user="${user.id}">Guardar</button>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderClients() {
  if (!session.clients?.length) {
    clientsTable.innerHTML = `<tr><td colspan="5" class="muted-cell">Todavia no hay clientes agregados.</td></tr>`;
    renderClientMasters();
    return;
  }

  const clients = filteredClients();
  if (!clients.length) {
    clientsTable.innerHTML = `<tr><td colspan="5" class="muted-cell">No hay clientes para este canal.</td></tr>`;
    renderClientMasters();
    return;
  }

  clientsTable.innerHTML = clients
    .map((client) => `
      <tr>
        <td><strong>${escapeHtml(client.name)}</strong></td>
        <td>${escapeHtml(client.whatsapp || "-")}</td>
        <td>${escapeHtml(client.country)}</td>
        <td>${escapeHtml(client.workChannel || "-")}</td>
        <td>${formatDate(client.createdAt)}</td>
      </tr>
    `)
    .join("");
  renderClientMasters();
}

// PR-2a.5 + PR-2a.5-fix — UI minima para marcar VIP. Lista a los clientes
// registrados via portal y permite togglear status VIP + setear vipUnitMargin
// (margen sobre costo proveedor, NO precio total — FINAL §3). Backend validacion
// + audit en POST /api/admin/customer-clients/:id/vip. FINAL §3: cualquier
// operador (Bryam/Jack/Angelo) puede marcar/desmarcar.
function renderPortalCustomers() {
  const tbody = document.querySelector("#portal-customers-table");
  if (!tbody) return;
  const customers = session.portalCustomers || [];
  if (!customers.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="muted-cell">No hay clientes registrados via portal todavia.</td></tr>`;
    return;
  }
  tbody.innerHTML = customers.map((c) => {
    const vipBadge = c.isVip ? `<span class="vip-badge" title="Cliente VIP">★</span>` : "";
    const statusCell = c.isVip
      ? `<span class="status-pill vip-pill">VIP</span>`
      : c.emailVerified
        ? `<span class="status-pill">${escapeHtml(c.status || "Regular")}</span>`
        : `<span class="status-pill danger-pill">Sin verificar</span>`;
    const margin = Number(c.vipUnitMargin || 0);
    const effective = Number(c.vipEffectiveUnitPrice || 0);
    const priceCell = c.isVip && margin > 0
      ? `<strong>${effective.toFixed(2)} USDT</strong><span class="table-subtext">margen ${margin.toFixed(2)} + costo</span>`
      : "-";
    const actionLabel = c.isVip ? "Quitar VIP" : "Marcar VIP";
    const actionMode = c.isVip ? "unmark" : "mark";
    const confirmButton = c.emailVerified
      ? ""
      : `<button class="mini-btn" type="button" data-portal-confirm-client="${escapeHtml(c.id)}">Confirmar</button>`;
    return `
      <tr>
        <td><strong>${escapeHtml(c.name)}</strong> ${vipBadge}<span class="table-subtext">${escapeHtml(c.whatsapp || "")}</span></td>
        <td>${escapeHtml(c.primaryEmail || "-")}</td>
        <td>${escapeHtml(c.country || "-")}</td>
        <td>${statusCell}</td>
        <td>${priceCell}</td>
        <td class="action-cell">${confirmButton}<button class="mini-btn" type="button" data-portal-vip-action="${actionMode}" data-client-id="${escapeHtml(c.id)}">${actionLabel}</button></td>
      </tr>
    `;
  }).join("");
}

function openVipDialog(customer, action) {
  const dialog = document.querySelector("#vipDialog");
  const form = dialog?.querySelector("#vipForm");
  if (!dialog || !form) return;
  form.reset();
  dialog.querySelector("#vipDialogTitle").textContent = action === "mark" ? "Marcar VIP" : "Quitar VIP";
  dialog.querySelector("#vipDialogClient").textContent = `${customer.name}${customer.primaryEmail ? " · " + customer.primaryEmail : ""}${customer.whatsapp ? " · " + customer.whatsapp : ""}`;
  dialog.querySelector("#vipDialogStatus").textContent = `Estado actual: ${customer.isVip ? "VIP" : (customer.status || "Regular")}`;
  const priceRow = dialog.querySelector("[data-vip-price-row]");
  if (priceRow) priceRow.style.display = action === "mark" ? "" : "none";
  if (action === "mark") {
    const marginInput = form.querySelector("[name='vipUnitMargin']");
    if (marginInput) marginInput.value = customer.vipUnitMargin > 0 ? customer.vipUnitMargin : "1.0";
  }
  dialog.dataset.action = action;
  dialog.dataset.clientId = customer.id;
  const submitBtn = form.querySelector("[data-vip-action='confirm']");
  if (submitBtn) {
    submitBtn.textContent = "Guardar";
    submitBtn.classList.remove("is-success", "is-error", "is-saving");
    submitBtn.disabled = false;
    delete submitBtn.dataset.originalText;
  }
  dialog.showModal();
  setTimeout(() => form.querySelector("[name='reason']")?.focus(), 30);
}

document.addEventListener("click", (event) => {
  const confirmButton = event.target.closest("[data-portal-confirm-client]");
  if (confirmButton) {
    const clientId = confirmButton.dataset.portalConfirmClient;
    const customer = (session.portalCustomers || []).find((c) => c.id === clientId);
    if (!customer) return;
    const portalMessage = document.querySelector("#portal-customers-message");
    if (portalMessage) portalMessage.textContent = "";
    showButtonFeedback(confirmButton, "saving", "Confirmando...");
    confirmButton.disabled = true;
    api(`/api/admin/customer-clients/${encodeURIComponent(clientId)}/confirm`, {
      method: "POST",
      body: JSON.stringify({ reason: "Confirmacion manual desde panel admin" }),
    }).then(async () => {
      showButtonFeedback(confirmButton, "success", "Confirmado", 1200);
      if (portalMessage) {
        portalMessage.textContent = "Cliente confirmado manualmente.";
        portalMessage.dataset.type = "success";
      }
      await refreshSession();
    }).catch((error) => {
      confirmButton.disabled = false;
      showButtonFeedback(confirmButton, "error", `Error: ${error.message.slice(0, 60)}`, 3500);
      if (portalMessage) {
        portalMessage.textContent = error.message;
        portalMessage.dataset.type = "error";
      }
    });
    return;
  }

  const button = event.target.closest("[data-portal-vip-action]");
  if (!button) return;
  const clientId = button.dataset.clientId;
  const action = button.dataset.portalVipAction;
  const customer = (session.portalCustomers || []).find((c) => c.id === clientId);
  if (!customer) return;
  openVipDialog(customer, action);
});

document.querySelector("#vipDialog")?.addEventListener("click", (event) => {
  const cancelBtn = event.target.closest("[data-vip-action='cancel']");
  if (!cancelBtn) return;
  event.preventDefault();
  document.querySelector("#vipDialog")?.close();
});

document.querySelector("#vipForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const dialog = document.querySelector("#vipDialog");
  const submitBtn = form.querySelector("[data-vip-action='confirm']");
  const action = dialog.dataset.action;
  const clientId = dialog.dataset.clientId;
  const reasonInput = form.querySelector("[name='reason']");
  const reason = (reasonInput?.value || "").trim();
  if (!reason) {
    reasonInput?.classList.add("is-invalid");
    reasonInput?.focus();
    showButtonFeedback(submitBtn, "error", "✗ Motivo obligatorio", 2200);
    const onInput = () => { reasonInput?.classList.remove("is-invalid"); reasonInput?.removeEventListener("input", onInput); };
    reasonInput?.addEventListener("input", onInput);
    return;
  }
  // PR-2a.5-fix: validacion del MARGEN VIP en rango FINAL §3 (0.5-1.0).
  const vipMarginInput = form.querySelector("[name='vipUnitMargin']");
  const vipUnitMargin = Number(vipMarginInput?.value || 0);
  if (action === "mark" && (vipUnitMargin < 0.5 || vipUnitMargin > 1.0)) {
    vipMarginInput?.classList.add("is-invalid");
    showButtonFeedback(submitBtn, "error", "✗ Margen fuera de 0.5–1.0 USDT", 2500);
    const onInput = () => { vipMarginInput?.classList.remove("is-invalid"); vipMarginInput?.removeEventListener("input", onInput); };
    vipMarginInput?.addEventListener("input", onInput);
    return;
  }
  showButtonFeedback(submitBtn, "saving", "Guardando...");
  submitBtn.disabled = true;
  const portalMessage = document.querySelector("#portal-customers-message");
  if (portalMessage) portalMessage.textContent = "";
  try {
    await api(`/api/admin/customer-clients/${encodeURIComponent(clientId)}/vip`, {
      method: "POST",
      body: JSON.stringify({
        action: action === "mark" ? "mark_vip" : "unmark_vip",
        vipUnitMargin,
        reason,
      }),
    });
    showButtonFeedback(submitBtn, "success", action === "mark" ? "✓ Marcado VIP" : "✓ Quitado VIP", 1300);
    if (portalMessage) {
      portalMessage.textContent = action === "mark" ? "Cliente marcado como VIP." : "Cliente quitado de VIP.";
      portalMessage.dataset.type = "success";
    }
    setTimeout(async () => {
      dialog.close();
      await refreshSession();
    }, 1400);
  } catch (error) {
    showButtonFeedback(submitBtn, "error", `✗ ${error.message.slice(0, 60)}`, 3500);
    if (portalMessage) {
      portalMessage.textContent = error.message;
      portalMessage.dataset.type = "error";
    }
  }
});

function clientSourceLabel(sourceType) {
  if (sourceType === "PORTAL_CLIENT") return "Portal Cliente";
  if (sourceType === "INTERNAL_CLIENT") return "Cliente interno";
  return sourceType || "Cliente";
}

function renderClientMasters() {
  if (!clientMasterSection || !clientMasterSuggestions) return;
  const isAllowed = isAdmin();
  clientMasterSection.classList.toggle("hidden", !isAllowed);
  if (!isAllowed) return;
  const suggestions = session.clientMasterLinks?.suggestions || [];
  if (!suggestions.length) {
    clientMasterSuggestions.innerHTML = `<tr><td colspan="5" class="muted-cell">Sin duplicados pendientes o bloqueados.</td></tr>`;
    return;
  }
  clientMasterSuggestions.innerHTML = suggestions
    .map((suggestion) => {
      const blocked = suggestion.status === "BLOCKED";
      const origin = `
        <strong>${escapeHtml(suggestion.sourceName || "-")}</strong>
        <span class="table-subtext">${escapeHtml(clientSourceLabel(suggestion.sourceType))}</span>
        <span class="table-subtext">${escapeHtml([suggestion.sourceWhatsapp, suggestion.sourceCountry].filter(Boolean).join(" - "))}</span>
      `;
      const candidate = suggestion.candidateMasterClientId
        ? `<strong>${escapeHtml(suggestion.candidateName || "ClienteMaestro")}</strong><span class="table-subtext">${escapeHtml([suggestion.candidateWhatsapp, suggestion.candidateCountry].filter(Boolean).join(" - ") || suggestion.candidateMasterClientId)}</span>`
        : `<span class="table-subtext">Sin candidato unico</span>`;
      return `
        <tr>
          <td>${origin}</td>
          <td>${candidate}</td>
          <td><strong>${escapeHtml(suggestion.confidence || "-")}</strong><span class="table-subtext">${escapeHtml(suggestion.reason || "")}</span></td>
          <td><span class="status-pill ${blocked ? "danger-pill" : ""}">${escapeHtml(blocked ? "Bloqueado" : "Revision")}</span></td>
          <td class="action-cell">
            <button class="mini-btn" type="button" data-review-link="${escapeHtml(suggestion.id)}" data-link-action="approve" ${blocked ? "disabled" : ""}>Vincular</button>
            <button class="mini-btn" type="button" data-review-link="${escapeHtml(suggestion.id)}" data-link-action="reject">Rechazar</button>
            <button class="mini-btn" type="button" data-review-link="${escapeHtml(suggestion.id)}" data-link-action="block">Bloquear</button>
          </td>
        </tr>
      `;
    })
    .join("");
}

function pricingUpdatedText(item) {
  if (!item.updatedAt) return "Sin cambios";
  const actor = item.updatedByName ? ` por ${item.updatedByName}` : "";
  return `${formatDate(item.updatedAt)}${actor}`;
}

function renderPricingModeOptions(selectedMode) {
  return Object.entries(pricingModeLabels)
    .map(([value, label]) => `<option value="${value}" ${selectedMode === value ? "selected" : ""}>${label}</option>`)
    .join("");
}

function renderPricing() {
  if (!pricingRatesTable || !pricingRulesTable) return;
  if (!canManagePricing()) {
    pricingRatesTable.innerHTML = `<tr><td colspan="5" class="muted-cell">Solo administrador puede modificar tasas.</td></tr>`;
    pricingRulesTable.innerHTML = `<tr><td colspan="11" class="muted-cell">Solo administrador puede modificar reglas de costo.</td></tr>`;
    return;
  }

  const pricing = session.pricingConfig || { exchangeRates: [], serviceRules: [] };
  pricingRatesTable.innerHTML = (pricing.exchangeRates || [])
    .map((rate) => {
      const lockedToday = Boolean(rate.updatedToday && session.user?.role !== "ADMIN");
      const isFixedUsdt = rate.currency === "USDT";
      const disabled = lockedToday || isFixedUsdt;
      const buttonText = rate.updatedToday && session.user?.role === "ADMIN" && !isFixedUsdt ? "Corregir" : "Guardar";
      const statusText = isFixedUsdt
        ? "Fija"
        : rate.updatedToday
          ? "Actualizada hoy"
          : "Pendiente hoy";
      const statusClass = rate.updatedToday || isFixedUsdt ? "rate-status ok" : "rate-status pending";
      return `
        <tr>
          <td><strong>${escapeHtml(rate.country)}</strong></td>
          <td>${escapeHtml(rate.currency)}</td>
          <td>
            <input class="table-input numeric-input" type="number" min="0" step="0.0001" value="${escapeHtml(rate.ratePerUsdt)}" data-rate-value="${escapeHtml(rate.key)}" ${disabled ? "disabled" : ""} />
            <span class="${statusClass}">${escapeHtml(statusText)}</span>
          </td>
          <td><span class="table-subtext">${escapeHtml(pricingUpdatedText(rate))}</span></td>
          <td><button class="mini-btn" type="button" data-save-rate="${escapeHtml(rate.key)}" ${disabled ? "disabled" : ""}>${escapeHtml(buttonText)}</button></td>
        </tr>
      `;
    })
    .join("");

  pricingRulesTable.innerHTML = (pricing.serviceRules || [])
    .map((rule) => `
      <tr>
        <td><strong>${escapeHtml(rule.serviceName)}</strong><span class="table-subtext">${escapeHtml(rule.serviceCode)}</span></td>
        <td>
          <select class="table-input pricing-mode-input" data-rule-mode="${escapeHtml(rule.serviceCode)}">
            ${renderPricingModeOptions(rule.pricingMode)}
          </select>
        </td>
        <td><input class="table-input numeric-input" type="number" min="0" step="0.0001" value="${escapeHtml(rule.baseCostUsdt)}" data-rule-base="${escapeHtml(rule.serviceCode)}" /></td>
        <td><input class="table-input numeric-input" type="number" min="0" step="0.0001" value="${escapeHtml(rule.marginUsdt)}" data-rule-margin="${escapeHtml(rule.serviceCode)}" /></td>
        <td><input class="table-input numeric-input" type="number" min="0" step="0.0001" value="${escapeHtml(rule.authCostUsdt)}" data-rule-auth="${escapeHtml(rule.serviceCode)}" /></td>
        <td><input class="table-input numeric-input" type="number" min="0" step="0.0001" value="${escapeHtml(rule.criticalCostUsdt)}" data-rule-critical="${escapeHtml(rule.serviceCode)}" /></td>
        <td><input class="table-input numeric-input" type="number" min="0" step="0.0001" value="${escapeHtml(rule.toolCostUsdt)}" data-rule-tool="${escapeHtml(rule.serviceCode)}" /></td>
        <td><input class="table-input numeric-input" type="number" min="0" step="0.0001" value="${escapeHtml(rule.serverCostUsdt)}" data-rule-server="${escapeHtml(rule.serviceCode)}" /></td>
        <td>
          <label class="inline-check compact-check">
            <input type="checkbox" data-rule-manual="${escapeHtml(rule.serviceCode)}" ${rule.manualAdjustmentAllowed ? "checked" : ""} />
            Permitido
          </label>
        </td>
        <td><span class="table-subtext">${escapeHtml(pricingUpdatedText(rule))}</span></td>
        <td><button class="mini-btn" type="button" data-save-rule="${escapeHtml(rule.serviceCode)}">Guardar</button></td>
      </tr>
    `)
    .join("");
}

function todayLimaInput() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function dailyCloseDateValue() {
  return dailyCloseDate?.value || session.dailyClose?.dateInput || todayLimaInput();
}

function formatCloseMoney(value, currency = "") {
  const number = Number(value || 0);
  const formatted = new Intl.NumberFormat("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(number);
  return `${formatted}${currency ? ` ${currency}` : ""}`;
}

function setDailyCloseMessage(text = "", type = "neutral") {
  if (!dailyCloseMessage) return;
  dailyCloseMessage.textContent = text;
  dailyCloseMessage.dataset.type = type;
}

function renderDailyCloseOptions() {
  if (!dailyAdjustmentCurrency || !dailyAdjustmentPayment || !dailyAdjustmentChannel || !dailyAdjustmentService) return;
  const currencies = Array.from(new Set((session.pricingConfig?.exchangeRates || []).map((rate) => rate.currency).filter(Boolean).concat(["USDT"])));
  dailyAdjustmentCurrency.innerHTML = currencies
    .map((currency) => `<option value="${escapeHtml(currency)}">${escapeHtml(currency)}</option>`)
    .join("");
  dailyAdjustmentPayment.innerHTML = `<option value="">Sin metodo</option>` + (session.catalog?.paymentMethods || [])
    .map((payment) => `<option value="${escapeHtml(payment.code)}">${escapeHtml(payment.label)}</option>`)
    .join("");
  dailyAdjustmentChannel.innerHTML = `<option value="">General</option>` + (session.catalog?.workChannels || [])
    .map((channel) => `<option value="${escapeHtml(channel)}">${escapeHtml(channel)}</option>`)
    .join("");
  dailyAdjustmentService.innerHTML = `<option value="">General</option>` + (session.catalog?.services || [])
    .map((service) => `<option value="${escapeHtml(service.code)}">${escapeHtml(service.name)}</option>`)
    .join("");
}

function renderDailyCloseRows(table, rows, emptyText, mapper) {
  if (!table) return;
  if (!rows?.length) {
    const colspan = table.closest("table")?.querySelectorAll("thead th").length || 4;
    table.innerHTML = `<tr><td colspan="${colspan}" class="muted-cell">${escapeHtml(emptyText)}</td></tr>`;
    return;
  }
  table.innerHTML = rows.map(mapper).join("");
}

function renderDailyClose() {
  if (!dailyCloseSummary) return;
  renderDailyCloseOptions();
  if (!isAdmin()) {
    dailyCloseSummary.innerHTML = "";
    return;
  }
  const report = session.dailyClose;
  if (!dailyCloseDate.value) dailyCloseDate.value = report?.dateInput || todayLimaInput();
  if (!report) {
    dailyCloseSummary.innerHTML = `<article><span>Cierre diario</span><strong>Sin datos</strong></article>`;
    return;
  }
  const isClosed = report.status === "CERRADO";
  closeDailyCloseButton.disabled = isClosed;
  reopenDailyCloseButton.disabled = !isClosed;
  dailyCloseSummary.innerHTML = `
    <article><span>Fecha</span><strong>${escapeHtml(report.dateLabel || report.dateInput)}</strong></article>
    <article><span>Estado</span><strong>${escapeHtml(report.status || "ABIERTO")}</strong></article>
    <article><span>Ordenes creadas</span><strong>${escapeHtml(report.totals?.createdOrders || 0)}</strong></article>
    <article><span>Pagos validados</span><strong>${escapeHtml(report.totals?.validatedPayments || 0)}</strong></article>
    <article><span>Finalizados</span><strong>${escapeHtml(report.totals?.finalizedServices || 0)}</strong></article>
    <article><span>Pendientes/rechazados</span><strong>${escapeHtml(`${report.totals?.pendingProofs || 0}/${report.totals?.rejectedProofs || 0}`)}</strong></article>
  `;
  renderDailyCloseRows(dailyCurrencyTable, report.byCurrency, "Sin pagos validados para esta fecha.", (row) => `
    <tr>
      <td><strong>${escapeHtml(row.currency)}</strong></td>
      <td>${escapeHtml(formatCloseMoney(row.grossAmount, row.currency))}</td>
      <td>${escapeHtml(formatCloseMoney(row.refundAmount, row.currency))}</td>
      <td>${escapeHtml(formatCloseMoney(row.adjustmentAmount, row.currency))}</td>
      <td><strong>${escapeHtml(formatCloseMoney(row.netAmount, row.currency))}</strong></td>
      <td>${escapeHtml(row.paymentCount || 0)}</td>
    </tr>
  `);
  renderDailyCloseRows(dailyPaymentTable, report.byPaymentMethod, "Sin metodos con pagos.", (row) => `
    <tr>
      <td>${escapeHtml(row.paymentLabel || row.paymentMethod || "-")}</td>
      <td>${escapeHtml(row.currency || "-")}</td>
      <td><strong>${escapeHtml(formatCloseMoney(row.netAmount, row.currency))}</strong></td>
      <td>${escapeHtml(row.paymentCount || 0)}</td>
    </tr>
  `);
  renderDailyCloseRows(dailyChannelTable, report.byChannel, "Sin canales con pagos.", (row) => `
    <tr>
      <td>${escapeHtml(row.workChannel || "-")}</td>
      <td>${escapeHtml(row.currency || "-")}</td>
      <td><strong>${escapeHtml(formatCloseMoney(row.netAmount, row.currency))}</strong></td>
      <td>${escapeHtml(row.equipmentCount || 0)}</td>
    </tr>
  `);
  renderDailyCloseRows(dailyServiceTable, report.byService, "Sin servicios con pagos.", (row) => `
    <tr>
      <td>${escapeHtml(row.serviceName || row.serviceCode || "-")}</td>
      <td>${escapeHtml(row.currency || "-")}</td>
      <td><strong>${escapeHtml(formatCloseMoney(row.netAmount, row.currency))}</strong></td>
      <td>${escapeHtml(row.equipmentCount || 0)}</td>
    </tr>
  `);
  renderDailyCloseRows(dailyTechnicianTable, report.technicians, "Sin finalizados por tecnico.", (row) => `
    <tr>
      <td>${escapeHtml(row.userName || row.userId || "Sistema")}</td>
      <td>${escapeHtml(row.finalizedCount || 0)}</td>
      <td>${escapeHtml(row.equipmentCount || 0)}</td>
    </tr>
  `);
  renderDailyCloseRows(dailyValidatorTable, report.byValidator, "Sin pagos validados.", (row) => `
    <tr>
      <td>${escapeHtml(row.userName || row.userId || "Sistema")}</td>
      <td>${escapeHtml(row.currency || "-")}</td>
      <td><strong>${escapeHtml(formatCloseMoney(row.netAmount, row.currency))}</strong></td>
      <td>${escapeHtml(row.paymentCount || 0)}</td>
    </tr>
  `);
  renderDailyCloseRows(dailyProofTable, report.proofs, "Sin comprobantes pendientes o revisados hoy.", (proof) => `
    <tr>
      <td><strong>${escapeHtml(proof.sourceCode)}</strong><span class="table-subtext">${escapeHtml(proof.sourceType)}</span></td>
      <td><span class="status-pill">${escapeHtml(proof.status)}</span></td>
      <td>${escapeHtml(proof.serviceName || "-")}<span class="table-subtext">${escapeHtml(proof.workChannel || "")}</span></td>
      <td>${escapeHtml(proof.reviewedByName || "-")}<span class="table-subtext">${escapeHtml(proof.reviewedAt ? formatDate(proof.reviewedAt) : "")}</span></td>
    </tr>
  `);
  renderDailyCloseRows(dailyAdjustmentTable, report.adjustments, "Sin reembolsos ni ajustes.", (adjustment) => `
    <tr>
      <td><span class="status-pill ${adjustment.type === "REEMBOLSO" ? "danger-pill" : ""}">${escapeHtml(adjustment.type)}</span></td>
      <td><strong>${escapeHtml(formatCloseMoney(adjustment.amount, adjustment.currency))}</strong></td>
      <td>${escapeHtml(adjustment.reason)}</td>
      <td>${escapeHtml(adjustment.createdByName || "-")}<span class="table-subtext">${escapeHtml(formatDate(adjustment.createdAt))}</span></td>
    </tr>
  `);
}

async function loadDailyClose(date = dailyCloseDateValue()) {
  setDailyCloseMessage("");
  const payload = await api(`/api/daily-close?date=${encodeURIComponent(date)}`);
  session.dailyClose = payload.dailyClose;
  if (dailyCloseDate && payload.dailyClose?.dateInput) dailyCloseDate.value = payload.dailyClose.dateInput;
  renderDailyClose();
}

function renderAudit() {
  if (session.user?.role !== "ADMIN") {
    auditList.innerHTML = `<p class="muted-cell">Solo el administrador puede ver la auditoria completa.</p>`;
    return;
  }
  if (!session.audit.length) {
    auditList.innerHTML = `<p class="muted-cell">Sin eventos todavia.</p>`;
    return;
  }

  auditList.innerHTML = session.audit
    .map((event) => {
      const actor = session.users.find((user) => user.id === event.actorId)?.name || "Sistema";
      return `
        <article>
          <strong>${escapeHtml(event.action)}</strong>
          <span>${escapeHtml(actor)} - ${formatDate(event.createdAt)}</span>
        </article>
      `;
    })
    .join("");
}

function channelOptionsMarkup(selectedChannel) {
  return availableWorkChannels()
    .map((channel) => `<option value="${escapeHtml(channel)}" ${selectedChannel === channel ? "selected" : ""}>${escapeHtml(channel)}</option>`)
    .join("");
}

function renderTicketChannelCell(ticket) {
  const currentChannel = ticketCurrentChannel(ticket) || "-";
  const originChannel = ticketOriginChannel(ticket) || "-";
  if (isAdmin()) {
    return `
      <select class="table-input channel-select" data-ticket-channel="${escapeHtml(ticket.id)}">
        ${channelOptionsMarkup(currentChannel)}
      </select>
      <button class="mini-btn compact-action" type="button" data-save-ticket-channel="${escapeHtml(ticket.id)}">Guardar canal</button>
      <span class="table-subtext">Origen: ${escapeHtml(originChannel)}</span>
    `;
  }
  return `
    <strong>${escapeHtml(currentChannel)}</strong>
    <span class="table-subtext">Origen: ${escapeHtml(originChannel)}</span>
  `;
}

function renderTickets() {
  if (!session.tickets?.length) {
    ticketsTable.innerHTML = `<tr><td colspan="9" class="muted-cell">Todavia no hay tickets creados.</td></tr>`;
    return;
  }

  const tickets = filteredTickets();
  if (!tickets.length) {
    ticketsTable.innerHTML = `<tr><td colspan="9" class="muted-cell">No hay tickets para este canal.</td></tr>`;
    return;
  }

  ticketsTable.innerHTML = tickets
    .map((ticket) => {
      const paymentLines = renderPaymentLines(ticket.paymentDetails);
      const showPaymentReview = canReviewPayments() && ticket.paymentStatus === "PAGO_EN_VALIDACION" && ticket.paymentProofs?.length;
      return `
        <tr>
          <td><strong>${escapeHtml(ticket.code)}</strong></td>
          <td>${escapeHtml(ticket.clientName)}<span class="table-subtext">${escapeHtml(ticket.country || "")}${ticket.clientWhatsapp ? ` - ${escapeHtml(ticket.clientWhatsapp)}` : ""}</span></td>
          <td>${escapeHtml(ticket.serviceName)}${ticket.model ? `<span class="table-subtext">${escapeHtml(ticket.model)}</span>` : ""}</td>
          <td><strong>${escapeHtml(formatTicketPrice(ticket))}</strong></td>
          <td>${escapeHtml(ticket.paymentLabel)}${paymentLines}</td>
          <td>
            <span class="status-pill">${escapeHtml(paymentStatusLabel(ticket.paymentStatus))}</span>
            ${ticket.paymentProofs?.length ? `<span class="table-subtext">${ticket.paymentProofs.length} comprobante(s)</span>` : ""}
            <span class="table-subtext">${escapeHtml(ticket.operationalStatus)}</span>
            ${ticket.finalImages?.length ? `<span class="table-subtext">${ticket.finalImages.length} imagen(es) de cierre</span>` : ""}
          </td>
          <td>${renderTicketChannelCell(ticket)}</td>
          <td>${escapeHtml(ticket.createdByName)}</td>
          <td class="action-stack">
            <button class="mini-btn" type="button" data-copy-ticket="${ticket.id}">Copiar</button>
            <button class="mini-btn" type="button" data-upload-proof="${ticket.id}">Comprobante</button>
            ${showPaymentReview ? `
              <button class="mini-btn" type="button" data-review-payment="${ticket.id}" data-review-action="approve">Validar pago</button>
              <button class="mini-btn danger-mini" type="button" data-review-payment="${ticket.id}" data-review-action="reject">Rechazar</button>
            ` : ""}
          </td>
        </tr>
      `;
    })
    .join("");
}

function frpEnabled() {
  return Boolean(session.frp?.enabled);
}

function frpOrders() {
  return session.frp?.orders || [];
}

function frpJobs() {
  return session.frp?.jobs || [];
}

function frpQuantityTier(quantity) {
  const qty = Number(quantity || 1);
  const tiers = session.frp?.pricing?.quantityTiers?.length
    ? session.frp.pricing.quantityTiers
    : [
      { minQty: 10, label: "Volumen 10+", unitPrice: 22 },
      { minQty: 5, label: "Volumen 5-9", unitPrice: 23 },
      { minQty: 2, label: "Volumen 2-4", unitPrice: 24 },
      { minQty: 1, label: "Normal", unitPrice: 25 },
    ];
  return tiers.find((tier) => qty >= Number(tier.minQty || 1)) || tiers.at(-1);
}

function frpPaymentByCode(code) {
  return (session.catalog?.paymentMethods || []).find((payment) => payment.code === code);
}

function inferredCountryFromText(value) {
  const text = normalizeForMatch(stripCountryFlags(value));
  const countries = session.catalog?.countries || [];
  const orderedCountries = [...new Set(countries)].sort((a, b) => b.length - a.length);
  const countryByText = orderedCountries.find((country) => {
    const needle = normalizeForMatch(country);
    return text === needle || text.endsWith(` ${needle}`);
  });
  return countryByText || countryFromFlag(value);
}

function frpCostModeLabel(mode) {
  return mode === "CREDITS" ? "Creditos" : "USDT fijo";
}

function frpProviderStatusLabel(status) {
  const labels = { ACTIVE: "Activo", BACKUP: "Respaldo", OFF: "Off" };
  return labels[status] || status || "-";
}

function renderFrpPricingBox() {
  if (!frpPricingBox) return;
  const pricing = session.frp?.pricing;
  if (!frpEnabled() || !pricing) {
    frpPricingBox.innerHTML = "";
    return;
  }
  const summary = pricing.summary || {};
  const summaryHtml = `
    <div class="frp-pricing-summary">
      <article>
        <span>Proveedor activo</span>
        <strong>${escapeHtml(summary.providerName || "Sin proveedor")}</strong>
      </article>
      <article>
        <span>Precio normal</span>
        <strong>${summary.available ? `${Number(summary.unitPrice || 0).toFixed(2)} USDT` : "No disponible"}</strong>
      </article>
      ${canManageFrpCosts() ? `
        <article>
          <span>Costo interno</span>
          <strong>${Number(summary.internalCostUsdt || 0).toFixed(4)} USDT</strong>
        </article>
      ` : ""}
    </div>
  `;

  // PR-2a.6: removidos "Margen minimo" y "Precio minimo" — contradicen filosofia
  // precio en vivo (FINAL §4). La proteccion contra error humano vive en el
  // sistema dinamico de validacion 5-niveles del PATCH /pricing/providers.
  const policyHtml = canManageFrpPolicy() && pricing.policy ? `
    <form class="frp-policy-form" data-frp-policy-form>
      <label>Ganancia objetivo (USDT/unidad)<input type="number" min="0" step="0.01" value="${escapeHtml(pricing.policy.targetMarginUsdt)}" data-frp-policy="targetMarginUsdt" /></label>
      <label>Limite delegado %<input type="number" min="0" step="1" value="${escapeHtml(pricing.policy.maxWorkerCostChangePct)}" data-frp-policy="maxWorkerCostChangePct" /></label>
      <button class="mini-btn" type="submit">Guardar politica</button>
      <small class="hint">Precio en vivo = costo proveedor + ganancia objetivo. Sin floors estaticos. Cambios drasticos protegidos por validacion dinamica (5 niveles).</small>
    </form>
  ` : "";

  // PR-2a.7: archived providers ocultos de la tabla principal. Quedan en
  // auditoria + en BD pero no aparecen para evitar ruido visual. No se pueden
  // editar (backend devuelve 409 si intentás).
  const visibleProviders = (pricing.providers || []).filter((p) => p.status !== "ARCHIVED");
  const providersHtml = canManageFrpCosts() ? `
    <div class="frp-provider-card-grid">
      ${visibleProviders.map((provider) => {
        const statusKey = String(provider.status || "OFF").toLowerCase();
        return `
          <article class="frp-provider-card">
            <header class="frp-provider-card-head">
              <div>
                <p class="frp-provider-card-label">Proveedor</p>
                <h5>${escapeHtml(provider.name)}</h5>
                <span class="frp-provider-card-meta">${escapeHtml(provider.updatedByName || provider.reason || "Sin cambios recientes")}</span>
              </div>
              <span class="frp-provider-status-pill is-${escapeHtml(statusKey)}">${escapeHtml(frpProviderStatusLabel(provider.status))}</span>
            </header>
            <div class="frp-provider-fields">
              <label>
                <span>Estado</span>
                <select class="table-input" data-frp-provider-status="${escapeHtml(provider.id)}">
                  ${["ACTIVE", "BACKUP", "OFF"].map((status) => `<option value="${status}" ${provider.status === status ? "selected" : ""}>${escapeHtml(frpProviderStatusLabel(status))}</option>`).join("")}
                </select>
              </label>
              <label>
                <span>Modo</span>
                <select class="table-input" data-frp-provider-mode="${escapeHtml(provider.id)}">
                  ${["FIXED_USDT", "CREDITS"].map((mode) => `<option value="${mode}" ${provider.costMode === mode ? "selected" : ""}>${escapeHtml(frpCostModeLabel(mode))}</option>`).join("")}
                </select>
              </label>
              <label>
                <span>USDT fijo</span>
                <input class="table-input numeric-input" type="number" min="0" step="0.0001" value="${escapeHtml(provider.fixedCostUsdt)}" data-frp-provider-fixed="${escapeHtml(provider.id)}" />
              </label>
              <label>
                <span>Creditos</span>
                <input class="table-input numeric-input" type="number" min="0" step="0.0001" value="${escapeHtml(provider.creditsPerProcess)}" data-frp-provider-credits="${escapeHtml(provider.id)}" />
              </label>
              <label>
                <span>USDT/credito</span>
                <input class="table-input numeric-input" type="number" min="0" step="0.0001" value="${escapeHtml(provider.creditUnitCostUsdt)}" data-frp-provider-credit-cost="${escapeHtml(provider.id)}" />
              </label>
              <label class="frp-provider-reason-field">
                <span>Motivo obligatorio</span>
                <input class="table-input" type="text" maxlength="200" value="" placeholder="${escapeHtml(provider.reason || "Motivo obligatorio")}" data-frp-provider-reason="${escapeHtml(provider.id)}" />
              </label>
            </div>
            <div class="frp-provider-card-actions">
              <button class="mini-btn" type="button" data-save-frp-provider="${escapeHtml(provider.id)}">Guardar</button>
              <button class="mini-btn danger-mini" type="button" data-archive-frp-provider="${escapeHtml(provider.id)}" data-provider-name="${escapeHtml(provider.name)}">Archivar</button>
            </div>
          </article>
        `;
      }).join("")}
      <div class="frp-provider-actions">
        <button class="secondary-btn" type="button" data-action="open-new-provider">+ Agregar proveedor</button>
      </div>
    </div>
  ` : `<p class="pricing-note"><strong>Precio FRP automatico</strong><span>Solo el administrador o WhatsApp 3 autorizado puede cambiar proveedor y costos.</span></p>`;

  // PR-2a.6 + ajuste 1: cola de cambios pendientes solo se renderiza cuando
  // el usuario es ADMIN Y hay al menos un pendiente. Para Jack/Angelo (no admin)
  // siempre oculto. Para admin sin pendientes, tambien oculto — evita ruido
  // visual en el panel cuando no hay nada que aprobar.
  const pendingList = session.pendingCostChanges || [];
  const pendingHtml = isAdmin() && pendingList.length > 0 ? `
    <section class="frp-pending-panel" data-frp-pending-section>
      <header>
        <div>
          <p class="eyebrow">Cambios drásticos pendientes (nivel 4)</p>
          <h4>${pendingList.length} pendiente${pendingList.length === 1 ? "" : "s"} de aprobación</h4>
        </div>
      </header>
      <ul class="frp-pending-list">
        ${pendingList.map((p) => {
          // Signed delta: el deltaPct persistido es absoluto (Math.abs en
          // classifyCostChange usado para clasificar nivel). Aqui derivamos el
          // signo de previousCost/nextCost para que el operador vea direccion.
          const direction = Number(p.nextCost) < Number(p.previousCost) ? "-" : "+";
          return `
          <li class="frp-pending-item" data-pending-id="${escapeHtml(p.id)}">
            <div class="frp-pending-info">
              <strong>${escapeHtml(p.providerName)}</strong>
              <span>${Number(p.previousCost).toFixed(2)} → <b>${Number(p.nextCost).toFixed(2)}</b> USDT (Δ ${direction}${Number(p.deltaPct).toFixed(1)}% sobre baseline ${Number(p.baselineAvg).toFixed(2)})</span>
              <span class="frp-pending-meta">Solicitado por ${escapeHtml(p.requestedBy.slice(0, 8))}… · ${escapeHtml(formatDate(p.requestedAt))}</span>
              <span class="frp-pending-reason">"${escapeHtml(p.requestedReason)}"</span>
            </div>
            <div class="frp-pending-actions">
              <button class="mini-btn" type="button" data-pending-action="approve" data-pending-id="${escapeHtml(p.id)}">Aprobar</button>
              <button class="mini-btn danger-mini" type="button" data-pending-action="reject" data-pending-id="${escapeHtml(p.id)}">Rechazar</button>
            </div>
          </li>
          `;
        }).join("")}
      </ul>
    </section>
  ` : "";

  frpPricingBox.innerHTML = `
    <section class="frp-pricing-panel">
      <header>
        <div>
          <p class="eyebrow">Costos FRP</p>
          <h4>Proveedor y precio calculado</h4>
        </div>
      </header>
      ${summaryHtml}
      ${policyHtml}
      ${providersHtml}
      ${pendingHtml}
    </section>
  `;
}

// PR-2a.6: refrescar cola de cambios pendientes (admin only).
async function refreshPendingCostChanges() {
  if (!isAdmin()) return;
  try {
    const payload = await api("/api/frp/pricing/pending-changes");
    session.pendingCostChanges = payload.pendingChanges || [];
  } catch {
    session.pendingCostChanges = [];
  }
}

// Click delegado para aprobar/rechazar cambios pendientes.
frpPricingBox?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-pending-action]");
  if (!button) return;
  const action = button.dataset.pendingAction;
  const pendingId = button.dataset.pendingId;
  const decisionReason = window.prompt(
    action === "approve"
      ? "Motivo de aprobación (lo verá el operador que solicitó):"
      : "Motivo de rechazo (lo verá el operador que solicitó):"
  );
  if (!decisionReason || !decisionReason.trim()) return;
  button.disabled = true;
  try {
    await api(`/api/frp/pricing/pending-changes/${encodeURIComponent(pendingId)}/${action}`, {
      method: "POST",
      body: JSON.stringify({ reason: decisionReason.trim() }),
    });
    await refreshPendingCostChanges();
    await refreshSession();
    frpMessage.textContent = action === "approve" ? "Cambio aprobado y aplicado." : "Cambio rechazado.";
    frpMessage.dataset.type = "success";
  } catch (error) {
    frpMessage.textContent = error.message || "No se pudo procesar la decisión.";
    frpMessage.dataset.type = "error";
    button.disabled = false;
  }
});

function frpStatusLabel(status, type = "jobs") {
  const list = session.frp?.statuses?.[type] || [];
  return list.find((item) => item.code === status)?.label || status || "-";
}

function checklistDone(checklist, keys) {
  return keys.filter((key) => checklist?.[key]).length;
}

function isPortalFrpOrder(order) {
  return order?.source === "PORTAL_CLIENTE" || Boolean(order?.portalOrderId);
}

function frpOrderJobs(order) {
  return Array.isArray(order?.jobs) ? order.jobs : frpJobs().filter((job) => job.orderId === order?.id);
}

// ============================================================
// FRP Ops v2 — render rediseñado (spec operador-frp-express.md v1.1)
// Reemplaza el layout de 6 lanes horizontales por vista vertical priorizada:
// 1) Header con técnico activo, 2) Tu trabajo actual (hero), 3) Cola con
// filtro VIP, 4) grid Pagos/Atención, 5) Finalizados hoy.
// Cleanup commit 5b (chore/frp-ops): se eliminaron los helpers viejos
// (renderFrpOrder, renderFrpJobCard, renderFrpMetrics, frpWebFilters,
// frpOrderStage, etc.) junto con #frp-metrics, #frp-manual-panel y los
// handlers delegados muertos. Quedan solo los renders y handlers del
// rediseño activo. CSS huérfano (.frp-lane, .frp-card, etc.) pendiente
// para Bundle 3 cleanup separado.
// ============================================================

const FRP_OPS_V2_VIP_FILTER_KEY = "frpOpsV2VipFilter";
function frpOpsV2VipFilterEnabled() {
  try { return sessionStorage.getItem(FRP_OPS_V2_VIP_FILTER_KEY) === "1"; }
  catch { return false; }
}
function setFrpOpsV2VipFilter(value) {
  try {
    if (value) sessionStorage.setItem(FRP_OPS_V2_VIP_FILTER_KEY, "1");
    else sessionStorage.removeItem(FRP_OPS_V2_VIP_FILTER_KEY);
  } catch { /* sessionStorage no disponible (incognito) — silencioso */ }
}

function frpOpsV2RelativeTime(iso) {
  if (!iso) return "";
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "";
  const diff = Math.max(0, Date.now() - ms);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "ahora mismo";
  if (min === 1) return "hace 1 min";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h === 1) return "hace 1 h";
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

function frpOpsV2LimaTime(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function frpOpsV2TechInitial(name) {
  if (!name) return "?";
  return String(name).trim().charAt(0).toUpperCase() || "?";
}

// Spec operador-frp-express.md §3.3 + AC #23-25: banner de timeout 30 min
// sobre el card "Tu trabajo actual". Evaluacion local desde takenAt — no hay
// evento del servidor que dispare a los 30 min, lo computa el cliente.
const FRP_OPS_V2_BANNER_30MIN_MS = 30 * 60 * 1000;
const FRP_OPS_V2_KEEP_WORKING_PREFIX = "frpOpsV2KeepWorking_";

function frpOpsV2BannerMutedUntil(jobId) {
  if (!jobId) return 0;
  try {
    const raw = localStorage.getItem(`${FRP_OPS_V2_KEEP_WORKING_PREFIX}${jobId}`);
    const ms = Number(raw);
    return Number.isFinite(ms) ? ms : 0;
  } catch {
    // localStorage no disponible (incognito) — sin mute
    return 0;
  }
}

// QUE: si el job lleva 30+ min en EN_PROCESO Y el tecnico no clickeo
// "Sigo trabajando" en los ultimos 30 min, mostrar banner. Se llama
// solo desde el render del card actual (modo activo o readonly).
// POR QUE: el calculo se hace cliente porque el threshold cambia segun
// el reloj del navegador y el render se dispara via setInterval 60s.
function frpOpsV2ShouldShow30MinBanner(job, { respectMute = true } = {}) {
  if (!job?.takenAt) return false;
  const takenAtMs = new Date(job.takenAt).getTime();
  if (!Number.isFinite(takenAtMs)) return false;
  const ageMs = Date.now() - takenAtMs;
  if (ageMs <= FRP_OPS_V2_BANNER_30MIN_MS) return false;
  if (respectMute && Date.now() < frpOpsV2BannerMutedUntil(job.id)) return false;
  return true;
}

// QUE: registra el click "Sigo trabajando" del tecnico — silencia el banner
// 30 min mas DESDE EL CLICK (no desde takenAt). Persiste en localStorage para
// sobrevivir reloads/cierres del tab.
// POR QUE: spec §3.3 — "Vuelve a aparecer 30 min despues si todavia no se
// finalizo". Decision aprobada por Bryam: 30 min desde el click.
function frpOpsV2MarkKeepWorking(jobId) {
  if (!jobId) return;
  try {
    localStorage.setItem(
      `${FRP_OPS_V2_KEEP_WORKING_PREFIX}${jobId}`,
      String(Date.now() + FRP_OPS_V2_BANNER_30MIN_MS),
    );
  } catch { /* localStorage no disponible — no-op silencioso */ }
}

function frpOpsV2RenderActiveBanner(jobId) {
  return `
    <div class="frp-ops-v2-banner-30min" role="alert">
      <div>
        <strong>Este job lleva 30+ min. ¿Necesitás ayuda?</strong>
        <span>El equipo del cliente sigue conectado. Decidí si seguís procesando o cancelás para que otro técnico lo retome.</span>
      </div>
      <div class="frp-ops-v2-banner-30min-actions">
        <button type="button" class="frp-ops-v2-banner-30min-action-keep" data-frp-keep-working="${escapeHtml(jobId)}">Sigo trabajando</button>
        <button type="button" class="frp-ops-v2-banner-30min-action-cancel" data-frp-cancel-timeout="${escapeHtml(jobId)}">Cancelar job</button>
      </div>
    </div>
  `;
}

function frpOpsV2RenderObserverBanner(otherName) {
  const name = String(otherName || "").trim() || "El tecnico activo";
  return `
    <div class="frp-ops-v2-banner-30min" role="status">
      <div>
        <strong>${escapeHtml(name)} lleva 30+ min en este job</strong>
      </div>
    </div>
  `;
}

function frpOpsV2RenderHeader(tech) {
  let badgeClass = "frp-ops-v2-tech-badge";
  let badgeText = "Sin tecnico activo";
  if (tech?.swap?.inProgress) {
    badgeClass += " is-swap";
    badgeText = "Cambiando tecnico…";
  } else if (tech?.active?.name) {
    badgeText = `${tech.active.name} activo`;
  } else {
    badgeClass += " is-empty";
  }
  return `
    <div class="frp-ops-v2-header">
      <div>
        <div class="frp-ops-v2-header-label">Panel operador</div>
        <div class="frp-ops-v2-header-title">FRP Express</div>
      </div>
      <div class="${badgeClass}">
        <span class="frp-ops-v2-tech-dot"></span>
        ${escapeHtml(badgeText)}
      </div>
    </div>
  `;
}

function frpOpsV2JobRedirectorId(job, { swapInProgress, tech } = {}) {
  const order = job?.order || {};
  const frozenRedirectorId = String(order.redirectorId || order.technicianId || "").trim();
  if (frozenRedirectorId) return frozenRedirectorId;
  if (swapInProgress) return "-";
  return String(tech?.active?.redirectorId || "").trim() || "-";
}

function frpOpsV2RenderCurrentActive(job, { swapInProgress, tech }) {
  const order = job.order || {};
  const orderCode = order.code || job.code || "";
  const sequence = job.sequence || 1;
  const totalEquipos = order.quantity || job.totalJobs || 1;
  const clientName = order.clientName || job.clientName || "-";
  const serviceName = job.serviceName || "Xiaomi Cuenta Google";
  const ardCode = job.ardCode || "";
  const technicianId = frpOpsV2JobRedirectorId(job, { swapInProgress, tech });
  const processCode = order.processCode || "-";
  const takenAtRel = frpOpsV2RelativeTime(job.takenAt);
  const actionsDisabled = swapInProgress;
  const bannerHtml = frpOpsV2ShouldShow30MinBanner(job)
    ? frpOpsV2RenderActiveBanner(job.id)
    : "";
  return `
    <section class="frp-ops-v2-section">
      <div class="frp-ops-v2-section-header">
        <div class="frp-ops-v2-section-label">Tu trabajo actual</div>
      </div>
      ${bannerHtml}
      <div class="frp-ops-v2-current">
        <div class="frp-ops-v2-current-head">
          <div>
            <div class="frp-ops-v2-current-meta">${escapeHtml(orderCode)} · ${escapeHtml(sequence)} de ${escapeHtml(totalEquipos)} equipos</div>
            <div class="frp-ops-v2-current-name">${escapeHtml(clientName)}</div>
            <div class="frp-ops-v2-current-service">${escapeHtml(serviceName)}${ardCode ? ` · ${escapeHtml(ardCode)}` : ""}</div>
          </div>
          ${takenAtRel ? `<div class="frp-ops-v2-current-time">tomado ${escapeHtml(takenAtRel)}</div>` : ""}
        </div>
        <div class="frp-ops-v2-current-data">
          <div class="frp-ops-v2-data-cell">
            <div class="frp-ops-v2-data-cell-label">Technician ID</div>
            <div class="frp-ops-v2-data-cell-value">${escapeHtml(technicianId)}</div>
          </div>
          <div class="frp-ops-v2-data-cell">
            <div class="frp-ops-v2-data-cell-label">Codigo del proceso</div>
            <div class="frp-ops-v2-data-cell-value">${escapeHtml(processCode)}</div>
          </div>
        </div>
        <div class="frp-ops-v2-current-actions">
          <button type="button" class="frp-ops-v2-btn-primary"
            data-frp-finalize="${escapeHtml(job.id)}"
            ${actionsDisabled ? "disabled" : ""}
            ${actionsDisabled ? `title="Cambio de tecnico en curso"` : ""}>
            Marcar finalizado
          </button>
          <button type="button" class="frp-ops-v2-btn-secondary"
            data-frp-review="${escapeHtml(job.id)}"
            ${actionsDisabled ? "disabled" : ""}>
            Reportar problema
          </button>
        </div>
      </div>
    </section>
  `;
}

function frpOpsV2RenderCurrentReadonly(job, otherName) {
  const order = job.order || {};
  // Modo observador: si el job lleva 30+ min se muestra banner sin botones,
  // tono observador (no "¿necesitás ayuda?"). NO respeta localStorage del
  // [Sigo trabajando] del titular — eso es del actor, no del observador.
  const bannerHtml = frpOpsV2ShouldShow30MinBanner(job, { respectMute: false })
    ? frpOpsV2RenderObserverBanner(otherName)
    : "";
  return `
    <section class="frp-ops-v2-section">
      <div class="frp-ops-v2-section-header">
        <div class="frp-ops-v2-section-label">Tu trabajo actual</div>
      </div>
      ${bannerHtml}
      <div class="frp-ops-v2-current frp-ops-v2-current--readonly">
        <div class="frp-ops-v2-current-head">
          <div>
            <div class="frp-ops-v2-current-meta">${escapeHtml(order.code || job.code || "")} · ${escapeHtml(job.sequence || 1)} de ${escapeHtml(order.quantity || 1)} equipos</div>
            <div class="frp-ops-v2-current-name">${escapeHtml(order.clientName || job.clientName || "-")}</div>
          </div>
          <span class="frp-ops-v2-readonly-tag">Tomado por ${escapeHtml(otherName)}</span>
        </div>
      </div>
    </section>
  `;
}

function frpOpsV2RenderCurrentEmpty({ queueLen, isMeActive, swapInProgress }) {
  const hasJobsInQueue = queueLen > 0;
  const canTake = hasJobsInQueue && isMeActive && !swapInProgress;
  const disabledTip = swapInProgress
    ? "Cambio de tecnico en curso"
    : !isMeActive ? "No sos el tecnico activo"
    : !hasJobsInQueue ? "Sin trabajos listos en cola"
    : "";
  return `
    <section class="frp-ops-v2-section">
      <div class="frp-ops-v2-section-header">
        <div class="frp-ops-v2-section-label">Tu trabajo actual</div>
      </div>
      <div class="frp-ops-v2-current frp-ops-v2-current--empty">
        <p class="frp-ops-v2-current-empty-text">
          ${hasJobsInQueue
            ? "Sin trabajo actual."
            : "Sin trabajo actual. Esperando que clientes conecten equipos."}
        </p>
        <button type="button" class="frp-ops-v2-btn-primary"
          data-frp-take-next
          ${canTake ? "" : "disabled"}
          ${disabledTip ? `title="${escapeHtml(disabledTip)}"` : ""}>
          Tomar siguiente
        </button>
      </div>
    </section>
  `;
}

function frpOpsV2RenderQueueCard(job, { isMeActive, swapInProgress, hasMyActive }) {
  const order = job.order || {};
  const isVip = order.customerStatus === "VIP";
  const orderCode = order.code || job.code || "";
  const quantity = order.quantity || 1;
  const clientName = order.clientName || job.clientName || "-";
  const serviceName = job.serviceName || "Xiaomi Cuenta Google";
  const readyRel = frpOpsV2RelativeTime(job.readyAt || job.updatedAt || job.createdAt);
  const canTake = isMeActive && !swapInProgress && !hasMyActive;
  const disabledTip = hasMyActive
    ? "Ya tenes un FRP en proceso"
    : swapInProgress ? "Cambio de tecnico en curso"
    : !isMeActive ? "No sos el tecnico activo"
    : "";
  return `
    <div class="frp-ops-v2-queue-card${isVip ? " is-vip" : ""}">
      ${isVip ? `<span class="frp-ops-v2-queue-card-vip-badge">VIP</span>` : ""}
      <div>
        <div class="frp-ops-v2-queue-card-meta">${escapeHtml(orderCode)} · ${escapeHtml(quantity)} equipo${quantity === 1 ? "" : "s"}</div>
        <div class="frp-ops-v2-queue-card-name">${escapeHtml(clientName)} · ${escapeHtml(serviceName)}</div>
      </div>
      <div class="frp-ops-v2-queue-card-right">
        ${readyRel ? `<span class="frp-ops-v2-queue-card-time">${escapeHtml(readyRel)}</span>` : ""}
        <button type="button" class="frp-ops-v2-btn-take"
          data-frp-take-specific="${escapeHtml(job.id)}"
          ${canTake ? "" : "disabled"}
          ${disabledTip ? `title="${escapeHtml(disabledTip)}"` : ""}>
          Tomar
        </button>
      </div>
    </div>
  `;
}

function frpOpsV2RenderQueueSection({ queueJobs, isMeActive, swapInProgress, hasMyActive }) {
  const total = queueJobs.length;
  const vipOnly = frpOpsV2VipFilterEnabled();
  const vipJobs = queueJobs.filter((j) => j.order?.customerStatus === "VIP");
  const vipCount = vipJobs.length;
  // Spec §3.11: si filtro activo pero no hay VIPs, mostrar todos con nota.
  const fallbackToAll = vipOnly && vipCount === 0 && total > 0;
  const showJobs = vipOnly && !fallbackToAll ? vipJobs : queueJobs;
  const vipBtnLabel = vipCount > 0 ? `Solo VIP · ${vipCount}` : "Solo VIP";
  return `
    <section class="frp-ops-v2-section">
      <div class="frp-ops-v2-section-header">
        <div class="frp-ops-v2-section-label">Cola · ${escapeHtml(total)} listo${total === 1 ? "" : "s"}</div>
        <button type="button" class="frp-ops-v2-vip-toggle ${vipOnly ? "is-active" : ""}" data-frp-vip-toggle>
          <span class="frp-ops-v2-vip-toggle-dot"></span>
          ${escapeHtml(vipBtnLabel)}
        </button>
      </div>
      ${fallbackToAll ? `<p class="frp-ops-v2-queue-empty">No hay VIPs en cola, mostrando todos.</p>` : ""}
      ${!showJobs.length ? `<p class="frp-ops-v2-queue-empty">No hay FRP listos.</p>` : ""}
      ${showJobs.length ? `<div class="frp-ops-v2-queue">${showJobs.map((j) => frpOpsV2RenderQueueCard(j, { isMeActive, swapInProgress, hasMyActive })).join("")}</div>` : ""}
    </section>
  `;
}

function frpOpsV2RenderWaitingConnectionSection({ waitingOrders }) {
  const total = waitingOrders.length;
  return `
    <section class="frp-ops-v2-section">
      <div class="frp-ops-v2-section-header">
        <div class="frp-ops-v2-section-label">Esperando conexion · ${escapeHtml(total)}</div>
      </div>
      ${!total ? `<p class="frp-ops-v2-queue-empty">No hay pagos aprobados esperando conexion.</p>` : ""}
      ${total ? `
        <div class="frp-ops-v2-queue">
          ${waitingOrders.map((order) => {
            const quantity = Number(order.quantity || order.jobs?.length || 1);
            const approvedRel = frpOpsV2RelativeTime(order.paymentReviewedAt || order.updatedAt || order.createdAt);
            return `
              <div class="frp-ops-v2-queue-card is-waiting-connection">
                <div>
                  <div class="frp-ops-v2-queue-card-meta">${escapeHtml(order.code)} · ${escapeHtml(quantity)} equipo${quantity === 1 ? "" : "s"}</div>
                  <div class="frp-ops-v2-queue-card-name">${escapeHtml(order.clientName || "-")} · Pago aprobado</div>
                  <div class="frp-ops-v2-queue-card-detail">Esperando que el cliente marque equipo conectado.</div>
                </div>
                <div class="frp-ops-v2-queue-card-right">
                  ${approvedRel ? `<span class="frp-ops-v2-queue-card-time">${escapeHtml(approvedRel)}</span>` : ""}
                  <span class="frp-ops-v2-waiting-pill">Cliente pendiente</span>
                </div>
              </div>
            `;
          }).join("")}
        </div>
      ` : ""}
    </section>
  `;
}

function frpOpsV2RenderAttentionGrid({ pagosRevisar, reviewJobs }) {
  const canReview = canReviewFrpPayments();
  const pagosHtml = pagosRevisar.length
    ? pagosRevisar.map((o) => `
      <button type="button" class="frp-ops-v2-alert-card is-warning"
        data-frp-show-proof="${escapeHtml(o.id)}"
        ${canReview ? "" : `disabled title="Permisos insuficientes"`}>
        <div class="frp-ops-v2-alert-card-id">${escapeHtml(o.code)}</div>
        <div class="frp-ops-v2-alert-card-title">${escapeHtml(o.clientName || "-")} · ${escapeHtml(o.priceFormatted || `${o.totalPrice} USDT`)}</div>
        <div class="frp-ops-v2-alert-card-action">Ver comprobante →</div>
      </button>
    `).join("")
    : `<p class="frp-ops-v2-alert-empty">Sin pagos pendientes.</p>`;
  const reviewHtml = reviewJobs.length
    ? reviewJobs.map((j) => `
      <button type="button" class="frp-ops-v2-alert-card is-danger"
        data-frp-show-review="${escapeHtml(j.id)}">
        <div class="frp-ops-v2-alert-card-id">${escapeHtml(j.order?.code || j.code)}</div>
        <div class="frp-ops-v2-alert-card-title">${escapeHtml(j.order?.clientName || j.clientName || "-")}</div>
        <div class="frp-ops-v2-alert-card-detail">${escapeHtml(j.reviewReason || "Requiere atencion")}</div>
        <div class="frp-ops-v2-alert-card-action">Resolver →</div>
      </button>
    `).join("")
    : `<p class="frp-ops-v2-alert-empty">Sin casos en revision.</p>`;
  return `
    <section class="frp-ops-v2-section">
      <div class="frp-ops-v2-grid-attention">
        <div>
          <div class="frp-ops-v2-section-header">
            <div class="frp-ops-v2-section-label">Pagos por revisar · ${escapeHtml(pagosRevisar.length)}</div>
          </div>
          <div class="frp-ops-v2-alert-list">${pagosHtml}</div>
        </div>
        <div>
          <div class="frp-ops-v2-section-header">
            <div class="frp-ops-v2-section-label">Atencion · ${escapeHtml(reviewJobs.length)}</div>
          </div>
          <div class="frp-ops-v2-alert-list">${reviewHtml}</div>
        </div>
      </div>
    </section>
  `;
}

function frpOpsV2RenderFinalized(jobs) {
  const items = (jobs || []).slice(0, 12);
  if (!items.length) {
    return `
      <section class="frp-ops-v2-section">
        <div class="frp-ops-v2-section-header">
          <div class="frp-ops-v2-section-label">Finalizados hoy · 0</div>
        </div>
        <p class="frp-ops-v2-alert-empty">Sin finalizados hoy.</p>
      </section>
    `;
  }
  const rowsHtml = items.map((j) => {
    const initial = frpOpsV2TechInitial(j.technicianName);
    const time = frpOpsV2LimaTime(j.doneAt);
    const idText = j.code || j.order?.code || "";
    const nameText = `${j.order?.clientName || j.clientName || "-"}${j.ardCode ? ` · ${j.ardCode}` : ""}`;
    return `
      <div class="frp-ops-v2-finalized-row">
        <div class="frp-ops-v2-finalized-row-info">
          <span class="frp-ops-v2-finalized-row-id">${escapeHtml(idText)}</span>
          <span>${escapeHtml(nameText)}</span>
        </div>
        <div class="frp-ops-v2-finalized-row-right">
          ${time ? `<span class="frp-ops-v2-finalized-row-time">${escapeHtml(time)}</span>` : ""}
          <span class="frp-ops-v2-tech-mark" title="${escapeHtml(j.technicianName || "")}">${escapeHtml(initial)}</span>
        </div>
      </div>
    `;
  }).join("");
  return `
    <section class="frp-ops-v2-section">
      <div class="frp-ops-v2-section-header">
        <div class="frp-ops-v2-section-label">Finalizados hoy · ${escapeHtml(items.length)}</div>
      </div>
      <div class="frp-ops-v2-finalized">${rowsHtml}</div>
    </section>
  `;
}

// QUE: opciones del render. skipPricing=true preserva el estado del Costos
// FRP collapsible (inputs editables, dropdowns) cuando el render lo dispara
// el setInterval de tick 60s — sin esto, repintar la tabla de proveedores
// borra lo que el admin esté tipeando.
function renderFrp({ skipPricing = false } = {}) {
  if (!frpWorkbench) return;
  if (!frpEnabled()) {
    if (!skipPricing) renderFrpPricingBox();
    frpWorkbench.innerHTML = `<div class="pricing-note"><strong>FRP Express pertenece a WhatsApp 3</strong><span>Tu usuario no tiene este modulo habilitado.</span></div>`;
    return;
  }
  if (!skipPricing) renderFrpPricingBox();

  const orders = frpOrders();
  const jobs = frpJobs();
  const finishedToday = session.frp?.finishedTodayJobs || [];
  const tech = technicianStatusCache;

  const myActiveJob = jobs.find((j) => j.status === "EN_PROCESO" && j.technicianId === session.user?.id);
  const otherActiveJob = !myActiveJob
    ? jobs.find((j) => j.status === "EN_PROCESO" && j.technicianId && j.technicianId !== session.user?.id)
    : null;
  const queueJobs = jobs.filter((j) => j.status === "LISTO_PARA_TECNICO");
  const reviewJobs = jobs.filter((j) => j.status === "REQUIERE_REVISION");
  const pagosRevisar = orders.filter((o) => o.paymentStatus === "PAGO_EN_VALIDACION" && (o.paymentProofs?.length || 0) > 0);
  const waitingConnectionOrders = orders.filter((o) => {
    const paymentApproved = o.checklist?.paymentValidated
      || ["COMPROBANTE_RECIBIDO", "PAGO_VALIDADO"].includes(o.paymentStatus)
      || o.orderStatus === "PAGO_VALIDADO";
    const connectionReady = o.checklist?.connectionDataSent && o.checklist?.authorizationConfirmed;
    const hasWaitingJobs = (o.jobs || []).some((job) => ["ESPERANDO_PREPARACION", "ESPERANDO_CLIENTE"].includes(job.status));
    return paymentApproved && !connectionReady && hasWaitingJobs;
  });

  const isMeActive = Boolean(tech?.active?.userId && tech.active.userId === session.user?.id);
  const swapInProgress = Boolean(tech?.swap?.inProgress);

  let currentHtml;
  if (myActiveJob) {
    currentHtml = frpOpsV2RenderCurrentActive(myActiveJob, { swapInProgress, tech });
  } else if (otherActiveJob) {
    const otherName = (tech?.eligible || []).find((e) => e.userId === otherActiveJob.technicianId)?.name
      || otherActiveJob.technicianName
      || "otro tecnico";
    currentHtml = frpOpsV2RenderCurrentReadonly(otherActiveJob, otherName);
  } else {
    currentHtml = frpOpsV2RenderCurrentEmpty({ queueLen: queueJobs.length, isMeActive, swapInProgress });
  }

  frpWorkbench.innerHTML = `
    <div class="frp-ops-v2">
      ${frpOpsV2RenderHeader(tech)}
      <div class="frp-ops-v2-body">
        ${currentHtml}
        ${frpOpsV2RenderWaitingConnectionSection({ waitingOrders: waitingConnectionOrders })}
        ${frpOpsV2RenderQueueSection({ queueJobs, isMeActive, swapInProgress, hasMyActive: Boolean(myActiveJob) })}
        ${frpOpsV2RenderAttentionGrid({ pagosRevisar, reviewJobs })}
        ${frpOpsV2RenderFinalized(finishedToday)}
      </div>
    </div>
  `;
}

function renderTicketBoard() {
  const statuses = session.catalog?.ticketStatuses || [
    { code: "TICKET_CREADO", label: "Nuevo" },
    { code: "EN_COLA", label: "En cola" },
    { code: "EN_PROCESO", label: "En proceso" },
    { code: "FINALIZADO", label: "Finalizado" },
  ];
  const tickets = filteredTickets();
  ticketBoard.innerHTML = statuses
    .map((status) => {
      const statusTickets = tickets.filter((ticket) => ticket.operationalStatus === status.code);
      const visibleTickets = status.code === "FINALIZADO"
        ? statusTickets.slice(0, finalizedBoardLimit)
        : statusTickets;
      const hiddenCount = statusTickets.length - visibleTickets.length;
      const cards = visibleTickets.length
        ? visibleTickets.map(renderTicketCard).join("")
        : `<p class="board-empty">Suelta aqui</p>`;
      const archiveNote = hiddenCount > 0
        ? `<p class="board-note">${hiddenCount} mas en la tabla</p>`
        : "";
      return `
        <section class="ticket-column" data-status="${status.code}">
          <header>
            <span>${escapeHtml(status.label)}</span>
            <strong>${statusTickets.length}</strong>
          </header>
          <div class="ticket-dropzone" data-status="${status.code}">
            ${cards}
            ${archiveNote}
          </div>
        </section>
      `;
    })
    .join("");
}

function renderTicketCard(ticket) {
  const isFinalized = ticket.operationalStatus === "FINALIZADO";
  const channel = ticketCurrentChannel(ticket);
  return `
    <article class="ticket-card${isFinalized ? " is-locked" : ""}" draggable="${isFinalized ? "false" : "true"}" data-ticket-id="${ticket.id}">
      <strong>${escapeHtml(ticket.code)}</strong>
      <span>${escapeHtml(ticket.clientName)}</span>
      <small>${escapeHtml(ticket.serviceName)}${ticket.model ? ` - ${escapeHtml(ticket.model)}` : ""}</small>
      <small>${escapeHtml(formatTicketPrice(ticket))} - ${escapeHtml(ticket.paymentLabel)}</small>
      ${channel ? `<small>Canal: ${escapeHtml(channel)}</small>` : ""}
      ${ticket.paymentProofs?.length ? `<small>${ticket.paymentProofs.length} comprobante(s)</small>` : `<small class="drop-hint">Suelta comprobante aqui</small>`}
      ${ticket.finalImages?.length ? `<small>${ticket.finalImages.length} imagen(es) de cierre</small>` : ""}
      <em>${escapeHtml(paymentStatusLabel(ticket.paymentStatus))}</em>
    </article>
  `;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  return new Intl.DateTimeFormat("es", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatMoney(value) {
  return `${Number(value || 0).toFixed(2)} USD`;
}

function renderPaymentLines(lines = []) {
  if (!lines.length) return "";
  return `<span class="table-subtext payment-lines">${lines.map((line) => escapeHtml(line)).join("<br>")}</span>`;
}

function paymentStatusLabel(status) {
  return paymentStatusLabels[status] || status || "-";
}

function canReviewPayments() {
  return ["ADMIN", "COORDINADOR"].includes(session.user?.role);
}

function canReviewFrpPayments() {
  return canReviewPayments() || frpEnabled();
}

function canMoveTicketToStatus(ticket, operationalStatus) {
  if (!ticket) return false;
  if (ticket.operationalStatus === "FINALIZADO" && operationalStatus !== "FINALIZADO") {
    return false;
  }
  if (operationalStatus === "TICKET_CREADO" && ["PAGO_EN_VALIDACION", "COMPROBANTE_RECIBIDO"].includes(ticket.paymentStatus)) {
    return false;
  }
  if (["EN_COLA", "EN_PROCESO", "FINALIZADO"].includes(operationalStatus) && ticket.paymentStatus !== "COMPROBANTE_RECIBIDO") {
    return false;
  }
  return true;
}

function moveTicketBlockMessage(ticket, operationalStatus) {
  if (!ticket) return "Movimiento no disponible.";
  if (ticket.operationalStatus === "FINALIZADO" && operationalStatus !== "FINALIZADO") {
    return "Este ticket ya fue finalizado. Solo debe reabrirse con motivo y permiso administrativo.";
  }
  if (operationalStatus === "TICKET_CREADO") {
    return "El paso Nuevo ya esta cerrado para este ticket.";
  }
  return "Primero valida el comprobante de pago.";
}

function selectedPayment() {
  return (session.catalog?.paymentMethods || []).find((payment) => payment.code === ticketPayment.value);
}

function binancePayment() {
  return (session.catalog?.paymentMethods || []).find((payment) => payment.code === "BINANCE_PAY");
}

function flagIsoFromRegionalIndicators(value) {
  const chars = Array.from(String(value || ""));
  for (let index = 0; index < chars.length - 1; index += 1) {
    const first = chars[index].codePointAt(0);
    const second = chars[index + 1].codePointAt(0);
    const isFlagPair = first >= 0x1f1e6 && first <= 0x1f1ff && second >= 0x1f1e6 && second <= 0x1f1ff;
    if (isFlagPair) {
      return String.fromCharCode(65 + first - 0x1f1e6, 65 + second - 0x1f1e6);
    }
  }
  return "";
}

function countryFromFlag(value) {
  return countryByFlagIso[flagIsoFromRegionalIndicators(value)] || "";
}

function stripCountryFlags(value) {
  return Array.from(String(value || ""))
    .filter((char) => {
      const code = char.codePointAt(0);
      return code < 0x1f1e6 || code > 0x1f1ff;
    })
    .join("");
}

function normalizeForMatch(value) {
  return stripCountryFlags(value)
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function inferredClientCountry() {
  const text = normalizeForMatch(stripCountryFlags(ticketClient.value));
  const countries = session.catalog?.countries || [];
  const orderedCountries = [...new Set(countries)].sort((a, b) => b.length - a.length);
  const countryByText = orderedCountries.find((country) => {
    const needle = normalizeForMatch(country);
    return text === needle || text.endsWith(` ${needle}`);
  });
  return countryByText || countryFromFlag(ticketClient.value);
}

function stripPhoneFromClientText(value) {
  const text = String(value || "");
  return text.replace(/\+?\d[\d\s().-]{5,}\d/g, " ").replace(/\s+/g, " ").trim();
}

function removeTrailingCountryName(value, country) {
  const text = String(value || "").trim();
  const normalized = normalizeForMatch(text);
  const countryKey = normalizeForMatch(country);
  if (!country || normalized === countryKey) return "";
  if (!normalized.endsWith(` ${countryKey}`)) return text;
  return text.slice(0, Math.max(0, text.length - country.length)).trim();
}

function normalizeTicketClientDisplay() {
  if (!ticketClient.value.trim()) return;
  const country = inferredClientCountry();
  if (!country) return;
  const withoutFlags = stripCountryFlags(ticketClient.value);
  const withoutPhone = stripPhoneFromClientText(withoutFlags);
  const name = removeTrailingCountryName(withoutPhone, country);
  if (name) {
    ticketClient.value = `${name} ${country}`;
  }
}

function availablePaymentsForClient() {
  const payments = session.catalog?.paymentMethods || [];
  return payments.filter((payment) => payment.ticketOption);
}

function suggestedPaymentCodeForCountry(country) {
  const countryKey = normalizeForMatch(country);
  return suggestedPaymentByCountry[countryKey] || "BINANCE_PAY";
}

function syncPaymentOptions() {
  const countryKey = normalizeForMatch(inferredClientCountry());
  const countryChanged = countryKey !== lastPaymentCountryKey;
  lastPaymentCountryKey = countryKey;
  const previous = ticketPayment.value;
  const payments = availablePaymentsForClient();
  ticketPayment.innerHTML = payments
    .map((payment) => `<option value="${payment.code}">${escapeHtml(payment.globalOption ? "Binance USDT" : payment.label)}</option>`)
    .join("");
  const suggestedPaymentCode = suggestedPaymentCodeForCountry(countryKey);
  if (countryChanged && payments.some((payment) => payment.code === suggestedPaymentCode)) {
    ticketPayment.value = suggestedPaymentCode;
    return;
  }
  if (payments.some((payment) => payment.code === previous)) {
    ticketPayment.value = previous;
    return;
  }
  if (payments.some((payment) => payment.code === "BINANCE_PAY")) {
    ticketPayment.value = "BINANCE_PAY";
    return;
  }
  if (!ticketPayment.value && payments[0]) {
    ticketPayment.value = payments[0].code;
  }
}

function formatAmountForPayment(value, payment) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return "";
  if (payment?.amountMode === "thousands") {
    const normalizedAmount = amount > 0 && amount < 1000 ? Math.round(amount * 1000) : Math.round(amount);
    return `${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(normalizedAmount)} ${payment.currency}`;
  }
  if (payment?.currency === "PEN") return `S/ ${amount.toFixed(2)}`;
  if (payment?.currency === "USDT") return `${amount.toFixed(2)} USDT`;
  if (payment?.currency === "MXN") return `$${amount.toFixed(2)} MXN`;
  return `$${amount.toFixed(2)} ${payment?.currency || "USD"}`;
}

function formatTicketPrice(ticket) {
  if (ticket.priceFormatted) return ticket.priceFormatted;
  const payment = (session.catalog?.paymentMethods || []).find((candidate) => candidate.code === ticket.paymentMethod);
  return formatAmountForPayment(ticket.price, payment);
}

function syncPaymentPreview() {
  const payment = selectedPayment();
  if (!payment) {
    paymentPreview.innerHTML = `<strong>Selecciona un metodo de pago.</strong>`;
    priceHint.textContent = "";
    return;
  }
  const formattedAmount = formatAmountForPayment(ticketPrice.value, payment);
  const referenceText = payment.amountMode === "thousands"
    ? `Referencia: 35 se muestra como 35.000 ${payment.currency}.`
    : `Referencia: valor directo en ${payment.currency}.`;
  const usdtPayment = binancePayment();
  const showUsdtOption = usdtPayment && payment.code !== usdtPayment.code;
  const usdtAmount = showUsdtOption ? formatAmountForPayment(ticketPrice.value, usdtPayment) : "";
  priceHint.textContent = "";
  paymentPreview.innerHTML = `
    <div class="payment-main">
      <strong>Total en ticket: ${escapeHtml(formattedAmount)}</strong>
      <span>${escapeHtml(payment.label)}</span>
      ${showUsdtOption ? `<em>Si paga por Binance/USDT: ${escapeHtml(usdtAmount)}</em>` : ""}
    </div>
    ${renderPaymentLines(payment.details)}
    <small>${escapeHtml(referenceText)}</small>
  `;
}

function buildPaymentPreviewText() {
  const payment = selectedPayment();
  if (!payment) return "";
  const formattedAmount = formatAmountForPayment(ticketPrice.value, payment);
  const usdtPayment = binancePayment();
  const showUsdtOption = usdtPayment && payment.code !== usdtPayment.code;
  const lines = [
    `Total: ${formattedAmount}`,
    ...(showUsdtOption ? [`Opcion Binance/USDT: ${formatAmountForPayment(ticketPrice.value, usdtPayment)}`] : []),
    `Metodo: ${payment.label}`,
    ...(payment.details || []).map((line) => `- ${line}`),
    "",
    "Despues de pagar, enviar: Captura + Pais + Monto para validar mas rapido.",
  ];
  return lines.join("\n");
}

function buildTicketText(ticket) {
  const lines = [
    "Pedido generado",
    "",
    `Codigo: ${ticket.code}`,
    `Cliente: ${ticket.clientName}`,
    `Pais: ${ticket.country || "-"}`,
    `Servicio: ${ticket.serviceName}`,
  ];
  if (ticket.model) lines.push(`Equipo: ${ticket.model}`);
  if (ticket.paymentProofs?.length) lines.push(`Comprobante: ${ticket.paymentProofs.length} imagen(es)`);
  if (ticket.finalImages?.length) lines.push(`Evidencia final: ${ticket.finalImages.length} imagen(es)`);
  lines.push(
    `Total: ${formatTicketPrice(ticket)}`,
    `Metodo: ${ticket.paymentLabel}`,
    ...((ticket.paymentDetails || []).map((line) => `- ${line}`)),
    "",
    "Despues de pagar, enviar: Captura + Pais + Monto para validar mas rapido."
  );
  return lines.join("\n");
}

function buildFrpPriceText(order) {
  const lines = [
    "FRP Express - Xiaomi Cuenta Google",
    "",
    `Orden: ${order.code}`,
    `Cliente: ${order.clientName}`,
    `Pais: ${order.country || "-"}`,
    `Equipos: ${order.quantity}`,
    `Total: ${order.priceFormatted || formatAmountForPayment(order.totalPrice, frpPaymentByCode(order.paymentMethod))}`,
    `Metodo: ${order.paymentLabel}`,
    ...((order.paymentDetails || []).map((line) => `- ${line}`)),
    "",
    "Despues de pagar, enviar: Captura + Pais + Monto para validar mas rapido.",
  ];
  return lines.join("\n");
}

function buildFrpConnectionText(order) {
  const lines = [
    "Conexion FRP Express",
    "",
    `Orden: ${order.code}`,
    `Cliente: ${order.clientName}`,
    `Equipos: ${order.quantity}`,
    "",
    "1. Abre USB Redirector.",
    "2. Conecta el Xiaomi en modo sideload.",
    "3. Comparte el puerto USB y espera confirmacion.",
    "",
    "Cuando este listo responde: LISTO + codigo de orden.",
  ];
  return lines.join("\n");
}

function buildFrpDoneText(job) {
  const order = job.order || frpOrders().find((candidate) => candidate.id === job.orderId) || {};
  const total = order.totalPrice && order.unitPrice
    ? formatAmountForPayment(order.unitPrice, frpPaymentByCode(order.paymentMethod) || binancePayment())
    : "";
  const lines = [
    total ? `${total} - Done` : "Done",
    job.ardCode || "ARD pendiente",
    "",
    "Xiaomi Cuenta Google",
    `Orden: ${order.code || job.orderId}`,
    `Equipo: ${job.sequence} de ${job.totalJobs}`,
  ];
  if (job.finalLog) lines.push("", job.finalLog);
  return lines.join("\n");
}

function copyWithTemporaryField(text) {
  const activeElement = document.activeElement;
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.left = "-9999px";
  field.style.top = "0";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.focus();
  field.select();
  field.setSelectionRange(0, field.value.length);

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }

  field.remove();
  try {
    activeElement?.focus?.({ preventScroll: true });
  } catch {
    activeElement?.focus?.();
  }

  return copied;
}

async function copyTextToClipboard(text) {
  if (copyWithTemporaryField(text)) return true;
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  throw new Error("clipboard_unavailable");
}

function hideManualCopyPanel() {
  manualCopyPanel.hidden = true;
  manualCopyText.value = "";
}

function showManualCopyPanel(text) {
  manualCopyText.value = text;
  manualCopyPanel.hidden = false;
  requestAnimationFrame(() => {
    manualCopyText.focus();
    manualCopyText.select();
    manualCopyText.setSelectionRange(0, manualCopyText.value.length);
  });
}

function renderFinalLogImages() {
  if (!pendingFinalLogImages.length) {
    finalLogImages.innerHTML = "";
    return;
  }
  finalLogImages.innerHTML = pendingFinalLogImages
    .map((image) => `
      <article class="image-preview">
        <img src="${image.dataUrl}" alt="${escapeHtml(image.name)}" />
        <span>${escapeHtml(image.name)}</span>
        <button class="mini-btn" type="button" data-remove-final-image="${image.id}">Quitar</button>
      </article>
    `)
    .join("");
}

function fileToFinalImage(file) {
  return new Promise((resolve, reject) => {
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      reject(new Error("Solo se aceptan imagenes PNG, JPG o WEBP."));
      return;
    }
    if (file.size > maxFinalLogImageBytes) {
      reject(new Error("La imagen supera 2 MB."));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve({
      id: randomClientId(),
      name: file.name || "log-final.png",
      type: file.type,
      size: file.size,
      dataUrl: String(reader.result || ""),
    });
    reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
    reader.readAsDataURL(file);
  });
}

function randomClientId() {
  return globalThis.crypto?.randomUUID?.() || `img-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function addFinalLogFiles(files) {
  const imageFiles = Array.from(files || []).filter((file) => file.type?.startsWith("image/"));
  if (!imageFiles.length) return;
  finalLogHelp.textContent = "";
  try {
    for (const file of imageFiles) {
      if (pendingFinalLogImages.length >= maxFinalLogImages) {
        throw new Error(`Maximo ${maxFinalLogImages} imagenes por cierre.`);
      }
      pendingFinalLogImages.push(await fileToFinalImage(file));
    }
    renderFinalLogImages();
  } catch (error) {
    finalLogHelp.textContent = error.message;
    finalLogHelp.dataset.type = "error";
  } finally {
    finalLogFiles.value = "";
  }
}

function dragHasFiles(event) {
  return Array.from(event.dataTransfer?.types || []).includes("Files");
}

async function filesToImageAttachments(files) {
  const imageFiles = Array.from(files || []).filter((file) => file.type?.startsWith("image/"));
  if (!imageFiles.length) throw new Error("Arrastra una imagen PNG, JPG o WEBP.");
  const images = [];
  for (const file of imageFiles) {
    images.push(await fileToFinalImage(file));
  }
  return images.map((image) => ({
    name: image.name,
    type: image.type,
    size: image.size,
    dataUrl: image.dataUrl,
  }));
}

async function uploadPaymentProof(ticketId, files) {
  const ticket = session.tickets.find((candidate) => candidate.id === ticketId);
  if (!ticket) return;
  ticketMessage.textContent = "";
  try {
    const paymentProofs = await filesToImageAttachments(files);
    await api(`/api/tickets/${ticketId}/payment-proof`, {
      method: "PATCH",
      body: JSON.stringify({ paymentProofs }),
    });
    ticketMessage.textContent = `Comprobante cargado para revision en ${ticket.code}.`;
    ticketMessage.dataset.type = "neutral";
    await refreshSession();
  } catch (error) {
    ticketMessage.textContent = error.message;
    ticketMessage.dataset.type = "error";
  } finally {
    if (paymentProofFiles) paymentProofFiles.value = "";
    pendingPaymentProofTicketId = "";
  }
}

async function reviewPayment(ticketId, action) {
  const ticket = session.tickets.find((candidate) => candidate.id === ticketId);
  if (!ticket) return;
  ticketMessage.textContent = "";
  try {
    await api(`/api/tickets/${ticketId}/payment-review`, {
      method: "PATCH",
      body: JSON.stringify({ action }),
    });
    ticketMessage.textContent = action === "approve"
      ? `Pago validado para ${ticket.code}.`
      : `Comprobante rechazado para ${ticket.code}.`;
    ticketMessage.dataset.type = action === "approve" ? "success" : "error";
    await refreshSession();
  } catch (error) {
    ticketMessage.textContent = error.message;
    ticketMessage.dataset.type = "error";
  }
}

async function copyFrpText(text, successMessage) {
  try {
    await copyTextToClipboard(text);
    hideManualCopyPanel();
    frpMessage.textContent = successMessage;
    frpMessage.dataset.type = "success";
  } catch {
    showManualCopyPanel(text);
    frpMessage.textContent = "El navegador bloqueo el copiado automatico. Texto seleccionado abajo.";
    frpMessage.dataset.type = "neutral";
  }
}

async function updateFrpOrderChecklist(orderId, key, value) {
  try {
    await api(`/api/frp/orders/${orderId}/checklist`, {
      method: "PATCH",
      body: JSON.stringify({ key, value }),
    });
    await refreshSession();
  } catch (error) {
    frpMessage.textContent = error.message;
    frpMessage.dataset.type = "error";
    await refreshSession();
  }
}

async function updateFrpJobChecklist(jobId, key, value) {
  try {
    await api(`/api/frp/jobs/${jobId}/checklist`, {
      method: "PATCH",
      body: JSON.stringify({ key, value }),
    });
    await refreshSession();
  } catch (error) {
    frpMessage.textContent = error.message;
    frpMessage.dataset.type = "error";
    await refreshSession();
  }
}

async function uploadFrpPaymentProof(orderId, files) {
  const order = frpOrders().find((candidate) => candidate.id === orderId);
  if (!order) return;
  frpMessage.textContent = "";
  try {
    const paymentProofs = await filesToImageAttachments(files);
    await api(`/api/frp/orders/${orderId}/payment-proof`, {
      method: "PATCH",
      body: JSON.stringify({ paymentProofs }),
    });
    frpMessage.textContent = `Comprobante cargado para revision en ${order.code}.`;
    frpMessage.dataset.type = "neutral";
    await refreshSession();
  } catch (error) {
    frpMessage.textContent = error.message;
    frpMessage.dataset.type = "error";
  } finally {
    if (frpProofFiles) frpProofFiles.value = "";
    pendingFrpProofOrderId = "";
  }
}

async function reviewFrpPayment(orderId, action) {
  const order = frpOrders().find((candidate) => candidate.id === orderId);
  if (!order) return;
  frpMessage.textContent = "";
  try {
    let reason = "";
    if (action === "reject") {
      reason = window.prompt("Motivo del rechazo del comprobante FRP:", "Comprobante no valido") || "";
    }
    await api(`/api/frp/orders/${orderId}/payment-review`, {
      method: "PATCH",
      body: JSON.stringify({ action, reason }),
    });
    frpMessage.textContent = action === "approve"
      ? `Pago validado para ${order.code}.`
      : `Comprobante rechazado para ${order.code}.`;
    frpMessage.dataset.type = action === "approve" ? "success" : "error";
    await refreshSession();
  } catch (error) {
    frpMessage.textContent = error.message;
    frpMessage.dataset.type = "error";
  }
}

async function markFrpJobReady(jobId) {
  const job = frpJobs().find((candidate) => candidate.id === jobId);
  frpMessage.textContent = "";
  try {
    await api(`/api/frp/jobs/${jobId}/ready`, { method: "PATCH" });
    frpMessage.textContent = `Trabajo ${job?.code || ""} enviado a tecnico.`;
    frpMessage.dataset.type = "success";
    await refreshSession();
  } catch (error) {
    frpMessage.textContent = error.message;
    frpMessage.dataset.type = "error";
  }
}

function frpReviewDialogMessage() {
  return frpReviewDialog?.querySelector("[data-review-message]") || null;
}

function setFrpReviewDialogMessage(text, type = "") {
  const message = frpReviewDialogMessage();
  if (!message) return;
  message.textContent = text;
  message.dataset.type = type;
}

function frpReviewJobTitle(job) {
  const order = job?.order || {};
  const orderCode = order.code || job?.code || "-";
  const clientName = order.clientName || job?.clientName || "-";
  const jobCode = job?.code || "-";
  return { orderCode, clientName, jobCode };
}

function openFrpReviewDialog(jobId, mode) {
  if (!frpReviewDialog) return;
  const job = frpJobs().find((candidate) => candidate.id === jobId);
  if (!job) return;
  const { orderCode, clientName, jobCode } = frpReviewJobTitle(job);
  const reasonRow = frpReviewDialog.querySelector(".frp-review-dialog-reason");
  const reasonInput = frpReviewDialog.querySelector("[name='reason']");
  const submitButton = frpReviewDialog.querySelector("[data-review-action='submit']");
  frpReviewDialog.dataset.jobId = jobId;
  frpReviewDialog.dataset.mode = mode;
  frpReviewDialog.querySelector("[data-review-order]").textContent = orderCode;
  frpReviewDialog.querySelector("[data-review-client]").textContent = clientName;
  frpReviewDialog.querySelector("[data-review-job]").textContent = jobCode;
  setFrpReviewDialogMessage("");
  if (mode === "resolve") {
    frpReviewDialog.querySelector("[data-review-kicker]").textContent = "Caso en revision";
    frpReviewDialog.querySelector("[data-review-title]").textContent = "Resolver revision";
    frpReviewDialog.querySelector("[data-review-subtitle]").textContent = "Devuelve este equipo a la cola cuando ya esta corregido y listo para tecnico.";
    frpReviewDialog.querySelector("[data-review-note]").textContent = job.reviewReason || "Sin motivo registrado.";
    reasonRow.hidden = true;
    reasonInput.value = "";
    submitButton.textContent = "Devolver a cola";
  } else {
    frpReviewDialog.querySelector("[data-review-kicker]").textContent = "Reportar problema";
    frpReviewDialog.querySelector("[data-review-title]").textContent = "Enviar a revision";
    frpReviewDialog.querySelector("[data-review-subtitle]").textContent = "Registra por que este equipo no puede finalizarse ahora.";
    frpReviewDialog.querySelector("[data-review-note]").textContent = "El equipo saldra de tu trabajo actual y quedara visible en Atencion.";
    reasonRow.hidden = false;
    reasonInput.value = job.reviewReason || "Cliente no conectado / revisar estado";
    submitButton.textContent = "Enviar a revision";
    setTimeout(() => reasonInput.focus(), 0);
  }
  if (typeof frpReviewDialog.showModal === "function") frpReviewDialog.showModal();
  else frpReviewDialog.setAttribute("open", "");
}

function closeFrpReviewDialog() {
  if (!frpReviewDialog) return;
  if (typeof frpReviewDialog.close === "function") frpReviewDialog.close();
  else frpReviewDialog.removeAttribute("open");
  frpReviewDialog.dataset.jobId = "";
  frpReviewDialog.dataset.mode = "";
  frpReviewDialog.dataset.busy = "";
}

async function submitFrpReviewDialog() {
  if (!frpReviewDialog) return;
  if (frpReviewDialog.dataset.busy === "true") return;
  const jobId = frpReviewDialog.dataset.jobId || "";
  const mode = frpReviewDialog.dataset.mode || "";
  const job = frpJobs().find((candidate) => candidate.id === jobId);
  if (!job) return;
  setFrpReviewDialogMessage("");
  const submitButton = frpReviewDialog.querySelector("[data-review-action='submit']");
  frpReviewDialog.dataset.busy = "true";
  if (submitButton) submitButton.disabled = true;
  try {
    if (mode === "resolve") {
      await api(`/api/frp/jobs/${jobId}/ready`, { method: "PATCH" });
      setFrpReviewDialogMessage(`Trabajo ${job.code} devuelto a cola.`, "success");
      frpMessage.textContent = `Trabajo ${job.code} devuelto a cola.`;
      frpMessage.dataset.type = "success";
    } else {
      const reason = String(frpReviewDialog.querySelector("[name='reason']")?.value || "").trim();
      if (!reason) {
        setFrpReviewDialogMessage("Indica motivo de revision.", "error");
        return;
      }
      await api(`/api/frp/jobs/${jobId}/review`, {
        method: "PATCH",
        body: JSON.stringify({ reason }),
      });
      setFrpReviewDialogMessage(`FRP ${job.code} enviado a revision.`, "success");
      frpMessage.textContent = `FRP ${job.code} enviado a revision.`;
      frpMessage.dataset.type = "neutral";
    }
    setTimeout(() => closeFrpReviewDialog(), 450);
    await refreshSession();
  } catch (error) {
    setFrpReviewDialogMessage(error.message, "error");
    frpMessage.textContent = error.message;
    frpMessage.dataset.type = "error";
    await refreshSession();
  } finally {
    frpReviewDialog.dataset.busy = "";
    if (submitButton) submitButton.disabled = false;
  }
}

async function takeNextFrpJob() {
  frpMessage.textContent = "";
  try {
    const payload = await api("/api/frp/jobs/take-next", { method: "POST" });
    frpMessage.textContent = `Tomaste ${payload.job.code}.`;
    frpMessage.dataset.type = "success";
    await refreshSession();
  } catch (error) {
    frpMessage.textContent = error.message;
    frpMessage.dataset.type = "error";
  }
}

async function finalizeFrpJob(jobId) {
  const job = frpJobs().find((candidate) => candidate.id === jobId);
  if (!job) return;
  // Spec operador-frp-express.md decision #1: el panel rediseñado finaliza con
  // un solo click. El backend (commit 99aae55) genera auto-log con nombre +
  // hora Lima si no se manda body. Adjuntar evidencia es sub-accion separada
  // (no implementada en este commit, queda pendiente para un sub-acción
  // "Adjuntar evidencia" posterior al finalizado).
  frpMessage.textContent = "";
  try {
    await api(`/api/frp/jobs/${jobId}/finalize`, {
      method: "PATCH",
      body: JSON.stringify({}),
    });
    frpMessage.textContent = `FRP ${job.code} finalizado.`;
    frpMessage.dataset.type = "success";
    await refreshSession();
  } catch (error) {
    frpMessage.textContent = error.message;
    frpMessage.dataset.type = "error";
  }
}

async function takeSpecificFrpJob(jobId) {
  const job = frpJobs().find((candidate) => candidate.id === jobId);
  frpMessage.textContent = "";
  try {
    const payload = await api(`/api/frp/jobs/${jobId}/take`, { method: "POST" });
    frpMessage.textContent = `Tomaste ${payload.job.code}.`;
    frpMessage.dataset.type = "success";
    await refreshSession();
  } catch (error) {
    // AC #13: si otro tomó primero, el backend devuelve 409 + mensaje claro.
    frpMessage.textContent = error.message;
    frpMessage.dataset.type = "error";
    await refreshSession(); // refresca cola para que el card desaparezca
  }
}

// Reservado para commit 6 (banner timeout 30 min). Endpoint ya existe (commit
// d2bc27f). Lo dejo aca para que el wiring del banner solo tenga que invocar.
async function cancelFrpJob(jobId, reason, note = "") {
  const job = frpJobs().find((candidate) => candidate.id === jobId);
  frpMessage.textContent = "";
  try {
    await api(`/api/frp/jobs/${jobId}/cancel`, {
      method: "PATCH",
      body: JSON.stringify({ reason, note }),
    });
    frpMessage.textContent = `Job ${job?.code || ""} cancelado (${reason}).`;
    frpMessage.dataset.type = "success";
    await refreshSession();
  } catch (error) {
    frpMessage.textContent = error.message;
    frpMessage.dataset.type = "error";
  }
}

// Modal "Ver comprobante" — spec operador-frp-express.md §5.1, AC #16, #17.
// Reemplaza el window.prompt() del flow anterior por dialog estructurado:
// muestra imágenes del comprobante + monto, deja aprobar directo o pedir
// motivo de rechazo (≥10 chars) antes de submitear.
const frpProofDialog = document.querySelector("#frpProofDialog");
const frpProofPdfJsUrl = "/vendor/pdfjs/pdf.min.mjs";
const frpProofPdfWorkerUrl = "/vendor/pdfjs/pdf.worker.min.mjs";
const frpProofImageBaseWidth = 220;
const frpProofPdfBaseWidth = 360;
const frpProofMinZoom = 0.55;
const frpProofMaxZoom = 3;
let frpProofPdfJsPromise = null;
let frpProofZoom = 1;
let frpProofDrag = null;

function frpProofMessageEl() {
  return frpProofDialog?.querySelector("[data-proof-message]") || null;
}

function setFrpProofMessage(text, type = "") {
  const el = frpProofMessageEl();
  if (!el) return;
  el.textContent = text || "";
  if (type) el.dataset.type = type;
  else delete el.dataset.type;
}

function frpProofStageEl() {
  return frpProofDialog?.querySelector("[data-proof-stage]") || null;
}

function setFrpProofText(selector, text) {
  const el = frpProofDialog?.querySelector(selector);
  if (el) el.textContent = text || "-";
}

function frpProofAmount(order) {
  if (order?.priceFormatted) return order.priceFormatted;
  const payment = frpPaymentByCode(order?.paymentMethod);
  return formatAmountForPayment(order?.totalPrice, payment) || `${Number(order?.totalPrice || 0).toFixed(2)} USDT`;
}

function frpProofMethod(order) {
  return order?.paymentLabel || frpPaymentByCode(order?.paymentMethod)?.label || order?.paymentMethod || "-";
}

function frpProofSource(proof) {
  return proof?.dataUrl || proof?.url || "";
}

function frpProofMime(proof, src = frpProofSource(proof)) {
  if (proof?.type) return proof.type;
  const match = String(src || "").match(/^data:([^;]+);/i);
  return match?.[1] || "";
}

function currentFrpProofs(order) {
  const proofs = (Array.isArray(order?.paymentProofs) ? order.paymentProofs : [])
    .filter((proof) => frpProofSource(proof));
  const pending = proofs.filter((proof) => !proof.reviewStatus || proof.reviewStatus === "PENDIENTE");
  return (pending.length ? pending : proofs.slice(-1)).slice(-4);
}

function dataUrlToBytes(dataUrl) {
  const base64 = String(dataUrl || "").split(",")[1] || "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function loadFrpProofPdfJs() {
  if (!frpProofPdfJsPromise) {
    frpProofPdfJsPromise = import(frpProofPdfJsUrl).then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = frpProofPdfWorkerUrl;
      return pdfjs;
    });
  }
  return frpProofPdfJsPromise;
}

function resetFrpProofViewer() {
  frpProofZoom = 1;
  frpProofDrag = null;
  const stage = frpProofStageEl();
  if (stage) {
    stage.classList.remove("is-dragging");
    stage.scrollLeft = 0;
    stage.scrollTop = 0;
  }
}

function setFrpProofFileKind(text) {
  const el = frpProofDialog?.querySelector("[data-proof-file-kind]");
  if (el) el.textContent = text || "Comprobante";
}

function setFrpProofStageMessage(text) {
  const stage = frpProofStageEl();
  if (!stage) return;
  stage.innerHTML = `<div class="frp-proof-stage-empty">${escapeHtml(text)}</div>`;
}

function applyFrpProofZoom() {
  const stage = frpProofStageEl();
  if (!stage) return;
  stage.querySelectorAll("[data-proof-page]").forEach((page) => {
    const width = Number(page.dataset.baseWidth || 0);
    const height = Number(page.dataset.baseHeight || 0);
    if (width > 0) page.style.width = `${Math.round(width * frpProofZoom)}px`;
    if (height > 0) page.style.height = `${Math.round(height * frpProofZoom)}px`;
  });
}

function updateFrpProofZoom(nextZoom) {
  const stage = frpProofStageEl();
  if (!stage) return;
  const previousWidth = stage.scrollWidth || 1;
  const previousHeight = stage.scrollHeight || 1;
  const centerX = (stage.scrollLeft + stage.clientWidth / 2) / previousWidth;
  const centerY = (stage.scrollTop + stage.clientHeight / 2) / previousHeight;
  frpProofZoom = Math.min(frpProofMaxZoom, Math.max(frpProofMinZoom, nextZoom));
  applyFrpProofZoom();
  requestAnimationFrame(() => {
    stage.scrollLeft = Math.max(0, centerX * stage.scrollWidth - stage.clientWidth / 2);
    stage.scrollTop = Math.max(0, centerY * stage.scrollHeight - stage.clientHeight / 2);
  });
}

function loadProofImage(src, alt) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.alt = alt;
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("No se pudo cargar la imagen."));
    image.src = src;
  });
}

async function appendImageProof(documentEl, proof, src, index) {
  const image = await loadProofImage(src, `Comprobante ${index + 1}`);
  image.className = "frp-proof-page is-image";
  image.dataset.proofPage = "true";
  const stageWidth = Math.max(180, (frpProofStageEl()?.clientWidth || 320) - 48);
  const naturalWidth = image.naturalWidth || frpProofImageBaseWidth;
  const naturalHeight = image.naturalHeight || Math.round(frpProofImageBaseWidth * 1.7);
  const baseWidth = Math.min(frpProofImageBaseWidth, stageWidth, naturalWidth);
  image.dataset.baseWidth = String(baseWidth);
  image.dataset.baseHeight = String(Math.round((baseWidth * naturalHeight) / naturalWidth));
  documentEl.append(image);
}

async function appendPdfProof(documentEl, proof, src) {
  const pdfjs = await loadFrpProofPdfJs();
  const loadingTask = src.startsWith("data:")
    ? pdfjs.getDocument({ data: dataUrlToBytes(src) })
    : pdfjs.getDocument({ url: src });
  const pdf = await loadingTask.promise;
  const stageWidth = Math.max(260, (frpProofStageEl()?.clientWidth || 460) - 48);
  const baseWidthLimit = Math.min(frpProofPdfBaseWidth, stageWidth);
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const rawViewport = page.getViewport({ scale: 1 });
    const scale = baseWidthLimit / rawViewport.width;
    const viewport = page.getViewport({ scale });
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const canvas = document.createElement("canvas");
    canvas.className = "frp-proof-page is-pdf";
    canvas.dataset.proofPage = "true";
    canvas.dataset.baseWidth = String(Math.round(viewport.width));
    canvas.dataset.baseHeight = String(Math.round(viewport.height));
    canvas.width = Math.floor(viewport.width * pixelRatio);
    canvas.height = Math.floor(viewport.height * pixelRatio);
    await page.render({
      canvasContext: canvas.getContext("2d"),
      viewport,
      transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0],
    }).promise;
    documentEl.append(canvas);
  }
}

async function renderFrpProofViewer(order) {
  const stage = frpProofStageEl();
  if (!stage) return;
  resetFrpProofViewer();
  setFrpProofStageMessage("Cargando comprobante...");
  const proofs = currentFrpProofs(order);
  if (!proofs.length) {
    setFrpProofFileKind("Sin comprobante");
    setFrpProofStageMessage("No hay comprobante adjunto.");
    return;
  }
  const documentEl = document.createElement("div");
  documentEl.className = "frp-proof-document";
  stage.replaceChildren(documentEl);
  let pdfCount = 0;
  let imageCount = 0;
  for (const [index, proof] of proofs.entries()) {
    const src = frpProofSource(proof);
    const mime = frpProofMime(proof, src);
    if (mime === "application/pdf") {
      pdfCount += 1;
      await appendPdfProof(documentEl, proof, src);
    } else {
      imageCount += 1;
      await appendImageProof(documentEl, proof, src, index);
    }
  }
  setFrpProofFileKind(pdfCount ? "PDF" : imageCount > 1 ? `${imageCount} imagenes` : "Imagen");
  applyFrpProofZoom();
}

function openFrpProofDialog(orderId) {
  if (!frpProofDialog) return;
  const order = frpOrders().find((candidate) => candidate.id === orderId);
  if (!order) return;
  frpProofDialog.dataset.orderId = orderId;
  setFrpProofText("[data-proof-order]", order.code || "-");
  setFrpProofText("[data-proof-client]", order.clientName || "-");
  setFrpProofText("[data-proof-amount]", frpProofAmount(order));
  setFrpProofText("[data-proof-method]", frpProofMethod(order));
  setFrpProofMessage("");
  const reasonRow = frpProofDialog.querySelector(".frp-proof-dialog-reason");
  if (reasonRow) {
    reasonRow.hidden = true;
    const ta = reasonRow.querySelector("textarea");
    if (ta) ta.value = "";
  }
  setFrpProofFileKind("Comprobante");
  setFrpProofStageMessage("Cargando comprobante...");
  if (typeof frpProofDialog.showModal === "function") frpProofDialog.showModal();
  else frpProofDialog.setAttribute("open", "");
  renderFrpProofViewer(order).catch((error) => {
    setFrpProofFileKind("Error");
    setFrpProofStageMessage(error.message || "No se pudo mostrar el comprobante.");
  });
}

function closeFrpProofDialog() {
  if (!frpProofDialog) return;
  if (typeof frpProofDialog.close === "function") frpProofDialog.close();
  else frpProofDialog.removeAttribute("open");
}

async function submitFrpProofDecision(action) {
  if (!frpProofDialog) return;
  const orderId = frpProofDialog.dataset.orderId || "";
  if (!orderId) return;
  const reasonRow = frpProofDialog.querySelector(".frp-proof-dialog-reason");
  const reasonInput = reasonRow?.querySelector("textarea");
  const reason = reasonInput?.value.trim() || "";
  if (action === "reject") {
    if (reasonRow?.hidden) {
      // Primer click en Rechazar → muestra textarea.
      reasonRow.hidden = false;
      setFrpProofMessage("Indicá motivo del rechazo (mínimo 10 caracteres).", "error");
      reasonInput?.focus();
      return;
    }
    if (reason.length < 10) {
      setFrpProofMessage("El motivo debe tener al menos 10 caracteres.", "error");
      reasonInput?.focus();
      return;
    }
  }
  try {
    await api(`/api/frp/orders/${orderId}/payment-review`, {
      method: "PATCH",
      body: JSON.stringify({ action, reason }),
    });
    setFrpProofMessage(action === "approve" ? "Pago aprobado." : "Comprobante rechazado.", "success");
    await refreshSession();
    setTimeout(() => closeFrpProofDialog(), 600);
  } catch (error) {
    setFrpProofMessage(error.message, "error");
  }
}

frpProofDialog?.addEventListener("click", (event) => {
  const action = event.target.closest("[data-proof-action]")?.dataset?.proofAction;
  if (!action) return;
  if (action === "cancel") {
    closeFrpProofDialog();
  } else if (action === "approve" || action === "reject") {
    submitFrpProofDecision(action);
  }
});

frpReviewDialog?.addEventListener("click", async (event) => {
  const action = event.target.closest("[data-review-action]")?.dataset?.reviewAction;
  if (!action) return;
  if (action === "cancel") {
    closeFrpReviewDialog();
  } else if (action === "submit") {
    await submitFrpReviewDialog();
  }
});

frpProofStageEl()?.addEventListener("wheel", (event) => {
  if (!event.currentTarget.querySelector("[data-proof-page]")) return;
  event.preventDefault();
  const direction = event.deltaY < 0 ? 1 : -1;
  updateFrpProofZoom(frpProofZoom + direction * 0.12);
}, { passive: false });

frpProofStageEl()?.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || !event.currentTarget.querySelector("[data-proof-page]")) return;
  frpProofDrag = {
    pointerId: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    scrollLeft: event.currentTarget.scrollLeft,
    scrollTop: event.currentTarget.scrollTop,
  };
  event.currentTarget.setPointerCapture(event.pointerId);
  event.currentTarget.classList.add("is-dragging");
});

frpProofStageEl()?.addEventListener("pointermove", (event) => {
  if (!frpProofDrag || frpProofDrag.pointerId !== event.pointerId) return;
  event.currentTarget.scrollLeft = frpProofDrag.scrollLeft - (event.clientX - frpProofDrag.x);
  event.currentTarget.scrollTop = frpProofDrag.scrollTop - (event.clientY - frpProofDrag.y);
});

["pointerup", "pointercancel", "pointerleave"].forEach((eventName) => {
  frpProofStageEl()?.addEventListener(eventName, (event) => {
    if (frpProofDrag?.pointerId === event.pointerId) frpProofDrag = null;
    event.currentTarget.classList.remove("is-dragging");
  });
});

frpProofStageEl()?.addEventListener("dblclick", () => updateFrpProofZoom(1));

async function requestFrpReview(jobId) {
  const job = frpJobs().find((candidate) => candidate.id === jobId);
  if (!job) return;
  openFrpReviewDialog(jobId, "report");
}

function closeFinalLogModal(value = "", includeImages = true) {
  finalLogModal.classList.add("hidden");
  const result = {
    finalLog: value,
    finalImages: includeImages ? pendingFinalLogImages.map((image) => ({
      name: image.name,
      type: image.type,
      size: image.size,
      dataUrl: image.dataUrl,
    })) : [],
  };
  finalLogInput.value = "";
  finalLogHelp.textContent = "";
  pendingFinalLogImages = [];
  renderFinalLogImages();
  if (pendingFinalLogResolve) {
    pendingFinalLogResolve(result);
    pendingFinalLogResolve = null;
  }
}

function requestFinalLog(ticket) {
  finalLogTitle.textContent = `Log final - ${ticket.code}`;
  finalLogModal.classList.remove("hidden");
  finalLogInput.value = "";
  finalLogHelp.textContent = "";
  pendingFinalLogImages = [];
  renderFinalLogImages();
  finalLogInput.focus();
  return new Promise((resolve) => {
    pendingFinalLogResolve = resolve;
  });
}

function selectedService() {
  return servicesForCurrentChannel().find((service) => service.code === ticketService.value);
}

function syncSelectedService() {
  const service = selectedService();
  if (!service) {
    modelField.classList.add("hidden");
    modelField.querySelector("input").required = false;
    return;
  }
  modelField.classList.toggle("hidden", !service.requiresModel);
  modelField.querySelector("input").required = Boolean(service.requiresModel);
  if (!ticketPrice.value || Number(ticketPrice.value) === 0) {
    ticketPrice.value = service.defaultPrice || 0;
  }
}

function clearRememberedLogin() {
  localStorage.removeItem("ariad_last_email");
}

function activatePasswordResetFromUrl() {
  const token = new URLSearchParams(window.location.search).get("resetToken");
  if (!token) return;
  resetTokenInput.value = token;
  resetMode = "complete";
  switchTab("reset");
  showMessage("Ingresa tu nueva contrasena para terminar la recuperacion.", "neutral");
}

async function refreshSession() {
  session = await api("/api/session");
  await refreshPendingCostChanges();
  renderLayout();
}

async function refreshClientMasterLinks() {
  if (!isAdmin()) return;
  const payload = await api("/api/client-masters");
  session.clientMasterLinks = payload.clientMasterLinks || { masters: [], links: [], suggestions: [] };
  renderClientMasters();
}

async function refreshPresence() {
  if (!session.user) return;
  try {
    const payload = await api("/api/presence");
    session.presence = payload.presence;
    renderPresence();
  } catch (error) {
    if (error.message === "Sesion requerida.") {
      session = emptySession();
      renderLayout();
    }
  }
}

loginTab.addEventListener("click", () => switchTab("login"));
registerTab.addEventListener("click", () => switchTab("register"));
resetTab.addEventListener("click", () => {
  if (!resetTokenInput.value) resetMode = "request";
  switchTab("reset");
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(loginForm);
  const input = Object.fromEntries(form);
  try {
    await api("/api/login", {
      method: "POST",
      body: JSON.stringify(input),
    });
    clearRememberedLogin();
    toggleLoginPinField(false);
    loginForm.reset();
    await refreshSession();
  } catch (error) {
    if (error.code === "ADMIN_DEVICE_PIN_REQUIRED") {
      toggleLoginPinField(true, error.pinLabel || "PIN operativo");
      loginForm.elements.operatorPin.focus();
    }
    showMessage(error.message, "error");
  }
});

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(registerForm);
  try {
    const payload = await api("/api/register", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(form)),
    });
    showMessage(payload.message, "success");
    registerForm.reset();
    switchTab("login");
  } catch (error) {
    showMessage(error.message, "error");
  }
});

resetPasswordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(resetPasswordForm);
  try {
    const payload = await api("/api/password-reset/request", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(form)),
    });
    showMessage(payload.message, "success");
    resetPasswordForm.reset();
  } catch (error) {
    showMessage(error.message, "error");
  }
});

completeResetForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(completeResetForm);
  try {
    const payload = await api("/api/password-reset/confirm", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(form)),
    });
    showMessage(payload.message, "success");
    completeResetForm.reset();
    resetTokenInput.value = "";
    resetMode = "request";
    window.history.replaceState({}, document.title, window.location.pathname);
    switchTab("login");
  } catch (error) {
    showMessage(error.message, "error");
  }
});

changePasswordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(changePasswordForm);
  changePasswordMessage.textContent = "";
  try {
    const payload = await api("/api/me/password", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(form)),
    });
    changePasswordMessage.textContent = payload.message;
    changePasswordMessage.dataset.type = "success";
    changePasswordForm.reset();
  } catch (error) {
    changePasswordMessage.textContent = error.message;
    changePasswordMessage.dataset.type = "error";
  }
});

operatorPinForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(operatorPinForm);
  operatorPinMessage.textContent = "";
  try {
    const payload = await api("/api/me/operator-pin", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(form)),
    });
    operatorPinMessage.textContent = payload.message;
    operatorPinMessage.dataset.type = "success";
    operatorPinForm.reset();
    await refreshSession();
  } catch (error) {
    operatorPinMessage.textContent = error.message;
    operatorPinMessage.dataset.type = "error";
  }
});

revokeDevicesButton.addEventListener("click", async () => {
  operatorPinMessage.textContent = "";
  try {
    const payload = await api("/api/me/revoke-devices", { method: "POST" });
    operatorPinMessage.textContent = payload.message;
    operatorPinMessage.dataset.type = "success";
    await refreshSession();
  } catch (error) {
    operatorPinMessage.textContent = error.message;
    operatorPinMessage.dataset.type = "error";
  }
});

deviceApprovalsPanel.addEventListener("click", async (event) => {
  const approvalId = event.target.dataset.approveDevice;
  if (!approvalId) return;
  operatorPinMessage.textContent = "";
  try {
    const payload = await api(`/api/me/device-approvals/${approvalId}/approve`, { method: "POST" });
    operatorPinMessage.textContent = payload.message;
    operatorPinMessage.dataset.type = "success";
    await refreshSession();
  } catch (error) {
    operatorPinMessage.textContent = error.message;
    operatorPinMessage.dataset.type = "error";
  }
});

document.querySelector("#logout-button").addEventListener("click", async () => {
  await api("/api/logout", { method: "POST" });
  clearRememberedLogin();
  session = emptySession();
  renderLayout();
});

document.querySelector("#refresh-users").addEventListener("click", refreshSession);
document.querySelector("#refresh-tickets").addEventListener("click", refreshSession);
document.querySelector("#refresh-clients").addEventListener("click", refreshSession);
document.querySelector("#refresh-pricing").addEventListener("click", refreshSession);
// QUE: feedback inline al guardar (texto del boton + clase). PR-2a-fix BUG 2.
// POR QUE: antes el unico feedback estaba en #frp-message lejos del boton de
// pricing (off-screen). El cliente apretaba "Guardar" sin ver si funciono.
function showButtonFeedback(button, kind, text, durationMs = 1800) {
  if (!button) return;
  const original = button.dataset.originalText || button.textContent;
  if (!button.dataset.originalText) button.dataset.originalText = original;
  button.classList.remove("is-success", "is-error");
  button.classList.add(kind === "success" ? "is-success" : kind === "error" ? "is-error" : "is-saving");
  button.textContent = text;
  if (kind !== "saving") {
    setTimeout(() => {
      button.classList.remove("is-success", "is-error");
      button.textContent = button.dataset.originalText || original;
      button.disabled = false;
    }, durationMs);
  }
}

frpPricingBox?.addEventListener("submit", async (event) => {
  const form = event.target.closest("[data-frp-policy-form]");
  if (!form) return;
  event.preventDefault();
  const valueOf = (key) => form.querySelector(`[data-frp-policy="${key}"]`)?.value || 0;
  const button = form.querySelector("button[type='submit']");
  button.disabled = true;
  frpMessage.textContent = "";
  showButtonFeedback(button, "saving", "Guardando...");
  try {
    // PR-2a.6: solo se manda targetMargin y maxWorkerCostChangePct. Los campos
    // legacy (minMarginUsdt, minSellPriceUsdt) los ponemos a 0 explicitamente
    // para limpiar persisted leftovers de versiones anteriores.
    const payload = await api("/api/frp/pricing/policy", {
      method: "PATCH",
      body: JSON.stringify({
        minMarginUsdt: 0,
        minSellPriceUsdt: 0,
        targetMarginUsdt: valueOf("targetMarginUsdt"),
        maxWorkerCostChangePct: valueOf("maxWorkerCostChangePct"),
      }),
    });
    session.frp = payload.frp;
    showButtonFeedback(button, "success", "✓ Politica guardada", 1500);
    frpMessage.textContent = "Politica FRP actualizada.";
    frpMessage.dataset.type = "success";
    setTimeout(() => renderFrp(), 1600);
  } catch (error) {
    showButtonFeedback(button, "error", `✗ ${error.message.slice(0, 60)}`, 3500);
    frpMessage.textContent = error.message;
    frpMessage.dataset.type = "error";
  }
});

async function saveFrpProvider(button, providerId, options = {}) {
  const valueOf = (selector) => frpPricingBox.querySelector(`[${selector}="${providerId}"]`)?.value || "";
  const reasonInput = frpPricingBox.querySelector(`[data-frp-provider-reason="${providerId}"]`);
  const reason = (reasonInput?.value || "").trim();
  if (!reason) {
    if (reasonInput) {
      reasonInput.classList.add("is-invalid");
      reasonInput.focus();
      const onInput = () => { reasonInput.classList.remove("is-invalid"); reasonInput.removeEventListener("input", onInput); };
      reasonInput.addEventListener("input", onInput);
    }
    showButtonFeedback(button, "error", "✗ Motivo obligatorio", 2500);
    return;
  }
  button.disabled = true;
  frpMessage.textContent = "";
  showButtonFeedback(button, "saving", options.confirmed ? "Aplicando..." : "Guardando...");
  try {
    const payload = await api(`/api/frp/pricing/providers/${encodeURIComponent(providerId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: valueOf("data-frp-provider-status"),
        costMode: valueOf("data-frp-provider-mode"),
        fixedCostUsdt: valueOf("data-frp-provider-fixed"),
        creditsPerProcess: valueOf("data-frp-provider-credits"),
        creditUnitCostUsdt: valueOf("data-frp-provider-credit-cost"),
        reason,
        confirmed: Boolean(options.confirmed),
      }),
    });
    // Nivel 4 — backend devolvio 202 con pendingChange. La api() helper lo trata
    // como respuesta exitosa porque 202.ok === true.
    if (payload?.level === 4 && payload?.pendingChange) {
      showButtonFeedback(button, "saving", "Pendiente · admin", 4500);
      frpMessage.textContent = payload.message || "Cambio drástico — pendiente de aprobación de admin.";
      frpMessage.dataset.type = "warn";
      // Refrescar para que la cola de pendientes muestre el nuevo item.
      setTimeout(() => { refreshSession(); }, 1800);
      return;
    }
    session.frp = payload.frp;
    // Ajuste post-test: mostrar nivel siempre (incluido nivel 1) para que el
    // operador tenga confirmacion visual consistente entre niveles.
    const levelLabel = payload?.level ? ` (nivel ${payload.level})` : "";
    showButtonFeedback(button, "success", `✓ Guardado${levelLabel}`, 1500);
    frpMessage.textContent = `Proveedor FRP actualizado${payload?.deltaPct ? ` (Δ ${payload.deltaPct.toFixed(1)}%)` : ""}.`;
    frpMessage.dataset.type = "success";
    setTimeout(() => renderFrp(), 1600);
  } catch (error) {
    // PR-2a.6: 412 = requiere confirmacion (nivel 2 o 3). No es un fallo,
    // es parte del flow. Pedimos confirm() y reintentamos con confirmed:true.
    if (error.requiresConfirmation && (error.level === 2 || error.level === 3)) {
      const proceed = window.confirm(
        `${error.message}\n\n` +
        (error.level === 3 ? "Nivel 3: motivo necesita ≥15 caracteres y se notificará al admin.\n\n" : "") +
        "¿Confirmar el cambio?"
      );
      if (proceed) {
        return saveFrpProvider(button, providerId, { confirmed: true });
      }
      showButtonFeedback(button, "error", "Cambio cancelado", 1800);
      return;
    }
    showButtonFeedback(button, "error", `✗ ${(error.message || "Error").slice(0, 60)}`, 3500);
    frpMessage.textContent = error.message || "No se pudo guardar.";
    frpMessage.dataset.type = "error";
  }
}

frpPricingBox?.addEventListener("click", async (event) => {
  const saveBtn = event.target.closest("[data-save-frp-provider]");
  if (saveBtn) {
    await saveFrpProvider(saveBtn, saveBtn.dataset.saveFrpProvider);
    return;
  }
  // PR-2a.7: archivar provider con confirm + motivo via prompt.
  const archiveBtn = event.target.closest("[data-archive-frp-provider]");
  if (archiveBtn) {
    const providerId = archiveBtn.dataset.archiveFrpProvider;
    const providerName = archiveBtn.dataset.providerName;
    const reason = window.prompt(
      `Archivar "${providerName}". El proveedor saldrá del selector activo y no se podrá editar. Queda en auditoría. Motivo (obligatorio):`
    );
    if (!reason || !reason.trim()) return;
    archiveBtn.disabled = true;
    showButtonFeedback(archiveBtn, "saving", "Archivando...");
    try {
      const payload = await api(`/api/frp/pricing/providers/${encodeURIComponent(providerId)}/archive`, {
        method: "POST",
        body: JSON.stringify({ reason: reason.trim() }),
      });
      session.frp = payload.frp;
      showButtonFeedback(archiveBtn, "success", "✓ Archivado", 1300);
      frpMessage.textContent = `Proveedor "${providerName}" archivado.`;
      frpMessage.dataset.type = "success";
      setTimeout(() => renderFrp(), 1400);
    } catch (error) {
      showButtonFeedback(archiveBtn, "error", `✗ ${(error.message || "Error").slice(0, 60)}`, 3500);
      frpMessage.textContent = error.message;
      frpMessage.dataset.type = "error";
    }
    return;
  }
  // PR-2a.7: abrir modal de nuevo proveedor.
  const openNewBtn = event.target.closest("[data-action='open-new-provider']");
  if (openNewBtn) {
    const dialog = document.querySelector("#newProviderDialog");
    if (!dialog) return;
    const form = dialog.querySelector("#newProviderForm");
    form?.reset();
    // Reset visual de submit button.
    const submitBtn = form?.querySelector("[data-new-provider-action='confirm']");
    if (submitBtn) {
      submitBtn.classList.remove("is-success", "is-error", "is-saving");
      submitBtn.disabled = false;
      delete submitBtn.dataset.originalText;
      submitBtn.textContent = "Guardar";
    }
    dialog.showModal();
  }
});

// PR-2a.7: cambio entre modos FIXED_USDT y CREDITS muestra/oculta inputs.
document.querySelector("#newProviderForm select[name='costMode']")?.addEventListener("change", (event) => {
  const dialog = document.querySelector("#newProviderDialog");
  const fixedRow = dialog.querySelector("[data-new-provider-fixed]");
  const creditsRow = dialog.querySelector("[data-new-provider-credits]");
  if (event.target.value === "CREDITS") {
    fixedRow.hidden = true;
    creditsRow.hidden = false;
  } else {
    fixedRow.hidden = false;
    creditsRow.hidden = true;
  }
});

// PR-2a.7: cancelar new provider dialog.
document.querySelector("#newProviderDialog")?.addEventListener("click", (event) => {
  const cancelBtn = event.target.closest("[data-new-provider-action='cancel']");
  if (!cancelBtn) return;
  event.preventDefault();
  document.querySelector("#newProviderDialog")?.close();
});

// PR-2a.7: submit new provider.
document.querySelector("#newProviderForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const dialog = document.querySelector("#newProviderDialog");
  const submitBtn = form.querySelector("[data-new-provider-action='confirm']");
  const data = Object.fromEntries(new FormData(form));
  const reason = String(data.reason || "").trim();
  if (reason.length < 15) {
    const reasonInput = form.querySelector("[name='reason']");
    reasonInput?.classList.add("is-invalid");
    showButtonFeedback(submitBtn, "error", `✗ Motivo ≥15 chars (actual: ${reason.length})`, 2500);
    const onInput = () => { reasonInput?.classList.remove("is-invalid"); reasonInput?.removeEventListener("input", onInput); };
    reasonInput?.addEventListener("input", onInput);
    return;
  }
  showButtonFeedback(submitBtn, "saving", "Guardando...");
  submitBtn.disabled = true;
  try {
    const payload = await api("/api/frp/pricing/providers", {
      method: "POST",
      body: JSON.stringify({
        name: String(data.name || "").trim(),
        status: String(data.status || "OFF"),
        costMode: String(data.costMode || "FIXED_USDT"),
        fixedCostUsdt: Number(data.fixedCostUsdt || 0),
        creditsPerProcess: Number(data.creditsPerProcess || 0),
        creditUnitCostUsdt: Number(data.creditUnitCostUsdt || 0),
        reason,
      }),
    });
    session.frp = payload.frp;
    showButtonFeedback(submitBtn, "success", "✓ Proveedor agregado", 1500);
    frpMessage.textContent = "Proveedor creado. Arranca en bootstrap (3 cambios o 7 días para validación normal).";
    frpMessage.dataset.type = "success";
    setTimeout(() => {
      dialog.close();
      renderFrp();
    }, 1600);
  } catch (error) {
    showButtonFeedback(submitBtn, "error", `✗ ${(error.message || "Error").slice(0, 60)}`, 3500);
  }
});
ticketService.addEventListener("change", () => {
  ticketPrice.value = selectedService()?.defaultPrice || 0;
  syncSelectedService();
  syncPaymentPreview();
});
ticketPayment.addEventListener("change", syncPaymentPreview);
ticketPrice.addEventListener("input", syncPaymentPreview);
ticketClient.addEventListener("input", () => {
  normalizeTicketClientDisplay();
  syncPaymentOptions();
  syncPaymentPreview();
});
ticketClient.addEventListener("blur", () => {
  normalizeTicketClientDisplay();
  syncPaymentOptions();
  syncPaymentPreview();
});

copyPaymentPreview.addEventListener("click", async () => {
  const text = buildPaymentPreviewText();
  if (!text) return;
  try {
    await copyTextToClipboard(text);
    hideManualCopyPanel();
    ticketMessage.textContent = "Datos de pago copiados. Ya puedes pegar.";
    ticketMessage.dataset.type = "success";
  } catch {
    showManualCopyPanel(text);
    ticketMessage.textContent = "El navegador bloqueo el copiado automatico. Texto seleccionado abajo.";
    ticketMessage.dataset.type = "neutral";
  }
});

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => {
    activatePanel(button.dataset.panel);
  });
});

adminOperationalChannel?.addEventListener("change", () => {
  adminPreviewChannel = adminOperationalChannel.value;
  localStorage.setItem("ariad_admin_preview_channel", adminPreviewChannel);
  selectedChannelFilter = "mine";
  renderAdminChannelSwitcher();
  renderChannelFilter();
  renderOverviewForRole();
  renderCatalog();
  renderClients();
  renderTicketBoard();
  renderTickets();
  startTechnicianWidgetPolling();
});

ticketChannelFilter.addEventListener("click", (event) => {
  const button = event.target.closest("[data-channel-filter]");
  if (!button) return;
  selectedChannelFilter = button.dataset.channelFilter;
  renderChannelFilter();
  renderCatalog();
  renderClients();
  renderTicketBoard();
  renderTickets();
  startTechnicianWidgetPolling();
});

usersTable.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-save-user]");
  if (!button) return;
  const userId = button.dataset.saveUser;
  const role = usersTable.querySelector(`[data-user-role="${userId}"]`).value;
  const active = usersTable.querySelector(`[data-user-active="${userId}"]`).checked;
  const workChannel = usersTable.querySelector(`[data-user-channel="${userId}"]`).value;
  const frpCostManager = Boolean(usersTable.querySelector(`[data-user-frp-cost-manager="${userId}"]`)?.checked);
  const technicianRedirectorId = String(usersTable.querySelector(`[data-user-technician-redirector="${userId}"]`)?.value || "").trim();
  button.disabled = true;
  try {
    await api(`/api/users/${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ role, active, workChannel, permissions: { frpCostManager }, technicianRedirectorId }),
    });
    await refreshSession();
  } finally {
    button.disabled = false;
  }
});

pricingRatesTable.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-save-rate]");
  if (!button) return;
  const key = button.dataset.saveRate;
  const input = pricingRatesTable.querySelector(`[data-rate-value="${key}"]`);
  button.disabled = true;
  pricingMessage.textContent = "";
  try {
    const payload = await api(`/api/pricing/exchange-rates/${encodeURIComponent(key)}`, {
      method: "PATCH",
      body: JSON.stringify({ ratePerUsdt: input?.value || 0 }),
    });
    session.pricingConfig = payload.pricingConfig;
    renderPricing();
    pricingMessage.textContent = "Tasa actualizada.";
    pricingMessage.dataset.type = "success";
  } catch (error) {
    pricingMessage.textContent = error.message;
    pricingMessage.dataset.type = "error";
  } finally {
    button.disabled = false;
  }
});

pricingRulesTable.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-save-rule]");
  if (!button) return;
  const serviceCode = button.dataset.saveRule;
  const valueOf = (selector) => pricingRulesTable.querySelector(`[${selector}="${serviceCode}"]`)?.value || 0;
  const checkedOf = (selector) => Boolean(pricingRulesTable.querySelector(`[${selector}="${serviceCode}"]`)?.checked);
  button.disabled = true;
  pricingMessage.textContent = "";
  try {
    const payload = await api(`/api/pricing/service-rules/${encodeURIComponent(serviceCode)}`, {
      method: "PATCH",
      body: JSON.stringify({
        pricingMode: valueOf("data-rule-mode"),
        baseCostUsdt: valueOf("data-rule-base"),
        marginUsdt: valueOf("data-rule-margin"),
        authCostUsdt: valueOf("data-rule-auth"),
        criticalCostUsdt: valueOf("data-rule-critical"),
        toolCostUsdt: valueOf("data-rule-tool"),
        serverCostUsdt: valueOf("data-rule-server"),
        manualAdjustmentAllowed: checkedOf("data-rule-manual"),
      }),
    });
    session.pricingConfig = payload.pricingConfig;
    renderPricing();
    pricingMessage.textContent = "Regla de costo actualizada.";
    pricingMessage.dataset.type = "success";
  } catch (error) {
    pricingMessage.textContent = error.message;
    pricingMessage.dataset.type = "error";
  } finally {
    button.disabled = false;
  }
});

dailyCloseDate?.addEventListener("change", async () => {
  try {
    await loadDailyClose(dailyCloseDate.value);
  } catch (error) {
    setDailyCloseMessage(error.message, "error");
  }
});

refreshDailyCloseButton?.addEventListener("click", async () => {
  refreshDailyCloseButton.disabled = true;
  try {
    await loadDailyClose();
    setDailyCloseMessage("Cierre actualizado.", "success");
  } catch (error) {
    setDailyCloseMessage(error.message, "error");
  } finally {
    refreshDailyCloseButton.disabled = false;
  }
});

exportDailyCloseButton?.addEventListener("click", () => {
  window.location.href = `/api/daily-close/${encodeURIComponent(dailyCloseDateValue())}/export`;
});

closeDailyCloseButton?.addEventListener("click", async () => {
  closeDailyCloseButton.disabled = true;
  try {
    const payload = await api(`/api/daily-close/${encodeURIComponent(dailyCloseDateValue())}/close`, {
      method: "POST",
      body: JSON.stringify({ notes: dailyCloseNotes?.value || "" }),
    });
    session.dailyClose = payload.dailyClose;
    renderDailyClose();
    setDailyCloseMessage("Dia cerrado y lineas guardadas.", "success");
  } catch (error) {
    setDailyCloseMessage(error.message, "error");
  } finally {
    renderDailyClose();
  }
});

reopenDailyCloseButton?.addEventListener("click", async () => {
  const reason = window.prompt("Motivo para reabrir el cierre");
  if (!reason) return;
  reopenDailyCloseButton.disabled = true;
  try {
    const payload = await api(`/api/daily-close/${encodeURIComponent(dailyCloseDateValue())}/reopen`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
    session.dailyClose = payload.dailyClose;
    renderDailyClose();
    setDailyCloseMessage("Cierre reabierto con auditoria.", "success");
  } catch (error) {
    setDailyCloseMessage(error.message, "error");
  } finally {
    renderDailyClose();
  }
});

dailyAdjustmentForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = dailyAdjustmentForm.querySelector("button[type='submit']");
  const form = new FormData(dailyAdjustmentForm);
  button.disabled = true;
  try {
    const payload = await api(`/api/daily-close/${encodeURIComponent(dailyCloseDateValue())}/adjustments`, {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(form.entries())),
    });
    session.dailyClose = payload.dailyClose;
    dailyAdjustmentForm.reset();
    renderDailyClose();
    setDailyCloseMessage("Ajuste registrado.", "success");
  } catch (error) {
    setDailyCloseMessage(error.message, "error");
  } finally {
    button.disabled = false;
  }
});

ticketsTable.addEventListener("click", async (event) => {
  const channelButton = event.target.closest("[data-save-ticket-channel]");
  if (!channelButton) return;
  const ticketId = channelButton.dataset.saveTicketChannel;
  const selector = ticketsTable.querySelector(`[data-ticket-channel="${ticketId}"]`);
  if (!selector) return;
  channelButton.disabled = true;
  ticketMessage.textContent = "";
  try {
    await api(`/api/tickets/${ticketId}/channel`, {
      method: "PATCH",
      body: JSON.stringify({ currentChannel: selector.value }),
    });
    ticketMessage.textContent = "Canal responsable actualizado.";
    ticketMessage.dataset.type = "success";
    await refreshSession();
  } catch (error) {
    ticketMessage.textContent = error.message;
    ticketMessage.dataset.type = "error";
  } finally {
    channelButton.disabled = false;
  }
});

ticketsTable.addEventListener("click", async (event) => {
  const copyButton = event.target.closest("[data-copy-ticket]");
  if (!copyButton) return;
  const ticket = session.tickets.find((candidate) => candidate.id === copyButton.dataset.copyTicket);
  if (!ticket) return;
  const text = buildTicketText(ticket);
  try {
    await copyTextToClipboard(text);
    hideManualCopyPanel();
    ticketMessage.textContent = `Ticket ${ticket.code} copiado. Ya puedes pegar.`;
    ticketMessage.dataset.type = "success";
  } catch {
    showManualCopyPanel(text);
    ticketMessage.textContent = "El navegador bloqueo el copiado automatico. Texto seleccionado abajo.";
    ticketMessage.dataset.type = "neutral";
  }
});

ticketsTable.addEventListener("click", (event) => {
  const button = event.target.closest("[data-upload-proof]");
  if (!button) return;
  pendingPaymentProofTicketId = button.dataset.uploadProof;
  paymentProofFiles.click();
});

ticketsTable.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-review-payment]");
  if (!button) return;
  await reviewPayment(button.dataset.reviewPayment, button.dataset.reviewAction);
});

paymentProofFiles.addEventListener("change", () => {
  if (!pendingPaymentProofTicketId) return;
  uploadPaymentProof(pendingPaymentProofTicketId, paymentProofFiles.files);
});

finalLogCancel.addEventListener("click", () => closeFinalLogModal("", false));

finalLogForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const value = finalLogInput.value.trim();
  if (!value && !pendingFinalLogImages.length) {
    finalLogHelp.textContent = "Agrega texto o al menos una imagen.";
    finalLogHelp.dataset.type = "error";
    return;
  }
  closeFinalLogModal(value);
});

finalLogFiles.addEventListener("change", () => addFinalLogFiles(finalLogFiles.files));

finalLogDropzone.addEventListener("click", () => finalLogFiles.click());

finalLogDropzone.addEventListener("dragover", (event) => {
  event.preventDefault();
  finalLogDropzone.classList.add("over");
});

finalLogDropzone.addEventListener("dragleave", () => {
  finalLogDropzone.classList.remove("over");
});

finalLogDropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  finalLogDropzone.classList.remove("over");
  addFinalLogFiles(event.dataTransfer.files);
});

finalLogModal.addEventListener("paste", (event) => {
  const files = Array.from(event.clipboardData?.items || [])
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter(Boolean);
  addFinalLogFiles(files);
});

finalLogImages.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-final-image]");
  if (!button) return;
  pendingFinalLogImages = pendingFinalLogImages.filter((image) => image.id !== button.dataset.removeFinalImage);
  renderFinalLogImages();
});

clientForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(clientForm);
  const button = clientForm.querySelector("button[type='submit']");
  button.disabled = true;
  clientMessage.textContent = "";
  try {
    const payload = await api("/api/clients", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(form)),
    });
    clientMessage.textContent = `Cliente ${payload.client.name} agregado.`;
    clientMessage.dataset.type = "success";
    clientForm.reset();
    await refreshSession();
  } catch (error) {
    clientMessage.textContent = error.message;
    clientMessage.dataset.type = "error";
  } finally {
    button.disabled = false;
  }
});

refreshClientMasters?.addEventListener("click", async () => {
  clientMasterMessage.textContent = "";
  try {
    await refreshClientMasterLinks();
    clientMasterMessage.textContent = "Vinculos actualizados.";
    clientMasterMessage.dataset.type = "success";
  } catch (error) {
    clientMasterMessage.textContent = error.message;
    clientMasterMessage.dataset.type = "error";
  }
});

clientMasterSuggestions?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-review-link]");
  if (!button) return;
  const suggestionId = button.dataset.reviewLink;
  const action = button.dataset.linkAction;
  clientMasterMessage.textContent = "";
  button.disabled = true;
  try {
    const payload = await api(`/api/client-link-suggestions/${encodeURIComponent(suggestionId)}`, {
      method: "PATCH",
      body: JSON.stringify({ action }),
    });
    session.clientMasterLinks = payload.clientMasterLinks || session.clientMasterLinks;
    renderClientMasters();
    clientMasterMessage.textContent = "Revision guardada.";
    clientMasterMessage.dataset.type = "success";
  } catch (error) {
    clientMasterMessage.textContent = error.message;
    clientMasterMessage.dataset.type = "error";
  } finally {
    button.disabled = false;
  }
});

ticketForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!selectedService()) {
    ticketMessage.textContent = "Tu WhatsApp no tiene servicios configurados.";
    ticketMessage.dataset.type = "error";
    return;
  }
  normalizeTicketClientDisplay();
  const form = new FormData(ticketForm);
  const input = Object.fromEntries(form);
  if (isAdmin()) input.workChannel = currentUserChannel();
  const button = ticketForm.querySelector("button[type='submit']");
  button.disabled = true;
  ticketMessage.textContent = "";
  hideManualCopyPanel();
  try {
    const payload = await api("/api/tickets", {
      method: "POST",
      body: JSON.stringify(input),
    });
    ticketMessage.textContent = `Ticket ${payload.ticket.code} generado.`;
    ticketMessage.dataset.type = "success";
    ticketForm.reset();
    await refreshSession();
  } catch (error) {
    ticketMessage.textContent = error.message;
    ticketMessage.dataset.type = "error";
  } finally {
    button.disabled = false;
    syncSelectedService();
    syncPaymentPreview();
  }
});

frpWorkbench?.addEventListener("click", async (event) => {
  const takeNextButton = event.target.closest("[data-frp-take-next]");
  if (takeNextButton) {
    await takeNextFrpJob();
    return;
  }

  // FRP Ops v2 — botón "Tomar" en card específico de la cola.
  const takeSpecificButton = event.target.closest("[data-frp-take-specific]");
  if (takeSpecificButton) {
    await takeSpecificFrpJob(takeSpecificButton.dataset.frpTakeSpecific);
    return;
  }

  // FRP Ops v2 — toggle filtro VIP (client-side, sessionStorage).
  const vipToggle = event.target.closest("[data-frp-vip-toggle]");
  if (vipToggle) {
    setFrpOpsV2VipFilter(!frpOpsV2VipFilterEnabled());
    renderFrp();
    return;
  }

  // FRP Ops v2 — abrir modal "Ver comprobante" desde card de Pagos por revisar.
  const showProofButton = event.target.closest("[data-frp-show-proof]");
  if (showProofButton) {
    openFrpProofDialog(showProofButton.dataset.frpShowProof);
    return;
  }

  const showReviewButton = event.target.closest("[data-frp-show-review]");
  if (showReviewButton) {
    openFrpReviewDialog(showReviewButton.dataset.frpShowReview, "resolve");
    return;
  }

  // FRP Ops v2 — banner timeout 30 min: [Sigo trabajando] silencia el banner
  // 30 min mas desde el click. Re-render con skipPricing para no destruir
  // el estado del Costos FRP collapsible.
  const keepWorkingButton = event.target.closest("[data-frp-keep-working]");
  if (keepWorkingButton) {
    frpOpsV2MarkKeepWorking(keepWorkingButton.dataset.frpKeepWorking);
    renderFrp({ skipPricing: true });
    return;
  }

  // FRP Ops v2 — banner timeout 30 min: [Cancelar job] confirma + invoca
  // endpoint cancel con reason='timeout'. cancelFrpJob ya hace refreshSession
  // que dispara el render completo (con pricing).
  const cancelTimeoutButton = event.target.closest("[data-frp-cancel-timeout]");
  if (cancelTimeoutButton) {
    const ok = window.confirm("¿Cancelar este job? Vuelve a la cola para que otro técnico lo tome.");
    if (ok) {
      await cancelFrpJob(cancelTimeoutButton.dataset.frpCancelTimeout, "timeout", "Cancelado tras 30+ min sin finalizar");
    }
    return;
  }

  const finalizeButton = event.target.closest("[data-frp-finalize]");
  if (finalizeButton) {
    await finalizeFrpJob(finalizeButton.dataset.frpFinalize);
    return;
  }

  const reviewJobButton = event.target.closest("[data-frp-review]");
  if (reviewJobButton) {
    await requestFrpReview(reviewJobButton.dataset.frpReview);
    return;
  }
});

ticketBoard.addEventListener("dragstart", (event) => {
  const card = event.target.closest(".ticket-card");
  if (!card) return;
  const ticket = session.tickets.find((candidate) => candidate.id === card.dataset.ticketId);
  if (ticket?.operationalStatus === "FINALIZADO") {
    event.preventDefault();
    ticketMessage.textContent = "Este ticket ya esta finalizado y queda bloqueado en el tablero.";
    ticketMessage.dataset.type = "neutral";
    return;
  }
  draggingTicketId = card.dataset.ticketId;
  event.dataTransfer.setData("text/plain", card.dataset.ticketId);
  event.dataTransfer.effectAllowed = "move";
  card.classList.add("dragging");
});

ticketBoard.addEventListener("dragend", (event) => {
  draggingTicketId = "";
  event.target.closest(".ticket-card")?.classList.remove("dragging");
  ticketBoard.querySelectorAll(".ticket-dropzone.over").forEach((zone) => zone.classList.remove("over"));
  ticketBoard.querySelectorAll(".ticket-dropzone.blocked").forEach((zone) => zone.classList.remove("blocked"));
  ticketBoard.querySelectorAll(".ticket-card.proof-over").forEach((card) => card.classList.remove("proof-over"));
});

ticketBoard.addEventListener("dragover", (event) => {
  if (dragHasFiles(event)) {
    const card = event.target.closest(".ticket-card");
    ticketBoard.querySelectorAll(".ticket-card.proof-over").forEach((item) => {
      if (item !== card) item.classList.remove("proof-over");
    });
    if (!card) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    card.classList.add("proof-over");
    return;
  }
  const zone = event.target.closest(".ticket-dropzone");
  if (!zone) return;
  const draggedTicket = session.tickets.find((candidate) => candidate.id === draggingTicketId);
  if (!canMoveTicketToStatus(draggedTicket, zone.dataset.status)) {
    zone.classList.add("blocked");
    return;
  }
  event.preventDefault();
  ticketBoard.querySelectorAll(".ticket-dropzone.blocked").forEach((item) => item.classList.remove("blocked"));
  zone.classList.add("over");
});

ticketBoard.addEventListener("dragleave", (event) => {
  const card = event.target.closest(".ticket-card");
  if (card && !card.contains(event.relatedTarget)) card.classList.remove("proof-over");
  const zone = event.target.closest(".ticket-dropzone");
  if (zone && !zone.contains(event.relatedTarget)) zone.classList.remove("over");
  if (zone && !zone.contains(event.relatedTarget)) zone.classList.remove("blocked");
});

ticketBoard.addEventListener("drop", async (event) => {
  if (dragHasFiles(event)) {
    const card = event.target.closest(".ticket-card");
    if (!card) return;
    event.preventDefault();
    card.classList.remove("proof-over");
    await uploadPaymentProof(card.dataset.ticketId, event.dataTransfer.files);
    return;
  }
  const zone = event.target.closest(".ticket-dropzone");
  if (!zone) return;
  event.preventDefault();
  zone.classList.remove("over");
  const ticketId = event.dataTransfer.getData("text/plain");
  const operationalStatus = zone.dataset.status;
  const ticket = session.tickets.find((candidate) => candidate.id === ticketId);
  if (!ticket || ticket.operationalStatus === operationalStatus) return;
  if (!canMoveTicketToStatus(ticket, operationalStatus)) {
    ticketMessage.textContent = moveTicketBlockMessage(ticket, operationalStatus);
    ticketMessage.dataset.type = "error";
    return;
  }
  let finalLog = "";
  let finalImages = [];
  if (operationalStatus === "FINALIZADO" && !ticket.finalLog && !ticket.finalImages?.length) {
    const result = await requestFinalLog(ticket);
    finalLog = result.finalLog || "";
    finalImages = result.finalImages || [];
    if (!finalLog.trim() && !finalImages.length) return;
  }
  try {
    await api(`/api/tickets/${ticketId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ operationalStatus, finalLog, finalImages }),
    });
    await refreshSession();
  } catch (error) {
    ticketMessage.textContent = error.message;
    ticketMessage.dataset.type = "error";
  }
});

const technicianWidget = document.querySelector("#technician-widget");
const technicianWidgetName = document.querySelector("#technician-widget-name");
const technicianWidgetId = document.querySelector("#technician-widget-id");
const technicianWidgetRevert = document.querySelector("#technician-widget-revert");
const technicianModal = document.querySelector("#technician-switch-modal");
const technicianModalMode = document.querySelector("#technician-modal-mode");
const technicianModalList = document.querySelector("#technician-modal-list");
const technicianModalMessage = document.querySelector("#technician-modal-message");
const technicianPauseButton = document.querySelector('[data-technician-action="pause"]');
const technicianPermanentButton = document.querySelector('[data-technician-action="permanent"]');

let technicianRefreshTimer = null;
let technicianRevertCountdown = null;
let technicianStatusCache = null;

function userIsEligibleTechnician() {
  return Boolean(
    session?.user?.role === "ATENCION_TECNICA"
    && session.user.workChannel === "WhatsApp 3"
    && String(session.user.technicianRedirectorId || "").trim(),
  );
}

function userCanViewTechnicianWidget() {
  if (!session?.user) return false;
  if (session.user.role === "ADMIN") return true;
  return userIsEligibleTechnician();
}

function clearTechnicianRevertCountdown() {
  if (technicianRevertCountdown) {
    clearInterval(technicianRevertCountdown);
    technicianRevertCountdown = null;
  }
}

function paintTechnicianWidget(status) {
  technicianStatusCache = status;
  // Opcion D — acelera polling a 2s mientras hay swap en curso, vuelve a
  // 30s cuando completa. Render del badge en el panel FRP (renderFrp lee
  // technicianStatusCache directamente) tambien repinta — combinado con
  // el SSE da UX casi real-time sin tocar backend del switch.
  if (status?.swap?.inProgress) {
    setTechnicianPollInterval(FRP_OPS_TECHNICIAN_POLL_SWAP_MS);
  } else if (technicianRefreshTimer) {
    setTechnicianPollInterval(FRP_OPS_TECHNICIAN_POLL_NORMAL_MS);
  }
  // El renderFrp() debe refrescar el badge del header para reflejar el
  // status nuevo (ej. "Cambiando tecnico..." durante swap). Lo dispara
  // skipPricing:true para no destruir el estado del Costos FRP collapsible.
  if (frpEnabled()) renderFrp({ skipPricing: true });
  const canViewWidget = userCanViewTechnicianWidget();
  const hasEligible = Boolean(status?.eligible?.length);
  if (!canViewWidget || (!status?.active && session.user?.role !== "ADMIN")) {
    technicianWidget.classList.add("hidden");
    return;
  }
  technicianWidget.classList.remove("hidden");
  if (status?.active) {
    technicianWidgetName.textContent = status.active.name || "-";
    technicianWidgetId.textContent = status.active.redirectorId || "-";
  } else {
    technicianWidgetName.textContent = hasEligible ? "Sin tecnico activo" : "Sin tecnico elegible";
    technicianWidgetId.textContent = hasEligible ? "Elegir tecnico" : "-";
  }
  if (technicianPauseButton) technicianPauseButton.disabled = !status?.active;
  if (technicianPermanentButton) technicianPermanentButton.disabled = !hasEligible;
  clearTechnicianRevertCountdown();
  if (status?.autoRevert?.toName && status.autoRevert.secondsLeft > 0) {
    const tick = () => {
      const remaining = Math.max(0, technicianStatusCache?.autoRevert?.secondsLeft ?? 0) - 1;
      if (technicianStatusCache?.autoRevert) technicianStatusCache.autoRevert.secondsLeft = remaining;
      const minutes = Math.max(0, Math.ceil(remaining / 60));
      technicianWidgetRevert.textContent = `Vuelve a ${technicianStatusCache?.autoRevert?.toName || "titular"} en ${minutes} min`;
      technicianWidgetRevert.classList.remove("hidden");
      if (remaining <= 0) {
        clearTechnicianRevertCountdown();
        refreshTechnicianWidget();
      }
    };
    tick();
    technicianRevertCountdown = setInterval(tick, 1000);
  } else {
    const onlineText = status?.active ? (status.active.online ? "Conectado" : "Desconectado") : "";
    technicianWidgetRevert.textContent = onlineText;
    technicianWidgetRevert.classList.toggle("hidden", !onlineText);
  }
}

async function refreshTechnicianWidget() {
  if (!session?.user) {
    technicianWidget.classList.add("hidden");
    return;
  }
  try {
    const payload = await api("/api/operator/technician/status");
    paintTechnicianWidget(payload.technician);
  } catch {
    // sin permisos o sin red, ocultar silencioso
    technicianWidget.classList.add("hidden");
  }
}

// FRP Ops v2 — Opcion D del commit 7c: durante un switch de tecnico, el
// polling de /api/operator/technician/status acelera de 30s a 2s para que
// el badge transite de "Cambiando tecnico..." a "Jack/Angelo activo" sin
// el delay del peor caso (~25s). Reemplaza al 2do evento SSE del switch
// que se omitio en backend (commit 011c60a).
const FRP_OPS_TECHNICIAN_POLL_NORMAL_MS = 30_000;
const FRP_OPS_TECHNICIAN_POLL_SWAP_MS = 2_000;
let currentTechnicianPollMs = FRP_OPS_TECHNICIAN_POLL_NORMAL_MS;

function setTechnicianPollInterval(ms) {
  if (currentTechnicianPollMs === ms && technicianRefreshTimer) return; // idempotente
  currentTechnicianPollMs = ms;
  if (technicianRefreshTimer) clearInterval(technicianRefreshTimer);
  technicianRefreshTimer = setInterval(refreshTechnicianWidget, ms);
}

function startTechnicianWidgetPolling() {
  if (technicianRefreshTimer) clearInterval(technicianRefreshTimer);
  currentTechnicianPollMs = FRP_OPS_TECHNICIAN_POLL_NORMAL_MS;
  technicianRefreshTimer = setInterval(refreshTechnicianWidget, currentTechnicianPollMs);
  refreshTechnicianWidget();
}

// FRP Ops v2 — tick global de 60s para que el panel se repinte sin
// requerir mutaciones del usuario. Necesario para que:
//  - El banner de timeout 30 min aparezca automaticamente al cumplirse el
//    threshold (spec §3.3, AC #23) sin que el tecnico tenga que clickear
//    nada para que se entere.
//  - El "tomado hace X min" del card actual se actualice progresivamente.
// skipPricing:true para preservar el estado del Costos FRP collapsible —
// si Bryam esta editando un input de proveedor, el tick no le borra el
// trabajo. El render visible solo repinta el workbench.
// Nota: si el flicker visual del repintado cada 60s resulta molesto, v2
// puede agregar DOM diffing (no implementado en este commit por scope).
setInterval(() => renderFrp({ skipPricing: true }), 60_000);

function stopTechnicianWidgetPolling() {
  if (technicianRefreshTimer) {
    clearInterval(technicianRefreshTimer);
    technicianRefreshTimer = null;
  }
  currentTechnicianPollMs = FRP_OPS_TECHNICIAN_POLL_NORMAL_MS;
  clearTechnicianRevertCountdown();
}

// ============================================================
// FRP Ops v2 SSE — cliente. Recibe eventos del endpoint
// /api/operator/frp/events (commit ca81c63) y actualiza session.frp
// + renderFrp({ skipPricing: true }) al instante. Reconnect automatico
// vía retry: 5000 del backend; el banner #frpOpsLiveStatus muestra el
// estado de conexion al usuario. Spec operador-frp-express.md §5.2 +
// AC #9, #13, #36.
// ============================================================
const frpOpsLiveEl = document.querySelector("#frpOpsLiveStatus");
const frpOpsLiveTextEl = frpOpsLiveEl?.querySelector("[data-frp-ops-live-text]");
let frpOpsStream = null;

function setFrpOpsLiveStatus(text, type = "") {
  if (!frpOpsLiveEl) return;
  if (!text) {
    frpOpsLiveEl.hidden = true;
    frpOpsLiveEl.classList.remove("is-error");
    return;
  }
  frpOpsLiveEl.hidden = false;
  if (frpOpsLiveTextEl) frpOpsLiveTextEl.textContent = text;
  frpOpsLiveEl.classList.toggle("is-error", type === "error");
}

function frpOpsHandleEvent(rawData) {
  let payload;
  try {
    payload = JSON.parse(rawData || "{}");
  } catch {
    return;
  }
  if (payload.frp) {
    session.frp = payload.frp;
    // skipPricing:true preserva el estado del Costos FRP collapsible
    // (igual que el setInterval 60s del commit 6).
    renderFrp({ skipPricing: true });
  }
  // Decision #1 del reporte 7: NO toast flotante. Si el payload trae
  // notice, lo pintamos en #frp-message inline (mismo patron que el
  // resto de mensajes del panel). Sin notice, refresh silencioso.
  if (payload.notice && frpMessage) {
    const type = payload.notice.type === "error" ? "error" : "neutral";
    frpMessage.textContent = String(payload.notice.message || "");
    frpMessage.dataset.type = type;
  }
}

function startFrpOpsLive() {
  if (frpOpsStream) return; // idempotente
  if (!session.user || !frpEnabled()) return;
  if (!window.EventSource) {
    setFrpOpsLiveStatus("Sin soporte SSE en este navegador", "error");
    return;
  }
  setFrpOpsLiveStatus("Conectando...");
  let stream;
  try {
    stream = new EventSource("/api/operator/frp/events");
  } catch {
    setFrpOpsLiveStatus("Sin conexión", "error");
    return;
  }
  frpOpsStream = stream;
  stream.onopen = () => setFrpOpsLiveStatus("");
  stream.addEventListener("frp", (event) => {
    setFrpOpsLiveStatus("");
    frpOpsHandleEvent(event.data);
  });
  stream.onerror = () => {
    // EventSource reintenta automaticamente con retry: 5000 del backend.
    // Mientras tanto, mostrar banner amarillo.
    setFrpOpsLiveStatus("Reconectando...");
  };
}

function stopFrpOpsLive() {
  if (frpOpsStream) {
    try { frpOpsStream.close(); } catch { /* ignore */ }
  }
  frpOpsStream = null;
  setFrpOpsLiveStatus("");
}

function openTechnicianSwitchModal({ temporary }) {
  if (!technicianStatusCache) return;
  const eligible = (technicianStatusCache.eligible || []).filter((candidate) => candidate.userId !== technicianStatusCache.active?.userId);
  if (!eligible.length) {
    technicianModalMessage.textContent = "No hay otro tecnico elegible.";
    technicianModalMessage.dataset.type = "error";
    technicianModal.classList.remove("hidden");
    return;
  }
  technicianModalMode.textContent = temporary ? "Pausa de 30 minutos (auto-revert)" : "Cambio permanente";
  technicianModalMessage.textContent = "";
  technicianModalMessage.dataset.type = "";
  technicianModalList.innerHTML = eligible
    .map((candidate) => `
      <li>
        <div>
          <strong>${escapeHtml(candidate.name || candidate.email || "Tecnico")}</strong>
          <code>${escapeHtml(candidate.redirectorId)}</code>
          <span class="table-subtext">${candidate.online ? "Conectado" : "Desconectado"}</span>
        </div>
        <button type="button" class="primary-btn" data-technician-target="${escapeHtml(candidate.userId)}" data-technician-mode="${temporary ? "temporary" : "permanent"}">Elegir</button>
      </li>
    `)
    .join("");
  technicianModal.classList.remove("hidden");
}

function closeTechnicianSwitchModal() {
  technicianModal.classList.add("hidden");
  technicianModalMessage.textContent = "";
  technicianModalList.innerHTML = "";
}

async function submitTechnicianSwitch(targetUserId, durationMinutes) {
  technicianModalMessage.textContent = "Enviando...";
  technicianModalMessage.dataset.type = "";
  try {
    const payload = await api("/api/operator/technician/switch", {
      method: "POST",
      body: JSON.stringify({ targetUserId, durationMinutes: durationMinutes ?? null }),
    });
    paintTechnicianWidget(payload.technician);
    closeTechnicianSwitchModal();
  } catch (error) {
    technicianModalMessage.textContent = error.message;
    technicianModalMessage.dataset.type = "error";
  }
}

if (technicianWidget) {
  technicianWidget.addEventListener("click", (event) => {
    const button = event.target.closest("[data-technician-action]");
    if (!button) return;
    refreshTechnicianWidget().then(() => {
      openTechnicianSwitchModal({ temporary: button.dataset.technicianAction === "pause" });
    });
  });
}

if (technicianModal) {
  technicianModal.addEventListener("click", async (event) => {
    if (event.target.closest("[data-technician-modal-close]") || event.target === technicianModal) {
      closeTechnicianSwitchModal();
      return;
    }
    const choose = event.target.closest("[data-technician-target]");
    if (!choose) return;
    choose.disabled = true;
    const targetUserId = choose.dataset.technicianTarget;
    const durationMinutes = choose.dataset.technicianMode === "temporary" ? 30 : null;
    await submitTechnicianSwitch(targetUserId, durationMinutes);
    choose.disabled = false;
  });
}

async function bootApplication() {
  clearRememberedLogin();
  activatePasswordResetFromUrl();
  try {
    await refreshSession();
  } catch {
    renderLayout();
  } finally {
    document.body.classList.remove("app-booting");
  }
}

bootApplication();
