import {
  countryNameFromIso,
  detectCountryIsoFromRequest,
  ensureXiaomiServiceRule,
  isXiaomiOrder,
  nextAgOrderCode,
  normalizeCountryIso,
  normalizeQuantity,
  normalizeWhatsapp,
  paymentMethodsForCountry,
  publicPaymentMethod,
  publicXiaomiOrder,
  quoteXiaomiOrder,
  token10,
  validWhatsapp,
  xiaomiFrpServiceCode,
  xiaomiFrpSource,
  xiaomiFrpTransactionFeeUsdt,
  xiaomiServerStatus,
} from "./core.js";

function jsonArray(value) {
  return Array.isArray(value) ? value : [];
}

function eventHeaders() {
  return {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  };
}

export function createXiaomiFrpRoutes({
  audit,
  cleanText,
  crypto,
  enforcePortalRateLimit,
  frpServiceCode,
  frpWorkChannel,
  hashToken,
  maxPortalOrderRequestsPerWindow,
  maxPortalProofRequestsPerWindow,
  nowIso,
  parseJson,
  paymentMethodsWithOverrides,
  readDb,
  requireFrpAccess,
  requireFrpPaymentReviewer,
  requireUser,
  sanitizePaymentProofImages,
  sendJson,
  sendSseEvent,
  services,
  syncFrpOrderStatus,
  writeDb,
}) {
  const orderStreams = new Map();
  const operatorStreams = new Set();

  function publishOrder(db, order, reason = "order_updated") {
    if (!orderStreams.has(order.id)) return;
    const payload = { reason, order: publicXiaomiOrder(order, db) };
    for (const stream of [...orderStreams.get(order.id)]) {
      try {
        sendSseEvent(stream.res, "order", payload, `${Date.now()}`);
      } catch {
        orderStreams.get(order.id)?.delete(stream);
      }
    }
  }

  function publishOperator(db, reason = "queue_updated") {
    if (!operatorStreams.size) return;
    const payload = { reason, queue: operatorQueue(db) };
    for (const stream of [...operatorStreams]) {
      try {
        sendSseEvent(stream.res, "queue", payload, `${Date.now()}`);
      } catch {
        operatorStreams.delete(stream);
      }
    }
  }

  function operatorQueue(db) {
    return jsonArray(db.customerOrders)
      .filter(isXiaomiOrder)
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
      .map((order) => ({
        ...publicXiaomiOrder(order, db),
        manualNotifications: jsonArray(order.manualNotifications).map((entry) => ({
          id: entry.id,
          type: entry.type,
          message: entry.message,
          status: entry.status,
          createdAt: entry.createdAt,
          sentAt: entry.sentAt || "",
        })),
      }));
  }

  function findOrderByCode(db, code) {
    const safeCode = String(code || "").trim().toUpperCase();
    return jsonArray(db.customerOrders).find((order) => order.code === safeCode && isXiaomiOrder(order)) || null;
  }

  function tokenFromRequest(req) {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    return String(url.searchParams.get("t") || req.headers["x-xiaomi-frp-order-token"] || "").trim();
  }

  function findAuthorizedOrder(db, req, code) {
    const order = findOrderByCode(db, code);
    const token = tokenFromRequest(req);
    if (!order || !token) return null;
    const tokenHash = String(order.publicAccessTokenHash || "");
    return tokenHash && tokenHash === hashToken(token) ? order : null;
  }

  function xiaomiPaymentMethods(db, countryIso = "") {
    return paymentMethodsForCountry(paymentMethodsWithOverrides(db), countryIso).map(publicPaymentMethod);
  }

  function serviceName() {
    return services.find((service) => service.code === frpServiceCode)?.name || "Xiaomi Reset + FRP";
  }

  function buildPaymentProofs(input) {
    const raw = input.paymentProofs || input.proofs || (input.proof ? [input.proof] : []);
    const proofs = sanitizePaymentProofImages(raw);
    if (proofs.some((proof) => proof.type === "application/pdf")) {
      const error = new Error("Comprobante invalido: usa imagen JPG, PNG o WEBP.");
      error.status = 400;
      throw error;
    }
    return proofs;
  }

  function createCustomer(db, { whatsapp, countryIso, code }) {
    const timestamp = nowIso();
    const country = countryNameFromIso(countryIso);
    const client = {
      id: crypto.randomUUID(),
      name: `Cliente ${code}`,
      whatsapp,
      country,
      whatsappCountryIso: countryIso,
      whatsappDetectedCountry: country,
      status: "REGISTRADO",
      primaryEmail: "",
      emailVerifiedAt: "",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    db.customerClients.unshift(client);
    return client;
  }

  function createOrderRecords(db, input, quote, token) {
    const timestamp = nowIso();
    const code = nextAgOrderCode(db);
    const whatsapp = normalizeWhatsapp(input.whatsapp);
    const client = createCustomer(db, { whatsapp, countryIso: quote.countryIso, code });
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.parse(timestamp) + 10 * 60 * 1000).toISOString();
    const service = serviceName();
    const order = {
      id: crypto.randomUUID(),
      code,
      requestId: "",
      clientId: client.id,
      masterClientId: "",
      userId: "",
      serviceCode: xiaomiFrpServiceCode,
      internalServiceCode: frpServiceCode,
      serviceName: service,
      workChannel: frpWorkChannel,
      quantity: quote.quantity,
      unitPrice: quote.unitPriceUsdt,
      totalPrice: quote.totalUsdt,
      priceFormatted: `${quote.totalUsdt.toFixed(2)} USDT`,
      pricingSnapshot: {
        version: "xiaomi-frp-fixed-v1",
        unitPriceUsdt: quote.unitPriceUsdt,
        subtotalUsdt: quote.subtotalUsdt,
        transactionFeeUsdt: quote.feeUsdt,
        totalUsdt: quote.totalUsdt,
        exchangeRate: quote.exchangeRate,
        currency: quote.currency,
      },
      paymentMethod: quote.paymentMethod.code,
      paymentLabel: quote.paymentMethod.label,
      publicStatus: "ESPERANDO_PAGO",
      compatibilityReviewRequired: false,
      frpOrderId: "",
      internalClientId: "",
      customerConnectionReadyAt: "",
      debtAmountUsdt: 0,
      debtClearedAt: "",
      note: cleanText(input.note || "", 180),
      source: xiaomiFrpSource,
      countryIso: quote.countryIso,
      country: quote.country,
      customerWhatsapp: whatsapp,
      transactionFeeUsdt: xiaomiFrpTransactionFeeUsdt,
      paymentAmount: quote.paymentAmount,
      paymentCurrency: quote.currency,
      exchangeRate: quote.exchangeRate,
      exchangeRateUpdatedAt: quote.exchangeRateUpdatedAt,
      priceLockedAt: timestamp,
      priceLockExpiresAt: expiresAt,
      publicAccessTokenHash: tokenHash,
      publicUrl: `/pedido/${code}`,
      paymentProofs: [],
      manualNotifications: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const frpOrder = {
      id: crypto.randomUUID(),
      code,
      clientId: "",
      masterClientId: "",
      clientName: client.name,
      clientWhatsapp: whatsapp,
      country: quote.country,
      serviceCode: frpServiceCode,
      serviceName: service,
      workChannel: frpWorkChannel,
      quantity: quote.quantity,
      unitPrice: quote.unitPriceUsdt,
      totalPrice: quote.totalUsdt,
      priceFormatted: order.priceFormatted,
      pricingSnapshot: order.pricingSnapshot,
      paymentMethod: quote.paymentMethod.code,
      paymentLabel: quote.paymentMethod.label,
      paymentStatus: "ESPERANDO_COMPROBANTE",
      orderStatus: "ESPERANDO_PAGO",
      checklist: { priceSent: true, paymentValidated: false, connectionDataSent: false, authorizationConfirmed: false },
      paymentReviewedBy: "",
      paymentReviewedAt: "",
      paymentRejectedReason: "",
      createdBy: "xiaomi-frp-spa",
      portalOrderId: order.id,
      compatibilityReviewRequired: false,
      source: xiaomiFrpSource,
      publicAccessTokenHash: tokenHash,
      paymentProofs: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const items = Array.from({ length: quote.quantity }, (_, index) => ({
      id: crypto.randomUUID(),
      requestId: "",
      orderId: order.id,
      clientId: client.id,
      masterClientId: "",
      sequence: index + 1,
      originalText: "",
      model: "",
      imei: "",
      status: "ESPERANDO_PAGO",
      eligibilityStatus: "APTO_EXPRESS",
      frpOrderId: frpOrder.id,
      frpJobId: "",
      createdAt: timestamp,
      updatedAt: timestamp,
    }));
    const jobs = items.map((item) => ({
      id: crypto.randomUUID(),
      code: `${code}-${item.sequence}`,
      orderId: frpOrder.id,
      sequence: item.sequence,
      totalJobs: quote.quantity,
      workChannel: frpWorkChannel,
      serviceCode: frpServiceCode,
      serviceName: service,
      clientName: client.name,
      country: quote.country,
      model: "",
      imei: "",
      originalText: "",
      eligibilityStatus: "APTO_EXPRESS",
      status: "ESPERANDO_PREPARACION",
      checklist: { clientConnected: false, requiredStateConfirmed: false, modelSupported: true },
      technicianId: "",
      portalOrderItemId: item.id,
      finalLog: "",
      ardCode: "",
      reviewReason: "",
      createdAt: timestamp,
      updatedAt: timestamp,
    }));
    items.forEach((item, index) => {
      item.frpJobId = jobs[index].id;
    });
    order.frpOrderId = frpOrder.id;
    db.customerOrders.unshift(order);
    db.customerOrderItems.unshift(...items);
    db.frpOrders.unshift(frpOrder);
    db.frpJobs.unshift(...jobs);
    audit(db, null, "XIAOMI_FRP_ORDER_CREATED", order.id, {
      code,
      quantity: quote.quantity,
      countryIso: quote.countryIso,
      paymentMethod: quote.paymentMethod.code,
    });
    return order;
  }

  function addManualNotification(order, type, message) {
    order.manualNotifications ||= [];
    order.manualNotifications.unshift({
      id: crypto.randomUUID(),
      type,
      message,
      status: "PENDING",
      createdAt: nowIso(),
      sentAt: "",
      sentBy: "",
    });
  }

  async function updateOrderStatus(db, order, status, detail = {}) {
    order.publicStatus = status;
    order.updatedAt = nowIso();
    audit(db, detail.actorId || null, detail.action || "XIAOMI_FRP_ORDER_STATUS_UPDATED", order.id, {
      code: order.code,
      status,
      reason: detail.reason || "",
    });
  }

  return async function handleXiaomiFrpApi(req, res, pathname, user) {
    if (req.method === "GET" && pathname === "/api/xiaomi-frp/bootstrap") {
      const db = await readDb();
      const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
      const requestedIso = normalizeCountryIso(url.searchParams.get("country"));
      const detectedIso = detectCountryIsoFromRequest(req);
      const countryIso = requestedIso || detectedIso;
      const quantity = normalizeQuantity(url.searchParams.get("quantity") || 1);
      const methods = xiaomiPaymentMethods(db, countryIso);
      const quote = quoteXiaomiOrder(db, {
        countryIso,
        quantity,
        paymentMethodCode: url.searchParams.get("paymentMethod") || "",
        methods: paymentMethodsWithOverrides(db),
        nowIso,
      });
      return sendJson(res, 200, {
        detectedCountryIso: detectedIso,
        countryIso,
        requiresCountrySelection: !countryIso,
        server: xiaomiServerStatus(db, nowIso),
        price: quote,
        paymentMethods: methods,
      });
    }

    if (req.method === "POST" && pathname === "/api/xiaomi-frp/orders") {
      const input = await parseJson(req);
      const db = await readDb();
      const countryIso = normalizeCountryIso(input.countryIso || input.country);
      const whatsapp = normalizeWhatsapp(input.whatsapp);
      const rateOk = enforcePortalRateLimit(db, req, "xiaomi_frp_order_create", whatsapp, maxPortalOrderRequestsPerWindow);
      if (!rateOk) {
        audit(db, null, "XIAOMI_FRP_ORDER_RATE_LIMITED", null, { countryIso });
        await writeDb(db);
        return sendJson(res, 429, { error: "Demasiados pedidos. Intenta mas tarde." });
      }
      if (!countryIso) return sendJson(res, 400, { error: "Selecciona pais." });
      if (!validWhatsapp(whatsapp)) return sendJson(res, 400, { error: "WhatsApp invalido." });
      const methods = paymentMethodsWithOverrides(db);
      const quote = quoteXiaomiOrder(db, {
        countryIso,
        quantity: input.quantity,
        paymentMethodCode: cleanText(input.paymentMethod, 80),
        methods,
        nowIso,
      });
      if (!quote.paymentMethod) return sendJson(res, 400, { error: "Metodo de pago invalido para tu pais." });
      if (quote.rateMissing) return sendJson(res, 409, { error: "Tasa de cambio no configurada para este pais." });
      const token = token10(crypto);
      const order = createOrderRecords(db, { ...input, whatsapp }, quote, token);
      await writeDb(db);
      publishOperator(db, "xiaomi_order_created");
      return sendJson(res, 201, {
        order: publicXiaomiOrder(order, db),
        access: { code: order.code, token, url: `/pedido/${order.code}?t=${token}` },
      });
    }

    const orderMatch = pathname.match(/^\/api\/xiaomi-frp\/orders\/(AG-\d{4,5})$/);
    if (req.method === "GET" && orderMatch) {
      const db = await readDb();
      const order = findAuthorizedOrder(db, req, orderMatch[1]);
      if (!order) return sendJson(res, 404, { error: "Pedido no encontrado." });
      return sendJson(res, 200, { order: publicXiaomiOrder(order, db) });
    }

    const orderEventsMatch = pathname.match(/^\/api\/xiaomi-frp\/orders\/(AG-\d{4,5})\/events$/);
    if (req.method === "GET" && orderEventsMatch) {
      const db = await readDb();
      const order = findAuthorizedOrder(db, req, orderEventsMatch[1]);
      if (!order) return sendJson(res, 404, { error: "Pedido no encontrado." });
      res.writeHead(200, eventHeaders());
      res.write("retry: 3000\n\n");
      const stream = { res, orderId: order.id };
      if (!orderStreams.has(order.id)) orderStreams.set(order.id, new Set());
      orderStreams.get(order.id).add(stream);
      sendSseEvent(res, "order", { reason: "connected", order: publicXiaomiOrder(order, db) }, `${Date.now()}`);
      req.on("close", () => {
        orderStreams.get(order.id)?.delete(stream);
        if (!orderStreams.get(order.id)?.size) orderStreams.delete(order.id);
      });
      return;
    }

    const proofMatch = pathname.match(/^\/api\/xiaomi-frp\/orders\/(AG-\d{4,5})\/payment-proof$/);
    if (req.method === "POST" && proofMatch) {
      const input = await parseJson(req);
      const db = await readDb();
      const order = findAuthorizedOrder(db, req, proofMatch[1]);
      if (!order) return sendJson(res, 404, { error: "Pedido no encontrado." });
      const rateOk = enforcePortalRateLimit(db, req, "xiaomi_frp_payment_proof", order.id, maxPortalProofRequestsPerWindow);
      if (!rateOk) {
        audit(db, null, "XIAOMI_FRP_PAYMENT_PROOF_RATE_LIMITED", order.id, { code: order.code });
        await writeDb(db);
        return sendJson(res, 429, { error: "Demasiados comprobantes enviados. Intenta mas tarde." });
      }
      const proofs = buildPaymentProofs(input);
      if (!proofs.length) return sendJson(res, 400, { error: "Sube una imagen de comprobante." });
      const frpOrder = db.frpOrders.find((entry) => entry.id === order.frpOrderId);
      order.paymentProofs = proofs;
      order.publicStatus = "PAGO_EN_REVISION";
      order.updatedAt = nowIso();
      if (frpOrder) {
        frpOrder.paymentProofs = proofs;
        frpOrder.paymentStatus = "PAGO_EN_VALIDACION";
        frpOrder.orderStatus = "COTIZADA";
        frpOrder.paymentRejectedReason = "";
        frpOrder.updatedAt = order.updatedAt;
      }
      audit(db, null, "XIAOMI_FRP_PAYMENT_PROOF_UPLOADED", order.id, { code: order.code, proofCount: proofs.length });
      await writeDb(db);
      publishOrder(db, order, "payment_proof_uploaded");
      publishOperator(db, "payment_review_needed");
      return sendJson(res, 200, { order: publicXiaomiOrder(order, db) });
    }

    if (req.method === "POST" && pathname === "/api/xiaomi-frp/recover-code") {
      const input = await parseJson(req);
      const db = await readDb();
      const code = cleanText(input.code, 20).toUpperCase();
      const whatsapp = normalizeWhatsapp(input.whatsapp);
      const order = findOrderByCode(db, code);
      const matches = order && normalizeWhatsapp(order.customerWhatsapp) === whatsapp;
      if (matches) {
        addManualNotification(order, "RECOVER_CODE", `Cliente ${order.code} pide recuperar enlace. Verificar WhatsApp y enviar URL manualmente.`);
        audit(db, null, "XIAOMI_FRP_RECOVERY_REQUESTED", order.id, { code: order.code });
        await writeDb(db);
        publishOperator(db, "manual_notification_created");
      }
      return sendJson(res, 200, { ok: true, message: "Si los datos coinciden, un operador te contactara por WhatsApp." });
    }

    if (req.method === "GET" && pathname === "/api/xiaomi-frp/operator/queue") {
      const db = await readDb();
      if (!(await requireFrpAccess(user, res, db, "XIAOMI_FRP_QUEUE_DENIED", "xiaomi-frp-queue"))) return;
      return sendJson(res, 200, { queue: operatorQueue(db), server: xiaomiServerStatus(db, nowIso) });
    }

    if (req.method === "GET" && pathname === "/api/xiaomi-frp/operator/events") {
      const db = await readDb();
      if (!(await requireFrpAccess(user, res, db, "XIAOMI_FRP_STREAM_DENIED", "xiaomi-frp-operator-stream"))) return;
      res.writeHead(200, eventHeaders());
      res.write("retry: 3000\n\n");
      const stream = { res, userId: user.id };
      operatorStreams.add(stream);
      sendSseEvent(res, "queue", { reason: "connected", queue: operatorQueue(db) }, `${Date.now()}`);
      req.on("close", () => operatorStreams.delete(stream));
      return;
    }

    if (req.method === "PATCH" && pathname === "/api/xiaomi-frp/operator/price") {
      const input = await parseJson(req);
      const db = await readDb();
      if (!(await requireFrpAccess(user, res, db, "XIAOMI_FRP_PRICE_DENIED", "xiaomi-frp-price"))) return;
      const price = Number(input.unitPriceUsdt);
      if (!Number.isFinite(price) || price < 1 || price > 100) return sendJson(res, 400, { error: "Precio fuera de rango." });
      const rule = ensureXiaomiServiceRule(db, nowIso);
      const previous = Number(rule.baseCostUsdt || 0);
      rule.baseCostUsdt = Number(price.toFixed(2));
      rule.updatedAt = nowIso();
      rule.updatedBy = user.id;
      audit(db, user.id, "XIAOMI_FRP_PRICE_UPDATED", xiaomiFrpServiceCode, { from: previous, to: rule.baseCostUsdt });
      await writeDb(db);
      publishOperator(db, "price_updated");
      return sendJson(res, 200, { unitPriceUsdt: rule.baseCostUsdt });
    }

    if (req.method === "PATCH" && pathname === "/api/xiaomi-frp/operator/server-status") {
      const input = await parseJson(req);
      const db = await readDb();
      if (!(await requireFrpAccess(user, res, db, "XIAOMI_FRP_SERVER_STATUS_DENIED", "xiaomi-frp-server"))) return;
      const rule = ensureXiaomiServiceRule(db, nowIso);
      const next = String(input.status || "").toUpperCase() === "MAINTENANCE" ? "MAINTENANCE" : "ACTIVE";
      rule.serverStatus = next;
      rule.maintenanceMessage = cleanText(input.message || "", 180);
      rule.updatedAt = nowIso();
      rule.updatedBy = user.id;
      audit(db, user.id, "XIAOMI_FRP_SERVER_STATUS_UPDATED", "xiaomi-frp-server", { status: next });
      await writeDb(db);
      publishOperator(db, "server_status_updated");
      return sendJson(res, 200, { server: xiaomiServerStatus(db, nowIso) });
    }

    const reviewMatch = pathname.match(/^\/api\/xiaomi-frp\/operator\/orders\/(AG-\d{4,5})\/payment-review$/);
    if (req.method === "POST" && reviewMatch) {
      const input = await parseJson(req);
      const db = await readDb();
      const order = findOrderByCode(db, reviewMatch[1]);
      if (!order) return sendJson(res, 404, { error: "Pedido no encontrado." });
      if (!(await requireFrpPaymentReviewer(user, res, db, order.id))) return;
      const frpOrder = db.frpOrders.find((entry) => entry.id === order.frpOrderId);
      const jobs = frpOrder ? db.frpJobs.filter((job) => job.orderId === frpOrder.id) : [];
      const action = String(input.action || "").toLowerCase();
      if (!["approve", "reject"].includes(action)) return sendJson(res, 400, { error: "Accion invalida." });
      const timestamp = nowIso();
      if (action === "approve") {
        order.publicStatus = "LISTO_PARA_CONEXION";
        order.paymentRejectedReason = "";
        if (frpOrder) {
          frpOrder.paymentStatus = "PAGO_VALIDADO";
          frpOrder.checklist = { ...frpOrder.checklist, paymentValidated: true };
          frpOrder.orderStatus = "PAGO_VALIDADO";
          frpOrder.paymentReviewedBy = user.id;
          frpOrder.paymentReviewedAt = timestamp;
          frpOrder.paymentRejectedReason = "";
          for (const job of jobs) {
            if (job.status === "ESPERANDO_PREPARACION") job.status = "ESPERANDO_CLIENTE";
            job.updatedAt = timestamp;
          }
          syncFrpOrderStatus(db, frpOrder);
        }
      } else {
        const reason = cleanText(input.reason || "Comprobante rechazado", 200);
        order.publicStatus = "PAGO_RECHAZADO";
        order.paymentRejectedReason = reason;
        if (frpOrder) {
          frpOrder.paymentStatus = "COMPROBANTE_RECHAZADO";
          frpOrder.paymentRejectedReason = reason;
          frpOrder.paymentReviewedBy = user.id;
          frpOrder.paymentReviewedAt = timestamp;
        }
        addManualNotification(order, "PAYMENT_REJECTED", `Pedido ${order.code}: comprobante rechazado. Motivo: ${reason}`);
      }
      order.updatedAt = timestamp;
      audit(db, user.id, action === "approve" ? "XIAOMI_FRP_PAYMENT_APPROVED" : "XIAOMI_FRP_PAYMENT_REJECTED", order.id, {
        code: order.code,
        reason: cleanText(input.reason || "", 200),
      });
      await writeDb(db);
      publishOrder(db, order, action === "approve" ? "payment_approved" : "payment_rejected");
      publishOperator(db, "payment_reviewed");
      return sendJson(res, 200, { order: publicXiaomiOrder(order, db) });
    }

    const refundOrderMatch = pathname.match(/^\/api\/xiaomi-frp\/operator\/orders\/(AG-\d{4,5})\/refund$/);
    if (req.method === "POST" && refundOrderMatch) {
      const input = await parseJson(req);
      const db = await readDb();
      if (!(await requireFrpAccess(user, res, db, "XIAOMI_FRP_REFUND_DENIED", refundOrderMatch[1]))) return;
      const order = findOrderByCode(db, refundOrderMatch[1]);
      const frpOrder = order ? db.frpOrders.find((entry) => entry.id === order.frpOrderId) : null;
      if (!order || !frpOrder) return sendJson(res, 404, { error: "Pedido no encontrado." });
      const jobs = db.frpJobs.filter((job) => job.orderId === frpOrder.id);
      const refundable = jobs.filter((job) => job.status !== "FINALIZADO" && job.status !== "CANCELADO");
      const mode = String(input.mode || "partial").toLowerCase() === "total" ? "total" : "partial";
      const requestedCount = mode === "total" ? refundable.length : Math.max(1, Number.parseInt(input.count || 1, 10) || 1);
      const selected = refundable.slice(0, requestedCount);
      if (!selected.length) return sendJson(res, 409, { error: "No hay procesos pendientes para reembolsar." });
      const timestamp = nowIso();
      for (const job of selected) {
        job.status = "CANCELADO";
        job.cancelReason = "refund";
        job.canceledAt = timestamp;
        job.canceledBy = user.id;
        job.updatedAt = timestamp;
        const item = db.customerOrderItems.find((entry) => entry.id === job.portalOrderItemId);
        if (item) {
          item.status = "CANCELADO";
          item.cancelReason = "refund";
          item.canceledAt = timestamp;
          item.updatedAt = timestamp;
        }
      }
      order.publicStatus = mode === "total" ? "CANCELADO" : "REEMBOLSO_SOLICITADO";
      order.refundStatus = mode === "total" ? "TOTAL" : "PARTIAL";
      order.refundReason = cleanText(input.reason || "", 200);
      order.updatedAt = timestamp;
      syncFrpOrderStatus(db, frpOrder);
      addManualNotification(order, "REFUND", `Pedido ${order.code}: reembolso ${mode === "total" ? "total" : "parcial"} registrado.`);
      audit(db, user.id, "XIAOMI_FRP_ORDER_REFUND", order.id, {
        code: order.code,
        mode,
        count: selected.length,
        reason: order.refundReason,
      });
      await writeDb(db);
      publishOrder(db, order, "order_refund");
      publishOperator(db, "order_refund");
      return sendJson(res, 200, { order: publicXiaomiOrder(order, db) });
    }

    const processActionMatch = pathname.match(/^\/api\/xiaomi-frp\/operator\/processes\/([^/]+)\/(connected|done|incompatible|refund)$/);
    if (req.method === "POST" && processActionMatch) {
      const input = await parseJson(req);
      const db = await readDb();
      if (!(await requireFrpAccess(user, res, db, "XIAOMI_FRP_PROCESS_ACTION_DENIED", processActionMatch[1]))) return;
      const job = db.frpJobs.find((entry) => entry.id === processActionMatch[1]);
      const frpOrder = job ? db.frpOrders.find((entry) => entry.id === job.orderId && isXiaomiOrder(entry)) : null;
      const order = frpOrder ? db.customerOrders.find((entry) => entry.id === frpOrder.portalOrderId) : null;
      const item = job ? db.customerOrderItems.find((entry) => entry.id === job.portalOrderItemId) : null;
      if (!job || !frpOrder || !order) return sendJson(res, 404, { error: "Proceso no encontrado." });
      const action = processActionMatch[2];
      const timestamp = nowIso();
      if (action === "connected") {
        job.status = "LISTO_PARA_TECNICO";
        job.checklist = { ...job.checklist, clientConnected: true, requiredStateConfirmed: true, modelSupported: true };
        if (item) item.status = "CONECTADO";
        order.publicStatus = "EN_COLA";
        frpOrder.checklist = { ...frpOrder.checklist, connectionDataSent: true, authorizationConfirmed: true };
      } else if (action === "done") {
        job.status = "FINALIZADO";
        job.doneAt = timestamp;
        job.finalLog = cleanText(input.note || `Done por ${user.name || "operador"}`, 300);
        if (item) item.status = "FINALIZADO";
      } else if (action === "incompatible") {
        job.status = "CANCELADO";
        job.cancelReason = "incompatible";
        job.reviewReason = cleanText(input.reason || "Equipo incompatible", 200);
        if (item) item.status = "CANCELADO";
        order.publicStatus = "REQUIERE_ATENCION";
        addManualNotification(order, "INCOMPATIBLE_DEVICE", `Pedido ${order.code}: equipo incompatible. Avisar al cliente.`);
      } else if (action === "refund") {
        job.status = "CANCELADO";
        job.cancelReason = "refund";
        if (item) item.status = "CANCELADO";
        order.publicStatus = "REEMBOLSO_SOLICITADO";
        addManualNotification(order, "REFUND", `Pedido ${order.code}: reembolso solicitado/procesado por operador.`);
      }
      job.updatedAt = timestamp;
      if (item) item.updatedAt = timestamp;
      syncFrpOrderStatus(db, frpOrder);
      if (db.frpJobs.filter((entry) => entry.orderId === frpOrder.id).every((entry) => entry.status === "FINALIZADO")) {
        order.publicStatus = "FINALIZADO";
        frpOrder.orderStatus = "CERRADA";
      } else if (action === "done" && order.publicStatus !== "REQUIERE_ATENCION") {
        order.publicStatus = "LISTO_PARA_CONEXION";
      }
      order.updatedAt = timestamp;
      frpOrder.updatedAt = timestamp;
      audit(db, user.id, `XIAOMI_FRP_PROCESS_${action.toUpperCase()}`, job.id, { code: order.code, sequence: job.sequence });
      await writeDb(db);
      publishOrder(db, order, `process_${action}`);
      publishOperator(db, `process_${action}`);
      return sendJson(res, 200, { order: publicXiaomiOrder(order, db) });
    }

    const methodsMatch = pathname.match(/^\/api\/xiaomi-frp\/operator\/payment-methods(?:\/([^/]+))?$/);
    if (methodsMatch) {
      const db = await readDb();
      if (!(await requireFrpAccess(user, res, db, "XIAOMI_FRP_PAYMENT_METHODS_DENIED", methodsMatch[1] || "payment-methods"))) return;
      if (req.method === "GET") {
        return sendJson(res, 200, { paymentMethods: paymentMethodsWithOverrides(db).filter((method) => method.code !== "PAYPAL").map(publicPaymentMethod) });
      }
      if (req.method === "PATCH" && methodsMatch[1]) {
        const input = await parseJson(req);
        db.pricingConfig ||= {};
        db.pricingConfig.paymentMethodOverrides = Array.isArray(db.pricingConfig.paymentMethodOverrides)
          ? db.pricingConfig.paymentMethodOverrides
          : [];
        const code = decodeURIComponent(methodsMatch[1]);
        let entry = db.pricingConfig.paymentMethodOverrides.find((item) => item.code === code);
        if (!entry) {
          entry = { code, active: true, customMessage: "", updatedAt: "", updatedBy: "" };
          db.pricingConfig.paymentMethodOverrides.push(entry);
        }
        if (typeof input.active === "boolean") entry.active = input.active;
        if (typeof input.customMessage === "string") entry.customMessage = cleanText(input.customMessage, 240);
        if (typeof input.displayName === "string") entry.displayName = cleanText(input.displayName, 80);
        if (Array.isArray(input.fields)) {
          entry.fields = input.fields.slice(0, 8).map((field) => ({
            label: cleanText(field.label, 40),
            value: cleanText(field.value, 160),
            copyable: field.copyable !== false,
            monospace: Boolean(field.monospace),
          })).filter((field) => field.label && field.value);
        }
        if (input.qrImage === null) entry.qrImage = null;
        if (input.qrImage && /^data:image\/(png|jpe?g|webp);base64,/i.test(String(input.qrImage.dataUrl || ""))) {
          entry.qrImage = {
            name: cleanText(input.qrImage.name || `${code}-qr.png`, 90),
            type: cleanText(input.qrImage.type || "image/png", 30),
            size: Number(input.qrImage.size || 0),
            dataUrl: String(input.qrImage.dataUrl),
          };
        }
        entry.updatedAt = nowIso();
        entry.updatedBy = user.id;
        audit(db, user.id, "XIAOMI_FRP_PAYMENT_METHOD_UPDATED", code, { active: entry.active });
        await writeDb(db);
        publishOperator(db, "payment_method_updated");
        return sendJson(res, 200, { paymentMethods: paymentMethodsWithOverrides(db).filter((method) => method.code !== "PAYPAL").map(publicPaymentMethod) });
      }
    }

    if (req.method === "GET" && pathname === "/api/xiaomi-frp/operator/audit") {
      const db = await readDb();
      if (!(await requireFrpAccess(user, res, db, "XIAOMI_FRP_AUDIT_DENIED", "xiaomi-frp-audit"))) return;
      const entries = jsonArray(db.audit)
        .filter((entry) => String(entry.action || "").startsWith("XIAOMI_FRP_"))
        .slice(0, 200);
      return sendJson(res, 200, { audit: entries });
    }

    const notificationMatch = pathname.match(/^\/api\/xiaomi-frp\/operator\/orders\/(AG-\d{4,5})\/notifications\/([^/]+)\/sent$/);
    if (req.method === "POST" && notificationMatch) {
      const db = await readDb();
      if (!(await requireFrpAccess(user, res, db, "XIAOMI_FRP_NOTIFICATION_DENIED", notificationMatch[1]))) return;
      const order = findOrderByCode(db, notificationMatch[1]);
      if (!order) return sendJson(res, 404, { error: "Pedido no encontrado." });
      const notification = jsonArray(order.manualNotifications).find((entry) => entry.id === notificationMatch[2]);
      if (!notification) return sendJson(res, 404, { error: "Notificacion no encontrada." });
      notification.status = "SENT";
      notification.sentAt = nowIso();
      notification.sentBy = user.id;
      audit(db, user.id, "XIAOMI_FRP_MANUAL_NOTIFICATION_SENT", order.id, { code: order.code, type: notification.type });
      await writeDb(db);
      publishOperator(db, "manual_notification_sent");
      return sendJson(res, 200, { order: publicXiaomiOrder(order, db) });
    }

    return false;
  };
}
