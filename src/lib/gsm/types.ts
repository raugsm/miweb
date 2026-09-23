// Tipos del dominio AriadGSM (portal cliente).
//
// Fuente de verdad: `server/portal/serializers.js` (publicCustomerState,
// publicCustomerOrder, publicPortalCatalog). Si el backend cambia una forma,
// se actualiza acá primero y TypeScript marca los usos rotos.

/** Estado público de una orden, visible para el cliente. */
export type PublicOrderStatus =
  | "SOLICITUD_RECIBIDA"
  | "REVISION_COMPATIBILIDAD"
  | "ESPERANDO_PAGO"
  | "PAGO_EN_REVISION"
  | "PAGO_RECHAZADO"
  | "EN_PREPARACION"
  | "LISTO_PARA_CONEXION"
  | "EN_PROCESO"
  | "FINALIZADO"
  | "REQUIERE_ATENCION"
  | "POSTPAGO_SOLICITADO"
  | "CANCELADO";

/** Estado derivado que ve el operador (colores del panel). */
export type OperatorOrderStatus =
  | "AI_REVIEWING"
  | "PAYMENT_REJECTED"
  | "PAYMENT_APPROVED"
  | "NO_CONNECTION"
  | "IN_PROCESS"
  | "NEEDS_ATTENTION"
  | "FINISHED";

/** Estado de un job FRP individual (un equipo). */
export type JobStatus =
  | "ESPERANDO_PREPARACION"
  | "LISTO_PARA_TECNICO"
  | "EN_PROCESO"
  | "FINALIZADO"
  | "REQUIERE_REVISION"
  | "ESPERANDO_CLIENTE"
  | "CANCELADO";

export type CustomerStatus =
  | "REGISTRADO_NO_VERIFICADO"
  | "EMAIL_VERIFICADO"
  | "REGISTRADO"
  | "VERIFICADO"
  | "VIP"
  | "EMPRESA"
  | "BLOQUEADO";

export type EligibilityStatus = "APTO_EXPRESS" | "REQUIERE_REVISION" | "NO_APTO_MODO";

/**
 * Fase del flujo del cliente derivada de sus órdenes activas.
 * Ver `deriveFlowState`. Gobierna el congelado de los paneles 1-2-3.
 */
export type FlowState = "draft" | "in_review" | "rejected" | "connected";

export interface CustomerUser {
  id: string;
  clientId: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  createdAt: string;
}

