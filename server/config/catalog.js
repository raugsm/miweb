export const roles = new Set(["ADMIN", "COORDINADOR", "ATENCION_TECNICA"]);
export const roleLabels = {
  ADMIN: "Administrador",
  COORDINADOR: "Coordinador",
  ATENCION_TECNICA: "Atencion tecnica",
};
export const workChannels = ["WhatsApp 1", "WhatsApp 2", "WhatsApp 3"];
export const services = [
  { code: "SOPORTE-TECNICO", name: "Soporte tecnico", defaultPrice: 0, requiresModel: false, workChannel: "WhatsApp 1" },
  { code: "SERVICIO-MANUAL", name: "Servicio manual", defaultPrice: 0, requiresModel: false, workChannel: "WhatsApp 1" },
  { code: "MOTOROLA", name: "Motorola", defaultPrice: 0, requiresModel: true, workChannel: "WhatsApp 2" },
  { code: "HERRAMIENTA-VENTA", name: "Venta de herramienta", defaultPrice: 0, requiresModel: false, workChannel: "WhatsApp 2" },
  { code: "ZTE-HERRAMIENTA-ALQUILER", name: "Alquiler herramienta ZTE", defaultPrice: 0, requiresModel: false, workChannel: "WhatsApp 2" },
  { code: "BYPASS-MDM", name: "Bypass MDM general", defaultPrice: 0, requiresModel: true, workChannel: "WhatsApp 2" },
  { code: "RECARGA-CREDITOS", name: "Recarga de creditos", defaultPrice: 0, requiresModel: false, workChannel: "WhatsApp 2" },
  { code: "XIA-FRP-GOOGLE", name: "Xiaomi Cuenta Google", defaultPrice: 25, requiresModel: false, workChannel: "WhatsApp 3" },
  { code: "XIA-MDM", name: "Xiaomi MDM", defaultPrice: 0, requiresModel: true, workChannel: "WhatsApp 3" },
  { code: "XIA-F4", name: "Xiaomi F4", defaultPrice: 0, requiresModel: true, workChannel: "WhatsApp 3" },
  { code: "XIA-CUENTA-MI", name: "Xiaomi Cuenta Mi", defaultPrice: 0, requiresModel: true, workChannel: "WhatsApp 3" },
  { code: "XIA-BOOTLOOP", name: "Xiaomi Bootloop", defaultPrice: 0, requiresModel: true, workChannel: "WhatsApp 3" },
  { code: "IREMOVAL-REGISTROS", name: "iRemoval Registros", defaultPrice: 0, requiresModel: false, workChannel: "WhatsApp 3" },
  { code: "IPHONE-LIBERACION-RED", name: "Liberacion de red iPhone", defaultPrice: 0, requiresModel: true, workChannel: "WhatsApp 3" },
];
export const paymentMethods = [
  {
    code: "MX_STP",
    label: "Mexico - STP",
    country: "Mexico",
    ticketOption: true,
    currency: "MXN",
    amountMode: "decimal",
    details: ["Numero de tarjeta: 7229 6906 9374 9504 08", "Institucion: STP", "Beneficiario: Javier Cruz Franco"],
  },
  {
    code: "PE_YAPE_BRYAMS",
    label: "Peru - Yape",
    country: "Peru",
    ticketOption: true,
    currency: "PEN",
    amountMode: "decimal",
    details: ["Yape: 993 357 553 - Bryams Zuniga", "Yape: 982 380 794 - Peregrina Sha"],
  },
  {
    code: "PE_YAPE_PEREGRINA",
    label: "Peru - Yape Peregrina",
    country: "Peru",
    ticketOption: false,
    currency: "PEN",
    amountMode: "decimal",
    details: ["Yape: 982 380 794", "Beneficiario: Peregrina Sha"],
  },
  {
    code: "CO_BANCOLOMBIA_AHORROS",
    label: "Colombia - Bancolombia Ahorros",
    country: "Colombia",
    ticketOption: true,
    currency: "COP",
    amountMode: "thousands",
    details: ["Bancolombia Ahorros: 00100002771", "Beneficiario: Kendy Salazar"],
  },
  {
    code: "CL_MERCADO_PAGO",
    label: "Chile - Mercado Pago",
    country: "Chile",
    ticketOption: true,
    currency: "CLP",
    amountMode: "thousands",
    details: [
      "Mercado Pago / Cuenta Vista: 1042449240",
      "RUT: 179040166",
      "Beneficiario: Emanuel Ivan Alarcon Gomez",
      "Correo: melxcore01@gmail.com",
    ],
  },
  {
    code: "BINANCE_PAY",
    label: "Global - Binance Pay",
    country: "Global",
    ticketOption: true,
    globalOption: true,
    currency: "USDT",
    amountMode: "decimal",
    details: ["Binance Pay ID: 564181591", "Beneficiario: Ariadgsm"],
  },
  {
    code: "PAYPAL",
    label: "Global - PayPal (+20%)",
    country: "Global",
    ticketOption: false,
    currency: "USD",
    amountMode: "decimal",
    details: ["Correo: corporacionGSM.69@gmail.com", "Nota: 20% adicional por comisiones y tasas de cambio"],
  },
];
export const ticketStatuses = [
  { code: "TICKET_CREADO", label: "Nuevo" },
  { code: "EN_COLA", label: "En cola" },
  { code: "EN_PROCESO", label: "En proceso" },
  { code: "FINALIZADO", label: "Finalizado" },
];
export const frpServiceCode = "XIA-FRP-GOOGLE";
export const frpWorkChannel = "WhatsApp 3";
export const frpOrderStatuses = [
  { code: "COTIZADA", label: "Cotizada" },
  { code: "ESPERANDO_PAGO", label: "Esperando pago" },
  { code: "PAGO_VALIDADO", label: "Pago validado" },
  { code: "EN_PREPARACION", label: "En preparacion" },
  { code: "PARCIAL_LISTA", label: "Parcial lista" },
  { code: "LISTA_PARA_TECNICO", label: "Lista para tecnico" },
  { code: "CERRADA", label: "Cerrada" },
  { code: "CANCELADA", label: "Cancelada" },
];
export const frpJobStatuses = [
  { code: "ESPERANDO_PREPARACION", label: "Preparacion" },
  { code: "LISTO_PARA_TECNICO", label: "Listo" },
  { code: "EN_PROCESO", label: "En proceso" },
  { code: "FINALIZADO", label: "Finalizado" },
  { code: "REQUIERE_REVISION", label: "Revision" },
  { code: "ESPERANDO_CLIENTE", label: "Esperando cliente" },
  { code: "CANCELADO", label: "Cancelado" },
];
export const frpEligibilityStates = new Set(["APTO_EXPRESS", "NO_APTO_MODO", "NO_APTO_HERRAMIENTA", "REQUIERE_REVISION"]);
export const frpEligibilityCatalog = [
  {
    key: "redmi-a3x",
    publicName: "Redmi A3X",
    aliases: ["redmi a3x", "a3x", "klein", "klen"],
    status: "NO_APTO_MODO",
    internalReason: "Modelo no apto para FRP Express: no entra al modo requerido para este flujo.",
    publicMessage: "Este modelo no aplica para FRP Express. Escribenos por WhatsApp 3 para revisar otra alternativa.",
  },
  {
    key: "redmi-a3",
    publicName: "Redmi A3",
    aliases: ["redmi a3", "a3"],
    status: "NO_APTO_MODO",
    internalReason: "Modelo no apto para FRP Express: no entra al modo requerido para este flujo.",
    publicMessage: "Este modelo no aplica para FRP Express. Escribenos por WhatsApp 3 para revisar otra alternativa.",
  },
  {
    key: "redmi-a2",
    publicName: "Redmi A2",
    aliases: ["redmi a2", "a2"],
    status: "NO_APTO_MODO",
    internalReason: "Modelo no apto para FRP Express: no entra al modo requerido para este flujo.",
    publicMessage: "Este modelo no aplica para FRP Express. Escribenos por WhatsApp 3 para revisar otra alternativa.",
  },
  {
    key: "redmi-a5",
    publicName: "Redmi A5",
    aliases: ["redmi a5", "a5", "serenity"],
    status: "NO_APTO_MODO",
    internalReason: "Modelo no apto para FRP Express: no entra al modo requerido para este flujo.",
    publicMessage: "Este modelo no aplica para FRP Express. Escribenos por WhatsApp 3 para revisar otra alternativa.",
  },
  {
    key: "redmi-note-12s",
    publicName: "Redmi Note 12S",
    aliases: ["redmi note 12s", "note 12s", "sea", "ocean"],
    status: "REQUIERE_REVISION",
    internalReason: "Modelo reportado como capaz de entrar en modo requerido, pero requiere confirmar proveedor/herramienta antes de cobrar.",
    publicMessage: "Este equipo requiere revision rapida de compatibilidad antes de continuar con el pago.",
  },
];
export const frpOrderChecklistKeys = ["priceSent", "paymentValidated", "connectionDataSent", "authorizationConfirmed"];
export const frpJobChecklistKeys = ["clientConnected", "requiredStateConfirmed", "modelSupported"];
export const frpQuantityTiers = [
  { minQty: 10, unitPrice: 22, label: "Volumen 10+" },
  { minQty: 5, unitPrice: 23, label: "Volumen 5-9" },
  { minQty: 2, unitPrice: 24, label: "Volumen 2-4" },
  { minQty: 1, unitPrice: 25, label: "Normal" },
];
export const frpMonthlyTiers = [
  { minJobs: 100, unitPrice: 22, label: "Meta 100+" },
  { minJobs: 60, unitPrice: 23, label: "Meta 60+" },
  { minJobs: 30, unitPrice: 24, label: "Meta 30+" },
];
export const frpProviderStatuses = new Set(["ACTIVE", "BACKUP", "OFF"]);
export const frpProviderCostModes = new Set(["FIXED_USDT", "CREDITS"]);
export const frpPermissionKeys = new Set(["frpCostManager"]);
export const portalPublicServices = [
  {
    code: "PORTAL-XIAOMI-FRP",
    name: "Xiaomi FRP Express",
    internalServiceCode: frpServiceCode,
    workChannel: frpWorkChannel,
    baseUnitPrice: 25,
    currency: "USDT",
    enabled: true,
    maxQuantity: 50,
    description: "Servicio remoto para Xiaomi Cuenta Google / FRP con preparacion, pago y seguimiento en linea.",
  },
];
export const customerStatuses = new Set(["REGISTRADO_NO_VERIFICADO", "EMAIL_VERIFICADO", "REGISTRADO", "VERIFICADO", "VIP", "EMPRESA", "BLOQUEADO"]);
export const masterClientStatuses = new Set(["ACTIVO", "PENDIENTE_VERIFICACION", "BLOQUEADO", "MERGED"]);
export const clientLinkSourceTypes = new Set(["INTERNAL_CLIENT", "PORTAL_CLIENT"]);
export const clientLinkSuggestionStatuses = new Set(["PENDING", "REJECTED", "BLOCKED", "LINKED"]);
export const publicOrderStatuses = [
  { code: "SOLICITUD_RECIBIDA", label: "Solicitud recibida" },
  { code: "REVISION_COMPATIBILIDAD", label: "Revision de compatibilidad" },
  { code: "ESPERANDO_PAGO", label: "Esperando pago" },
  { code: "PAGO_EN_REVISION", label: "Pago en revision" },
  { code: "EN_COLA", label: "En preparacion" },
  { code: "EN_PREPARACION", label: "En preparacion" },
  { code: "LISTO_PARA_CONEXION", label: "Listo para conexion" },
  { code: "EN_PROCESO", label: "En proceso" },
  { code: "FINALIZADO", label: "Finalizado" },
  { code: "REQUIERE_ATENCION", label: "Requiere atencion" },
  { code: "POSTPAGO_SOLICITADO", label: "Postpago solicitado" },
  { code: "CANCELADO", label: "Cancelado" },
];
export const exchangeRateCountries = [
  { key: "mexico", country: "Mexico", currency: "MXN" },
  { key: "peru", country: "Peru", currency: "PEN" },
  { key: "colombia", country: "Colombia", currency: "COP" },
  { key: "chile", country: "Chile", currency: "CLP" },
  { key: "usdt", country: "USDT", currency: "USDT" },
];
export const dailyCloseStatuses = new Set(["ABIERTO", "CERRADO", "REABIERTO"]);
export const dailyAdjustmentTypes = new Set(["AJUSTE", "REEMBOLSO"]);
export const pricingModes = new Set(["USDT_BASE", "COMPONENTS", "MANUAL"]);
export const countries = [
  ["republica dominicana", "Republica Dominicana"],
  ["estados unidos", "Estados Unidos"],
  ["el salvador", "El Salvador"],
  ["costa rica", "Costa Rica"],
  ["colombia", "Colombia"],
  ["mexico", "Mexico"],
  ["peru", "Peru"],
  ["chile", "Chile"],
  ["argentina", "Argentina"],
  ["ecuador", "Ecuador"],
  ["bolivia", "Bolivia"],
  ["venezuela", "Venezuela"],
  ["uruguay", "Uruguay"],
  ["paraguay", "Paraguay"],
  ["guatemala", "Guatemala"],
  ["honduras", "Honduras"],
  ["nicaragua", "Nicaragua"],
  ["panama", "Panama"],
  ["espana", "Espana"],
  ["usdt", "USDT"],
];
export const countryByFlagIso = {
  AR: "Argentina",
  BO: "Bolivia",
  CL: "Chile",
  CO: "Colombia",
  CR: "Costa Rica",
  DO: "Republica Dominicana",
  EC: "Ecuador",
  ES: "Espana",
  GT: "Guatemala",
  HN: "Honduras",
  MX: "Mexico",
  NI: "Nicaragua",
  PA: "Panama",
  PE: "Peru",
  PY: "Paraguay",
  SV: "El Salvador",
  US: "Estados Unidos",
  UY: "Uruguay",
  VE: "Venezuela",
};
export const portalPhoneCountryHints = [
  { country: "Republica Dominicana", iso: "DO", callingPrefixes: ["1809", "1829", "1849"] },
  { country: "Estados Unidos", iso: "US", callingPrefixes: ["1"] },
  { country: "El Salvador", iso: "SV", callingPrefixes: ["503"] },
  { country: "Costa Rica", iso: "CR", callingPrefixes: ["506"] },
  { country: "Colombia", iso: "CO", callingPrefixes: ["57"] },
  { country: "Mexico", iso: "MX", callingPrefixes: ["52"] },
  { country: "Peru", iso: "PE", callingPrefixes: ["51"] },
  { country: "Chile", iso: "CL", callingPrefixes: ["56"] },
  { country: "Argentina", iso: "AR", callingPrefixes: ["54"] },
  { country: "Ecuador", iso: "EC", callingPrefixes: ["593"] },
  { country: "Bolivia", iso: "BO", callingPrefixes: ["591"] },
  { country: "Venezuela", iso: "VE", callingPrefixes: ["58"] },
  { country: "Uruguay", iso: "UY", callingPrefixes: ["598"] },
  { country: "Paraguay", iso: "PY", callingPrefixes: ["595"] },
  { country: "Guatemala", iso: "GT", callingPrefixes: ["502"] },
  { country: "Honduras", iso: "HN", callingPrefixes: ["504"] },
  { country: "Nicaragua", iso: "NI", callingPrefixes: ["505"] },
  { country: "Panama", iso: "PA", callingPrefixes: ["507"] },
  { country: "Espana", iso: "ES", callingPrefixes: ["34"] },
];
