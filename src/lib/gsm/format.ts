// Formateadores del portal AriadGSM.
// Port de `public/portal-modules/format.js`.

/** Montos del negocio siempre en USDT con 2 decimales. */
export function money(value: number | string | null | undefined): string {
  return `${Number(value || 0).toFixed(2)} USDT`;
}

/**
 * Normaliza texto para comparar modelos contra el catálogo de elegibilidad:
 * sin tildes, sin espacios repetidos, en minúsculas.
 */
export function normalizeForMatch(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/** Convierte un monto en USDT a moneda local; devuelve null si no hay tasa. */
export function toLocalCurrency(usdt: number, ratePerUsdt: number): number | null {
  if (!Number.isFinite(ratePerUsdt) || ratePerUsdt <= 0) return null;
  return Math.round(usdt * ratePerUsdt * 100) / 100;
}

/** Formatea un monto local con su código de moneda (ej: "95.00 PEN"). */
export function localMoney(value: number, currency: string): string {
  return `${Number(value || 0).toFixed(2)} ${currency}`;
}
