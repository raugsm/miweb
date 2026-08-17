const priceList = document.querySelector("#public-price-list");
const miPriceList = document.querySelector("#public-mi-price-list");
const miPriceGroup = document.querySelector("#public-mi-price-group");
const rentalPriceGroups = document.querySelector("#public-rental-price-groups");
const livePriceRefreshMs = 5_000;
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
  const allowed = new Set(["ar", "cl", "co", "ec", "mx", "pe", "ww", "binance"]);
  const code = String(price.flagCode || "").toLowerCase();
  return allowed.has(code) ? ` price-flag-${code}` : " price-flag-binance";
}

function renderPriceCard(price) {
  const methods = Array.isArray(price.methods) && price.methods.length
    ? price.methods.join(" · ")
    : "Método disponible en la app";
  const unavailableClass = price.available ? "" : " price-card-muted";
  const amount = price.available ? price.amountFormatted : "Consultar";
  const unit = price.unitLabel || "1 equipo";
  const helper = price.available ? `${price.currency} · ${unit}` : "Por WhatsApp";
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

function renderPriceGroup(target, prices) {
  if (!target) return;
  if (!prices.length) {
    target.innerHTML = `<div class="price-loading">Precios no disponibles. Consulta por WhatsApp.</div>`;
    return;
  }
  target.innerHTML = prices.map(renderPriceCard).join("");
}

// Un bloque por herramienta activa, con el mismo diseno de tarjetas.
function renderRentalGroups(rentals) {
  if (!rentalPriceGroups) return;
  const usable = rentals.filter((rental) => rental?.name && Array.isArray(rental.prices) && rental.prices.length);
  if (!usable.length) {
    rentalPriceGroups.innerHTML = "";
    return;
  }
  rentalPriceGroups.innerHTML = usable
    .map((rental) => `
      <div class="price-group">
        <h3 class="price-group-title">Alquiler de herramientas - ${escapeHtml(rental.name)}</h3>
        <div class="price-list">${rental.prices.map(renderPriceCard).join("")}</div>
      </div>
    `)
    .join("");
}

async function loadPublicPrices() {
  if (!priceList && !miPriceList) return;
  try {
    const response = await fetch("/api/public/frp-prices", {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const miPrices = payload?.report?.miPrices || [];
    renderPriceGroup(priceList, payload?.report?.prices || []);
    renderPriceGroup(miPriceList, miPrices);
    // Cuentas MI solo aparece si el dashboard tiene sus precios cargados.
    if (miPriceGroup) miPriceGroup.hidden = !miPrices.some((price) => price.available);
    renderRentalGroups(payload?.report?.rentals || []);
  } catch {
    if (priceList) {
      priceList.innerHTML = `<div class="price-loading">No se pudieron cargar los precios. Consulta por WhatsApp.</div>`;
    }
    if (miPriceGroup) miPriceGroup.hidden = true;
    if (rentalPriceGroups) rentalPriceGroups.innerHTML = "";
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
  if (!priceList && !miPriceList) return;
  window.setInterval(schedulePriceRefresh, livePriceRefreshMs);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") schedulePriceRefresh();
  });
}

loadPublicPrices();
startLivePrices();
