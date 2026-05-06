import assert from "node:assert/strict";
import test from "node:test";

import { applyFrpPaymentReviewLegacyState } from "../server/db/postgres-frp-core.js";

const baseOrder = {
  id: "11111111-1111-4111-8111-111111111111",
  code: "ORD-20260506-001",
  checklist: {
    priceSent: true,
    paymentValidated: false,
    connectionDataSent: false,
    authorizationConfirmed: false,
  },
  paymentStatus: "PAGO_EN_VALIDACION",
  orderStatus: "ESPERANDO_PAGO",
  paymentProofs: [],
};

const baseProof = {
  id: "22222222-2222-4222-8222-222222222222",
  reviewStatus: "PENDIENTE",
  uploadedBy: "customer-user",
  uploadedAt: "2026-05-06T15:00:00.000Z",
};

test("Postgres FRP payment review approve updates order, portal lock and proofs atomically", () => {
  const reviewedAt = "2026-05-06T16:00:00.000Z";
  const result = applyFrpPaymentReviewLegacyState({
    order: baseOrder,
    portalOrder: { id: "33333333-3333-4333-8333-333333333333", unitPrice: 4.5 },
    proofs: [baseProof],
    jobs: [{ id: "job-1", status: "ESPERANDO_PREPARACION" }],
    action: "approve",
    userId: "44444444-4444-4444-8444-444444444444",
    reviewedAt,
  });

  assert.equal(result.ok, true);
  assert.equal(result.order.paymentStatus, "COMPROBANTE_RECIBIDO");
  assert.equal(result.order.checklist.paymentValidated, true);
  assert.equal(result.order.orderStatus, "PAGO_VALIDADO");
  assert.equal(result.order.paymentReviewedAt, reviewedAt);
  assert.equal(result.proofs[0].reviewStatus, "VALIDADO");
  assert.equal(result.proofs[0].reviewedAt, reviewedAt);
  assert.equal(result.portalOrder.priceLocked, 4.5);
  assert.equal(result.portalOrder.priceDecisionAction, "");
  assert.equal(result.ledgerAction, "upsert");
  assert.equal(result.auditAction, "FRP_PAYMENT_VALIDATED");
});

test("Postgres FRP payment review reject marks proofs rejected and voids ledger", () => {
  const reviewedAt = "2026-05-06T16:05:00.000Z";
  const result = applyFrpPaymentReviewLegacyState({
    order: {
      ...baseOrder,
      checklist: { ...baseOrder.checklist, paymentValidated: true },
      paymentStatus: "COMPROBANTE_RECIBIDO",
    },
    proofs: [baseProof],
    jobs: [{ id: "job-1", status: "ESPERANDO_PREPARACION" }],
    action: "reject",
    reason: "Imagen borrosa",
    userId: "44444444-4444-4444-8444-444444444444",
    reviewedAt,
  });

  assert.equal(result.ok, true);
  assert.equal(result.order.paymentStatus, "COMPROBANTE_RECHAZADO");
  assert.equal(result.order.checklist.paymentValidated, false);
  assert.equal(result.order.orderStatus, "ESPERANDO_PAGO");
  assert.equal(result.order.paymentRejectedReason, "Imagen borrosa");
  assert.equal(result.proofs[0].reviewStatus, "RECHAZADO");
  assert.equal(result.ledgerAction, "void");
  assert.equal(result.auditAction, "FRP_PAYMENT_REJECTED");
});

test("Postgres FRP payment review rejects missing proofs before mutation", () => {
  const result = applyFrpPaymentReviewLegacyState({
    order: baseOrder,
    proofs: [],
    action: "approve",
    userId: "44444444-4444-4444-8444-444444444444",
    reviewedAt: "2026-05-06T16:10:00.000Z",
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
});
