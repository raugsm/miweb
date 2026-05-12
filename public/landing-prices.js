const priceList = document.querySelector("#public-price-list");

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderPriceCard(price) {
  const methods = Array.isArray(price.methods) && price.methods.length
    ? price.methods.join(" · ")
    : "Método disponible en la app";
  const unavailableClass = price.available ? "" : " price-card-muted";
  return `
    <article class="price-card${unavailableClass}">
      <div>
        <span class="price-country">${escapeHtml(price.country)}</span>
        <strong>${escapeHtml(price.amountFormatted)}</strong>
      </div>
      <p>${escapeHtml(methods)}</p>
      <small>${escapeHtml(price.currency)} · ${escapeHtml(price.priceUsdt?.toFixed ? price.priceUsdt.toFixed(2) : price.priceUsdt)} USDT base</small>
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

loadPublicPrices();
