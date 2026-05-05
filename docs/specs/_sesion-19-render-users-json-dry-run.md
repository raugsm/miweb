# Sesion 19 - Dry-run seguro contra users.json real de Render

Fecha: 2026-05-05

Estado: pendiente de ejecutar en Render Shell.

## Objetivo

Validar el `users.json` real de produccion sin descargar secretos al chat y sin modificar produccion.

## Hechos de entorno local

- Render CLI no esta disponible en esta maquina.
- GitHub CLI `gh` no esta disponible en esta maquina.
- No hay acceso automatico desde Codex al filesystem de Render.
- El dry-run local contra `data/users.json` ya paso, pero no prueba el archivo real de produccion.

## Regla de seguridad

No pegar `users.json` en chat.

No imprimir:

- `passwordHash`
- `operatorPinHash`
- `tokenHash`
- `dataUrl`
- comprobantes en base64
- emails completos
- WhatsApp completos

Solo se permite imprimir:

- SHA-256 del archivo fuente;
- conteos por coleccion;
- conteos proyectados por tabla;
- warnings sin datos personales;
- error de parseo si existe.

## Precondicion

Abrir Render Dashboard > servicio `ariadgsm-ops` > Shell.

Ejecutar todo desde el servicio actual, no desde una maquina local.

## Paso 1 - Ubicar y respaldar

```sh
cd /opt/render/project/src/storage
pwd
ls -lh users.json
cp users.json "users.json.pre-postgres-dry-run-$(date -u +%Y%m%dT%H%M%SZ).bak"
```

## Paso 2 - Crear reporte sanitizado

Pegar este bloque completo en Render Shell:

