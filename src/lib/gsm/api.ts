// Cliente HTTP del portal AriadGSM.
//
// Port de `public/portal-modules/api.js`. La sesión del cliente viaja en cookies
// (`ariad_customer_session` / `ariad_customer_device`), por eso `credentials:
// "same-origin"` es obligatorio en toda llamada.

import type {
  ActiveTechnician,
  CustomerOrder,
  CustomerState,
  GuestState,
  PortalSession,
  PriceSuggestion,
} from "./types";

/** Error de API que conserva el status HTTP para decidir en el llamador. */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function api<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = (payload as { error?: string }).error || "No se pudo completar la acción.";
    throw new ApiError(message, response.status);
  }
  return payload as T;
}

// ---------------------------------------------------------------------------
// Sesión y cuenta
// ---------------------------------------------------------------------------

export function fetchSession() {
  return api<PortalSession>("/api/portal/session");
}

export function login(email: string, password: string) {
  return api<{ customer: CustomerState }>("/api/portal/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  whatsapp: string;
  country: string;
  turnstileToken?: string;
}

export function register(input: RegisterInput) {
  return api<{ customer: CustomerState; message?: string }>("/api/portal/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function logout() {
  return api<Record<string, unknown>>("/api/portal/logout", { method: "POST", body: "{}" });
}

export function verifyEmail(token: string) {
  return api<{ message?: string }>("/api/portal/verify-email", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export function resendVerification() {
  return api<{ message?: string }>("/api/portal/resend-verification", {
    method: "POST",
    body: "{}",
  });
}

// ---------------------------------------------------------------------------
// Cotización y órdenes
// ---------------------------------------------------------------------------

export interface QuoteInput {
  quantity: number;
  paymentMethod?: string;
}

export function fetchQuote(input: QuoteInput) {
  const params = new URLSearchParams({ quantity: String(input.quantity) });
  if (input.paymentMethod) params.set("paymentMethod", input.paymentMethod);
  return api<PriceSuggestion>(`/api/portal/frp-quote?${params.toString()}`);
}

export interface ProofUpload {
  name: string;
  type: string;
  /** Data URL base64; el backend calcula SHA-256 y bloquea duplicados. */
  dataUrl: string;
}

export interface CreateOrderInput {
  quantity: number;
  paymentMethod: string;
  items?: Array<{ model?: string; imei?: string }>;
  paymentProofs?: ProofUpload[];
  turnstileToken?: string;
}

/**
 * Crea la orden FRP. Decisión D1 (sesión 15b.2): la orden NACE acá, al subir
 * el comprobante en el panel 3 — no al apretar "Equipo conectado".
 */
export function createOrder(input: CreateOrderInput) {
  return api<{ customer: CustomerState; order?: CustomerOrder }>("/api/portal/orders/frp", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** Compatibilidad: el botón dejó de ser umbral operativo (sesión 24, corte 5). */
export function notifyConnected(orderId: string) {
  return api<{ customer: CustomerState }>(`/api/portal/orders/${orderId}/notify-connected`, {
    method: "POST",
    body: "{}",
  });
}

export function uploadPaymentProof(orderId: string, proofs: ProofUpload[]) {
  return api<{ customer: CustomerState }>(`/api/portal/orders/${orderId}/payment-proof`, {
    method: "PATCH",
    body: JSON.stringify({ paymentProofs: proofs }),
  });
}

/** Decisión del cliente cuando el precio subió tras vencer el lock. */
export function decidePrice(orderId: string, action: "pay-difference" | "wait" | "cancel") {
  return api<{ customer: CustomerState }>(`/api/portal/orders/${orderId}/price-decision`, {
    method: "POST",
    body: JSON.stringify({ action }),
  });
}

export function fetchActiveTechnician() {
  return api<ActiveTechnician>("/api/portal/active-technician");
}

// ---------------------------------------------------------------------------
// Flujo invitado (sin cuenta)
// ---------------------------------------------------------------------------

export function fetchGuestState() {
  return api<GuestState>("/api/portal/guest/state");
}

export function claimGuestOrders() {
  return api<{ customer: CustomerState; claimed?: number }>("/api/portal/guest/claim", {
    method: "POST",
    body: "{}",
  });
}
