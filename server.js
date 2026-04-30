import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import nodemailer from "nodemailer";
import { parsePhoneNumberFromString } from "libphonenumber-js/max";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const dataDir = process.env.ARIAD_DATA_DIR || path.join(__dirname, "data");
const dbPath = path.join(dataDir, "users.json");
const port = Number(process.env.PORT || 4173);
const setupToken = process.env.ARIAD_SETUP_TOKEN || "";
const enableSetupPasswordReset = ["true", "1", "yes"].includes(String(process.env.ARIAD_ENABLE_SETUP_RESET || "").toLowerCase());
const ownerRecoveryEmail = normalizeEmail(process.env.ARIAD_OWNER_RECOVERY_EMAIL || "");
const publicBaseUrl = String(process.env.ARIAD_PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`).replace(/\/+$/, "");
const mailFrom = process.env.ARIAD_MAIL_FROM || '"AriadGSM Soporte" <soporte@ariadgsm.com>';
const appVersion = "responsive-foundation-v1";
const sessionVersion = 7;
const customerSessionVersion = 1;
const trustedDeviceVersion = 3;
const deviceApprovalExpiresMs = 15 * 60 * 1000;
const sessionMaxAgeSeconds = 60 * 60 * 8;
const deviceCookieName = "ariad_device";
const customerSessionCookieName = "ariad_customer_session";
const customerDeviceCookieName = "ariad_customer_device";
const deviceMaxAgeSeconds = 60 * 60 * 24 * 180;
const customerSessionMaxAgeSeconds = 60 * 60 * 24 * 14;
const customerDeviceMaxAgeSeconds = 60 * 60 * 24 * 180;
const presenceWindowMs = 45 * 1000;
const presenceWriteIntervalMs = 10 * 1000;
const resetTokenExpiresMs = 15 * 60 * 1000;
const resetRequestWindowMs = 15 * 60 * 1000;
const maxResetRequestsPerWindow = 5;
const maxJsonBodyBytes = 12 * 1024 * 1024;
const maxFinalLogImages = 4;
const maxPaymentProofImages = 4;
const maxFinalLogImageBytes = 2 * 1024 * 1024;
const portalRateLimitWindowMs = 15 * 60 * 1000;
const maxPortalRegisterRequestsPerWindow = 5;
const maxPortalOrderRequestsPerWindow = 12;
const maxPortalProofRequestsPerWindow = 20;
const maxPortalVerificationEmailRequestsPerWindow = 3;
const customerEmailVerificationExpiresMs = 24 * 60 * 60 * 1000;
const productionCustomerPortalBaseUrl = "https://ariadgsm.com";
const customerPortalBaseUrl = resolveCustomerPortalBaseUrl();
const portalOrdersSseHeartbeatMs = 25 * 1000;
const turnstileSiteKey = process.env.ARIAD_TURNSTILE_SITE_KEY || "";
const turnstileSecret = process.env.ARIAD_TURNSTILE_SECRET || "";
const portalOrderStreams = new Map();

const roles = new Set(["ADMIN", "COORDINADOR", "ATENCION_TECNICA"]);
const roleLabels = {
  ADMIN: "Administrador",
  COORDINADOR: "Coordinador",
  ATENCION_TECNICA: "Atencion tecnica",
};
const workChannels = ["WhatsApp 1", "WhatsApp 2", "WhatsApp 3"];
const services = [
  { code: "SOPORTE-TECNICO", name: "Soporte tecnico", defaultPrice: 0, requiresModel: false, workChannel: "WhatsApp 1" },
  { code: "SERVICIO-MANUAL", name: "Servicio manual", defaultPrice: 0, requiresModel: false, workChannel: "WhatsApp 1" },
  { code: "MOTOROLA", name: "Motorola", defaultPrice: 0, requiresModel: true, workChannel: "WhatsApp 2" },
  { code: "HERRAMIENTA-VENTA", name: "Venta de herramienta", defaultPrice: 0, requiresModel: false, workChannel: "WhatsApp 2" },
  { code: "ZTE-HERRAMIENTA-ALQUILER", name: "Alquiler herramienta ZTE", defaultPrice: 0, requiresModel: false, workChannel: "WhatsApp 2" },
  { code: "BYPASS-MDM", name: "Bypass MDM general", defaultPrice: 0, requiresModel: true, workChannel: "WhatsApp 2" },
  { code: "RECARGA-CREDITOS", name: "Recarga de creditos", defaultPrice: 0, requiresModel: false, workChannel: "WhatsApp 2" },
  { code: "XIA-FRP-GOOGLE", name: "Xiaomi Cuenta Google", defaultPrice: 25, requiresModel: false, workChannel: "WhatsApp 3" },
  { code: "XIA-MDM", name: "Xiaomi MDM", defaultPrice: 0, requiresModel: true, workChannel: "WhatsApp 3" },
  { code: "XIA-F4", name: "Xiaomi F4", defaultPrice: 0, requiresModel: true, workChannel: "WhatsApp 3" },
  { code: "XIA-CUENTA-MI", name: "Xiaomi Cuenta Mi", defaultPrice: 0, requiresModel: true, workChannel: "WhatsApp 3" },
  { code: "XIA-BOOTLOOP", name: "Xiaomi Bootloop", defaultPrice: 0, requiresModel: true, workChannel: "WhatsApp 3" },
  { code: "IREMOVAL-REGISTROS", name: "iRemoval Registros", defaultPrice: 0, requiresModel: false, workChannel: "WhatsApp 3" },
  { code: "IPHONE-LIBERACION-RED", name: "Liberacion de red iPhone", defaultPrice: 0, requiresModel: true, workChannel: "WhatsApp 3" },
];
const paymentMethods = [
  {
    code: "MX_STP",
    label: "Mexico - STP",
    country: "Mexico",
    ticketOption: true,
    currency: "MXN",
    amountMode: "decimal",
    details: ["Numero de tarjeta: 7229 6906 9374 9504 08", "Institucion: STP", "Beneficiario: Javier Cruz Franco"],
  },
  {
    code: "PE_YAPE_BRYAMS",
    label: "Peru - Yape",
    country: "Peru",
    ticketOption: true,
    currency: "PEN",
    amountMode: "decimal",
    details: ["Yape: 993 357 553 - Bryams Zuniga", "Yape: 982 380 794 - Peregrina Sha"],
  },
  {
    code: "PE_YAPE_PEREGRINA",
    label: "Peru - Yape Peregrina",
    country: "Peru",
    ticketOption: false,
    currency: "PEN",
    amountMode: "decimal",
    details: ["Yape: 982 380 794", "Beneficiario: Peregrina Sha"],
  },
  {
    code: "CO_BANCOLOMBIA_AHORROS",
    label: "Colombia - Bancolombia Ahorros",
    country: "Colombia",
    ticketOption: true,
    currency: "COP",
    amountMode: "thousands",
    details: ["Bancolombia Ahorros: 00100002771", "Beneficiario: Kendy Salazar"],
  },
  {
    code: "CL_MERCADO_PAGO",
    label: "Chile - Mercado Pago",
    country: "Chile",
    ticketOption: true,
    currency: "CLP",
    amountMode: "thousands",
    details: [
      "Mercado Pago / Cuenta Vista: 1042449240",
      "RUT: 179040166",
      "Beneficiario: Emanuel Ivan Alarcon Gomez",
      "Correo: melxcore01@gmail.com",
    ],
  },
  {
    code: "BINANCE_PAY",
    label: "Global - Binance Pay",
    country: "Global",
    ticketOption: true,
    globalOption: true,
    currency: "USDT",
    amountMode: "decimal",
    details: ["Binance Pay ID: 564181591", "Beneficiario: Ariadgsm"],
  },
  {
    code: "PAYPAL",
    label: "Global - PayPal (+20%)",
    country: "Global",
    ticketOption: false,
    currency: "USD",
    amountMode: "decimal",
    details: ["Correo: corporacionGSM.69@gmail.com", "Nota: 20% adicional por comisiones y tasas de cambio"],
  },
];
const ticketStatuses = [
  { code: "TICKET_CREADO", label: "Nuevo" },
  { code: "EN_COLA", label: "En cola" },
  { code: "EN_PROCESO", label: "En proceso" },
  { code: "FINALIZADO", label: "Finalizado" },
];
const frpServiceCode = "XIA-FRP-GOOGLE";
const frpWorkChannel = "WhatsApp 3";
const frpOrderStatuses = [
  { code: "COTIZADA", label: "Cotizada" },
  { code: "ESPERANDO_PAGO", label: "Esperando pago" },
  { code: "PAGO_VALIDADO", label: "Pago validado" },
  { code: "EN_PREPARACION", label: "En preparacion" },
  { code: "PARCIAL_LISTA", label: "Parcial lista" },
  { code: "LISTA_PARA_TECNICO", label: "Lista para tecnico" },
  { code: "CERRADA", label: "Cerrada" },
  { code: "CANCELADA", label: "Cancelada" },
];
const frpJobStatuses = [
  { code: "ESPERANDO_PREPARACION", label: "Preparacion" },
  { code: "LISTO_PARA_TECNICO", label: "Listo" },
  { code: "EN_PROCESO", label: "En proceso" },
  { code: "FINALIZADO", label: "Finalizado" },
  { code: "REQUIERE_REVISION", label: "Revision" },
  { code: "ESPERANDO_CLIENTE", label: "Esperando cliente" },
  { code: "CANCELADO", label: "Cancelado" },
];
const frpOrderChecklistKeys = ["priceSent", "paymentValidated", "connectionDataSent", "authorizationConfirmed"];
const frpJobChecklistKeys = ["clientConnected", "requiredStateConfirmed", "modelSupported"];
const frpQuantityTiers = [
  { minQty: 10, unitPrice: 22, label: "Volumen 10+" },
  { minQty: 5, unitPrice: 23, label: "Volumen 5-9" },
  { minQty: 2, unitPrice: 24, label: "Volumen 2-4" },
  { minQty: 1, unitPrice: 25, label: "Normal" },
];
const frpMonthlyTiers = [
  { minJobs: 100, unitPrice: 22, label: "Meta 100+" },
  { minJobs: 60, unitPrice: 23, label: "Meta 60+" },
  { minJobs: 30, unitPrice: 24, label: "Meta 30+" },
];
const portalPublicServices = [
  {
    code: "PORTAL-XIAOMI-FRP",
    name: "Xiaomi FRP Express",
    internalServiceCode: frpServiceCode,
    workChannel: frpWorkChannel,
    baseUnitPrice: 25,
    currency: "USDT",
    enabled: true,
    maxQuantity: 50,
    description: "Servicio remoto para Xiaomi Cuenta Google / FRP con preparacion, pago y seguimiento en linea.",
  },
];
const customerStatuses = new Set(["REGISTRADO_NO_VERIFICADO", "EMAIL_VERIFICADO", "REGISTRADO", "VERIFICADO", "VIP", "EMPRESA", "BLOQUEADO"]);
const publicOrderStatuses = [
  { code: "SOLICITUD_RECIBIDA", label: "Solicitud recibida" },
  { code: "ESPERANDO_PAGO", label: "Esperando pago" },
  { code: "PAGO_EN_REVISION", label: "Pago en revision" },
  { code: "EN_COLA", label: "En cola" },
  { code: "EN_PROCESO", label: "En proceso" },
  { code: "FINALIZADO", label: "Finalizado" },
  { code: "REQUIERE_ATENCION", label: "Requiere atencion" },
  { code: "CANCELADO", label: "Cancelado" },
];
const exchangeRateCountries = [
  { key: "mexico", country: "Mexico", currency: "MXN" },
  { key: "peru", country: "Peru", currency: "PEN" },
  { key: "colombia", country: "Colombia", currency: "COP" },
  { key: "chile", country: "Chile", currency: "CLP" },
  { key: "usdt", country: "USDT", currency: "USDT" },
];
const pricingModes = new Set(["USDT_BASE", "COMPONENTS", "MANUAL"]);
const countries = [
  ["republica dominicana", "Republica Dominicana"],
  ["estados unidos", "Estados Unidos"],
  ["el salvador", "El Salvador"],
  ["costa rica", "Costa Rica"],
  ["colombia", "Colombia"],
  ["mexico", "Mexico"],
  ["peru", "Peru"],
  ["chile", "Chile"],
  ["argentina", "Argentina"],
  ["ecuador", "Ecuador"],
  ["bolivia", "Bolivia"],
  ["venezuela", "Venezuela"],
  ["uruguay", "Uruguay"],
  ["paraguay", "Paraguay"],
  ["guatemala", "Guatemala"],
  ["honduras", "Honduras"],
  ["nicaragua", "Nicaragua"],
  ["panama", "Panama"],
  ["espana", "Espana"],
  ["usdt", "USDT"],
];
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
const portalPhoneCountryHints = [
  { country: "Republica Dominicana", iso: "DO", callingPrefixes: ["1809", "1829", "1849"] },
  { country: "Estados Unidos", iso: "US", callingPrefixes: ["1"] },
  { country: "El Salvador", iso: "SV", callingPrefixes: ["503"] },
  { country: "Costa Rica", iso: "CR", callingPrefixes: ["506"] },
  { country: "Colombia", iso: "CO", callingPrefixes: ["57"] },
  { country: "Mexico", iso: "MX", callingPrefixes: ["52"] },
  { country: "Peru", iso: "PE", callingPrefixes: ["51"] },
  { country: "Chile", iso: "CL", callingPrefixes: ["56"] },
  { country: "Argentina", iso: "AR", callingPrefixes: ["54"] },
  { country: "Ecuador", iso: "EC", callingPrefixes: ["593"] },
  { country: "Bolivia", iso: "BO", callingPrefixes: ["591"] },
  { country: "Venezuela", iso: "VE", callingPrefixes: ["58"] },
  { country: "Uruguay", iso: "UY", callingPrefixes: ["598"] },
  { country: "Paraguay", iso: "PY", callingPrefixes: ["595"] },
  { country: "Guatemala", iso: "GT", callingPrefixes: ["502"] },
  { country: "Honduras", iso: "HN", callingPrefixes: ["504"] },
  { country: "Nicaragua", iso: "NI", callingPrefixes: ["505"] },
  { country: "Panama", iso: "PA", callingPrefixes: ["507"] },
  { country: "Espana", iso: "ES", callingPrefixes: ["34"] },
];

function moneyNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.round(number * 10000) / 10000;
}

function defaultServicePricingRule(service) {
  const baseRule = {
    serviceCode: service.code,
    pricingMode: "MANUAL",
    baseCostUsdt: 0,
    marginUsdt: 0,
    authCostUsdt: 0,
    criticalCostUsdt: 0,
    toolCostUsdt: 0,
    serverCostUsdt: 0,
    manualAdjustmentAllowed: true,
    updatedAt: "",
    updatedBy: "",
  };
  if (service.code === "XIA-FRP-GOOGLE") {
    return { ...baseRule, pricingMode: "USDT_BASE", marginUsdt: 1.5, manualAdjustmentAllowed: false };
  }
  if (service.code === "XIA-F4") {
    return { ...baseRule, pricingMode: "COMPONENTS", manualAdjustmentAllowed: true };
  }
  return baseRule;
}

function defaultPricingConfig() {
  return {
    exchangeRates: exchangeRateCountries.map((rate) => ({
      ...rate,
      ratePerUsdt: rate.currency === "USDT" ? 1 : 0,
      updatedAt: "",
      updatedBy: "",
    })),
    serviceRules: services.map(defaultServicePricingRule),
  };
}

function normalizePricingConfig(config = {}) {
  const defaults = defaultPricingConfig();
  const existingRates = Array.isArray(config.exchangeRates) ? config.exchangeRates : [];
  const existingRules = Array.isArray(config.serviceRules) ? config.serviceRules : [];
  return {
    exchangeRates: defaults.exchangeRates.map((defaultRate) => {
      const existing = existingRates.find((rate) => rate.key === defaultRate.key || rate.country === defaultRate.country);
      return {
        ...defaultRate,
        ratePerUsdt: defaultRate.currency === "USDT" ? 1 : moneyNumber(existing?.ratePerUsdt ?? defaultRate.ratePerUsdt),
        updatedAt: String(existing?.updatedAt || ""),
        updatedBy: String(existing?.updatedBy || ""),
      };
    }),
    serviceRules: defaults.serviceRules.map((defaultRule) => {
      const existing = existingRules.find((rule) => rule.serviceCode === defaultRule.serviceCode);
      const pricingMode = pricingModes.has(existing?.pricingMode) ? existing.pricingMode : defaultRule.pricingMode;
      return {
        ...defaultRule,
        pricingMode,
        baseCostUsdt: moneyNumber(existing?.baseCostUsdt ?? defaultRule.baseCostUsdt),
        marginUsdt: moneyNumber(existing?.marginUsdt ?? defaultRule.marginUsdt),
        authCostUsdt: moneyNumber(existing?.authCostUsdt ?? defaultRule.authCostUsdt),
        criticalCostUsdt: moneyNumber(existing?.criticalCostUsdt ?? defaultRule.criticalCostUsdt),
        toolCostUsdt: moneyNumber(existing?.toolCostUsdt ?? defaultRule.toolCostUsdt),
        serverCostUsdt: moneyNumber(existing?.serverCostUsdt ?? defaultRule.serverCostUsdt),
        manualAdjustmentAllowed: typeof existing?.manualAdjustmentAllowed === "boolean"
          ? existing.manualAdjustmentAllowed
          : defaultRule.manualAdjustmentAllowed,
        updatedAt: String(existing?.updatedAt || ""),
        updatedBy: String(existing?.updatedBy || ""),
      };
    }),
  };
}

async function ensureDb() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(dbPath);
  } catch {
    await fs.writeFile(dbPath, JSON.stringify({
      users: [],
      sessions: [],
      devices: [],
      deviceApprovals: [],
      customerClients: [],
      customerUsers: [],
      customerSessions: [],
      customerDevices: [],
      customerRequests: [],
      customerOrders: [],
      customerOrderItems: [],
      customerBenefits: [],
      customerEmailVerificationTokens: [],
      customerCounters: {},
      portalRateLimits: [],
      clients: [],
      audit: [],
      tickets: [],
      ticketCounters: {},
      frpOrders: [],
      frpJobs: [],
      frpCounters: {},
      passwordResetTokens: [],
      passwordResetRequests: [],
      pricingConfig: defaultPricingConfig(),
    }, null, 2));
  }
}

async function readDb() {
  await ensureDb();
  const raw = await fs.readFile(dbPath, "utf8");
  const db = JSON.parse(raw);
  db.users ||= [];
  db.sessions ||= [];
  db.devices ||= [];
  db.deviceApprovals ||= [];
  db.customerClients ||= [];
  db.customerUsers ||= [];
  db.customerSessions ||= [];
  db.customerDevices ||= [];
  db.customerRequests ||= [];
  db.customerOrders ||= [];
  db.customerOrderItems ||= [];
  db.customerBenefits ||= [];
  db.customerEmailVerificationTokens ||= [];
  db.customerCounters ||= {};
  db.portalRateLimits ||= [];
  db.clients ||= [];
  db.audit ||= [];
  db.tickets ||= [];
  db.ticketCounters ||= {};
  db.frpOrders ||= [];
  db.frpJobs ||= [];
  db.frpCounters ||= {};
  db.passwordResetTokens ||= [];
  db.passwordResetRequests ||= [];
  const normalizedPricingConfig = normalizePricingConfig(db.pricingConfig);
  let changed = false;
  const now = Date.now();
  const resetTokenCount = db.passwordResetTokens.length;
  const resetRequestCount = db.passwordResetRequests.length;
  db.passwordResetTokens = db.passwordResetTokens.filter((token) => !token.usedAt && token.expiresAt > now);
  db.passwordResetRequests = db.passwordResetRequests.filter((request) => request.createdAtMs > now - resetRequestWindowMs);
  const deviceApprovalCount = db.deviceApprovals.length;
  const customerSessionCount = db.customerSessions.length;
  const portalRateLimitCount = db.portalRateLimits.length;
  const customerEmailVerificationTokenCount = db.customerEmailVerificationTokens.length;
  db.deviceApprovals = db.deviceApprovals.filter((approval) => !approval.approvedAt && approval.expiresAt > now);
  db.customerSessions = db.customerSessions.filter((session) => session.expiresAt > now && session.version === customerSessionVersion);
  db.customerEmailVerificationTokens = db.customerEmailVerificationTokens.filter((token) => !token.usedAt && token.expiresAt > now);
  db.portalRateLimits = db.portalRateLimits.filter((item) => item.createdAtMs > now - portalRateLimitWindowMs);
  if (
    db.passwordResetTokens.length !== resetTokenCount
    || db.passwordResetRequests.length !== resetRequestCount
    || db.deviceApprovals.length !== deviceApprovalCount
    || db.customerSessions.length !== customerSessionCount
    || db.customerEmailVerificationTokens.length !== customerEmailVerificationTokenCount
    || db.portalRateLimits.length !== portalRateLimitCount
  ) {
    changed = true;
  }
  if (JSON.stringify(db.pricingConfig || {}) !== JSON.stringify(normalizedPricingConfig)) {
    db.pricingConfig = normalizedPricingConfig;
    changed = true;
  }
  if (normalizeFrpRecords(db)) {
    changed = true;
  }
  for (const ticket of db.tickets) {
    if (ensureTicketChannels(ticket, db)) {
      changed = true;
    }
    const hasProofs = Array.isArray(ticket.paymentProofs) && ticket.paymentProofs.length > 0;
    const wasAutoAccepted = hasProofs && ticket.paymentStatus === "COMPROBANTE_RECIBIDO" && !ticket.paymentReviewedAt;
    if (wasAutoAccepted) {
      ticket.paymentStatus = "PAGO_EN_VALIDACION";
      if (ticket.operationalStatus === "EN_COLA") ticket.operationalStatus = "TICKET_CREADO";
      changed = true;
    }
  }
  if (changed) await fs.writeFile(dbPath, JSON.stringify(db, null, 2));
  return db;
}

async function writeDb(db) {
  await fs.writeFile(dbPath, JSON.stringify(db, null, 2));
}

function nowIso() {
  return new Date().toISOString();
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    roleLabel: roleLabels[user.role] || "Pendiente",
    workChannel: user.workChannel || "",
    operatorPinSet: Boolean(user.operatorPinHash),
    active: user.active,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function publicClient(client, db = { users: [] }) {
  const creator = db.users.find((candidate) => candidate.id === client.createdBy);
  return {
    id: client.id,
    name: client.name,
    whatsapp: client.whatsapp || "",
    country: client.country,
    workChannel: client.workChannel || creator?.workChannel || "",
    createdAt: client.createdAt,
    updatedAt: client.updatedAt,
  };
}

function normalizeCustomerStatus(value) {
  const status = cleanText(value, 30).toUpperCase();
  return customerStatuses.has(status) ? status : "REGISTRADO_NO_VERIFICADO";
}

function customerEmailIsVerified(client) {
  return ["EMAIL_VERIFICADO", "VERIFICADO", "VIP", "EMPRESA"].includes(normalizeCustomerStatus(client?.status));
}

function defaultCustomerBenefit(clientId) {
  return {
    id: crypto.randomUUID(),
    clientId,
    quantityDiscountEnabled: true,
    monthlyDiscountEnabled: true,
    goalDiscountEnabled: false,
    vipUnitPrice: 0,
    monthlyGoal: 0,
    deviceRequired: true,
    active: true,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

function customerBenefitFor(db, clientId) {
  let benefit = db.customerBenefits.find((candidate) => candidate.clientId === clientId);
  if (!benefit) {
    benefit = defaultCustomerBenefit(clientId);
    db.customerBenefits.push(benefit);
  }
  benefit.quantityDiscountEnabled = benefit.quantityDiscountEnabled !== false;
  benefit.monthlyDiscountEnabled = benefit.monthlyDiscountEnabled !== false;
  benefit.goalDiscountEnabled = Boolean(benefit.goalDiscountEnabled);
  benefit.vipUnitPrice = moneyNumber(benefit.vipUnitPrice || 0);
  benefit.monthlyGoal = Number.parseInt(benefit.monthlyGoal, 10) || 0;
  benefit.deviceRequired = benefit.deviceRequired !== false;
  benefit.active = benefit.active !== false;
  return benefit;
}

function customerDeviceIsAuthorized(device, clientId) {
  return Boolean(device?.authorizedClientIds?.includes(clientId));
}

function authorizeCustomerDevice(device, clientId) {
  device.authorizedClientIds ||= [];
  if (!device.authorizedClientIds.includes(clientId)) {
    device.authorizedClientIds.push(clientId);
  }
  device.authorizedAt ||= nowIso();
}

function ensureCustomerDevice(db, req) {
  let token = getCookie(req, customerDeviceCookieName);
  if (!token) token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  let device = db.customerDevices.find((candidate) => candidate.tokenHash === tokenHash);
  if (!device) {
    device = {
      id: crypto.randomUUID(),
      tokenHash,
      authorizedClientIds: [],
      userAgent: cleanText(req.headers["user-agent"] || "unknown", 180),
      firstIpHash: hashToken(clientIp(req)),
      createdAt: nowIso(),
    };
    db.customerDevices.push(device);
  }
  device.authorizedClientIds ||= [];
  device.lastSeenAt = nowIso();
  device.lastSeenAtMs = Date.now();
  return { token, device };
}

function customerMonthlyUsage(db, clientId, value = new Date()) {
  const stamp = limaDateStamp(value).slice(0, 6);
  return db.customerOrderItems.filter((item) => {
    if (item.clientId !== clientId) return false;
    const job = db.frpJobs.find((candidate) => candidate.id === item.frpJobId);
    const done = item.status === "FINALIZADO" || job?.status === "FINALIZADO";
    if (!done) return false;
    return limaDateStamp(job?.doneAt || item.doneAt || job?.updatedAt || item.updatedAt || item.createdAt).startsWith(stamp);
  }).length;
}

function customerCanUseBenefits(context, benefit) {
  const client = context?.client;
  const device = context?.device;
  if (!client || !benefit?.active) return false;
  if (client.status === "BLOQUEADO") return false;
  if (!customerEmailIsVerified(client)) return false;
  if (benefit.deviceRequired && !customerDeviceIsAuthorized(device, client.id)) return false;
  return true;
}

function portalFrpPriceSuggestion(db, clientId, quantity, canUseBenefits, benefit) {
  const safeQuantity = Math.max(1, Math.min(50, Number.parseInt(quantity, 10) || 1));
  const baseUnitPrice = 25;
  if (!canUseBenefits) {
    return {
      quantity: safeQuantity,
      unitPrice: baseUnitPrice,
      label: "Precio base",
      total: moneyNumber(baseUnitPrice * safeQuantity),
      monthlyUsage: customerMonthlyUsage(db, clientId),
      discountLocked: true,
      nextMonthlyTier: frpMonthlyTiers.at(-1),
    };
  }
  const monthlyUsage = customerMonthlyUsage(db, clientId);
  const quantityTier = benefit.quantityDiscountEnabled ? frpTierForQuantity(safeQuantity) : { unitPrice: baseUnitPrice, label: "Precio base", minQty: 1 };
  const monthlyTier = benefit.monthlyDiscountEnabled ? frpTierForMonthlyUsage(monthlyUsage) : null;
  const goalTier = benefit.goalDiscountEnabled && benefit.monthlyGoal > 0 && monthlyUsage >= benefit.monthlyGoal
    ? { unitPrice: Math.max(1, baseUnitPrice - 1), label: `Meta ${benefit.monthlyGoal}+` }
    : null;
  const vipTier = clientId && benefit.vipUnitPrice > 0 ? { unitPrice: benefit.vipUnitPrice, label: "VIP aprobado" } : null;
  const selected = [quantityTier, monthlyTier, goalTier, vipTier]
    .filter(Boolean)
    .sort((a, b) => a.unitPrice - b.unitPrice)[0] || { unitPrice: baseUnitPrice, label: "Precio base" };
  const nextMonthlyTier = [...frpMonthlyTiers].reverse().find((tier) => monthlyUsage < tier.minJobs) || null;
  return {
    quantity: safeQuantity,
    unitPrice: selected.unitPrice,
    label: selected.label,
    total: moneyNumber(selected.unitPrice * safeQuantity),
    monthlyUsage,
    quantityTier: { minQty: quantityTier.minQty || 1, unitPrice: quantityTier.unitPrice, label: quantityTier.label },
    monthlyTier: monthlyTier ? { minJobs: monthlyTier.minJobs, unitPrice: monthlyTier.unitPrice, label: monthlyTier.label } : null,
    nextMonthlyTier: nextMonthlyTier ? { minJobs: nextMonthlyTier.minJobs, unitPrice: nextMonthlyTier.unitPrice, label: nextMonthlyTier.label, remaining: nextMonthlyTier.minJobs - monthlyUsage } : null,
    discountLocked: false,
  };
}

function publicCustomerClient(client) {
  if (!client) return null;
  return {
    id: client.id,
    name: client.name,
    whatsapp: client.whatsapp,
    country: client.country,
    status: normalizeCustomerStatus(client.status),
    emailVerified: customerEmailIsVerified(client),
    emailVerifiedAt: client.emailVerifiedAt || "",
    createdAt: client.createdAt,
    updatedAt: client.updatedAt,
  };
}

function publicCustomerUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    clientId: user.clientId,
    name: user.name,
    email: user.email,
    role: user.role || "OWNER",
    active: user.active !== false,
    createdAt: user.createdAt,
  };
}

function publicCustomerBenefit(benefit, canUseBenefits) {
  if (!benefit) return null;
  return {
    quantityDiscountEnabled: Boolean(benefit.quantityDiscountEnabled),
    monthlyDiscountEnabled: Boolean(benefit.monthlyDiscountEnabled),
    goalDiscountEnabled: Boolean(benefit.goalDiscountEnabled),
    monthlyGoal: Number(benefit.monthlyGoal || 0),
    vipUnitPrice: moneyNumber(benefit.vipUnitPrice || 0),
    deviceRequired: benefit.deviceRequired !== false,
    usableNow: Boolean(canUseBenefits),
  };
}

function deriveCustomerOrderStatus(order, db) {
  const frpOrder = db.frpOrders.find((candidate) => candidate.id === order.frpOrderId);
  const items = db.customerOrderItems.filter((item) => item.orderId === order.id);
  const jobs = items.map((item) => db.frpJobs.find((job) => job.id === item.frpJobId)).filter(Boolean);
  if (order.publicStatus === "CANCELADO") return "CANCELADO";
  if (jobs.length && jobs.every((job) => job.status === "FINALIZADO")) return "FINALIZADO";
  if (jobs.some((job) => job.status === "REQUIERE_REVISION" || job.status === "ESPERANDO_CLIENTE")) return "REQUIERE_ATENCION";
  if (jobs.some((job) => job.status === "EN_PROCESO")) return "EN_PROCESO";
  if (frpOrder?.checklist?.paymentValidated || frpOrder?.paymentStatus === "PAGO_VALIDADO") return "EN_COLA";
  if (Array.isArray(order.paymentProofs) && order.paymentProofs.length) return "PAGO_EN_REVISION";
  return order.publicStatus || "ESPERANDO_PAGO";
}

function publicCustomerOrder(order, db) {
  const payment = paymentMethods.find((candidate) => candidate.code === order.paymentMethod);
  const items = db.customerOrderItems.filter((item) => item.orderId === order.id);
  const publicStatus = deriveCustomerOrderStatus(order, db);
  return {
    id: order.id,
    code: order.code,
    accessCode: order.accessCode,
    serviceCode: order.serviceCode,
    serviceName: order.serviceName,
    quantity: order.quantity,
    unitPrice: order.unitPrice,
    totalPrice: order.totalPrice,
    priceFormatted: order.priceFormatted,
    discountLabel: order.discountLabel,
    discountLocked: Boolean(order.discountLocked),
    monthlyUsageAtCreation: order.monthlyUsageAtCreation || 0,
    paymentMethod: order.paymentMethod,
    paymentLabel: order.paymentLabel,
    paymentDetails: Array.isArray(order.paymentDetails) ? order.paymentDetails : payment?.details || [],
    publicStatus,
    paymentProofs: Array.isArray(order.paymentProofs) ? order.paymentProofs.map((proof) => ({
      id: proof.id,
      name: proof.name,
      type: proof.type,
      size: proof.size,
      createdAt: proof.createdAt,
    })) : [],
    items: items.map((item) => {
      const job = db.frpJobs.find((candidate) => candidate.id === item.frpJobId);
      return {
        id: item.id,
        sequence: item.sequence,
        model: item.model || "",
        imei: item.imei || "",
        status: job?.status || item.status,
        ardCode: job?.ardCode || item.ardCode || "",
        finalLog: job?.finalLog || "",
      };
    }),
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

function publicCustomerOrdersForClient(db, clientId) {
  return db.customerOrders
    .filter((order) => order.clientId === clientId)
    .slice(0, 60)
    .map((order) => publicCustomerOrder(order, db));
}

function publicCustomerState(db, context) {
  const client = context?.client || null;
  const user = context?.user || null;
  const device = context?.device || null;
  const benefit = client ? customerBenefitFor(db, client.id) : null;
  const canUseBenefits = customerCanUseBenefits(context, benefit);
  const monthlyUsage = client ? customerMonthlyUsage(db, client.id) : 0;
  const nextMonthlyTier = client ? [...frpMonthlyTiers].reverse().find((tier) => monthlyUsage < tier.minJobs) || null : null;
  const orders = client ? publicCustomerOrdersForClient(db, client.id) : [];
  return {
    user: publicCustomerUser(user),
    client: publicCustomerClient(client),
    device: device ? {
      id: device.id,
      authorizedForBenefits: client ? customerDeviceIsAuthorized(device, client.id) : false,
      createdAt: device.createdAt,
      lastSeenAt: device.lastSeenAt,
    } : null,
    benefit: publicCustomerBenefit(benefit, canUseBenefits),
    monthlyUsage,
    nextMonthlyTier: nextMonthlyTier ? { ...nextMonthlyTier, remaining: nextMonthlyTier.minJobs - monthlyUsage } : null,
    orders,
  };
}

function allowedPortalPaymentMethods() {
  return allowedTicketPaymentMethods();
}

function allowedPortalPaymentMethodsForCountry(country) {
  const normalizedCountry = normalizeCountryInput(country);
  const methods = allowedPortalPaymentMethods();
  const localMethods = methods.filter((payment) => payment.country === normalizedCountry);
  const globalMethods = methods.filter((payment) => payment.globalOption);
  return localMethods.concat(globalMethods);
}

function defaultPortalPaymentForCountry(country) {
  const compatible = allowedPortalPaymentMethodsForCountry(country);
  return compatible.find((payment) => !payment.globalOption) || compatible[0] || allowedPortalPaymentMethods()[0] || null;
}

function resolvePortalPaymentForClient(paymentCode, client) {
  const code = cleanText(paymentCode, 60);
  const compatible = allowedPortalPaymentMethodsForCountry(client?.country);
  return compatible.find((payment) => payment.code === code) || defaultPortalPaymentForCountry(client?.country);
}

function publicPortalCatalog() {
  return {
    services: portalPublicServices.filter((service) => service.enabled),
    paymentMethods: allowedPortalPaymentMethods(),
    countries: countries.map(([, country]) => country),
    statuses: publicOrderStatuses,
    quantityTiers: frpQuantityTiers,
    monthlyTiers: frpMonthlyTiers,
    phoneCountries: portalPhoneCountryHints,
    turnstileEnabled: Boolean(turnstileSecret && turnstileSiteKey),
    turnstileSiteKey,
  };
}

function fallbackTicketChannel(ticket, db = { users: [] }) {
  const creator = db.users.find((candidate) => candidate.id === ticket.createdBy);
  return normalizeWorkChannel(ticket.currentChannel)
    || normalizeWorkChannel(ticket.workerChannel)
    || normalizeWorkChannel(ticket.originChannel)
    || normalizeWorkChannel(creator?.workChannel)
    || "";
}

function ensureTicketChannels(ticket, db = { users: [] }) {
  let changed = false;
  const fallback = fallbackTicketChannel(ticket, db);
  if (!normalizeWorkChannel(ticket.originChannel) && fallback) {
    ticket.originChannel = fallback;
    changed = true;
  }
  if (!normalizeWorkChannel(ticket.currentChannel)) {
    ticket.currentChannel = fallback || normalizeWorkChannel(ticket.originChannel);
    changed = true;
  }
  if (!normalizeWorkChannel(ticket.workerChannel) && ticket.currentChannel) {
    ticket.workerChannel = ticket.currentChannel;
    changed = true;
  }
  return changed;
}

function publicPricingConfig(config, db = { users: [] }) {
  const normalized = normalizePricingConfig(config);
  return {
    exchangeRates: normalized.exchangeRates.map((rate) => ({
      ...rate,
      updatedToday: Boolean(rate.updatedAt && limaDateStamp(rate.updatedAt) === limaDateStamp()),
      updatedByName: db.users.find((user) => user.id === rate.updatedBy)?.name || "",
    })),
    serviceRules: normalized.serviceRules.map((rule) => ({
      ...rule,
      serviceName: services.find((service) => service.code === rule.serviceCode)?.name || rule.serviceCode,
      updatedByName: db.users.find((user) => user.id === rule.updatedBy)?.name || "",
    })),
  };
}

function publicPricingConfigForUser(config, db, user) {
  if (user?.role === "ADMIN") return publicPricingConfig(config, db);
  return { exchangeRates: [], serviceRules: [] };
}

function defaultFrpOrderChecklist() {
  return {
    priceSent: false,
    paymentValidated: false,
    connectionDataSent: false,
    authorizationConfirmed: false,
  };
}

function defaultFrpJobChecklist() {
  return {
    clientConnected: false,
    requiredStateConfirmed: false,
    modelSupported: false,
  };
}

function normalizeChecklist(value, keys, defaults) {
  const source = value && typeof value === "object" ? value : {};
  return Object.fromEntries(keys.map((key) => [key, Boolean(Object.hasOwn(source, key) ? source[key] : defaults[key])]));
}

function normalizeFrpRecords(db) {
  let changed = false;
  for (const order of db.frpOrders) {
    const checklist = normalizeChecklist(order.checklist, frpOrderChecklistKeys, defaultFrpOrderChecklist());
    if (JSON.stringify(order.checklist || {}) !== JSON.stringify(checklist)) {
      order.checklist = checklist;
      changed = true;
    }
    if (!order.workChannel) {
      order.workChannel = frpWorkChannel;
      changed = true;
    }
    if (!order.serviceCode) {
      order.serviceCode = frpServiceCode;
      changed = true;
    }
    if (!order.serviceName) {
      order.serviceName = services.find((service) => service.code === frpServiceCode)?.name || "Xiaomi Cuenta Google";
      changed = true;
    }
    if (!order.orderStatus) {
      order.orderStatus = "COTIZADA";
      changed = true;
    }
    if (!Array.isArray(order.paymentProofs)) {
      order.paymentProofs = [];
      changed = true;
    }
  }
  for (const job of db.frpJobs) {
    const checklist = normalizeChecklist(job.checklist, frpJobChecklistKeys, defaultFrpJobChecklist());
    if (JSON.stringify(job.checklist || {}) !== JSON.stringify(checklist)) {
      job.checklist = checklist;
      changed = true;
    }
    if (!job.workChannel) {
      job.workChannel = frpWorkChannel;
      changed = true;
    }
    if (!job.status) {
      job.status = "ESPERANDO_PREPARACION";
      changed = true;
    }
  }
  for (const order of db.frpOrders) {
    const previousStatus = order.orderStatus;
    syncFrpOrderStatus(db, order);
    if (order.orderStatus !== previousStatus) changed = true;
  }
  return changed;
}

function canUseFrp(user) {
  return Boolean(user && (user.role === "ADMIN" || normalizeWorkChannel(user.workChannel) === frpWorkChannel));
}

function canReviewFrpPayments(user) {
  return Boolean(user && ["ADMIN", "COORDINADOR"].includes(user.role));
}

function frpOrderIsReady(order) {
  return Boolean(order?.checklist?.paymentValidated && order?.checklist?.connectionDataSent && order?.checklist?.authorizationConfirmed);
}

function frpJobChecklistComplete(job) {
  return Boolean(job?.checklist?.clientConnected && job?.checklist?.requiredStateConfirmed && job?.checklist?.modelSupported);
}

function frpActiveJobForUser(db, user) {
  return db.frpJobs.find((job) => job.technicianId === user.id && job.status === "EN_PROCESO");
}

function frpMonthlyUsage(db, clientId, value = new Date()) {
  const period = limaMonthStamp(value);
  return db.frpJobs.filter((job) => {
    const order = db.frpOrders.find((candidate) => candidate.id === job.orderId);
    return order?.clientId === clientId && job.status === "FINALIZADO" && limaMonthStamp(job.doneAt || job.updatedAt || job.createdAt) === period;
  }).length;
}

function frpTierForQuantity(quantity) {
  return frpQuantityTiers.find((tier) => quantity >= tier.minQty) || frpQuantityTiers.at(-1);
}

function frpTierForMonthlyUsage(usage) {
  return frpMonthlyTiers.find((tier) => usage >= tier.minJobs) || null;
}

function nextFrpMonthlyTier(usage) {
  return [...frpMonthlyTiers].reverse().find((tier) => usage < tier.minJobs) || null;
}

function frpPriceSuggestion(db, clientId, quantity) {
  const safeQuantity = Math.max(1, Math.min(50, Number.parseInt(quantity, 10) || 1));
  const monthlyUsage = frpMonthlyUsage(db, clientId);
  const quantityTier = frpTierForQuantity(safeQuantity);
  const monthlyTier = frpTierForMonthlyUsage(monthlyUsage);
  const candidates = [quantityTier, monthlyTier].filter(Boolean);
  const selected = candidates.reduce((best, tier) => (tier.unitPrice < best.unitPrice ? tier : best), quantityTier);
  const nextTier = nextFrpMonthlyTier(monthlyUsage);
  return {
    quantity: safeQuantity,
    monthlyUsage,
    nextMonthlyTier: nextTier ? { minJobs: nextTier.minJobs, unitPrice: nextTier.unitPrice, label: nextTier.label, remaining: nextTier.minJobs - monthlyUsage } : null,
    quantityTier: { minQty: quantityTier.minQty, unitPrice: quantityTier.unitPrice, label: quantityTier.label },
    monthlyTier: monthlyTier ? { minJobs: monthlyTier.minJobs, unitPrice: monthlyTier.unitPrice, label: monthlyTier.label } : null,
    unitPrice: selected.unitPrice,
    label: selected.label,
    total: moneyNumber(selected.unitPrice * safeQuantity),
  };
}

function syncFrpOrderStatus(db, order) {
  if (!order || ["CERRADA", "CANCELADA"].includes(order.orderStatus)) return;
  const jobs = db.frpJobs.filter((job) => job.orderId === order.id);
  const closedJobs = jobs.filter((job) => ["FINALIZADO", "CANCELADO"].includes(job.status)).length;
  if (jobs.length && closedJobs === jobs.length) {
    order.orderStatus = "CERRADA";
    order.closedAt ||= nowIso();
    return;
  }
  if (!order.checklist?.paymentValidated) {
    order.orderStatus = order.checklist?.priceSent ? "ESPERANDO_PAGO" : "COTIZADA";
    return;
  }
  if (!order.checklist.connectionDataSent || !order.checklist.authorizationConfirmed) {
    order.orderStatus = "PAGO_VALIDADO";
    return;
  }
  const readyOrActive = jobs.filter((job) => ["LISTO_PARA_TECNICO", "EN_PROCESO", "FINALIZADO", "REQUIERE_REVISION"].includes(job.status)).length;
  if (readyOrActive === 0) {
    order.orderStatus = "EN_PREPARACION";
    return;
  }
  order.orderStatus = readyOrActive === jobs.length ? "LISTA_PARA_TECNICO" : "PARCIAL_LISTA";
}

function publicFrpOrder(order, db) {
  const creator = db.users.find((user) => user.id === order.createdBy);
  const jobs = db.frpJobs.filter((job) => job.orderId === order.id);
  return {
    ...order,
    createdByName: creator?.name || "Sistema",
    jobs: jobs.map((job) => publicFrpJob(job, db, false)),
    jobCounts: frpJobStatuses.reduce((acc, status) => {
      acc[status.code] = jobs.filter((job) => job.status === status.code).length;
      return acc;
    }, {}),
  };
}

function publicFrpJob(job, db, includeOrder = true) {
  const technician = db.users.find((user) => user.id === job.technicianId);
  const order = includeOrder ? db.frpOrders.find((candidate) => candidate.id === job.orderId) : null;
  return {
    ...job,
    technicianName: technician?.name || "",
    order: order ? {
      id: order.id,
      code: order.code,
      clientName: order.clientName,
      country: order.country,
      unitPrice: order.unitPrice,
      totalPrice: order.totalPrice,
      paymentLabel: order.paymentLabel,
    } : undefined,
  };
}

function publicFrpState(db, user) {
  if (!canUseFrp(user)) {
    return { enabled: false, orders: [], jobs: [], metrics: {}, statuses: { orders: frpOrderStatuses, jobs: frpJobStatuses } };
  }
  const orders = db.frpOrders.filter((order) => user.role === "ADMIN" || order.workChannel === frpWorkChannel);
  const jobs = db.frpJobs.filter((job) => user.role === "ADMIN" || job.workChannel === frpWorkChannel);
  const today = limaDateStamp();
  const todaysJobs = jobs.filter((job) => limaDateStamp(job.createdAt) === today || limaDateStamp(job.doneAt) === today);
  return {
    enabled: true,
    orders: orders.slice(0, 80).map((order) => publicFrpOrder(order, db)),
    jobs: jobs.slice(0, 200).map((job) => publicFrpJob(job, db)),
    metrics: {
      ordersToday: orders.filter((order) => limaDateStamp(order.createdAt) === today).length,
      finishedToday: todaysJobs.filter((job) => job.status === "FINALIZADO").length,
      ready: jobs.filter((job) => job.status === "LISTO_PARA_TECNICO").length,
      inProcess: jobs.filter((job) => job.status === "EN_PROCESO").length,
      review: jobs.filter((job) => job.status === "REQUIERE_REVISION").length,
      myActive: jobs.filter((job) => job.technicianId === user.id && job.status === "EN_PROCESO").length,
    },
    statuses: { orders: frpOrderStatuses, jobs: frpJobStatuses },
  };
}

function audit(db, actorId, action, targetId, detail = {}) {
  db.audit.unshift({
    id: crypto.randomUUID(),
    actorId: actorId || null,
    action,
    targetId: targetId || null,
    detail,
    createdAt: nowIso(),
  });
  db.audit = db.audit.slice(0, 200);
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey.toString("hex"));
    });
  });
  return `${salt}:${hash}`;
}

async function verifyPassword(password, stored) {
  const [salt, savedHash] = String(stored || "").split(":");
  if (!salt || !savedHash) return false;
  const hash = await new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey.toString("hex"));
    });
  });
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(savedHash, "hex"));
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function cookieHeader(name, value, maxAge) {
  const secureCookie = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secureCookie}`;
}

