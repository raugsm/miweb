export function createFrpRoutes({
  allowedTicketPaymentMethods,
  audit,
  cleanText,
  completeClientFromContext,
  createClient,
  crypto,
  defaultFrpJobChecklist,
  defaultFrpOrderChecklist,
  findClientByIdentity,
  formatPaymentAmount,
  frpActiveJobForUser,
  frpJobChecklistComplete,
  frpJobChecklistKeys,
  frpOrderChecklistKeys,
  frpOrderIsReady,
  frpPriceSuggestion,
  frpProviderCostModes,
  frpProviderCostUsdt,
  frpProviderStatuses,
  frpServiceCode,
  frpWorkChannel,
  masterClientIdForSource,
  maxPaymentProofImages,
  moneyNumber,
  nextFrpArdCode,
  nextFrpOrderCode,
  normalizePricingConfig,
  nowIso,
  parseClientText,
  parseJson,
  paymentMethods,
  percentNumber,
  publicFrpJob,
  publicFrpOrder,
  publicFrpPricingState,
  publicFrpState,
  publishPortalOrdersForFrpOrder,
  readDb,
  requireAdminWithAudit,
  requireFrpAccess,
  requireFrpCostManagerWithAudit,
  requireFrpPaymentReviewer,
  requireUser,
  sanitizeFinalLogImages,
  sanitizePaymentProofImages,
  sendJson,
  services,
  syncFrpOrderStatus,
  writeDb,
}) {
  return async function handleFrpApi(req, res, pathname, user) {
  if (req.method === "GET" && pathname === "/api/frp/pricing") {
    if (!requireUser(user, res)) return;
    const db = await readDb();
    if (!(await requireFrpAccess(user, res, db, "FRP_PRICING_READ_DENIED"))) return;
    return sendJson(res, 200, { pricing: publicFrpPricingState(db, user), frp: publicFrpState(db, user) });
  }

  if (req.method === "PATCH" && pathname === "/api/frp/pricing/policy") {
    if (!requireUser(user, res)) return;
    const db = await readDb();
    if (!(await requireAdminWithAudit(user, res, db, "FRP_POLICY_UPDATE_DENIED", "frp-policy", { route: pathname }, "Solo administrador puede configurar margenes FRP."))) return;
    const input = await parseJson(req);
    db.pricingConfig = normalizePricingConfig(db.pricingConfig);
    const previous = structuredClone(db.pricingConfig.frpPricing.policy);
    db.pricingConfig.frpPricing.policy = {
      ...db.pricingConfig.frpPricing.policy,
      minMarginUsdt: moneyNumber(input.minMarginUsdt),
      targetMarginUsdt: moneyNumber(input.targetMarginUsdt),
      minSellPriceUsdt: moneyNumber(input.minSellPriceUsdt),
      maxWorkerCostChangePct: percentNumber(input.maxWorkerCostChangePct),
      updatedAt: nowIso(),
      updatedBy: user.id,
    };
    audit(db, user.id, "FRP_POLICY_UPDATED", "frp-policy", {
      from: previous,
      to: db.pricingConfig.frpPricing.policy,
    });
    await writeDb(db);
    return sendJson(res, 200, { pricing: publicFrpPricingState(db, user), frp: publicFrpState(db, user) });
  }

  const frpProviderMatch = pathname.match(/^\/api\/frp\/pricing\/providers\/([^/]+)$/);
  if (req.method === "PATCH" && frpProviderMatch) {
    if (!requireUser(user, res)) return;
    const db = await readDb();
    if (!(await requireFrpCostManagerWithAudit(user, res, db, "FRP_PROVIDER_UPDATE_DENIED", frpProviderMatch[1], { route: pathname }))) return;
    const input = await parseJson(req);
    db.pricingConfig = normalizePricingConfig(db.pricingConfig);
    const provider = db.pricingConfig.frpPricing.providers.find((candidate) => candidate.id === frpProviderMatch[1]);
    if (!provider) return sendJson(res, 404, { error: "Proveedor FRP no encontrado." });
    const reason = cleanText(input.reason, 160);
    if (!reason) return sendJson(res, 400, { error: "Motivo obligatorio para cambiar costo/proveedor FRP." });
    const previous = structuredClone(provider);
    const nextStatus = frpProviderStatuses.has(String(input.status || "").toUpperCase()) ? String(input.status).toUpperCase() : provider.status;
    const nextCostMode = frpProviderCostModes.has(String(input.costMode || "").toUpperCase()) ? String(input.costMode).toUpperCase() : provider.costMode;
    const nextProvider = {
      ...provider,
      status: nextStatus,
      costMode: nextCostMode,
      fixedCostUsdt: moneyNumber(input.fixedCostUsdt ?? provider.fixedCostUsdt),
      creditsPerProcess: moneyNumber(input.creditsPerProcess ?? provider.creditsPerProcess),
      creditUnitCostUsdt: moneyNumber(input.creditUnitCostUsdt ?? provider.creditUnitCostUsdt),
      priority: Math.max(1, Number.parseInt(input.priority ?? provider.priority, 10) || provider.priority),
      reason,
      updatedAt: nowIso(),
      updatedBy: user.id,
    };
    const nextCost = frpProviderCostUsdt(nextProvider);
    if (nextProvider.status !== "OFF" && nextCost <= 0) {
      audit(db, user.id, "FRP_PROVIDER_UPDATE_BLOCKED", provider.id, { reason: "invalid_cost", input: { status: nextProvider.status, costMode: nextProvider.costMode } });
      await writeDb(db);
      return sendJson(res, 400, { error: "Costo FRP obligatorio para proveedor activo o respaldo." });
    }
    if (user.role !== "ADMIN") {
      const previousCost = frpProviderCostUsdt(provider);
      const limit = db.pricingConfig.frpPricing.policy.maxWorkerCostChangePct;
      const deltaPct = previousCost > 0 ? Math.abs(nextCost - previousCost) / previousCost * 100 : 100;
      if (deltaPct > limit) {
        audit(db, user.id, "FRP_PROVIDER_UPDATE_BLOCKED", provider.id, {
          reason: "worker_change_limit",
          previousCost,
          nextCost,
          deltaPct: percentNumber(deltaPct),
          limit,
        });
        await writeDb(db);
        return sendJson(res, 403, { error: `Cambio mayor a ${limit}%. Pide aprobacion de administrador.` });
      }
    }
    Object.assign(provider, nextProvider);
    if (provider.status === "ACTIVE") {
      for (const other of db.pricingConfig.frpPricing.providers) {
        if (other.id !== provider.id && other.status === "ACTIVE") other.status = "BACKUP";
      }
    }
    audit(db, user.id, "FRP_PROVIDER_UPDATED", provider.id, {
      from: previous,
      to: provider,
      approved: true,
      approvedByPolicy: user.role !== "ADMIN",
    });
    await writeDb(db);
    return sendJson(res, 200, { pricing: publicFrpPricingState(db, user), frp: publicFrpState(db, user) });
  }

  if (req.method === "POST" && pathname === "/api/frp/orders") {
    if (!requireUser(user, res)) return;
    const input = await parseJson(req);
    const db = await readDb();
    if (!(await requireFrpAccess(user, res, db, "FRP_ORDER_CREATE_DENIED"))) return;
    let client = db.clients.find((candidate) => candidate.id === input.clientId);
    if (!client) {
      const parsedClient = parseClientText(input.clientText);
      if (!parsedClient) return sendJson(res, 400, { error: "Escribe cliente y pais. Ejemplo: Javier Lozano Colombia." });
      client = findClientByIdentity(db, parsedClient.name, parsedClient.country, parsedClient.whatsapp)
        || createClient(db, user, parsedClient.name, parsedClient.country, parsedClient.whatsapp);
      completeClientFromContext(db, user, client, parsedClient.whatsapp);
    }
    completeClientFromContext(db, user, client);
    const quantity = Math.max(1, Math.min(50, Number.parseInt(input.quantity, 10) || 1));
    const payment = paymentMethods.find((candidate) => candidate.code === input.paymentMethod);
    const allowedPayments = allowedTicketPaymentMethods();
    if (!payment || !allowedPayments.some((candidate) => candidate.code === payment.code)) {
      return sendJson(res, 400, { error: "Metodo de pago no disponible para orden FRP." });
    }
    const suggestion = frpPriceSuggestion(db, client.id, quantity);
    if (!suggestion.available) {
      audit(db, user.id, "FRP_ORDER_BLOCKED_PRICING_UNAVAILABLE", client.id, {
        quantity,
        reason: suggestion.error || "pricing_unavailable",
      });
      await writeDb(db);
      return sendJson(res, 503, { error: suggestion.error || "Xiaomi FRP no tiene precio activo en este momento." });
    }
    const requestedUnitPrice = Object.hasOwn(input, "unitPrice") ? moneyNumber(input.unitPrice) : suggestion.unitPrice;
    if (requestedUnitPrice <= 0) return sendJson(res, 400, { error: "Precio unitario obligatorio." });
    if (requestedUnitPrice !== suggestion.unitPrice && user.role !== "ADMIN") {
      audit(db, user.id, "FRP_PRICE_OVERRIDE_BLOCKED", client.id, {
        requestedUnitPrice,
        suggestedUnitPrice: suggestion.unitPrice,
        quantity,
      });
      await writeDb(db);
      return sendJson(res, 403, { error: "El precio FRP se calcula desde el proveedor activo. Actualiza el proveedor si el costo cambio." });
    }
    const finalUnitPrice = user.role === "ADMIN" ? requestedUnitPrice : suggestion.unitPrice;
    const orderPricingSnapshot = {
      ...suggestion.pricingSnapshot,
      unitPrice: finalUnitPrice,
      total: moneyNumber(finalUnitPrice * quantity),
      manualOverride: finalUnitPrice !== suggestion.unitPrice,
      overriddenBy: finalUnitPrice !== suggestion.unitPrice ? user.id : "",
    };
    const order = {
      id: crypto.randomUUID(),
      code: nextFrpOrderCode(db),
      clientId: client.id,
      masterClientId: client.masterClientId || masterClientIdForSource(db, "INTERNAL_CLIENT", client.id),
      clientName: client.name,
      clientWhatsapp: client.whatsapp,
      country: client.country,
      serviceCode: frpServiceCode,
      serviceName: services.find((service) => service.code === frpServiceCode)?.name || "Xiaomi Cuenta Google",
      workChannel: frpWorkChannel,
      quantity,
      baseUnitPrice: suggestion.pricingSnapshot?.baseUnitPrice || suggestion.unitPrice,
      suggestedUnitPrice: suggestion.unitPrice,
      unitPrice: finalUnitPrice,
      discountLabel: finalUnitPrice < (suggestion.pricingSnapshot?.baseUnitPrice || suggestion.unitPrice) ? suggestion.label : "Normal",
      monthlyUsageAtCreation: suggestion.monthlyUsage,
      nextMonthlyTier: suggestion.nextMonthlyTier,
      totalPrice: moneyNumber(finalUnitPrice * quantity),
      priceFormatted: formatPaymentAmount(finalUnitPrice * quantity, payment),
      pricingSnapshot: orderPricingSnapshot,
      paymentMethod: payment.code,
      paymentLabel: payment.label,
      paymentDetails: payment.details,
      paymentProofs: [],
      paymentStatus: "ESPERANDO_COMPROBANTE",
      orderStatus: "COTIZADA",
      checklist: defaultFrpOrderChecklist(),
      createdBy: user.id,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    const jobs = Array.from({ length: quantity }, (_, index) => ({
      id: crypto.randomUUID(),
      code: `${order.code}-${index + 1}`,
      orderId: order.id,
      sequence: index + 1,
      totalJobs: quantity,
      workChannel: frpWorkChannel,
      serviceCode: frpServiceCode,
      serviceName: order.serviceName,
      clientName: order.clientName,
      country: order.country,
      status: "ESPERANDO_PREPARACION",
      checklist: defaultFrpJobChecklist(),
      technicianId: "",
      createdAt: nowIso(),
      updatedAt: nowIso(),
      finalLog: "",
      finalImages: [],
      ardCode: "",
    }));
    db.frpOrders.unshift(order);
    db.frpJobs.unshift(...jobs);
    audit(db, user.id, "FRP_ORDER_CREATED", order.id, {
      code: order.code,
      client: order.clientName,
      quantity,
      unitPrice: order.unitPrice,
      totalPrice: order.totalPrice,
      discountLabel: order.discountLabel,
    });
    audit(db, user.id, "FRP_JOBS_CREATED", order.id, { jobCount: jobs.length });
    await writeDb(db);
    return sendJson(res, 201, { order: publicFrpOrder(order, db), frp: publicFrpState(db, user) });
  }

  const frpOrderChecklistMatch = pathname.match(/^\/api\/frp\/orders\/([^/]+)\/checklist$/);
  if (req.method === "PATCH" && frpOrderChecklistMatch) {
    if (!requireUser(user, res)) return;
    const input = await parseJson(req);
    const db = await readDb();
    if (!(await requireFrpAccess(user, res, db, "FRP_ORDER_CHECKLIST_DENIED", frpOrderChecklistMatch[1]))) return;
    const order = db.frpOrders.find((candidate) => candidate.id === frpOrderChecklistMatch[1]);
    if (!order) return sendJson(res, 404, { error: "Orden FRP no encontrada." });
    const key = cleanText(input.key, 40);
    if (!frpOrderChecklistKeys.includes(key) || key === "paymentValidated") {
      return sendJson(res, 400, { error: "Checklist de orden invalido." });
    }
    order.checklist[key] = Boolean(input.value);
    order.updatedAt = nowIso();
    const actionByKey = {
      priceSent: "FRP_PRICE_SENT",
      connectionDataSent: "FRP_CONNECTION_SENT",
      authorizationConfirmed: "FRP_AUTH_CONFIRMED",
    };
    syncFrpOrderStatus(db, order);
    audit(db, user.id, actionByKey[key] || "FRP_ORDER_CHECKLIST_UPDATED", order.id, { key, value: order.checklist[key], orderStatus: order.orderStatus });
    await writeDb(db);
    publishPortalOrdersForFrpOrder(db, order, "frp_order_checklist_updated");
    return sendJson(res, 200, { order: publicFrpOrder(order, db), frp: publicFrpState(db, user) });
  }

  const frpOrderPaymentProofMatch = pathname.match(/^\/api\/frp\/orders\/([^/]+)\/payment-proof$/);
  if (req.method === "PATCH" && frpOrderPaymentProofMatch) {
    if (!requireUser(user, res)) return;
    const input = await parseJson(req);
    const db = await readDb();
    if (!(await requireFrpAccess(user, res, db, "FRP_PAYMENT_PROOF_DENIED", frpOrderPaymentProofMatch[1]))) return;
    const order = db.frpOrders.find((candidate) => candidate.id === frpOrderPaymentProofMatch[1]);
    if (!order) return sendJson(res, 404, { error: "Orden FRP no encontrada." });
    const proofs = sanitizePaymentProofImages(input.paymentProofs);
    if (!proofs.length) return sendJson(res, 400, { error: "Carga al menos una imagen de comprobante." });
    const existingProofs = Array.isArray(order.paymentProofs) ? order.paymentProofs : [];
    if (existingProofs.length + proofs.length > maxPaymentProofImages) {
      return sendJson(res, 400, { error: `Maximo ${maxPaymentProofImages} comprobantes por orden.` });
    }
    const proofHashes = proofs.map((proof) => proof.hash).filter(Boolean);
    if (new Set(proofHashes).size !== proofHashes.length) return sendJson(res, 409, { error: "Subiste la misma imagen mas de una vez." });
    const existingHashes = new Set(existingProofs.map((proof) => proof.hash).filter(Boolean));
    if (proofs.some((proof) => existingHashes.has(proof.hash))) return sendJson(res, 409, { error: "Ese comprobante ya esta cargado en esta orden." });
    for (const otherOrder of db.frpOrders) {
      if (otherOrder.id === order.id) continue;
      const reusedProof = (otherOrder.paymentProofs || []).find((proof) => proofHashes.includes(proof.hash));
      if (reusedProof) return sendJson(res, 409, { error: `Ese comprobante ya fue usado en la orden ${otherOrder.code}.` });
    }
    for (const ticket of db.tickets) {
      const reusedProof = (ticket.paymentProofs || []).find((proof) => proofHashes.includes(proof.hash));
      if (reusedProof) return sendJson(res, 409, { error: `Ese comprobante ya fue usado en el ticket ${ticket.code}.` });
    }
    order.paymentProofs = existingProofs.concat(proofs.map((proof) => ({ ...proof, uploadedBy: user.id, uploadedAt: nowIso(), reviewStatus: "PENDIENTE" })));
    if (order.paymentStatus !== "COMPROBANTE_RECIBIDO") order.paymentStatus = "PAGO_EN_VALIDACION";
    order.updatedAt = nowIso();
    audit(db, user.id, "FRP_PAYMENT_PROOF_UPLOADED", order.id, { code: order.code, proofCount: proofs.length });
    await writeDb(db);
    publishPortalOrdersForFrpOrder(db, order, "frp_payment_proof_uploaded");
    return sendJson(res, 200, { order: publicFrpOrder(order, db), frp: publicFrpState(db, user) });
  }

  const frpOrderPaymentReviewMatch = pathname.match(/^\/api\/frp\/orders\/([^/]+)\/payment-review$/);
  if (req.method === "PATCH" && frpOrderPaymentReviewMatch) {
    if (!requireUser(user, res)) return;
    const input = await parseJson(req);
    const db = await readDb();
    if (!(await requireFrpPaymentReviewer(user, res, db, frpOrderPaymentReviewMatch[1]))) return;
    const order = db.frpOrders.find((candidate) => candidate.id === frpOrderPaymentReviewMatch[1]);
    if (!order) return sendJson(res, 404, { error: "Orden FRP no encontrada." });
    const action = cleanText(input.action, 20);
    const proofs = Array.isArray(order.paymentProofs) ? order.paymentProofs : [];
    if (!proofs.length) return sendJson(res, 400, { error: "No hay comprobante cargado para validar." });
    if (action === "approve") {
      order.paymentStatus = "COMPROBANTE_RECIBIDO";
      order.checklist.paymentValidated = true;
      order.paymentReviewedBy = user.id;
      order.paymentReviewedAt = nowIso();
      order.paymentProofs = proofs.map((proof) => ({ ...proof, reviewStatus: "VALIDADO", reviewedBy: user.id, reviewedAt: order.paymentReviewedAt }));
    } else if (action === "reject") {
      order.paymentStatus = "COMPROBANTE_RECHAZADO";
      order.checklist.paymentValidated = false;
      order.paymentReviewedBy = user.id;
      order.paymentReviewedAt = nowIso();
      order.paymentRejectedReason = cleanText(input.reason, 160) || "Comprobante rechazado";
      order.paymentProofs = proofs.map((proof) => ({ ...proof, reviewStatus: "RECHAZADO", reviewedBy: user.id, reviewedAt: order.paymentReviewedAt }));
    } else {
      return sendJson(res, 400, { error: "Accion de validacion invalida." });
    }
    order.updatedAt = nowIso();
    syncFrpOrderStatus(db, order);
    audit(db, user.id, action === "approve" ? "FRP_PAYMENT_VALIDATED" : "FRP_PAYMENT_REJECTED", order.id, { code: order.code, orderStatus: order.orderStatus });
    await writeDb(db);
    publishPortalOrdersForFrpOrder(db, order, action === "approve" ? "frp_payment_validated" : "frp_payment_rejected");
    return sendJson(res, 200, { order: publicFrpOrder(order, db), frp: publicFrpState(db, user) });
  }

  const frpJobChecklistMatch = pathname.match(/^\/api\/frp\/jobs\/([^/]+)\/checklist$/);
  if (req.method === "PATCH" && frpJobChecklistMatch) {
    if (!requireUser(user, res)) return;
    const input = await parseJson(req);
    const db = await readDb();
    if (!(await requireFrpAccess(user, res, db, "FRP_JOB_CHECKLIST_DENIED", frpJobChecklistMatch[1]))) return;
    const job = db.frpJobs.find((candidate) => candidate.id === frpJobChecklistMatch[1]);
    if (!job) return sendJson(res, 404, { error: "Trabajo FRP no encontrado." });
    const key = cleanText(input.key, 40);
    if (!frpJobChecklistKeys.includes(key)) return sendJson(res, 400, { error: "Checklist de equipo invalido." });
    job.checklist[key] = Boolean(input.value);
    job.updatedAt = nowIso();
    audit(db, user.id, "FRP_JOB_CHECKLIST_UPDATED", job.id, { code: job.code, key, value: job.checklist[key] });
    await writeDb(db);
    return sendJson(res, 200, { job: publicFrpJob(job, db), frp: publicFrpState(db, user) });
  }

  const frpJobReadyMatch = pathname.match(/^\/api\/frp\/jobs\/([^/]+)\/ready$/);
  if (req.method === "PATCH" && frpJobReadyMatch) {
    if (!requireUser(user, res)) return;
    const db = await readDb();
    if (!(await requireFrpAccess(user, res, db, "FRP_JOB_READY_DENIED", frpJobReadyMatch[1]))) return;
    const job = db.frpJobs.find((candidate) => candidate.id === frpJobReadyMatch[1]);
    const order = db.frpOrders.find((candidate) => candidate.id === job?.orderId);
    if (!job || !order) return sendJson(res, 404, { error: "Trabajo FRP no encontrado." });
    if (!frpOrderIsReady(order)) return sendJson(res, 400, { error: "Falta pago validado, conexion enviada o autorizacion confirmada." });
    if (!frpJobChecklistComplete(job)) return sendJson(res, 400, { error: "Completa conexion, estado requerido y modelo soportado." });
    if (!["ESPERANDO_PREPARACION", "ESPERANDO_CLIENTE", "REQUIERE_REVISION"].includes(job.status)) {
      return sendJson(res, 400, { error: "Este trabajo no puede enviarse a tecnico desde su estado actual." });
    }
    job.status = "LISTO_PARA_TECNICO";
    job.readyAt = nowIso();
    job.updatedAt = job.readyAt;
    syncFrpOrderStatus(db, order);
    audit(db, user.id, "FRP_JOB_READY", job.id, { code: job.code, order: order.code });
    await writeDb(db);
    publishPortalOrdersForFrpOrder(db, order, "frp_job_ready");
    return sendJson(res, 200, { job: publicFrpJob(job, db), frp: publicFrpState(db, user) });
  }

  if (req.method === "POST" && pathname === "/api/frp/jobs/take-next") {
    if (!requireUser(user, res)) return;
    const db = await readDb();
    if (!(await requireFrpAccess(user, res, db, "FRP_JOB_TAKE_DENIED"))) return;
    const activeJob = frpActiveJobForUser(db, user);
    if (activeJob) return sendJson(res, 409, { error: `Ya tienes un FRP en proceso: ${activeJob.code}.` });
    const job = db.frpJobs
      .filter((candidate) => candidate.status === "LISTO_PARA_TECNICO")
      .sort((a, b) => String(a.readyAt || a.updatedAt || a.createdAt).localeCompare(String(b.readyAt || b.updatedAt || b.createdAt)))[0];
    if (!job) return sendJson(res, 404, { error: "No hay trabajos FRP listos." });
    job.status = "EN_PROCESO";
    job.technicianId = user.id;
    job.takenAt = nowIso();
    job.updatedAt = job.takenAt;
    const order = db.frpOrders.find((candidate) => candidate.id === job.orderId);
    if (order) syncFrpOrderStatus(db, order);
    audit(db, user.id, "FRP_JOB_TAKEN", job.id, { code: job.code, order: order?.code || "" });
    await writeDb(db);
    publishPortalOrdersForFrpOrder(db, order, "frp_job_taken");
    return sendJson(res, 200, { job: publicFrpJob(job, db), frp: publicFrpState(db, user) });
  }

  const frpJobFinalizeMatch = pathname.match(/^\/api\/frp\/jobs\/([^/]+)\/finalize$/);
  if (req.method === "PATCH" && frpJobFinalizeMatch) {
    if (!requireUser(user, res)) return;
    const input = await parseJson(req);
    const db = await readDb();
    if (!(await requireFrpAccess(user, res, db, "FRP_JOB_FINALIZE_DENIED", frpJobFinalizeMatch[1]))) return;
    const job = db.frpJobs.find((candidate) => candidate.id === frpJobFinalizeMatch[1]);
    const order = db.frpOrders.find((candidate) => candidate.id === job?.orderId);
    if (!job || !order) return sendJson(res, 404, { error: "Trabajo FRP no encontrado." });
    if (job.technicianId && job.technicianId !== user.id && user.role !== "ADMIN") return sendJson(res, 403, { error: "Este trabajo lo tomo otro tecnico." });
    if (job.status !== "EN_PROCESO" && user.role !== "ADMIN") return sendJson(res, 400, { error: "Solo puedes finalizar un trabajo en proceso." });
    const finalLog = cleanText(input.finalLog, 500);
    const finalImages = sanitizeFinalLogImages(input.finalImages);
    if (!finalLog && !finalImages.length) return sendJson(res, 400, { error: "Para finalizar se requiere log escrito o imagen." });
    job.status = "FINALIZADO";
    job.finalLog = finalLog || job.finalLog;
    if (finalImages.length) job.finalImages = finalImages;
    job.ardCode ||= nextFrpArdCode(db);
    job.doneAt = nowIso();
    job.updatedAt = job.doneAt;
    job.technicianId ||= user.id;
    syncFrpOrderStatus(db, order);
    audit(db, user.id, "FRP_JOB_DONE", job.id, { code: job.code, order: order.code, ardCode: job.ardCode });
    await writeDb(db);
    publishPortalOrdersForFrpOrder(db, order, "frp_job_done");
    return sendJson(res, 200, { job: publicFrpJob(job, db), frp: publicFrpState(db, user) });
  }

  const frpJobReviewMatch = pathname.match(/^\/api\/frp\/jobs\/([^/]+)\/review$/);
  if (req.method === "PATCH" && frpJobReviewMatch) {
    if (!requireUser(user, res)) return;
    const input = await parseJson(req);
    const db = await readDb();
    if (!(await requireFrpAccess(user, res, db, "FRP_JOB_REVIEW_DENIED", frpJobReviewMatch[1]))) return;
    const job = db.frpJobs.find((candidate) => candidate.id === frpJobReviewMatch[1]);
    const order = db.frpOrders.find((candidate) => candidate.id === job?.orderId);
    if (!job || !order) return sendJson(res, 404, { error: "Trabajo FRP no encontrado." });
    if (job.technicianId && job.technicianId !== user.id && user.role !== "ADMIN") return sendJson(res, 403, { error: "Este trabajo lo tomo otro tecnico." });
    const reason = cleanText(input.reason, 180);
    if (!reason) return sendJson(res, 400, { error: "Indica motivo de revision." });
    job.status = "REQUIERE_REVISION";
    job.reviewReason = reason;
    job.updatedAt = nowIso();
    syncFrpOrderStatus(db, order);
    audit(db, user.id, "FRP_JOB_REVIEW_REQUIRED", job.id, { code: job.code, order: order.code, reason });
    await writeDb(db);
    publishPortalOrdersForFrpOrder(db, order, "frp_job_review_required");
    return sendJson(res, 200, { job: publicFrpJob(job, db), frp: publicFrpState(db, user) });
  }

  return false;
  };
}
