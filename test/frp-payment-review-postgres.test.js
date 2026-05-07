import assert from "node:assert/strict";
import test from "node:test";

import {
  applyFrpJobCancelLegacyState,
  applyFrpJobDirectFinalizeLegacyState,
  applyFrpJobFinalizeLegacyState,
  applyFrpJobReadyLegacyState,
  applyFrpJobReviewLegacyState,
  applyFrpJobTakeLegacyState,
  applyFrpPaymentReviewLegacyState,
} from "../server/db/postgres-frp-core.js";
import { createFrpSerializers } from "../server/frp/serializers.js";

function createTestFrpSerializers() {
  return createFrpSerializers({
    canUseFrp: () => true,
    frpJobStatuses: [
      { code: "ESPERANDO_PREPARACION" },
      { code: "LISTO_PARA_TECNICO" },
      { code: "EN_PROCESO" },
      { code: "REQUIERE_REVISION" },
      { code: "FINALIZADO" },
      { code: "CANCELADO" },
    ],
    frpOrderStatuses: [],
    frpWorkChannel: "WHATSAPP_3",
    limaDateStamp: (value = new Date().toISOString()) => String(value || new Date().toISOString()).slice(0, 10),
    publicFrpPricingState: () => ({ available: true }),
  });
}

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

test("Postgres FRP direct finalize closes an approved untaken job and customer item", () => {
  const doneAt = "2026-05-06T17:16:00.000Z";
  const result = applyFrpJobDirectFinalizeLegacyState({
    job: {
      id: "55555555-5555-4555-8555-555555555555",
      code: "ORD-20260506-001-1",
      orderId: baseOrder.id,
      sequence: 1,
      status: "ESPERANDO_PREPARACION",
      technicianId: "",
      portalOrderItemId: "item-1",
    },
    order: {
      ...baseOrder,
      checklist: {
        priceSent: true,
        paymentValidated: true,
        connectionDataSent: false,
        authorizationConfirmed: false,
      },
      paymentStatus: "COMPROBANTE_RECIBIDO",
      orderStatus: "PAGO_VALIDADO",
    },
    jobs: [
      {
        id: "55555555-5555-4555-8555-555555555555",
        code: "ORD-20260506-001-1",
        orderId: baseOrder.id,
        sequence: 1,
        status: "ESPERANDO_PREPARACION",
      },
    ],
    portalItem: { id: "item-1", status: "PENDIENTE", sequence: 1 },
    portalOrder: { id: "portal-1", publicStatus: "EN_PREPARACION" },
    userId: "44444444-4444-4444-8444-444444444444",
    userRole: "ATENCION_TECNICA",
    finalLog: "Finalizado directo por Jack",
    doneAt,
    ardCode: "ARD002-AB",
  });

  assert.equal(result.ok, true);
  assert.equal(result.job.status, "FINALIZADO");
  assert.equal(result.job.technicianId, "44444444-4444-4444-8444-444444444444");
  assert.equal(result.job.doneAt, doneAt);
  assert.equal(result.job.ardCode, "ARD002-AB");
  assert.equal(result.portalItem.status, "FINALIZADO");
  assert.equal(result.portalItem.doneAt, doneAt);
  assert.equal(result.portalOrder.publicStatus, "FINALIZADO");
  assert.equal(result.auditAction, "FRP_JOB_DIRECT_DONE");
  assert.equal(result.publishReason, "frp_order_done");
});

test("Postgres FRP direct finalize assigns an untaken approved job to the closing operator", () => {
  const doneAt = "2026-05-06T17:16:20.000Z";
  const result = applyFrpJobDirectFinalizeLegacyState({
    job: {
      id: "job-available",
      code: "ORD-20260506-007-1",
      orderId: baseOrder.id,
      sequence: 1,
      status: "ESPERANDO_PREPARACION",
      technicianId: "",
    },
    order: {
      ...baseOrder,
      checklist: { ...baseOrder.checklist, paymentValidated: true },
      paymentStatus: "COMPROBANTE_RECIBIDO",
      orderStatus: "PAGO_VALIDADO",
    },
    jobs: [
      {
        id: "job-available",
        code: "ORD-20260506-007-1",
        orderId: baseOrder.id,
        sequence: 1,
        status: "ESPERANDO_PREPARACION",
        technicianId: "",
      },
    ],
    userId: "88888888-8888-4888-8888-888888888888",
    userRole: "ATENCION_TECNICA",
    doneAt,
  });

  assert.equal(result.ok, true);
  assert.equal(result.job.status, "FINALIZADO");
  assert.equal(result.job.technicianId, "88888888-8888-4888-8888-888888888888");
});