function ensureDevice(db, req) {
  let token = getCookie(req, deviceCookieName);
  if (!token) token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  let device = db.devices.find((candidate) => candidate.tokenHash === tokenHash);
  if (!device) {
    device = {
      id: crypto.randomUUID(),
      tokenHash,
      adminUserIds: [],
      userAgent: cleanText(req.headers["user-agent"] || "unknown", 180),
      firstIpHash: hashToken(clientIp(req)),
      createdAt: nowIso(),
    };
    db.devices.push(device);
  }
  device.adminUserIds ||= [];
  device.lastSeenAt = nowIso();
  device.lastSeenAtMs = Date.now();
  return { token, device };
}

function deviceIsTrustedForAdmin(device, userId) {
  return Boolean(device?.trustVersion === trustedDeviceVersion && device?.adminUserIds?.includes(userId));
}

function trustDeviceForAdmin(device, userId) {
  device.adminUserIds ||= [];
  device.trustVersion = trustedDeviceVersion;
  device.trustedAt = nowIso();
  if (!device.adminUserIds.includes(userId)) {
    device.adminUserIds.push(userId);
  }
}

function revokeAdminDevicesExcept(db, userId, keepDeviceId = "") {
  let revoked = 0;
  for (const device of db.devices || []) {
    device.adminUserIds ||= [];
    if (!device.adminUserIds.includes(userId)) continue;
    if (keepDeviceId && device.id === keepDeviceId) continue;
    device.adminUserIds = device.adminUserIds.filter((id) => id !== userId);
    revoked += 1;
  }
  return revoked;
}

