import assert from "node:assert/strict";
import test from "node:test";

import {
  applyFrpJobCancelLegacyState,
  applyFrpJobFinalizeLegacyState,
  applyFrpJobReviewLegacyState,
  applyFrpJobTakeLegacyState,
  applyFrpPaymentReviewLegacyState,
} from "../server/db/postgres-frp-core.js";

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

test("Postgres FRP take moves a ready job into active technician work", () => {
  const takenAt = "2026-05-06T17:00:00.000Z";
  const result = applyFrpJobTakeLegacyState({
    job: {
      id: "55555555-5555-4555-8555-555555555555",
      code: "ORD-20260506-001-1",
      orderId: baseOrder.id,
      status: "LISTO_PARA_TECNICO",
    },
    order: {
      ...baseOrder,
      checklist: {
        priceSent: true,
        paymentValidated: true,
        connectionDataSent: true,
        authorizationConfirmed: true,
      },
      orderStatus: "LISTA_PARA_TECNICO",
    },
    jobs: [
      {
        id: "55555555-5555-4555-8555-555555555555",
        code: "ORD-20260506-001-1",
        orderId: baseOrder.id,
        status: "LISTO_PARA_TECNICO",
      },
    ],
    userId: "44444444-4444-4444-8444-444444444444",
    takenAt,
  });

  assert.equal(result.ok, true);
  assert.equal(result.job.status, "EN_PROCESO");
  assert.equal(result.job.technicianId, "44444444-4444-4444-8444-444444444444");
  assert.equal(result.job.takenAt, takenAt);
  assert.equal(result.auditAction, "FRP_JOB_TAKEN");
  assert.equal(result.publishReason, "frp_job_taken");
});

