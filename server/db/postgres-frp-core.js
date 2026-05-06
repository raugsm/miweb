import crypto from "node:crypto";

import { frpServiceCode, frpWorkChannel, paymentMethods } from "../config/catalog.js";
import { createAuditEvent } from "../core/audit.js";
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
    orderId: stringValue(row.order_id || legacy.orderId),
    status: stringValue(row.status || legacy.status),
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
