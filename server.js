import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import nodemailer from "nodemailer";

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
const sessionVersion = 3;
const sessionMaxAgeSeconds = 60 * 60 * 8;
const resetTokenExpiresMs = 15 * 60 * 1000;
const resetRequestWindowMs = 15 * 60 * 1000;
const maxResetRequestsPerWindow = 5;
const maxJsonBodyBytes = 12 * 1024 * 1024;
const maxFinalLogImages = 4;
const maxPaymentProofImages = 4;
const maxFinalLogImageBytes = 2 * 1024 * 1024;

const roles = new Set(["ADMIN", "COORDINADOR", "ATENCION_TECNICA"]);
const roleLabels = {
  ADMIN: "Administrador",
  COORDINADOR: "Coordinador",
  ATENCION_TECNICA: "Atencion tecnica",
};
const workChannels = ["WhatsApp 1", "WhatsApp 2", "WhatsApp 3"];
const services = [
  { code: "XIA-FRP-GOOGLE", name: "Xiaomi Cuenta Google", defaultPrice: 25, requiresModel: false },
  { code: "XIA-F4", name: "Xiaomi F4", defaultPrice: 0, requiresModel: true },
  { code: "IREMOVAL-REGISTROS", name: "iRemoval Registros", defaultPrice: 0, requiresModel: false },
  { code: "SERVICIO-MANUAL", name: "Servicio manual", defaultPrice: 0, requiresModel: false },
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
      clients: [],
      audit: [],
      tickets: [],
      ticketCounters: {},
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
  db.clients ||= [];
  db.audit ||= [];
  db.tickets ||= [];
  db.ticketCounters ||= {};
  db.passwordResetTokens ||= [];
  db.passwordResetRequests ||= [];
  const normalizedPricingConfig = normalizePricingConfig(db.pricingConfig);
  let changed = false;
  const now = Date.now();
  const resetTokenCount = db.passwordResetTokens.length;
  const resetRequestCount = db.passwordResetRequests.length;
  db.passwordResetTokens = db.passwordResetTokens.filter((token) => !token.usedAt && token.expiresAt > now);
  db.passwordResetRequests = db.passwordResetRequests.filter((request) => request.createdAtMs > now - resetRequestWindowMs);
  if (db.passwordResetTokens.length !== resetTokenCount || db.passwordResetRequests.length !== resetRequestCount) {
    changed = true;
  }
  if (JSON.stringify(db.pricingConfig || {}) !== JSON.stringify(normalizedPricingConfig)) {
    db.pricingConfig = normalizedPricingConfig;
    changed = true;
  }
  for (const ticket of db.tickets) {
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
  if (db.sessions.length !== before) await writeDb(db);
  if (!session) {
    return null;
  }
  const user = db.users.find((candidate) => candidate.id === session.userId);
  if (!user || !user.active) return null;
  return user;
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
  if (!["ADMIN", "COORDINADOR"].includes(user.role)) {
    sendJson(res, 403, { error: "Solo administrador o coordinador puede modificar precios y tasas." });
    return false;
  }
  return true;
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function cleanName(name) {
  return String(name || "").trim().replace(/\s+/g, " ");
}

function validatePassword(password) {
  return typeof password === "string" && password.length >= 8;
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

function nextTicketCode(db) {
  const stamp = limaDateStamp();
  const next = (db.ticketCounters[stamp] || 0) + 1;
  db.ticketCounters[stamp] = next;
  return `V-${stamp}-${String(next).padStart(3, "0")}`;
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

function allowedTicketPaymentMethods() {
  return paymentMethods.filter((payment) => payment.ticketOption);
}

function findClientByIdentity(db, name, country, whatsapp = "") {
  const nameKey = normalizeForMatch(name);
  const countryKey = normalizeForMatch(country);
  const targetPhoneKey = phoneKey(whatsapp);
  const sameNameCountry = db.clients.filter((client) => normalizeForMatch(client.name) === nameKey && normalizeForMatch(client.country) === countryKey);
  if (!targetPhoneKey) return sameNameCountry[0];
  return sameNameCountry.find((client) => phoneKey(client.whatsapp) === targetPhoneKey)
    || sameNameCountry.find((client) => !phoneKey(client.whatsapp))
    || null;
}

function createClient(db, user, name, country, whatsapp = "") {
  const client = {
    id: crypto.randomUUID(),
    name: cleanText(name),
    whatsapp: normalizePhone(whatsapp),
    country: cleanText(country, 40),
    workChannel: user.workChannel || "",
    createdBy: user.id,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  db.clients.unshift(client);
  audit(db, user.id, "CLIENT_CREATED", client.id, { name: client.name, country: client.country, workChannel: client.workChannel, automatic: true });
  return client;
}

function completeClientFromContext(db, user, client, whatsapp = "") {
  let changed = false;
  const phone = normalizePhone(whatsapp);
  if (phone && !phoneKey(client.whatsapp)) {
    client.whatsapp = phone;
    changed = true;
  }
  if (!client.workChannel && user.workChannel) {
    client.workChannel = user.workChannel;
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
  const payment = paymentMethods.find((candidate) => candidate.code === ticket.paymentMethod);
  return {
    ...ticket,
    createdByName: creator?.name || "Sistema",
    workerChannel: ticket.workerChannel || creator?.workChannel || "",
    priceFormatted: ticket.priceFormatted || formatPaymentAmount(ticket.price, payment),
    paymentDetails: Array.isArray(ticket.paymentDetails) ? ticket.paymentDetails : payment?.details || [],
    paymentProofs: Array.isArray(ticket.paymentProofs) ? ticket.paymentProofs : [],
    finalImages: Array.isArray(ticket.finalImages) ? ticket.finalImages : [],
  };
}

async function handleApi(req, res, pathname) {
  const user = await getCurrentUser(req);

  if (req.method === "GET" && pathname === "/api/health") {
    return sendJson(res, 200, { ok: true });
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
      pricingConfig: publicPricingConfig(db.pricingConfig, db),
      roles: Array.from(roles).map((role) => ({ value: role, label: roleLabels[role] })),
      catalog: { services, paymentMethods, workChannels, ticketStatuses, countries: countries.map(([, country]) => country) },
    });
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

    const token = crypto.randomBytes(32).toString("base64url");
    const maxAge = sessionMaxAgeSeconds;
    const expiresAt = Date.now() + maxAge * 1000;
    db.sessions = db.sessions.filter((session) => session.expiresAt > Date.now() && session.version === sessionVersion);
    db.sessions.push({
      id: crypto.randomUUID(),
      userId: existing.id,
      tokenHash: hashToken(token),
      version: sessionVersion,
      createdAt: nowIso(),
      expiresAt,
    });
    audit(db, existing.id, "LOGIN_SUCCESS", existing.id);
    await writeDb(db);

    const secureCookie = process.env.NODE_ENV === "production" ? "; Secure" : "";
    res.setHeader("Set-Cookie", `ariad_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secureCookie}`);
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
    if (!requireAdmin(user, res)) return;
    const db = await readDb();
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
    return sendJson(res, 200, { pricingConfig: publicPricingConfig(db.pricingConfig, db) });
  }

  const pricingRateMatch = pathname.match(/^\/api\/pricing\/exchange-rates\/([^/]+)$/);
  if (req.method === "PATCH" && pricingRateMatch) {
    if (!requirePricingManager(user, res)) return;
    const input = await parseJson(req);
    const db = await readDb();
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
    if (!requirePricingManager(user, res)) return;
    const input = await parseJson(req);
    const db = await readDb();
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
    let client = db.clients.find((candidate) => candidate.id === input.clientId);
    if (!client) {
      const parsedClient = parseClientText(input.clientText);
      if (!parsedClient) {
        return sendJson(res, 400, { error: "Escribe cliente y pais. Ejemplo: Javier Lozano Colombia." });
      }
      client = findClientByIdentity(db, parsedClient.name, parsedClient.country, parsedClient.whatsapp)
        || createClient(db, user, parsedClient.name, parsedClient.country, parsedClient.whatsapp);
      completeClientFromContext(db, user, client, parsedClient.whatsapp);
    }
    completeClientFromContext(db, user, client);
    const service = services.find((candidate) => candidate.code === input.serviceCode);
    const payment = paymentMethods.find((candidate) => candidate.code === input.paymentMethod);
    const model = cleanText(input.model, 80);
    const price = Number(input.price);

    if (!client || !service || !payment || !Number.isFinite(price) || price < 0) {
      return sendJson(res, 400, { error: "Cliente, servicio, precio y metodo de pago son obligatorios." });
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
      workerChannel: user.workChannel || "",
      paymentStatus: "ESPERANDO_COMPROBANTE",
      operationalStatus: "TICKET_CREADO",
      createdBy: user.id,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      finalLog: "",
      finalImages: [],
    };
    db.tickets.unshift(ticket);
    audit(db, user.id, "TICKET_CREATED", ticket.id, { code: ticket.code, service: ticket.serviceCode });
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
    audit(db, user.id, "PAYMENT_PROOF_UPLOADED", ticket.id, {
      code: ticket.code,
      proofCount: proofs.length,
      paymentStatus: ticket.paymentStatus,
      operationalStatus: ticket.operationalStatus,
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
    audit(db, user.id, action === "approve" ? "PAYMENT_PROOF_APPROVED" : "PAYMENT_PROOF_REJECTED", ticket.id, {
      code: ticket.code,
      fromPaymentStatus: previousPaymentStatus,
      toPaymentStatus: ticket.paymentStatus,
      fromOperationalStatus: previousOperationalStatus,
      toOperationalStatus: ticket.operationalStatus,
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
    audit(db, user.id, "TICKET_STATUS_UPDATED", ticket.id, {
      code: ticket.code,
      from: previous,
      to: status.code,
    });
    await writeDb(db);
    return sendJson(res, 200, { ticket: publicTicket(ticket, db) });
  }

  const userMatch = pathname.match(/^\/api\/users\/([^/]+)$/);
  if (req.method === "PATCH" && userMatch) {
    if (!requireAdmin(user, res)) return;
    const input = await parseJson(req);
    const db = await readDb();
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

async function serveStatic(req, res, pathname) {
  if (pathname === "/owner-recovery") {
    if (!enableSetupPasswordReset) {
      res.writeHead(404, { "Cache-Control": "no-store" });
      return res.end("Not found");
    }
    return sendHtml(res, 200, ownerRecoveryPage());
  }

  const safePath = pathname === "/" ? "/index.html" : pathname;
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
    res.writeHead(200, { "Content-Type": type });
    res.end(file);
  } catch {
    const index = await fs.readFile(path.join(publicDir, "index.html"));
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
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