function hasTrustedAdminDevice(db, userId) {
  return (db.devices || []).some((device) => deviceIsTrustedForAdmin(device, userId));
}

function upsertAdminDeviceApproval(db, user, device, req) {
  const now = Date.now();
  db.deviceApprovals = (db.deviceApprovals || []).filter((approval) => {
    return !approval.approvedAt && approval.expiresAt > now && !(approval.adminUserId === user.id && approval.deviceId === device.id);
  });
  const approval = {
    id: crypto.randomUUID(),
    adminUserId: user.id,
    deviceId: device.id,
    userAgent: cleanText(req.headers["user-agent"] || device.userAgent || "unknown", 180),
    ipHash: hashToken(clientIp(req)),
    createdAt: nowIso(),
    createdAtMs: now,
    expiresAt: now + deviceApprovalExpiresMs,
    approvedAt: "",
  };
  db.deviceApprovals.push(approval);
  return approval;
}

function publicDeviceSecurity(db, user) {
  if (user.role !== "ADMIN") return { pendingApprovals: [] };
  const now = Date.now();
  return {
    pendingApprovals: (db.deviceApprovals || [])
      .filter((approval) => approval.adminUserId === user.id && !approval.approvedAt && approval.expiresAt > now)
      .map((approval) => ({
        id: approval.id,
        deviceId: approval.deviceId,
        userAgent: approval.userAgent,
        createdAt: approval.createdAt,
      })),
  };
}

function smtpConfig() {
  const host = process.env.ARIAD_SMTP_HOST || process.env.SMTP_HOST || "";
  const user = process.env.ARIAD_SMTP_USER || process.env.SMTP_USER || "";
  const pass = process.env.ARIAD_SMTP_PASS || process.env.SMTP_PASS || "";
  const explicitSecure = String(process.env.ARIAD_SMTP_SECURE || process.env.SMTP_SECURE || "").toLowerCase();
  const secure = explicitSecure ? ["true", "1", "yes"].includes(explicitSecure) : false;
  const portValue = process.env.ARIAD_SMTP_PORT || process.env.SMTP_PORT || (secure ? "465" : "587");
  return {
    host,
    port: Number(portValue),
    secure,
    auth: host && user && pass ? { user, pass } : null,
  };
}

function mailIsConfigured() {
  const config = smtpConfig();
  return Boolean(config.host && Number.isFinite(config.port) && config.auth?.user && config.auth?.pass);
}

function htmlEscape(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function clientIp(req) {
  return cleanText(String(req.headers["x-forwarded-for"] || "").split(",")[0] || req.socket?.remoteAddress || "unknown", 80);
}

async function sendPasswordResetEmail(user, token) {
  const config = smtpConfig();
  if (!mailIsConfigured()) {
    const error = new Error("Correo de recuperacion no configurado en Render.");
    error.status = 503;
    throw error;
  }
  const resetUrl = `${publicBaseUrl}/?resetToken=${encodeURIComponent(token)}`;
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth,
  });
  const safeName = htmlEscape(user.name || "AriadGSM");
  await transporter.sendMail({
    from: mailFrom,
    to: user.email,
    subject: "Restablecer contrasena - AriadGSM Ops",
    text: [
      `Hola ${user.name || ""},`,
      "",
      "Recibimos una solicitud para restablecer tu contrasena en AriadGSM Ops.",
      `Abre este enlace antes de 15 minutos: ${resetUrl}`,
      "",
      "Si no solicitaste este cambio, ignora este correo.",
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;color:#101827;line-height:1.5">
        <h2 style="margin:0 0 12px">AriadGSM Ops</h2>
        <p>Hola ${safeName},</p>
        <p>Recibimos una solicitud para restablecer tu contrasena.</p>
        <p><a href="${htmlEscape(resetUrl)}" style="display:inline-block;padding:12px 16px;background:#2177f2;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">Cambiar contrasena</a></p>
        <p>Este enlace vence en 15 minutos y solo se puede usar una vez.</p>
        <p style="color:#667085;font-size:13px">Si no solicitaste este cambio, ignora este correo.</p>
      </div>
    `,
  });
}

function createCustomerEmailVerificationToken(db, customerUser, reason = "register") {
  const token = crypto.randomBytes(32).toString("base64url");
  const now = Date.now();
  db.customerEmailVerificationTokens = (db.customerEmailVerificationTokens || []).filter((candidate) => {
    return candidate.userId !== customerUser.id || candidate.usedAt || candidate.expiresAt <= now;
  });
  db.customerEmailVerificationTokens.push({
    id: crypto.randomUUID(),
    userId: customerUser.id,
    clientId: customerUser.clientId,
    email: customerUser.email,
    tokenHash: hashToken(token),
    reason,
    createdAt: nowIso(),
    createdAtMs: now,
    expiresAt: now + customerEmailVerificationExpiresMs,
    usedAt: "",
  });
  return token;
}

async function sendCustomerVerificationEmail(customerUser, client, token) {
  const config = smtpConfig();
  if (!mailIsConfigured()) {
    const error = new Error("Correo de verificacion no configurado en Render.");
    error.status = 503;
    throw error;
  }
  const verifyUrl = `${customerPortalBaseUrl}/cliente?verifyEmail=${encodeURIComponent(token)}`;
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth,
  });
  const safeName = htmlEscape(client.name || customerUser.name || "AriadGSM");
  await transporter.sendMail({
    from: mailFrom,
    to: customerUser.email,
    subject: "Verifica tu correo - AriadGSM",
    text: [
      `Hola ${client.name || customerUser.name || ""},`,
      "",
      "Confirma este correo para activar tu portal cliente AriadGSM.",
      `Abre este enlace antes de 24 horas: ${verifyUrl}`,
      "",
      "Si no creaste esta cuenta, ignora este correo.",
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;color:#101827;line-height:1.5">
        <h2 style="margin:0 0 12px">AriadGSM Portal Cliente</h2>
        <p>Hola ${safeName},</p>
        <p>Confirma este correo para activar tu portal cliente y crear solicitudes.</p>
        <p><a href="${htmlEscape(verifyUrl)}" style="display:inline-block;padding:12px 16px;background:#2177f2;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">Verificar correo</a></p>
        <p>Este enlace vence en 24 horas y solo se puede usar una vez.</p>
        <p style="color:#667085;font-size:13px">Si no creaste esta cuenta, ignora este correo.</p>
      </div>
    `,
  });
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function sendHtml(res, status, html) {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": Buffer.byteLength(html),
    "Cache-Control": "no-store",
  });
  res.end(html);
}

function sendNoContent(res) {
  res.writeHead(204, { "Cache-Control": "no-store" });
  res.end();
}

function sendSseEvent(res, event, payload, id = "") {
  if (id) res.write(`id: ${id}\n`);
  if (event) res.write(`event: ${event}\n`);
  const body = JSON.stringify(payload);
  for (const line of body.split(/\r?\n/)) {
    res.write(`data: ${line}\n`);
  }
  res.write("\n");
}

function addPortalOrderStream(clientId, stream) {
  if (!portalOrderStreams.has(clientId)) portalOrderStreams.set(clientId, new Set());
  portalOrderStreams.get(clientId).add(stream);
}

function removePortalOrderStream(clientId, stream) {
  const streams = portalOrderStreams.get(clientId);
  if (!streams) return;
  streams.delete(stream);
  if (!streams.size) portalOrderStreams.delete(clientId);
}

function publishPortalOrders(db, clientId, reason = "orders_updated") {
  if (!clientId) return;
  const streams = portalOrderStreams.get(clientId);
  if (!streams?.size) return;
  const payload = {
    reason,
    updatedAt: nowIso(),
    orders: publicCustomerOrdersForClient(db, clientId),
  };
  for (const stream of [...streams]) {
    if (stream.closed || stream.res.destroyed || stream.res.writableEnded) {
      removePortalOrderStream(clientId, stream);
      continue;
    }
    try {
      sendSseEvent(stream.res, "orders", payload, `${Date.now()}`);
    } catch {
      stream.closed = true;
      removePortalOrderStream(clientId, stream);
    }
  }
}

function publishPortalOrdersForFrpOrder(db, frpOrder, reason = "frp_order_updated") {
  const portalOrder = db.customerOrders.find((order) => order.id === frpOrder?.portalOrderId);
  if (portalOrder) publishPortalOrders(db, portalOrder.clientId, reason);
}

async function parseJson(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxJsonBodyBytes) {
      const error = new Error("La solicitud es demasiado grande.");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error("JSON invalido.");
    error.status = 400;
    throw error;
  }
}

function getCookie(req, name) {
  const cookies = req.headers.cookie || "";
  for (const part of cookies.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

async function getCurrentUser(req) {
  const token = getCookie(req, "ariad_session");
  if (!token) return null;
  const db = await readDb();
  const now = Date.now();
  const before = db.sessions.length;
  db.sessions = db.sessions.filter((session) => session.expiresAt > now && session.version === sessionVersion);
  const session = db.sessions.find((candidate) => candidate.tokenHash === hashToken(token));
  let shouldWrite = db.sessions.length !== before;
  if (!session) {
    if (shouldWrite) await writeDb(db);
    return null;
  }
  const user = db.users.find((candidate) => candidate.id === session.userId);
  if (!user || !user.active) {
    if (shouldWrite) await writeDb(db);
    return null;
  }
  if (user.role === "ADMIN") {
    const deviceToken = getCookie(req, deviceCookieName);
    const device = deviceToken ? db.devices.find((candidate) => candidate.tokenHash === hashToken(deviceToken)) : null;
    const trustedAdminDevice = device && session.deviceId === device.id && deviceIsTrustedForAdmin(device, user.id);
    if (!trustedAdminDevice) {
      db.sessions = db.sessions.filter((candidate) => candidate.id !== session.id);
      audit(db, user.id, "ADMIN_SESSION_DEVICE_REJECTED", user.id, {
        sessionDeviceId: session.deviceId || "",
        currentDeviceId: device?.id || "",
      });
      await writeDb(db);
      return null;
    }
  }
  if (now - Number(session.lastSeenAtMs || 0) > presenceWriteIntervalMs) {
    session.lastSeenAtMs = now;
    session.lastSeenAt = new Date(now).toISOString();
    shouldWrite = true;
  }
  if (shouldWrite) await writeDb(db);
  return user;
}

async function getCurrentCustomerContext(req) {
  const token = getCookie(req, customerSessionCookieName);
  const db = await readDb();
  const { token: deviceToken, device } = ensureCustomerDevice(db, req);
  let shouldWrite = true;
  if (!token) {
    await writeDb(db);
    return { db, user: null, client: null, device, deviceToken };
  }
  const now = Date.now();
  const before = db.customerSessions.length;
  db.customerSessions = db.customerSessions.filter((session) => session.expiresAt > now && session.version === customerSessionVersion);
  const session = db.customerSessions.find((candidate) => candidate.tokenHash === hashToken(token));
  shouldWrite = shouldWrite || before !== db.customerSessions.length;
  if (!session) {
    await writeDb(db);
    return { db, user: null, client: null, device, deviceToken };
  }
  const user = db.customerUsers.find((candidate) => candidate.id === session.userId && candidate.active !== false);
  const client = user ? db.customerClients.find((candidate) => candidate.id === user.clientId && candidate.status !== "BLOQUEADO") : null;
  if (!user || !client) {
    db.customerSessions = db.customerSessions.filter((candidate) => candidate.id !== session.id);
    await writeDb(db);
    return { db, user: null, client: null, device, deviceToken };
  }
  if (now - Number(session.lastSeenAtMs || 0) > presenceWriteIntervalMs) {
    session.lastSeenAtMs = now;
    session.lastSeenAt = new Date(now).toISOString();
  }
  await writeDb(db);
  return { db, user, client, device, session, deviceToken };
}

function requireCustomer(context, res) {
  if (!context?.user || !context?.client) {
    sendJson(res, 401, { error: "Cuenta de cliente requerida." });
    return false;
  }
  return true;
}

function publicPresence(db) {
  const now = Date.now();
  const latestByUser = new Map();
  for (const session of db.sessions || []) {
    if (session.version !== sessionVersion || session.expiresAt <= now) continue;
    const lastSeenAtMs = Number(session.lastSeenAtMs || 0);
    if (now - lastSeenAtMs > presenceWindowMs) continue;
    const previous = latestByUser.get(session.userId);
    if (!previous || lastSeenAtMs > previous.lastSeenAtMs) {
      latestByUser.set(session.userId, { lastSeenAtMs, lastSeenAt: session.lastSeenAt });
    }
  }
  const onlineUsers = db.users
    .filter((user) => user.active && latestByUser.has(user.id))
    .map((user) => ({
      id: user.id,
      name: user.name,
      role: user.role,
      roleLabel: roleLabels[user.role] || user.role,
      workChannel: user.workChannel,
      lastSeenAt: latestByUser.get(user.id).lastSeenAt,
    }));
  return {
    onlineUsersCount: onlineUsers.length,
    onlineUsers,
    windowSeconds: Math.round(presenceWindowMs / 1000),
  };
}

function requireUser(user, res) {
  if (!user) {
    sendJson(res, 401, { error: "Sesion requerida." });
    return false;
  }
  return true;
}

function requireAdmin(user, res) {
  if (!requireUser(user, res)) return false;
  if (user.role !== "ADMIN") {
    sendJson(res, 403, { error: "Solo administrador puede realizar esta accion." });
    return false;
  }
  return true;
}

function requirePaymentReviewer(user, res) {
  if (!requireUser(user, res)) return false;
  if (!["ADMIN", "COORDINADOR"].includes(user.role)) {
    sendJson(res, 403, { error: "Solo administrador o coordinador puede validar pagos." });
    return false;
  }
  return true;
}

function requirePricingManager(user, res) {
  if (!requireUser(user, res)) return false;
  if (user.role !== "ADMIN") {
    sendJson(res, 403, { error: "Solo administrador puede modificar precios y tasas." });
    return false;
  }
  return true;
}

async function denySensitiveRoute(res, db, user, action, targetId, detail = {}, message = "Solo administrador puede realizar esta accion.") {
  if (user?.id) {
    audit(db, user.id, action, targetId, {
      role: user.role,
      ...detail,
    });
    await writeDb(db);
  }
  return sendJson(res, 403, { error: message });
}

async function requireAdminWithAudit(user, res, db, action, targetId, detail = {}, message = "Solo administrador puede realizar esta accion.") {
  if (!requireUser(user, res)) return false;
  if (user.role === "ADMIN") return true;
  await denySensitiveRoute(res, db, user, action, targetId, detail, message);
  return false;
}

async function requireFrpAccess(user, res, db, action = "FRP_ACCESS_DENIED", targetId = "frp") {
  if (!requireUser(user, res)) return false;
  if (canUseFrp(user)) return true;
  audit(db, user.id, action, targetId, { role: user.role, workChannel: user.workChannel || "" });
  await writeDb(db);
  sendJson(res, 403, { error: "FRP Express pertenece a WhatsApp 3." });
  return false;
}

async function requireFrpPaymentReviewer(user, res, db, targetId) {
  if (!requireUser(user, res)) return false;
  if (canReviewFrpPayments(user)) return true;
  audit(db, user.id, "FRP_PAYMENT_REVIEW_DENIED", targetId, { role: user.role, workChannel: user.workChannel || "" });
  await writeDb(db);
  sendJson(res, 403, { error: "Solo administrador o coordinador puede validar pagos FRP." });
  return false;
}

function enforcePortalRateLimit(db, req, bucket, key, maxAttempts, windowMs = portalRateLimitWindowMs) {
  const now = Date.now();
  const ipHash = hashToken(clientIp(req));
  const keyHash = key ? hashToken(key) : "";
  db.portalRateLimits = (db.portalRateLimits || []).filter((item) => item.createdAtMs > now - windowMs);
  const attempts = db.portalRateLimits.filter((item) => {
    if (item.bucket !== bucket) return false;
    return item.ipHash === ipHash || (keyHash && item.keyHash === keyHash);
  }).length;
  db.portalRateLimits.push({
    id: crypto.randomUUID(),
    bucket,
    ipHash,
    keyHash,
    createdAt: nowIso(),
    createdAtMs: now,
  });
  return attempts < maxAttempts;
}

async function validateTurnstileIfConfigured(req, input, action) {
  if (!turnstileSecret || !turnstileSiteKey) return { ok: true, skipped: true };
  const token = String(input.turnstileToken || input["cf-turnstile-response"] || "");
  if (!token) return { ok: false, error: "Validacion anti-spam requerida." };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: turnstileSecret,
        response: token,
        remoteip: clientIp(req),
      }),
      signal: controller.signal,
    });
    const payload = await response.json();
    const ok = Boolean(payload.success);
    return { ok, error: ok ? "" : "Validacion anti-spam invalida.", action };
  } catch {
    return { ok: false, error: "No se pudo validar anti-spam. Intenta otra vez." };
  } finally {
    clearTimeout(timeout);
  }
}