```sh
node <<'NODE'
const crypto = require("crypto");
const fs = require("fs");

const input = "users.json";
const raw = fs.readFileSync(input, "utf8");
const sourceSha256 = crypto.createHash("sha256").update(raw).digest("hex");
const now = new Date().toISOString();

const collections = [
  "users",
  "sessions",
  "devices",
  "deviceApprovals",
  "customerClients",
  "customerUsers",
  "customerSessions",
  "customerDevices",
  "customerRequests",
  "customerOrders",
  "customerOrderItems",
  "customerBenefits",
  "customerEmailVerificationTokens",
  "masterClients",
  "clientLinks",
  "clientLinkSuggestions",
  "paymentLedgerEntries",
  "dailyCloses",
  "dailyCloseLines",
  "dailyAdjustments",
  "portalRateLimits",
  "clients",
  "tickets",
  "frpOrders",
  "frpJobs",
  "frpProviderCostHistory",
  "frpPendingCostChanges",
  "passwordResetTokens",
  "passwordResetRequests",
  "audit"
];

function arr(db, key, warnings) {
  if (Array.isArray(db[key])) return db[key];
  warnings.push({ code: db[key] === undefined ? "missingCollection" : "nonArrayCollection", collection: key });
  return [];
}

function obj(db, key, warnings) {
  if (db[key] && typeof db[key] === "object" && !Array.isArray(db[key])) return db[key];
  warnings.push({ code: db[key] === undefined ? "missingObject" : "nonObjectCollection", collection: key });
  return {};
}

function idSet(rows) {
  return new Set(rows.map((row) => String(row && row.id || "")).filter(Boolean));
}

function duplicateCount(rows, key) {
  const seen = new Map();
  let duplicates = 0;
  for (const row of rows) {
    const value = String(row && row[key] || "").trim().toLowerCase();
    if (!value) continue;
    const next = (seen.get(value) || 0) + 1;
    seen.set(value, next);
    if (next > 1) duplicates += 1;
  }
  return duplicates;
}

function proofEntries(db) {
  const entries = [];
  for (const order of Array.isArray(db.customerOrders) ? db.customerOrders : []) {
    for (const proof of Array.isArray(order.paymentProofs) ? order.paymentProofs : []) entries.push(proof);
  }
  for (const order of Array.isArray(db.frpOrders) ? db.frpOrders : []) {
    for (const proof of Array.isArray(order.paymentProofs) ? order.paymentProofs : []) entries.push(proof);
  }
  for (const ticket of Array.isArray(db.tickets) ? db.tickets : []) {
    for (const proof of Array.isArray(ticket.paymentProofs) ? ticket.paymentProofs : []) entries.push(proof);
  }
  return entries;
}

function finalImageEntries(db) {
  const entries = [];
  for (const job of Array.isArray(db.frpJobs) ? db.frpJobs : []) {
    for (const image of Array.isArray(job.finalImages) ? job.finalImages : []) entries.push(image);
  }
  return entries;
}

function countCounterLeaves(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return 0;
  let count = 0;
  for (const item of Object.values(value)) {
    if (item && typeof item === "object" && !Array.isArray(item)) count += countCounterLeaves(item);
    else count += 1;
  }
  return count;
}

function warnMissing(warnings, code, collection, targetCollection) {
  warnings.push({ code, collection, targetCollection });
}

let db;
try {
  db = JSON.parse(raw);
} catch (error) {
  const report = {
    kind: "ariadgsm-render-users-json-dry-run",
    generatedAt: now,
    sourceName: input,
    sourceSha256,
    sanitized: true,
    parseOk: false,
    error: String(error.message || "JSON parse error")
  };
  fs.writeFileSync("postgres-dry-run-render-report.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
  process.exit(1);
}

const warnings = [];
const rows = Object.fromEntries(collections.map((key) => [key, arr(db, key, warnings)]));
const pricingConfig = obj(db, "pricingConfig", warnings);
const activeTechnician = db.activeTechnician && typeof db.activeTechnician === "object" ? db.activeTechnician : null;

const customerClientIds = idSet(rows.customerClients);
const customerUserIds = idSet(rows.customerUsers);
const customerDeviceIds = idSet(rows.customerDevices);
const customerRequestIds = idSet(rows.customerRequests);
const customerOrderIds = idSet(rows.customerOrders);
const customerOrderItemIds = idSet(rows.customerOrderItems);
const internalClientIds = idSet(rows.clients);
const frpOrderIds = idSet(rows.frpOrders);
const frpJobIds = idSet(rows.frpJobs);

for (const user of rows.customerUsers) if (user.clientId && !customerClientIds.has(String(user.clientId))) warnMissing(warnings, "missingCustomerUserClient", "customerUsers", "customerClients");
for (const session of rows.customerSessions) {
  if (session.userId && !customerUserIds.has(String(session.userId))) warnMissing(warnings, "missingCustomerSessionUser", "customerSessions", "customerUsers");
  if (session.clientId && !customerClientIds.has(String(session.clientId))) warnMissing(warnings, "missingCustomerSessionClient", "customerSessions", "customerClients");
  if (session.deviceId && !customerDeviceIds.has(String(session.deviceId))) warnMissing(warnings, "missingCustomerSessionDevice", "customerSessions", "customerDevices");
}
for (const order of rows.customerOrders) {
  if (order.clientId && !customerClientIds.has(String(order.clientId))) warnMissing(warnings, "missingCustomerOrderClient", "customerOrders", "customerClients");
  if (order.requestId && !customerRequestIds.has(String(order.requestId))) warnMissing(warnings, "missingCustomerOrderRequest", "customerOrders", "customerRequests");
  if (order.frpOrderId && !frpOrderIds.has(String(order.frpOrderId))) warnMissing(warnings, "missingCustomerOrderFrpOrder", "customerOrders", "frpOrders");
}
for (const item of rows.customerOrderItems) {
  if (item.orderId && !customerOrderIds.has(String(item.orderId))) warnMissing(warnings, "missingCustomerOrderItemOrder", "customerOrderItems", "customerOrders");
  if (item.frpOrderId && !frpOrderIds.has(String(item.frpOrderId))) warnMissing(warnings, "missingCustomerOrderItemFrpOrder", "customerOrderItems", "frpOrders");
  if (item.frpJobId && !frpJobIds.has(String(item.frpJobId))) warnMissing(warnings, "missingCustomerOrderItemFrpJob", "customerOrderItems", "frpJobs");
}
for (const order of rows.frpOrders) {
  if (order.clientId && !internalClientIds.has(String(order.clientId))) warnMissing(warnings, "missingFrpOrderInternalClient", "frpOrders", "clients");
  if (order.portalOrderId && !customerOrderIds.has(String(order.portalOrderId))) warnMissing(warnings, "missingFrpOrderPortalOrder", "frpOrders", "customerOrders");
}
for (const job of rows.frpJobs) {
  if (job.orderId && !frpOrderIds.has(String(job.orderId))) warnMissing(warnings, "missingFrpJobOrder", "frpJobs", "frpOrders");
  if (job.portalOrderItemId && !customerOrderItemIds.has(String(job.portalOrderItemId))) warnMissing(warnings, "missingFrpJobPortalItem", "frpJobs", "customerOrderItems");
}

const proofs = proofEntries(db);
const finalImages = finalImageEntries(db);
const fileHashes = new Set();
let proofMissingHash = 0;
let finalImageMissingHash = 0;
for (const proof of proofs) {
  const key = String(proof && (proof.hash || proof.sha256) || "");
  if (key) fileHashes.add(key);
  else proofMissingHash += 1;
}
for (const image of finalImages) {
  const key = String(image && (image.hash || image.sha256) || "");
  if (key) fileHashes.add(key);
  else finalImageMissingHash += 1;
}
if (proofMissingHash) warnings.push({ code: "paymentProofsMissingHash", count: proofMissingHash });
if (finalImageMissingHash) warnings.push({ code: "finalImagesMissingHash", count: finalImageMissingHash });

const exchangeRates = Array.isArray(pricingConfig.exchangeRates) ? pricingConfig.exchangeRates : [];
const serviceRules = Array.isArray(pricingConfig.serviceRules) ? pricingConfig.serviceRules : [];
const paymentMethodOverrides = Array.isArray(pricingConfig.paymentMethodOverrides) ? pricingConfig.paymentMethodOverrides : [];
const frpPricing = pricingConfig.frpPricing && typeof pricingConfig.frpPricing === "object" ? pricingConfig.frpPricing : {};
const frpProviders = Array.isArray(frpPricing.providers) ? frpPricing.providers : [];

const collectionCounts = Object.fromEntries(collections.map((key) => [key, rows[key].length]));
const tableCounts = {
  migration_runs: 1,
  sequence_counters: countCounterLeaves(db.customerCounters) + countCounterLeaves(db.ticketCounters) + countCounterLeaves(db.frpCounters),
  operator_users: rows.users.length,
  operator_devices: rows.devices.length,
  operator_device_admin_users: rows.devices.reduce((sum, device) => sum + (Array.isArray(device.adminUserIds) ? device.adminUserIds.length : 0), 0),
  operator_device_approvals: rows.deviceApprovals.length,
  operator_sessions: rows.sessions.length,
  password_reset_tokens: rows.passwordResetTokens.length,
  password_reset_requests: rows.passwordResetRequests.length,
  master_clients: rows.masterClients.length,
  customer_clients: rows.customerClients.length,
  customer_users: rows.customerUsers.length,
  internal_clients: rows.clients.length,
  client_links: rows.clientLinks.length,
  client_link_suggestions: rows.clientLinkSuggestions.length,
  customer_benefits: rows.customerBenefits.length,
  customer_devices: rows.customerDevices.length,
  customer_device_authorizations: rows.customerDevices.reduce((sum, device) => sum + (Array.isArray(device.authorizedClientIds) ? device.authorizedClientIds.length : 0), 0),
  customer_sessions: rows.customerSessions.length,
  customer_email_verification_tokens: rows.customerEmailVerificationTokens.length,
  exchange_rates: exchangeRates.length,
  service_pricing_rules: serviceRules.length,
  payment_method_overrides: paymentMethodOverrides.length,
  frp_pricing_policy: 1,
  frp_pricing_providers: frpProviders.length,
  frp_provider_cost_history: rows.frpProviderCostHistory.length,
  frp_pending_cost_changes: rows.frpPendingCostChanges.length,
  customer_requests: rows.customerRequests.length,
  customer_orders: rows.customerOrders.length,
  customer_order_items: rows.customerOrderItems.length,
  service_tickets: rows.tickets.length,
  stored_files: fileHashes.size,
  payment_proofs: proofs.length,
  frp_orders: rows.frpOrders.length,
  frp_jobs: rows.frpJobs.length,
  frp_job_files: finalImages.length,
  active_technician_state: activeTechnician ? 1 : 0,
  payment_ledger_entries: rows.paymentLedgerEntries.length,
  daily_closes: rows.dailyCloses.length,
  daily_close_lines: rows.dailyCloseLines.length,
  daily_adjustments: rows.dailyAdjustments.length,
  portal_rate_limits: rows.portalRateLimits.length,
  audit_events: rows.audit.length
};

const report = {
  kind: "ariadgsm-render-users-json-dry-run",
  generatedAt: now,
  sourceName: input,
  sourceSha256,
  sanitized: true,
  parseOk: true,
  collections: collectionCounts,
  tables: tableCounts,
  summaryChecks: {
    customerUsersMatch: rows.customerUsers.length === tableCounts.customer_users,
    customerClientsMatch: rows.customerClients.length === tableCounts.customer_clients,
    customerOrdersMatch: rows.customerOrders.length === tableCounts.customer_orders,
    customerOrderItemsMatch: rows.customerOrderItems.length === tableCounts.customer_order_items,
    frpOrdersMatch: rows.frpOrders.length === tableCounts.frp_orders,
    frpJobsMatch: rows.frpJobs.length === tableCounts.frp_jobs,
    ticketsMatch: rows.tickets.length === tableCounts.service_tickets,
    operatorEmailDuplicates: duplicateCount(rows.users, "email"),
    customerEmailDuplicates: duplicateCount(rows.customerUsers, "email"),
    proofMissingHash,
    finalImageMissingHash
  },
  warnings
};

const text = JSON.stringify(report, null, 2) + "\n";
if (/"passwordHash"\s*:|"operatorPinHash"\s*:|"tokenHash"\s*:|"dataUrl"\s*:|"base64"\s*:|"legacy_data_url"\s*:/i.test(text)) {
  throw new Error("Reporte bloqueado: contiene patron sensible.");
}
fs.writeFileSync("postgres-dry-run-render-report.json", text);
console.log(text);
NODE
```

