export function createFrpSerializers({
  canUseFrp,
  frpJobStatuses,
  frpOrderStatuses,
  frpWorkChannel,
  limaDateStamp,
  publicFrpPricingState,
}) {
  function publicFrpOrder(order, db) {
    const creator = db.users.find((user) => user.id === order.createdBy);
    const jobs = db.frpJobs.filter((job) => job.orderId === order.id);
    return {
      ...order,
      createdByName: creator?.name || "Sistema",
      jobs: jobs.map((job) => publicFrpJob(job, db, false)),
      jobCounts: frpJobStatuses.reduce((acc, status) => {
        acc[status.code] = jobs.filter((job) => job.status === status.code).length;
        return acc;
      }, {}),
    };
  }

  function publicFrpJob(job, db, includeOrder = true) {
    const technician = db.users.find((user) => user.id === job.technicianId);
    const order = includeOrder ? db.frpOrders.find((candidate) => candidate.id === job.orderId) : null;
    return {
      ...job,
      technicianName: technician?.name || "",
      order: order ? {
        id: order.id,
        code: order.code,
        clientName: order.clientName,
        country: order.country,
        unitPrice: order.unitPrice,
        totalPrice: order.totalPrice,
        paymentLabel: order.paymentLabel,
      } : undefined,
    };
  }

  function publicFrpState(db, user) {
    if (!canUseFrp(user)) {
      return { enabled: false, orders: [], jobs: [], metrics: {}, statuses: { orders: frpOrderStatuses, jobs: frpJobStatuses }, pricing: publicFrpPricingState(db, user) };
    }
    const orders = db.frpOrders.filter((order) => user.role === "ADMIN" || order.workChannel === frpWorkChannel);
    const jobs = db.frpJobs.filter((job) => user.role === "ADMIN" || job.workChannel === frpWorkChannel);
    const today = limaDateStamp();
    const todaysJobs = jobs.filter((job) => limaDateStamp(job.createdAt) === today || limaDateStamp(job.doneAt) === today);
    return {
      enabled: true,
      orders: orders.slice(0, 80).map((order) => publicFrpOrder(order, db)),
      jobs: jobs.slice(0, 200).map((job) => publicFrpJob(job, db)),
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
