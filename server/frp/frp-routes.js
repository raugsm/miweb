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
  publishPortalOrdersForAll,
  classifyCostChange,
  computeProviderBaseline,
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
    publishPortalOrdersForAll(db, "pricing_policy_updated");
    return sendJson(res, 200, { pricing: publicFrpPricingState(db, user), frp: publicFrpState(db, user) });
  }

  // PR-2a.7: crear provider nuevo. Bryam (admin) puede agregar herramientas en
  // rotacion (4-7 normalmente). Validaciones: nombre unico, costo 1-100 USDT,
  // motivo >=15 chars. Provider arranca en bootstrap (history vacia para ese id)
  // hasta acumular 3 entries o pasar 7 dias.
  if (req.method === "POST" && pathname === "/api/frp/pricing/providers") {
    if (!requireUser(user, res)) return;
    const db = await readDb();
    if (!(await requireFrpCostManagerWithAudit(user, res, db, "FRP_PROVIDER_CREATE_DENIED", "frp-provider-new", { route: pathname }))) return;
    const input = await parseJson(req);
    db.pricingConfig = normalizePricingConfig(db.pricingConfig);
    const name = cleanText(input.name, 40);
    const reason = cleanText(input.reason, 200);
    const status = frpProviderStatuses.has(String(input.status || "").toUpperCase()) ? String(input.status).toUpperCase() : "OFF";
    const costMode = frpProviderCostModes.has(String(input.costMode || "").toUpperCase()) ? String(input.costMode).toUpperCase() : "FIXED_USDT";
    if (!name) return sendJson(res, 400, { error: "Nombre del proveedor es obligatorio." });
    if (reason.length < 15) return sendJson(res, 400, { error: `Motivo de creacion necesita >=15 caracteres (actuales: ${reason.length}).` });
    if (status === "ARCHIVED") return sendJson(res, 400, { error: "No se puede crear un proveedor ya archivado." });
    const nameLower = name.toLowerCase();
    const duplicate = db.pricingConfig.frpPricing.providers.find((p) => String(p.name || "").toLowerCase() === nameLower);
    if (duplicate) return sendJson(res, 409, { error: `Ya existe un proveedor con nombre "${name}". Si era archivado, restauralo desde la BD.` });
    const fixedCostUsdt = moneyNumber(input.fixedCostUsdt ?? 0);
    const creditsPerProcess = moneyNumber(input.creditsPerProcess ?? 0);
    const creditUnitCostUsdt = moneyNumber(input.creditUnitCostUsdt ?? 0);
    const initialCost = costMode === "CREDITS"
      ? moneyNumber(creditsPerProcess * creditUnitCostUsdt)
      : fixedCostUsdt;
    if (status !== "OFF" && initialCost <= 0) {
      return sendJson(res, 400, { error: "Costo inicial obligatorio para proveedor activo o respaldo." });
    }
    if (initialCost > 0 && (initialCost < 1 || initialCost > 100)) {
      return sendJson(res, 400, { error: `Costo inicial fuera de rango realista (${initialCost.toFixed(2)} USDT). Debe estar entre 1 y 100 USDT.`, level: 5 });
    }
    const newProvider = {
      id: crypto.randomUUID(),
      name,
      status,
      costMode,
      fixedCostUsdt,
      creditsPerProcess,
      creditUnitCostUsdt,
      priority: Math.max(1, db.pricingConfig.frpPricing.providers.length + 1),
      reason,
      updatedAt: nowIso(),
      updatedBy: user.id,
    };
    db.pricingConfig.frpPricing.providers.push(newProvider);
    if (newProvider.status === "ACTIVE") {
      for (const other of db.pricingConfig.frpPricing.providers) {
        if (other.id !== newProvider.id && other.status === "ACTIVE") other.status = "BACKUP";
      }
    }
    if (initialCost > 0) {
      db.frpProviderCostHistory.unshift({
        id: crypto.randomUUID(),
        providerId: newProvider.id,
        costUsdt: initialCost,
        recordedAt: newProvider.updatedAt,
        recordedBy: user.id,
        reason,
        level: 1,
        deltaPct: 0,
        baselineNote: "baseline_pending",
      });
      if (db.frpProviderCostHistory.length > 500) db.frpProviderCostHistory.length = 500;
    }
    audit(db, user.id, "FRP_PROVIDER_CREATED", newProvider.id, {
      name: newProvider.name,
      status: newProvider.status,
      costMode: newProvider.costMode,
      initialCost,
      reason,
    });
    await writeDb(db);
    publishPortalOrdersForAll(db, "pricing_provider_created");
    return sendJson(res, 201, { pricing: publicFrpPricingState(db, user), frp: publicFrpState(db, user), providerId: newProvider.id });
  }

  // PR-2a.7: archivar provider. Estado terminal, no se elimina. Audita motivo.
  const frpProviderArchiveMatch = pathname.match(/^\/api\/frp\/pricing\/providers\/([^/]+)\/archive$/);
  if (req.method === "POST" && frpProviderArchiveMatch) {
    if (!requireUser(user, res)) return;
    const db = await readDb();
    if (!(await requireFrpCostManagerWithAudit(user, res, db, "FRP_PROVIDER_ARCHIVE_DENIED", frpProviderArchiveMatch[1], { route: pathname }))) return;
    const input = await parseJson(req);
    db.pricingConfig = normalizePricingConfig(db.pricingConfig);
    const provider = db.pricingConfig.frpPricing.providers.find((p) => p.id === frpProviderArchiveMatch[1]);
    if (!provider) return sendJson(res, 404, { error: "Proveedor FRP no encontrado." });
    const reason = cleanText(input.reason, 200);
    if (!reason) return sendJson(res, 400, { error: "Motivo de archivado obligatorio." });
    if (provider.status === "ARCHIVED") return sendJson(res, 409, { error: "El proveedor ya estaba archivado." });
    const previousStatus = provider.status;
    const wasActive = provider.status === "ACTIVE";
    provider.status = "ARCHIVED";
    provider.reason = reason;
    provider.updatedAt = nowIso();
    provider.updatedBy = user.id;
    audit(db, user.id, "FRP_PROVIDER_ARCHIVED", provider.id, {
      name: provider.name,
      previousStatus,
      reason,
    });
    // Si era el activo, hay que promover otro BACKUP a ACTIVE para no quedar
    // sin proveedor (caso contrario frpCurrentPricing.available = false).
    if (wasActive) {
      const promote = db.pricingConfig.frpPricing.providers
        .filter((p) => p.id !== provider.id && p.status === "BACKUP")
        .sort((a, b) => Number(a.priority || 99) - Number(b.priority || 99))[0];
      if (promote) {
        promote.status = "ACTIVE";
        promote.updatedAt = nowIso();
        audit(db, user.id, "FRP_PROVIDER_AUTO_PROMOTED", promote.id, {
          fromStatus: "BACKUP",
          reason: `Auto-promovido tras archivar ${provider.name}`,
        });
      }
    }
    await writeDb(db);
    publishPortalOrdersForAll(db, "pricing_provider_archived");
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
    // PR-2a.7: archived es terminal — no permitimos editar via PATCH. Para
    // "restaurar" (caso raro, dev tool), se hace direct en BD con auditoria.
    if (provider.status === "ARCHIVED") {
      return sendJson(res, 409, { error: "Proveedor archivado. No se puede editar — creá uno nuevo si necesitás reincorporarlo." });
    }
    const reason = cleanText(input.reason, 200);
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
    const previousCost = frpProviderCostUsdt(provider);
    if (nextProvider.status !== "OFF" && nextCost <= 0) {
      audit(db, user.id, "FRP_PROVIDER_UPDATE_BLOCKED", provider.id, { reason: "invalid_cost", input: { status: nextProvider.status, costMode: nextProvider.costMode } });
      await writeDb(db);
      return sendJson(res, 400, { error: "Costo FRP obligatorio para proveedor activo o respaldo." });
    }
    // PR-2a.6: validacion dinamica de cambio de costo en 5 niveles.
    // Solo aplica cuando hay un cambio EFECTIVO de costo (no solo status/priority).
    const costChanged = Math.abs(nextCost - previousCost) > 0.0001;
    let classification = { level: 1, deltaPct: 0, reason: "no_cost_change", baseline: null };
    if (costChanged) {
      const baseline = computeProviderBaseline(db.frpProviderCostHistory, provider.id, 7);
      classification = classifyCostChange(nextCost, baseline);
      // Nivel 5: rango absoluto. Rechazo inmediato.
      if (classification.level === 5) {
        audit(db, user.id, "FRP_PROVIDER_UPDATE_REJECTED_L5", provider.id, {
          previousCost, nextCost, deltaPct: classification.deltaPct, reason: "absolute_range",
        });
        await writeDb(db);
        return sendJson(res, 400, {
          error: `Valor fuera de rango realista (${nextCost.toFixed(2)} USDT). Verificá lo escrito — debe estar entre 1 y 100 USDT.`,
          level: 5,
        });
      }
      // Nivel 2: requiere confirmacion explicita.
      if (classification.level === 2 && !input.confirmed) {
        return sendJson(res, 412, {
          requiresConfirmation: true,
          level: 2,
          message: `Cambio mediano de ${classification.deltaPct.toFixed(1)}% sobre el promedio 7d (${baseline.avg.toFixed(2)} USDT). Confirmá: ${provider.name} ${previousCost.toFixed(2)} → ${nextCost.toFixed(2)} USDT.`,
          baseline,
          previousCost, nextCost, deltaPct: classification.deltaPct,
        });
      }
      // Nivel 3: requiere confirmacion + motivo >= 15 chars.
      if (classification.level === 3) {
        if (!input.confirmed) {
          return sendJson(res, 412, {
            requiresConfirmation: true,
            level: 3,
            message: `Cambio importante de ${classification.deltaPct.toFixed(1)}% sobre el promedio 7d. Necesita motivo detallado (≥15 caracteres) y confirmación.`,
            baseline,
            previousCost, nextCost, deltaPct: classification.deltaPct,
          });
        }
        if (reason.length < 15) {
          return sendJson(res, 400, {
            error: `Cambio nivel 3 requiere motivo detallado (≥15 caracteres, actuales: ${reason.length}).`,
            level: 3,
          });
        }
      }
      // Nivel 4: bloqueo. Crea pendingChange y queda esperando aprobacion admin.
      // Ajuste post-test: requiere motivo MAS detallado que nivel 3 (25 chars vs 15)
      // — un cambio mas drastico necesita mas contexto para que el admin pueda
      // aprobarlo informado. Protege a Bryam de aprobar "test" sin saber por que.
      if (classification.level === 4) {
        if (reason.length < 25) {
          return sendJson(res, 400, {
            error: `Cambio nivel 4 requiere motivo detallado (≥25 caracteres, actuales: ${reason.length}). Bryam necesita contexto suficiente para aprobar.`,
            level: 4,
          });
        }
        const adminUserId = (db.users.find((u) => u.role === "ADMIN") || {}).id;
        const pendingChange = {
          id: crypto.randomUUID(),
          providerId: provider.id,
          providerName: provider.name,
          previousCost,
          nextCost,
          nextProvider: { ...nextProvider }, // snapshot completo para aplicar al aprobar
          deltaPct: classification.deltaPct,
          baselineAvg: classification.baseline.avg,
          requestedBy: user.id,
          requestedReason: reason,
          requestedAt: nowIso(),
          status: "PENDING",
          notifyAdminId: adminUserId || "",
        };
        db.frpPendingCostChanges.unshift(pendingChange);
        audit(db, user.id, "FRP_PROVIDER_UPDATE_PENDING_L4", provider.id, {
          pendingId: pendingChange.id, previousCost, nextCost, deltaPct: classification.deltaPct,
        });
        await writeDb(db);
        return sendJson(res, 202, {
          level: 4,
          pendingChange: { id: pendingChange.id, deltaPct: classification.deltaPct, requiresAdminApproval: true },
          message: `Cambio drastico (${classification.deltaPct.toFixed(1)}%). Queda PENDIENTE de aprobacion de admin. ID: ${pendingChange.id}.`,
        });
      }
    }
    // Nivel 1, 2-confirmado, 3-confirmado: aplica cambio.
    Object.assign(provider, nextProvider);
    if (provider.status === "ACTIVE") {
      for (const other of db.pricingConfig.frpPricing.providers) {
        if (other.id !== provider.id && other.status === "ACTIVE") other.status = "BACKUP";
      }
    }
    if (costChanged) {
      db.frpProviderCostHistory.unshift({
        id: crypto.randomUUID(),
        providerId: provider.id,
        costUsdt: nextCost,
        recordedAt: nowIso(),
        recordedBy: user.id,
        reason,
        level: classification.level,
        deltaPct: classification.deltaPct,
      });
      // Cap a las ultimas 500 entradas total para evitar crecimiento infinito.
      if (db.frpProviderCostHistory.length > 500) {
        db.frpProviderCostHistory.length = 500;
      }
    }
    audit(db, user.id, "FRP_PROVIDER_UPDATED", provider.id, {
      from: previous,
      to: provider,
      level: classification.level,
      deltaPct: classification.deltaPct,
      baselineNote: classification.reason,
    });
    await writeDb(db);
    publishPortalOrdersForAll(db, "pricing_provider_updated");
    return sendJson(res, 200, {
      pricing: publicFrpPricingState(db, user),
      frp: publicFrpState(db, user),
      level: classification.level,
      deltaPct: classification.deltaPct,
    });
  }

  // PR-2a.6: GET pending cost changes (solo admin ve la cola).
  if (req.method === "GET" && pathname === "/api/frp/pricing/pending-changes") {
    if (!requireUser(user, res)) return;
    const db = await readDb();
    if (user.role !== "ADMIN") return sendJson(res, 403, { error: "Solo admin puede ver cola de cambios pendientes." });
    const pending = (db.frpPendingCostChanges || [])
      .filter((c) => c.status === "PENDING")
      .map((c) => ({
        id: c.id,
        providerId: c.providerId,
        providerName: c.providerName,
        previousCost: c.previousCost,
        nextCost: c.nextCost,
        deltaPct: c.deltaPct,
        baselineAvg: c.baselineAvg,
        requestedBy: c.requestedBy,
        requestedReason: c.requestedReason,
        requestedAt: c.requestedAt,
      }));
    return sendJson(res, 200, { pendingChanges: pending });
  }

  // PR-2a.6: aprobar/rechazar cambio pendiente nivel 4 (solo admin).
  const pendingChangeMatch = pathname.match(/^\/api\/frp\/pricing\/pending-changes\/([^/]+)\/(approve|reject)$/);
  if (req.method === "POST" && pendingChangeMatch) {
    if (!requireUser(user, res)) return;
    const db = await readDb();
    if (user.role !== "ADMIN") return sendJson(res, 403, { error: "Solo admin puede aprobar/rechazar cambios drásticos." });
    const input = await parseJson(req);
    const action = pendingChangeMatch[2];
    const pendingId = pendingChangeMatch[1];
    const pending = (db.frpPendingCostChanges || []).find((c) => c.id === pendingId);
    if (!pending) return sendJson(res, 404, { error: "Cambio pendiente no encontrado." });
    if (pending.status !== "PENDING") return sendJson(res, 409, { error: "Este cambio ya fue procesado." });
    const decisionReason = cleanText(input.reason, 200);
    if (!decisionReason) return sendJson(res, 400, { error: "Motivo de decisión obligatorio." });
    pending.approvedBy = user.id;
    pending.approvedAt = nowIso();
    pending.approvedReason = decisionReason;
    if (action === "approve") {
      pending.status = "APPROVED";
      const provider = db.pricingConfig.frpPricing.providers.find((p) => p.id === pending.providerId);
      if (!provider) {
        pending.status = "REJECTED";
        pending.approvedReason = `(auto-rejected) provider no longer exists: ${decisionReason}`;
        await writeDb(db);
        return sendJson(res, 404, { error: "El proveedor ya no existe." });
      }
      // Aplica el snapshot guardado.
      Object.assign(provider, pending.nextProvider, { updatedAt: pending.approvedAt, updatedBy: pending.requestedBy });
      if (provider.status === "ACTIVE") {
        for (const other of db.pricingConfig.frpPricing.providers) {
          if (other.id !== provider.id && other.status === "ACTIVE") other.status = "BACKUP";
        }
      }
      db.frpProviderCostHistory.unshift({
        id: crypto.randomUUID(),
        providerId: provider.id,
        costUsdt: pending.nextCost,
        recordedAt: pending.approvedAt,
        recordedBy: pending.requestedBy,
        reason: pending.requestedReason,
        level: 4,
        deltaPct: pending.deltaPct,
        approvedBy: user.id,
      });
      if (db.frpProviderCostHistory.length > 500) db.frpProviderCostHistory.length = 500;
      audit(db, user.id, "FRP_PENDING_CHANGE_APPROVED", pending.id, {
        providerId: pending.providerId,
        previousCost: pending.previousCost,
        nextCost: pending.nextCost,
        deltaPct: pending.deltaPct,
      });
      await writeDb(db);
      publishPortalOrdersForAll(db, "pricing_provider_updated");
      return sendJson(res, 200, {
        pricing: publicFrpPricingState(db, user),
        frp: publicFrpState(db, user),
        approved: true,
      });
    }
    pending.status = "REJECTED";
    audit(db, user.id, "FRP_PENDING_CHANGE_REJECTED", pending.id, {
      providerId: pending.providerId,
      previousCost: pending.previousCost,
      nextCost: pending.nextCost,
      deltaPct: pending.deltaPct,
    });
    await writeDb(db);
    return sendJson(res, 200, { rejected: true });
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
      // PR-2a.4: si la orden cliente ligada tenia deuda VIP marcada del cierre,
      // limpiarla al validar el pago — esto desbloquea al cliente para crear
      // nuevas ordenes.
      const portalOrder = db.customerOrders.find((candidate) => candidate.id === order.portalOrderId);
      if (portalOrder?.debtAmount && !portalOrder.debtClearedAt) {
        portalOrder.debtClearedAt = order.paymentReviewedAt;
        portalOrder.debtClearedBy = user.id;
        portalOrder.updatedAt = order.paymentReviewedAt;
      }
      // PR-2a-final.1: el lock de precio arranca AL APROBAR el pago (no al subir
      // comprobante). Ventana de 15 min. Reset de cualquier decision previa
      // para casos de re-aprobacion despues de rechazo. El lock value es lo
      // que el cliente ya pago (order.unitPrice), no el costo actual — eso
      // permite detectar limpio "subio post-aprobacion → 3 opciones".
      if (portalOrder) {
        portalOrder.priceLocked = Number(portalOrder.unitPrice) || 0;
        portalOrder.priceLockedAt = order.paymentReviewedAt;
        portalOrder.priceLockExpiresAt = new Date(Date.parse(order.paymentReviewedAt) + 15 * 60 * 1000).toISOString();
        portalOrder.priceDecisionAction = "";
        portalOrder.priceDecisionAt = "";
        portalOrder.priceDecisionWaitUntil = "";
        portalOrder.updatedAt = order.paymentReviewedAt;
      }
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

  // QUE: tomar un job FRP especifico de la cola (no solo el siguiente). Spec
  // operador-frp-express.md §5.1 + §6.2 + AC #12, #13.
  // POR QUE: el take-next legacy toma el job mas antiguo. El nuevo panel
  // permite que el tecnico elija cual tomar primero (filtro VIP, urgencia
  // visual). Carrera resuelta por el primer writeDb que pisa el status —
  // segundo intento recibe 409 "Otro tecnico ya tomo este job".
  // El backend NO valida que user.id === activeTechnician.userId aca, igual
  // que take-next: la spec exige que UI lo deshabilite (AC #18) pero el
  // endpoint queda operable para ADMIN que necesita rescatar/troubleshoot.
  // Si en el futuro se necesita enforcement, agregar check + cambiar take-next
  // por consistencia (no en este commit, no fue pedido).
  const frpJobTakeMatch = pathname.match(/^\/api\/frp\/jobs\/([^/]+)\/take$/);
  if (req.method === "POST" && frpJobTakeMatch) {
    if (!requireUser(user, res)) return;
    const db = await readDb();
    if (!(await requireFrpAccess(user, res, db, "FRP_JOB_TAKE_DENIED", frpJobTakeMatch[1]))) return;
    const activeJob = frpActiveJobForUser(db, user);
    if (activeJob) return sendJson(res, 409, { error: `Ya tienes un FRP en proceso: ${activeJob.code}.` });
    const job = db.frpJobs.find((candidate) => candidate.id === frpJobTakeMatch[1]);
    if (!job) return sendJson(res, 404, { error: "Trabajo FRP no encontrado." });
    if (job.status !== "LISTO_PARA_TECNICO") {
      // Carrera: otro tecnico ya lo tomo (status = EN_PROCESO con technicianId)
      // o el job ya esta finalizado/cancelado. AC #13.
      if (job.technicianId && job.technicianId !== user.id) {
        return sendJson(res, 409, { error: "Otro tecnico ya tomo este job." });
      }
      return sendJson(res, 422, { error: "El trabajo no esta disponible para tomar." });
    }
    job.status = "EN_PROCESO";
    job.technicianId = user.id;
    job.takenAt = nowIso();
    job.updatedAt = job.takenAt;
    const order = db.frpOrders.find((candidate) => candidate.id === job.orderId);
    if (order) syncFrpOrderStatus(db, order);
    audit(db, user.id, "FRP_JOB_TAKEN_SPECIFIC", job.id, { code: job.code, order: order?.code || "" });
    await writeDb(db);
    publishPortalOrdersForFrpOrder(db, order, "frp_job_taken");
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

  // QUE: cancelar un job en proceso. Spec operador-frp-express.md §3.2, §3.3,
  // §5.1 + AC #25, #26.
  // POR QUE: la spec define dos escenarios:
  //   - timeout 30 min: tecnico aprieta "Cancelar job" desde el banner amarillo
  //     porque no pudo finalizar. Libera el job para que otro tecnico intente.
  //     Reason 'timeout' o 'manual' → status vuelve a LISTO_PARA_TECNICO.
  //   - payment_reverted: admin revirtio aprobacion de pago mientras job estaba
  //     EN_PROCESO. La orden ya no es valida — cancelacion definitiva. Reason
  //     'payment_reverted' → status CANCELADO (terminal).
  // El handler de "admin revierte pago" (no implementado aun) deberia llamar
  // este endpoint con reason 'payment_reverted'. Por ahora el endpoint esta
  // disponible para los otros dos flows (timeout/manual desde banner UI).
  const frpJobCancelMatch = pathname.match(/^\/api\/frp\/jobs\/([^/]+)\/cancel$/);
  if (req.method === "PATCH" && frpJobCancelMatch) {
    if (!requireUser(user, res)) return;
    const input = await parseJson(req);
    const db = await readDb();
    if (!(await requireFrpAccess(user, res, db, "FRP_JOB_CANCEL_DENIED", frpJobCancelMatch[1]))) return;
    const job = db.frpJobs.find((candidate) => candidate.id === frpJobCancelMatch[1]);
    const order = db.frpOrders.find((candidate) => candidate.id === job?.orderId);
    if (!job || !order) return sendJson(res, 404, { error: "Trabajo FRP no encontrado." });
    if (job.technicianId && job.technicianId !== user.id && user.role !== "ADMIN") {
      return sendJson(res, 403, { error: "Este trabajo lo tomo otro tecnico." });
    }
    if (job.status !== "EN_PROCESO" && user.role !== "ADMIN") {
      return sendJson(res, 400, { error: "Solo puedes cancelar un trabajo en proceso." });
    }
    const reason = String(input.reason || "").trim();
    const allowedReasons = ["timeout", "payment_reverted", "manual"];
    if (!allowedReasons.includes(reason)) {
      return sendJson(res, 400, { error: "Razon de cancelacion no valida." });
    }
    const note = cleanText(input.note, 200);
    // payment_reverted es terminal (la orden murio). Los demas reasons liberan
    // el job a la cola para que otro tecnico intente.
    const nextStatus = reason === "payment_reverted" ? "CANCELADO" : "LISTO_PARA_TECNICO";
    job.status = nextStatus;
    job.technicianId = "";
    job.takenAt = "";
    job.canceledAt = nowIso();
    job.cancelReason = reason;
    if (note) job.cancelNote = note;
    job.updatedAt = job.canceledAt;
    syncFrpOrderStatus(db, order);
    audit(db, user.id, "FRP_JOB_CANCELED", job.id, {
      code: job.code,
      order: order.code,
      reason,
      note: note || "",
      nextStatus,
    });
    await writeDb(db);
    publishPortalOrdersForFrpOrder(db, order, "frp_job_canceled");
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
