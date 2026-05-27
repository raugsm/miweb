const campaignParamKeys = ["src", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid"];
const campaignStorageKey = "ariadgsm_campaign_context";
const campaignSessionKey = "ariadgsm_campaign_session";
const campaignTtlMs = 30 * 24 * 60 * 60 * 1000;
const whatsappText = "Hola, vengo del anuncio de Facebook y quiero descargar la app AriadGSM";

function campaignParamsFrom(searchParams) {
  const params = {};
  for (const key of campaignParamKeys) {
    const value = String(searchParams.get(key) || "").trim();
    if (value) params[key] = value.slice(0, 180);
  }
  return params;
}

function readStoredContext() {
  try {
    const parsed = JSON.parse(localStorage.getItem(campaignStorageKey) || "{}");
    if (!parsed.savedAt || Date.now() - parsed.savedAt > campaignTtlMs) return {};
    return parsed;
  } catch {
    return {};
  }
}

function writeStoredContext(context) {
  try {
    localStorage.setItem(campaignStorageKey, JSON.stringify(context));
  } catch {
    // Tracking must never block the page.
  }
}

function campaignContext() {
  const urlParams = campaignParamsFrom(new URLSearchParams(window.location.search));
  const stored = readStoredContext();
  const params = Object.keys(urlParams).length ? urlParams : (stored.params || {});
  const context = {
    params,
    firstUrl: stored.firstUrl || `${window.location.pathname}${window.location.search}`,
    lastUrl: `${window.location.pathname}${window.location.search}`,
    savedAt: Date.now(),
  };
  if (Object.keys(urlParams).length) writeStoredContext(context);
  return context;
}

function sessionId() {
  try {
    let current = sessionStorage.getItem(campaignSessionKey);
    if (!current) {
      current = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      sessionStorage.setItem(campaignSessionKey, current);
    }
    return current;
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function alreadySent(key) {
  try {
    const storageKey = `${campaignSessionKey}:${key}`;
    if (sessionStorage.getItem(storageKey)) return true;
    sessionStorage.setItem(storageKey, "1");
    return false;
  } catch {
    return false;
  }
}

function sendCampaignEvent(eventType, extra = {}) {
  const payload = {
    eventType,
    sessionId: sessionId(),
    url: `${window.location.pathname}${window.location.search}`,
    referrer: document.referrer || "",
    campaign: campaignContext().params || {},
    ...extra,
  };
  const body = JSON.stringify(payload);
  const endpoint = "/api/public/campaign-event";
  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon(endpoint, blob)) return;
  }
  fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

function applyWhatsappText(link) {
  try {
    const url = new URL(link.href);
    url.searchParams.set("text", whatsappText);
    link.href = url.toString();
  } catch {
    // Keep the original link if URL parsing fails.
  }
}

function bindTrackedLinks() {
  for (const link of document.querySelectorAll("[data-whatsapp-link]")) {
    applyWhatsappText(link);
  }
  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-track-event]");
    if (!target) return;
    const eventType = target.dataset.trackEvent || "manual_click";
    sendCampaignEvent(eventType, {
      component: target.dataset.trackComponent || target.textContent.trim().slice(0, 80),
      destination: target.href || target.dataset.trackDestination || "",
    });
  }, { capture: true });
}

campaignContext();
if (!alreadySent("landing_view")) {
  sendCampaignEvent("landing_view", { component: "tecnicos_landing" });
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bindTrackedLinks, { once: true });
} else {
  bindTrackedLinks();
}
