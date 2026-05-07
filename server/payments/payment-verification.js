export const paymentVerificationVersion = "payment-verification-shadow-v1";

export const paymentVerificationDecisions = Object.freeze({
  needsReview: "NEEDS_REVIEW",
  blockedNoProof: "BLOCKED_NO_PROOF",
});

function moneyNumber(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 100) / 100;
}

function stringValue(value) {
  return value === undefined || value === null ? "" : String(value);
}

function generatedAtValue(now) {
  if (typeof now === "function") return stringValue(now());
  if (now) return stringValue(now);
  return new Date().toISOString();
}

export function buildPaymentVerificationContext({ order = {}, proofs = [] } = {}) {
  return {
    amountUsdt: moneyNumber(order.totalPrice || order.price || 0),
    currency: "USDT",
    quantity: Number.parseInt(order.quantity, 10) || 1,
    paymentMethod: stringValue(order.paymentMethod),
    paymentLabel: stringValue(order.paymentLabel),
    proofCount: Array.isArray(proofs) ? proofs.length : 0,
  };
}

export function assessPaymentProofsForAutomation({
  order = {},
  proofs = [],
  source = "unknown",
  now = null,
} = {}) {
  const context = buildPaymentVerificationContext({ order, proofs });
  const hasProof = context.proofCount > 0;

  return {
    version: paymentVerificationVersion,
    mode: "shadow",
    decision: hasProof ? paymentVerificationDecisions.needsReview : paymentVerificationDecisions.blockedNoProof,
    confidence: 0,
    autoReviewAllowed: false,
    generatedAt: generatedAtValue(now),
    source: stringValue(source || "unknown"),
    proofCount: context.proofCount,
    expected: {
      amountUsdt: context.amountUsdt,
      currency: context.currency,
      quantity: context.quantity,
      paymentMethod: context.paymentMethod,
      paymentLabel: context.paymentLabel,
    },
    reasons: hasProof
      ? ["shadow_mode", "ai_provider_not_configured", "manual_review_required"]
      : ["missing_payment_proof"],
  };
}