## Paso 3 - Verificar que el reporte no tiene secretos

```sh
grep -E 'passwordHash|operatorPinHash|tokenHash|dataUrl|base64|legacy_data_url' postgres-dry-run-render-report.json || true
```

Esperado:

- No debe imprimir coincidencias.

## Fallback si Render Shell ejecuta el bloque linea por linea

Si ves errores como:

- `bash: customerOrderItemsMatch: command not found`
- `bash: syntax error near unexpected token`
- `bash: NODE~: command not found`

Significa que el heredoc no entro a Node y Bash intento ejecutar el JavaScript como comandos.

Usar este metodo reducido en 3 pasos. Es menos completo que el bloque largo, pero valida lo critico: parseo, conteos, duplicados, relaciones basicas y secretos en reporte.

### Fallback paso A - Limpiar intento anterior

```sh
cd /opt/render/project/src/storage
rm -f postgres-dry-run-render-report.json /tmp/ariad-render-dryrun.js
```

### Fallback paso B - Crear script temporal

Pegar completo:

```sh
cat > /tmp/ariad-render-dryrun.js <<'NODE'
const fs = require("fs");
const crypto = require("crypto");
const raw = fs.readFileSync("users.json", "utf8");
const sha = crypto.createHash("sha256").update(raw).digest("hex");
const collections = ["users","sessions","devices","deviceApprovals","customerClients","customerUsers","customerSessions","customerDevices","customerRequests","customerOrders","customerOrderItems","customerBenefits","customerEmailVerificationTokens","masterClients","clientLinks","clientLinkSuggestions","paymentLedgerEntries","dailyCloses","dailyCloseLines","dailyAdjustments","portalRateLimits","clients","tickets","frpOrders","frpJobs","frpProviderCostHistory","frpPendingCostChanges","passwordResetTokens","passwordResetRequests","audit"];
function arr(db,k,w){ if(Array.isArray(db[k])) return db[k]; w.push({code: db[k]===undefined ? "missingCollection" : "nonArrayCollection", collection:k}); return []; }
function ids(rows){ return new Set(rows.map(r=>String(r&&r.id||"")).filter(Boolean)); }
function dup(rows,key){ const m=new Map(); let d=0; for(const r of rows){ const v=String(r&&r[key]||"").trim().toLowerCase(); if(!v) continue; const n=(m.get(v)||0)+1; m.set(v,n); if(n>1)d++; } return d; }
function missing(w,code){ w.push({code}); }
let db;
try { db = JSON.parse(raw); } catch (e) {
  const report = { kind:"ariadgsm-render-users-json-dry-run", generatedAt:new Date().toISOString(), sourceName:"users.json", sourceSha256:sha, sanitized:true, parseOk:false, error:String(e.message||e) };
  fs.writeFileSync("postgres-dry-run-render-report.json", JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify(report,null,2));
  process.exit(1);
}
const warnings=[];
const rows=Object.fromEntries(collections.map(k=>[k,arr(db,k,warnings)]));
const cc=ids(rows.customerClients), cu=ids(rows.customerUsers), cd=ids(rows.customerDevices), cr=ids(rows.customerRequests), co=ids(rows.customerOrders), coi=ids(rows.customerOrderItems), ic=ids(rows.clients), fo=ids(rows.frpOrders), fj=ids(rows.frpJobs);
for(const r of rows.customerUsers) if(r.clientId&&!cc.has(String(r.clientId))) missing(warnings,"missingCustomerUserClient");
for(const r of rows.customerSessions){ if(r.userId&&!cu.has(String(r.userId))) missing(warnings,"missingCustomerSessionUser"); if(r.clientId&&!cc.has(String(r.clientId))) missing(warnings,"missingCustomerSessionClient"); if(r.deviceId&&!cd.has(String(r.deviceId))) missing(warnings,"missingCustomerSessionDevice"); }
for(const r of rows.customerOrders){ if(r.clientId&&!cc.has(String(r.clientId))) missing(warnings,"missingCustomerOrderClient"); if(r.requestId&&!cr.has(String(r.requestId))) missing(warnings,"missingCustomerOrderRequest"); if(r.frpOrderId&&!fo.has(String(r.frpOrderId))) missing(warnings,"missingCustomerOrderFrpOrder"); }
for(const r of rows.customerOrderItems){ if(r.orderId&&!co.has(String(r.orderId))) missing(warnings,"missingCustomerOrderItemOrder"); if(r.frpOrderId&&!fo.has(String(r.frpOrderId))) missing(warnings,"missingCustomerOrderItemFrpOrder"); if(r.frpJobId&&!fj.has(String(r.frpJobId))) missing(warnings,"missingCustomerOrderItemFrpJob"); }
for(const r of rows.frpOrders){ if(r.clientId&&!ic.has(String(r.clientId))) missing(warnings,"missingFrpOrderInternalClient"); if(r.portalOrderId&&!co.has(String(r.portalOrderId))) missing(warnings,"missingFrpOrderPortalOrder"); }
for(const r of rows.frpJobs){ if(r.orderId&&!fo.has(String(r.orderId))) missing(warnings,"missingFrpJobOrder"); if(r.portalOrderItemId&&!coi.has(String(r.portalOrderItemId))) missing(warnings,"missingFrpJobPortalItem"); }
let proofs=0, files=new Set(), proofMissingHash=0, finalImages=0, finalImageMissingHash=0;
for(const group of [rows.customerOrders, rows.frpOrders, rows.tickets]) for(const owner of group) for(const p of Array.isArray(owner.paymentProofs)?owner.paymentProofs:[]){ proofs++; const h=String(p&&(p.hash||p.sha256)||""); if(h) files.add(h); else proofMissingHash++; }
for(const job of rows.frpJobs) for(const img of Array.isArray(job.finalImages)?job.finalImages:[]){ finalImages++; const h=String(img&&(img.hash||img.sha256)||""); if(h) files.add(h); else finalImageMissingHash++; }
if(proofMissingHash) warnings.push({code:"paymentProofsMissingHash",count:proofMissingHash});
if(finalImageMissingHash) warnings.push({code:"finalImagesMissingHash",count:finalImageMissingHash});
const pricing=db.pricingConfig&&typeof db.pricingConfig==="object"?db.pricingConfig:{};
const frpPricing=pricing.frpPricing&&typeof pricing.frpPricing==="object"?pricing.frpPricing:{};
const collectionsCount=Object.fromEntries(collections.map(k=>[k,rows[k].length]));
const tables={ operator_users:rows.users.length, customer_clients:rows.customerClients.length, customer_users:rows.customerUsers.length, customer_sessions:rows.customerSessions.length, customer_devices:rows.customerDevices.length, customer_orders:rows.customerOrders.length, customer_order_items:rows.customerOrderItems.length, frp_orders:rows.frpOrders.length, frp_jobs:rows.frpJobs.length, service_tickets:rows.tickets.length, stored_files:files.size, payment_proofs:proofs, frp_job_files:finalImages, audit_events:rows.audit.length, payment_ledger_entries:rows.paymentLedgerEntries.length, exchange_rates:Array.isArray(pricing.exchangeRates)?pricing.exchangeRates.length:0, service_pricing_rules:Array.isArray(pricing.serviceRules)?pricing.serviceRules.length:0, payment_method_overrides:Array.isArray(pricing.paymentMethodOverrides)?pricing.paymentMethodOverrides.length:0, frp_pricing_providers:Array.isArray(frpPricing.providers)?frpPricing.providers.length:0 };
const report={ kind:"ariadgsm-render-users-json-dry-run", generatedAt:new Date().toISOString(), sourceName:"users.json", sourceSha256:sha, sanitized:true, parseOk:true, collections:collectionsCount, tables, summaryChecks:{ customerUsersMatch:rows.customerUsers.length===tables.customer_users, customerClientsMatch:rows.customerClients.length===tables.customer_clients, customerOrdersMatch:rows.customerOrders.length===tables.customer_orders, customerOrderItemsMatch:rows.customerOrderItems.length===tables.customer_order_items, frpOrdersMatch:rows.frpOrders.length===tables.frp_orders, frpJobsMatch:rows.frpJobs.length===tables.frp_jobs, ticketsMatch:rows.tickets.length===tables.service_tickets, operatorEmailDuplicates:dup(rows.users,"email"), customerEmailDuplicates:dup(rows.customerUsers,"email"), proofMissingHash, finalImageMissingHash }, warnings };
const text=JSON.stringify(report,null,2)+"\n";
if(/"passwordHash"\s*:|"operatorPinHash"\s*:|"tokenHash"\s*:|"dataUrl"\s*:|"base64"\s*:|"legacy_data_url"\s*:/i.test(text)) throw new Error("Reporte bloqueado: contiene patron sensible.");
fs.writeFileSync("postgres-dry-run-render-report.json", text);
console.log(text);
NODE
```

