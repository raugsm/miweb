async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json()
    : await response.text();
  if (!response.ok) {
    const error = new Error(data?.error || "Solicitud fallida.");
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

export function fetchBootstrap({ countryIso = "", quantity = 1, paymentMethod = "" } = {}) {
  const params = new URLSearchParams();
  if (countryIso) params.set("country", countryIso);
  if (quantity) params.set("quantity", String(quantity));
  if (paymentMethod) params.set("paymentMethod", paymentMethod);
  const query = params.toString();
  return api(`/api/xiaomi-frp/bootstrap${query ? `?${query}` : ""}`);
}

export function createOrder(payload) {
  return api("/api/xiaomi-frp/orders", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fetchOrder(code, token) {
  return api(`/api/xiaomi-frp/orders/${encodeURIComponent(code)}?t=${encodeURIComponent(token)}`);
}

export function uploadPaymentProof(code, token, proof) {
  return api(`/api/xiaomi-frp/orders/${encodeURIComponent(code)}/payment-proof?t=${encodeURIComponent(token)}`, {
    method: "POST",
    body: JSON.stringify({ proof }),
  });
}

export function requestCodeRecovery(payload) {
  return api("/api/xiaomi-frp/recover-code", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function openOrderEvents(code, token, onOrder, onError) {
  const url = `/api/xiaomi-frp/orders/${encodeURIComponent(code)}/events?t=${encodeURIComponent(token)}`;
  const events = new EventSource(url);
  events.addEventListener("order", (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (payload?.order) onOrder(payload.order);
    } catch {
      onError?.("No se pudo leer el evento del pedido.");
    }
  });
  events.onerror = () => onError?.("Reconectando seguimiento en vivo...");
  return events;
}

export function proofFromFile(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type || "")) {
      reject(new Error("Sube una imagen del comprobante."));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer el comprobante."));
    reader.onload = () => resolve({
      name: file.name || "comprobante.jpg",
      type: file.type || "image/jpeg",
      size: file.size || 0,
      dataUrl: String(reader.result || ""),
    });
    reader.readAsDataURL(file);
  });
}
