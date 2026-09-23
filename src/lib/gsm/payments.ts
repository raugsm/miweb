// Lógica pura de métodos de pago del portal.
// Port de la parte no-DOM de `public/portal-modules/payments.js`.

import type { ExchangeRate, PaymentMethod } from "./types";

/**
 * Orden FIJO de las pills del panel 1 (spec panel-1 v2.0 §1):
 * Perú · USDT · México arriba, Colombia · Chile · vacío abajo.
 * El orden NO se reordena según el país del cliente.
 */
export interface PillSlot {
  country: string;
  label: string;
  primaryCode: string;
}

export const PANEL_1_PILL_SLOTS: PillSlot[] = [
  { country: "Peru", label: "Perú", primaryCode: "PE_YAPE_BRYAMS" },
  { country: "Global", label: "USDT", primaryCode: "BINANCE_PAY" },
  { country: "Mexico", label: "México", primaryCode: "MX_STP" },
  { country: "Colombia", label: "Colombia", primaryCode: "CO_BANCOLOMBIA_AHORROS" },
  { country: "Chile", label: "Chile", primaryCode: "CL_MERCADO_PAGO" },
];

const LAST_PILL_KEY = "ariad_lastPill";

export function readLastSelectedPill(): string {
  try {
    const raw = localStorage.getItem(LAST_PILL_KEY);
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    return typeof parsed?.code === "string" ? parsed.code : "";
  } catch {
    return "";
  }
}

export function writeLastSelectedPill(code: string): void {
  if (!code) return;
  try {
    localStorage.setItem(
      LAST_PILL_KEY,
      JSON.stringify({ code, timestamp: new Date().toISOString() }),
    );
  } catch {
    // Modo privado o sin cuota: la persistencia es nice-to-have.
  }
}

export function clearLastSelectedPill(): void {
  try {
    localStorage.removeItem(LAST_PILL_KEY);
  } catch {
    // ídem.
  }
}

/** Método del catálogo para un slot: primero por código, si no el primero del país. */
export function paymentForSlot(slot: PillSlot, methods: PaymentMethod[]): PaymentMethod | null {
  const byCode = methods.find((method) => method.code === slot.primaryCode);
  if (byCode) return byCode;
  return methods.find((method) => method.country === slot.country) || null;
}

/**
 * Resuelve qué pill queda seleccionada:
 *   1. la actual si sigue siendo válida
 *   2. la recordada en localStorage
 *   3. la del país del perfil del cliente
 *   4. la primera disponible
 */
export function resolveSelectedPayment(options: {
  current: string;
  available: string[];
  remembered: string;
  profileCountry: string;
  slots: Array<{ country: string; payment: PaymentMethod | null }>;
}): string {
  const { current, available, remembered, profileCountry, slots } = options;
  if (current && available.includes(current)) return current;
  if (remembered && available.includes(remembered)) return remembered;
  const profileSlot = slots.find((slot) => slot.payment && slot.country === profileCountry);
  if (profileSlot?.payment) return profileSlot.payment.code;
  return available[0] || "";
}

function currencyOf(payment: PaymentMethod | null): string {
  return (payment as { currency?: string } | null)?.currency || "USDT";
}

function amountModeOf(payment: PaymentMethod | null): string {
  return (payment as { amountMode?: string } | null)?.amountMode || "";
}

export function exchangeRateFor(payment: PaymentMethod | null, rates: ExchangeRate[]): number {
  const currency = currencyOf(payment);
  if (!currency || currency === "USDT") return 1;
  const rate = rates.find((candidate) => candidate.currency === currency);
  return Number(rate?.ratePerUsdt || 0);
}

/** Monto en la moneda del método; null si falta la tasa de cambio. */
export function amountInPaymentCurrency(
  usdt: number,
  payment: PaymentMethod | null,
  rates: ExchangeRate[],
): number | null {
  const amount = Number(usdt || 0);
  if (!Number.isFinite(amount)) return 0;
  if (!payment || currencyOf(payment) === "USDT") return amount;
  const rate = exchangeRateFor(payment, rates);
  return rate > 0 ? amount * rate : null;
}

/** Redondeo final: a centenas para monedas "thousands" (COP/CLP), si no a un decimal. */
export function roundFinalAmount(value: number, payment: PaymentMethod | null): number {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (amountModeOf(payment) === "thousands") return Math.round(amount / 100) * 100;
  return Math.round((amount + Number.EPSILON) * 10) / 10;
}

/** Texto final del monto, con el símbolo y formato de cada plaza. */
export function paymentAmountText(
  usdt: number,
  payment: PaymentMethod | null,
  rates: ExchangeRate[],
): string {
  const raw = amountInPaymentCurrency(usdt, payment, rates);
  const currency = currencyOf(payment);
  if (raw === null) return `Tasa pendiente ${currency}`.trim();
  if (!Number.isFinite(raw)) return "";
  const amount = roundFinalAmount(raw, payment);
  if (amountModeOf(payment) === "thousands") {
    return `${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(Math.round(amount))} ${currency}`;
  }
  if (currency === "PEN") return `S/ ${amount.toFixed(2)}`;
  if (currency === "USDT") return `${amount.toFixed(2)} USDT`;
  if (currency === "MXN") return `$${amount.toFixed(2)} MXN`;
  return `$${amount.toFixed(2)} ${currency || "USD"}`;
}

/** Métodos compatibles con el país del cliente: locales primero, luego globales. */
export function compatibleMethodsFor(methods: PaymentMethod[], country: string): PaymentMethod[] {
  if (!country) return methods;
  const local = methods.filter((method) => method.country === country);
  const global = methods.filter((method) => method.globalOption);
  const others = methods.filter((method) => method.country !== country && !method.globalOption);
  return [...local, ...global, ...others];
}