### Fallback paso C - Ejecutar

```sh
node /tmp/ariad-render-dryrun.js
grep -E 'passwordHash|operatorPinHash|tokenHash|dataUrl|base64|legacy_data_url' postgres-dry-run-render-report.json || true
```

Si el `grep` no imprime nada, copiar solo el JSON del reporte.

## Fallback 2 - Sin heredoc, una sola linea

Si Render Shell sigue ejecutando lineas JavaScript como comandos Bash, usar una sola linea `node -e`.

Pegar primero:

```sh
cd /opt/render/project/src/storage
rm -f postgres-dry-run-render-report.json
```

Luego pegar esta linea completa:

```sh
node -e "const fs=require('fs'),crypto=require('crypto');const raw=fs.readFileSync('users.json','utf8');const sha=crypto.createHash('sha256').update(raw).digest('hex');const out={kind:'ariadgsm-render-users-json-dry-run',generatedAt:new Date().toISOString(),sourceName:'users.json',sourceSha256:sha,sanitized:true};let db;try{db=JSON.parse(raw);out.parseOk=true}catch(e){out.parseOk=false;out.error=String(e.message||e);fs.writeFileSync('postgres-dry-run-render-report.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out,null,2));process.exit(1)}const names=['users','sessions','devices','deviceApprovals','customerClients','customerUsers','customerSessions','customerDevices','customerRequests','customerOrders','customerOrderItems','customerBenefits','customerEmailVerificationTokens','masterClients','clientLinks','clientLinkSuggestions','paymentLedgerEntries','dailyCloses','dailyCloseLines','dailyAdjustments','portalRateLimits','clients','tickets','frpOrders','frpJobs','frpProviderCostHistory','frpPendingCostChanges','passwordResetTokens','passwordResetRequests','audit'];const a=k=>Array.isArray(db[k])?db[k]:[];const ids=rows=>new Set(rows.map(r=>String(r&&r.id||'')).filter(Boolean));const dup=(rows,key)=>{const m=new Map();let d=0;for(const r of rows){const v=String(r&&r[key]||'').trim().toLowerCase();if(!v)continue;const n=(m.get(v)||0)+1;m.set(v,n);if(n>1)d++}return d};const w=[];out.collections=Object.fromEntries(names.map(k=>[k,a(k).length]));const cc=ids(a('customerClients')),cu=ids(a('customerUsers')),cd=ids(a('customerDevices')),cr=ids(a('customerRequests')),co=ids(a('customerOrders')),coi=ids(a('customerOrderItems')),ic=ids(a('clients')),fo=ids(a('frpOrders')),fj=ids(a('frpJobs'));for(const r of a('customerUsers'))if(r.clientId&&!cc.has(String(r.clientId)))w.push({code:'missingCustomerUserClient'});for(const r of a('customerSessions')){if(r.userId&&!cu.has(String(r.userId)))w.push({code:'missingCustomerSessionUser'});if(r.clientId&&!cc.has(String(r.clientId)))w.push({code:'missingCustomerSessionClient'});if(r.deviceId&&!cd.has(String(r.deviceId)))w.push({code:'missingCustomerSessionDevice'})}for(const r of a('customerOrders')){if(r.clientId&&!cc.has(String(r.clientId)))w.push({code:'missingCustomerOrderClient'});if(r.requestId&&!cr.has(String(r.requestId)))w.push({code:'missingCustomerOrderRequest'});if(r.frpOrderId&&!fo.has(String(r.frpOrderId)))w.push({code:'missingCustomerOrderFrpOrder'})}for(const r of a('customerOrderItems')){if(r.orderId&&!co.has(String(r.orderId)))w.push({code:'missingCustomerOrderItemOrder'});if(r.frpOrderId&&!fo.has(String(r.frpOrderId)))w.push({code:'missingCustomerOrderItemFrpOrder'});if(r.frpJobId&&!fj.has(String(r.frpJobId)))w.push({code:'missingCustomerOrderItemFrpJob'})}for(const r of a('frpOrders')){if(r.clientId&&!ic.has(String(r.clientId)))w.push({code:'missingFrpOrderInternalClient'});if(r.portalOrderId&&!co.has(String(r.portalOrderId)))w.push({code:'missingFrpOrderPortalOrder'})}for(const r of a('frpJobs')){if(r.orderId&&!fo.has(String(r.orderId)))w.push({code:'missingFrpJobOrder'});if(r.portalOrderItemId&&!coi.has(String(r.portalOrderItemId)))w.push({code:'missingFrpJobPortalItem'})}let proofs=0,files=new Set(),proofMissingHash=0,finalImages=0,finalImageMissingHash=0;for(const group of [a('customerOrders'),a('frpOrders'),a('tickets')])for(const owner of group)for(const p of Array.isArray(owner.paymentProofs)?owner.paymentProofs:[]){proofs++;const h=String(p&&(p.hash||p.sha256)||'');if(h)files.add(h);else proofMissingHash++}for(const job of a('frpJobs'))for(const img of Array.isArray(job.finalImages)?job.finalImages:[]){finalImages++;const h=String(img&&(img.hash||img.sha256)||'');if(h)files.add(h);else finalImageMissingHash++}if(proofMissingHash)w.push({code:'paymentProofsMissingHash',count:proofMissingHash});if(finalImageMissingHash)w.push({code:'finalImagesMissingHash',count:finalImageMissingHash});const pricing=db.pricingConfig&&typeof db.pricingConfig==='object'?db.pricingConfig:{};const frpPricing=pricing.frpPricing&&typeof pricing.frpPricing==='object'?pricing.frpPricing:{};out.tables={operator_users:a('users').length,customer_clients:a('customerClients').length,customer_users:a('customerUsers').length,customer_sessions:a('customerSessions').length,customer_devices:a('customerDevices').length,customer_orders:a('customerOrders').length,customer_order_items:a('customerOrderItems').length,frp_orders:a('frpOrders').length,frp_jobs:a('frpJobs').length,service_tickets:a('tickets').length,stored_files:files.size,payment_proofs:proofs,frp_job_files:finalImages,audit_events:a('audit').length,payment_ledger_entries:a('paymentLedgerEntries').length,exchange_rates:Array.isArray(pricing.exchangeRates)?pricing.exchangeRates.length:0,service_pricing_rules:Array.isArray(pricing.serviceRules)?pricing.serviceRules.length:0,payment_method_overrides:Array.isArray(pricing.paymentMethodOverrides)?pricing.paymentMethodOverrides.length:0,frp_pricing_providers:Array.isArray(frpPricing.providers)?frpPricing.providers.length:0};out.summaryChecks={customerUsersMatch:a('customerUsers').length===out.tables.customer_users,customerClientsMatch:a('customerClients').length===out.tables.customer_clients,customerOrdersMatch:a('customerOrders').length===out.tables.customer_orders,customerOrderItemsMatch:a('customerOrderItems').length===out.tables.customer_order_items,frpOrdersMatch:a('frpOrders').length===out.tables.frp_orders,frpJobsMatch:a('frpJobs').length===out.tables.frp_jobs,ticketsMatch:a('tickets').length===out.tables.service_tickets,operatorEmailDuplicates:dup(a('users'),'email'),customerEmailDuplicates:dup(a('customerUsers'),'email'),proofMissingHash,finalImageMissingHash};out.warnings=w;const text=JSON.stringify(out,null,2)+'\n';if(/passwordHash|operatorPinHash|tokenHash|dataUrl|base64|legacy_data_url/i.test(text))throw new Error('Reporte bloqueado por patron sensible');fs.writeFileSync('postgres-dry-run-render-report.json',text);console.log(text)"
```

