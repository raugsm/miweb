// PR-2a-final.bundle2 item 4C — generacion de comprobante PDF.
// Diseño compacto vertical estilo ticket Stripe/Apple Wallet (FINAL §9).
// Anti-fraude via QR + SHA-256 que apunta al endpoint publico /v/:orderId.

import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import crypto from "node:crypto";

// QUE: hash SHA-256 de los campos esenciales de la orden + items. Permite que
// el verificador (alguien que escanea el QR o abre /v/:orderId) compare el
// hash mostrado en el PDF con el computado del estado real, detectando edits.
export function computeOrderHash(order, items) {
  const payload = {
    code: order?.code || "",
    quantity: order?.quantity || 0,
    unitPrice: order?.unitPrice || 0,
    totalPrice: order?.totalPrice || 0,
    paymentMethod: order?.paymentMethod || "",
    publicStatus: order?.publicStatus || "",
    items: (items || []).map((item) => ({
      sequence: item?.sequence || 0,
      ardCode: item?.ardCode || "",
      doneAt: item?.doneAt || "",
    })),
  };
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function fmtMoney(value) {
  return Number(value || 0).toFixed(2);
}

// QUE: genera el PDF como Buffer, listo para servir como response. Usamos un
// stream interno y resolvemos cuando se completa.
// POR QUE: PDFKit es stream-based — si pipeamos directo a res, perdemos
// flexibilidad para setear headers despues. Buffer permite poner Content-Length.
export async function renderOrderComprobantePdf({ order, items, baseUrl }) {
  const doc = new PDFDocument({
    size: [320, 600], // ticket vertical compacto
    margin: 18,
    info: {
      Title: `Comprobante AriadGSM ${order.code}`,
      Author: "AriadGSM",
    },
  });
  const chunks = [];
  doc.on("data", (chunk) => chunks.push(chunk));
  const donePromise = new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const hash = computeOrderHash(order, items);
  const verifyUrl = `${baseUrl}/v/${encodeURIComponent(order.code)}`;
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, { width: 96, margin: 0, errorCorrectionLevel: "M" });
  const qrPng = Buffer.from(qrDataUrl.replace(/^data:image\/png;base64,/, ""), "base64");

  // Header — logo cuadrado azul "A" + brand
  doc.save();
  doc.roundedRect(18, 18, 28, 28, 4).fill("#1d4ed8");
  doc.fillColor("#fff").font("Helvetica-Bold").fontSize(18).text("A", 18, 23, { width: 28, align: "center" });
  doc.restore();
  doc.fillColor("#0f1629").font("Helvetica-Bold").fontSize(12).text("AriadGSM", 52, 22);
  doc.fillColor("#6b7280").font("Helvetica").fontSize(9).text(order.code, 52, 36);

  // Badge verde "PAGADO" centrado
  const badgeY = 62;
  doc.save();
  doc.roundedRect(110, badgeY, 100, 22, 11).fill("#dcfce7");
  doc.fillColor("#166534").font("Helvetica-Bold").fontSize(10).text(
    order.publicStatus === "FINALIZADO" ? "FINALIZADO" : "PAGADO",
    110, badgeY + 6, { width: 100, align: "center" },
  );
  doc.restore();

  // Total dominante
  const totalY = badgeY + 38;
  doc.fillColor("#0f1629").font("Helvetica-Bold").fontSize(28)
    .text(order.priceFormatted || `${fmtMoney(order.totalPrice)} USDT`, 18, totalY, { width: 284, align: "center" });
  doc.fillColor("#6b7280").font("Helvetica").fontSize(10)
    .text(`≈ ${fmtMoney(order.totalPrice)} USDT`, 18, totalY + 32, { width: 284, align: "center" });

  // Linea dasheada
  doc.save();
  doc.dash(2, { space: 3 }).strokeColor("#cbd5e1").lineWidth(1)
    .moveTo(18, totalY + 56).lineTo(302, totalY + 56).stroke();
  doc.restore();

  // Servicio
  const servY = totalY + 70;
  doc.fillColor("#0f1629").font("Helvetica-Bold").fontSize(11)
    .text(`${order.quantity} × Xiaomi FRP Express`, 18, servY, { width: 284, align: "center" });

  // Mini-card datos
  const cardY = servY + 22;
  doc.save();
  doc.roundedRect(18, cardY, 284, 90, 6).fill("#f8fafc");
  doc.restore();
  const rowY = (i) => cardY + 8 + i * 16;
  const drawRow = (i, label, value) => {
    doc.fillColor("#475569").font("Helvetica").fontSize(8).text(label, 26, rowY(i), { width: 80 });
    doc.fillColor("#0f1629").font("Helvetica-Bold").fontSize(8).text(value, 110, rowY(i), { width: 184 });
  };
  drawRow(0, "Cliente", order.clientName || order.clientId?.slice(0, 8) || "-");
  drawRow(1, "Fecha", new Date(order.createdAt).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" }));
  drawRow(2, "Método", order.paymentLabel || order.paymentMethod || "-");
  drawRow(3, "Estado", order.publicStatus || "-");
  drawRow(4, "Equipos OK", String(items.filter((i) => i.ardCode || i.doneAt).length));

  // QR + URL
  const qrY = cardY + 100;
  doc.image(qrPng, 18, qrY, { width: 64 });
  doc.fillColor("#0f1629").font("Helvetica-Bold").fontSize(9).text("Verifica autenticidad", 92, qrY + 8);
  doc.fillColor("#1d4ed8").font("Helvetica").fontSize(8).text(verifyUrl, 92, qrY + 22, { width: 210, link: verifyUrl });

  // Hash al pie (truncado para legibilidad)
  const hashShort = `${hash.slice(0, 10)}···${hash.slice(-4)}`;
  doc.fillColor("#94a3b8").font("Courier").fontSize(7)
    .text(`SHA-256: ${hashShort}`, 18, qrY + 80, { width: 284, align: "center" });

  doc.end();
  return { buffer: await donePromise, hash, verifyUrl };
}

// QUE: HTML mínimo para la pagina publica /v/:orderId. Quien escanee el QR
// debe poder verificar el monto, código y hash directamente desde un
// navegador. SEC-002 cerro el token publico del PDF; /v/:code queda como SEC-003.
export function renderOrderVerifyHtml({ order, items, hash }) {
  if (!order) {
    return `<!doctype html><html lang="es"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Orden no encontrada</title><link rel="stylesheet" href="/verify.css" /></head><body class="verify-page verify-page-missing"><h1>Orden no encontrada</h1><p>El código no corresponde a ninguna orden registrada.</p></body></html>`;
  }
  const totalText = order.priceFormatted || `${fmtMoney(order.totalPrice)} USDT`;
  const fecha = new Date(order.createdAt).toLocaleString("es-AR", { dateStyle: "long", timeStyle: "short" });
  const equipos = items.length;
  const equiposOk = items.filter((i) => i.ardCode || i.doneAt).length;
  return `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Verificación de comprobante AriadGSM ${escapeHtml(order.code)}</title>
<link rel="stylesheet" href="/verify.css" />
</head><body>
<div class="brand">
  <div class="brand-logo">A</div>
  <div>
    <h1>AriadGSM</h1>
    <small class="brand-subtitle">Verificación de comprobante</small>
  </div>
</div>
<div class="verified">✓ Comprobante registrado en sistema</div>
<div class="total">${escapeHtml(totalText)}<small>≈ ${fmtMoney(order.totalPrice)} USDT</small></div>
<div class="badge-row"><span class="badge">${escapeHtml(order.publicStatus || "")}</span></div>
<div class="card">
  <div class="row"><em>Código</em><b>${escapeHtml(order.code)}</b></div>
  <div class="row"><em>Servicio</em><b>${equipos} × Xiaomi FRP Express</b></div>
  <div class="row"><em>Equipos OK</em><b>${equiposOk} de ${equipos}</b></div>
  <div class="row"><em>Fecha</em><b>${escapeHtml(fecha)}</b></div>
  <div class="row"><em>Método</em><b>${escapeHtml(order.paymentLabel || order.paymentMethod || "-")}</b></div>
</div>
<p class="hash">SHA-256:<br>${escapeHtml(hash)}</p>
<p class="footer">El hash se computa desde el estado actual de la orden. Si fue editado, no coincidirá con el del PDF descargado.</p>
</body></html>`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
