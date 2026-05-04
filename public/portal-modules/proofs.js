import { api } from "./api.js";
import { $, setMessage } from "./dom.js";
import { paymentUploadTargetOrder } from "./payments.js";
import { state } from "./state.js";

// Sub-commit 15b.2: tipos y tamaño max alineados con backend (server.js
// sanitizeImageAttachments + maxPaymentProofBytes). Spec panel-3 v1.0 §6.3.
export const PROOF_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
export const PROOF_MAX_BYTES = 5 * 1024 * 1024;

export class ProofValidationError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "ProofValidationError";
    this.code = code;
  }
}

export async function filesToProofs(fileList) {
  const files = Array.from(fileList || []).slice(0, 4);
  if (!files.length) throw new ProofValidationError("Seleccioná al menos un archivo.", "EMPTY");
  return Promise.all(files.map((file) => new Promise((resolve, reject) => {
    if (!PROOF_ALLOWED_TYPES.includes(file.type)) {
      reject(new ProofValidationError("Tipo no permitido. Solo JPG, PNG o PDF.", "TYPE"));
      return;
    }
    if (Number(file.size || 0) > PROOF_MAX_BYTES) {
      reject(new ProofValidationError("Archivo muy grande. Máximo 5 MB.", "SIZE"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, type: file.type, size: file.size, dataUrl: reader.result });
    reader.onerror = () => reject(new ProofValidationError("No se pudo leer el archivo.", "READ"));
    reader.readAsDataURL(file);
  })));
}

export async function uploadPaymentProofFromFlow(files, onCustomerUpdate = () => {}) {
  const message = $("#orderMessage");
  const order = paymentUploadTargetOrder();
  if (!order) {
    setMessage(message, "Primero crea una solicitud pendiente de pago.", "error");
    return;
  }
  setMessage(message, `Subiendo comprobante para ${order.code}...`);
  const proofs = await filesToProofs(files);
  const payload = await api(`/api/portal/orders/${order.id}/payment-proof`, {
    method: "PATCH",
    body: JSON.stringify({ paymentProofs: proofs }),
  });
  state.customer = payload.customer;
  setMessage(message, `Comprobante recibido para ${order.code}. Queda en revision.`, "success");
  onCustomerUpdate();
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
