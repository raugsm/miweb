import { api } from "./api.js";
import { paymentUploadTargetOrder } from "./payments.js";
import { state } from "./state.js";

// Sub-commit 15b.2: tipos y tamaño max alineados con backend (server.js
// sanitizeImageAttachments + maxPaymentProofBytes). Spec panel-3 v1.0 §6.3.
export const PROOF_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
export const PROOF_MAX_BYTES = 5 * 1024 * 1024;

const PROOF_TYPE_BY_EXTENSION = new Map([
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["png", "image/png"],
  ["webp", "image/webp"],
  ["pdf", "application/pdf"],
]);

export class ProofValidationError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "ProofValidationError";
    this.code = code;
  }
}

function proofTypeForFile(file) {
  const declaredType = String(file?.type || "").toLowerCase();
  if (PROOF_ALLOWED_TYPES.includes(declaredType)) return declaredType;

  const name = String(file?.name || "").toLowerCase();
  const extension = name.match(/\.([a-z0-9]+)$/)?.[1] || "";
  return PROOF_TYPE_BY_EXTENSION.get(extension) || "";
}

function normalizeProofDataUrl(value, type) {
  const dataUrl = String(value || "");
  return dataUrl.replace(/^data:[^;,]*(;base64,)/i, `data:${type}$1`);
}

export async function filesToProofs(fileList) {
  const files = Array.from(fileList || []).slice(0, 4);
  if (!files.length) throw new ProofValidationError("Seleccioná al menos un archivo.", "EMPTY");
  return Promise.all(files.map((file) => new Promise((resolve, reject) => {
    const type = proofTypeForFile(file);
    if (!type) {
      reject(new ProofValidationError("Tipo no permitido. Solo JPG, PNG, WebP o PDF.", "TYPE"));
      return;
    }
    if (Number(file.size || 0) > PROOF_MAX_BYTES) {
      reject(new ProofValidationError("Archivo muy grande. Máximo 5 MB.", "SIZE"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, type, size: file.size, dataUrl: normalizeProofDataUrl(reader.result, type) });
    reader.onerror = () => reject(new ProofValidationError("No se pudo leer el archivo.", "READ"));
    reader.readAsDataURL(file);
  })));
}

export async function uploadPaymentProofFromFlow(files, onCustomerUpdate = () => {}) {
  const order = paymentUploadTargetOrder();
  if (!order) {
    throw new Error("Primero crea una solicitud pendiente de pago.");
  }
  const proofs = await filesToProofs(files);
  const payload = await api(`/api/portal/orders/${order.id}/payment-proof`, {
    method: "PATCH",
    body: JSON.stringify({ paymentProofs: proofs }),
  });
  state.customer = payload.customer;
  onCustomerUpdate();
  return payload;
}

export function hasDraggedFiles(event) {
  const data = event.dataTransfer;
  if (!data) return false;
  return Array.from(data.items || []).some((item) => item.kind === "file") || Array.from(data.files || []).length > 0;
}

export function wireGlobalFileDropGuard() {
  ["dragover", "drop"].forEach((eventName) => {
    window.addEventListener(eventName, (event) => {
      if (!hasDraggedFiles(event)) return;
      if (event.target?.closest?.(".proof-dropzone")) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "none";
    });
  });
}
