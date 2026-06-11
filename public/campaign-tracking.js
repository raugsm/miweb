const campaignParamKeys = ["src", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid"];
const campaignStorageKey = "ariadgsm_campaign_context";
const campaignSessionKey = "ariadgsm_campaign_session";
const campaignTtlMs = 30 * 24 * 60 * 60 * 1000;
const whatsappText = "Hola, quiero descargar la app AriadGSM";
const campaignWhatsappText = "Hola, vengo del anuncio de Facebook y quiero descargar la app AriadGSM";
const publicCampaignPaths = new Set(["/", "/descargar", "/manual", "/servicios/motorola-f4", "/servicios/motorola-f4/"]);

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
  const hasUrlParams = Object.keys(urlParams).length > 0;
  const params = hasUrlParams ? urlParams : (stored.params || {});
  const currentUrl = `${window.location.pathname}${window.location.search}`;
  const context = {
    params,
    firstUrl: hasUrlParams ? currentUrl : (stored.firstUrl || currentUrl),
    lastUrl: currentUrl,
    savedAt: Date.now(),
  };
  if (hasUrlParams) writeStoredContext(context);
  return context;
}

function hasCampaignContext(context) {
  return Object.keys(context?.params || {}).length > 0;
}

function campaignPageComponent() {
  if (window.location.pathname === "/manual") return "manual_page";
  if (window.location.pathname === "/servicios/motorola-f4" || window.location.pathname === "/servicios/motorola-f4/") return "motorola_f4_page";
  return "public_landing";
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

function campaignQueryString(context) {
  const params = new URLSearchParams();
  for (const key of campaignParamKeys) {
    const value = context?.params?.[key];
    if (value) params.set(key, value);
  }
  return params.toString();
}

function decorateCampaignLink(link, context) {
  if (!hasCampaignContext(context)) return;
  const href = link.getAttribute("href") || "";
  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
  try {
    const url = new URL(link.href);
    if (url.origin !== window.location.origin || !publicCampaignPaths.has(url.pathname)) return;
    for (const key of campaignParamKeys) {
      const value = context.params?.[key];
      if (value && !url.searchParams.has(key)) url.searchParams.set(key, value);
    }
    link.href = `${url.pathname}${url.search}${url.hash}`;
  } catch {
    // Keep the original link if URL parsing fails.
  }
}

function decorateCampaignLinks(context) {
  for (const link of document.querySelectorAll("a[href]")) {
    decorateCampaignLink(link, context);
  }
}

function sendCampaignEvent(eventType, extra = {}, context = activeCampaignContext) {
  if (!hasCampaignContext(context)) return;
  const payload = {
    eventType,
    sessionId: sessionId(),
    url: `${window.location.pathname}${window.location.search}`,
    referrer: document.referrer || "",
    campaign: context.params || {},
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

function applyWhatsappText(link, context) {
  try {
    const url = new URL(link.href);
    const query = campaignQueryString(context);
    const text = hasCampaignContext(context)
      ? `${campaignWhatsappText}${query ? `\n\nOrigen: ${query}` : ""}`
      : whatsappText;
    url.searchParams.set("text", text);
    link.href = url.toString();
  } catch {
    // Keep the original link if URL parsing fails.
  }
}

function bindTrackedLinks() {
  decorateCampaignLinks(activeCampaignContext);
  for (const link of document.querySelectorAll("[data-whatsapp-link]")) {
    applyWhatsappText(link, activeCampaignContext);
  }
  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-track-event]");
    if (!target) return;
    const eventType = target.dataset.trackEvent || "manual_click";
    sendCampaignEvent(eventType, {
      component: target.dataset.trackComponent || target.textContent.trim().slice(0, 80),
      destination: target.href || target.dataset.trackDestination || "",
    }, activeCampaignContext);
  }, { capture: true });
}

const activeCampaignContext = campaignContext();
if (hasCampaignContext(activeCampaignContext) && !alreadySent("landing_view")) {
  sendCampaignEvent("landing_view", { component: campaignPageComponent() }, activeCampaignContext);
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bindTrackedLinks, { once: true });
} else {
  bindTrackedLinks();
}
