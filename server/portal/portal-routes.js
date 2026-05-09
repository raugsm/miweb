import { assessPaymentProofsForAutomation } from "../payments/payment-verification.js";
import {
  customerLoginAttempt as defaultCustomerLoginAttempt,
  customerSessionBootstrap as defaultCustomerSessionBootstrap,
  customerSessionDelete as defaultCustomerSessionDelete,
  customerSessionLookup as defaultCustomerSessionLookup,
} from "../db/postgres-auth.js";

export function createPortalRoutes({
  addAdminConfigStream,
  addPortalOrderStream,
  adminConfigSseHeartbeatMs,
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
  customerPendingDebt,
  customerSessionCookieName,
  customerSessionMaxAgeSeconds,
  customerSessionVersion,
  customerLoginAttempt = defaultCustomerLoginAttempt,
  customerSessionBootstrap = defaultCustomerSessionBootstrap,
  customerSessionDelete = defaultCustomerSessionDelete,
  customerSessionLookup = defaultCustomerSessionLookup,
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
  publishFrpOps,
  publicActiveTechnician,
  customerModuleUrl,
  createAuditEvent,
  persistAuditEventOnly,
  readDb,
  renderOrderComprobantePdf,
  reconcilePortalClientLink,
  removeAdminConfigStream,
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
  useGranularCustomerAuth = () => false,
}) {
  function markCustomerFrpJobReady(job, timestamp) {
    if (!job) return false;
    job.checklist = {
      ...job.checklist,
      clientConnected: true,
      requiredStateConfirmed: true,
      modelSupported: Boolean(job.checklist?.modelSupported || !job.eligibilityStatus || job.eligibilityStatus === "APTO_EXPRESS"),
    };
    job.status = job.checklist.modelSupported ? "LISTO_PARA_TECNICO" : "REQUIERE_REVISION";
    if (job.status === "LISTO_PARA_TECNICO") job.readyAt ||= timestamp;
    job.updatedAt = timestamp;
    return true;
  }

  function activeRedirectorIdFromDb(db) {
    const activeTechnician = publicActiveTechnician(db.activeTechnician, Date.now());
    return cleanText(activeTechnician?.redirectorId || "", 64);
  }

  function freezeRedirectorId(order, frpOrder, redirectorId) {
    if (!redirectorId) return;
    order.technicianId ||= redirectorId;
    order.redirectorId ||= redirectorId;
    if (frpOrder) {
      frpOrder.technicianId ||= redirectorId;
      frpOrder.redirectorId ||= redirectorId;
    }
  }

  function retireDraftPaymentOrders(db, clientId, replacementOrderId, actorId) {
    const timestamp = nowIso();
    const retired = [];
    for (const order of db.customerOrders || []) {
      if (order.clientId !== clientId) continue;
      if (order.id === replacementOrderId) continue;
      if (order.publicStatus !== "ESPERANDO_PAGO") continue;
      if ((order.paymentProofs || []).length) continue;
      if (Number(order.priceLocked || 0) > 0) continue;

      order.publicStatus = "CANCELADO";
      order.cancellationReason = "SUPERSEDED_BY_PROOF_UPLOAD";
      order.canceledAt = timestamp;
      order.updatedAt = timestamp;

      const request = (db.customerRequests || []).find((candidate) => candidate.id === order.requestId);
      if (request) {
        request.status = "CANCELADO";
        request.updatedAt = timestamp;
      }

      const frpOrder = (db.frpOrders || []).find((candidate) => (
        candidate.id === order.frpOrderId || candidate.portalOrderId === order.id
      ));
      if (frpOrder && frpOrder.orderStatus !== "FINALIZADO") {
        frpOrder.orderStatus = "CANCELADA";
        frpOrder.cancellationReason = "SUPERSEDED_BY_PROOF_UPLOAD";
        frpOrder.canceledAt = timestamp;
        frpOrder.updatedAt = timestamp;
      }

      const items = (db.customerOrderItems || []).filter((candidate) => candidate.orderId === order.id);
      for (const item of items) {
        if (item.status === "FINALIZADO") continue;
        item.status = "CANCELADO";
        item.cancelReason = "superseded_by_proof_upload";
        item.canceledAt = timestamp;
        item.updatedAt = timestamp;
      }

      const jobs = frpOrder
        ? (db.frpJobs || []).filter((candidate) => candidate.orderId === frpOrder.id)
        : [];
      for (const job of jobs) {
        if (job.status === "FINALIZADO") continue;
        job.status = "CANCELADO";
        job.technicianId = "";
        job.takenAt = "";
        job.cancelReason = "superseded_by_proof_upload";
        job.canceledAt = timestamp;
        job.updatedAt = timestamp;
      }

      retired.push(order);
    }

    if (retired.length) {
      audit(db, actorId || null, "PORTAL_DRAFT_PAYMENT_ORDERS_RETIRED", clientId, {
        replacementOrderId,
        count: retired.length,
        codes: retired.map((order) => order.code),
      });
    }
    return retired.length;
  }

  return async function handlePortalApi(req, res, pathname) {
  if (req.method === "GET" && pathname === "/api/portal/catalog") {
    const db = await readDb();
    return sendJson(res, 200, { catalog: publicPortalCatalog(db) });
  }

  if (req.method === "GET" && pathname === "/api/portal/active-technician") {
    const db = await readDb();
    return sendJson(res, 200, { technician: publicActiveTechnician(db.activeTechnician, Date.now()) });
  }

  if (req.method === "GET" && pathname === "/api/portal/session") {
    if (useGranularCustomerAuth()) {
      let deviceToken = getCookie(req, customerDeviceCookieName);
      if (!deviceToken) deviceToken = crypto.randomBytes(32).toString("base64url");
      const sessionToken = getCookie(req, customerSessionCookieName);
      const deviceTokenHash = hashToken(deviceToken);
      const context = sessionToken
        ? await customerSessionLookup(hashToken(sessionToken), deviceTokenHash, {
          sessionVersion: customerSessionVersion,
          presenceWriteIntervalMs: 10 * 1000,
          nowMs: Date.now(),
          nowIso: nowIso(),
        })
        : { user: null, client: null, device: null };
      const bootstrap = context?.user && context?.client
        ? await customerSessionBootstrap(context.user, context.client, context.device, {
          publicCustomerState,
          publicPortalCatalog,
        })
        : await customerSessionBootstrap(null, null, null, {
          publicCustomerState,
          publicPortalCatalog,
        });
      res.setHeader("Set-Cookie", cookieHeader(customerDeviceCookieName, deviceToken, customerDeviceMaxAgeSeconds));
      return sendJson(res, 200, {
        customer: bootstrap.customer,
        catalog: bootstrap.catalog,
      });
    }
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
    if (useGranularCustomerAuth()) {
      let deviceToken = getCookie(req, customerDeviceCookieName);
      if (!deviceToken) deviceToken = crypto.randomBytes(32).toString("base64url");
      const token = crypto.randomBytes(32).toString("base64url");
      const deviceInfo = {
        tokenHash: hashToken(deviceToken),
        userAgent: cleanText(req.headers["user-agent"] || "unknown", 180),
        ipHash: hashToken(clientIp(req)),
        nowIso: nowIso(),
        nowMs: Date.now(),
      };
      const result = await customerLoginAttempt(email, password, deviceInfo, {
        verifyPassword,
        sessionTokenHash: hashToken(token),
        sessionVersion: customerSessionVersion,
        sessionMaxAgeSeconds: customerSessionMaxAgeSeconds,
        rateLimitOptions: {
          bucket: "portal_login",
          maxAttempts: maxPortalRegisterRequestsPerWindow,
        },
      });
      res.setHeader("Set-Cookie", cookieHeader(customerDeviceCookieName, deviceToken, customerDeviceMaxAgeSeconds));
      if (result.status === "rate_limited") {
        return sendJson(res, 429, { error: "Demasiados intentos. Intenta mas tarde." });
      }
      if (result.status === "invalid_credentials") {
        return sendJson(res, 401, { error: "Credenciales de cliente invalidas." });
      }
      if (result.status === "blocked") {
        return sendJson(res, 403, { error: "Cuenta cliente bloqueada o no disponible." });
      }
      const bootstrap = await customerSessionBootstrap(result.user, result.client, result.device, {
        publicCustomerState,
        publicPortalCatalog,
      });
      res.setHeader("Set-Cookie", [
        cookieHeader(customerSessionCookieName, token, customerSessionMaxAgeSeconds),
        cookieHeader(customerDeviceCookieName, deviceToken, customerDeviceMaxAgeSeconds),
      ]);
      return sendJson(res, 200, {
        customer: bootstrap.customer,
        catalog: bootstrap.catalog,
      });
    }
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
    if (useGranularCustomerAuth()) {
      if (token) await customerSessionDelete(hashToken(token));
      res.setHeader("Set-Cookie", cookieHeader(customerSessionCookieName, "", 0));
      return sendJson(res, 200, { message: "SesiÃ³n cliente cerrada." });
    }
    const db = await readDb();
    if (token) {
      db.customerSessions = db.customerSessions.filter((session) => session.tokenHash !== hashToken(token));
      await writeDb(db);
    }
    res.setHeader("Set-Cookie", cookieHeader(customerSessionCookieName, "", 0));
    return sendJson(res, 200, { message: "Sesión cliente cerrada." });
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
      const event = audit(db, null, "PORTAL_ORDERS_STREAM_BLOCKED", null, {
        reason: "missing_customer_session",
        ipHash: hashToken(clientIp(req)),
      });
      await persistAuditEventOnly(event, { db, alreadyInDb: true, label: "portal_orders_stream_blocked" });
      return sendJson(res, 401, { error: "Cuenta de cliente requerida." });
    }
    const streamId = crypto.randomUUID();
    const event = audit(db, context.user.id, "PORTAL_ORDERS_STREAM_CONNECTED", context.client.id, {
      streamId,
      ipHash: hashToken(clientIp(req)),
    });
    await persistAuditEventOnly(event, { db, alreadyInDb: true, label: "portal_orders_stream_connected" });
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
          const event = createAuditEvent(context.user.id, "PORTAL_ORDERS_STREAM_DISCONNECTED", context.client.id, {
            streamId,
            durationMs: Date.now() - stream.startedAtMs,
          });
          await persistAuditEventOnly(event, { label: "portal_orders_stream_disconnected" });
        } catch (error) {
          console.error(error);
        }
      })();
    };
    req.on("close", cleanup);
    res.on("error", cleanup);
    return;
  }

  // Sub-commit 15a.2: SSE broadcast del canal admin-config. Sin requireCustomer
  // (los datos —cambio de tasa, toggle de método de pago— son públicos por
  // igual a todos los visitantes). Heartbeat 25s. Cleanup en disconnect.
  if (req.method === "GET" && pathname === "/api/portal/admin-config/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write("retry: 5000\n\n");
    const stream = {
      id: crypto.randomUUID(),
      res,
      startedAtMs: Date.now(),
      closed: false,
    };
    addAdminConfigStream(stream);
    sendSseEvent(res, "connected", { updatedAt: nowIso() }, `${Date.now()}`);
    const heartbeat = setInterval(() => {
      if (stream.closed || res.destroyed || res.writableEnded) return;
      res.write(`: heartbeat ${Date.now()}\n\n`);
    }, adminConfigSseHeartbeatMs);
    const cleanup = () => {
      if (stream.closed) return;
      stream.closed = true;
      clearInterval(heartbeat);
      removeAdminConfigStream(stream);
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
    // QUE: bloqueo PR-2a.4 / FINAL §3 — VIP con deuda del cierre anterior no puede
    // crear nuevas ordenes hasta que el operador valide su pago (que limpia debt).
    const pendingDebt = customerPendingDebt(db, context.client.id);
    if (pendingDebt > 0) {
      audit(db, context.user.id, "PORTAL_ORDER_BLOCKED_VIP_DEBT", context.client.id, { pendingDebtUsdt: pendingDebt });
      await writeDb(db);
      return sendJson(res, 403, {
        error: `Tienes una deuda pendiente de ${pendingDebt.toFixed(2)} USDT del dia anterior. Pagala para continuar con nuevas solicitudes.`,
        pendingDebtUsdt: pendingDebt,
      });
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
    const payment = resolvePortalPaymentForClient(requestedPaymentCode, context.client, db);
    if (!service) return sendJson(res, 503, { error: "Xiaomi FRP no esta disponible en el portal." });
    if (!payment) return sendJson(res, 400, { error: "Metodo de pago invalido para tu pais." });
    reconcilePortalClientLink(db, context.client, context.user.id);
    const benefit = customerBenefitFor(db, context.client.id, context.client.masterClientId || "");
    const canUseBenefits = customerCanUseBenefits(context, benefit);
    // PR-2a-final.2: "Opciones sujetas a aprobacion" eliminadas — ya no son
    // alimentadas por la UI del portal. Mantenemos los campos a false en el
    // schema de orden para no romper consumidores que los lean. El postpago
    // VIP queda controlado puramente por status=VIP del cliente (FINAL §3),
    // no por checkbox del cliente.
    const urgentRequested = false;
    const postpayRequested = false;
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
    // QUE: el cliente puede adjuntar comprobantes en el mismo POST que crea la orden.
    // POR QUE: FINAL §15 elimina el boton "Crear solicitud" y manda crear la orden al
    // subir comprobante en paso 3. Validamos aqui para que la creacion + carga sean
    // atomicas (un solo writeDb) en lugar de partirlo en dos requests con rollback.
    const inputProofs = sanitizePaymentProofImages(input.paymentProofs || []);
    if (inputProofs.length && compatibilityReviewRequired) {
      audit(db, context.user.id, "PORTAL_ORDER_PROOF_BLOCKED_COMPATIBILITY_REVIEW", context.client.id, {
        quantity,
        proofCount: inputProofs.length,
      });
      await writeDb(db);
      return sendJson(res, 409, { error: "AriadGSM debe confirmar compatibilidad antes de recibir pago. Vuelve a enviar la solicitud sin comprobante." });
    }
    if (inputProofs.length) {
      const proofRateOk = enforcePortalRateLimit(db, req, "portal_payment_proof", context.client.id, maxPortalProofRequestsPerWindow);
      if (!proofRateOk) {
        audit(db, context.user.id, "PORTAL_PAYMENT_PROOF_RATE_LIMITED", context.client.id, { ipHash: hashToken(clientIp(req)) });
        await writeDb(db);
        return sendJson(res, 429, { error: "Demasiados comprobantes enviados. Intenta mas tarde." });
      }
      const duplicateHash = new Set();
      for (const candidateOrder of db.customerOrders) {
        for (const proof of candidateOrder.paymentProofs || []) duplicateHash.add(proof.hash);
      }
      for (const otherFrpOrder of db.frpOrders) {
        for (const proof of otherFrpOrder.paymentProofs || []) duplicateHash.add(proof.hash);
      }
      for (const ticket of db.tickets) {
        for (const proof of ticket.paymentProofs || []) duplicateHash.add(proof.hash);
      }
      if (inputProofs.some((proof) => duplicateHash.has(proof.hash))) {
        audit(db, context.user.id, "PORTAL_PAYMENT_PROOF_DUPLICATE_BLOCKED", context.client.id, { quantity });
        await writeDb(db);
        return sendJson(res, 409, { error: "Ese comprobante ya fue cargado antes." });
      }
    }
    const initialPublicStatus = compatibilityReviewRequired
      ? "REVISION_COMPATIBILIDAD"
      : (inputProofs.length ? "PAGO_EN_REVISION" : "ESPERANDO_PAGO");
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
      paymentProofs: inputProofs.slice(),
      // PR-2a-final.1: el lock arranca recien AL APROBAR el pago el operador
      // (frp-routes.js#payment-review approve). En upload de comprobante NO se
      // ancla — el cliente paga lo que ve en pantalla y queda en
      // PAGO_EN_REVISION sin proteccion temporal hasta la aprobacion.
      priceLocked: 0,
      priceLockedAt: "",
      priceLockExpiresAt: "",
      priceDecisionAction: "",
      priceDecisionAt: "",
      priceDecisionWaitUntil: "",
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
    if (inputProofs.length) {
      const paymentVerification = assessPaymentProofsForAutomation({
        order,
        proofs: inputProofs,
        source: "portal_create",
        now: nowIso(),
      });
      order.paymentVerification = paymentVerification;
      const linkedFrpOrder = db.frpOrders.find((candidate) => candidate.id === order.frpOrderId);
      if (linkedFrpOrder) {
        linkedFrpOrder.paymentProofs = inputProofs.slice();
        linkedFrpOrder.paymentStatus = "PAGO_EN_VALIDACION";
        linkedFrpOrder.paymentVerification = paymentVerification;
        linkedFrpOrder.updatedAt = nowIso();
        syncFrpOrderStatus(db, linkedFrpOrder);
      }
    }
    db.customerRequests.unshift(request);
    db.customerOrders.unshift(order);
    db.customerOrderItems.unshift(...items);
    const retiredDraftPaymentOrders = inputProofs.length
      ? retireDraftPaymentOrders(db, context.client.id, order.id, context.user.id)
      : 0;
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
      retiredDraftPaymentOrders,
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
    if (inputProofs.length) {
      audit(db, context.user.id, "PORTAL_PAYMENT_PROOF_UPLOADED", order.id, {
        code: order.code,
        proofCount: inputProofs.length,
        frpOrderId: order.frpOrderId || "",
        verificationDecision: order.paymentVerification?.decision || "",
        via: "order_create",
      });
    }
    await writeDb(db);
    publishPortalOrders(db, context.client.id, inputProofs.length ? "order_created_with_proof" : "order_created");
    publishFrpOps(db, inputProofs.length ? "payment_review_needed" : "frp_order_created");
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
    const order = db.customerOrders.find((candidate) => candidate.id === codeOrId || candidate.code === codeOrId);
    if (!order) return sendJson(res, 404, { error: "Orden no encontrada." });
    const ownsOrder = context.user && context.client && order.clientId === context.client.id;
    if (!ownsOrder) {
      const event = audit(db, context.user?.id || null, "PORTAL_ORDER_LOOKUP_BLOCKED", order.id, {
        code: order.code,
        ipHash: hashToken(clientIp(req)),
      });
      await persistAuditEventOnly(event, { db, alreadyInDb: true, label: "portal_order_lookup_blocked" });
      return sendJson(res, 403, { error: "Inicia sesion para consultar esta orden." });
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

  const portalNotifyConnectedMatch = pathname.match(/^\/api\/portal\/orders\/([^/]+)\/notify-connected$/);
  if (req.method === "POST" && portalNotifyConnectedMatch) {
    const context = await getCurrentCustomerContext(req);
    if (!requireCustomer(context, res)) return;
    const db = context.db;
    const order = db.customerOrders.find((candidate) => candidate.id === portalNotifyConnectedMatch[1] && candidate.clientId === context.client.id);
    if (!order) return sendJson(res, 404, { error: "Orden no encontrada." });
    // QUE: la orden debe estar en una fase donde el cliente ya pueda fisicamente
    // conectar su equipo via USB Redirector. Eso ocurre cuando el pago esta validado
    // (publicStatus EN_PREPARACION) y opcionalmente cuando el job ya esta listo
    // (LISTO_PARA_CONEXION). Antes de eso (ESPERANDO_PAGO o PAGO_EN_REVISION)
    // todavia no hay nada que conectar; despues (EN_PROCESO o FINALIZADO) el evento
    // ya no aporta valor.
    const derived = publicCustomerOrder(order, db);
    if (!["EN_PREPARACION", "LISTO_PARA_CONEXION"].includes(derived.publicStatus)) {
      audit(db, context.user.id, "PORTAL_CUSTOMER_CONNECTED_BLOCKED", order.id, {
        code: order.code,
        derivedStatus: derived.publicStatus,
      });
      await writeDb(db);
      return sendJson(res, 409, { error: "Solo puedes avisar de conexion cuando tu orden este en preparacion o lista para conexion." });
    }
    const timestamp = nowIso();
    const activeRedirectorId = activeRedirectorIdFromDb(db);
    if (!activeRedirectorId) {
      audit(db, context.user.id, "PORTAL_CUSTOMER_CONNECTED_BLOCKED_NO_TECHNICIAN", order.id, {
        code: order.code,
        derivedStatus: derived.publicStatus,
      });
      await writeDb(db);
      return sendJson(res, 409, { error: "No hay tecnico activo disponible. Espera a que AriadGSM asigne un tecnico." });
    }
    order.customerConnectedAt = order.customerConnectedAt || timestamp;
    order.customerConnectedBy = context.user.id;
    freezeRedirectorId(order, null, activeRedirectorId);
    // Compat con el serializer existente: si todavia no estaba marcado el
    // connection-ready legacy, lo seteamos para que la derivacion siga produciendo
    // LISTO_PARA_CONEXION sin tocar deriveCustomerOrderStatus.
    order.customerConnectionReadyAt = order.customerConnectionReadyAt || timestamp;
    order.updatedAt = timestamp;
    const frpOrder = db.frpOrders.find((candidate) => candidate.id === order.frpOrderId);
    if (frpOrder) {
      frpOrder.customerConnectedAt = frpOrder.customerConnectedAt || timestamp;
      frpOrder.customerConnectionReadyAt = frpOrder.customerConnectionReadyAt || timestamp;
      freezeRedirectorId(order, frpOrder, activeRedirectorId);
      frpOrder.checklist = {
        ...frpOrder.checklist,
        connectionDataSent: true,
        authorizationConfirmed: true,
      };
      frpOrder.updatedAt = timestamp;
      const nextJob = db.frpJobs
        .filter((job) => job.orderId === frpOrder.id)
        .sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0))
        .find((job) => ["ESPERANDO_PREPARACION", "ESPERANDO_CLIENTE"].includes(job.status));
      if (nextJob) markCustomerFrpJobReady(nextJob, timestamp);
      syncFrpOrderStatus(db, frpOrder);
    }
    audit(db, context.user.id, "PORTAL_CUSTOMER_CONNECTED", order.id, {
      code: order.code,
      frpOrderId: order.frpOrderId || "",
      derivedStatus: derived.publicStatus,
    });
    await writeDb(db);
    publishPortalOrders(db, context.client.id, "customer_connected");
    publishFrpOps(db, "frp_job_ready_for_technician");
    return sendJson(res, 200, {
      ok: true,
      order: publicCustomerOrder(order, db),
      customer: publicCustomerState(db, context),
    });
  }

  const portalItemReadyMatch = pathname.match(/^\/api\/portal\/orders\/([^/]+)\/items\/([^/]+)\/ready$/);
  if (req.method === "POST" && portalItemReadyMatch) {
    const context = await getCurrentCustomerContext(req);
    if (!requireCustomer(context, res)) return;
    const db = context.db;
    const orderId = cleanText(decodeURIComponent(portalItemReadyMatch[1]), 80);
    const itemId = cleanText(decodeURIComponent(portalItemReadyMatch[2]), 80);
    const order = db.customerOrders.find((candidate) => candidate.id === orderId && candidate.clientId === context.client.id);
    if (!order) return sendJson(res, 404, { error: "Orden no encontrada." });
    if (order.publicStatus === "CANCELADO") return sendJson(res, 409, { error: "Esta orden fue cancelada." });

    const item = db.customerOrderItems.find((candidate) => candidate.id === itemId && candidate.orderId === order.id);
    if (!item) return sendJson(res, 404, { error: "Equipo no encontrado en esta orden." });
    const frpOrder = db.frpOrders.find((candidate) => candidate.id === order.frpOrderId);
    const paymentValidated = Boolean(frpOrder?.checklist?.paymentValidated || frpOrder?.paymentStatus === "PAGO_VALIDADO");
    if (!frpOrder || !paymentValidated) {
      audit(db, context.user.id, "PORTAL_CUSTOMER_ITEM_READY_BLOCKED_NO_PAYMENT", order.id, {
        code: order.code,
        itemId,
      });
      await writeDb(db);
      return sendJson(res, 409, { error: "Primero debe aprobarse el pago de esta orden." });
    }

    const job = db.frpJobs.find((candidate) => candidate.id === item.frpJobId && candidate.orderId === frpOrder.id);
    if (!job) return sendJson(res, 404, { error: "Trabajo tecnico no encontrado para este equipo." });
    if (job.status === "LISTO_PARA_TECNICO") {
      return sendJson(res, 200, {
        ok: true,
        order: publicCustomerOrder(order, db),
        customer: publicCustomerState(db, context),
      });
    }
    if (!["ESPERANDO_PREPARACION", "ESPERANDO_CLIENTE"].includes(job.status)) {
      return sendJson(res, 409, { error: "Este equipo ya no esta pendiente de conexion." });
    }

    const timestamp = nowIso();
    const activeRedirectorId = activeRedirectorIdFromDb(db);
    if (!activeRedirectorId) {
      audit(db, context.user.id, "PORTAL_CUSTOMER_ITEM_READY_BLOCKED_NO_TECHNICIAN", order.id, {
        code: order.code,
        itemId,
        frpJobId: job.id,
      });
      await writeDb(db);
      return sendJson(res, 409, { error: "No hay tecnico activo disponible. Espera a que AriadGSM asigne un tecnico." });
    }
    order.customerConnectedAt ||= timestamp;
    order.customerConnectedBy ||= context.user.id;
    order.customerConnectionReadyAt ||= timestamp;
    order.customerConnectionReadyBy ||= context.user.id;
    order.updatedAt = timestamp;
    frpOrder.customerConnectedAt ||= timestamp;
    frpOrder.customerConnectionReadyAt ||= timestamp;
    frpOrder.checklist = {
      ...frpOrder.checklist,
      connectionDataSent: true,
      authorizationConfirmed: true,
    };
    frpOrder.updatedAt = timestamp;
    freezeRedirectorId(order, frpOrder, activeRedirectorId);
    markCustomerFrpJobReady(job, timestamp);
    syncFrpOrderStatus(db, frpOrder);
    audit(db, context.user.id, "PORTAL_CUSTOMER_ITEM_READY", order.id, {
      code: order.code,
      itemId: item.id,
      frpJobId: job.id,
      sequence: item.sequence,
      jobStatus: job.status,
    });
    await writeDb(db);
    publishPortalOrders(db, context.client.id, "customer_item_ready");
    publishFrpOps(db, "frp_job_ready_for_technician");
    return sendJson(res, 200, {
      ok: true,
      order: publicCustomerOrder(order, db),
      customer: publicCustomerState(db, context),
    });
  }

  const portalItemCancelMatch = pathname.match(/^\/api\/portal\/orders\/([^/]+)\/items\/([^/]+)\/cancel$/);
  if (req.method === "POST" && portalItemCancelMatch) {
    const context = await getCurrentCustomerContext(req);
    if (!requireCustomer(context, res)) return;
    const input = await parseJson(req);
    const db = context.db;
    const orderId = cleanText(decodeURIComponent(portalItemCancelMatch[1]), 80);
    const itemId = cleanText(decodeURIComponent(portalItemCancelMatch[2]), 80);
    const order = db.customerOrders.find((candidate) => candidate.id === orderId && candidate.clientId === context.client.id);
    if (!order) return sendJson(res, 404, { error: "Orden no encontrada." });
    const publicOrderBefore = publicCustomerOrder(order, db);
    if (["CANCELADO", "FINALIZADO"].includes(publicOrderBefore.publicStatus)) {
      return sendJson(res, 409, { error: "La orden no acepta cancelaciones en su estado actual." });
    }
    const item = db.customerOrderItems.find((candidate) => candidate.id === itemId && candidate.orderId === order.id);
    if (!item) return sendJson(res, 404, { error: "Equipo no encontrado en esta orden." });
    const frpOrder = db.frpOrders.find((candidate) => candidate.id === order.frpOrderId);
    if (!frpOrder) return sendJson(res, 404, { error: "Orden tecnica no encontrada." });
    const job = db.frpJobs.find((candidate) => candidate.id === item.frpJobId && candidate.orderId === frpOrder.id);
    if (!job) return sendJson(res, 404, { error: "Trabajo tecnico no encontrado para este equipo." });
    if (!["ESPERANDO_PREPARACION", "ESPERANDO_CLIENTE"].includes(job.status)) {
      return sendJson(res, 409, { error: "Solo puedes cancelar un equipo que todavia esta pendiente." });
    }

    const timestamp = nowIso();
    const reason = cleanText(input.reason || "CUSTOMER_ITEM_CANCEL", 80) || "CUSTOMER_ITEM_CANCEL";
    item.status = "CANCELADO";
    item.cancelReason = reason;
    item.canceledAt = timestamp;
    item.updatedAt = timestamp;
    job.status = "CANCELADO";
    job.technicianId = "";
    job.takenAt = "";
    job.cancelReason = "customer_item_cancel";
    job.cancelNote = cleanText(input.note || "", 200);
    job.canceledAt = timestamp;
    job.updatedAt = timestamp;
    order.updatedAt = timestamp;
    frpOrder.updatedAt = timestamp;

    const orderJobs = db.frpJobs.filter((candidate) => candidate.orderId === frpOrder.id);
    if (orderJobs.length && orderJobs.every((candidate) => candidate.status === "CANCELADO")) {
      order.publicStatus = "CANCELADO";
      order.cancellationReason = "ALL_ITEMS_CANCELED_BY_CUSTOMER";
      order.canceledAt = timestamp;
      frpOrder.orderStatus = "CANCELADA";
      frpOrder.cancellationReason = "ALL_ITEMS_CANCELED_BY_CUSTOMER";
      frpOrder.canceledAt = timestamp;
      const request = db.customerRequests.find((candidate) => candidate.id === order.requestId);
      if (request) {
        request.status = "CANCELADO";
        request.updatedAt = timestamp;
      }
    } else {
      syncFrpOrderStatus(db, frpOrder);
    }

    audit(db, context.user.id, "PORTAL_CUSTOMER_ITEM_CANCELED", order.id, {
      code: order.code,
      itemId: item.id,
      frpJobId: job.id,
      sequence: item.sequence,
      reason,
      refundMode: "manual",
    });
    await writeDb(db);
    publishPortalOrders(db, context.client.id, "customer_item_canceled");
    publishFrpOps(db, "customer_item_canceled", {
      notice: { type: "info", message: "Un cliente cancelo un equipo. Reembolso manual pendiente." },
    });
    return sendJson(res, 200, {
      ok: true,
      order: publicCustomerOrder(order, db),
      customer: publicCustomerState(db, context),
    });
  }

  const portalAbortMatch = pathname.match(/^\/api\/portal\/orders\/([^/]+)\/abort$/);
  if (req.method === "POST" && portalAbortMatch) {
    const context = await getCurrentCustomerContext(req);
    if (!requireCustomer(context, res)) return;
    const input = await parseJson(req);
    const db = context.db;
    const orderId = cleanText(decodeURIComponent(portalAbortMatch[1]), 80);
    const order = db.customerOrders.find((candidate) => candidate.id === orderId && candidate.clientId === context.client.id);
    if (!order) return sendJson(res, 404, { error: "Orden no encontrada." });
    const publicOrderBefore = publicCustomerOrder(order, db);
    if (["CANCELADO", "FINALIZADO"].includes(publicOrderBefore.publicStatus)) {
      return sendJson(res, 409, { error: "La orden no acepta aborto en su estado actual." });
    }
    const frpOrder = db.frpOrders.find((candidate) => candidate.id === order.frpOrderId);
    if (!frpOrder) return sendJson(res, 404, { error: "Orden tecnica no encontrada." });

    const timestamp = nowIso();
    const note = cleanText(input.note || "", 200);
    const items = db.customerOrderItems.filter((candidate) => candidate.orderId === order.id);
    const jobs = db.frpJobs.filter((candidate) => candidate.orderId === frpOrder.id);
    for (const item of items) {
      const job = jobs.find((candidate) => candidate.id === item.frpJobId);
      if (job?.status !== "FINALIZADO") {
        item.status = "CANCELADO";
        item.cancelReason = "CUSTOMER_ORDER_ABORT";
        item.canceledAt = timestamp;
        item.updatedAt = timestamp;
      }
    }
    for (const job of jobs) {
      if (job.status === "FINALIZADO") continue;
      job.status = "CANCELADO";
      job.technicianId = "";
      job.takenAt = "";
      job.cancelReason = "customer_order_abort";
      if (note) job.cancelNote = note;
      job.canceledAt = timestamp;
      job.updatedAt = timestamp;
    }
    order.publicStatus = "CANCELADO";
    order.cancellationReason = "CUSTOMER_ORDER_ABORT";
    order.canceledAt = timestamp;
    order.updatedAt = timestamp;
    frpOrder.orderStatus = "CANCELADA";
    frpOrder.cancellationReason = "CUSTOMER_ORDER_ABORT";
    frpOrder.canceledAt = timestamp;
    frpOrder.updatedAt = timestamp;
    const request = db.customerRequests.find((candidate) => candidate.id === order.requestId);
    if (request) {
      request.status = "CANCELADO";
      request.updatedAt = timestamp;
    }

    audit(db, context.user.id, "PORTAL_CUSTOMER_ORDER_ABORTED", order.id, {
      code: order.code,
      frpOrderId: frpOrder.id,
      affectedJobs: jobs.filter((job) => job.status === "CANCELADO").length,
      refundMode: "manual",
    });
    await writeDb(db);
    publishPortalOrders(db, context.client.id, "customer_order_aborted");
    publishFrpOps(db, "customer_order_aborted", {
      notice: { type: "error", message: "Un cliente aborto un pedido. Detener trabajo y revisar reembolso manual." },
    });
    return sendJson(res, 200, {
      ok: true,
      order: publicCustomerOrder(order, db),
      customer: publicCustomerState(db, context),
    });
  }

  const portalComprobanteMatch = pathname.match(/^\/api\/portal\/orders\/([^/]+)\/comprobante\.pdf$/);
  if (req.method === "GET" && portalComprobanteMatch) {
    const context = await getCurrentCustomerContext(req);
    const db = context.db;
    const codeOrId = cleanText(decodeURIComponent(portalComprobanteMatch[1]), 80);
    const order = db.customerOrders.find((candidate) => candidate.id === codeOrId || candidate.code === codeOrId);
    if (!order) return sendJson(res, 404, { error: "Orden no encontrada." });
    const ownsOrder = context.user && context.client && order.clientId === context.client.id;
    if (!ownsOrder) return sendJson(res, 403, { error: "Acceso no autorizado al comprobante." });
    // PR-2a-final.bundle2 item 4C bugfix: order.publicStatus es el stored del
    // schema (legacy, set en creacion), no el derivado que ve el cliente. El
    // serializer publicCustomerOrder lo recomputa desde frpOrder + jobs. Para
    // el chequeo "FINALIZADO" usamos el publicStatus derivado, que es lo que
    // el cliente ve y lo que dispara el boton habilitado en Mis Ordenes.
    const publicOrder = publicCustomerOrder(order, db);
    if (publicOrder.publicStatus !== "FINALIZADO") {
      return sendJson(res, 409, { error: "El comprobante PDF se habilita cuando la orden esté finalizada." });
    }
    const items = db.customerOrderItems.filter((item) => item.orderId === order.id).map((item) => {
      const job = db.frpJobs.find((candidate) => candidate.id === item.frpJobId);
      return {
        sequence: item.sequence,
        model: item.model,
        ardCode: job?.ardCode || item.ardCode || "",
        doneAt: job?.doneAt || "",
      };
    });
    const baseUrl = `http://${req.headers.host || "localhost"}`;
    // Lookup del nombre del cliente — publicOrder no lo expone porque no es
    // info publica en general, pero el PDF lo incluye como parte del recibo.
    const clientRecord = db.customerClients.find((candidate) => candidate.id === order.clientId);
    const orderForPdf = { ...publicOrder, clientName: clientRecord?.name || "" };
    const { buffer } = await renderOrderComprobantePdf({ order: orderForPdf, items, baseUrl });
    res.writeHead(200, {
      "Content-Type": "application/pdf",
      "Content-Length": String(buffer.length),
      "Content-Disposition": `inline; filename="AriadGSM-${order.code}.pdf"`,
      "Cache-Control": "no-store",
    });
    return res.end(buffer);
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
    const timestamp = nowIso();
    const paymentVerification = assessPaymentProofsForAutomation({
      order,
      proofs,
      source: "portal_reupload",
      now: timestamp,
    });
    order.paymentProofs = proofs.slice();
    order.paymentVerification = paymentVerification;
    order.publicStatus = "PAGO_EN_REVISION";
    order.updatedAt = timestamp;
    // PR-2a-final.1: lock se setea recien al APROBAR. PATCH /payment-proof
    // (re-upload post-rechazo) no toca priceLocked — la aprobacion siguiente
    // creara la ventana fresh.
    const request = db.customerRequests.find((candidate) => candidate.id === order.requestId);
    if (request) {
      request.status = "PAGO_EN_REVISION";
      request.updatedAt = timestamp;
    }
    const frpOrder = db.frpOrders.find((candidate) => candidate.id === order.frpOrderId);
    if (frpOrder) {
      frpOrder.paymentProofs = proofs.slice();
      frpOrder.paymentVerification = paymentVerification;
      frpOrder.paymentStatus = "PAGO_EN_VALIDACION";
      frpOrder.paymentRejectedReason = "";
      frpOrder.paymentReviewedBy = "";
      frpOrder.paymentReviewedAt = "";
      frpOrder.updatedAt = timestamp;
      syncFrpOrderStatus(db, frpOrder);
    }
    audit(db, context.user.id, "PORTAL_PAYMENT_PROOF_UPLOADED", order.id, {
      code: order.code,
      proofCount: proofs.length,
      frpOrderId: order.frpOrderId || "",
      verificationDecision: paymentVerification.decision,
    });
    await writeDb(db);
    publishPortalOrders(db, context.client.id, "payment_proof_uploaded");
    publishFrpOps(db, "payment_review_needed");
    return sendJson(res, 200, {
      order: publicCustomerOrder(order, db),
      customer: publicCustomerState(db, context),
    });
  }

  const portalPriceDecisionMatch = pathname.match(/^\/api\/portal\/orders\/([^/]+)\/price-decision$/);
  if (req.method === "POST" && portalPriceDecisionMatch) {
    // QUE: cliente decide que hacer cuando el precio subio post-lock (FINAL §2 parte 5).
    // Tres opciones: subir 2do comprobante por la diferencia, esperar 1 hora con
    // auto-cancel si baja, o cancelar y pedir reembolso manual. Stage 2a.2 persiste
    // la decision; Stage 2a.3 wires SSE detection + UI inline.
    const context = await getCurrentCustomerContext(req);
    if (!requireCustomer(context, res)) return;
    const input = await parseJson(req);
    const db = context.db;
    const order = db.customerOrders.find((candidate) => (
      candidate.id === portalPriceDecisionMatch[1] && candidate.clientId === context.client.id
    ));
    if (!order) return sendJson(res, 404, { error: "Orden no encontrada." });
    if (!Number(order.priceLocked || 0)) {
      return sendJson(res, 409, { error: "Esta orden no tiene precio anclado todavia." });
    }
    if (order.priceDecisionAction) {
      return sendJson(res, 409, { error: "Ya tomaste una decision para esta diferencia de precio." });
    }
    if (order.publicStatus === "CANCELADO" || order.publicStatus === "FINALIZADO") {
      return sendJson(res, 409, { error: "La orden no acepta decisiones de precio en su estado actual." });
    }
    const action = cleanText(input.action, 20);
    if (!["second_proof", "wait", "cancel"].includes(action)) {
      return sendJson(res, 400, { error: "Accion invalida. Usa second_proof, wait o cancel." });
    }
    const currentSuggestion = portalFrpPriceSuggestion(
      db,
      context.client.id,
      order.quantity,
      true,
      customerBenefitFor(db, context.client.id, context.client.masterClientId || ""),
      context.client.masterClientId || ""
    );
    const currentUnit = Number(currentSuggestion?.unitPrice || 0);
    const lockedUnit = Number(order.priceLocked || 0);
    if (currentUnit <= lockedUnit) {
      return sendJson(res, 409, { error: "El precio actual no esta por encima del anclado. No hace falta decidir." });
    }
    const timestamp = nowIso();
    order.priceDecisionAction = action;
    order.priceDecisionAt = timestamp;
    order.updatedAt = timestamp;
    if (action === "wait") {
      // 1 hora desde la decision. Stage 2a.3 monitorea SSE y auto-cancela si baja.
      order.priceDecisionWaitUntil = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    }
    if (action === "cancel") {
      order.publicStatus = "CANCELADO";
      order.cancellationReason = "PRICE_UP_AFTER_LOCK";
      const frpOrder = db.frpOrders.find((candidate) => candidate.id === order.frpOrderId);
      if (frpOrder) {
        frpOrder.orderStatus = "CANCELADA";
        frpOrder.updatedAt = timestamp;
        syncFrpOrderStatus(db, frpOrder);
      }
      const request = db.customerRequests.find((candidate) => candidate.id === order.requestId);
      if (request) {
        request.status = "CANCELADO";
        request.updatedAt = timestamp;
      }
    }
    audit(db, context.user.id, "PORTAL_PRICE_DECISION", order.id, {
      code: order.code,
      action,
      lockedUnit,
      currentUnit,
      delta: Number((currentUnit - lockedUnit).toFixed(2)),
    });
    await writeDb(db);
    publishPortalOrders(db, context.client.id, "price_decision");
    return sendJson(res, 200, {
      order: publicCustomerOrder(order, db),
      customer: publicCustomerState(db, context),
    });
  }

    return false;
  };
}
