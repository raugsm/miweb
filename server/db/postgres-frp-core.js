import crypto from "node:crypto";

import { frpServiceCode, frpWorkChannel, paymentMethods } from "../config/catalog.js";
import { createAuditEvent } from "../core/audit.js";
import { limaDateStamp } from "../core/dates.js";
import { moneyNumber } from "../core/money.js";
import { withTransaction } from "./postgres.js";
import { insertAuditEventWithClient } from "./postgres-audit.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function uuidOrNull(value) {
  const normalized = String(value || "").trim();
  return uuidPattern.test(normalized) ? normalized : null;
}

function stringValue(value) {
  return value === undefined || value === null ? "" : String(value);
}

function numberValue(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function integerValue(value, fallback = 1) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? number : fallback;
}

function jsonObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function isoOrEmpty(value) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function timestampOrNull(value) {
  return value ? value : null;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function uuidFromSeed(seed) {
  const bytes = Buffer.from(sha256(seed).slice(0, 32), "hex");
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function legacyObject(row) {
  return { ...jsonObject(row?.legacy_json) };
}

function paymentCurrencyAmount(value, payment) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return 0;
  if (payment?.amountMode === "thousands" && amount > 0 && amount < 1000) {
    return Math.round(amount * 1000);
  }
  return moneyNumber(amount);
}

function ledgerAmountUsdtFromRate(amount, currency, ratePerUsdt) {
  if (currency === "USDT") return moneyNumber(amount);
  if (!ratePerUsdt) return 0;
  return moneyNumber(Number(amount || 0) / ratePerUsdt);
}

function frpOrderFromRow(row) {
  const legacy = legacyObject(row);
  return {
    ...legacy,
    id: stringValue(row.id || legacy.id),
    code: stringValue(row.code || legacy.code),
    clientId: stringValue(row.client_id || legacy.clientId),
    masterClientId: stringValue(row.master_client_id || legacy.masterClientId),
    clientName: stringValue(row.client_name || legacy.clientName),
    clientWhatsapp: stringValue(row.client_whatsapp || legacy.clientWhatsapp),
    country: stringValue(row.country || legacy.country),
    serviceCode: stringValue(row.service_code || legacy.serviceCode || frpServiceCode),
    serviceName: stringValue(row.service_name || legacy.serviceName || "Xiaomi Cuenta Google"),
    workChannel: stringValue(row.work_channel || legacy.workChannel || frpWorkChannel),
    quantity: integerValue(row.quantity ?? legacy.quantity, 1),
    unitPrice: numberValue(row.unit_price_usdt ?? legacy.unitPrice, 0),
    totalPrice: numberValue(row.total_price_usdt ?? legacy.totalPrice, 0),
    priceFormatted: stringValue(row.price_formatted || legacy.priceFormatted),
    pricingSnapshot: jsonObject(row.pricing_snapshot) || jsonObject(legacy.pricingSnapshot),
    paymentMethod: stringValue(row.payment_method || legacy.paymentMethod),
    paymentLabel: stringValue(row.payment_label || legacy.paymentLabel),
    paymentStatus: stringValue(row.payment_status || legacy.paymentStatus),
    orderStatus: stringValue(row.order_status || legacy.orderStatus || legacy.status),
    checklist: { ...jsonObject(row.checklist), ...jsonObject(legacy.checklist) },
    paymentReviewedBy: stringValue(row.payment_reviewed_by || legacy.paymentReviewedBy),
    paymentReviewedAt: isoOrEmpty(row.payment_reviewed_at) || stringValue(legacy.paymentReviewedAt),
    paymentRejectedReason: stringValue(row.payment_rejected_reason || legacy.paymentRejectedReason),
    createdBy: stringValue(row.created_by || legacy.createdBy),
    portalOrderId: stringValue(row.portal_order_id || legacy.portalOrderId),
    compatibilityReviewRequired: Boolean(row.compatibility_review_required ?? legacy.compatibilityReviewRequired),
    source: stringValue(row.source || legacy.source),
    createdAt: isoOrEmpty(row.created_at) || stringValue(legacy.createdAt),
    updatedAt: isoOrEmpty(row.updated_at) || stringValue(legacy.updatedAt),
  };
}

function portalOrderFromRow(row) {
  if (!row) return null;
  const legacy = legacyObject(row);
  return {
    ...legacy,
    id: stringValue(row.id || legacy.id),
    unitPrice: numberValue(row.unit_price_usdt ?? legacy.unitPrice, 0),
    totalPrice: numberValue(row.total_price_usdt ?? legacy.totalPrice, 0),
    debtAmountUsdt: numberValue(row.debt_amount_usdt ?? legacy.debtAmountUsdt, 0),
    debtClearedAt: isoOrEmpty(row.debt_cleared_at) || stringValue(legacy.debtClearedAt),
    updatedAt: isoOrEmpty(row.updated_at) || stringValue(legacy.updatedAt),
  };
}

function proofFromRow(row) {
  const legacy = legacyObject(row);
  return {
    ...legacy,
    id: stringValue(legacy.id || row.id),
    dbRowId: stringValue(row.id),
    reviewStatus: stringValue(row.review_status || legacy.reviewStatus || "PENDIENTE"),
    uploadedBy: stringValue(row.uploaded_by || legacy.uploadedBy),
    uploadedAt: isoOrEmpty(row.uploaded_at) || stringValue(legacy.uploadedAt),
    reviewedBy: stringValue(row.reviewed_by || legacy.reviewedBy),
    reviewedAt: isoOrEmpty(row.reviewed_at) || stringValue(legacy.reviewedAt),
    rejectedReason: stringValue(row.rejected_reason || legacy.rejectedReason),
  };
}

function jobFromRow(row) {
  const legacy = legacyObject(row);
  return {
    ...legacy,
    id: stringValue(row.id || legacy.id),
    code: stringValue(row.code || legacy.code),
    orderId: stringValue(row.order_id || legacy.orderId),
    status: stringValue(row.status || legacy.status),
    technicianId: stringValue(row.technician_id || legacy.technicianId),
    finalLog: stringValue(row.final_log || legacy.finalLog),
    ardCode: stringValue(row.ard_code || legacy.ardCode),
    reviewReason: stringValue(row.review_reason || legacy.reviewReason),
    doneAt: isoOrEmpty(row.done_at) || stringValue(legacy.doneAt),
    canceledAt: isoOrEmpty(row.canceled_at) || stringValue(legacy.canceledAt),
    canceledBy: stringValue(row.canceled_by || legacy.canceledBy),
    cancelReason: stringValue(row.cancel_reason || legacy.cancelReason),
    createdAt: isoOrEmpty(row.created_at) || stringValue(legacy.createdAt),
    updatedAt: isoOrEmpty(row.updated_at) || stringValue(legacy.updatedAt),
  };
}

function syncFrpOrderStatusLegacy(order, jobs, now) {
  if (!order || ["CERRADA", "CANCELADA"].includes(order.orderStatus)) return;
  const closedJobs = jobs.filter((job) => ["FINALIZADO", "CANCELADO"].includes(job.status)).length;
  if (jobs.length && closedJobs === jobs.length) {
    order.orderStatus = "CERRADA";
    order.closedAt ||= now;
    return;
  }
  if (!order.checklist?.paymentValidated) {
    order.orderStatus = order.checklist?.priceSent ? "ESPERANDO_PAGO" : "COTIZADA";
    return;
  }
  if (!order.checklist.connectionDataSent || !order.checklist.authorizationConfirmed) {
    order.orderStatus = "PAGO_VALIDADO";
    return;
  }
  const readyOrActive = jobs.filter((job) => ["LISTO_PARA_TECNICO", "EN_PROCESO", "FINALIZADO", "REQUIERE_REVISION"].includes(job.status)).length;
  order.orderStatus = readyOrActive === 0
    ? "EN_PREPARACION"
    : readyOrActive === jobs.length ? "LISTA_PARA_TECNICO" : "PARCIAL_LISTA";
}

export function applyFrpPaymentReviewLegacyState({ order, portalOrder = null, proofs = [], jobs = [], action, reason = "", userId, reviewedAt }) {
  if (!proofs.length) {
    return { ok: false, status: 400, error: "No hay comprobante cargado para validar." };
  }
  if (!["approve", "reject"].includes(action)) {
    return { ok: false, status: 400, error: "Accion de validacion invalida." };
  }

  const nextOrder = {
    ...order,
    checklist: { ...jsonObject(order.checklist) },
  };
  const nextPortalOrder = portalOrder ? { ...portalOrder } : null;
  const proofStatus = action === "approve" ? "VALIDADO" : "RECHAZADO";
  const nextProofs = proofs.map((proof) => ({
    ...proof,
    reviewStatus: proofStatus,
    reviewedBy: userId,
    reviewedAt,
  }));

  nextOrder.paymentReviewedBy = userId;
  nextOrder.paymentReviewedAt = reviewedAt;
  nextOrder.updatedAt = reviewedAt;
  nextOrder.paymentProofs = nextProofs.map(({ dbRowId, ...proof }) => proof);

  if (action === "approve") {
    nextOrder.paymentStatus = "COMPROBANTE_RECIBIDO";
    nextOrder.checklist.paymentValidated = true;
    if (nextPortalOrder?.debtAmount && !nextPortalOrder.debtClearedAt) {
      nextPortalOrder.debtClearedAt = reviewedAt;
      nextPortalOrder.debtClearedBy = userId;
      nextPortalOrder.updatedAt = reviewedAt;
    }
    if (nextPortalOrder) {
      nextPortalOrder.priceLocked = Number(nextPortalOrder.unitPrice) || 0;
      nextPortalOrder.priceLockedAt = reviewedAt;
      nextPortalOrder.priceLockExpiresAt = new Date(Date.parse(reviewedAt) + 15 * 60 * 1000).toISOString();
      nextPortalOrder.priceDecisionAction = "";
      nextPortalOrder.priceDecisionAt = "";
      nextPortalOrder.priceDecisionWaitUntil = "";
      nextPortalOrder.updatedAt = reviewedAt;
    }
  } else {
    nextOrder.paymentStatus = "COMPROBANTE_RECHAZADO";
    nextOrder.checklist.paymentValidated = false;
    nextOrder.paymentRejectedReason = reason || "Comprobante rechazado";
  }

  syncFrpOrderStatusLegacy(nextOrder, jobs, reviewedAt);

  return {
    ok: true,
    order: nextOrder,
    portalOrder: nextPortalOrder,
    portalOrderChanged: action === "approve" && Boolean(nextPortalOrder),
    proofs: nextProofs,
    auditAction: action === "approve" ? "FRP_PAYMENT_VALIDATED" : "FRP_PAYMENT_REJECTED",
    publishReason: action === "approve" ? "frp_payment_validated" : "frp_payment_rejected",
    ledgerAction: action === "approve" ? "upsert" : "void",
  };
}

export function applyFrpJobTakeLegacyState({ job, order = null, jobs = [], activeJob = null, specific = false, userId, takenAt }) {
  if (activeJob) {
    return { ok: false, status: 409, error: `Ya tienes un FRP en proceso: ${activeJob.code}.` };
  }
  if (!job) {
    return { ok: false, status: 404, error: "Trabajo FRP no encontrado." };
  }
  if (job.status !== "LISTO_PARA_TECNICO") {
    if (job.technicianId && job.technicianId !== userId) {
      return { ok: false, status: 409, error: "Otro tecnico ya tomo este job." };
    }
    return { ok: false, status: 422, error: "El trabajo no esta disponible para tomar." };
  }

  const nextJob = {
    ...job,
    status: "EN_PROCESO",
    technicianId: userId,
    takenAt,
    updatedAt: takenAt,
  };
  const nextJobs = jobs.length
    ? jobs.map((candidate) => (candidate.id === nextJob.id ? nextJob : candidate))
    : [nextJob];
  const nextOrder = order
    ? {
        ...order,
        checklist: { ...jsonObject(order.checklist) },
      }
    : null;
  if (nextOrder) syncFrpOrderStatusLegacy(nextOrder, nextJobs, takenAt);

  return {
    ok: true,
    job: nextJob,
    order: nextOrder,
    auditAction: specific ? "FRP_JOB_TAKEN_SPECIFIC" : "FRP_JOB_TAKEN",
    publishReason: "frp_job_taken",
  };
}

export function applyFrpJobFinalizeLegacyState({ job, order = null, jobs = [], userId, userRole = "", finalLog = "", finalImages = [], doneAt, ardCode }) {
  if (!job || !order) {
    return { ok: false, status: 404, error: "Trabajo FRP no encontrado." };
  }
  if (job.technicianId && job.technicianId !== userId && userRole !== "ADMIN") {
    return { ok: false, status: 403, error: "Este trabajo lo tomo otro tecnico." };
  }
  if (job.status !== "EN_PROCESO" && userRole !== "ADMIN") {
    return { ok: false, status: 400, error: "Solo puedes finalizar un trabajo en proceso." };
  }

  const nextJob = {
    ...job,
    status: "FINALIZADO",
    finalLog: finalLog || job.finalLog || "",
    ardCode: job.ardCode || ardCode || "",
    doneAt,
    updatedAt: doneAt,
    technicianId: job.technicianId || userId,
  };
  if (finalImages.length) nextJob.finalImages = finalImages;
  const nextJobs = jobs.length
    ? jobs.map((candidate) => (candidate.id === nextJob.id ? nextJob : candidate))
    : [nextJob];
  const nextOrder = {
    ...order,
    checklist: { ...jsonObject(order.checklist) },
  };
  const previousOrderStatus = nextOrder.orderStatus;
  syncFrpOrderStatusLegacy(nextOrder, nextJobs, doneAt);
  if (nextOrder.orderStatus !== previousOrderStatus) nextOrder.updatedAt = doneAt;

  return {
    ok: true,
    job: nextJob,
    order: nextOrder,
    auditAction: "FRP_JOB_DONE",
    auditDetail: { code: nextJob.code, order: nextOrder.code, ardCode: nextJob.ardCode },
    publishReason: "frp_job_done",
  };
}

export function applyFrpJobCancelLegacyState({ job, order = null, jobs = [], userId, userRole = "", reason = "", note = "", canceledAt }) {
  if (!job || !order) {
    return { ok: false, status: 404, error: "Trabajo FRP no encontrado." };
  }
  if (job.technicianId && job.technicianId !== userId && userRole !== "ADMIN") {
    return { ok: false, status: 403, error: "Este trabajo lo tomo otro tecnico." };
  }
  if (job.status !== "EN_PROCESO" && userRole !== "ADMIN") {
    return { ok: false, status: 400, error: "Solo puedes cancelar un trabajo en proceso." };
  }
  const allowedReasons = ["timeout", "payment_reverted", "manual"];
  if (!allowedReasons.includes(reason)) {
    return { ok: false, status: 400, error: "Razon de cancelacion no valida." };
  }

  const nextStatus = reason === "payment_reverted" ? "CANCELADO" : "LISTO_PARA_TECNICO";
  const nextJob = {
    ...job,
    status: nextStatus,
    technicianId: "",
    takenAt: "",
    canceledAt,
    cancelReason: reason,
    updatedAt: canceledAt,
  };
  if (note) nextJob.cancelNote = note;
  const nextJobs = jobs.length
    ? jobs.map((candidate) => (candidate.id === nextJob.id ? nextJob : candidate))
    : [nextJob];
  const nextOrder = {
    ...order,
    checklist: { ...jsonObject(order.checklist) },
  };
  const previousOrderStatus = nextOrder.orderStatus;
  syncFrpOrderStatusLegacy(nextOrder, nextJobs, canceledAt);
  if (nextOrder.orderStatus !== previousOrderStatus) nextOrder.updatedAt = canceledAt;

  return {
    ok: true,
    job: nextJob,
    order: nextOrder,
    auditAction: "FRP_JOB_CANCELED",
    auditDetail: {
      code: nextJob.code,
      order: nextOrder.code,
      reason,
      note: note || "",
      nextStatus,
    },
    publishReason: "frp_job_canceled",
  };
}

export function applyFrpJobReviewLegacyState({ job, order = null, jobs = [], userId, userRole = "", reason = "", reviewedAt }) {
  if (!job || !order) {
    return { ok: false, status: 404, error: "Trabajo FRP no encontrado." };
  }
  if (job.technicianId && job.technicianId !== userId && userRole !== "ADMIN") {
    return { ok: false, status: 403, error: "Este trabajo lo tomo otro tecnico." };
  }
  if (job.status !== "EN_PROCESO") {
    return { ok: false, status: 400, error: "Solo puedes enviar a revision un trabajo en proceso." };
  }
  if (!reason) {
    return { ok: false, status: 400, error: "Indica motivo de revision." };
  }

  const nextJob = {
    ...job,
    status: "REQUIERE_REVISION",
    reviewReason: reason,
    updatedAt: reviewedAt,
  };
  const nextJobs = jobs.length
    ? jobs.map((candidate) => (candidate.id === nextJob.id ? nextJob : candidate))
    : [nextJob];
  const nextOrder = {
    ...order,
    checklist: { ...jsonObject(order.checklist) },
  };
  const previousOrderStatus = nextOrder.orderStatus;
  syncFrpOrderStatusLegacy(nextOrder, nextJobs, reviewedAt);
  if (nextOrder.orderStatus !== previousOrderStatus) nextOrder.updatedAt = reviewedAt;

  return {
    ok: true,
    job: nextJob,
    order: nextOrder,
    auditAction: "FRP_JOB_REVIEW_REQUIRED",
    auditDetail: { code: nextJob.code, order: nextOrder.code, reason },
    publishReason: "frp_job_review_required",
  };
}

async function lockFrpTakeUser(client, userId) {
  const userUuid = uuidOrNull(userId);
  if (!userUuid) return;
  await client.query(
    `
      select id
      from ariad.operator_users
      where id = $1
      for update
    `,
    [userUuid],
  );
}

async function activeFrpJobForUser(client, userId) {
  const userUuid = uuidOrNull(userId);
  if (!userUuid) return null;
  const result = await client.query(
    `
      select *
      from ariad.frp_jobs
      where technician_id = $1
        and status = 'EN_PROCESO'
      order by updated_at desc nulls last, id asc
      limit 1
      for update
    `,
    [userUuid],
  );
  return result.rows[0] || null;
}

async function readFrpOrder(client, orderId) {
  const orderUuid = uuidOrNull(orderId);
  if (!orderUuid) return null;
  const result = await client.query(
    `
      select *
      from ariad.frp_orders
      where id = $1
    `,
    [orderUuid],
  );
  return result.rows[0] || null;
}

async function readFrpOrderForUpdate(client, orderId) {
  const orderUuid = uuidOrNull(orderId);
  if (!orderUuid) return null;
  const result = await client.query(
    `
      select *
      from ariad.frp_orders
      where id = $1
      for update
    `,
    [orderUuid],
  );
  return result.rows[0] || null;
}

async function readFrpOrderJobs(client, orderId) {
  const orderUuid = uuidOrNull(orderId);
  if (!orderUuid) return [];
  const result = await client.query(
    `
      select *
      from ariad.frp_jobs
      where order_id = $1
      order by sequence asc, id asc
    `,
    [orderUuid],
  );
  return result.rows;
}

async function persistFrpJobTakeState(client, state, takenAt, userId) {
  await client.query(
    `
      update ariad.frp_jobs
      set status = $2,
          technician_id = $3,
          updated_at = $4,
          legacy_json = $5::jsonb
      where id = $1
    `,
    [
      state.job.id,
      state.job.status,
      uuidOrNull(state.job.technicianId),
      state.job.updatedAt || takenAt,
      JSON.stringify(state.job),
    ],
  );

  await insertAuditEventWithClient(
    client,
    createAuditEvent(userId, state.auditAction, state.job.id, {
      code: state.job.code,
      order: state.order?.code || "",
    }),
  );
}

function formatFrpArdCode(next) {
  const first = String.fromCharCode(65 + Math.floor((next - 1) / 26) % 26);
  const second = String.fromCharCode(65 + ((next - 1) % 26));
  return `ARD${String(next).padStart(3, "0")}-${first}${second}`;
}

async function nextFrpArdCodePostgres(client, now) {
  const stamp = limaDateStamp(now ? new Date(now) : new Date());
  const result = await client.query(
    `
      insert into ariad.sequence_counters
        (scope, bucket, counter_key, counter_value, updated_at)
      values
        ('frpCounters', 'ard', $1, 1, $2)
      on conflict (scope, bucket, counter_key) do update set
        counter_value = ariad.sequence_counters.counter_value + 1,
        updated_at = excluded.updated_at
      returning counter_value
    `,
    [stamp, now],
  );
  return formatFrpArdCode(numberValue(result.rows[0]?.counter_value, 1));
}

function finalImageDigest(image) {
  const existing = stringValue(image?.hash || image?.sha256).trim();
  if (existing) return existing;
  const dataUrl = stringValue(image?.dataUrl).trim();
  return dataUrl ? sha256(dataUrl) : "";
}

async function persistFrpFinalImages(client, jobId, finalImages, now) {
  for (const image of finalImages) {
    const digest = finalImageDigest(image);
    if (!digest) continue;
    const legacy = {
      ...jsonObject(image),
      hash: image.hash || digest,
      sha256: image.sha256 || image.hash || digest,
      createdAt: image.createdAt || now,
    };
    const storedFileResult = await client.query(
      `
        insert into ariad.stored_files
          (id, owner_type, owner_id, purpose, name, content_type, size_bytes,
           sha256, storage_kind, storage_key, legacy_data_url, created_at, legacy_json)
        values
          ($1, 'FRP_JOB', $2, 'final_image', $3, $4, $5,
           $6, 'legacy_inline', '', $7, $8, $9::jsonb)
        on conflict (sha256) do update set
          sha256 = excluded.sha256
        returning id
      `,
      [
        uuidFromSeed(`stored-file:${digest}`),
        uuidOrNull(jobId),
        stringValue(legacy.name),
        stringValue(legacy.type || legacy.contentType),
        integerValue(legacy.size, 0),
        digest,
        stringValue(legacy.dataUrl) || null,
        legacy.createdAt,
        JSON.stringify(legacy),
      ],
    );
    await client.query(
      `
        insert into ariad.frp_job_files
          (job_id, stored_file_id, purpose, created_at)
        values
          ($1, $2, 'final_image', $3)
        on conflict (job_id, stored_file_id) do nothing
      `,
      [uuidOrNull(jobId), storedFileResult.rows[0]?.id, legacy.createdAt],
    );
  }
}

async function persistFrpOrderStatus(client, order, now) {
  await client.query(
    `
      update ariad.frp_orders
      set order_status = $2,
          updated_at = $3,
          legacy_json = $4::jsonb
      where id = $1
    `,
    [
      order.id,
      order.orderStatus,
      order.updatedAt || now,
      JSON.stringify(order),
    ],
  );
}

async function persistFrpFinalizeState(client, state, doneAt, userId) {
  await client.query(
    `
      update ariad.frp_jobs
      set status = $2,
          technician_id = $3,
          final_log = $4,
          ard_code = $5,
          done_at = $6,
          updated_at = $7,
          legacy_json = $8::jsonb
      where id = $1
    `,
    [
      state.job.id,
      state.job.status,
      uuidOrNull(state.job.technicianId),
      state.job.finalLog || "",
      state.job.ardCode || "",
      timestampOrNull(state.job.doneAt),
      state.job.updatedAt || doneAt,
      JSON.stringify(state.job),
    ],
  );
  await persistFrpFinalImages(client, state.job.id, state.job.finalImages || [], doneAt);
  await persistFrpOrderStatus(client, state.order, doneAt);
  await insertAuditEventWithClient(
    client,
    createAuditEvent(userId, state.auditAction, state.job.id, state.auditDetail),
  );
}

async function persistFrpCancelState(client, state, canceledAt, userId) {
  await client.query(
    `
      update ariad.frp_jobs
      set status = $2,
          technician_id = null,
          canceled_at = $3,
          canceled_by = $4,
          cancel_reason = $5,
          updated_at = $6,
          legacy_json = $7::jsonb
      where id = $1
    `,
    [
      state.job.id,
      state.job.status,
      timestampOrNull(state.job.canceledAt),
      uuidOrNull(userId),
      state.job.cancelReason || "",
      state.job.updatedAt || canceledAt,
      JSON.stringify(state.job),
    ],
  );
  await persistFrpOrderStatus(client, state.order, canceledAt);
  await insertAuditEventWithClient(
    client,
    createAuditEvent(userId, state.auditAction, state.job.id, state.auditDetail),
  );
}

async function persistFrpReviewState(client, state, reviewedAt, userId) {
  await client.query(
    `
      update ariad.frp_jobs
      set status = $2,
          review_reason = $3,
          updated_at = $4,
          legacy_json = $5::jsonb
      where id = $1
    `,
    [
      state.job.id,
      state.job.status,
      state.job.reviewReason || "",
      state.job.updatedAt || reviewedAt,
      JSON.stringify(state.job),
    ],
  );
  await persistFrpOrderStatus(client, state.order, reviewedAt);
  await insertAuditEventWithClient(
    client,
    createAuditEvent(userId, state.auditAction, state.job.id, state.auditDetail),
  );
}

async function takeFrpJobRowPostgres(client, { jobRow, activeJobRow = null, userId, takenAt, specific }) {
  const orderRow = await readFrpOrder(client, jobRow?.order_id);
  const job = jobRow ? jobFromRow(jobRow) : null;
  const state = applyFrpJobTakeLegacyState({
    job,
    order: orderRow ? frpOrderFromRow(orderRow) : null,
    jobs: job ? [job] : [],
    activeJob: activeJobRow ? jobFromRow(activeJobRow) : null,
    specific,
    userId,
    takenAt,
  });
  if (!state.ok) return state;
  await persistFrpJobTakeState(client, state, takenAt, userId);
  return {
    ok: true,
    jobId: state.job.id,
    orderId: state.job.orderId,
    publishReason: state.publishReason,
  };
}

export async function takeFrpJobPostgres({ jobId, userId, takenAt }) {
  return withTransaction(async (client) => {
    const normalizedJobId = uuidOrNull(jobId);
    if (!normalizedJobId) return { ok: false, status: 404, error: "Trabajo FRP no encontrado." };
    await lockFrpTakeUser(client, userId);
    const activeJobRow = await activeFrpJobForUser(client, userId);
    if (activeJobRow) {
      return applyFrpJobTakeLegacyState({
        activeJob: jobFromRow(activeJobRow),
        userId,
        takenAt,
      });
    }

    const jobResult = await client.query(
      `
        select *
        from ariad.frp_jobs
        where id = $1
        for update
      `,
      [normalizedJobId],
    );
    const jobRow = jobResult.rows[0] || null;
    if (!jobRow) return { ok: false, status: 404, error: "Trabajo FRP no encontrado." };
    return takeFrpJobRowPostgres(client, { jobRow, userId, takenAt, specific: true });
  });
}

export async function takeNextFrpJobPostgres({ userId, takenAt }) {
  return withTransaction(async (client) => {
    await lockFrpTakeUser(client, userId);
    const activeJobRow = await activeFrpJobForUser(client, userId);
    if (activeJobRow) {
      return applyFrpJobTakeLegacyState({
        activeJob: jobFromRow(activeJobRow),
        userId,
        takenAt,
      });
    }

    const jobResult = await client.query(
      `
        select *
        from ariad.frp_jobs
        where status = 'LISTO_PARA_TECNICO'
        order by coalesce(nullif(legacy_json->>'readyAt', ''), updated_at::text, created_at::text) asc, id asc
        limit 1
        for update skip locked
      `,
    );
    const jobRow = jobResult.rows[0] || null;
    if (!jobRow) return { ok: false, status: 404, error: "No hay trabajos FRP listos." };
    return takeFrpJobRowPostgres(client, { jobRow, userId, takenAt, specific: false });
  });
}

async function readLockedFrpJobWithOrder(client, jobId) {
  const normalizedJobId = uuidOrNull(jobId);
  if (!normalizedJobId) return { jobRow: null, orderRow: null, jobRows: [] };
  const jobResult = await client.query(
    `
      select *
      from ariad.frp_jobs
      where id = $1
      for update
    `,
    [normalizedJobId],
  );
  const jobRow = jobResult.rows[0] || null;
  if (!jobRow) return { jobRow: null, orderRow: null, jobRows: [] };
  const orderRow = await readFrpOrderForUpdate(client, jobRow.order_id);
  const jobRows = orderRow ? await readFrpOrderJobs(client, orderRow.id) : [];
  return { jobRow, orderRow, jobRows };
}

export async function finalizeFrpJobPostgres({ jobId, userId, userRole = "", finalLog = "", finalImages = [], doneAt }) {
  return withTransaction(async (client) => {
    const { jobRow, orderRow, jobRows } = await readLockedFrpJobWithOrder(client, jobId);
    if (!jobRow || !orderRow) return { ok: false, status: 404, error: "Trabajo FRP no encontrado." };
    const currentJob = jobFromRow(jobRow);
    const state = applyFrpJobFinalizeLegacyState({
      job: currentJob,
      order: frpOrderFromRow(orderRow),
      jobs: jobRows.map(jobFromRow),
      userId,
      userRole,
      finalLog,
      finalImages,
      doneAt,
      ardCode: currentJob.ardCode,
    });
    if (!state.ok) return state;
    if (!state.job.ardCode) {
      state.job.ardCode = await nextFrpArdCodePostgres(client, doneAt);
      state.auditDetail.ardCode = state.job.ardCode;
    }
    await persistFrpFinalizeState(client, state, doneAt, userId);
    return {
      ok: true,
      jobId: state.job.id,
      orderId: state.job.orderId,
      publishReason: state.publishReason,
    };
  });
}

export async function cancelFrpJobPostgres({ jobId, userId, userRole = "", reason = "", note = "", canceledAt }) {
  return withTransaction(async (client) => {
    const { jobRow, orderRow, jobRows } = await readLockedFrpJobWithOrder(client, jobId);
    if (!jobRow || !orderRow) return { ok: false, status: 404, error: "Trabajo FRP no encontrado." };
    const state = applyFrpJobCancelLegacyState({
      job: jobFromRow(jobRow),
      order: frpOrderFromRow(orderRow),
      jobs: jobRows.map(jobFromRow),
      userId,
      userRole,
      reason,
      note,
      canceledAt,
    });
    if (!state.ok) return state;
    await persistFrpCancelState(client, state, canceledAt, userId);
    return {
      ok: true,
      jobId: state.job.id,
      orderId: state.job.orderId,
      publishReason: state.publishReason,
    };
  });
}

export async function reviewFrpJobPostgres({ jobId, userId, userRole = "", reason = "", reviewedAt }) {
  return withTransaction(async (client) => {
    const { jobRow, orderRow, jobRows } = await readLockedFrpJobWithOrder(client, jobId);
    if (!jobRow || !orderRow) return { ok: false, status: 404, error: "Trabajo FRP no encontrado." };
    const state = applyFrpJobReviewLegacyState({
      job: jobFromRow(jobRow),
      order: frpOrderFromRow(orderRow),
      jobs: jobRows.map(jobFromRow),
      userId,
      userRole,
      reason,
      reviewedAt,
    });
    if (!state.ok) return state;
    await persistFrpReviewState(client, state, reviewedAt, userId);
    return {
      ok: true,
      jobId: state.job.id,
      orderId: state.job.orderId,
      publishReason: state.publishReason,
    };
  });
}

async function currentExchangeForCurrency(client, currency) {
  if (currency === "USDT") {
    return { ratePerUsdt: 1, exchangeRateDate: "" };
  }
  const result = await client.query(
    `
      select rate_per_usdt, updated_at
      from ariad.exchange_rates
      where currency = $1
      order by rate_key asc
      limit 1
    `,
    [currency],
  );
  const row = result.rows[0] || {};
  return {
    ratePerUsdt: moneyNumber(row.rate_per_usdt || 0),
    exchangeRateDate: isoOrEmpty(row.updated_at),
  };
}

function buildFrpPaymentLedgerEntry({ order, payment, exchange, existingEntry, proofCount, userId, now }) {
  const id = existingEntry?.id || crypto.randomUUID();
  const createdAt = isoOrEmpty(existingEntry?.created_at) || now;
  const amount = paymentCurrencyAmount(order.totalPrice, payment);
  const legacy = {
    ...legacyObject(existingEntry),
    id,
    entryType: "PAYMENT",
    sourceType: "FRP_ORDER",
    sourceId: order.id,
    sourceCode: order.code,
    clientId: order.clientId || "",
    masterClientId: order.masterClientId || "",
    clientName: order.clientName || "",
    country: order.country || "",
    serviceCode: order.serviceCode || frpServiceCode,
    serviceName: order.serviceName || "Xiaomi Cuenta Google",
    workChannel: order.workChannel || frpWorkChannel,
    quantity: Number(order.quantity || 1),
    amount,
    currency: payment.currency,
    paymentMethod: payment.code,
    paymentLabel: payment.label,
    exchangeRateToUsdt: exchange.ratePerUsdt,
    exchangeRateDate: exchange.exchangeRateDate,
    amountUsdtEstimate: ledgerAmountUsdtFromRate(amount, payment.currency, exchange.ratePerUsdt),
    pricingSnapshot: order.pricingSnapshot || null,
    status: "VALIDATED",
    validatedBy: order.paymentReviewedBy || userId || order.createdBy || "",
    validatedAt: order.paymentReviewedAt || order.updatedAt || order.createdAt || now,
    proofCount,
    voidedAt: "",
    createdAt,
    updatedAt: now,
  };
  return {
    id,
    legacy,
    createdAt,
  };
}

async function upsertFrpPaymentLedgerEntry(client, { order, proofCount, userId, now }) {
  const payment = paymentMethods.find((candidate) => candidate.code === order.paymentMethod);
  if (!payment) {
    await voidFrpPaymentLedgerEntry(client, order.id, now);
    return;
  }

  const existingResult = await client.query(
    `
      select *
      from ariad.payment_ledger_entries
      where source_type = 'FRP_ORDER'
        and source_id = $1
        and entry_type = 'PAYMENT'
      for update
    `,
    [order.id],
  );
  const existing = existingResult.rows[0] || null;
  const exchange = existing?.exchange_rate_to_usdt
    ? {
        ratePerUsdt: numberValue(existing.exchange_rate_to_usdt, 1),
        exchangeRateDate: existing.exchange_rate_date || "",
      }
    : await currentExchangeForCurrency(client, payment.currency);
  const entry = buildFrpPaymentLedgerEntry({ order, payment, exchange, existingEntry: existing, proofCount, userId, now });
  const legacy = entry.legacy;

  await client.query(
    `
      insert into ariad.payment_ledger_entries
        (id, entry_type, source_type, source_id, source_code, client_id, master_client_id,
         client_name, country, service_code, service_name, work_channel, quantity, amount,
         currency, payment_method, payment_label, exchange_rate_to_usdt, exchange_rate_date,
         amount_usdt_estimate, status, validated_by, validated_at, proof_count, voided_at,
         created_at, updated_at, legacy_json)
      values
        ($1, 'PAYMENT', 'FRP_ORDER', $2, $3, $4, $5,
         $6, $7, $8, $9, $10, $11, $12,
         $13, $14, $15, $16, $17,
         $18, 'VALIDATED', $19, $20, $21, null,
         $22, $23, $24::jsonb)
      on conflict (source_type, source_id, entry_type) do update set
        source_code = excluded.source_code,
        client_id = excluded.client_id,
        master_client_id = excluded.master_client_id,
        client_name = excluded.client_name,
        country = excluded.country,
        service_code = excluded.service_code,
        service_name = excluded.service_name,
        work_channel = excluded.work_channel,
        quantity = excluded.quantity,
        amount = excluded.amount,
        currency = excluded.currency,
        payment_method = excluded.payment_method,
        payment_label = excluded.payment_label,
        exchange_rate_to_usdt = excluded.exchange_rate_to_usdt,
        exchange_rate_date = excluded.exchange_rate_date,
        amount_usdt_estimate = excluded.amount_usdt_estimate,
        status = excluded.status,
        validated_by = excluded.validated_by,
        validated_at = excluded.validated_at,
        proof_count = excluded.proof_count,
        voided_at = null,
        updated_at = excluded.updated_at,
        legacy_json = excluded.legacy_json
    `,
    [
      entry.id,
      order.id,
      legacy.sourceCode,
      uuidOrNull(legacy.clientId),
      uuidOrNull(legacy.masterClientId),
      legacy.clientName,
      legacy.country,
      legacy.serviceCode,
      legacy.serviceName,
      legacy.workChannel,
      legacy.quantity,
      legacy.amount,
      legacy.currency,
      legacy.paymentMethod,
      legacy.paymentLabel,
      legacy.exchangeRateToUsdt,
      legacy.exchangeRateDate,
      legacy.amountUsdtEstimate,
      uuidOrNull(legacy.validatedBy),
      timestampOrNull(legacy.validatedAt),
      legacy.proofCount,
      entry.createdAt,
      now,
      JSON.stringify(legacy),
    ],
  );
}

async function voidFrpPaymentLedgerEntry(client, orderId, now) {
  const result = await client.query(
    `
      select *
      from ariad.payment_ledger_entries
      where source_type = 'FRP_ORDER'
        and source_id = $1
        and entry_type = 'PAYMENT'
      for update
    `,
    [orderId],
  );
  const existing = result.rows[0];
  if (!existing || existing.status === "VOIDED") return;
  const legacy = {
    ...legacyObject(existing),
    status: "VOIDED",
    voidedAt: now,
    updatedAt: now,
  };
  await client.query(
    `
      update ariad.payment_ledger_entries
      set status = 'VOIDED',
          voided_at = $2,
          updated_at = $2,
          legacy_json = $3::jsonb
      where id = $1
    `,
    [existing.id, now, JSON.stringify(legacy)],
  );
}

export async function reviewFrpPaymentPostgres({ orderId, action, reason = "", userId, reviewedAt }) {
  return withTransaction(async (client) => {
    const orderResult = await client.query(
      `
        select *
        from ariad.frp_orders
        where id = $1
        for update
      `,
      [orderId],
    );
    const orderRow = orderResult.rows[0];
    if (!orderRow) return { ok: false, status: 404, error: "Orden FRP no encontrada." };

    const proofsResult = await client.query(
      `
        select *
        from ariad.payment_proofs
        where source_type = 'FRP_ORDER'
          and source_id = $1
        order by uploaded_at asc nulls last, id asc
        for update
      `,
      [orderId],
    );
    const portalResult = orderRow.portal_order_id
      ? await client.query(
          `
            select *
            from ariad.customer_orders
            where id = $1
            for update
          `,
          [orderRow.portal_order_id],
        )
      : { rows: [] };
    const jobsResult = await client.query(
      `
        select *
        from ariad.frp_jobs
        where order_id = $1
        order by sequence asc, id asc
        for update
      `,
      [orderId],
    );

    const state = applyFrpPaymentReviewLegacyState({
      order: frpOrderFromRow(orderRow),
      portalOrder: portalOrderFromRow(portalResult.rows[0]),
      proofs: proofsResult.rows.map(proofFromRow),
      jobs: jobsResult.rows.map(jobFromRow),
      action,
      reason,
      userId,
      reviewedAt,
    });
    if (!state.ok) return state;

    await client.query(
      `
        update ariad.frp_orders
        set payment_status = $2,
            order_status = $3,
            checklist = $4::jsonb,
            payment_reviewed_by = $5,
            payment_reviewed_at = $6,
            payment_rejected_reason = $7,
            updated_at = $8,
            legacy_json = $9::jsonb
        where id = $1
      `,
      [
        orderId,
        state.order.paymentStatus,
        state.order.orderStatus,
        JSON.stringify(state.order.checklist),
        uuidOrNull(state.order.paymentReviewedBy),
        state.order.paymentReviewedAt,
        state.order.paymentRejectedReason || "",
        state.order.updatedAt,
        JSON.stringify(state.order),
      ],
    );

    for (const proof of state.proofs) {
      const { dbRowId, ...legacyProof } = proof;
      await client.query(
        `
          update ariad.payment_proofs
          set review_status = $2,
              reviewed_by = $3,
              reviewed_at = $4,
              rejected_reason = $5,
              legacy_json = $6::jsonb
          where id = $1
        `,
        [
          dbRowId || proof.id,
          proof.reviewStatus,
          uuidOrNull(proof.reviewedBy),
          proof.reviewedAt,
          proof.rejectedReason || "",
          JSON.stringify(legacyProof),
        ],
      );
    }

    if (state.portalOrderChanged) {
      await client.query(
        `
          update ariad.customer_orders
          set debt_cleared_at = $2,
              updated_at = $3,
              legacy_json = $4::jsonb
          where id = $1
        `,
        [
          state.portalOrder.id,
          timestampOrNull(state.portalOrder.debtClearedAt),
          state.portalOrder.updatedAt || reviewedAt,
          JSON.stringify(state.portalOrder),
        ],
      );
    }

    if (state.ledgerAction === "upsert") {
      await upsertFrpPaymentLedgerEntry(client, {
        order: state.order,
        proofCount: state.proofs.length,
        userId,
        now: reviewedAt,
      });
    } else {
      await voidFrpPaymentLedgerEntry(client, orderId, reviewedAt);
    }

    await insertAuditEventWithClient(
      client,
      createAuditEvent(userId, state.auditAction, orderId, {
        code: state.order.code,
        orderStatus: state.order.orderStatus,
      }),
    );

    return {
      ok: true,
      orderId,
      publishReason: state.publishReason,
    };
  });
}
