const priceList = document.querySelector("#public-price-list");
let priceRefresh = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function flagClass(price) {
  const allowed = new Set(["cl", "co", "mx", "pe", "binance"]);
  const code = String(price.flagCode || "").toLowerCase();
  return allowed.has(code) ? ` price-flag-${code}` : " price-flag-binance";
}

function renderPriceCard(price) {
  const methods = Array.isArray(price.methods) && price.methods.length
    ? price.methods.join(" · ")
    : "Método disponible en la app";
  const unavailableClass = price.available ? "" : " price-card-muted";
  const amount = price.available ? price.amountFormatted : "Consultar";
  const helper = price.available ? `${price.currency} · 1 equipo` : "Por WhatsApp";
  return `
    <article class="price-card${unavailableClass}">
      <div class="price-card-head">
        <span class="price-country-wrap">
          <span class="price-flag${flagClass(price)}" aria-hidden="true"></span>
          <span>
            <span class="price-country">${escapeHtml(price.country)}</span>
            <small class="price-method">${escapeHtml(methods)}</small>
          </span>
        </span>
      </div>
      <strong>${escapeHtml(amount)}</strong>
      <small class="price-helper">${escapeHtml(helper)}</small>
    </article>
  `;
}

async function loadPublicPrices() {
  if (!priceList) return;
  try {
    const response = await fetch("/api/public/frp-prices", {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const prices = payload?.report?.prices || [];
    if (!prices.length) {
      priceList.innerHTML = `<div class="price-loading">Precios no disponibles. Consulta por WhatsApp.</div>`;
      return;
    }
    priceList.innerHTML = prices.map(renderPriceCard).join("");
  } catch {
    priceList.innerHTML = `<div class="price-loading">No se pudieron cargar los precios. Consulta por WhatsApp.</div>`;
  }
}

function schedulePriceRefresh() {
  if (priceRefresh) return;
  priceRefresh = window.setTimeout(() => {
    priceRefresh = null;
    loadPublicPrices();
  }, 250);
}

function startLivePrices() {
  if (!priceList) return;
  if (!window.EventSource) {
    window.setInterval(loadPublicPrices, 60_000);
    return;
  }
  const stream = new EventSource("/api/portal/admin-config/events");
  stream.addEventListener("exchange_rate_changed", schedulePriceRefresh);
  stream.addEventListener("payment_method_toggled", schedulePriceRefresh);
  stream.addEventListener("portal_catalog_changed", (event) => {
    try {
      const payload = JSON.parse(event.data || "{}");
      if (payload.scope && payload.scope !== "frp_pricing") return;
    } catch {
      // If the event payload is malformed, a refresh is safer than stale public pricing.
    }
    schedulePriceRefresh();
  });
}

loadPublicPrices();
startLivePrices();
