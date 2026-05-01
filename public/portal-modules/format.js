export function money(value) {
  return `${Number(value || 0).toFixed(2)} USDT`;
}

export function normalizeForMatch(value) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}