Finalmente:

```sh
grep -E 'passwordHash|operatorPinHash|tokenHash|dataUrl|base64|legacy_data_url' postgres-dry-run-render-report.json || true
```

Si no imprime coincidencias, copiar el JSON del reporte.

## Paso 4 - Que compartir en Codex

Compartir solo:

- `parseOk`;
- `sourceSha256`;
- `collections`;
- `tables`;
- `summaryChecks`;
- `warnings`;
- si hubo error de parseo, el mensaje exacto.

No compartir backups ni `users.json`.

## Como evaluar el resultado

### Caso A - `parseOk: true` y `warnings: []`

El archivo real esta listo para pasar a prueba contra PostgreSQL staging.

### Caso B - `parseOk: true` con warnings

No migrar todavia. Revisar cada warning y decidir si:

- corregir dato antes;
- ajustar DDL;
- ajustar script de migracion.

### Caso C - `parseOk: false`

El archivo real sigue corrupto. Primero rescatar `users.json` como se documento en:

- `docs/specs/_sesion-19-incidente-produccion-login-verificacion.md`

No intentar migrar a PostgreSQL desde JSON corrupto.

## Resultado Render recibido

Reporte recibido por captura del Render Shell:

```json
{
  "kind": "ariadgsm-render-users-json-dry-run",
  "generatedAt": "2026-05-05T23:22:10.990Z",
  "sourceName": "users.json",
  "sourceSha256": "db29bed9166665c510f13b7389de3161c7a989e21b8434fd950d06c6313a5e38",
  "sanitized": true,
  "parseOk": false,
  "error": "Unexpected non-whitespace character after JSON at position 4866635 (line 16670 column 2)"
}
```

