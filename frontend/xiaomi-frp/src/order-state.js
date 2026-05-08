export function flowState(order) {
  const status = order?.status || "";
  if (!order) return "setup";
  if (status === "ESPERANDO_PAGO" || status === "PAGO_RECHAZADO") return "payment";
  if (status === "PAGO_EN_REVISION") return "verifying";
  if (status === "EN_PROCESO") return "processing";
  if (status === "FINALIZADO" && Number(order.remaining || 0) <= 0) return "done";
  if (["LISTO_PARA_CONEXION", "EN_COLA", "FINALIZADO"].includes(status)) return "ready";
  return "attention";
}

export function statusLabel(order) {
  switch (order?.status) {
    case "ESPERANDO_PAGO":
      return "Esperando comprobante";
    case "PAGO_EN_REVISION":
      return "Verificando pago";
    case "PAGO_RECHAZADO":
      return "Comprobante rechazado";
    case "LISTO_PARA_CONEXION":
      return "Pago confirmado";
    case "EN_COLA":
      return "En cola";
    case "EN_PROCESO":
      return "Procesando equipo";
    case "FINALIZADO":
      return "Listo";
    case "REQUIERE_ATENCION":
      return "Requiere atencion";
    case "REEMBOLSO_SOLICITADO":
      return "Reembolso solicitado";
    default:
      return "Pedido";
  }
}

export function stepIndex(state) {
  return {
    setup: 1,
    payment: 2,
    verifying: 3,
    ready: 4,
    processing: 5,
    done: 6,
    attention: 6,
  }[state] || 1;
}

export function orderTokenKey(code) {
  return `xiaomi-frp-token:${String(code || "").toUpperCase()}`;
}
