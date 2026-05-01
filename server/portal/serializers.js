export function createPortalSerializers({
  allowedTicketPaymentMethods,
  cleanText,
  countries,
  customerBenefitFor,
  customerCanUseBenefits,
  customerDeviceIsAuthorized,
  customerEmailIsVerified,
  customerMonthlyUsage,
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
  portalPhoneCountryHints,
  portalPublicServices,
  publicOrderStatuses,
  turnstileSecret,
  turnstileSiteKey,
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

  function publicCustomerBenefit(benefit, canUseBenefits) {
    if (!benefit) return null;
    return {
      masterClientId: benefit.masterClientId || "",
      quantityDiscountEnabled: Boolean(benefit.quantityDiscountEnabled),
      monthlyDiscountEnabled: Boolean(benefit.monthlyDiscountEnabled),
      goalDiscountEnabled: Boolean(benefit.goalDiscountEnabled),
      monthlyGoal: Number(benefit.monthlyGoal || 0),
      vipUnitPrice: moneyNumber(benefit.vipUnitPrice || 0),
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
    if (jobs.length && jobs.every((job) => job.status === "FINALIZADO")) return "FINALIZADO";
    if (jobs.some((job) => job.status === "REQUIERE_REVISION" || job.status === "ESPERANDO_CLIENTE")) return "REQUIERE_ATENCION";
    if (jobs.some((job) => job.status === "EN_PROCESO")) return "EN_PROCESO";
    if (jobs.some((job) => job.status === "LISTO_PARA_TECNICO")) return "LISTO_PARA_CONEXION";
    if ((frpOrder?.checklist?.paymentValidated || frpOrder?.paymentStatus === "PAGO_VALIDADO") && (order.customerConnectionReadyAt || frpOrder?.customerConnectionReadyAt)) return "LISTO_PARA_CONEXION";
    if (frpOrder?.checklist?.paymentValidated || frpOrder?.paymentStatus === "PAGO_VALIDADO") return "EN_PREPARACION";
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

  function publicCustomerOrder(order, db) {
    const payment = paymentMethods.find((candidate) => candidate.code === order.paymentMethod);
    const items = db.customerOrderItems.filter((item) => item.orderId === order.id);
    const publicStatus = deriveCustomerOrderStatus(order, db);
    const hidePaymentDetails = publicStatus === "REVISION_COMPATIBILIDAD";
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
      nextAction: publicCustomerOrderNextAction(order, db, publicStatus),
      customerConnectionReadyAt: order.customerConnectionReadyAt || "",
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
    const monthlyUsage = client ? customerMonthlyUsage(db, client.id, new Date(), client.masterClientId || benefit?.masterClientId || "") : 0;
    const nextMonthlyTier = client ? nextFrpMonthlyTier(monthlyUsage, frpCurrentPricing(db)) : null;
    const orders = client ? publicCustomerOrdersForClient(db, client.id) : [];
    return {
      user: publicCustomerUser(user),
      client: publicCustomerClient(client),
      device: device ? {
        id: device.id,
        authorizedForBenefits: client ? customerDeviceIsAuthorized(device, client.id) : false,
        createdAt: device.createdAt,
        lastSeenAt: device.lastSeenAt,
      } : null,
      benefit: publicCustomerBenefit(benefit, canUseBenefits),
      monthlyUsage,
      nextMonthlyTier: nextMonthlyTier ? { ...nextMonthlyTier, remaining: nextMonthlyTier.minJobs - monthlyUsage } : null,
      orders,
    };
  }

  function allowedPortalPaymentMethods() {
    return allowedTicketPaymentMethods();
  }

  function allowedPortalPaymentMethodsForCountry(country) {
    const normalizedCountry = normalizeCountryInput(country);
    const methods = allowedPortalPaymentMethods();
    const localMethods = methods.filter((payment) => payment.country === normalizedCountry);
    const globalMethods = methods.filter((payment) => payment.globalOption);
    return localMethods.concat(globalMethods);
  }

  function defaultPortalPaymentForCountry(country) {
    const compatible = allowedPortalPaymentMethodsForCountry(country);
    return compatible.find((payment) => !payment.globalOption) || compatible[0] || allowedPortalPaymentMethods()[0] || null;
  }

  function resolvePortalPaymentForClient(paymentCode, client) {
    const code = cleanText(paymentCode, 60);
    const allowed = allowedPortalPaymentMethods();
    return allowed.find((payment) => payment.code === code) || defaultPortalPaymentForCountry(client?.country);
  }

  function publicPortalCatalog(db = null) {
    const pricing = db ? frpCurrentPricing(db) : null;
    const pricingConfig = normalizePricingConfig(db?.pricingConfig || defaultPricingConfig());
    const servicesForPortal = portalPublicServices
      .filter((service) => service.enabled)
      .map((service) => service.internalServiceCode === frpServiceCode && pricing?.available
        ? { ...service, baseUnitPrice: pricing.unitPrice }
        : service);
    return {
      services: servicesForPortal,
      paymentMethods: allowedPortalPaymentMethods(),
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