test("Postgres FRP direct finalize accepts approved legacy pending jobs without strict ready status", () => {
  const doneAt = "2026-05-06T17:16:22.000Z";
  const cases = [
    { label: "empty-status", status: "" },
    { label: "waiting-customer", status: "ESPERANDO_CLIENTE" },
  ];

  for (const candidate of cases) {
    const result = applyFrpJobDirectFinalizeLegacyState({
      job: {
        id: `job-${candidate.label}`,
        code: `ORD-20260506-${candidate.label}-1`,
        orderId: baseOrder.id,
        sequence: 1,
        status: candidate.status,
        technicianId: "",
      },
      order: {
        ...baseOrder,
        checklist: { ...baseOrder.checklist, paymentValidated: true },
        paymentStatus: "COMPROBANTE_RECIBIDO",
        orderStatus: "PAGO_VALIDADO",
      },
      jobs: [
        {
          id: `job-${candidate.label}`,
          code: `ORD-20260506-${candidate.label}-1`,
          orderId: baseOrder.id,
          sequence: 1,
          status: candidate.status,
          technicianId: "",
        },
      ],
      userId: "88888888-8888-4888-8888-888888888888",
      userRole: "ATENCION_TECNICA",
      doneAt,
    });

    assert.equal(result.ok, true, candidate.label);
    assert.equal(result.job.status, "FINALIZADO", candidate.label);
    assert.equal(result.job.technicianId, "88888888-8888-4888-8888-888888888888", candidate.label);
  }
});

