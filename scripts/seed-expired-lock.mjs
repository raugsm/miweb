// scripts/seed-expired-lock.mjs
// Uso: stop server → `node scripts/seed-expired-lock.mjs` → start server.
//
// Toma la orden mas reciente del cliente raugsm.69@gmail.com que este en
// PAGO_EN_REVISION o EN_PREPARACION y le aplica un lock simulado:
//   - priceLocked = unitPrice (lo que pagó)
//   - priceLockedAt = hace 1 hora (en el pasado)
//   - priceLockExpiresAt = hace 30 min (expirado)
//   - priceDecisionAction = "" (sin decision tomada)
//
// Despues, en panel operador subis el costo Krypto a algo > unitPrice de la
// orden y al SSE-publish el frontend del cliente debe mostrar el banner
// naranja con las 3 opciones (porque expirado + cost > locked).
//
// Tambien fuerza publicStatus a EN_PREPARACION y simula paymentValidated en
// el frpOrder asociado para que el lock semantico tenga sentido (lock arranca
// al aprobar — esta seed esquiva la aprobacion real para acelerar testing).

import { readFileSync, writeFileSync } from "node:fs";

const dbPath = "data/users.json";
const targetEmail = "raugsm.69@gmail.com";

const raw = readFileSync(dbPath, "utf8");
const db = JSON.parse(raw);

const client = (db.customerClients || []).find((c) => c.primaryEmail === targetEmail);
if (!client) {
  console.error(`Cliente ${targetEmail} no encontrado.`);
  process.exit(1);
}

const orders = (db.customerOrders || [])
  .filter((o) => o.clientId === client.id)
  .filter((o) => ["PAGO_EN_REVISION", "EN_PREPARACION", "ESPERANDO_PAGO"].includes(o.publicStatus))
  .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

if (!orders.length) {
  console.error("No hay ordenes activas del cliente. Crea una primero (subi comprobante).");
  process.exit(1);
}

const order = orders[0];
const now = Date.now();
const lockedAtMs = now - 60 * 60 * 1000; // hace 1 hora
const expiresAtMs = now - 30 * 60 * 1000; // hace 30 min (ya expirado)

order.priceLocked = Number(order.unitPrice) || 6;
order.priceLockedAt = new Date(lockedAtMs).toISOString();
order.priceLockExpiresAt = new Date(expiresAtMs).toISOString();
order.priceDecisionAction = "";
order.priceDecisionAt = "";
order.priceDecisionWaitUntil = "";
order.publicStatus = "EN_PREPARACION";
order.updatedAt = new Date().toISOString();

const frpOrder = (db.frpOrders || []).find((f) => f.id === order.frpOrderId);
if (frpOrder) {
  frpOrder.checklist = frpOrder.checklist || {};
  frpOrder.checklist.paymentValidated = true;
  frpOrder.paymentStatus = "COMPROBANTE_RECIBIDO";
  frpOrder.paymentReviewedAt = new Date(lockedAtMs).toISOString();
  frpOrder.updatedAt = new Date().toISOString();
}

writeFileSync(dbPath, JSON.stringify(db, null, 2), "utf8");
console.log(`OK: orden ${order.code} preparada con lock expirado.`);
console.log(`  priceLocked: ${order.priceLocked} USDT`);
console.log(`  priceLockedAt: ${order.priceLockedAt}`);
console.log(`  priceLockExpiresAt: ${order.priceLockExpiresAt} (en el pasado)`);
console.log(`  publicStatus: ${order.publicStatus}`);
console.log("");
console.log("Siguientes pasos:");
console.log("1. Restart server: node server.js");
console.log("2. Como cliente raugsm.69, abrir Mis Ordenes — deberias ver la orden con lock");
console.log("3. Como admin, en panel FRP/Pricing/Krypto subir cost a un valor > " + order.priceLocked + " USDT");
console.log("4. Guardar (motivo cualquiera) — SSE publica");
console.log("5. Cliente sin recargar deberia ver banner naranja '3 opciones' aparecer");