Conclusion:

- El `users.json` real de Render esta corrupto.
- El error coincide con el observado en produccion por `/api/portal/session` y `/api/portal/catalog`.
- No se debe intentar migrar a PostgreSQL desde este archivo hasta rescatarlo.
- Siguiente accion: backup + generar `users.repaired.json` validado por `JSON.parse` antes de reemplazar.

## Resultado Render repair candidate recibido

Reporte recibido por captura del Render Shell:

```json
{
  "kind": "ariadgsm-users-json-repair-candidate",
  "generatedAt": "2026-05-05T23:24:24.110Z",
  "sourceName": "users.json",
  "sourceSha256": "db29bed9166665c510f13b7389de3161c7a989e21b8434fd950d06c6313a5e38",
  "sanitized": true,
  "sourceParseOk": false,
  "sourceError": "Unexpected non-whitespace character after JSON at position 4866635 (line 16670 column 2)",
  "cutPosition": 4866635,
  "repairedSha256": "d4020e385c3b307616087b1a90fed0a3ea59d0683aa1c0182c82d2529f9413cb6",
  "repairedParseOk": true,
  "collections": {
    "users": 5,
    "customerClients": 16,
    "customerUsers": 16,
    "customerSessions": 21,
    "customerDevices": 82,
    "customerRequests": 13,
    "customerOrders": 13,
    "customerOrderItems": 14,
    "frpOrders": 13,
    "frpJobs": 14,
    "tickets": 0,
    "paymentLedgerEntries": 13,
    "frpProviderCostHistory": 8,
    "audit": 790
  },
  "output": "users.repaired.json"
}
```

