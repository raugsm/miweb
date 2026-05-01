export function createPortalRoutes({
  addPortalOrderStream,
  audit,
  authorizeCustomerDevice,
  cleanText,
  clientIp,
  cookieHeader,
  createCustomerEmailVerificationToken,
  createFrpOrderFromPortal,
  crypto,
  customerBenefitFor,
  customerCanUseBenefits,
  customerDeviceCookieName,
  customerDeviceMaxAgeSeconds,
  customerDeviceIsAuthorized,
  customerEmailIsVerified,
  customerSessionCookieName,
  customerSessionMaxAgeSeconds,
  customerSessionVersion,
  defaultCustomerBenefit,
  enforcePortalRateLimit,
  ensureCustomerDevice,
  formatPortalPaymentAmountFromUsdt,
  frpEligibilityResult,
  frpWorkChannel,
  getCookie,
  getCurrentCustomerContext,
  hashPassword,
  hashToken,
  maxPortalOrderRequestsPerWindow,
  maxPortalProofRequestsPerWindow,
  maxPortalRegisterRequestsPerWindow,
  maxPortalVerificationEmailRequestsPerWindow,
  nextCustomerOrderCode,
  normalizeCustomerStatus,
  normalizeEmail,
  normalizePortalWhatsapp,
  nowIso,
  parseJson,
  phoneKey,
  portalFrpPriceSuggestion,
  portalOrdersSseHeartbeatMs,
  portalPublicServices,
  publicCustomerOrder,
  publicCustomerOrdersForClient,
  publicCustomerState,
  publicPortalCatalog,
  publishPortalOrders,
  readDb,
  reconcilePortalClientLink,
  removePortalOrderStream,
  requireCustomer,
  resolvePortalPaymentForClient,
  sanitizePaymentProofImages,
  sendCustomerVerificationEmail,
  sendJson,
  sendSseEvent,
  summarizeFrpEligibility,
  syncFrpOrderStatus,
  validatePassword,
  validatePortalCustomerName,
  validateTurnstileIfConfigured,
  verifyPassword,
  writeDb,
}) {
  return async function handlePortalApi(req, res, pathname) {
  if (req.method === "GET" && pathname === "/api/portal/catalog") {
    const db = await readDb();
    return sendJson(res, 200, { catalog: publicPortalCatalog(db) });
  }

  if (req.method === "GET" && pathname === "/api/portal/session") {
    const context = await getCurrentCustomerContext(req);
    res.setHeader("Set-Cookie", cookieHeader(customerDeviceCookieName, context.deviceToken, customerDeviceMaxAgeSeconds));
    return sendJson(res, 200, {
      customer: publicCustomerState(context.db, context),
      catalog: publicPortalCatalog(context.db),
    });
  }

  if (req.method === "POST" && pathname === "/api/portal/verify-email") {
    const input = await parseJson(req);
    const token = String(input.token || "").trim();
    const db = await readDb();
    const tokenRecord = token ? db.customerEmailVerificationTokens.find((candidate) => {
      return !candidate.usedAt && candidate.expiresAt > Date.now() && candidate.tokenHash === hashToken(token);
    }) : null;
    if (!tokenRecord) {
      audit(db, null, "PORTAL_EMAIL_VERIFICATION_FAILED", null, { ipHash: hashToken(clientIp(req)) });
      await writeDb(db);
      return sendJson(res, 400, { error: "Enlace de verificacion invalido o vencido." });
    }
    const customerUser = db.customerUsers.find((candidate) => candidate.id === tokenRecord.userId && candidate.active !== false);
    const client = customerUser ? db.customerClients.find((candidate) => candidate.id === customerUser.clientId) : null;
    if (!customerUser || !client || client.status === "BLOQUEADO") {
      tokenRecord.usedAt = nowIso();
      audit(db, null, "PORTAL_EMAIL_VERIFICATION_FAILED", tokenRecord.clientId, { reason: "missing_or_blocked_account" });
      await writeDb(db);
      return sendJson(res, 400, { error: "Enlace de verificacion invalido o vencido." });
    }
    tokenRecord.usedAt = nowIso();
    customerUser.emailVerifiedAt ||= nowIso();
    client.emailVerifiedAt ||= nowIso();
    if (!["VIP", "EMPRESA", "VERIFICADO"].includes(normalizeCustomerStatus(client.status))) {
      client.status = "EMAIL_VERIFICADO";
    }
    client.updatedAt = nowIso();
    customerUser.updatedAt = nowIso();
    reconcilePortalClientLink(db, client, customerUser.id);
    audit(db, customerUser.id, "PORTAL_EMAIL_VERIFIED", client.id, { email: customerUser.email });
    await writeDb(db);
    return sendJson(res, 200, { message: "Correo verificado. Ya puedes crear solicitudes." });
  }

  if (req.method === "POST" && pathname === "/api/portal/register") {
    const input = await parseJson(req);
    const nameValidation = validatePortalCustomerName(input.name);
    const email = normalizeEmail(input.email);
    const password = String(input.password || "");
    const phoneValidation = normalizePortalWhatsapp(input.whatsapp, input.country);
    const db = await readDb();
    const { token: deviceToken, device } = ensureCustomerDevice(db, req);
    const rateOk = enforcePortalRateLimit(db, req, "portal_register", email || phoneKey(input.whatsapp), maxPortalRegisterRequestsPerWindow);
    const turnstile = await validateTurnstileIfConfigured(req, input, "portal_register");
    if (!rateOk) {
      audit(db, null, "PORTAL_REGISTER_RATE_LIMITED", null, { emailHash: hashToken(email), ipHash: hashToken(clientIp(req)) });
      await writeDb(db);
      res.setHeader("Set-Cookie", cookieHeader(customerDeviceCookieName, deviceToken, customerDeviceMaxAgeSeconds));
      return sendJson(res, 429, { error: "Demasiados intentos. Intenta mas tarde." });
    }
    if (!turnstile.ok) {
      audit(db, null, "PORTAL_REGISTER_TURNSTILE_FAILED", null, { emailHash: hashToken(email), reason: turnstile.error });
      await writeDb(db);
      res.setHeader("Set-Cookie", cookieHeader(customerDeviceCookieName, deviceToken, customerDeviceMaxAgeSeconds));
      return sendJson(res, 400, { error: turnstile.error });
    }
    if (!nameValidation.ok || !email.includes("@") || !validatePassword(password) || !phoneValidation.ok) {
      audit(db, null, "PORTAL_REGISTER_VALIDATION_FAILED", null, {
        emailHash: hashToken(email),
        reason: !nameValidation.ok ? "name" : (!phoneValidation.ok ? "whatsapp" : "required"),
        ipHash: hashToken(clientIp(req)),
      });
      await writeDb(db);
      res.setHeader("Set-Cookie", cookieHeader(customerDeviceCookieName, deviceToken, customerDeviceMaxAgeSeconds));
      return sendJson(res, 400, { error: nameValidation.error || phoneValidation.error || "Nombre, correo, contrasena, WhatsApp y pais son obligatorios." });
    }
    const name = nameValidation.name;
    const whatsapp = phoneValidation.whatsapp;
    const country = phoneValidation.country;
    if (db.customerUsers.some((candidate) => candidate.email === email)) {
      audit(db, null, "PORTAL_REGISTER_EXISTING_EMAIL", null, { emailHash: hashToken(email), ipHash: hashToken(clientIp(req)) });
      await writeDb(db);
      res.setHeader("Set-Cookie", cookieHeader(customerDeviceCookieName, deviceToken, customerDeviceMaxAgeSeconds));
      return sendJson(res, 200, {
        message: "Si los datos son validos, revisa tu correo para continuar.",
        emailVerification: { required: true },
      });
    }
    const client = {
      id: crypto.randomUUID(),
      name,
      whatsapp,
      country,
      whatsappCountryIso: phoneValidation.countryIso,
      whatsappDetectedCountry: phoneValidation.detectedCountry,
      status: "REGISTRADO_NO_VERIFICADO",
      primaryEmail: email,
      emailVerifiedAt: "",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    const customerUser = {
      id: crypto.randomUUID(),
      clientId: client.id,
      name,
      email,
      passwordHash: await hashPassword(password),
      role: "OWNER",
      active: true,
      emailVerifiedAt: "",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    authorizeCustomerDevice(device, client.id);
    db.customerClients.unshift(client);
    db.customerUsers.unshift(customerUser);
    reconcilePortalClientLink(db, client, null);
    const benefit = defaultCustomerBenefit(client.id, client.masterClientId || "");
    db.customerBenefits.push(benefit);
    const token = crypto.randomBytes(32).toString("base64url");
    db.customerSessions.push({
      id: crypto.randomUUID(),
      userId: customerUser.id,
      clientId: client.id,
      tokenHash: hashToken(token),
      deviceId: device.id,
      version: customerSessionVersion,
      createdAt: nowIso(),
      lastSeenAt: nowIso(),
      lastSeenAtMs: Date.now(),
      expiresAt: Date.now() + customerSessionMaxAgeSeconds * 1000,
    });
    audit(db, null, "PORTAL_CUSTOMER_REGISTERED", client.id, { email, country, deviceId: device.id });
    const verificationToken = createCustomerEmailVerificationToken(db, customerUser, "register");
    await writeDb(db);
    let verificationSent = false;
    try {
      await sendCustomerVerificationEmail(customerUser, client, verificationToken);
      verificationSent = true;
      const emailDb = await readDb();
      audit(emailDb, customerUser.id, "PORTAL_EMAIL_VERIFICATION_SENT", client.id, { email });
      await writeDb(emailDb);
    } catch (error) {
      const failureDb = await readDb();
      audit(failureDb, customerUser.id, "PORTAL_EMAIL_VERIFICATION_SEND_FAILED", client.id, { email, error: cleanText(error.message, 160) });
      await writeDb(failureDb);
    }
    res.setHeader("Set-Cookie", [
      cookieHeader(customerSessionCookieName, token, customerSessionMaxAgeSeconds),
      cookieHeader(customerDeviceCookieName, deviceToken, customerDeviceMaxAgeSeconds),
    ]);
    return sendJson(res, 201, {
      customer: publicCustomerState(db, { user: customerUser, client, device }),
      catalog: publicPortalCatalog(db),
      message: verificationSent ? "Cuenta creada. Revisa tu correo para verificarla." : "Cuenta creada. No pudimos enviar el correo de verificacion; intenta reenviarlo.",
      emailVerification: { required: true, sent: verificationSent },
    });
  }

  if (req.method === "POST" && pathname === "/api/portal/resend-verification") {
    const context = await getCurrentCustomerContext(req);
    if (!requireCustomer(context, res)) return;
    const db = context.db;
    const rateOk = enforcePortalRateLimit(db, req, "portal_email_verification", context.user.email, maxPortalVerificationEmailRequestsPerWindow);
    const genericMessage = "Si tu cuenta necesita verificacion, enviaremos un correo en unos minutos.";
    if (!rateOk) {
      audit(db, context.user.id, "PORTAL_EMAIL_VERIFICATION_RESEND_RATE_LIMITED", context.client.id, { ipHash: hashToken(clientIp(req)) });
      await writeDb(db);
      return sendJson(res, 429, { error: "Demasiados intentos. Intenta mas tarde." });
    }
    if (customerEmailIsVerified(context.client)) {
      audit(db, context.user.id, "PORTAL_EMAIL_VERIFICATION_RESEND_SKIPPED", context.client.id, { reason: "already_verified" });
      await writeDb(db);
      return sendJson(res, 200, { message: genericMessage });
    }
    const verificationToken = createCustomerEmailVerificationToken(db, context.user, "resend");
    await writeDb(db);
    try {
      await sendCustomerVerificationEmail(context.user, context.client, verificationToken);
      const emailDb = await readDb();
      audit(emailDb, context.user.id, "PORTAL_EMAIL_VERIFICATION_RESENT", context.client.id, { email: context.user.email });
      await writeDb(emailDb);
    } catch (error) {
      const failureDb = await readDb();
      audit(failureDb, context.user.id, "PORTAL_EMAIL_VERIFICATION_RESEND_FAILED", context.client.id, { error: cleanText(error.message, 160) });
      await writeDb(failureDb);
    }
    return sendJson(res, 200, { message: genericMessage });
  }

  if (req.method === "POST" && pathname === "/api/portal/login") {
    const input = await parseJson(req);
    const email = normalizeEmail(input.email);
    const password = String(input.password || "");
    const db = await readDb();
    const { token: deviceToken, device } = ensureCustomerDevice(db, req);
    const rateOk = enforcePortalRateLimit(db, req, "portal_login", email, maxPortalRegisterRequestsPerWindow);
    if (!rateOk) {
      audit(db, null, "PORTAL_LOGIN_RATE_LIMITED", null, { emailHash: hashToken(email), ipHash: hashToken(clientIp(req)) });
      await writeDb(db);
      res.setHeader("Set-Cookie", cookieHeader(customerDeviceCookieName, deviceToken, customerDeviceMaxAgeSeconds));
      return sendJson(res, 429, { error: "Demasiados intentos. Intenta mas tarde." });
    }
    const customerUser = db.customerUsers.find((candidate) => candidate.email === email && candidate.active !== false);
    if (!customerUser || !(await verifyPassword(password, customerUser.passwordHash))) {
      audit(db, null, "PORTAL_LOGIN_FAILED", customerUser?.clientId || null, { emailHash: hashToken(email) });
      await writeDb(db);
      res.setHeader("Set-Cookie", cookieHeader(customerDeviceCookieName, deviceToken, customerDeviceMaxAgeSeconds));
      return sendJson(res, 401, { error: "Credenciales de cliente invalidas." });
    }
    const client = db.customerClients.find((candidate) => candidate.id === customerUser.clientId);
    if (!client || client.status === "BLOQUEADO") {
      await writeDb(db);
      res.setHeader("Set-Cookie", cookieHeader(customerDeviceCookieName, deviceToken, customerDeviceMaxAgeSeconds));
      return sendJson(res, 403, { error: "Cuenta cliente bloqueada o no disponible." });
    }
    const token = crypto.randomBytes(32).toString("base64url");
    db.customerSessions = db.customerSessions.filter((session) => session.expiresAt > Date.now() && session.version === customerSessionVersion);
    db.customerSessions.push({
      id: crypto.randomUUID(),
      userId: customerUser.id,
      clientId: client.id,
      tokenHash: hashToken(token),
      deviceId: device.id,
      version: customerSessionVersion,
      createdAt: nowIso(),
      lastSeenAt: nowIso(),
      lastSeenAtMs: Date.now(),
      expiresAt: Date.now() + customerSessionMaxAgeSeconds * 1000,
    });
    audit(db, null, "PORTAL_LOGIN_SUCCESS", client.id, {
      email,
      deviceId: device.id,
      authorizedForBenefits: customerDeviceIsAuthorized(device, client.id),
    });
    await writeDb(db);
    res.setHeader("Set-Cookie", [
      cookieHeader(customerSessionCookieName, token, customerSessionMaxAgeSeconds),
      cookieHeader(customerDeviceCookieName, deviceToken, customerDeviceMaxAgeSeconds),
    ]);
    return sendJson(res, 200, {
      customer: publicCustomerState(db, { user: customerUser, client, device }),
      catalog: publicPortalCatalog(db),
    });
  }

  if (req.method === "POST" && pathname === "/api/portal/logout") {
    const token = getCookie(req, customerSessionCookieName);
    const db = await readDb();
    if (token) {
      db.customerSessions = db.customerSessions.filter((session) => session.tokenHash !== hashToken(token));
      await writeDb(db);
    }
    res.setHeader("Set-Cookie", cookieHeader(customerSessionCookieName, "", 0));
    return sendJson(res, 200, { message: "Sesion cliente cerrada." });
  }

  if (req.method === "GET" && pathname === "/api/portal/orders") {
    const context = await getCurrentCustomerContext(req);
    if (!requireCustomer(context, res)) return;
    res.setHeader("Set-Cookie", cookieHeader(customerDeviceCookieName, context.deviceToken, customerDeviceMaxAgeSeconds));
    return sendJson(res, 200, { orders: publicCustomerState(context.db, context).orders });
  }

  if (req.method === "GET" && pathname === "/api/portal/orders/events") {
    const context = await getCurrentCustomerContext(req);
    const db = context.db;
    if (!context.user || !context.client) {
      audit(db, null, "PORTAL_ORDERS_STREAM_BLOCKED", null, {
        reason: "missing_customer_session",
        ipHash: hashToken(clientIp(req)),
      });
      await writeDb(db);
      return sendJson(res, 401, { error: "Cuenta de cliente requerida." });
    }
    const streamId = crypto.randomUUID();
    audit(db, context.user.id, "PORTAL_ORDERS_STREAM_CONNECTED", context.client.id, {
      streamId,
      ipHash: hashToken(clientIp(req)),
    });
    await writeDb(db);
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
      "Set-Cookie": cookieHeader(customerDeviceCookieName, context.deviceToken, customerDeviceMaxAgeSeconds),
    });
    res.write("retry: 5000\n\n");
    const stream = {
      id: streamId,
      clientId: context.client.id,
      userId: context.user.id,
      res,
      startedAtMs: Date.now(),
      closed: false,
    };
    addPortalOrderStream(context.client.id, stream);
    sendSseEvent(res, "orders", {
      reason: "connected",
      updatedAt: nowIso(),
      orders: publicCustomerOrdersForClient(db, context.client.id),
    }, `${Date.now()}`);
    const heartbeat = setInterval(() => {
      if (stream.closed || res.destroyed || res.writableEnded) return;
      res.write(`: heartbeat ${Date.now()}\n\n`);
    }, portalOrdersSseHeartbeatMs);
    const cleanup = () => {
      if (stream.closed) return;
      stream.closed = true;
      clearInterval(heartbeat);
      removePortalOrderStream(context.client.id, stream);
      (async () => {
        try {
          const disconnectDb = await readDb();
          audit(disconnectDb, context.user.id, "PORTAL_ORDERS_STREAM_DISCONNECTED", context.client.id, {
            streamId,
            durationMs: Date.now() - stream.startedAtMs,
          });
          await writeDb(disconnectDb);
        } catch (error) {
          console.error(error);
        }
      })();
    };
    req.on("close", cleanup);
    res.on("error", cleanup);
    return;
  }

  if (req.method === "POST" && pathname === "/api/portal/orders/frp") {
    const context = await getCurrentCustomerContext(req);
    if (!requireCustomer(context, res)) return;
    const input = await parseJson(req);
    const db = context.db;
    if (!customerEmailIsVerified(context.client)) {
      audit(db, context.user.id, "PORTAL_ORDER_BLOCKED_EMAIL_UNVERIFIED", context.client.id, { service: "PORTAL-XIAOMI-FRP" });
      await writeDb(db);
      return sendJson(res, 403, { error: "Verifica tu correo antes de crear solicitudes." });
    }
    const rateOk = enforcePortalRateLimit(db, req, "portal_order_frp", context.client.id, maxPortalOrderRequestsPerWindow);
    const turnstile = await validateTurnstileIfConfigured(req, input, "portal_order_frp");
    if (!rateOk) {
      audit(db, context.user.id, "PORTAL_ORDER_RATE_LIMITED", context.client.id, { ipHash: hashToken(clientIp(req)) });
      await writeDb(db);
      return sendJson(res, 429, { error: "Demasiadas solicitudes. Intenta mas tarde." });
    }
    if (!turnstile.ok) {
      audit(db, context.user.id, "PORTAL_ORDER_TURNSTILE_FAILED", context.client.id, { reason: turnstile.error });
      await writeDb(db);
      return sendJson(res, 400, { error: turnstile.error });
    }
    const quantity = Math.max(1, Math.min(50, Number.parseInt(input.quantity, 10) || 1));
    const service = portalPublicServices.find((candidate) => candidate.code === "PORTAL-XIAOMI-FRP" && candidate.enabled);
    const requestedPaymentCode = cleanText(input.paymentMethod, 60);
    const payment = resolvePortalPaymentForClient(requestedPaymentCode, context.client);
    if (!service) return sendJson(res, 503, { error: "Xiaomi FRP no esta disponible en el portal." });
    if (!payment) return sendJson(res, 400, { error: "Metodo de pago invalido para tu pais." });
    reconcilePortalClientLink(db, context.client, context.user.id);
    const benefit = customerBenefitFor(db, context.client.id, context.client.masterClientId || "");
    const canUseBenefits = customerCanUseBenefits(context, benefit);
    const customerStatus = normalizeCustomerStatus(context.client.status);
    const approvalOptionsEligible = canUseBenefits && (
      ["VIP", "EMPRESA"].includes(customerStatus)
      || Number(benefit.vipUnitPrice || 0) > 0
    );
    const urgentRequested = approvalOptionsEligible && Boolean(input.urgentRequested);
    const postpayRequested = approvalOptionsEligible && Boolean(input.postpayRequested);
    if ((input.urgentRequested || input.postpayRequested) && !approvalOptionsEligible) {
      audit(db, context.user.id, "PORTAL_APPROVAL_OPTIONS_BLOCKED", context.client.id, {
        status: customerStatus,
        canUseBenefits,
        requestedUrgent: Boolean(input.urgentRequested),
        requestedPostpay: Boolean(input.postpayRequested),
      });
    }
    const suggestion = portalFrpPriceSuggestion(db, context.client.id, quantity, canUseBenefits, benefit, context.client.masterClientId || benefit.masterClientId || "");
    if (!suggestion.available) {
      audit(db, context.user.id, "PORTAL_FRP_ORDER_BLOCKED_PRICING_UNAVAILABLE", context.client.id, {
        quantity,
        reason: suggestion.error || "pricing_unavailable",
      });
      await writeDb(db);
      return sendJson(res, 503, { error: suggestion.error || "Xiaomi FRP no tiene precio activo en este momento." });
    }
    const requestId = crypto.randomUUID();
    const orderId = crypto.randomUUID();
    const inputItems = Array.isArray(input.items) ? input.items : [];
    const items = Array.from({ length: quantity }, (_, index) => {
      const itemInput = inputItems[index] || {};
      const originalText = cleanText(itemInput.raw || itemInput.model || input.model || "", 180);
      const eligibility = frpEligibilityResult(originalText);
      const status = eligibility.status === "REQUIERE_REVISION" ? "REQUIERE_REVISION" : "ESPERANDO_PREPARACION";
      return {
        id: crypto.randomUUID(),
        requestId,
        orderId,
        clientId: context.client.id,
        masterClientId: context.client.masterClientId || benefit.masterClientId || "",
        sequence: index + 1,
        originalText,
        model: cleanText(itemInput.model || originalText || "", 120),
        imei: cleanText(itemInput.imei || "", 40),
        status,
        eligibilityStatus: eligibility.status,
        eligibilityDetectedMatch: eligibility.detectedMatch,
        eligibilityMatchedAlias: eligibility.matchedAlias,
        eligibilityInternalReason: eligibility.internalReason,
        eligibilityPublicMessage: eligibility.publicMessage,
        frpOrderId: "",
        frpJobId: "",
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
    });
    const eligibilitySummary = summarizeFrpEligibility(items);
    audit(db, context.user.id, "PORTAL_FRP_ELIGIBILITY_VALIDATED", context.client.id, {
      quantity,
      results: eligibilitySummary.results.map((result, index) => ({
        sequence: index + 1,
        status: result.status,
        detectedMatch: result.detectedMatch,
        internalReason: result.internalReason,
      })),
    });
    if (eligibilitySummary.blocked.length) {
      audit(db, context.user.id, "PORTAL_FRP_ELIGIBILITY_BLOCKED", context.client.id, {
        quantity,
        blocked: eligibilitySummary.blocked.map((result) => ({
          status: result.status,
          detectedMatch: result.detectedMatch,
          internalReason: result.internalReason,
        })),
      });
      await writeDb(db);
      return sendJson(res, 409, {
        error: eligibilitySummary.blocked[0]?.publicMessage || "Uno de los equipos no aplica para FRP Express.",
        eligibility: eligibilitySummary.results.map((result, index) => ({
          sequence: index + 1,
          status: result.status,
          message: result.publicMessage,
        })),
      });
    }
    const compatibilityReviewRequired = eligibilitySummary.review.length > 0;
    const initialPublicStatus = compatibilityReviewRequired ? "REVISION_COMPATIBILIDAD" : "ESPERANDO_PAGO";
    const orderCode = nextCustomerOrderCode(db);
    const request = {
      id: requestId,
      clientId: context.client.id,
      masterClientId: context.client.masterClientId || benefit.masterClientId || "",
      userId: context.user.id,
      serviceCode: service.code,
      serviceName: service.name,
      channel: frpWorkChannel,
      status: initialPublicStatus,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    const order = {
      id: orderId,
      code: orderCode,
      accessCode: crypto.randomBytes(8).toString("base64url"),
      requestId: request.id,
      clientId: context.client.id,
      masterClientId: context.client.masterClientId || benefit.masterClientId || "",
      userId: context.user.id,
      serviceCode: service.code,
      internalServiceCode: service.internalServiceCode,
      serviceName: service.name,
      workChannel: frpWorkChannel,
      quantity,
      baseUnitPrice: suggestion.pricingSnapshot?.baseUnitPrice || suggestion.unitPrice,
      suggestedUnitPrice: suggestion.unitPrice,
      unitPrice: suggestion.unitPrice,
      totalPrice: suggestion.total,
      pricingSnapshot: suggestion.pricingSnapshot,
      priceFormatted: formatPortalPaymentAmountFromUsdt(db, suggestion.total, payment),
      discountLabel: suggestion.label,
      discountLocked: suggestion.discountLocked,
      monthlyUsageAtCreation: suggestion.monthlyUsage,
      nextMonthlyTier: suggestion.nextMonthlyTier,
      paymentMethod: payment.code,
      paymentLabel: payment.label,
      paymentDetails: payment.details,
      paymentProofs: [],
      customerConnectionReadyAt: "",
      urgentRequested,
      urgentStatus: urgentRequested ? "SOLICITADO" : "",
      postpayRequested,
      postpayStatus: postpayRequested ? "SOLICITADO" : "",
      publicStatus: initialPublicStatus,
      compatibilityReviewRequired,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      note: cleanText(input.note, 500),
    };
    createFrpOrderFromPortal(db, context.client, order, items);
    db.customerRequests.unshift(request);
    db.customerOrders.unshift(order);
    db.customerOrderItems.unshift(...items);
    if (requestedPaymentCode && requestedPaymentCode !== payment.code) {
      audit(db, context.user.id, "PORTAL_PAYMENT_METHOD_ALIGNED", order.id, {
        code: order.code,
        clientCountry: context.client.country,
        requestedPayment: requestedPaymentCode,
        selectedPayment: payment.code,
      });
    }
    audit(db, context.user.id, "PORTAL_CUSTOMER_ORDER_CREATED", order.id, {
      code: order.code,
      clientId: context.client.id,
      quantity,
      unitPrice: order.unitPrice,
      discountLabel: order.discountLabel,
      canUseBenefits,
      workChannel: frpWorkChannel,
      urgentRequested,
      postpayRequested,
      postpayStatus: order.postpayStatus,
      compatibilityReviewRequired,
    });
    if (compatibilityReviewRequired) {
      audit(db, context.user.id, "PORTAL_FRP_ELIGIBILITY_REVIEW_CREATED", order.id, {
        code: order.code,
        review: eligibilitySummary.review.map((result) => ({
          status: result.status,
          detectedMatch: result.detectedMatch,
          internalReason: result.internalReason,
        })),
      });
    }
    if (urgentRequested) {
      audit(db, context.user.id, "PORTAL_FRP_URGENT_REQUESTED", order.id, { code: order.code });
    }
    if (postpayRequested) {
      audit(db, context.user.id, "PORTAL_FRP_POSTPAY_REQUESTED", order.id, {
        code: order.code,
        eligible: postpayEligible,
        status: order.postpayStatus,
      });
    }
    await writeDb(db);
    publishPortalOrders(db, context.client.id, "order_created");
    return sendJson(res, 201, {
      order: publicCustomerOrder(order, db),
      customer: publicCustomerState(db, context),
    });
  }

  const portalOrderMatch = pathname.match(/^\/api\/portal\/orders\/([^/]+)$/);
  if (req.method === "GET" && portalOrderMatch) {
    const context = await getCurrentCustomerContext(req);
    const db = context.db;
    const codeOrId = cleanText(decodeURIComponent(portalOrderMatch[1]), 80);
    const accessCode = cleanText(new URL(req.url || "/", `http://${req.headers.host || "localhost"}`).searchParams.get("accessCode") || "", 80);
    const order = db.customerOrders.find((candidate) => candidate.id === codeOrId || candidate.code === codeOrId);
    if (!order) return sendJson(res, 404, { error: "Orden no encontrada." });
    const ownsOrder = context.user && context.client && order.clientId === context.client.id;
    const hasAccessCode = accessCode && order.accessCode === accessCode;
    if (!ownsOrder && !hasAccessCode) {
      audit(db, context.user?.id || null, "PORTAL_ORDER_LOOKUP_BLOCKED", order.id, {
        code: order.code,
        ipHash: hashToken(clientIp(req)),
      });
      await writeDb(db);
      return sendJson(res, 403, { error: "Codigo de seguimiento invalido." });
    }
    if (context.deviceToken) {
      res.setHeader("Set-Cookie", cookieHeader(customerDeviceCookieName, context.deviceToken, customerDeviceMaxAgeSeconds));
    }
    return sendJson(res, 200, { order: publicCustomerOrder(order, db) });
  }

  const portalConnectionReadyMatch = pathname.match(/^\/api\/portal\/orders\/([^/]+)\/connection-ready$/);
  if (req.method === "PATCH" && portalConnectionReadyMatch) {
    const context = await getCurrentCustomerContext(req);
    if (!requireCustomer(context, res)) return;
    const db = context.db;
    const order = db.customerOrders.find((candidate) => candidate.id === portalConnectionReadyMatch[1] && candidate.clientId === context.client.id);
    if (!order) return sendJson(res, 404, { error: "Orden no encontrada." });
    const frpOrder = db.frpOrders.find((candidate) => candidate.id === order.frpOrderId);
    const hasProof = Array.isArray(order.paymentProofs) && order.paymentProofs.length > 0;
    const paymentValidated = frpOrder?.checklist?.paymentValidated || frpOrder?.paymentStatus === "PAGO_VALIDADO";
    const postpayApproved = order.postpayStatus === "APROBADO" || frpOrder?.postpayStatus === "APROBADO";
    if (!hasProof && !paymentValidated && !postpayApproved) {
      audit(db, context.user.id, "PORTAL_CONNECTION_READY_BLOCKED_NO_PAYMENT", order.id, { code: order.code });
      await writeDb(db);
      return sendJson(res, 409, { error: "Primero sube el comprobante o espera aprobacion de postpago." });
    }
    const timestamp = nowIso();
    order.customerConnectionReadyAt = order.customerConnectionReadyAt || timestamp;
    order.customerConnectionReadyBy = context.user.id;
    order.updatedAt = timestamp;
    if (frpOrder) {
      frpOrder.customerConnectionReadyAt = frpOrder.customerConnectionReadyAt || order.customerConnectionReadyAt;
      frpOrder.updatedAt = timestamp;
      syncFrpOrderStatus(db, frpOrder);
    }
    audit(db, context.user.id, "PORTAL_CONNECTION_READY", order.id, {
      code: order.code,
      frpOrderId: order.frpOrderId || "",
      paymentValidated: Boolean(paymentValidated),
      proofCount: Array.isArray(order.paymentProofs) ? order.paymentProofs.length : 0,
    });
    await writeDb(db);
    publishPortalOrders(db, context.client.id, "connection_ready");
    return sendJson(res, 200, {
      order: publicCustomerOrder(order, db),
      customer: publicCustomerState(db, context),
    });
  }

  const portalProofMatch = pathname.match(/^\/api\/portal\/orders\/([^/]+)\/payment-proof$/);
  if (req.method === "PATCH" && portalProofMatch) {
    const context = await getCurrentCustomerContext(req);
    if (!requireCustomer(context, res)) return;
    const input = await parseJson(req);
    const db = context.db;
    const rateOk = enforcePortalRateLimit(db, req, "portal_payment_proof", context.client.id, maxPortalProofRequestsPerWindow);
    if (!rateOk) {
      audit(db, context.user.id, "PORTAL_PAYMENT_PROOF_RATE_LIMITED", context.client.id, { ipHash: hashToken(clientIp(req)) });
      await writeDb(db);
      return sendJson(res, 429, { error: "Demasiados comprobantes enviados. Intenta mas tarde." });
    }
    const order = db.customerOrders.find((candidate) => candidate.id === portalProofMatch[1] && candidate.clientId === context.client.id);
    if (!order) return sendJson(res, 404, { error: "Orden no encontrada." });
    if (order.publicStatus === "REVISION_COMPATIBILIDAD") {
      audit(db, context.user.id, "PORTAL_PAYMENT_PROOF_BLOCKED_COMPATIBILITY_REVIEW", order.id, { code: order.code });
      await writeDb(db);
      return sendJson(res, 409, { error: "AriadGSM debe confirmar compatibilidad antes de recibir pago." });
    }
    const proofs = sanitizePaymentProofImages(input.paymentProofs || input.proofs || []);
    if (!proofs.length) return sendJson(res, 400, { error: "Sube al menos una imagen de comprobante." });
    const duplicateHash = new Set();
    for (const candidateOrder of db.customerOrders) {
      for (const proof of candidateOrder.paymentProofs || []) duplicateHash.add(proof.hash);
    }
    for (const frpOrder of db.frpOrders) {
      for (const proof of frpOrder.paymentProofs || []) duplicateHash.add(proof.hash);
    }
    for (const ticket of db.tickets) {
      for (const proof of ticket.paymentProofs || []) duplicateHash.add(proof.hash);
    }
    if (proofs.some((proof) => duplicateHash.has(proof.hash))) {
      audit(db, context.user.id, "PORTAL_PAYMENT_PROOF_DUPLICATE_BLOCKED", order.id, { code: order.code });
      await writeDb(db);
      return sendJson(res, 409, { error: "Ese comprobante ya fue cargado antes." });
    }
    order.paymentProofs = (order.paymentProofs || []).concat(proofs);
    order.publicStatus = "PAGO_EN_REVISION";
    order.updatedAt = nowIso();
    const request = db.customerRequests.find((candidate) => candidate.id === order.requestId);
    if (request) {
      request.status = "PAGO_EN_REVISION";
      request.updatedAt = nowIso();
    }
    const frpOrder = db.frpOrders.find((candidate) => candidate.id === order.frpOrderId);
    if (frpOrder) {
      frpOrder.paymentProofs = (frpOrder.paymentProofs || []).concat(proofs);
      frpOrder.paymentStatus = "PAGO_EN_VALIDACION";
      frpOrder.updatedAt = nowIso();
      syncFrpOrderStatus(db, frpOrder);
    }
    audit(db, context.user.id, "PORTAL_PAYMENT_PROOF_UPLOADED", order.id, {
      code: order.code,
      proofCount: proofs.length,
      frpOrderId: order.frpOrderId || "",
    });
    await writeDb(db);
    publishPortalOrders(db, context.client.id, "payment_proof_uploaded");
    return sendJson(res, 200, {
      order: publicCustomerOrder(order, db),
      customer: publicCustomerState(db, context),
    });
  }

    return false;
  };
}