test("Postgres FRP take rejects when technician already has active work", () => {
  const result = applyFrpJobTakeLegacyState({
    activeJob: {
      id: "66666666-6666-4666-8666-666666666666",
      code: "ORD-20260506-002-1",
      status: "EN_PROCESO",
    },
    job: {
      id: "55555555-5555-4555-8555-555555555555",
      code: "ORD-20260506-001-1",
      status: "LISTO_PARA_TECNICO",
    },
    userId: "44444444-4444-4444-8444-444444444444",
    takenAt: "2026-05-06T17:05:00.000Z",
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
  assert.match(result.error, /Ya tienes un FRP en proceso/);
});

test("Postgres FRP take reports a concurrent technician winner as conflict", () => {
  const result = applyFrpJobTakeLegacyState({
    job: {
      id: "55555555-5555-4555-8555-555555555555",
      code: "ORD-20260506-001-1",
      status: "EN_PROCESO",
      technicianId: "77777777-7777-4777-8777-777777777777",
    },
    userId: "44444444-4444-4444-8444-444444444444",
    takenAt: "2026-05-06T17:10:00.000Z",
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
  assert.equal(result.error, "Otro tecnico ya tomo este job.");
});

test("Postgres FRP finalize closes the job and preserves one generated ARD code", () => {
  const doneAt = "2026-05-06T17:15:00.000Z";
  const result = applyFrpJobFinalizeLegacyState({
    job: {
      id: "55555555-5555-4555-8555-555555555555",
      code: "ORD-20260506-001-1",
      orderId: baseOrder.id,
      status: "EN_PROCESO",
      technicianId: "44444444-4444-4444-8444-444444444444",
    },
    order: {
      ...baseOrder,
      checklist: {
        priceSent: true,
        paymentValidated: true,
        connectionDataSent: true,
        authorizationConfirmed: true,
      },
      orderStatus: "LISTA_PARA_TECNICO",
    },
    jobs: [
      {
        id: "55555555-5555-4555-8555-555555555555",
        code: "ORD-20260506-001-1",
        orderId: baseOrder.id,
        status: "EN_PROCESO",
        technicianId: "44444444-4444-4444-8444-444444444444",
      },
    ],
    userId: "44444444-4444-4444-8444-444444444444",
    userRole: "ATENCION_TECNICA",
    finalLog: "Finalizado por Jack",
    doneAt,
    ardCode: "ARD001-AA",
  });

  assert.equal(result.ok, true);
  assert.equal(result.job.status, "FINALIZADO");
  assert.equal(result.job.finalLog, "Finalizado por Jack");
  assert.equal(result.job.ardCode, "ARD001-AA");
  assert.equal(result.job.doneAt, doneAt);
  assert.equal(result.order.orderStatus, "CERRADA");
  assert.equal(result.auditAction, "FRP_JOB_DONE");
});

test("Postgres FRP cancel manual releases an active job back to the ready queue", () => {
  const canceledAt = "2026-05-06T17:20:00.000Z";
  const result = applyFrpJobCancelLegacyState({
    job: {
      id: "55555555-5555-4555-8555-555555555555",
      code: "ORD-20260506-001-1",
      orderId: baseOrder.id,
      status: "EN_PROCESO",
      technicianId: "44444444-4444-4444-8444-444444444444",
      takenAt: "2026-05-06T17:00:00.000Z",
    },
    order: {
      ...baseOrder,
      checklist: {
        priceSent: true,
        paymentValidated: true,
        connectionDataSent: true,
        authorizationConfirmed: true,
      },
      orderStatus: "LISTA_PARA_TECNICO",
    },
    jobs: [
      {
        id: "55555555-5555-4555-8555-555555555555",
        code: "ORD-20260506-001-1",
        orderId: baseOrder.id,
        status: "EN_PROCESO",
        technicianId: "44444444-4444-4444-8444-444444444444",
      },
    ],
    userId: "44444444-4444-4444-8444-444444444444",
    userRole: "ATENCION_TECNICA",
    reason: "manual",
    note: "Cliente reconecto mal",
    canceledAt,
  });

  assert.equal(result.ok, true);
  assert.equal(result.job.status, "LISTO_PARA_TECNICO");
  assert.equal(result.job.technicianId, "");
  assert.equal(result.job.takenAt, "");
  assert.equal(result.job.canceledAt, canceledAt);
  assert.equal(result.job.cancelReason, "manual");
  assert.equal(result.auditDetail.nextStatus, "LISTO_PARA_TECNICO");
});

test("Postgres FRP review moves an active job into review without snapshot replacement", () => {
  const reviewedAt = "2026-05-06T17:25:00.000Z";
  const result = applyFrpJobReviewLegacyState({
    job: {
      id: "55555555-5555-4555-8555-555555555555",
      code: "ORD-20260506-001-1",
      orderId: baseOrder.id,
      status: "EN_PROCESO",
      technicianId: "44444444-4444-4444-8444-444444444444",
    },
    order: {
      ...baseOrder,
      checklist: {
        priceSent: true,
        paymentValidated: true,
        connectionDataSent: true,
        authorizationConfirmed: true,
      },
      orderStatus: "LISTA_PARA_TECNICO",
    },
    jobs: [
      {
        id: "55555555-5555-4555-8555-555555555555",
        code: "ORD-20260506-001-1",
        orderId: baseOrder.id,
        status: "EN_PROCESO",
        technicianId: "44444444-4444-4444-8444-444444444444",
      },
    ],
    userId: "44444444-4444-4444-8444-444444444444",
    userRole: "ATENCION_TECNICA",
    reason: "Cliente no conectado",
    reviewedAt,
  });

  assert.equal(result.ok, true);
  assert.equal(result.job.status, "REQUIERE_REVISION");
  assert.equal(result.job.reviewReason, "Cliente no conectado");
  assert.equal(result.job.updatedAt, reviewedAt);
  assert.equal(result.order.orderStatus, "LISTA_PARA_TECNICO");
  assert.equal(result.auditAction, "FRP_JOB_REVIEW_REQUIRED");
  assert.equal(result.publishReason, "frp_job_review_required");
});

test("Postgres FRP review rejects stale requests after finalize or cancel wins", () => {
  const result = applyFrpJobReviewLegacyState({
    job: {
      id: "55555555-5555-4555-8555-555555555555",
      code: "ORD-20260506-001-1",
      orderId: baseOrder.id,
      status: "FINALIZADO",
      technicianId: "44444444-4444-4444-8444-444444444444",
    },
    order: baseOrder,
    jobs: [
      {
        id: "55555555-5555-4555-8555-555555555555",
        status: "FINALIZADO",
        technicianId: "44444444-4444-4444-8444-444444444444",
      },
    ],
    userId: "44444444-4444-4444-8444-444444444444",
    userRole: "ADMIN",
    reason: "Click viejo del navegador",
    reviewedAt: "2026-05-06T17:30:00.000Z",
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.match(result.error, /trabajo en proceso/);
});