Conclusion:

- El prefijo hasta la posicion `4866635` es JSON valido.
- El candidato `users.repaired.json` fue generado y parsea correctamente.
- El reporte sanitizado no expuso hashes de password, PIN, tokens ni data URLs.
- Antes de reemplazar `users.json`, los conteos deben aceptarse como plausibles para el estado real de produccion.

## Resultado reemplazo controlado recibido

Comando ejecutado en Render Shell:

1. validar `users.repaired.json` con `JSON.parse`;
2. crear backup adicional de `users.json` activo;
3. copiar `users.repaired.json` sobre `users.json`;
4. validar conteos sanitizados del archivo activo.

Reporte recibido:

```json
{
  "activeParseOk": true,
  "users": 5,
  "customerClients": 16,
  "customerUsers": 16,
  "customerOrders": 13,
  "frpOrders": 13,
  "frpJobs": 14,
  "audit": 790
}
```

Verificacion HTTP recibida:

- `GET https://ariadgsm.com/api/health`: HTTP 200.
- `GET https://ariadgsm.com/api/portal/catalog`: HTTP 200.
- `GET https://ariadgsm.com/api/portal/session`: HTTP 200.
- `/api/portal/session` emitio cookie `ariad_customer_device`, senal de que el flujo puede volver a crear contexto de dispositivo.

Decision:

- El rescate operativo de produccion queda validado.
- No se guardo el payload completo del catalogo porque contiene datos publicos de pago que no aportan a la evidencia tecnica.
- La causa raiz sigue abierta: produccion continua dependiendo de escrituras a `users.json`.

## Siguiente paso

Una vez obtenido el reporte real de Render:

1. guardarlo como evidencia sanitizada;
2. comparar contra el dry-run local;
3. recien despues crear prueba PostgreSQL staging.
