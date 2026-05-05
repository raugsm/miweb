export function createPortalSerializers({
  allowedTicketPaymentMethods,
  cleanText,
  countries,
  frpEligibilityCatalog,
  customerBenefitFor,
  customerCanUseBenefits,
  customerDeviceIsAuthorized,
  customerEmailIsVerified,
  customerMonthlyUsage,
  customerPendingDebt,
  defaultPricingConfig,
  frpCurrentPricing,
  frpDynamicMonthlyTiers,
  frpDynamicQuantityTiers,
  frpMonthlyTiers,
  frpQuantityTiers,
  frpServiceCode,
  moneyNumber,
  nextFrpMonthlyTier,
  normalizeCountryInput,
  normalizeCustomerStatus,
  normalizePricingConfig,
  paymentMethods,
  paymentMethodsWithOverrides,
  portalFrpPriceSuggestion,
  portalPhoneCountryHints,
  portalPublicServices,
  publicOrderStatuses,
  turnstileSecret,
  turnstileSiteKey,
  customerModuleUrl,
}) {
  function publicCustomerClient(client) {
    if (!client) return null;
    return {
      id: client.id,
      masterClientId: client.masterClientId || "",
      name: client.name,
      whatsapp: client.whatsapp,
      country: client.country,
      status: normalizeCustomerStatus(client.status),
      emailVerified: customerEmailIsVerified(client),
      emailVerifiedAt: client.emailVerifiedAt || "",
      createdAt: client.createdAt,
      updatedAt: client.updatedAt,
    };
  }

  function publicCustomerUser(user) {
    if (!user) return null;
    return {
      id: user.id,
      clientId: user.clientId,
      name: user.name,
      email: user.email,
      role: user.role || "OWNER",
      active: user.active !== false,
      createdAt: user.createdAt,
    };
  }

  function publicCustomerBenefit(benefit, canUseBenefits, pricing = null) {
    if (!benefit) return null;
    // PR-2a.5-fix: VIP usa margen sobre costo proveedor, no precio total.
    // Frontend recibe el margen (vipUnitMargin) y el precio efectivo computado
    // (vipEffectiveUnitPrice = costo + margen) para mostrar y comparar tiers
    // sin tener que calcular costo en cliente.
    const vipUnitMargin = moneyNumber(benefit.vipUnitMargin ?? benefit.vipUnitPrice ?? 0);
    const internalCost = pricing?.available ? moneyNumber(pricing.internalCostUsdt) : 0;
    const vipEffectiveUnitPrice = vipUnitMargin > 0 && internalCost > 0
      ? moneyNumber(internalCost + vipUnitMargin)
      : 0;
    return {
      masterClientId: benefit.masterClientId || "",
      quantityDiscountEnabled: Boolean(benefit.quantityDiscountEnabled),
      monthlyDiscountEnabled: Boolean(benefit.monthlyDiscountEnabled),
      goalDiscountEnabled: Boolean(benefit.goalDiscountEnabled),
      monthlyGoal: Number(benefit.monthlyGoal || 0),
      vipUnitMargin,
      vipEffectiveUnitPrice,
      deviceRequired: benefit.deviceRequired !== false,
      usableNow: Boolean(canUseBenefits),
    };
  }

  function deriveCustomerOrderStatus(order, db) {
    const frpOrder = db.frpOrders.find((candidate) => candidate.id === order.frpOrderId);
    const items = db.customerOrderItems.filter((item) => item.orderId === order.id);
    const jobs = items.map((item) => db.frpJobs.find((job) => job.id === item.frpJobId)).filter(Boolean);
    if (order.publicStatus === "CANCELADO") return "CANCELADO";
    if (order.publicStatus === "REVISION_COMPATIBILIDAD") return "REVISION_COMPATIBILIDAD";
    const activeJobs = jobs.filter((job) => job.status !== "CANCELADO");
    if (jobs.length && !activeJobs.length) return "CANCELADO";
    if (activeJobs.length && activeJobs.every((job) => job.status === "FINALIZADO")) return "FINALIZADO";
    if (activeJobs.some((job) => job.status === "REQUIERE_REVISION" || job.status === "ESPERANDO_CLIENTE")) return "REQUIERE_ATENCION";
    if (activeJobs.some((job) => job.status === "EN_PROCESO")) return "EN_PROCESO";
    if (activeJobs.some((job) => job.status === "LISTO_PARA_TECNICO")) return "LISTO_PARA_CONEXION";
    if ((frpOrder?.checklist?.paymentValidated || frpOrder?.paymentStatus === "PAGO_VALIDADO") && (order.customerConnectionReadyAt || frpOrder?.customerConnectionReadyAt)) return "LISTO_PARA_CONEXION";
    if (frpOrder?.checklist?.paymentValidated || frpOrder?.paymentStatus === "PAGO_VALIDADO") return "EN_PREPARACION";
    // QUE: rechazo de comprobante por el operador antes que "proofs presentes".
    // POR QUE: si dejamos PAGO_EN_REVISION para el caso rechazado, el cliente no se
    // entera del rechazo y no puede re-subir. PAGO_RECHAZADO es una decision del
    // operador (frpOrder.paymentStatus = COMPROBANTE_RECHAZADO) que pisa el estado
    // implicito por presencia de proofs.
    if (frpOrder?.paymentStatus === "COMPROBANTE_RECHAZADO") return "PAGO_RECHAZADO";
    if (Array.isArray(order.paymentProofs) && order.paymentProofs.length) return "PAGO_EN_REVISION";
    if (order.postpayRequested && order.postpayStatus === "SOLICITADO") return "POSTPAGO_SOLICITADO";
    return order.publicStatus || "ESPERANDO_PAGO";
  }

  function publicCustomerOrderNextAction(order, db, publicStatus = "") {
    const frpOrder = db.frpOrders.find((candidate) => candidate.id === order.frpOrderId);
    const items = db.customerOrderItems.filter((item) => item.orderId === order.id);
    const jobs = items.map((item) => db.frpJobs.find((job) => job.id === item.frpJobId)).filter(Boolean);
    const status = publicStatus || deriveCustomerOrderStatus(order, db);
    if (status === "REVISION_COMPATIBILIDAD") return "AriadGSM revisara si el equipo aplica para FRP Express antes de pedir pago.";
    if (status === "ESPERANDO_PAGO") return "Copia los datos de pago y sube el comprobante para iniciar la validacion.";
    if (status === "POSTPAGO_SOLICITADO") return "Postpago solicitado. AriadGSM debe aprobarlo antes de procesar.";
    if (status === "PAGO_EN_REVISION") {
      return order.customerConnectionReadyAt
        ? "Comprobante recibido. Ya indicaste que la conexion esta lista; espera validacion."
        : "Comprobante recibido. Prepara USB Redirector mientras validamos el pago.";
    }
    if (status === "PAGO_RECHAZADO") {
      const reason = cleanText(frpOrder?.paymentRejectedReason || "", 160) || "Comprobante rechazado.";
      return `Pago rechazado: ${reason} Sube un nuevo comprobante.`;
    }
    if (status === "EN_PREPARACION") return "Pago validado. Prepara USB Redirector y marca que estas listo para conectar.";
    if (status === "LISTO_PARA_CONEXION") return "Conexion lista. Mantente disponible para que el tecnico tome el equipo.";
    if (status === "EN_PROCESO") return "Tecnico procesando. No desconectes el equipo hasta recibir el Done.";
    if (status === "REQUIERE_ATENCION") {
      const reason = jobs.find((job) => job.reviewReason)?.reviewReason || frpOrder?.reviewReason || "";
      return reason ? `Requiere accion: ${reason}` : "Requiere accion del cliente o revision del equipo.";
    }
    if (status === "FINALIZADO") return "Servicio finalizado. Revisa el Done y el log de salida.";
    if (status === "CANCELADO") return "Solicitud cancelada.";
    return "Revisa el estado de tu solicitud.";
  }

  // PR-2a-final.bundle2 item 4 — activity log timestamped para Mis Ordenes.
  // Permite al cliente ver una linea de tiempo de eventos de la orden y sirve
  // como evidencia anti-disputa (Latam ~1.7% chargeback, 75% friendly fraud
  // segun research del usuario). Los eventos disparados por el cliente quedan
  // marcados con actor="customer" — frontend les agrega "(vos)" al renderizar.
  function buildOrderActivityLog(order, db) {
    const events = [];
    const frpOrder = db.frpOrders.find((candidate) => candidate.id === order.frpOrderId);
    if (frpOrder?.paymentReviewedAt) {
      events.push({
        at: frpOrder.paymentReviewedAt,
        label: "Pago confirmado por técnico",
        actor: "tech",
      });
    }
    if (order.customerConnectedAt) {
      events.push({
        at: order.customerConnectedAt,
        label: "Equipo conectado",
        actor: "customer",
      });
    }
    const items = db.customerOrderItems.filter((item) => item.orderId === order.id);
    for (const item of items) {
      const job = db.frpJobs.find((candidate) => candidate.id === item.frpJobId);
      if (!job) continue;
      if (job.takenAt && job.status !== "ESPERANDO_PREPARACION") {
        events.push({
          at: job.takenAt,
          label: `Equipo ${item.sequence} tomado por técnico`,
          actor: "tech",
        });
      }
      if (job.doneAt && job.status === "FINALIZADO") {
        let suffix = "";
        if (job.takenAt) {
          const minutes = Math.max(1, Math.round((Date.parse(job.doneAt) - Date.parse(job.takenAt)) / 60000));
          if (Number.isFinite(minutes)) suffix = ` · ${minutes} min`;
        }
        events.push({
          at: job.doneAt,
          label: `Equipo ${item.sequence} procesado${suffix}`,
          actor: "tech",
        });
      } else if (job.status === "EN_PROCESO") {
        events.push({
          at: job.takenAt || job.updatedAt || job.createdAt || "",
          label: `Equipo ${item.sequence} procesando ahora`,
          actor: "tech",
          inProgress: true,
        });
      }
    }
    return events
      .filter((event) => event.at)
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  }

  function publicCustomerOrder(order, db) {
    const payment = paymentMethods.find((candidate) => candidate.code === order.paymentMethod);
    const items = db.customerOrderItems.filter((item) => item.orderId === order.id);
    const publicStatus = deriveCustomerOrderStatus(order, db);
    const hidePaymentDetails = publicStatus === "REVISION_COMPATIBILIDAD";
    const frpOrderForReason = db.frpOrders.find((candidate) => candidate.id === order.frpOrderId);
    const paymentRejectedReason = publicStatus === "PAGO_RECHAZADO"
      ? cleanText(frpOrderForReason?.paymentRejectedReason || "", 160)
      : "";
    // QUE: precio que costaria esta orden HOY (con pricing config actual y benefits
    // del cliente). PR-2a.3 lo usa frontend para detectar lock < current → mostrar
    // 3-opciones cuando el operador suba precios despues del lock.
    const lockedUnit = moneyNumber(order.priceLocked || 0);
    const currentSuggestion = lockedUnit > 0 && order.publicStatus !== "CANCELADO" && order.publicStatus !== "FINALIZADO"
      ? (() => {
          try {
            const benefit = customerBenefitFor(db, order.clientId, order.masterClientId || "");
            return portalFrpPriceSuggestion(db, order.clientId, order.quantity, true, benefit, order.masterClientId || "");
          } catch {
            return null;
          }
        })()
      : null;
    const currentUnitPrice = currentSuggestion?.available
      ? moneyNumber(currentSuggestion.unitPrice)
      : moneyNumber(order.unitPrice || 0);
    return {
      id: order.id,
      code: order.code,
      accessCode: order.accessCode,
      serviceCode: order.serviceCode,
      serviceName: order.serviceName,
      quantity: order.quantity,
      unitPrice: order.unitPrice,
      totalPrice: order.totalPrice,
      priceFormatted: order.priceFormatted,
      discountLabel: order.discountLabel,
      discountLocked: Boolean(order.discountLocked),
      monthlyUsageAtCreation: order.monthlyUsageAtCreation || 0,
      nextMonthlyTier: order.nextMonthlyTier || null,
      paymentMethod: order.paymentMethod,
      paymentLabel: hidePaymentDetails ? "" : order.paymentLabel,
      paymentDetails: hidePaymentDetails ? [] : (Array.isArray(order.paymentDetails) ? order.paymentDetails : payment?.details || []),
      publicStatus,
      paymentRejectedReason,
      nextAction: publicCustomerOrderNextAction(order, db, publicStatus),
      technicianId: order.technicianId || order.redirectorId || "",
      redirectorId: order.redirectorId || order.technicianId || "",
      customerConnectionReadyAt: order.customerConnectionReadyAt || "",
      customerConnectedAt: order.customerConnectedAt || "",
      // PR-2a-final.bundle2 item 3: timestamp de aprobacion del pago. Frontend
      // lo usa para timer "¿Listo para conectar?" (2 min post-aprobacion sin
      // customerConnectedAt → banner azul con CTAs).
      paymentReviewedAt: frpOrderForReason?.paymentReviewedAt || "",
      // PR-2a-final.bundle2 item 4: registro de actividad para Mis Ordenes.
      // Eventos timestampeados con actor (tech | customer) — frontend marca
      // los del cliente con "(vos)" al renderizar.
      activityLog: buildOrderActivityLog(order, db),
      // PR-2a-final.1: lock 15 min con renovacion. Setea cuando operador
      // aprueba el pago. Si vence con costo favorable/igual, server renueva
      // silencioso. Si vence con costo subido, frontend muestra 3 opciones.
      priceLocked: moneyNumber(order.priceLocked || 0),
      priceLockedAt: order.priceLockedAt || "",
      priceLockExpiresAt: order.priceLockExpiresAt || "",
      priceDecisionAction: order.priceDecisionAction || "",
      priceDecisionAt: order.priceDecisionAt || "",
      priceDecisionWaitUntil: order.priceDecisionWaitUntil || "",
      // PR-2a.3: precio que costaria esta orden HOY. Frontend compara contra
      // priceLocked para detectar si subio y mostrar UI inline 3-opciones.
      currentUnitPrice,
      urgentRequested: Boolean(order.urgentRequested),
      urgentStatus: order.urgentStatus || "",
      postpayRequested: Boolean(order.postpayRequested),
      postpayStatus: order.postpayStatus || "",
      paymentProofs: Array.isArray(order.paymentProofs) ? order.paymentProofs.map((proof) => ({
        id: proof.id,
        name: proof.name,
        type: proof.type,
        size: proof.size,
        createdAt: proof.createdAt,
      })) : [],
      items: items.map((item) => {
        const job = db.frpJobs.find((candidate) => candidate.id === item.frpJobId);
        const eligibilityStatus = item.eligibilityStatus || job?.eligibilityStatus || "";
        const eligibilityMessage = item.eligibilityPublicMessage || job?.eligibilityPublicMessage || "";
        const publicReviewMessage = eligibilityMessage || (job?.status === "REQUIERE_REVISION" ? "Requiere revision del equipo." : "");
        return {
          id: item.id,
          sequence: item.sequence,
          model: item.model || "",
          imei: item.imei || "",
          status: job?.status || item.status,
          ardCode: job?.ardCode || item.ardCode || "",
          finalLog: job?.finalLog || "",
          readyAt: job?.readyAt || "",
          takenAt: job?.takenAt || "",
          doneAt: job?.doneAt || "",
          canceledAt: job?.canceledAt || item.canceledAt || "",
          cancelReason: job?.cancelReason || item.cancelReason || "",
          eligibilityStatus,
          eligibilityMessage,
          reviewReason: publicReviewMessage,
        };
      }),
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }

  function publicCustomerOrdersForClient(db, clientId) {
    return db.customerOrders
      .filter((order) => order.clientId === clientId)
      .slice(0, 60)
      .map((order) => publicCustomerOrder(order, db));
  }

  function publicCustomerState(db, context) {
    const client = context?.client || null;
    const user = context?.user || null;
    const device = context?.device || null;
    const benefit = client ? customerBenefitFor(db, client.id, client.masterClientId) : null;
    const canUseBenefits = customerCanUseBenefits(context, benefit);
    const pricingForBenefit = client ? frpCurrentPricing(db) : null;
    const monthlyUsage = client ? customerMonthlyUsage(db, client.id, new Date(), client.masterClientId || benefit?.masterClientId || "") : 0;
    const nextMonthlyTier = client ? nextFrpMonthlyTier(monthlyUsage, frpCurrentPricing(db)) : null;
    const orders = client ? publicCustomerOrdersForClient(db, client.id) : [];
    // PR-2a.4: deuda VIP pendiente del cierre anterior. Frontend muestra banner
    // y el endpoint POST /api/portal/orders/frp bloquea con 403 mientras > 0.
    const pendingDebtUsdt = client && typeof customerPendingDebt === "function"
      ? moneyNumber(customerPendingDebt(db, client.id))
      : 0;
    return {
      user: publicCustomerUser(user),
      client: publicCustomerClient(client),
      device: device ? {
        id: device.id,
        authorizedForBenefits: client ? customerDeviceIsAuthorized(device, client.id) : false,
        createdAt: device.createdAt,
        lastSeenAt: device.lastSeenAt,
      } : null,
      benefit: publicCustomerBenefit(benefit, canUseBenefits, pricingForBenefit),
      monthlyUsage,
      nextMonthlyTier: nextMonthlyTier ? { ...nextMonthlyTier, remaining: nextMonthlyTier.minJobs - monthlyUsage } : null,
      orders,
      pendingDebtUsdt,
    };
  }

  // Sub-commit 15a.2: parámetro db opcional. Cuando está presente, mergea
  // overrides admin (active/customMessage) sobre los defaults de catalog.js.
  // Sin db (callers viejos), comportamiento idéntico al pre-15a.2.
  function allowedPortalPaymentMethods(db = null) {
    if (db) {
      return paymentMethodsWithOverrides(db).filter((payment) => payment.ticketOption);
    }
    return allowedTicketPaymentMethods();
  }

  function allowedPortalPaymentMethodsForCountry(country, db = null) {
    const normalizedCountry = normalizeCountryInput(country);
    const methods = allowedPortalPaymentMethods(db);
    const localMethods = methods.filter((payment) => payment.country === normalizedCountry);
    const globalMethods = methods.filter((payment) => payment.globalOption);
    return localMethods.concat(globalMethods);
  }

  function defaultPortalPaymentForCountry(country, db = null) {
    const compatible = allowedPortalPaymentMethodsForCountry(country, db);
    return compatible.find((payment) => !payment.globalOption) || compatible[0] || allowedPortalPaymentMethods(db)[0] || null;
  }

  // Sub-commit 15a.2: si el método solicitado está desactivado (override admin),
  // se rechaza acá — no caemos al default de país, devolvemos null y la ruta
  // emite 400 "Método de pago invalido para tu pais." (mismo error que antes
  // para método inexistente). Llamadas legacy sin db preservan comportamiento.
  function resolvePortalPaymentForClient(paymentCode, client, db = null) {
    const code = cleanText(paymentCode, 60);
    const allowed = allowedPortalPaymentMethods(db);
    const found = allowed.find((payment) => payment.code === code);
    if (found) {
      if (db && found.active === false) return null;
      return found;
    }
    return defaultPortalPaymentForCountry(client?.country, db);
  }

  function publicPortalCatalog(db = null) {
    const pricing = db ? frpCurrentPricing(db) : null;
    // PR-2a-final.2 — buscador inverso del paso 2 (FINAL §5): solo verifica
    // modelos NO soportados o REQUIERE_REVISION. Si el modelo no aparece, se
    // asume soportado (98% lo está). Lista expuesta al frontend para chequeo
    // client-side sin round-trip.
    const eligibilityHints = (db?.frpEligibilityCatalog || frpEligibilityCatalog || []).map((entry) => ({
      key: entry.key,
      publicName: entry.publicName,
      aliases: Array.isArray(entry.aliases) ? entry.aliases : [],
      status: entry.status,
      publicMessage: entry.publicMessage || "",
    }));
    const pricingConfig = normalizePricingConfig(db?.pricingConfig || defaultPricingConfig());
    const servicesForPortal = portalPublicServices
      .filter((service) => service.enabled)
      .map((service) => service.internalServiceCode === frpServiceCode && pricing?.available
        ? { ...service, baseUnitPrice: pricing.unitPrice }
        : service);
    return {
      services: servicesForPortal,
      // Sub-commit 15a.2: pasamos db para que `paymentMethods` salga al frontend
      // con los campos `active` y `customMessage` aplicados desde overrides.
      paymentMethods: allowedPortalPaymentMethods(db),
      countries: countries.map(([, country]) => country),
      statuses: publicOrderStatuses,
      quantityTiers: pricing?.available ? frpDynamicQuantityTiers(pricing) : frpQuantityTiers,
      monthlyTiers: pricing?.available ? frpDynamicMonthlyTiers(pricing) : frpMonthlyTiers,
      exchangeRates: pricingConfig.exchangeRates.map((rate) => ({
        country: rate.country,
        currency: rate.currency,
        ratePerUsdt: rate.currency === "USDT" ? 1 : moneyNumber(rate.ratePerUsdt || 0),
        updatedAt: rate.updatedAt || "",
      })),
      phoneCountries: portalPhoneCountryHints,
      turnstileEnabled: Boolean(turnstileSecret && turnstileSiteKey),
      turnstileSiteKey,
      customerModuleUrl: customerModuleUrl || "",
      eligibilityHints,
    };
  }

  return {
    publicCustomerClient,
    publicCustomerUser,
    publicCustomerBenefit,
    deriveCustomerOrderStatus,
    publicCustomerOrderNextAction,
    publicCustomerOrder,
    publicCustomerOrdersForClient,
    publicCustomerState,
    publicPortalCatalog,
    resolvePortalPaymentForClient,
  };
}
