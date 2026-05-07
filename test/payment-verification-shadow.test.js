import assert from "node:assert/strict";
import test from "node:test";

import {
  assessPaymentProofsForAutomation,
  buildPaymentVerificationContext,
  paymentVerificationDecisions,
  paymentVerificationVersion,
} from "../server/payments/payment-verification.js";

test("payment verification shadow context keeps only sanitized payment facts", () => {
  const context = buildPaymentVerificationContext({
    order: {
      totalPrice: "9.1",
      quantity: "2",
      paymentMethod: "USDT_TRC20",
      paymentLabel: "USDT TRC20",
    },
    proofs: [{ name: "proof.png", dataUrl: "data:image/png;base64,abc" }],
  });

  assert.deepEqual(context, {
    amountUsdt: 9.1,
    currency: "USDT",
    quantity: 2,
    paymentMethod: "USDT_TRC20",
    paymentLabel: "USDT TRC20",
    proofCount: 1,
  });
});

test("payment verification shadow never auto-approves a proof", () => {
  const result = assessPaymentProofsForAutomation({
    order: {
      totalPrice: 4.55,
      quantity: 1,
      paymentMethod: "PE_YAPE_BRYAMS",
      paymentLabel: "Yape",
    },
    proofs: [{ name: "proof.png", hash: "abc" }],
    source: "portal_reupload",
    now: "2026-05-07T01:00:00.000Z",
  });

  assert.equal(result.version, paymentVerificationVersion);
  assert.equal(result.mode, "shadow");
  assert.equal(result.decision, paymentVerificationDecisions.needsReview);
  assert.equal(result.autoReviewAllowed, false);
  assert.equal(result.confidence, 0);
  assert.equal(result.generatedAt, "2026-05-07T01:00:00.000Z");
  assert.equal(result.proofCount, 1);
  assert.deepEqual(result.reasons, ["shadow_mode", "ai_provider_not_configured", "manual_review_required"]);
  assert.deepEqual(result.expected, {
    amountUsdt: 4.55,
    currency: "USDT",
    quantity: 1,
    paymentMethod: "PE_YAPE_BRYAMS",
    paymentLabel: "Yape",
  });
  assert.equal(Object.hasOwn(result, "dataUrl"), false);
});

test("payment verification shadow blocks empty proof assessment", () => {
  const result = assessPaymentProofsForAutomation({
    order: { totalPrice: 4.55 },
    proofs: [],
    now: "2026-05-07T01:00:00.000Z",
  });

  assert.equal(result.decision, paymentVerificationDecisions.blockedNoProof);
  assert.equal(result.autoReviewAllowed, false);
  assert.deepEqual(result.reasons, ["missing_payment_proof"]);
});
