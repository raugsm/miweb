export function createFrpSerializers({
  canUseFrp,
  frpJobStatuses,
  frpOrderStatuses,
  frpWorkChannel,
  limaDateStamp,
  publicFrpPricingState,
}) {
  const noConnectionWindowMs = 5 * 60 * 1000;

  function lastNumericSegment(value) {
    const matches = String(value || "").match(/\d+/g);
    return matches?.length ? matches[matches.length - 1] : "";
  }

  function publicShortOrderCode(order) {
    const stored = String(order?.shortCode || order?.operatorShortCode || "").trim();
    if (stored) return stored;
    const numeric = lastNumericSegment(order?.code || "");
    return numeric ? `ARD-${numeric.padStart(4, "0").slice(-4)}` : "";
  }

  function publicShortJobCode(job, order) {
    const stored = String(job?.shortCode || job?.operatorShortCode || "").trim();
    if (stored) return stored;
    const base = publicShortOrderCode(order);
    if (!base) return "";
    const sequence = Number(job?.sequence || lastNumericSegment(job?.code || ""));
    return Number.isFinite(sequence) && sequence > 0
      ? `${base}-${String(sequence).padStart(2, "0")}`
      : base;
  }

  function timestampMs(value) {
    const parsed = Date.parse(value || "");
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function isoAfter(value, ms) {
    const base = timestampMs(value);
    return base ? new Date(base + ms).toISOString() : "";
  }

  function paymentApproved(order) {
    return Boolean(
      order?.checklist?.paymentValidated
      || order?.paymentStatus === "PAGO_VALIDADO"
      || order?.paymentStatus === "COMPROBANTE_RECIBIDO"
    );
  }

  function paymentRejected(order) {
    return order?.paymentStatus === "COMPROBANTE_RECHAZADO";
  }

  function canceledOrderStatus(order) {
    return ["CANCELADO", "CANCELADA"].includes(order?.orderStatus || order?.status);
  }

  function operatorOrderStatus(order, jobs, portalOrder) {
    const activeJobs = jobs.filter((job) => job.status !== "CANCELADO");
    if (canceledOrderStatus(order) || (jobs.length > 0 && activeJobs.length === 0)) return "CANCELED";
    const allDone = activeJobs.length > 0 && activeJobs.every((job) => job.status === "FINALIZADO");
    if (allDone) return "FINISHED";
    if (paymentRejected(order)) return "PAYMENT_REJECTED";
    if (!paymentApproved(order)) return "AI_REVIEWING";
    if (activeJobs.some((job) => job.status === "REQUIERE_REVISION" || job.status === "ESPERANDO_CLIENTE")) return "NEEDS_ATTENTION";
    if (activeJobs.some((job) => job.status === "EN_PROCESO")) return "IN_PROCESS";

    const approvedAt = order.paymentReviewedAt || portalOrder?.paymentReviewedAt || order.priceLockedAt || portalOrder?.priceLockedAt || "";
    const hasOperationalProgress = activeJobs.some((job) => (
      job.status === "LISTO_PARA_TECNICO"
      || job.status === "EN_PROCESO"
      || job.status === "FINALIZADO"
      || job.readyAt
      || job.takenAt
      || job.doneAt
    ));
    if (approvedAt && !hasOperationalProgress && Date.now() - timestampMs(approvedAt) >= noConnectionWindowMs) {
      return "NO_CONNECTION";
    }
    return "PAYMENT_APPROVED";
  }

  function operatorOrderPrimaryAction(status) {
    if (status === "AI_REVIEWING" || status === "PAYMENT_REJECTED" || status === "NEEDS_ATTENTION") return "review";
    if (status === "NO_CONNECTION") return "notify_customer";
    if (status === "PAYMENT_APPROVED" || status === "IN_PROCESS") return "finalize";
    return "";
  }

  function operatorOrderVisible(order, db) {
    const proofCount = Array.isArray(order?.paymentProofs) ? order.paymentProofs.length : 0;
    const jobs = db.frpJobs.filter((job) => job.orderId === order.id);
    const activeJobs = jobs.filter((job) => job.status !== "CANCELADO");
    if (canceledOrderStatus(order) || (jobs.length > 0 && activeJobs.length === 0)) return false;
    const hasOperationalProgress = activeJobs.some((job) => job.status !== "ESPERANDO_PREPARACION");
    return Boolean(
      proofCount > 0
      || paymentApproved(order)
      || paymentRejected(order)
      || hasOperationalProgress
      || ["PAGO_EN_VALIDACION", "COMPROBANTE_RECIBIDO", "PAGO_VALIDADO", "COMPROBANTE_RECHAZADO"].includes(order?.paymentStatus)
    );
  }

  function publicOperatorOrder(order, db) {
    const jobs = db.frpJobs
      .filter((job) => job.orderId === order.id)
      .sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0));
    const portalOrder = order.portalOrderId
      ? db.customerOrders.find((candidate) => candidate.id === order.portalOrderId)
      : null;
    const customerClient = portalOrder?.clientId
      ? db.customerClients.find((candidate) => candidate.id === portalOrder.clientId)
      : null;
    const status = operatorOrderStatus(order, jobs, portalOrder);
    const approvedAt = order.paymentReviewedAt || portalOrder?.paymentReviewedAt || order.priceLockedAt || portalOrder?.priceLockedAt || "";
    const noConnectionAlertAt = order.noConnectionAlertAt || portalOrder?.noConnectionAlertAt || isoAfter(approvedAt, noConnectionWindowMs);
    const shortCode = publicShortOrderCode(order);
    return {
      id: order.id,
      code: order.code,
      realCode: order.code,
      shortCode,
      portalOrderId: order.portalOrderId || "",
      portalOrderCode: portalOrder?.code || "",
      customerId: portalOrder?.clientId || order.clientId || "",
      clientId: order.clientId || "",
      customerStatus: customerClient?.status || "",
      clientName: order.clientName,
      clientWhatsapp: order.clientWhatsapp || "",
      country: order.country,
      quantity: Number(order.quantity || jobs.length || 1),
      paymentStatus: order.paymentStatus || "",
      orderStatus: order.orderStatus || "",
      operatorStatus: status,
      primaryAction: operatorOrderPrimaryAction(status),
      paymentApprovedAt: approvedAt,
      noConnectionAlertAt,
      priceRevalidationStatus: order.priceRevalidationStatus || portalOrder?.priceDecisionAction || "",
      paymentVerification: order.paymentVerification || portalOrder?.paymentVerification || null,
      reviewAllowed: ["AI_REVIEWING", "PAYMENT_REJECTED", "NEEDS_ATTENTION"].includes(status),
      finalizeAllowed: paymentApproved(order) && !["FINISHED", "CANCELED", "PAYMENT_REJECTED"].includes(status),
      notifyCustomerAllowed: status === "NO_CONNECTION",
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      items: jobs.map((job) => ({
        id: job.id,
        orderId: job.orderId,
        portalOrderItemId: job.portalOrderItemId || "",
        deviceIndex: Number(job.sequence || 0),
        sequence: Number(job.sequence || 0),
        code: job.code,
        realCode: job.code,
        shortCode: publicShortJobCode(job, order),
        status: job.status,
        technicianId: job.technicianId || "",
        startedAt: job.takenAt || "",
        readyAt: job.readyAt || "",
        doneAt: job.doneAt || "",
        reviewReason: job.reviewReason || "",
        ardCode: job.ardCode || "",
      })),
    };
  }

  function publicFrpOrder(order, db) {
    const creator = db.users.find((user) => user.id === order.createdBy);
    const jobs = db.frpJobs.filter((job) => job.orderId === order.id);
    return {
      ...order,
      shortCode: publicShortOrderCode(order),
      createdByName: creator?.name || "Sistema",
      jobs: jobs.map((job) => publicFrpJob(job, db, false, order)),
      jobCounts: frpJobStatuses.reduce((acc, status) => {
        acc[status.code] = jobs.filter((job) => job.status === status.code).length;
        return acc;
      }, {}),
    };
  }

  function publicFrpJob(job, db, includeOrder = true, parentOrder = null) {
    const technician = db.users.find((user) => user.id === job.technicianId);
    const order = parentOrder || (includeOrder ? db.frpOrders.find((candidate) => candidate.id === job.orderId) : null);
    // QUE: lookup hasta el customerClient para exponer status VIP y el code
    // del lado portal (CL-...) que se usa para "Codigo del proceso" y filtro
    // VIP del panel operador rediseñado.
    // POR QUE: spec operador-frp-express.md §2.2 (header del card "1 de N
    // equipos") + AC #5, #27, #28 (filtro VIP). El frontend no tiene acceso
    // a customerOrders/customerClients directamente, asi que encapsulamos la
    // resolucion VIP aca para que el filtro client-side trabaje sobre un
    // string ya derivado.
    const portalOrder = order?.portalOrderId
      ? db.customerOrders.find((candidate) => candidate.id === order.portalOrderId)
      : null;
    const customerClient = portalOrder?.clientId
      ? db.customerClients.find((candidate) => candidate.id === portalOrder.clientId)
      : null;
    const processCode = portalOrder?.code && order?.quantity
      ? `${portalOrder.code}-${Math.max(1, Number(order.quantity) || 1)}`
      : "";
    const frozenRedirectorId = order?.redirectorId || order?.technicianId || "";
    return {
      ...job,
      shortCode: publicShortJobCode(job, order),
      technicianName: technician?.name || "",
      order: order ? {
        id: order.id,
        code: order.code,
        shortCode: publicShortOrderCode(order),
        clientName: order.clientName,
        country: order.country,
        unitPrice: order.unitPrice,
        totalPrice: order.totalPrice,
        paymentLabel: order.paymentLabel,
        quantity: Number(order.quantity || 1),
        technicianId: frozenRedirectorId,
        redirectorId: frozenRedirectorId,
        customerStatus: customerClient?.status || "",
        portalOrderCode: portalOrder?.code || "",
        processCode,
      } : undefined,
    };
  }

  function publicFrpState(db, user) {
    if (!canUseFrp(user)) {
      return { enabled: false, orders: [], jobs: [], operatorOrders: [], metrics: {}, statuses: { orders: frpOrderStatuses, jobs: frpJobStatuses }, pricing: publicFrpPricingState(db, user) };
    }
    const orders = db.frpOrders.filter((order) => user.role === "ADMIN" || order.workChannel === frpWorkChannel);
    const operatorOrders = orders.filter((order) => operatorOrderVisible(order, db));
    const jobs = db.frpJobs.filter((job) => user.role === "ADMIN" || job.workChannel === frpWorkChannel);
    const today = limaDateStamp();
    const todaysJobs = jobs.filter((job) => limaDateStamp(job.createdAt) === today || limaDateStamp(job.doneAt) === today);
    // QUE: lista (no count) de jobs FINALIZADO con doneAt en el dia actual Lima.
    // Spec operador-frp-express.md §2.7 + AC #29: la tabla "Finalizados hoy"
    // muestra finalizados de todos los tecnicos FRP elegibles del dia, ordenados por doneAt desc
    // (mas recientes primero).
    // POR QUE expongo aparte de jobs[]: jobs.slice(0,200) puede recortar dias
    // antiguos en deployments con muchos jobs historicos y dejaria al frontend
    // sin garantia de tener todos los del dia actual. finishedTodayJobs filtra
    // por doneAt antes de cualquier slice.
    const finishedTodayJobs = todaysJobs
      .filter((job) => job.status === "FINALIZADO" && limaDateStamp(job.doneAt) === today)
      .sort((a, b) => String(b.doneAt || "").localeCompare(String(a.doneAt || "")))
      .map((job) => publicFrpJob(job, db));
    return {
      enabled: true,
      orders: orders.slice(0, 80).map((order) => publicFrpOrder(order, db)),
      jobs: jobs.slice(0, 200).map((job) => publicFrpJob(job, db)),
      operatorOrders: operatorOrders.slice(0, 80).map((order) => publicOperatorOrder(order, db)),
      finishedTodayJobs,
      metrics: {
        ordersToday: orders.filter((order) => limaDateStamp(order.createdAt) === today).length,
        finishedToday: todaysJobs.filter((job) => job.status === "FINALIZADO").length,
        ready: jobs.filter((job) => job.status === "LISTO_PARA_TECNICO").length,
        inProcess: jobs.filter((job) => job.status === "EN_PROCESO").length,
        review: jobs.filter((job) => job.status === "REQUIERE_REVISION").length,
        myActive: jobs.filter((job) => job.technicianId === user.id && job.status === "EN_PROCESO").length,
      },
      statuses: { orders: frpOrderStatuses, jobs: frpJobStatuses },
      pricing: publicFrpPricingState(db, user),
    };
  }

  return {
    publicFrpOrder,
    publicFrpJob,
    publicFrpState,
  };
}
