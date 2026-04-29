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
const setupTokenField = document.querySelector("#setup-token-field");
const setupTokenNote = document.querySelector("#setup-token-note");
const welcomeTitle = document.querySelector("#welcome-title");
const roleBadge = document.querySelector("#role-badge");
const currentRoleLabel = document.querySelector("#current-role-label");
const activeUsersCount = document.querySelector("#active-users-count");
const pendingUsersCount = document.querySelector("#pending-users-count");
const changePasswordForm = document.querySelector("#change-password-form");
const changePasswordMessage = document.querySelector("#change-password-message");
const usersTable = document.querySelector("#users-table");
const auditList = document.querySelector("#audit-list");
const pricingRatesTable = document.querySelector("#pricing-rates-table");
const pricingRulesTable = document.querySelector("#pricing-rules-table");
const pricingMessage = document.querySelector("#pricing-message");
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
const ticketBoard = document.querySelector("#ticket-board");
const ticketsTable = document.querySelector("#tickets-table");
const paymentProofFiles = document.querySelector("#payment-proof-files");
const modelField = document.querySelector("#model-field");
const clientForm = document.querySelector("#client-form");
const clientMessage = document.querySelector("#client-message");
const clientsTable = document.querySelector("#clients-table");
const finalLogModal = document.querySelector("#final-log-modal");
const finalLogForm = document.querySelector("#final-log-form");
const finalLogInput = document.querySelector("#final-log-input");
const finalLogTitle = document.querySelector("#final-log-title");
const finalLogCancel = document.querySelector("#final-log-cancel");
const finalLogDropzone = document.querySelector("#final-log-dropzone");
const finalLogFiles = document.querySelector("#final-log-files");
const finalLogImages = document.querySelector("#final-log-images");
const finalLogHelp = document.querySelector("#final-log-help");

function emptySession() {
  return {
    user: null,
    users: [],
    clients: [],
    audit: [],
    roles: [],
    tickets: [],
    presence: { onlineUsersCount: 0, onlineUsers: [] },
    pricingConfig: { exchangeRates: [], serviceRules: [] },
    catalog: { services: [], paymentMethods: [] },
  };
}

let session = emptySession();
let pendingFinalLogResolve = null;
let pendingFinalLogImages = [];
let pendingPaymentProofTicketId = "";
let draggingTicketId = "";
let lastPaymentCountryKey = "";
let resetMode = "request";
let presenceTimer = null;
const adminPanelIds = new Set(["users-panel", "audit-panel"]);
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
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Operacion fallida.");
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
  showMessage("");
}

function isAdmin() {
  return session.user?.role === "ADMIN";
}

function canManagePricing() {
  return ["ADMIN", "COORDINADOR"].includes(session.user?.role);
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
    return;
  }

  welcomeTitle.textContent = `Hola, ${session.user.name}`;
  roleBadge.textContent = session.user.roleLabel;
  currentRoleLabel.textContent = session.user.roleLabel;
  syncNavigationForRole();
  startPresenceRefresh();

  const pending = isAdmin() ? session.users.filter((user) => !user.active).length : "-";
  renderPresence();
  pendingUsersCount.textContent = String(pending);

  renderUsers();
  renderAudit();
  renderCatalog();
  renderClients();
  renderPricing();
  renderTicketBoard();
  renderTickets();
}

function renderCatalog() {
  const services = session.catalog?.services || [];
  const clients = session.clients || [];
  clientOptions.innerHTML = clients
    .map((client) => `<option value="${escapeHtml([client.name, client.country].filter(Boolean).join(" "))}"></option>`)
    .join("");
  ticketService.innerHTML = services
    .map((service) => `<option value="${service.code}">${escapeHtml(service.name)}</option>`)
    .join("");
  normalizeTicketClientDisplay();
  syncPaymentOptions();
  syncSelectedService();
  syncPaymentPreview();
}

function renderUsers() {
  if (session.user?.role !== "ADMIN") {
    usersTable.innerHTML = `<tr><td colspan="6" class="muted-cell">Solo el administrador puede ver y modificar usuarios.</td></tr>`;
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
    return;
  }

  clientsTable.innerHTML = session.clients
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
    pricingRatesTable.innerHTML = `<tr><td colspan="5" class="muted-cell">Solo administrador o coordinador puede modificar tasas.</td></tr>`;
    pricingRulesTable.innerHTML = `<tr><td colspan="11" class="muted-cell">Solo administrador o coordinador puede modificar reglas de costo.</td></tr>`;
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

function renderTickets() {
  if (!session.tickets?.length) {
    ticketsTable.innerHTML = `<tr><td colspan="9" class="muted-cell">Todavia no hay tickets creados.</td></tr>`;
    return;
  }

  ticketsTable.innerHTML = session.tickets
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
          <td>${escapeHtml(ticket.workerChannel || "-")}</td>
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

function renderTicketBoard() {
  const statuses = session.catalog?.ticketStatuses || [
    { code: "TICKET_CREADO", label: "Nuevo" },
    { code: "EN_COLA", label: "En cola" },
    { code: "EN_PROCESO", label: "En proceso" },
    { code: "FINALIZADO", label: "Finalizado" },
  ];
  const tickets = session.tickets || [];
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
  return `
    <article class="ticket-card${isFinalized ? " is-locked" : ""}" draggable="${isFinalized ? "false" : "true"}" data-ticket-id="${ticket.id}">
      <strong>${escapeHtml(ticket.code)}</strong>
      <span>${escapeHtml(ticket.clientName)}</span>
      <small>${escapeHtml(ticket.serviceName)}${ticket.model ? ` - ${escapeHtml(ticket.model)}` : ""}</small>
      <small>${escapeHtml(formatTicketPrice(ticket))} - ${escapeHtml(ticket.paymentLabel)}</small>
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
  return (session.catalog?.services || []).find((service) => service.code === ticketService.value);
}

function syncSelectedService() {
  const service = selectedService();
  if (!service) return;
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
  renderLayout();
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
    await refreshSession();
  } catch (error) {
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

usersTable.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-save-user]");
  if (!button) return;
  const userId = button.dataset.saveUser;
  const role = usersTable.querySelector(`[data-user-role="${userId}"]`).value;
  const active = usersTable.querySelector(`[data-user-active="${userId}"]`).checked;
  const workChannel = usersTable.querySelector(`[data-user-channel="${userId}"]`).value;
  button.disabled = true;
  try {
    await api(`/api/users/${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ role, active, workChannel }),
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

ticketForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  normalizeTicketClientDisplay();
  const form = new FormData(ticketForm);
  const button = ticketForm.querySelector("button[type='submit']");
  button.disabled = true;
  ticketMessage.textContent = "";
  hideManualCopyPanel();
  try {
    const payload = await api("/api/tickets", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(form)),
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