test("Postgres FRP direct finalize still rejects a job owned by another operator", () => {
  const result = applyFrpJobDirectFinalizeLegacyState({
    job: {
      id: "job-owned",
      code: "ORD-20260506-008-1",
      orderId: baseOrder.id,
      sequence: 1,
      status: "EN_PROCESO",
      technicianId: "77777777-7777-4777-8777-777777777777",
    },
    order: {
      ...baseOrder,
      checklist: { ...baseOrder.checklist, paymentValidated: true },
      paymentStatus: "COMPROBANTE_RECIBIDO",
      orderStatus: "PAGO_VALIDADO",
    },
    jobs: [
      {
        id: "job-owned",
        code: "ORD-20260506-008-1",
        orderId: baseOrder.id,
        sequence: 1,
        status: "EN_PROCESO",
        technicianId: "77777777-7777-4777-8777-777777777777",
      },
    ],
    userId: "88888888-8888-4888-8888-888888888888",
    userRole: "ATENCION_TECNICA",
    doneAt: "2026-05-06T17:16:25.000Z",
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.match(result.error, /otro tecnico/i);
});

test("Postgres FRP direct finalize enforces sequential multi-device processing", () => {
  const result = applyFrpJobDirectFinalizeLegacyState({
    job: {
      id: "job-2",
      code: "ORD-20260506-023-2",
      orderId: baseOrder.id,
      sequence: 2,
      status: "ESPERANDO_PREPARACION",
    },
    order: {
      ...baseOrder,
      checklist: { ...baseOrder.checklist, paymentValidated: true },
      paymentStatus: "COMPROBANTE_RECIBIDO",
      orderStatus: "PAGO_VALIDADO",
    },
    jobs: [
      { id: "job-1", code: "ORD-20260506-023-1", orderId: baseOrder.id, sequence: 1, status: "ESPERANDO_PREPARACION" },
      { id: "job-2", code: "ORD-20260506-023-2", orderId: baseOrder.id, sequence: 2, status: "ESPERANDO_PREPARACION" },
    ],
    userId: "44444444-4444-4444-8444-444444444444",
    userRole: "ATENCION_TECNICA",
    doneAt: "2026-05-06T17:16:30.000Z",
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
  assert.match(result.error, /equipo anterior/);
});

test("Postgres FRP direct finalize is idempotent after a job is already done", () => {
  const result = applyFrpJobDirectFinalizeLegacyState({
    job: {
      id: "job-1",
      code: "ORD-20260506-023-1",
      orderId: baseOrder.id,
      sequence: 1,
      status: "FINALIZADO",
      ardCode: "ARD003-AC",
    },
    order: {
      ...baseOrder,
      checklist: { ...baseOrder.checklist, paymentValidated: true },
      paymentStatus: "COMPROBANTE_RECIBIDO",
      orderStatus: "CERRADA",
    },
    jobs: [{ id: "job-1", code: "ORD-20260506-023-1", orderId: baseOrder.id, sequence: 1, status: "FINALIZADO" }],
    userId: "44444444-4444-4444-8444-444444444444",
    userRole: "ATENCION_TECNICA",
    doneAt: "2026-05-06T17:17:00.000Z",
  });

  assert.equal(result.ok, true);
  assert.equal(result.alreadyFinalized, true);
  assert.equal(result.job.ardCode, "ARD003-AC");
});

test("Postgres FRP direct finalize rejects unapproved payment", () => {
  const result = applyFrpJobDirectFinalizeLegacyState({
    job: {
      id: "job-1",
      code: "ORD-20260506-023-1",
      orderId: baseOrder.id,
      sequence: 1,
      status: "ESPERANDO_PREPARACION",
    },
    order: {
      ...baseOrder,
      checklist: { ...baseOrder.checklist, paymentValidated: false },
      paymentStatus: "PAGO_EN_VALIDACION",
    },
    jobs: [],
    userId: "44444444-4444-4444-8444-444444444444",
    userRole: "ATENCION_TECNICA",
    doneAt: "2026-05-06T17:18:00.000Z",
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.match(result.error, /pago debe estar aprobado/i);
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

test("Postgres FRP ready resolves review back to the technician queue", () => {
  const readyAt = "2026-05-06T17:35:00.000Z";
  const result = applyFrpJobReadyLegacyState({
    job: {
      id: "55555555-5555-4555-8555-555555555555",
      code: "ORD-20260506-001-1",
      orderId: baseOrder.id,
      status: "REQUIERE_REVISION",
      technicianId: "44444444-4444-4444-8444-444444444444",
      takenAt: "2026-05-06T17:00:00.000Z",
      reviewReason: "Cliente no conectado",
      checklist: {
        clientConnected: true,
        requiredStateConfirmed: true,
        modelSupported: true,
      },
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
        status: "REQUIERE_REVISION",
      },
    ],
    userId: "44444444-4444-4444-8444-444444444444",
    userRole: "ATENCION_TECNICA",
    readyAt,
  });

  assert.equal(result.ok, true);
  assert.equal(result.job.status, "LISTO_PARA_TECNICO");
  assert.equal(result.job.technicianId, "");
  assert.equal(result.job.takenAt, "");
  assert.equal(result.job.readyAt, readyAt);
  assert.equal(result.job.updatedAt, readyAt);
  assert.equal(result.order.orderStatus, "LISTA_PARA_TECNICO");
  assert.equal(result.auditAction, "FRP_JOB_READY");
  assert.equal(result.publishReason, "frp_job_ready");
});

test("Postgres FRP ready rejects unrelated technician resolving a reviewed job", () => {
  const result = applyFrpJobReadyLegacyState({
    job: {
      id: "55555555-5555-4555-8555-555555555555",
      code: "ORD-20260506-001-1",
      orderId: baseOrder.id,
      status: "REQUIERE_REVISION",
      technicianId: "44444444-4444-4444-8444-444444444444",
      takenAt: "2026-05-06T17:00:00.000Z",
      reviewReason: "Cliente no conectado",
      checklist: {
        clientConnected: true,
        requiredStateConfirmed: true,
        modelSupported: true,
      },
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
    jobs: [],
    userId: "77777777-7777-4777-8777-777777777777",
    userRole: "ATENCION_TECNICA",
    readyAt: "2026-05-06T17:37:00.000Z",
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.match(result.error, /reporto el caso/);
});

test("Postgres FRP ready allows coordinator resolving a reviewed job", () => {
  const readyAt = "2026-05-06T17:38:00.000Z";
  const result = applyFrpJobReadyLegacyState({
    job: {
      id: "55555555-5555-4555-8555-555555555555",
      code: "ORD-20260506-001-1",
      orderId: baseOrder.id,
      status: "REQUIERE_REVISION",
      technicianId: "44444444-4444-4444-8444-444444444444",
      takenAt: "2026-05-06T17:00:00.000Z",
      reviewReason: "Cliente no conectado",
      checklist: {
        clientConnected: true,
        requiredStateConfirmed: true,
        modelSupported: true,
      },
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
    jobs: [],
    userId: "77777777-7777-4777-8777-777777777777",
    userRole: "COORDINADOR",
    readyAt,
  });

  assert.equal(result.ok, true);
  assert.equal(result.job.status, "LISTO_PARA_TECNICO");
  assert.equal(result.job.technicianId, "");
  assert.equal(result.job.takenAt, "");
  assert.equal(result.job.readyAt, readyAt);
});

test("Postgres FRP ready rejects incomplete readiness state before mutation", () => {
  const result = applyFrpJobReadyLegacyState({
    job: {
      id: "55555555-5555-4555-8555-555555555555",
      code: "ORD-20260506-001-1",
      orderId: baseOrder.id,
      status: "REQUIERE_REVISION",
      checklist: {
        clientConnected: true,
        requiredStateConfirmed: false,
        modelSupported: true,
      },
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
    jobs: [],
    userRole: "ADMIN",
    readyAt: "2026-05-06T17:40:00.000Z",
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.match(result.error, /Completa conexion/);
});

test("FRP serializer exposes approved operatorOrders with stable short codes", () => {
  const now = new Date().toISOString();
  const { publicFrpState } = createTestFrpSerializers();
  const db = {
    users: [],
    frpOrders: [{
      id: "order-7",
      code: "ORD-20260506-007",
      portalOrderId: "portal-7",
      clientId: "internal-7",
      clientName: "Will Zubieta",
      clientWhatsapp: "51999999999",
      country: "PE",
      workChannel: "WHATSAPP_3",
      quantity: 1,
      paymentStatus: "COMPROBANTE_RECIBIDO",
      orderStatus: "PAGO_VALIDADO",
      checklist: { paymentValidated: true },
      paymentReviewedAt: now,
      createdAt: now,
      updatedAt: now,
    }],
    frpJobs: [{
      id: "job-7-1",
      code: "ORD-20260506-007-1",
      orderId: "order-7",
      sequence: 1,
      totalJobs: 1,
      status: "ESPERANDO_PREPARACION",
      workChannel: "WHATSAPP_3",
      createdAt: now,
      updatedAt: now,
    }],
    customerOrders: [{ id: "portal-7", code: "ORD-20260506-007", clientId: "customer-7", priceLockedAt: now }],
    customerClients: [{ id: "customer-7", status: "VIP" }],
  };

  const state = publicFrpState(db, { id: "tech-1", role: "ATENCION_TECNICA" });

  assert.equal(state.orders[0].shortCode, "ARD-0007");
  assert.equal(state.jobs[0].shortCode, "ARD-0007-01");
  assert.equal(state.operatorOrders.length, 1);
  assert.equal(state.operatorOrders[0].shortCode, "ARD-0007");
  assert.equal(state.operatorOrders[0].items[0].shortCode, "ARD-0007-01");
  assert.equal(state.operatorOrders[0].operatorStatus, "PAYMENT_APPROVED");
  assert.equal(state.operatorOrders[0].primaryAction, "finalize");
  assert.equal(state.operatorOrders[0].reviewAllowed, false);
  assert.equal(state.operatorOrders[0].finalizeAllowed, true);
  assert.equal(state.operatorOrders[0].customerId, "customer-7");
});

test("FRP serializer hides no-proof drafts from operatorOrders", () => {
  const now = new Date().toISOString();
  const { publicFrpState } = createTestFrpSerializers();
  const db = {
    users: [],
    frpOrders: [{
      id: "draft-order-1",
      code: "ORD-20260506-009",
      portalOrderId: "portal-draft-1",
      clientId: "internal-draft-1",
      clientName: "Cliente sin comprobante",
      country: "PE",
      workChannel: "WHATSAPP_3",
      quantity: 1,
      paymentStatus: "ESPERANDO_COMPROBANTE",
      paymentProofs: [],
      orderStatus: "COTIZADA",
      checklist: { paymentValidated: false },
      createdAt: now,
      updatedAt: now,
    }],
    frpJobs: [{
      id: "draft-job-1",
      code: "ORD-20260506-009-1",
      orderId: "draft-order-1",
      sequence: 1,
      totalJobs: 1,
      status: "ESPERANDO_PREPARACION",
      workChannel: "WHATSAPP_3",
      createdAt: now,
      updatedAt: now,
    }],
    customerOrders: [{ id: "portal-draft-1", code: "ORD-20260506-009", clientId: "customer-draft-1" }],
    customerClients: [{ id: "customer-draft-1", status: "REGULAR" }],
  };

  const state = publicFrpState(db, { id: "tech-1", role: "ATENCION_TECNICA" });

  assert.equal(state.orders.length, 1, "legacy orders remain available for compatibility");
  assert.equal(state.operatorOrders.length, 0, "new operator panel must not show drafts without proof");
});

test("FRP serializer keeps a seven-device order grouped in one operator card", () => {
  const now = new Date().toISOString();
  const { publicFrpState } = createTestFrpSerializers();
  const jobs = Array.from({ length: 7 }, (_, index) => ({
    id: `job-23-${index + 1}`,
    code: `ORD-20260506-023-${index + 1}`,
    orderId: "order-23",
    sequence: index + 1,
    totalJobs: 7,
    status: "ESPERANDO_PREPARACION",
    workChannel: "WHATSAPP_3",
    createdAt: now,
    updatedAt: now,
  }));
  const db = {
    users: [],
    frpOrders: [{
      id: "order-23",
      code: "ORD-20260506-023",
      portalOrderId: "portal-23",
      clientId: "internal-23",
      clientName: "Jhojan Tafur",
      country: "PE",
      workChannel: "WHATSAPP_3",
      quantity: 7,
      paymentStatus: "PAGO_EN_VALIDACION",
      orderStatus: "ESPERANDO_PAGO",
      checklist: { paymentValidated: false },
      paymentVerification: { mode: "shadow", decision: "review" },
      createdAt: now,
      updatedAt: now,
    }],
    frpJobs: jobs,
    customerOrders: [{ id: "portal-23", code: "ORD-20260506-023", clientId: "customer-23" }],
    customerClients: [{ id: "customer-23", status: "REGULAR" }],
  };

  const state = publicFrpState(db, { id: "tech-1", role: "ATENCION_TECNICA" });

  assert.equal(state.operatorOrders.length, 1);
  assert.equal(state.operatorOrders[0].quantity, 7);
  assert.equal(state.operatorOrders[0].operatorStatus, "AI_REVIEWING");
  assert.equal(state.operatorOrders[0].primaryAction, "review");
  assert.equal(state.operatorOrders[0].reviewAllowed, true);
  assert.equal(state.operatorOrders[0].finalizeAllowed, false);
  assert.equal(state.operatorOrders[0].items.length, 7);
  assert.equal(state.operatorOrders[0].items[0].shortCode, "ARD-0023-01");
  assert.equal(state.operatorOrders[0].items[6].shortCode, "ARD-0023-07");
});

test("FRP serializer derives no-connection alert after approved payment window", () => {
  const reviewedAt = "2026-05-06T10:00:00.000Z";
  const { publicFrpState } = createTestFrpSerializers();
  const db = {
    users: [],
    frpOrders: [{
      id: "order-31",
      code: "ORD-20260506-031",
      portalOrderId: "portal-31",
      clientId: "internal-31",
      clientName: "Daniel Gonzalez",
      country: "PE",
      workChannel: "WHATSAPP_3",
      quantity: 1,
      paymentStatus: "COMPROBANTE_RECIBIDO",
      orderStatus: "PAGO_VALIDADO",
      checklist: { paymentValidated: true },
      paymentReviewedAt: reviewedAt,
      createdAt: reviewedAt,
      updatedAt: reviewedAt,
    }],
    frpJobs: [{
      id: "job-31-1",
      code: "ORD-20260506-031-1",
      orderId: "order-31",
      sequence: 1,
      totalJobs: 1,
      status: "ESPERANDO_PREPARACION",
      workChannel: "WHATSAPP_3",
      createdAt: reviewedAt,
      updatedAt: reviewedAt,
    }],
    customerOrders: [{ id: "portal-31", code: "ORD-20260506-031", clientId: "customer-31" }],
    customerClients: [{ id: "customer-31", status: "REGULAR" }],
  };

  const state = publicFrpState(db, { id: "tech-1", role: "ATENCION_TECNICA" });

  assert.equal(state.operatorOrders[0].operatorStatus, "NO_CONNECTION");
  assert.equal(state.operatorOrders[0].primaryAction, "notify_customer");
  assert.equal(state.operatorOrders[0].finalizeAllowed, true);
  assert.equal(state.operatorOrders[0].notifyCustomerAllowed, true);
  assert.equal(state.operatorOrders[0].noConnectionAlertAt, "2026-05-06T10:05:00.000Z");
});