function createPortalInternalClient(db, customerClient) {
  const internalClient = {
    id: crypto.randomUUID(),
    name: cleanText(customerClient.name),
    whatsapp: normalizePhone(customerClient.whatsapp),
    country: cleanText(customerClient.country, 40),
    workChannel: frpWorkChannel,
    createdBy: "portal",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  db.clients.unshift(internalClient);
  audit(db, null, "PORTAL_INTERNAL_CLIENT_CREATED", internalClient.id, {
    customerClientId: customerClient.id,
    name: internalClient.name,
    country: internalClient.country,
    workChannel: internalClient.workChannel,
  });
  return internalClient;
}

function createFrpOrderFromPortal(db, customerClient, customerOrder, customerItems) {
  const payment = paymentMethods.find((candidate) => candidate.code === customerOrder.paymentMethod);
  const internalClient = findClientByIdentity(db, customerClient.name, customerClient.country, customerClient.whatsapp, frpWorkChannel)
    || createPortalInternalClient(db, customerClient);
  const order = {
    id: crypto.randomUUID(),
    code: nextFrpOrderCode(db),
    clientId: internalClient.id,
    clientName: internalClient.name,
    clientWhatsapp: internalClient.whatsapp,
    country: internalClient.country,
    serviceCode: frpServiceCode,
    serviceName: services.find((service) => service.code === frpServiceCode)?.name || "Xiaomi Cuenta Google",
    workChannel: frpWorkChannel,
    quantity: customerOrder.quantity,
    baseUnitPrice: 25,
    suggestedUnitPrice: customerOrder.suggestedUnitPrice,
    unitPrice: customerOrder.unitPrice,
    discountLabel: customerOrder.discountLabel,
    monthlyUsageAtCreation: customerOrder.monthlyUsageAtCreation,
    nextMonthlyTier: customerOrder.nextMonthlyTier || null,
    totalPrice: customerOrder.totalPrice,
    priceFormatted: customerOrder.priceFormatted,
    paymentMethod: payment.code,
    paymentLabel: payment.label,
    paymentDetails: payment.details,
    paymentProofs: [],
    paymentStatus: "ESPERANDO_COMPROBANTE",
    orderStatus: "COTIZADA",
    checklist: { ...defaultFrpOrderChecklist(), priceSent: true },
    createdBy: "portal",
    portalOrderId: customerOrder.id,
    source: "PORTAL_CLIENTE",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  const jobs = customerItems.map((item) => ({
    id: crypto.randomUUID(),
    code: `${order.code}-${item.sequence}`,
    orderId: order.id,
    sequence: item.sequence,
    totalJobs: customerItems.length,
    workChannel: frpWorkChannel,
    serviceCode: frpServiceCode,
    serviceName: order.serviceName,
    clientName: order.clientName,
    country: order.country,
    status: "ESPERANDO_PREPARACION",
    checklist: defaultFrpJobChecklist(),
    technicianId: "",
    portalOrderItemId: item.id,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    finalLog: "",
    finalImages: [],
    ardCode: "",
  }));
  db.frpOrders.unshift(order);
  db.frpJobs.unshift(...jobs);
  for (const item of customerItems) {
    const job = jobs.find((candidate) => candidate.sequence === item.sequence);
    item.frpOrderId = order.id;
    item.frpJobId = job?.id || "";
  }
  customerOrder.frpOrderId = order.id;
  customerOrder.internalClientId = internalClient.id;
  syncFrpOrderStatus(db, order);
  audit(db, null, "PORTAL_FRP_ORDER_CREATED", order.id, {
    customerOrderId: customerOrder.id,
    customerClientId: customerClient.id,
    quantity: order.quantity,
    unitPrice: order.unitPrice,
    totalPrice: order.totalPrice,
  });
  return order;
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function cleanName(name) {
  return String(name || "").trim().replace(/\s+/g, " ");
}

function nameContainsCountry(value) {
  const normalized = ` ${normalizeForMatch(value)} `;
  return countries
    .filter(([, country]) => country !== "USDT")
    .some(([needle, country]) => {
      const normalizedNeedle = normalizeForMatch(needle || country);
      return normalizedNeedle && normalized.includes(` ${normalizedNeedle} `);
    });
}

function validatePortalCustomerName(value) {
  const name = cleanName(value);
  if (!name) return { ok: false, error: "Escribe tu nombre y apellido." };
  if (name.length < 5 || name.length > 90) return { ok: false, error: "Nombre y apellido deben tener entre 5 y 90 caracteres." };
  if (/@|https?:\/\/|www\./i.test(name)) return { ok: false, error: "No escribas correo o enlaces en el nombre." };
  if (/\d/.test(name) || /\+?\d[\d\s().-]{5,}\d/.test(name)) return { ok: false, error: "No escribas telefono ni numeros en el nombre." };
  if (!/^[\p{L}\p{M}][\p{L}\p{M}'’ -]*[\p{L}\p{M}]$/u.test(name)) {
    return { ok: false, error: "Usa solo letras, espacios, acentos, guiones o apostrofes en el nombre." };
  }
  const connectorWords = new Set(["de", "del", "la", "las", "los", "y", "da", "do", "dos"]);
  const significantWords = name
    .split(/\s+/)
    .map((word) => normalizeForMatch(word.replace(/['’-]/g, "")))
    .filter((word) => word.length >= 2 && !connectorWords.has(word));
  if (significantWords.length < 2) return { ok: false, error: "Escribe al menos nombre y apellido." };
  if (nameContainsCountry(name)) return { ok: false, error: "No agregues el pais dentro del nombre." };
  return { ok: true, name };
}

function normalizePortalWhatsapp(value, selectedCountry = "") {
  const raw = normalizePhone(value);
  if (!raw) return { ok: false, error: "Escribe tu WhatsApp con codigo internacional." };
  if (!raw.startsWith("+")) return { ok: false, error: "WhatsApp debe iniciar con + y codigo de pais. Ejemplo: +573001234567." };
  if (!/^\+[1-9]\d{6,14}$/.test(raw)) return { ok: false, error: "WhatsApp debe estar en formato internacional valido." };
  const parsed = parsePhoneNumberFromString(raw);
  if (!parsed || !parsed.isPossible()) return { ok: false, error: "WhatsApp no parece tener un formato valido." };
  const detectedCountry = countryByFlagIso[parsed.country] || "";
  const fallbackCountry = normalizeCountryInput(selectedCountry);
  const country = detectedCountry || fallbackCountry;
  if (!country || country === "USDT") return { ok: false, error: "No se pudo confirmar el pais desde el WhatsApp." };
  return {
    ok: true,
    whatsapp: parsed.number,
    country,
    detectedCountry,
    countryIso: parsed.country || "",
  };
}

function validatePassword(password) {
  return typeof password === "string" && password.length >= 8;
}

function validateOperatorPin(pin) {
  return /^[0-9]{4,8}$/.test(String(pin || ""));
}

function normalizeWorkChannel(value) {
  const channel = cleanText(value, 40);
  return workChannels.includes(channel) ? channel : "";
}

function limaDateStamp(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}${get("month")}${get("day")}`;
}

function limaMonthStamp(value = new Date()) {
  return limaDateStamp(value).slice(0, 6);
}

function nextTicketCode(db) {
  const stamp = limaDateStamp();
  const next = (db.ticketCounters[stamp] || 0) + 1;
  db.ticketCounters[stamp] = next;
  return `V-${stamp}-${String(next).padStart(3, "0")}`;
}

function nextFrpOrderCode(db) {
  const stamp = limaDateStamp();
  db.frpCounters.orders ||= {};
  const next = (db.frpCounters.orders[stamp] || 0) + 1;
  db.frpCounters.orders[stamp] = next;
  return `ORD-${stamp}-${String(next).padStart(3, "0")}`;
}

function nextCustomerOrderCode(db) {
  const stamp = limaDateStamp();
  db.customerCounters ||= {};
  db.customerCounters.orders ||= {};
  const next = (db.customerCounters.orders[stamp] || 0) + 1;
  db.customerCounters.orders[stamp] = next;
  return `CL-${stamp}-${String(next).padStart(3, "0")}`;
}

function nextFrpArdCode(db) {
  const stamp = limaDateStamp();
  db.frpCounters.ard ||= {};
  const next = (db.frpCounters.ard[stamp] || 0) + 1;
  db.frpCounters.ard[stamp] = next;
  const first = String.fromCharCode(65 + Math.floor((next - 1) / 26) % 26);
  const second = String.fromCharCode(65 + ((next - 1) % 26));
  return `ARD${String(next).padStart(3, "0")}-${first}${second}`;
}

function runtimeLooksProduction() {
  return Boolean(process.env.RENDER || process.env.RENDER_EXTERNAL_URL || process.env.NODE_ENV === "production");
}

function resolveCustomerPortalBaseUrl() {
  const configured = process.env.ARIAD_CUSTOMER_PUBLIC_URL || process.env.ARIAD_PORTAL_PUBLIC_URL || "";
  const fallback = runtimeLooksProduction() ? productionCustomerPortalBaseUrl : publicBaseUrl;
  const candidate = String(configured || fallback).replace(/\/+$/, "");
  try {
    const url = new URL(candidate);
    const host = url.hostname.toLowerCase();
    if (runtimeLooksProduction() && (host === "ops.ariadgsm.com" || host.endsWith(".onrender.com"))) {
      return productionCustomerPortalBaseUrl;
    }
    return `${url.protocol}//${url.host}${url.pathname === "/" ? "" : url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return fallback;
  }
}

function cleanText(value, max = 120) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, max);
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

function normalizePhone(value) {
  return cleanText(value, 40).replace(/[^\d+]/g, "");
}

function sanitizeImageAttachments(value, maxImages, errorLabel) {
  if (!Array.isArray(value)) return [];
  if (value.length > maxImages) {
    const error = new Error(`Maximo ${maxImages} imagenes por ${errorLabel}.`);
    error.status = 400;
    throw error;
  }
  return value.map((image) => {
    const name = cleanText(image?.name || "log-final.png", 90);
    const type = cleanText(image?.type || "", 30);
    const dataUrl = String(image?.dataUrl || "");
    const size = Number(image?.size || 0);
    const validType = ["image/png", "image/jpeg", "image/webp"].includes(type);
    const validDataUrl = /^data:image\/(png|jpe?g|webp);base64,[a-z0-9+/=]+$/i.test(dataUrl);
    if (!validType || !validDataUrl || !Number.isFinite(size) || size <= 0 || size > maxFinalLogImageBytes) {
      const error = new Error("Imagen de log invalida o demasiado pesada.");
      error.status = 400;
      throw error;
    }
    const hash = crypto.createHash("sha256").update(dataUrl).digest("hex");
    return { id: crypto.randomUUID(), name, type, size, dataUrl, hash, createdAt: nowIso() };
  });
}

function sanitizeFinalLogImages(value) {
  return sanitizeImageAttachments(value, maxFinalLogImages, "log final");
}

function sanitizePaymentProofImages(value) {
  return sanitizeImageAttachments(value, maxPaymentProofImages, "comprobante");
}

function phoneKey(value) {
  return normalizePhone(value).replace(/\D/g, "");
}

function splitPhoneFromName(value) {
  const text = cleanText(value, 160);
  const matches = text.match(/\+?\d[\d\s().-]{5,}\d/g) || [];
  const match = matches.at(-1);
  if (!match) return { name: text, whatsapp: "" };
  const phone = normalizePhone(match);
  const digitCount = phone.replace(/\D/g, "").length;
  if (digitCount < 7) return { name: text, whatsapp: "" };
  return {
    name: cleanText(text.replace(match, " ")),
    whatsapp: phone,
  };
}

function formatPaymentAmount(value, payment) {
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

function normalizeForMatch(value) {
  return cleanText(stripCountryFlags(value), 180)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function parseClientText(value) {
  const originalWithFlags = cleanText(value, 160);
  const original = cleanText(stripCountryFlags(originalWithFlags), 160);
  const normalized = normalizeForMatch(original);
  for (const [needle, country] of countries) {
    if (normalized === needle) return null;
    if (normalized.endsWith(` ${needle}`)) {
      const rawName = cleanText(original.slice(0, original.length - needle.length));
      const parsedName = splitPhoneFromName(rawName);
      if (parsedName.name) return { name: parsedName.name, country, whatsapp: parsedName.whatsapp };
    }
  }
  const flagCountry = countryFromFlag(originalWithFlags);
  if (flagCountry) {
    const parsedName = splitPhoneFromName(original);
    if (parsedName.name) return { name: parsedName.name, country: flagCountry, whatsapp: parsedName.whatsapp };
  }
  return null;
}

function normalizeCountryInput(value) {
  const normalized = normalizeForMatch(value);
  const match = countries.find(([needle, country]) => normalized === needle || normalized === normalizeForMatch(country));
  return match?.[1] || cleanText(value, 40);
}

function allowedTicketPaymentMethods() {
  return paymentMethods.filter((payment) => payment.ticketOption);
}

function allowedServicesForUser(user, channelOverride = "") {
  const requestedChannel = normalizeWorkChannel(channelOverride);
  const channel = user?.role === "ADMIN" && requestedChannel
    ? requestedChannel
    : normalizeWorkChannel(user?.workChannel);
  return services.filter((service) => service.workChannel === channel);
}

function catalogServicesForUser(user) {
  return user?.role === "ADMIN" ? services : allowedServicesForUser(user);
}

function serviceAllowedForUser(service, user, channelOverride = "") {
  if (!service) return false;
  if (user?.role === "ADMIN") {
    const requestedChannel = normalizeWorkChannel(channelOverride);
    return requestedChannel ? service.workChannel === requestedChannel : true;
  }
  return allowedServicesForUser(user).some((candidate) => candidate.code === service.code);
}

function findClientByIdentity(db, name, country, whatsapp = "", workChannel = "") {
  const nameKey = normalizeForMatch(name);
  const countryKey = normalizeForMatch(country);
  const targetPhoneKey = phoneKey(whatsapp);
  const preferredChannel = normalizeWorkChannel(workChannel);
  const sameNameCountry = db.clients.filter((client) => normalizeForMatch(client.name) === nameKey && normalizeForMatch(client.country) === countryKey);
  const sameChannel = preferredChannel ? sameNameCountry.filter((client) => normalizeWorkChannel(client.workChannel) === preferredChannel) : [];
  if (!targetPhoneKey) return sameChannel[0] || sameNameCountry[0];
  return sameChannel.find((client) => phoneKey(client.whatsapp) === targetPhoneKey)
    || sameChannel.find((client) => !phoneKey(client.whatsapp))
    || sameNameCountry.find((client) => phoneKey(client.whatsapp) === targetPhoneKey)
    || sameNameCountry.find((client) => !phoneKey(client.whatsapp))
    || null;
}

function createClient(db, user, name, country, whatsapp = "", workChannelOverride = "") {
  const workChannel = normalizeWorkChannel(workChannelOverride) || normalizeWorkChannel(user.workChannel);
  const client = {
    id: crypto.randomUUID(),
    name: cleanText(name),
    whatsapp: normalizePhone(whatsapp),
    country: cleanText(country, 40),
    workChannel,
    createdBy: user.id,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  db.clients.unshift(client);
  audit(db, user.id, "CLIENT_CREATED", client.id, { name: client.name, country: client.country, workChannel: client.workChannel, automatic: true });
  return client;
}

function completeClientFromContext(db, user, client, whatsapp = "", workChannelOverride = "") {
  let changed = false;
  const phone = normalizePhone(whatsapp);
  if (phone && !phoneKey(client.whatsapp)) {
    client.whatsapp = phone;
    changed = true;
  }
  const workChannel = normalizeWorkChannel(workChannelOverride) || normalizeWorkChannel(user.workChannel);
  if (!client.workChannel && workChannel) {
    client.workChannel = workChannel;
    changed = true;
  }
  if (changed) {
    client.updatedAt = nowIso();
    audit(db, user.id, "CLIENT_CONTEXT_COMPLETED", client.id, {
      whatsapp: client.whatsapp || "",
      workChannel: client.workChannel || "",
    });
  }
}

function publicTicket(ticket, db) {
  const creator = db.users.find((candidate) => candidate.id === ticket.createdBy);
  const lastHandler = db.users.find((candidate) => candidate.id === ticket.lastHandledBy);
  const payment = paymentMethods.find((candidate) => candidate.code === ticket.paymentMethod);
  const originChannel = normalizeWorkChannel(ticket.originChannel)
    || normalizeWorkChannel(ticket.workerChannel)
    || normalizeWorkChannel(creator?.workChannel)
    || "";
  const currentChannel = normalizeWorkChannel(ticket.currentChannel)
    || normalizeWorkChannel(ticket.workerChannel)
    || originChannel;
  return {
    ...ticket,
    createdByName: creator?.name || "Sistema",
    lastHandledByName: lastHandler?.name || "",
    originChannel,
    currentChannel,
    workerChannel: currentChannel || creator?.workChannel || "",
    priceFormatted: ticket.priceFormatted || formatPaymentAmount(ticket.price, payment),
    paymentDetails: Array.isArray(ticket.paymentDetails) ? ticket.paymentDetails : payment?.details || [],
    paymentProofs: Array.isArray(ticket.paymentProofs) ? ticket.paymentProofs : [],
    finalImages: Array.isArray(ticket.finalImages) ? ticket.finalImages : [],
  };
}

async function handleApi(req, res, pathname) {
  const user = await getCurrentUser(req);

  if (req.method === "GET" && pathname === "/api/health") {
    return sendJson(res, 200, { ok: true, appVersion, sessionVersion, customerSessionVersion, trustedDeviceVersion });
  }

  if (req.method === "GET" && pathname === "/api/portal/catalog") {
    return sendJson(res, 200, { catalog: publicPortalCatalog() });
  }

  if (req.method === "GET" && pathname === "/api/portal/session") {
    const context = await getCurrentCustomerContext(req);
    res.setHeader("Set-Cookie", cookieHeader(customerDeviceCookieName, context.deviceToken, customerDeviceMaxAgeSeconds));
    return sendJson(res, 200, {
      customer: publicCustomerState(context.db, context),
      catalog: publicPortalCatalog(),
    });
  }

  if (req.method === "POST" && pathname === "/api/portal/verify-email") {
    const input = await parseJson(req);
    const token = String(input.token || "").trim();
    const db = await readDb();
    const tokenRecord = token ? db.customerEmailVerificationTokens.find((candidate) => {
      return !candidate.usedAt && candidate.expiresAt > Date.now() && candidate.tokenHash === hashToken(token);
    }) : null;
    if (!tokenRecord) {
      audit(db, null, "PORTAL_EMAIL_VERIFICATION_FAILED", null, { ipHash: hashToken(clientIp(req)) });
      await writeDb(db);
      return sendJson(res, 400, { error: "Enlace de verificacion invalido o vencido." });
    }
    const customerUser = db.customerUsers.find((candidate) => candidate.id === tokenRecord.userId && candidate.active !== false);
    const client = customerUser ? db.customerClients.find((candidate) => candidate.id === customerUser.clientId) : null;
    if (!customerUser || !client || client.status === "BLOQUEADO") {
      tokenRecord.usedAt = nowIso();
      audit(db, null, "PORTAL_EMAIL_VERIFICATION_FAILED", tokenRecord.clientId, { reason: "missing_or_blocked_account" });
      await writeDb(db);
      return sendJson(res, 400, { error: "Enlace de verificacion invalido o vencido." });
    }
    tokenRecord.usedAt = nowIso();
    customerUser.emailVerifiedAt ||= nowIso();
    client.emailVerifiedAt ||= nowIso();
    if (!["VIP", "EMPRESA", "VERIFICADO"].includes(normalizeCustomerStatus(client.status))) {
      client.status = "EMAIL_VERIFICADO";
    }
    client.updatedAt = nowIso();
    customerUser.updatedAt = nowIso();
    audit(db, customerUser.id, "PORTAL_EMAIL_VERIFIED", client.id, { email: customerUser.email });
    await writeDb(db);
    return sendJson(res, 200, { message: "Correo verificado. Ya puedes crear solicitudes." });
  }

  if (req.method === "POST" && pathname === "/api/portal/register") {
    const input = await parseJson(req);
    const nameValidation = validatePortalCustomerName(input.name);
    const email = normalizeEmail(input.email);
    const password = String(input.password || "");
    const phoneValidation = normalizePortalWhatsapp(input.whatsapp, input.country);
    const db = await readDb();
    const { token: deviceToken, device } = ensureCustomerDevice(db, req);
    const rateOk = enforcePortalRateLimit(db, req, "portal_register", email || phoneKey(input.whatsapp), maxPortalRegisterRequestsPerWindow);
    const turnstile = await validateTurnstileIfConfigured(req, input, "portal_register");
    if (!rateOk) {
      audit(db, null, "PORTAL_REGISTER_RATE_LIMITED", null, { emailHash: hashToken(email), ipHash: hashToken(clientIp(req)) });
      await writeDb(db);
      res.setHeader("Set-Cookie", cookieHeader(customerDeviceCookieName, deviceToken, customerDeviceMaxAgeSeconds));
      return sendJson(res, 429, { error: "Demasiados intentos. Intenta mas tarde." });
    }
    if (!turnstile.ok) {
      audit(db, null, "PORTAL_REGISTER_TURNSTILE_FAILED", null, { emailHash: hashToken(email), reason: turnstile.error });
      await writeDb(db);
      res.setHeader("Set-Cookie", cookieHeader(customerDeviceCookieName, deviceToken, customerDeviceMaxAgeSeconds));
      return sendJson(res, 400, { error: turnstile.error });
    }
    if (!nameValidation.ok || !email.includes("@") || !validatePassword(password) || !phoneValidation.ok) {
      audit(db, null, "PORTAL_REGISTER_VALIDATION_FAILED", null, {
        emailHash: hashToken(email),
        reason: !nameValidation.ok ? "name" : (!phoneValidation.ok ? "whatsapp" : "required"),
        ipHash: hashToken(clientIp(req)),
      });
      await writeDb(db);
      res.setHeader("Set-Cookie", cookieHeader(customerDeviceCookieName, deviceToken, customerDeviceMaxAgeSeconds));
      return sendJson(res, 400, { error: nameValidation.error || phoneValidation.error || "Nombre, correo, contrasena, WhatsApp y pais son obligatorios." });
    }
    const name = nameValidation.name;
    const whatsapp = phoneValidation.whatsapp;
    const country = phoneValidation.country;
    if (db.customerUsers.some((candidate) => candidate.email === email)) {
      audit(db, null, "PORTAL_REGISTER_EXISTING_EMAIL", null, { emailHash: hashToken(email), ipHash: hashToken(clientIp(req)) });
      await writeDb(db);
      res.setHeader("Set-Cookie", cookieHeader(customerDeviceCookieName, deviceToken, customerDeviceMaxAgeSeconds));
      return sendJson(res, 200, {
        message: "Si los datos son validos, revisa tu correo para continuar.",
        emailVerification: { required: true },
      });
    }
    const client = {
      id: crypto.randomUUID(),
      name,
      whatsapp,
      country,
      whatsappCountryIso: phoneValidation.countryIso,
      whatsappDetectedCountry: phoneValidation.detectedCountry,
      status: "REGISTRADO_NO_VERIFICADO",
      primaryEmail: email,
      emailVerifiedAt: "",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    const customerUser = {
      id: crypto.randomUUID(),
      clientId: client.id,
      name,
      email,
      passwordHash: await hashPassword(password),
      role: "OWNER",
      active: true,
      emailVerifiedAt: "",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    const benefit = defaultCustomerBenefit(client.id);
    authorizeCustomerDevice(device, client.id);
    db.customerClients.unshift(client);
    db.customerUsers.unshift(customerUser);
    db.customerBenefits.push(benefit);
    const token = crypto.randomBytes(32).toString("base64url");
    db.customerSessions.push({
      id: crypto.randomUUID(),
      userId: customerUser.id,
      clientId: client.id,
      tokenHash: hashToken(token),
      deviceId: device.id,
      version: customerSessionVersion,
      createdAt: nowIso(),
      lastSeenAt: nowIso(),
      lastSeenAtMs: Date.now(),
      expiresAt: Date.now() + customerSessionMaxAgeSeconds * 1000,
    });
    audit(db, null, "PORTAL_CUSTOMER_REGISTERED", client.id, { email, country, deviceId: device.id });
    const verificationToken = createCustomerEmailVerificationToken(db, customerUser, "register");
    await writeDb(db);
    let verificationSent = false;
    try {
      await sendCustomerVerificationEmail(customerUser, client, verificationToken);
      verificationSent = true;
      const emailDb = await readDb();
      audit(emailDb, customerUser.id, "PORTAL_EMAIL_VERIFICATION_SENT", client.id, { email });
      await writeDb(emailDb);
    } catch (error) {
      const failureDb = await readDb();
      audit(failureDb, customerUser.id, "PORTAL_EMAIL_VERIFICATION_SEND_FAILED", client.id, { email, error: cleanText(error.message, 160) });
      await writeDb(failureDb);
    }
    res.setHeader("Set-Cookie", [
      cookieHeader(customerSessionCookieName, token, customerSessionMaxAgeSeconds),
      cookieHeader(customerDeviceCookieName, deviceToken, customerDeviceMaxAgeSeconds),
    ]);
    return sendJson(res, 201, {
      customer: publicCustomerState(db, { user: customerUser, client, device }),
      catalog: publicPortalCatalog(),
      message: verificationSent ? "Cuenta creada. Revisa tu correo para verificarla." : "Cuenta creada. No pudimos enviar el correo de verificacion; intenta reenviarlo.",
      emailVerification: { required: true, sent: verificationSent },
    });
  }

  if (req.method === "POST" && pathname === "/api/portal/resend-verification") {
    const context = await getCurrentCustomerContext(req);
    if (!requireCustomer(context, res)) return;
    const db = context.db;
    const rateOk = enforcePortalRateLimit(db, req, "portal_email_verification", context.user.email, maxPortalVerificationEmailRequestsPerWindow);
    const genericMessage = "Si tu cuenta necesita verificacion, enviaremos un correo en unos minutos.";
    if (!rateOk) {
      audit(db, context.user.id, "PORTAL_EMAIL_VERIFICATION_RESEND_RATE_LIMITED", context.client.id, { ipHash: hashToken(clientIp(req)) });
      await writeDb(db);
      return sendJson(res, 429, { error: "Demasiados intentos. Intenta mas tarde." });
    }
    if (customerEmailIsVerified(context.client)) {
      audit(db, context.user.id, "PORTAL_EMAIL_VERIFICATION_RESEND_SKIPPED", context.client.id, { reason: "already_verified" });
      await writeDb(db);
      return sendJson(res, 200, { message: genericMessage });
    }
    const verificationToken = createCustomerEmailVerificationToken(db, context.user, "resend");
    await writeDb(db);
    try {
      await sendCustomerVerificationEmail(context.user, context.client, verificationToken);
      const emailDb = await readDb();
      audit(emailDb, context.user.id, "PORTAL_EMAIL_VERIFICATION_RESENT", context.client.id, { email: context.user.email });
      await writeDb(emailDb);
    } catch (error) {
      const failureDb = await readDb();
      audit(failureDb, context.user.id, "PORTAL_EMAIL_VERIFICATION_RESEND_FAILED", context.client.id, { error: cleanText(error.message, 160) });
      await writeDb(failureDb);
    }
    return sendJson(res, 200, { message: genericMessage });
  }

  if (req.method === "POST" && pathname === "/api/portal/login") {
    const input = await parseJson(req);
    const email = normalizeEmail(input.email);
    const password = String(input.password || "");
    const db = await readDb();
    const { token: deviceToken, device } = ensureCustomerDevice(db, req);
    const rateOk = enforcePortalRateLimit(db, req, "portal_login", email, maxPortalRegisterRequestsPerWindow);
    if (!rateOk) {
      audit(db, null, "PORTAL_LOGIN_RATE_LIMITED", null, { emailHash: hashToken(email), ipHash: hashToken(clientIp(req)) });
      await writeDb(db);
      res.setHeader("Set-Cookie", cookieHeader(customerDeviceCookieName, deviceToken, customerDeviceMaxAgeSeconds));
      return sendJson(res, 429, { error: "Demasiados intentos. Intenta mas tarde." });
    }
    const customerUser = db.customerUsers.find((candidate) => candidate.email === email && candidate.active !== false);
    if (!customerUser || !(await verifyPassword(password, customerUser.passwordHash))) {
      audit(db, null, "PORTAL_LOGIN_FAILED", customerUser?.clientId || null, { emailHash: hashToken(email) });
      await writeDb(db);
      res.setHeader("Set-Cookie", cookieHeader(customerDeviceCookieName, deviceToken, customerDeviceMaxAgeSeconds));
      return sendJson(res, 401, { error: "Credenciales de cliente invalidas." });
    }
    const client = db.customerClients.find((candidate) => candidate.id === customerUser.clientId);
    if (!client || client.status === "BLOQUEADO") {
      await writeDb(db);
      res.setHeader("Set-Cookie", cookieHeader(customerDeviceCookieName, deviceToken, customerDeviceMaxAgeSeconds));
      return sendJson(res, 403, { error: "Cuenta cliente bloqueada o no disponible." });
    }
    const token = crypto.randomBytes(32).toString("base64url");
    db.customerSessions = db.customerSessions.filter((session) => session.expiresAt > Date.now() && session.version === customerSessionVersion);
    db.customerSessions.push({
      id: crypto.randomUUID(),
      userId: customerUser.id,
      clientId: client.id,
      tokenHash: hashToken(token),
      deviceId: device.id,
      version: customerSessionVersion,
      createdAt: nowIso(),
      lastSeenAt: nowIso(),
      lastSeenAtMs: Date.now(),
      expiresAt: Date.now() + customerSessionMaxAgeSeconds * 1000,
    });
    audit(db, null, "PORTAL_LOGIN_SUCCESS", client.id, {
      email,
      deviceId: device.id,
      authorizedForBenefits: customerDeviceIsAuthorized(device, client.id),
    });
    await writeDb(db);
    res.setHeader("Set-Cookie", [
      cookieHeader(customerSessionCookieName, token, customerSessionMaxAgeSeconds),
      cookieHeader(customerDeviceCookieName, deviceToken, customerDeviceMaxAgeSeconds),
    ]);
    return sendJson(res, 200, {
      customer: publicCustomerState(db, { user: customerUser, client, device }),
      catalog: publicPortalCatalog(),
    });
  }

  if (req.method === "POST" && pathname === "/api/portal/logout") {
    const token = getCookie(req, customerSessionCookieName);
    const db = await readDb();
    if (token) {
      db.customerSessions = db.customerSessions.filter((session) => session.tokenHash !== hashToken(token));
      await writeDb(db);
    }
    res.setHeader("Set-Cookie", cookieHeader(customerSessionCookieName, "", 0));
    return sendJson(res, 200, { message: "Sesion cliente cerrada." });
  }

  if (req.method === "GET" && pathname === "/api/portal/orders") {
    const context = await getCurrentCustomerContext(req);
    if (!requireCustomer(context, res)) return;
    res.setHeader("Set-Cookie", cookieHeader(customerDeviceCookieName, context.deviceToken, customerDeviceMaxAgeSeconds));
    return sendJson(res, 200, { orders: publicCustomerState(context.db, context).orders });
  }

  if (req.method === "GET" && pathname === "/api/portal/orders/events") {
    const context = await getCurrentCustomerContext(req);
    const db = context.db;
    if (!context.user || !context.client) {
      audit(db, null, "PORTAL_ORDERS_STREAM_BLOCKED", null, {
        reason: "missing_customer_session",
        ipHash: hashToken(clientIp(req)),
      });
      await writeDb(db);
      return sendJson(res, 401, { error: "Cuenta de cliente requerida." });
    }
    const streamId = crypto.randomUUID();
    audit(db, context.user.id, "PORTAL_ORDERS_STREAM_CONNECTED", context.client.id, {
      streamId,
      ipHash: hashToken(clientIp(req)),
    });
    await writeDb(db);
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
      "Set-Cookie": cookieHeader(customerDeviceCookieName, context.deviceToken, customerDeviceMaxAgeSeconds),
    });
    res.write("retry: 5000\n\n");
    const stream = {
      id: streamId,
      clientId: context.client.id,
      userId: context.user.id,
      res,
      startedAtMs: Date.now(),
      closed: false,
    };
    addPortalOrderStream(context.client.id, stream);
    sendSseEvent(res, "orders", {
      reason: "connected",
      updatedAt: nowIso(),
      orders: publicCustomerOrdersForClient(db, context.client.id),
    }, `${Date.now()}`);
    const heartbeat = setInterval(() => {
      if (stream.closed || res.destroyed || res.writableEnded) return;
      res.write(`: heartbeat ${Date.now()}\n\n`);
    }, portalOrdersSseHeartbeatMs);
    const cleanup = () => {
      if (stream.closed) return;
      stream.closed = true;
      clearInterval(heartbeat);
      removePortalOrderStream(context.client.id, stream);
      (async () => {
        try {
          const disconnectDb = await readDb();
          audit(disconnectDb, context.user.id, "PORTAL_ORDERS_STREAM_DISCONNECTED", context.client.id, {
            streamId,
            durationMs: Date.now() - stream.startedAtMs,
          });
          await writeDb(disconnectDb);
        } catch (error) {
          console.error(error);
        }
      })();
    };
    req.on("close", cleanup);
    res.on("error", cleanup);
    return;
  }

  if (req.method === "POST" && pathname === "/api/portal/orders/frp") {
    const context = await getCurrentCustomerContext(req);
    if (!requireCustomer(context, res)) return;
    const input = await parseJson(req);
    const db = context.db;
    if (!customerEmailIsVerified(context.client)) {
      audit(db, context.user.id, "PORTAL_ORDER_BLOCKED_EMAIL_UNVERIFIED", context.client.id, { service: "PORTAL-XIAOMI-FRP" });
      await writeDb(db);
      return sendJson(res, 403, { error: "Verifica tu correo antes de crear solicitudes." });
    }
    const rateOk = enforcePortalRateLimit(db, req, "portal_order_frp", context.client.id, maxPortalOrderRequestsPerWindow);
    const turnstile = await validateTurnstileIfConfigured(req, input, "portal_order_frp");
    if (!rateOk) {
      audit(db, context.user.id, "PORTAL_ORDER_RATE_LIMITED", context.client.id, { ipHash: hashToken(clientIp(req)) });
      await writeDb(db);
      return sendJson(res, 429, { error: "Demasiadas solicitudes. Intenta mas tarde." });
    }
    if (!turnstile.ok) {
      audit(db, context.user.id, "PORTAL_ORDER_TURNSTILE_FAILED", context.client.id, { reason: turnstile.error });
      await writeDb(db);
      return sendJson(res, 400, { error: turnstile.error });
    }
    const quantity = Math.max(1, Math.min(50, Number.parseInt(input.quantity, 10) || 1));
    const service = portalPublicServices.find((candidate) => candidate.code === "PORTAL-XIAOMI-FRP" && candidate.enabled);
    const requestedPaymentCode = cleanText(input.paymentMethod, 60);
    const payment = resolvePortalPaymentForClient(requestedPaymentCode, context.client);
    if (!service) return sendJson(res, 503, { error: "Xiaomi FRP no esta disponible en el portal." });
    if (!payment) return sendJson(res, 400, { error: "Metodo de pago invalido para tu pais." });
    const benefit = customerBenefitFor(db, context.client.id);
    const canUseBenefits = customerCanUseBenefits(context, benefit);
    const suggestion = portalFrpPriceSuggestion(db, context.client.id, quantity, canUseBenefits, benefit);
    const request = {
      id: crypto.randomUUID(),
      clientId: context.client.id,
      userId: context.user.id,
      serviceCode: service.code,
      serviceName: service.name,
      channel: frpWorkChannel,
      status: "ESPERANDO_PAGO",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    const order = {
      id: crypto.randomUUID(),
      code: nextCustomerOrderCode(db),
      accessCode: crypto.randomBytes(8).toString("base64url"),
      requestId: request.id,
      clientId: context.client.id,
      userId: context.user.id,
      serviceCode: service.code,
      internalServiceCode: service.internalServiceCode,
      serviceName: service.name,
      workChannel: frpWorkChannel,
      quantity,
      baseUnitPrice: service.baseUnitPrice,
      suggestedUnitPrice: suggestion.unitPrice,
      unitPrice: suggestion.unitPrice,
      totalPrice: suggestion.total,
      priceFormatted: formatPaymentAmount(suggestion.total, payment),
      discountLabel: suggestion.label,
      discountLocked: suggestion.discountLocked,
      monthlyUsageAtCreation: suggestion.monthlyUsage,
      nextMonthlyTier: suggestion.nextMonthlyTier,
      paymentMethod: payment.code,
      paymentLabel: payment.label,
      paymentDetails: payment.details,
      paymentProofs: [],
      publicStatus: "ESPERANDO_PAGO",
      createdAt: nowIso(),
      updatedAt: nowIso(),
      note: cleanText(input.note, 500),
    };
    const inputItems = Array.isArray(input.items) ? input.items : [];
    const items = Array.from({ length: quantity }, (_, index) => {
      const itemInput = inputItems[index] || {};
      return {
        id: crypto.randomUUID(),
        requestId: request.id,
        orderId: order.id,
        clientId: context.client.id,
        sequence: index + 1,
        model: cleanText(itemInput.model || input.model || "", 80),
        imei: cleanText(itemInput.imei || "", 40),
        status: "ESPERANDO_PREPARACION",
        frpOrderId: "",
        frpJobId: "",
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
    });
    createFrpOrderFromPortal(db, context.client, order, items);
    db.customerRequests.unshift(request);
    db.customerOrders.unshift(order);
    db.customerOrderItems.unshift(...items);
    if (requestedPaymentCode && requestedPaymentCode !== payment.code) {
      audit(db, context.user.id, "PORTAL_PAYMENT_METHOD_ALIGNED", order.id, {
        code: order.code,
        clientCountry: context.client.country,
        requestedPayment: requestedPaymentCode,
        selectedPayment: payment.code,
      });
    }
    audit(db, context.user.id, "PORTAL_CUSTOMER_ORDER_CREATED", order.id, {
      code: order.code,
      clientId: context.client.id,
      quantity,
      unitPrice: order.unitPrice,
      discountLabel: order.discountLabel,
      canUseBenefits,
      workChannel: frpWorkChannel,
    });
    await writeDb(db);
    publishPortalOrders(db, context.client.id, "order_created");
    return sendJson(res, 201, {
      order: publicCustomerOrder(order, db),
      customer: publicCustomerState(db, context),
    });
  }

  const portalOrderMatch = pathname.match(/^\/api\/portal\/orders\/([^/]+)$/);
  if (req.method === "GET" && portalOrderMatch) {
    const context = await getCurrentCustomerContext(req);
    const db = context.db;
    const codeOrId = cleanText(decodeURIComponent(portalOrderMatch[1]), 80);
    const accessCode = cleanText(new URL(req.url || "/", `http://${req.headers.host || "localhost"}`).searchParams.get("accessCode") || "", 80);
    const order = db.customerOrders.find((candidate) => candidate.id === codeOrId || candidate.code === codeOrId);
    if (!order) return sendJson(res, 404, { error: "Orden no encontrada." });
    const ownsOrder = context.user && context.client && order.clientId === context.client.id;
    const hasAccessCode = accessCode && order.accessCode === accessCode;
    if (!ownsOrder && !hasAccessCode) {
      audit(db, context.user?.id || null, "PORTAL_ORDER_LOOKUP_BLOCKED", order.id, {
        code: order.code,
        ipHash: hashToken(clientIp(req)),
      });
      await writeDb(db);
      return sendJson(res, 403, { error: "Codigo de seguimiento invalido." });
    }
    if (context.deviceToken) {
      res.setHeader("Set-Cookie", cookieHeader(customerDeviceCookieName, context.deviceToken, customerDeviceMaxAgeSeconds));
    }
    return sendJson(res, 200, { order: publicCustomerOrder(order, db) });
  }

  const portalProofMatch = pathname.match(/^\/api\/portal\/orders\/([^/]+)\/payment-proof$/);
  if (req.method === "PATCH" && portalProofMatch) {
    const context = await getCurrentCustomerContext(req);
    if (!requireCustomer(context, res)) return;
    const input = await parseJson(req);
    const db = context.db;
    const rateOk = enforcePortalRateLimit(db, req, "portal_payment_proof", context.client.id, maxPortalProofRequestsPerWindow);
    if (!rateOk) {
      audit(db, context.user.id, "PORTAL_PAYMENT_PROOF_RATE_LIMITED", context.client.id, { ipHash: hashToken(clientIp(req)) });
      await writeDb(db);
      return sendJson(res, 429, { error: "Demasiados comprobantes enviados. Intenta mas tarde." });
    }
    const order = db.customerOrders.find((candidate) => candidate.id === portalProofMatch[1] && candidate.clientId === context.client.id);
    if (!order) return sendJson(res, 404, { error: "Orden no encontrada." });
    const proofs = sanitizePaymentProofImages(input.paymentProofs || input.proofs || []);
    if (!proofs.length) return sendJson(res, 400, { error: "Sube al menos una imagen de comprobante." });
    const duplicateHash = new Set();
    for (const candidateOrder of db.customerOrders) {
      for (const proof of candidateOrder.paymentProofs || []) duplicateHash.add(proof.hash);
    }
    for (const frpOrder of db.frpOrders) {
      for (const proof of frpOrder.paymentProofs || []) duplicateHash.add(proof.hash);
    }
    for (const ticket of db.tickets) {
      for (const proof of ticket.paymentProofs || []) duplicateHash.add(proof.hash);
    }
    if (proofs.some((proof) => duplicateHash.has(proof.hash))) {
      audit(db, context.user.id, "PORTAL_PAYMENT_PROOF_DUPLICATE_BLOCKED", order.id, { code: order.code });
      await writeDb(db);
      return sendJson(res, 409, { error: "Ese comprobante ya fue cargado antes." });
    }
    order.paymentProofs = (order.paymentProofs || []).concat(proofs);
    order.publicStatus = "PAGO_EN_REVISION";
    order.updatedAt = nowIso();
    const request = db.customerRequests.find((candidate) => candidate.id === order.requestId);
    if (request) {
      request.status = "PAGO_EN_REVISION";
      request.updatedAt = nowIso();
    }
    const frpOrder = db.frpOrders.find((candidate) => candidate.id === order.frpOrderId);
    if (frpOrder) {
      frpOrder.paymentProofs = (frpOrder.paymentProofs || []).concat(proofs);
      frpOrder.paymentStatus = "PAGO_EN_VALIDACION";
      frpOrder.updatedAt = nowIso();
      syncFrpOrderStatus(db, frpOrder);
    }
    audit(db, context.user.id, "PORTAL_PAYMENT_PROOF_UPLOADED", order.id, {
      code: order.code,
      proofCount: proofs.length,
      frpOrderId: order.frpOrderId || "",
    });
    await writeDb(db);
    publishPortalOrders(db, context.client.id, "payment_proof_uploaded");
    return sendJson(res, 200, {
      order: publicCustomerOrder(order, db),
      customer: publicCustomerState(db, context),
    });
  }

  if (req.method === "GET" && pathname === "/api/session") {
    const db = await readDb();
    const setupRequired = db.users.length === 0 && Boolean(setupToken);
    if (!user) return sendJson(res, 200, { user: null, setupRequired });
    return sendJson(res, 200, {
      user: publicUser(user),
      setupRequired,
      users: user.role === "ADMIN" ? db.users.map(publicUser) : [],
      clients: db.clients.slice(0, 300).map((client) => publicClient(client, db)),
      audit: user.role === "ADMIN" ? db.audit.slice(0, 50) : [],
      tickets: db.tickets.slice(0, 120).map((ticket) => publicTicket(ticket, db)),
      presence: publicPresence(db),
      deviceSecurity: publicDeviceSecurity(db, user),
      pricingConfig: publicPricingConfigForUser(db.pricingConfig, db, user),
      roles: user.role === "ADMIN" ? Array.from(roles).map((role) => ({ value: role, label: roleLabels[role] })) : [],
      catalog: { services: catalogServicesForUser(user), paymentMethods, workChannels, ticketStatuses, countries: countries.map(([, country]) => country) },
      frp: publicFrpState(db, user),
    });
  }

  if (req.method === "GET" && pathname === "/api/presence") {
    if (!requireUser(user, res)) return;
    const db = await readDb();
    return sendJson(res, 200, { presence: publicPresence(db) });
  }

  if (req.method === "POST" && pathname === "/api/register") {
    const input = await parseJson(req);
    const name = cleanName(input.name);
    const email = normalizeEmail(input.email);
    const password = String(input.password || "");
    const workChannel = normalizeWorkChannel(input.workChannel);
    if (!name || !email.includes("@") || !validatePassword(password)) {
      return sendJson(res, 400, { error: "Nombre, correo valido y contrasena de 8 caracteres son obligatorios." });
    }

    const db = await readDb();
    if (db.users.some((candidate) => candidate.email === email)) {
      return sendJson(res, 409, { error: "Ya existe un usuario con ese correo." });
    }

    const firstUser = db.users.length === 0;
    if (firstUser && setupToken && String(input.setupToken || "") !== setupToken) {
      return sendJson(res, 403, { error: "Codigo de instalacion invalido." });
    }
    const newUser = {
      id: crypto.randomUUID(),
      name,
      email,
      passwordHash: await hashPassword(password),
      role: firstUser ? "ADMIN" : "PENDIENTE",
      workChannel,
      active: firstUser,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    db.users.push(newUser);
    audit(db, user?.id, firstUser ? "BOOTSTRAP_ADMIN" : "USER_REGISTERED", newUser.id, {
      email,
      role: newUser.role,
    });
    await writeDb(db);
    return sendJson(res, 201, {
      user: publicUser(newUser),
      message: firstUser ? "Primer administrador creado." : "Registro recibido. Un administrador debe activar la cuenta.",
    });
  }

  if (req.method === "POST" && pathname === "/api/login") {
    const input = await parseJson(req);
    const email = normalizeEmail(input.email);
    const password = String(input.password || "");
    const db = await readDb();
    const existing = db.users.find((candidate) => candidate.email === email);
    if (!existing || !(await verifyPassword(password, existing.passwordHash))) {
      audit(db, null, "LOGIN_FAILED", existing?.id || null, { email });
      await writeDb(db);
      return sendJson(res, 401, { error: "Credenciales invalidas." });
    }
    if (!existing.active) {
      return sendJson(res, 403, { error: "Cuenta pendiente de activacion por administrador." });
    }

    const { token: deviceToken, device } = ensureDevice(db, req);
    if (existing.role === "ADMIN" && !deviceIsTrustedForAdmin(device, existing.id)) {
      const operatorPin = String(input.operatorPin || "");
      const hasOperatorPin = Boolean(existing.operatorPinHash);
      const setupTokenIsValid = Boolean(setupToken && operatorPin === setupToken);
      const pinIsValid = hasOperatorPin && await verifyPassword(operatorPin, existing.operatorPinHash);
      const trustedDeviceExists = hasTrustedAdminDevice(db, existing.id);
      if (!trustedDeviceExists) {
        if (!setupTokenIsValid) {
          audit(db, existing.id, "ADMIN_DEVICE_SETUP_REQUIRED", existing.id, { deviceId: device.id });
          await writeDb(db);
          res.setHeader("Set-Cookie", cookieHeader(deviceCookieName, deviceToken, deviceMaxAgeSeconds));
          return sendJson(res, 409, {
            error: "Codigo de instalacion requerido para autorizar el primer dispositivo admin.",
            code: "ADMIN_DEVICE_PIN_REQUIRED",
            pinLabel: "Codigo de instalacion",
          });
        }
        trustDeviceForAdmin(device, existing.id);
        audit(db, existing.id, "ADMIN_DEVICE_AUTHORIZED", existing.id, { deviceId: device.id, firstTrustedDevice: true });
      } else {
        if (!pinIsValid) {
          audit(db, existing.id, "ADMIN_DEVICE_PIN_REQUIRED", existing.id, {
            deviceId: device.id,
          });
          await writeDb(db);
          res.setHeader("Set-Cookie", cookieHeader(deviceCookieName, deviceToken, deviceMaxAgeSeconds));
          return sendJson(res, 409, {
            error: "PIN operativo requerido para solicitar aprobacion de este dispositivo.",
            code: "ADMIN_DEVICE_PIN_REQUIRED",
            pinLabel: "PIN operativo",
          });
        }
        upsertAdminDeviceApproval(db, existing, device, req);
        audit(db, existing.id, "ADMIN_DEVICE_APPROVAL_REQUESTED", existing.id, { deviceId: device.id });
        await writeDb(db);
        res.setHeader("Set-Cookie", cookieHeader(deviceCookieName, deviceToken, deviceMaxAgeSeconds));
        return sendJson(res, 409, {
          error: "Solicitud enviada. Aprueba este dispositivo desde una PC admin ya autorizada.",
          code: "ADMIN_DEVICE_APPROVAL_REQUIRED",
        });
      }
    }

    const token = crypto.randomBytes(32).toString("base64url");
    const maxAge = sessionMaxAgeSeconds;
    const expiresAt = Date.now() + maxAge * 1000;
    db.sessions = db.sessions.filter((session) => session.expiresAt > Date.now() && session.version === sessionVersion);
    db.sessions.push({
      id: crypto.randomUUID(),
      userId: existing.id,
      tokenHash: hashToken(token),
      deviceId: device.id,
      version: sessionVersion,
      createdAt: nowIso(),
      lastSeenAt: nowIso(),
      lastSeenAtMs: Date.now(),
      expiresAt,
    });
    audit(db, existing.id, "LOGIN_SUCCESS", existing.id);
    await writeDb(db);

    res.setHeader("Set-Cookie", [
      cookieHeader("ariad_session", token, maxAge),
      cookieHeader(deviceCookieName, deviceToken, deviceMaxAgeSeconds),
    ]);
    return sendJson(res, 200, { user: publicUser(existing) });
  }

  if (req.method === "POST" && pathname === "/api/password-reset/request") {
    const genericMessage = "Si el correo existe y esta activo, enviaremos un enlace de recuperacion.";
    if (!mailIsConfigured()) {
      return sendJson(res, 503, { error: "Correo de recuperacion no configurado en Render." });
    }

    const input = await parseJson(req);
    const email = normalizeEmail(input.email);
    const db = await readDb();
    const now = Date.now();
    const requestEmailHash = hashToken(email);
    const requestIpHash = hashToken(clientIp(req));
    const recentRequests = db.passwordResetRequests.filter((request) => request.createdAtMs > now - resetRequestWindowMs);
    const requestCount = recentRequests.filter((request) => request.emailHash === requestEmailHash || request.ipHash === requestIpHash).length;
    db.passwordResetRequests = recentRequests.concat({
      id: crypto.randomUUID(),
      emailHash: requestEmailHash,
      ipHash: requestIpHash,
      createdAt: nowIso(),
      createdAtMs: now,
    });

    if (!email.includes("@") || requestCount >= maxResetRequestsPerWindow) {
      audit(db, null, requestCount >= maxResetRequestsPerWindow ? "PASSWORD_RESET_RATE_LIMITED" : "PASSWORD_RESET_REQUEST_IGNORED", null, { emailHash: requestEmailHash });
      await writeDb(db);
      return sendJson(res, 200, { message: genericMessage });
    }

    const target = db.users.find((candidate) => candidate.email === email && candidate.active);
    if (target) {
      const resetToken = crypto.randomBytes(32).toString("base64url");
      db.passwordResetTokens = db.passwordResetTokens.filter((tokenRecord) => tokenRecord.userId !== target.id);
      db.passwordResetTokens.push({
        id: crypto.randomUUID(),
        userId: target.id,
        tokenHash: hashToken(resetToken),
        createdAt: nowIso(),
        expiresAt: now + resetTokenExpiresMs,
        usedAt: "",
      });
      audit(db, null, "PASSWORD_RESET_EMAIL_REQUESTED", target.id, { email });
      await writeDb(db);
      try {
        await sendPasswordResetEmail(target, resetToken);
      } catch (error) {
        const failureDb = await readDb();
        audit(failureDb, null, "PASSWORD_RESET_EMAIL_FAILED", target.id, { email, error: cleanText(error.message, 160) });
        await writeDb(failureDb);
        return sendJson(res, error.status || 500, { error: "No se pudo enviar el correo de recuperacion. Revisa la configuracion SMTP." });
      }
    } else {
      audit(db, null, "PASSWORD_RESET_EMAIL_REQUESTED_UNKNOWN", null, { emailHash: requestEmailHash });
      await writeDb(db);
    }

    return sendJson(res, 200, { message: genericMessage });
  }

  if (req.method === "POST" && pathname === "/api/password-reset/confirm") {
    const input = await parseJson(req);
    const token = String(input.token || "");
    const password = String(input.password || "");
    const confirmPassword = String(input.confirmPassword || "");
    if (!token || !validatePassword(password) || password !== confirmPassword) {
      return sendJson(res, 400, { error: "Token valido y confirmacion de contrasena son obligatorios." });
    }
    const db = await readDb();
    const tokenHash = hashToken(token);
    const resetRecord = db.passwordResetTokens.find((record) => record.tokenHash === tokenHash && !record.usedAt && record.expiresAt > Date.now());
    if (!resetRecord) {
      return sendJson(res, 400, { error: "El enlace de recuperacion vencio o ya fue usado." });
    }
    const target = db.users.find((candidate) => candidate.id === resetRecord.userId && candidate.active);
    if (!target) {
      return sendJson(res, 400, { error: "No se puede recuperar una cuenta inactiva." });
    }
    target.passwordHash = await hashPassword(password);
    target.updatedAt = nowIso();
    resetRecord.usedAt = nowIso();
    db.sessions = db.sessions.filter((session) => session.userId !== target.id);
    audit(db, null, "PASSWORD_RESET_CONFIRMED", target.id, { email: target.email });
    await writeDb(db);
    return sendJson(res, 200, { message: "Contrasena actualizada. Ya puedes ingresar." });
  }

  if (req.method === "POST" && pathname === "/api/password-reset") {
    if (!enableSetupPasswordReset) {
      return sendJson(res, 404, { error: "Ruta no disponible." });
    }
    const input = await parseJson(req);
    const email = normalizeEmail(input.email);
    const password = String(input.password || "");
    if (!setupToken) {
      return sendJson(res, 403, { error: "Reset con codigo no configurado." });
    }
    if (String(input.setupToken || "") !== setupToken) {
      return sendJson(res, 403, { error: "Codigo de instalacion invalido." });
    }
    if (!email.includes("@") || !validatePassword(password)) {
      return sendJson(res, 400, { error: "Correo valido y nueva contrasena de 8 caracteres son obligatorios." });
    }
    const db = await readDb();
    let target = db.users.find((candidate) => candidate.email === email && candidate.role === "ADMIN" && candidate.active);
    const ownerRecoveryAllowed = ownerRecoveryEmail && email === ownerRecoveryEmail;
    if (!target) {
      if (!ownerRecoveryAllowed) {
        return sendJson(res, 404, { error: "Solo se puede recuperar un administrador activo o el correo propietario configurado en Render." });
      }
      target = db.users.find((candidate) => candidate.email === email);
      if (target) {
        target.role = "ADMIN";
        target.active = true;
        target.workChannel ||= "WhatsApp 1";
      } else {
        target = {
          id: crypto.randomUUID(),
          name: "Propietario AriadGSM",
          email,
          passwordHash: "",
          role: "ADMIN",
          workChannel: "WhatsApp 1",
          active: true,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        };
        db.users.push(target);
      }
    }
    target.passwordHash = await hashPassword(password);
    target.updatedAt = nowIso();
    db.sessions = db.sessions.filter((session) => session.userId !== target.id);
    audit(db, null, ownerRecoveryAllowed ? "OWNER_ADMIN_RECOVERED_WITH_SETUP_TOKEN" : "ADMIN_PASSWORD_RESET_WITH_SETUP_TOKEN", target.id, { email });
    await writeDb(db);
    return sendJson(res, 200, { message: "Contrasena de administrador actualizada. Inicia sesion con la nueva contrasena." });
  }

  if (req.method === "POST" && pathname === "/api/me/password") {
    if (!requireUser(user, res)) return;
    const input = await parseJson(req);
    const currentPassword = String(input.currentPassword || "");
    const password = String(input.password || "");
    if (!validatePassword(password)) {
      return sendJson(res, 400, { error: "La nueva contrasena debe tener al menos 8 caracteres." });
    }
    const db = await readDb();
    const target = db.users.find((candidate) => candidate.id === user.id);
    if (!target || !(await verifyPassword(currentPassword, target.passwordHash))) {
      return sendJson(res, 401, { error: "Contrasena actual incorrecta." });
    }
    target.passwordHash = await hashPassword(password);
    target.updatedAt = nowIso();
    const currentTokenHash = hashToken(getCookie(req, "ariad_session"));
    db.sessions = db.sessions.filter((session) => session.userId !== target.id || session.tokenHash === currentTokenHash);
    audit(db, user.id, "PASSWORD_CHANGED", target.id);
    await writeDb(db);
    return sendJson(res, 200, { message: "Contrasena actualizada." });
  }

  if (req.method === "POST" && pathname === "/api/me/operator-pin") {
    if (!requireUser(user, res)) return;
    const db = await readDb();
    if (!(await requireAdminWithAudit(user, res, db, "OPERATOR_PIN_UPDATE_DENIED", user.id, { route: pathname }, "Solo administrador puede configurar PIN operativo."))) return;
    const input = await parseJson(req);
    const currentPassword = String(input.currentPassword || "");
    const operatorPin = String(input.operatorPin || "");
    if (!validateOperatorPin(operatorPin)) {
      return sendJson(res, 400, { error: "El PIN operativo debe tener de 4 a 8 numeros." });
    }
    const target = db.users.find((candidate) => candidate.id === user.id);
    if (!target || !(await verifyPassword(currentPassword, target.passwordHash))) {
      return sendJson(res, 401, { error: "Contrasena actual incorrecta." });
    }
    target.operatorPinHash = await hashPassword(operatorPin);
    target.updatedAt = nowIso();
    const currentTokenHash = hashToken(getCookie(req, "ariad_session"));
    db.sessions = db.sessions.filter((session) => session.userId !== target.id || session.tokenHash === currentTokenHash);
    let deviceToken = "";
    let revokedDevices = 0;
    if (target.role === "ADMIN") {
      const currentDevice = ensureDevice(db, req);
      deviceToken = currentDevice.token;
      revokedDevices = revokeAdminDevicesExcept(db, target.id, currentDevice.device.id);
      trustDeviceForAdmin(currentDevice.device, target.id);
    }
    audit(db, user.id, "OPERATOR_PIN_CHANGED", target.id, { revokedDevices });
    await writeDb(db);
    if (deviceToken) {
      res.setHeader("Set-Cookie", cookieHeader(deviceCookieName, deviceToken, deviceMaxAgeSeconds));
    }
    return sendJson(res, 200, { message: "PIN operativo actualizado. Otros dispositivos admin fueron revocados." });
  }

  if (req.method === "POST" && pathname === "/api/me/revoke-devices") {
    if (!requireUser(user, res)) return;
    const db = await readDb();
    if (!(await requireAdminWithAudit(user, res, db, "TRUSTED_DEVICES_REVOKE_DENIED", user.id, { route: pathname }, "Solo administrador puede revocar dispositivos."))) return;
    const target = db.users.find((candidate) => candidate.id === user.id);
    if (!target) return sendJson(res, 404, { error: "Usuario no encontrado." });
    const currentTokenHash = hashToken(getCookie(req, "ariad_session"));
    db.sessions = db.sessions.filter((session) => session.userId !== target.id || session.tokenHash === currentTokenHash);
    const currentDevice = ensureDevice(db, req);
    const revokedDevices = target.role === "ADMIN"
      ? revokeAdminDevicesExcept(db, target.id, currentDevice.device.id)
      : 0;
    if (target.role === "ADMIN") trustDeviceForAdmin(currentDevice.device, target.id);
    audit(db, user.id, "TRUSTED_DEVICES_REVOKED", target.id, { revokedDevices });
    await writeDb(db);
    res.setHeader("Set-Cookie", cookieHeader(deviceCookieName, currentDevice.token, deviceMaxAgeSeconds));
    return sendJson(res, 200, { message: "Otros dispositivos y sesiones fueron revocados." });
  }

  const approveDeviceMatch = pathname.match(/^\/api\/me\/device-approvals\/([^/]+)\/approve$/);
  if (req.method === "POST" && approveDeviceMatch) {
    if (!requireUser(user, res)) return;
    const db = await readDb();
    if (!(await requireAdminWithAudit(user, res, db, "ADMIN_DEVICE_APPROVE_DENIED", approveDeviceMatch[1], { route: pathname }, "Solo administrador puede aprobar dispositivos."))) return;
    const approval = db.deviceApprovals.find((candidate) => {
      return candidate.id === approveDeviceMatch[1] && candidate.adminUserId === user.id && !candidate.approvedAt && candidate.expiresAt > Date.now();
    });
    if (!approval) return sendJson(res, 404, { error: "Solicitud de dispositivo no encontrada o vencida." });
    const device = db.devices.find((candidate) => candidate.id === approval.deviceId);
    if (!device) return sendJson(res, 404, { error: "Dispositivo no encontrado." });
    trustDeviceForAdmin(device, user.id);
    approval.approvedAt = nowIso();
    db.deviceApprovals = db.deviceApprovals.filter((candidate) => candidate.id !== approval.id);
    audit(db, user.id, "ADMIN_DEVICE_APPROVED", user.id, { deviceId: device.id });
    await writeDb(db);
    return sendJson(res, 200, { message: "Dispositivo aprobado. Ya puede iniciar sesion con tu cuenta admin." });
  }

  if (req.method === "POST" && pathname === "/api/logout") {
    const token = getCookie(req, "ariad_session");
    if (token) {
      const db = await readDb();
      db.sessions = db.sessions.filter((session) => session.tokenHash !== hashToken(token));
      await writeDb(db);
    }
    res.setHeader("Set-Cookie", "ariad_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
    return sendNoContent(res);
  }

  if (req.method === "GET" && pathname === "/api/users") {
    const db = await readDb();
    if (!(await requireAdminWithAudit(user, res, db, "USERS_READ_DENIED", "users", { route: pathname }))) return;
    return sendJson(res, 200, { users: db.users.map(publicUser) });
  }

  if (req.method === "GET" && pathname === "/api/tickets") {
    if (!requireUser(user, res)) return;
    const db = await readDb();
    return sendJson(res, 200, { tickets: db.tickets.slice(0, 120).map((ticket) => publicTicket(ticket, db)) });
  }

  if (req.method === "GET" && pathname === "/api/clients") {
    if (!requireUser(user, res)) return;
    const db = await readDb();
    return sendJson(res, 200, { clients: db.clients.slice(0, 300).map((client) => publicClient(client, db)) });
  }

  if (req.method === "GET" && pathname === "/api/pricing") {
    if (!requireUser(user, res)) return;
    const db = await readDb();
    if (!(await requireAdminWithAudit(user, res, db, "PRICING_READ_DENIED", "pricing", { route: pathname }, "Solo administrador puede ver precios y tasas."))) return;
    return sendJson(res, 200, { pricingConfig: publicPricingConfig(db.pricingConfig, db) });
  }

  const pricingRateMatch = pathname.match(/^\/api\/pricing\/exchange-rates\/([^/]+)$/);
  if (req.method === "PATCH" && pricingRateMatch) {
    if (!requireUser(user, res)) return;
    const db = await readDb();
    if (!(await requireAdminWithAudit(user, res, db, "PRICING_RATE_UPDATE_DENIED", pricingRateMatch[1], { route: pathname }, "Solo administrador puede modificar precios y tasas."))) return;
    const input = await parseJson(req);
    db.pricingConfig = normalizePricingConfig(db.pricingConfig);
    const rate = db.pricingConfig.exchangeRates.find((candidate) => candidate.key === pricingRateMatch[1]);
    if (!rate) return sendJson(res, 404, { error: "Tasa no encontrada." });
    const alreadyUpdatedToday = Boolean(rate.updatedAt && limaDateStamp(rate.updatedAt) === limaDateStamp());
    if (alreadyUpdatedToday && user.role !== "ADMIN") {
      return sendJson(res, 409, { error: "Esta tasa ya fue actualizada hoy. Solo administrador puede corregirla el mismo dia." });
    }
    const previous = rate.ratePerUsdt;
    rate.ratePerUsdt = rate.currency === "USDT" ? 1 : moneyNumber(input.ratePerUsdt);
    rate.updatedAt = nowIso();
    rate.updatedBy = user.id;
    audit(db, user.id, "PRICING_RATE_UPDATED", rate.key, {
      country: rate.country,
      currency: rate.currency,
      from: previous,
      to: rate.ratePerUsdt,
    });
    await writeDb(db);
    return sendJson(res, 200, { pricingConfig: publicPricingConfig(db.pricingConfig, db) });
  }

  const pricingRuleMatch = pathname.match(/^\/api\/pricing\/service-rules\/([^/]+)$/);
  if (req.method === "PATCH" && pricingRuleMatch) {
    if (!requireUser(user, res)) return;
    const db = await readDb();
    if (!(await requireAdminWithAudit(user, res, db, "PRICING_RULE_UPDATE_DENIED", pricingRuleMatch[1], { route: pathname }, "Solo administrador puede modificar precios y tasas."))) return;
    const input = await parseJson(req);
    db.pricingConfig = normalizePricingConfig(db.pricingConfig);
    const rule = db.pricingConfig.serviceRules.find((candidate) => candidate.serviceCode === pricingRuleMatch[1]);
    if (!rule) return sendJson(res, 404, { error: "Regla de servicio no encontrada." });
    const previous = { ...rule };
    if (pricingModes.has(input.pricingMode)) rule.pricingMode = input.pricingMode;
    rule.baseCostUsdt = moneyNumber(input.baseCostUsdt);
    rule.marginUsdt = moneyNumber(input.marginUsdt);
    rule.authCostUsdt = moneyNumber(input.authCostUsdt);
    rule.criticalCostUsdt = moneyNumber(input.criticalCostUsdt);
    rule.toolCostUsdt = moneyNumber(input.toolCostUsdt);
    rule.serverCostUsdt = moneyNumber(input.serverCostUsdt);
    rule.manualAdjustmentAllowed = input.manualAdjustmentAllowed === true || input.manualAdjustmentAllowed === "on";
    rule.updatedAt = nowIso();
    rule.updatedBy = user.id;
    audit(db, user.id, "PRICING_RULE_UPDATED", rule.serviceCode, {
      service: rule.serviceCode,
      from: previous,
      to: rule,
    });
    await writeDb(db);
    return sendJson(res, 200, { pricingConfig: publicPricingConfig(db.pricingConfig, db) });
  }

  if (req.method === "POST" && pathname === "/api/frp/orders") {
    if (!requireUser(user, res)) return;
    const input = await parseJson(req);
    const db = await readDb();
    if (!(await requireFrpAccess(user, res, db, "FRP_ORDER_CREATE_DENIED"))) return;
    let client = db.clients.find((candidate) => candidate.id === input.clientId);
    if (!client) {
      const parsedClient = parseClientText(input.clientText);
      if (!parsedClient) return sendJson(res, 400, { error: "Escribe cliente y pais. Ejemplo: Javier Lozano Colombia." });
      client = findClientByIdentity(db, parsedClient.name, parsedClient.country, parsedClient.whatsapp)
        || createClient(db, user, parsedClient.name, parsedClient.country, parsedClient.whatsapp);
      completeClientFromContext(db, user, client, parsedClient.whatsapp);
    }
    completeClientFromContext(db, user, client);
    const quantity = Math.max(1, Math.min(50, Number.parseInt(input.quantity, 10) || 1));
    const payment = paymentMethods.find((candidate) => candidate.code === input.paymentMethod);
    const allowedPayments = allowedTicketPaymentMethods();
    if (!payment || !allowedPayments.some((candidate) => candidate.code === payment.code)) {
      return sendJson(res, 400, { error: "Metodo de pago no disponible para orden FRP." });
    }
    const suggestion = frpPriceSuggestion(db, client.id, quantity);
    const requestedUnitPrice = Object.hasOwn(input, "unitPrice") ? moneyNumber(input.unitPrice) : suggestion.unitPrice;
    if (requestedUnitPrice <= 0) return sendJson(res, 400, { error: "Precio unitario obligatorio." });
    if (requestedUnitPrice < suggestion.unitPrice && user.role !== "ADMIN") {
      audit(db, user.id, "FRP_DISCOUNT_APPROVAL_REQUIRED", client.id, {
        requestedUnitPrice,
        suggestedUnitPrice: suggestion.unitPrice,
        quantity,
      });
      await writeDb(db);
      return sendJson(res, 403, { error: "Ese descuento requiere aprobacion de administrador." });
    }
    const order = {
      id: crypto.randomUUID(),
      code: nextFrpOrderCode(db),
      clientId: client.id,
      clientName: client.name,
      clientWhatsapp: client.whatsapp,
      country: client.country,
      serviceCode: frpServiceCode,
      serviceName: services.find((service) => service.code === frpServiceCode)?.name || "Xiaomi Cuenta Google",
      workChannel: frpWorkChannel,
      quantity,
      baseUnitPrice: 25,
      suggestedUnitPrice: suggestion.unitPrice,
      unitPrice: requestedUnitPrice,
      discountLabel: requestedUnitPrice < 25 ? suggestion.label : "Normal",
      monthlyUsageAtCreation: suggestion.monthlyUsage,
      nextMonthlyTier: suggestion.nextMonthlyTier,
      totalPrice: moneyNumber(requestedUnitPrice * quantity),
      priceFormatted: formatPaymentAmount(requestedUnitPrice * quantity, payment),
      paymentMethod: payment.code,
      paymentLabel: payment.label,
      paymentDetails: payment.details,
      paymentProofs: [],
      paymentStatus: "ESPERANDO_COMPROBANTE",
      orderStatus: "COTIZADA",
      checklist: defaultFrpOrderChecklist(),
      createdBy: user.id,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    const jobs = Array.from({ length: quantity }, (_, index) => ({
      id: crypto.randomUUID(),
      code: `${order.code}-${index + 1}`,
      orderId: order.id,
      sequence: index + 1,
      totalJobs: quantity,
      workChannel: frpWorkChannel,
      serviceCode: frpServiceCode,
      serviceName: order.serviceName,
      clientName: order.clientName,
      country: order.country,
      status: "ESPERANDO_PREPARACION",
      checklist: defaultFrpJobChecklist(),
      technicianId: "",
      createdAt: nowIso(),
      updatedAt: nowIso(),
      finalLog: "",
      finalImages: [],
      ardCode: "",
    }));
    db.frpOrders.unshift(order);
    db.frpJobs.unshift(...jobs);
    audit(db, user.id, "FRP_ORDER_CREATED", order.id, {
      code: order.code,
      client: order.clientName,
      quantity,
      unitPrice: order.unitPrice,
      totalPrice: order.totalPrice,
      discountLabel: order.discountLabel,
    });
    audit(db, user.id, "FRP_JOBS_CREATED", order.id, { jobCount: jobs.length });
    await writeDb(db);
    return sendJson(res, 201, { order: publicFrpOrder(order, db), frp: publicFrpState(db, user) });
  }

  const frpOrderChecklistMatch = pathname.match(/^\/api\/frp\/orders\/([^/]+)\/checklist$/);
  if (req.method === "PATCH" && frpOrderChecklistMatch) {
    if (!requireUser(user, res)) return;
    const input = await parseJson(req);
    const db = await readDb();
    if (!(await requireFrpAccess(user, res, db, "FRP_ORDER_CHECKLIST_DENIED", frpOrderChecklistMatch[1]))) return;
    const order = db.frpOrders.find((candidate) => candidate.id === frpOrderChecklistMatch[1]);
    if (!order) return sendJson(res, 404, { error: "Orden FRP no encontrada." });
    const key = cleanText(input.key, 40);
    if (!frpOrderChecklistKeys.includes(key) || key === "paymentValidated") {
      return sendJson(res, 400, { error: "Checklist de orden invalido." });
    }
    order.checklist[key] = Boolean(input.value);
    order.updatedAt = nowIso();
    const actionByKey = {
      priceSent: "FRP_PRICE_SENT",
      connectionDataSent: "FRP_CONNECTION_SENT",
      authorizationConfirmed: "FRP_AUTH_CONFIRMED",
    };
    syncFrpOrderStatus(db, order);
    audit(db, user.id, actionByKey[key] || "FRP_ORDER_CHECKLIST_UPDATED", order.id, { key, value: order.checklist[key], orderStatus: order.orderStatus });
    await writeDb(db);
    publishPortalOrdersForFrpOrder(db, order, "frp_order_checklist_updated");
    return sendJson(res, 200, { order: publicFrpOrder(order, db), frp: publicFrpState(db, user) });
  }

  const frpOrderPaymentProofMatch = pathname.match(/^\/api\/frp\/orders\/([^/]+)\/payment-proof$/);
  if (req.method === "PATCH" && frpOrderPaymentProofMatch) {
    if (!requireUser(user, res)) return;
    const input = await parseJson(req);
    const db = await readDb();
    if (!(await requireFrpAccess(user, res, db, "FRP_PAYMENT_PROOF_DENIED", frpOrderPaymentProofMatch[1]))) return;
    const order = db.frpOrders.find((candidate) => candidate.id === frpOrderPaymentProofMatch[1]);
    if (!order) return sendJson(res, 404, { error: "Orden FRP no encontrada." });
    const proofs = sanitizePaymentProofImages(input.paymentProofs);
    if (!proofs.length) return sendJson(res, 400, { error: "Carga al menos una imagen de comprobante." });
    const existingProofs = Array.isArray(order.paymentProofs) ? order.paymentProofs : [];
    if (existingProofs.length + proofs.length > maxPaymentProofImages) {
      return sendJson(res, 400, { error: `Maximo ${maxPaymentProofImages} comprobantes por orden.` });
    }
    const proofHashes = proofs.map((proof) => proof.hash).filter(Boolean);
    if (new Set(proofHashes).size !== proofHashes.length) return sendJson(res, 409, { error: "Subiste la misma imagen mas de una vez." });
    const existingHashes = new Set(existingProofs.map((proof) => proof.hash).filter(Boolean));
    if (proofs.some((proof) => existingHashes.has(proof.hash))) return sendJson(res, 409, { error: "Ese comprobante ya esta cargado en esta orden." });
    for (const otherOrder of db.frpOrders) {
      if (otherOrder.id === order.id) continue;
      const reusedProof = (otherOrder.paymentProofs || []).find((proof) => proofHashes.includes(proof.hash));
      if (reusedProof) return sendJson(res, 409, { error: `Ese comprobante ya fue usado en la orden ${otherOrder.code}.` });
    }
    for (const ticket of db.tickets) {
      const reusedProof = (ticket.paymentProofs || []).find((proof) => proofHashes.includes(proof.hash));
      if (reusedProof) return sendJson(res, 409, { error: `Ese comprobante ya fue usado en el ticket ${ticket.code}.` });
    }
    order.paymentProofs = existingProofs.concat(proofs.map((proof) => ({ ...proof, uploadedBy: user.id, uploadedAt: nowIso(), reviewStatus: "PENDIENTE" })));
    if (order.paymentStatus !== "COMPROBANTE_RECIBIDO") order.paymentStatus = "PAGO_EN_VALIDACION";
    order.updatedAt = nowIso();
    audit(db, user.id, "FRP_PAYMENT_PROOF_UPLOADED", order.id, { code: order.code, proofCount: proofs.length });
    await writeDb(db);
    publishPortalOrdersForFrpOrder(db, order, "frp_payment_proof_uploaded");
    return sendJson(res, 200, { order: publicFrpOrder(order, db), frp: publicFrpState(db, user) });
  }

  const frpOrderPaymentReviewMatch = pathname.match(/^\/api\/frp\/orders\/([^/]+)\/payment-review$/);
  if (req.method === "PATCH" && frpOrderPaymentReviewMatch) {
    if (!requireUser(user, res)) return;
    const input = await parseJson(req);
    const db = await readDb();
    if (!(await requireFrpPaymentReviewer(user, res, db, frpOrderPaymentReviewMatch[1]))) return;
    const order = db.frpOrders.find((candidate) => candidate.id === frpOrderPaymentReviewMatch[1]);
    if (!order) return sendJson(res, 404, { error: "Orden FRP no encontrada." });
    const action = cleanText(input.action, 20);
    const proofs = Array.isArray(order.paymentProofs) ? order.paymentProofs : [];
    if (!proofs.length) return sendJson(res, 400, { error: "No hay comprobante cargado para validar." });
    if (action === "approve") {
      order.paymentStatus = "COMPROBANTE_RECIBIDO";
      order.checklist.paymentValidated = true;
      order.paymentReviewedBy = user.id;
      order.paymentReviewedAt = nowIso();
      order.paymentProofs = proofs.map((proof) => ({ ...proof, reviewStatus: "VALIDADO", reviewedBy: user.id, reviewedAt: order.paymentReviewedAt }));
    } else if (action === "reject") {
      order.paymentStatus = "COMPROBANTE_RECHAZADO";
      order.checklist.paymentValidated = false;
      order.paymentReviewedBy = user.id;
      order.paymentReviewedAt = nowIso();
      order.paymentRejectedReason = cleanText(input.reason, 160) || "Comprobante rechazado";
      order.paymentProofs = proofs.map((proof) => ({ ...proof, reviewStatus: "RECHAZADO", reviewedBy: user.id, reviewedAt: order.paymentReviewedAt }));
    } else {
      return sendJson(res, 400, { error: "Accion de validacion invalida." });
    }
    order.updatedAt = nowIso();
    syncFrpOrderStatus(db, order);
    audit(db, user.id, action === "approve" ? "FRP_PAYMENT_VALIDATED" : "FRP_PAYMENT_REJECTED", order.id, { code: order.code, orderStatus: order.orderStatus });
    await writeDb(db);
    publishPortalOrdersForFrpOrder(db, order, action === "approve" ? "frp_payment_validated" : "frp_payment_rejected");
    return sendJson(res, 200, { order: publicFrpOrder(order, db), frp: publicFrpState(db, user) });
  }

  const frpJobChecklistMatch = pathname.match(/^\/api\/frp\/jobs\/([^/]+)\/checklist$/);
  if (req.method === "PATCH" && frpJobChecklistMatch) {
    if (!requireUser(user, res)) return;
    const input = await parseJson(req);
    const db = await readDb();
    if (!(await requireFrpAccess(user, res, db, "FRP_JOB_CHECKLIST_DENIED", frpJobChecklistMatch[1]))) return;
    const job = db.frpJobs.find((candidate) => candidate.id === frpJobChecklistMatch[1]);
    if (!job) return sendJson(res, 404, { error: "Trabajo FRP no encontrado." });
    const key = cleanText(input.key, 40);
    if (!frpJobChecklistKeys.includes(key)) return sendJson(res, 400, { error: "Checklist de equipo invalido." });
    job.checklist[key] = Boolean(input.value);
    job.updatedAt = nowIso();
    audit(db, user.id, "FRP_JOB_CHECKLIST_UPDATED", job.id, { code: job.code, key, value: job.checklist[key] });
    await writeDb(db);
    return sendJson(res, 200, { job: publicFrpJob(job, db), frp: publicFrpState(db, user) });
  }

  const frpJobReadyMatch = pathname.match(/^\/api\/frp\/jobs\/([^/]+)\/ready$/);
  if (req.method === "PATCH" && frpJobReadyMatch) {
    if (!requireUser(user, res)) return;
    const db = await readDb();
    if (!(await requireFrpAccess(user, res, db, "FRP_JOB_READY_DENIED", frpJobReadyMatch[1]))) return;
    const job = db.frpJobs.find((candidate) => candidate.id === frpJobReadyMatch[1]);
    const order = db.frpOrders.find((candidate) => candidate.id === job?.orderId);
    if (!job || !order) return sendJson(res, 404, { error: "Trabajo FRP no encontrado." });
    if (!frpOrderIsReady(order)) return sendJson(res, 400, { error: "Falta pago validado, conexion enviada o autorizacion confirmada." });
    if (!frpJobChecklistComplete(job)) return sendJson(res, 400, { error: "Completa conexion, estado requerido y modelo soportado." });
    if (!["ESPERANDO_PREPARACION", "ESPERANDO_CLIENTE", "REQUIERE_REVISION"].includes(job.status)) {
      return sendJson(res, 400, { error: "Este trabajo no puede enviarse a tecnico desde su estado actual." });
    }
    job.status = "LISTO_PARA_TECNICO";
    job.readyAt = nowIso();
    job.updatedAt = job.readyAt;
    syncFrpOrderStatus(db, order);
    audit(db, user.id, "FRP_JOB_READY", job.id, { code: job.code, order: order.code });
    await writeDb(db);
    publishPortalOrdersForFrpOrder(db, order, "frp_job_ready");
    return sendJson(res, 200, { job: publicFrpJob(job, db), frp: publicFrpState(db, user) });
  }

  if (req.method === "POST" && pathname === "/api/frp/jobs/take-next") {
    if (!requireUser(user, res)) return;
    const db = await readDb();
    if (!(await requireFrpAccess(user, res, db, "FRP_JOB_TAKE_DENIED"))) return;
    const activeJob = frpActiveJobForUser(db, user);
    if (activeJob) return sendJson(res, 409, { error: `Ya tienes un FRP en proceso: ${activeJob.code}.` });
    const job = db.frpJobs
      .filter((candidate) => candidate.status === "LISTO_PARA_TECNICO")
      .sort((a, b) => String(a.readyAt || a.updatedAt || a.createdAt).localeCompare(String(b.readyAt || b.updatedAt || b.createdAt)))[0];
    if (!job) return sendJson(res, 404, { error: "No hay trabajos FRP listos." });
    job.status = "EN_PROCESO";
    job.technicianId = user.id;
    job.takenAt = nowIso();
    job.updatedAt = job.takenAt;
    const order = db.frpOrders.find((candidate) => candidate.id === job.orderId);
    if (order) syncFrpOrderStatus(db, order);
    audit(db, user.id, "FRP_JOB_TAKEN", job.id, { code: job.code, order: order?.code || "" });
    await writeDb(db);
    publishPortalOrdersForFrpOrder(db, order, "frp_job_taken");
    return sendJson(res, 200, { job: publicFrpJob(job, db), frp: publicFrpState(db, user) });
  }

  const frpJobFinalizeMatch = pathname.match(/^\/api\/frp\/jobs\/([^/]+)\/finalize$/);
  if (req.method === "PATCH" && frpJobFinalizeMatch) {
    if (!requireUser(user, res)) return;
    const input = await parseJson(req);
    const db = await readDb();
    if (!(await requireFrpAccess(user, res, db, "FRP_JOB_FINALIZE_DENIED", frpJobFinalizeMatch[1]))) return;
    const job = db.frpJobs.find((candidate) => candidate.id === frpJobFinalizeMatch[1]);
    const order = db.frpOrders.find((candidate) => candidate.id === job?.orderId);
    if (!job || !order) return sendJson(res, 404, { error: "Trabajo FRP no encontrado." });
    if (job.technicianId && job.technicianId !== user.id && user.role !== "ADMIN") return sendJson(res, 403, { error: "Este trabajo lo tomo otro tecnico." });
    if (job.status !== "EN_PROCESO" && user.role !== "ADMIN") return sendJson(res, 400, { error: "Solo puedes finalizar un trabajo en proceso." });
    const finalLog = cleanText(input.finalLog, 500);
    const finalImages = sanitizeFinalLogImages(input.finalImages);
    if (!finalLog && !finalImages.length) return sendJson(res, 400, { error: "Para finalizar se requiere log escrito o imagen." });
    job.status = "FINALIZADO";
    job.finalLog = finalLog || job.finalLog;
    if (finalImages.length) job.finalImages = finalImages;
    job.ardCode ||= nextFrpArdCode(db);
    job.doneAt = nowIso();
    job.updatedAt = job.doneAt;
    job.technicianId ||= user.id;
    syncFrpOrderStatus(db, order);
    audit(db, user.id, "FRP_JOB_DONE", job.id, { code: job.code, order: order.code, ardCode: job.ardCode });
    await writeDb(db);
    publishPortalOrdersForFrpOrder(db, order, "frp_job_done");
    return sendJson(res, 200, { job: publicFrpJob(job, db), frp: publicFrpState(db, user) });
  }

  const frpJobReviewMatch = pathname.match(/^\/api\/frp\/jobs\/([^/]+)\/review$/);
  if (req.method === "PATCH" && frpJobReviewMatch) {
    if (!requireUser(user, res)) return;
    const input = await parseJson(req);
    const db = await readDb();
    if (!(await requireFrpAccess(user, res, db, "FRP_JOB_REVIEW_DENIED", frpJobReviewMatch[1]))) return;
    const job = db.frpJobs.find((candidate) => candidate.id === frpJobReviewMatch[1]);
    const order = db.frpOrders.find((candidate) => candidate.id === job?.orderId);
    if (!job || !order) return sendJson(res, 404, { error: "Trabajo FRP no encontrado." });
    if (job.technicianId && job.technicianId !== user.id && user.role !== "ADMIN") return sendJson(res, 403, { error: "Este trabajo lo tomo otro tecnico." });
    const reason = cleanText(input.reason, 180);
    if (!reason) return sendJson(res, 400, { error: "Indica motivo de revision." });
    job.status = "REQUIERE_REVISION";
    job.reviewReason = reason;
    job.updatedAt = nowIso();
    syncFrpOrderStatus(db, order);
    audit(db, user.id, "FRP_JOB_REVIEW_REQUIRED", job.id, { code: job.code, order: order.code, reason });
    await writeDb(db);
    publishPortalOrdersForFrpOrder(db, order, "frp_job_review_required");
    return sendJson(res, 200, { job: publicFrpJob(job, db), frp: publicFrpState(db, user) });
  }

  if (req.method === "POST" && pathname === "/api/clients") {
    if (!requireUser(user, res)) return;
    const input = await parseJson(req);
    const name = cleanText(input.name);
    const whatsapp = normalizePhone(input.whatsapp);
    const country = cleanText(input.country, 40);
    if (!name || !country) {
      return sendJson(res, 400, { error: "Nombre y pais del cliente son obligatorios." });
    }
    const db = await readDb();
    if (whatsapp && db.clients.some((client) => phoneKey(client.whatsapp) === phoneKey(whatsapp))) {
      return sendJson(res, 409, { error: "Ya existe un cliente con ese numero de telefono." });
    }
    const client = createClient(db, user, name, country, whatsapp);
    await writeDb(db);
    return sendJson(res, 201, { client: publicClient(client, db) });
  }

  if (req.method === "POST" && pathname === "/api/tickets") {
    if (!requireUser(user, res)) return;
    const input = await parseJson(req);
    const db = await readDb();
    const service = services.find((candidate) => candidate.code === input.serviceCode);
    const payment = paymentMethods.find((candidate) => candidate.code === input.paymentMethod);
    const ticketChannel = user.role === "ADMIN"
      ? (normalizeWorkChannel(input.workChannel) || normalizeWorkChannel(service?.workChannel) || normalizeWorkChannel(user.workChannel))
      : normalizeWorkChannel(user.workChannel);
    const model = cleanText(input.model, 80);
    const price = Number(input.price);

    if (!service || !payment || !ticketChannel || !Number.isFinite(price) || price < 0) {
      return sendJson(res, 400, { error: "Cliente, servicio, precio y metodo de pago son obligatorios." });
    }
    let client = db.clients.find((candidate) => candidate.id === input.clientId);
    if (!client) {
      const parsedClient = parseClientText(input.clientText);
      if (!parsedClient) {
        return sendJson(res, 400, { error: "Escribe cliente y pais. Ejemplo: Javier Lozano Colombia." });
      }
      client = findClientByIdentity(db, parsedClient.name, parsedClient.country, parsedClient.whatsapp, ticketChannel)
        || createClient(db, user, parsedClient.name, parsedClient.country, parsedClient.whatsapp, ticketChannel);
      completeClientFromContext(db, user, client, parsedClient.whatsapp, ticketChannel);
    }
    completeClientFromContext(db, user, client, "", ticketChannel);

    if (!client) {
      return sendJson(res, 400, { error: "Cliente, servicio, precio y metodo de pago son obligatorios." });
    }
    if (!serviceAllowedForUser(service, user, ticketChannel)) {
      audit(db, user.id, "TICKET_SERVICE_DENIED", null, {
        requestedService: service.code,
        requestedServiceName: service.name,
        serviceChannel: service.workChannel || "",
        userChannel: user.workChannel || "",
        requestedChannel: ticketChannel,
      });
      await writeDb(db);
      return sendJson(res, 403, { error: "Este servicio no pertenece a tu WhatsApp asignado." });
    }
    const allowedPayments = allowedTicketPaymentMethods();
    if (!allowedPayments.some((candidate) => candidate.code === payment.code)) {
      const labels = allowedPayments.map((candidate) => candidate.label).join(" o ");
      return sendJson(res, 400, { error: `Metodo de pago no disponible. Usa ${labels}.` });
    }
    if (service.requiresModel && !model) {
      return sendJson(res, 400, { error: "Este servicio requiere modelo del equipo." });
    }

    const ticket = {
      id: crypto.randomUUID(),
      code: nextTicketCode(db),
      clientId: client.id,
      clientName: client.name,
      clientWhatsapp: client.whatsapp,
      country: client.country,
      serviceCode: service.code,
      serviceName: service.name,
      model,
      price,
      priceFormatted: formatPaymentAmount(price, payment),
      paymentMethod: payment.code,
      paymentLabel: payment.label,
      paymentDetails: payment.details,
      paymentProofs: [],
      originChannel: ticketChannel,
      currentChannel: ticketChannel,
      workerChannel: ticketChannel,
      paymentStatus: "ESPERANDO_COMPROBANTE",
      operationalStatus: "TICKET_CREADO",
      createdBy: user.id,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      finalLog: "",
      finalImages: [],
    };
    db.tickets.unshift(ticket);
    audit(db, user.id, "TICKET_CREATED", ticket.id, {
      code: ticket.code,
      service: ticket.serviceCode,
      originChannel: ticket.originChannel,
      currentChannel: ticket.currentChannel,
    });
    await writeDb(db);
    return sendJson(res, 201, { ticket: publicTicket(ticket, db) });
  }

  const ticketPaymentProofMatch = pathname.match(/^\/api\/tickets\/([^/]+)\/payment-proof$/);
  if (req.method === "PATCH" && ticketPaymentProofMatch) {
    if (!requireUser(user, res)) return;
    const input = await parseJson(req);
    const db = await readDb();
    const ticket = db.tickets.find((candidate) => candidate.id === ticketPaymentProofMatch[1]);
    if (!ticket) return sendJson(res, 404, { error: "Ticket no encontrado." });

    const proofs = sanitizePaymentProofImages(input.paymentProofs);
    if (!proofs.length) {
      return sendJson(res, 400, { error: "Arrastra o selecciona al menos una imagen de comprobante." });
    }

    const existingProofs = Array.isArray(ticket.paymentProofs) ? ticket.paymentProofs : [];
    if (existingProofs.length + proofs.length > maxPaymentProofImages) {
      return sendJson(res, 400, { error: `Maximo ${maxPaymentProofImages} comprobantes por ticket.` });
    }
    const proofHashes = proofs.map((proof) => proof.hash).filter(Boolean);
    if (new Set(proofHashes).size !== proofHashes.length) {
      return sendJson(res, 409, { error: "Subiste la misma imagen mas de una vez." });
    }
    const existingHashes = new Set(existingProofs.map((proof) => proof.hash).filter(Boolean));
    if (proofs.some((proof) => existingHashes.has(proof.hash))) {
      return sendJson(res, 409, { error: "Ese comprobante ya esta cargado en este ticket." });
    }
    for (const otherTicket of db.tickets) {
      if (otherTicket.id === ticket.id) continue;
      const reusedProof = (otherTicket.paymentProofs || []).find((proof) => proofHashes.includes(proof.hash));
      if (reusedProof) {
        return sendJson(res, 409, { error: `Ese comprobante ya fue usado en el ticket ${otherTicket.code}.` });
      }
    }

    const pendingProofs = proofs.map((proof) => ({
      ...proof,
      uploadedBy: user.id,
      uploadedAt: nowIso(),
      reviewStatus: "PENDIENTE",
    }));
    ticket.paymentProofs = existingProofs.concat(pendingProofs);
    if (ticket.paymentStatus !== "COMPROBANTE_RECIBIDO") {
      ticket.paymentStatus = "PAGO_EN_VALIDACION";
    }
    ticket.updatedAt = nowIso();
    ticket.lastHandledBy = user.id;
    ticket.lastHandledAt = ticket.updatedAt;
    audit(db, user.id, "PAYMENT_PROOF_UPLOADED", ticket.id, {
      code: ticket.code,
      proofCount: proofs.length,
      paymentStatus: ticket.paymentStatus,
      operationalStatus: ticket.operationalStatus,
      currentChannel: fallbackTicketChannel(ticket, db),
    });
    await writeDb(db);
    return sendJson(res, 200, { ticket: publicTicket(ticket, db) });
  }

  const ticketPaymentReviewMatch = pathname.match(/^\/api\/tickets\/([^/]+)\/payment-review$/);
  if (req.method === "PATCH" && ticketPaymentReviewMatch) {
    if (!requirePaymentReviewer(user, res)) return;
    const input = await parseJson(req);
    const db = await readDb();
    const ticket = db.tickets.find((candidate) => candidate.id === ticketPaymentReviewMatch[1]);
    if (!ticket) return sendJson(res, 404, { error: "Ticket no encontrado." });
    const action = cleanText(input.action, 20);
    const proofs = Array.isArray(ticket.paymentProofs) ? ticket.paymentProofs : [];
    if (!proofs.length) {
      return sendJson(res, 400, { error: "No hay comprobante cargado para validar." });
    }

    const previousPaymentStatus = ticket.paymentStatus;
    const previousOperationalStatus = ticket.operationalStatus;
    if (action === "approve") {
      ticket.paymentStatus = "COMPROBANTE_RECIBIDO";
      ticket.paymentReviewedBy = user.id;
      ticket.paymentReviewedAt = nowIso();
      ticket.paymentRejectedReason = "";
      ticket.paymentProofs = proofs.map((proof) => ({
        ...proof,
        reviewStatus: proof.reviewStatus === "RECHAZADO" ? proof.reviewStatus : "VALIDADO",
        reviewedBy: user.id,
        reviewedAt: ticket.paymentReviewedAt,
      }));
      if (ticket.operationalStatus === "TICKET_CREADO") {
        ticket.operationalStatus = "EN_COLA";
      }
    } else if (action === "reject") {
      ticket.paymentStatus = "COMPROBANTE_RECHAZADO";
      ticket.paymentReviewedBy = user.id;
      ticket.paymentReviewedAt = nowIso();
      ticket.paymentRejectedReason = cleanText(input.reason, 160) || "Comprobante rechazado";
      ticket.paymentProofs = proofs.map((proof) => ({
        ...proof,
        reviewStatus: proof.reviewStatus === "VALIDADO" ? proof.reviewStatus : "RECHAZADO",
        reviewedBy: user.id,
        reviewedAt: ticket.paymentReviewedAt,
      }));
      if (ticket.operationalStatus !== "FINALIZADO") {
        ticket.operationalStatus = "TICKET_CREADO";
      }
    } else {
      return sendJson(res, 400, { error: "Accion de validacion invalida." });
    }

    ticket.updatedAt = nowIso();
    ticket.lastHandledBy = user.id;
    ticket.lastHandledAt = ticket.updatedAt;
    audit(db, user.id, action === "approve" ? "PAYMENT_PROOF_APPROVED" : "PAYMENT_PROOF_REJECTED", ticket.id, {
      code: ticket.code,
      fromPaymentStatus: previousPaymentStatus,
      toPaymentStatus: ticket.paymentStatus,
      fromOperationalStatus: previousOperationalStatus,
      toOperationalStatus: ticket.operationalStatus,
      currentChannel: fallbackTicketChannel(ticket, db),
    });
    await writeDb(db);
    return sendJson(res, 200, { ticket: publicTicket(ticket, db) });
  }

  const ticketStatusMatch = pathname.match(/^\/api\/tickets\/([^/]+)\/status$/);
  if (req.method === "PATCH" && ticketStatusMatch) {
    if (!requireUser(user, res)) return;
    const input = await parseJson(req);
    const db = await readDb();
    const ticket = db.tickets.find((candidate) => candidate.id === ticketStatusMatch[1]);
    if (!ticket) return sendJson(res, 404, { error: "Ticket no encontrado." });
    const status = ticketStatuses.find((candidate) => candidate.code === input.operationalStatus);
    if (!status) return sendJson(res, 400, { error: "Estado invalido." });
    if (ticket.operationalStatus === "FINALIZADO" && status.code !== "FINALIZADO") {
      return sendJson(res, 400, { error: "El ticket ya fue finalizado. Para reabrirlo debe existir un motivo y permiso administrativo." });
    }
    if (status.code === "TICKET_CREADO" && ["PAGO_EN_VALIDACION", "COMPROBANTE_RECIBIDO"].includes(ticket.paymentStatus)) {
      return sendJson(res, 400, { error: "El paso Nuevo ya esta cerrado porque el comprobante fue cargado o validado." });
    }
    if (["EN_COLA", "EN_PROCESO", "FINALIZADO"].includes(status.code) && ticket.paymentStatus !== "COMPROBANTE_RECIBIDO") {
      return sendJson(res, 400, { error: "Primero valida el comprobante de pago." });
    }
    const previous = ticket.operationalStatus;
    const finalLog = cleanText(input.finalLog, 500);
    const finalImages = sanitizeFinalLogImages(input.finalImages);
    const existingImages = Array.isArray(ticket.finalImages) ? ticket.finalImages : [];
    if (status.code === "FINALIZADO" && !finalLog && !ticket.finalLog && !finalImages.length && !existingImages.length) {
      return sendJson(res, 400, { error: "Para finalizar se requiere log escrito o imagen." });
    }
    ticket.operationalStatus = status.code;
    if (status.code === "FINALIZADO") {
      ticket.finalLog = finalLog || ticket.finalLog;
      if (finalImages.length) ticket.finalImages = finalImages;
    }
    ticket.updatedAt = nowIso();
    ticket.lastHandledBy = user.id;
    ticket.lastHandledAt = ticket.updatedAt;
    audit(db, user.id, "TICKET_STATUS_UPDATED", ticket.id, {
      code: ticket.code,
      from: previous,
      to: status.code,
      currentChannel: fallbackTicketChannel(ticket, db),
    });
    await writeDb(db);
    return sendJson(res, 200, { ticket: publicTicket(ticket, db) });
  }

  const ticketChannelMatch = pathname.match(/^\/api\/tickets\/([^/]+)\/channel$/);
  if (req.method === "PATCH" && ticketChannelMatch) {
    if (!requireUser(user, res)) return;
    const input = await parseJson(req);
    const db = await readDb();
    if (user.role !== "ADMIN") {
      audit(db, user.id, "TICKET_CHANNEL_UPDATE_DENIED", ticketChannelMatch[1], {
        requestedChannel: cleanText(input.currentChannel, 40),
        role: user.role,
      });
      await writeDb(db);
      return sendJson(res, 403, { error: "Solo administrador puede reasignar el canal responsable de un ticket." });
    }
    const ticket = db.tickets.find((candidate) => candidate.id === ticketChannelMatch[1]);
    if (!ticket) return sendJson(res, 404, { error: "Ticket no encontrado." });
    const nextChannel = normalizeWorkChannel(input.currentChannel);
    if (!nextChannel) return sendJson(res, 400, { error: "Canal responsable invalido." });

    ensureTicketChannels(ticket, db);
    const previousChannel = fallbackTicketChannel(ticket, db);
    if (previousChannel === nextChannel) {
      return sendJson(res, 200, { ticket: publicTicket(ticket, db) });
    }

    ticket.currentChannel = nextChannel;
    ticket.workerChannel = nextChannel;
    ticket.updatedAt = nowIso();
    ticket.lastHandledBy = user.id;
    ticket.lastHandledAt = ticket.updatedAt;
    audit(db, user.id, "TICKET_CHANNEL_UPDATED", ticket.id, {
      code: ticket.code,
      from: previousChannel,
      to: nextChannel,
      originChannel: normalizeWorkChannel(ticket.originChannel),
    });
    await writeDb(db);
    return sendJson(res, 200, { ticket: publicTicket(ticket, db) });
  }

  const userMatch = pathname.match(/^\/api\/users\/([^/]+)$/);
  if (req.method === "PATCH" && userMatch) {
    if (!requireUser(user, res)) return;
    const db = await readDb();
    if (!(await requireAdminWithAudit(user, res, db, "USER_UPDATE_DENIED", userMatch[1], { route: pathname }))) return;
    const input = await parseJson(req);
    const target = db.users.find((candidate) => candidate.id === userMatch[1]);
    if (!target) return sendJson(res, 404, { error: "Usuario no encontrado." });

    const previous = publicUser(target);
    const nextRole = Object.hasOwn(input, "role") ? input.role : target.role;
    const nextActive = Object.hasOwn(input, "active") ? Boolean(input.active) : target.active;
    if (!roles.has(nextRole)) return sendJson(res, 400, { error: "Rol invalido." });
    if (target.id === user.id && (nextRole !== "ADMIN" || !nextActive)) {
      return sendJson(res, 400, { error: "No puedes quitarte tu propio rol administrador ni desactivar tu cuenta." });
    }
    const activeAdminsAfter = db.users.filter((candidate) => {
      const role = candidate.id === target.id ? nextRole : candidate.role;
      const active = candidate.id === target.id ? nextActive : candidate.active;
      return active && role === "ADMIN";
    }).length;
    if (activeAdminsAfter === 0) {
      return sendJson(res, 400, { error: "Debe existir al menos un administrador activo." });
    }
    if (Object.hasOwn(input, "role")) {
      target.role = nextRole;
    }
    if (Object.hasOwn(input, "active")) {
      target.active = nextActive;
    }
    if (Object.hasOwn(input, "workChannel")) {
      target.workChannel = normalizeWorkChannel(input.workChannel);
    }
    target.updatedAt = nowIso();
    audit(db, user.id, "USER_UPDATED", target.id, { before: previous, after: publicUser(target) });
    await writeDb(db);
    return sendJson(res, 200, { user: publicUser(target) });
  }

  return sendJson(res, 404, { error: "Ruta no encontrada." });
}

function ownerRecoveryPage() {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex,nofollow" />
    <title>Recuperacion propietario - AriadGSM Ops</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f5f7fb; color: #101827; font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      main { width: min(480px, calc(100vw - 32px)); padding: 28px; border: 1px solid #d9e0ec; border-radius: 18px; background: #fff; box-shadow: 0 24px 70px rgba(16, 24, 39, 0.13); }
      h1 { margin: 0 0 10px; font-size: 28px; }
      p { color: #667085; line-height: 1.5; }
      form { display: grid; gap: 14px; margin-top: 18px; }
      label { display: grid; gap: 7px; color: #27364b; font-size: 13px; font-weight: 800; }
      input { min-height: 46px; border: 1px solid #d9e0ec; border-radius: 8px; padding: 0 12px; font: inherit; }
      button { min-height: 48px; border: 0; border-radius: 8px; background: #2177f2; color: #fff; font: inherit; font-weight: 900; cursor: pointer; }
      .message[data-type="error"] { color: #dc3f49; }
      .message[data-type="success"] { color: #0f9f6e; }
      .note { font-size: 13px; }
    </style>
  </head>
  <body>
    <main>
      <h1>Recuperacion propietario</h1>
      <p>Usa esta pagina solo mientras <strong>ARIAD_ENABLE_SETUP_RESET=true</strong> este activo en Render. Si tu correo no era administrador activo, tambien configura <strong>ARIAD_OWNER_RECOVERY_EMAIL</strong>.</p>
      <form id="form">
        <label>Correo administrador <input name="email" type="email" autocomplete="email" required /></label>
        <label>Nueva contrasena <input name="password" type="password" autocomplete="new-password" minlength="8" required /></label>
        <label>Codigo de instalacion <input name="setupToken" autocomplete="one-time-code" required /></label>
        <button type="submit">Restablecer administrador</button>
        <p id="message" class="message note" aria-live="polite"></p>
      </form>
    </main>
    <script>
      const form = document.querySelector("#form");
      const message = document.querySelector("#message");
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        message.textContent = "";
        const body = Object.fromEntries(new FormData(form));
        try {
          const response = await fetch("/api/password-reset", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error || "No se pudo restablecer.");
          message.textContent = payload.message;
          message.dataset.type = "success";
          form.reset();
        } catch (error) {
          message.textContent = error.message;
          message.dataset.type = "error";
        }
      });
    </script>
  </body>
</html>`;
}

function requestHost(req) {
  return String(req.headers.host || "").split(":")[0].toLowerCase();
}

function requestShouldRedirectToCustomerPortal(req, pathname) {
  return requestHost(req) === "ops.ariadgsm.com"
    && (pathname === "/cliente" || pathname.startsWith("/cliente/") || pathname === "/portal");
}

function redirectToCustomerPortal(req, res) {
  let target;
  try {
    const currentUrl = new URL(req.url || "/cliente", `https://${req.headers.host || "ops.ariadgsm.com"}`);
    target = new URL(`${currentUrl.pathname}${currentUrl.search}`, customerPortalBaseUrl);
  } catch {
    target = new URL("/cliente", customerPortalBaseUrl);
  }
  res.writeHead(302, {
    Location: target.toString(),
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  });
  res.end();
}

function requestUsesCustomerPortal(req, pathname) {
  const host = requestHost(req);
  return host === "ariadgsm.com"
    || host === "www.ariadgsm.com"
    || pathname === "/cliente"
    || pathname.startsWith("/cliente/")
    || pathname === "/portal";
}

async function serveStatic(req, res, pathname) {
  if (pathname === "/owner-recovery") {
    if (!enableSetupPasswordReset) {
      res.writeHead(404, { "Cache-Control": "no-store" });
      return res.end("Not found");
    }
    return sendHtml(res, 200, ownerRecoveryPage());
  }

  if (requestShouldRedirectToCustomerPortal(req, pathname)) {
    return redirectToCustomerPortal(req, res);
  }

  const portalRequest = requestUsesCustomerPortal(req, pathname);
  if (portalRequest) res.setHeader("Referrer-Policy", "no-referrer");
  let safePath = pathname;
  if (portalRequest && (pathname === "/" || pathname === "/cliente" || pathname.startsWith("/cliente/") || pathname === "/portal")) {
    safePath = "/portal.html";
  } else if (pathname === "/") {
    safePath = "/index.html";
  }
  const resolved = path.normalize(path.join(publicDir, safePath));
  if (!resolved.startsWith(publicDir)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  try {
    const file = await fs.readFile(resolved);
    const ext = path.extname(resolved).toLowerCase();
    const type = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".jpg": "image/jpeg",
    }[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
    res.end(file);
  } catch {
    const index = await fs.readFile(path.join(publicDir, portalRequest ? "portal.html" : "index.html"));
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(index);
  }
}

await ensureDb();

createServer(async (req, res) => {
  try {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url.pathname);
    } else {
      await serveStatic(req, res, url.pathname);
    }
  } catch (error) {
    console.error(error);
    sendJson(res, error.status || 500, { error: error.message || "Error interno." });
  }
}).listen(port, () => {
  console.log(`AriadGSM Ops MVP listo en http://localhost:${port}`);
});