export interface CustomerClient {
  id: string;
  masterClientId: string;
  name: string;
  whatsapp: string;
  country: string;
  status: CustomerStatus;
  emailVerified: boolean;
  emailVerifiedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerDevice {
  id: string;
  authorizedForBenefits: boolean;
  createdAt: string;
  lastSeenAt: string;
}

export interface CustomerBenefit {
  masterClientId: string;
  quantityDiscountEnabled: boolean;
  monthlyDiscountEnabled: boolean;
  goalDiscountEnabled: boolean;
  monthlyGoal: number;
  /** VIP se expresa como margen sobre el costo del proveedor, no como precio. */
  vipUnitMargin: number;
  /** costo interno + vipUnitMargin, ya computado por el backend. */
  vipEffectiveUnitPrice: number;
  deviceRequired: boolean;
  usableNow: boolean;
}

export interface OrderActivityEvent {
  at: string;
  label: string;
  /** Los eventos del cliente se marcan con "(vos)" al renderizar. */
  actor: "tech" | "customer";
  inProgress?: boolean;
}

export interface OrderItem {
  id: string;
  sequence: number;
  model: string;
  imei: string;
  status: JobStatus;
  ardCode: string;
  shortCode: string;
  finalLog: string;
  readyAt: string;
  takenAt: string;
  doneAt: string;
  canceledAt: string;
  cancelReason: string;
  eligibilityStatus: EligibilityStatus | "";
  eligibilityMessage: string;
  reviewReason: string;
}

export interface PaymentProofMeta {
  id: string;
  name: string;
  type: string;
  size: number;
  createdAt: string;
}

export interface PaymentVerification {
  version: string;
  mode: string;
  decision: string;
  confidence: number;
  autoReviewAllowed: boolean;
  generatedAt: string;
  source: string;
  proofCount: number;
  reasons: string[];
}

export interface MonthlyTier {
  minJobs: number;
  unitPrice?: number;
  label?: string;
  remaining?: number;
}

export interface CustomerOrder {
  id: string;
  code: string;
  /** Código corto operativo (ARD-0001). El operador trabaja con este. */
  shortCode: string;
  serviceCode: string;
  serviceName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  priceFormatted: string;
  discountLabel: string;
  discountLocked: boolean;
  frpOrderId: string;
  monthlyUsageAtCreation: number;
  nextMonthlyTier: MonthlyTier | null;
  paymentMethod: string;
  paymentLabel: string;
  paymentDetails: string[];
  publicStatus: PublicOrderStatus;
  operatorStatus: OperatorOrderStatus;
  paymentRejectedReason: string;
  nextAction: string;
  technicianId: string;
  redirectorId: string;
  customerConnectionReadyAt: string;
  customerConnectedAt: string;
  paymentReviewedAt: string;
  paymentApprovedAt: string;
  noConnectionAlertAt: string;
  priceRevalidationStatus: string;
  activityLog: OrderActivityEvent[];
  /** Precio congelado al aprobar el pago (lock de 15 min con renovación). */
  priceLocked: number;
  priceLockedAt: string;
  priceLockExpiresAt: string;
  priceDecisionAction: string;
  priceDecisionAt: string;
  priceDecisionWaitUntil: string;
  /** Lo que costaría la orden hoy; si supera a priceLocked hay que decidir. */
  currentUnitPrice: number;
  urgentRequested: boolean;
  urgentStatus: string;
  postpayRequested: boolean;
  postpayStatus: string;
  paymentVerification: PaymentVerification | null;
  paymentProofs: PaymentProofMeta[];
  items: OrderItem[];
  createdAt: string;
  updatedAt: string;
}

/** Respuesta de `GET /api/portal/session` → campo `customer`. */
export interface CustomerState {
  user: CustomerUser | null;
  client: CustomerClient | null;
  device: CustomerDevice | null;
  benefit: CustomerBenefit | null;
  monthlyUsage: number;
  nextMonthlyTier: MonthlyTier | null;
  orders: CustomerOrder[];
  pendingDebtUsdt: number;
}

export interface PaymentMethodField {
  label: string;
  value: string;
}

export interface PaymentMethod {
  code: string;
  label: string;
  displayName?: string;
  country: string;
  ticketOption: boolean;
  globalOption: boolean;
  details: string[];
  logo?: string;
  fields?: PaymentMethodField[];
  qrImageUrl?: string;
  alternativeAccountKey?: string;
  /** Overrides del admin (sub-commit 15a.2), llegan en vivo por SSE. */
  active?: boolean;
  customMessage?: string;
}

export interface PortalService {
  code: string;
  name: string;
  internalServiceCode: string;
  enabled: boolean;
  baseUnitPrice?: number;
}

export interface ExchangeRate {
  country: string;
  currency: string;
  ratePerUsdt: number;
  updatedAt: string;
}

export interface EligibilityHint {
  key: string;
  publicName: string;
  aliases: string[];
  status: EligibilityStatus;
  publicMessage: string;
}

export interface PortalPricing {
  available: boolean;
  baseUnitPriceUsdt?: number;
  operatorFeePerOrderUsdt?: number;
  guestSurchargePerEquipmentUsdt?: number;
}

export interface PhoneCountryHint {
  country: string;
  code: string;
  example?: string;
}

/** Respuesta de `GET /api/portal/session` → campo `catalog`. */
export interface PortalCatalog {
  services: PortalService[];
  paymentMethods: PaymentMethod[];
  countries: string[];
  statuses: string[];
  pricing: PortalPricing;
  /** Vacíos desde pricing v2: los tiers por volumen fueron eliminados. */
  quantityTiers: never[];
  monthlyTiers: never[];
  exchangeRates: ExchangeRate[];
  phoneCountries: PhoneCountryHint[];
  turnstileEnabled: boolean;
  turnstileSiteKey: string;
  customerModuleUrl: string;
  eligibilityHints: EligibilityHint[];
}

export interface PortalSession {
  customer: CustomerState;
  catalog: PortalCatalog;
}

/** Estado del flujo invitado (sin cuenta). */
export interface GuestState {
  token?: string;
  whatsapp?: string;
  country?: string;
  orders?: CustomerOrder[];
  [key: string]: unknown;
}

export interface ActiveTechnician {
  technicianId: string;
  name?: string;
  swapInProgress?: boolean;
}

/** Cotización devuelta por el backend para la orden en armado. */
export interface PriceSuggestion {
  available: boolean;
  unitPrice: number;
  totalPrice: number;
  priceFormatted?: string;
  discountLabel?: string;
  internalCostUsdt?: number;
  operatorFeePerOrderUsdt?: number;
  guestSurchargePerEquipmentUsdt?: number;
}
