import { api } from "./api.js";
import { $, setMessage } from "./dom.js";
import { paymentUploadTargetOrder, updateFlowPaymentDropzone } from "./payments.js";
import { state } from "./state.js";

export async function filesToProofs(fileList) {
  const files = Array.from(fileList || []).slice(0, 4);
  if (!files.length) throw new Error("Selecciona al menos una imagen.");
  return Promise.all(files.map((file) => new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Solo se aceptan imagenes."));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, type: file.type, size: file.size, dataUrl: reader.result });
    reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
    reader.readAsDataURL(file);
  })));
}

export async function uploadPaymentProofFromFlow(files, onCustomerUpdate = () => {}) {
  const message = $("#orderMessage");
  const dropzone = $("#flowPaymentDropzone");
  const input = $("#flowPaymentProofInput");
  const order = paymentUploadTargetOrder();
  if (!order) {
    setMessage(message, "Primero crea una solicitud pendiente de pago.", "error");
    if (input) input.value = "";
    return;
  }
  setMessage(message, `Subiendo comprobante para ${order.code}...`);
  try {
    const proofs = await filesToProofs(files);
    const payload = await api(`/api/portal/orders/${order.id}/payment-proof`, {
      method: "PATCH",
      body: JSON.stringify({ paymentProofs: proofs }),
    });
    state.customer = payload.customer;
    setMessage(message, `Comprobante recibido para ${order.code}. Queda en revision.`, "success");
    onCustomerUpdate();
  } catch (error) {
    setMessage(message, error.message, "error");
  } finally {
    if (input) input.value = "";
    dropzone?.classList.remove("drag-active");
    updateFlowPaymentDropzone();
  }
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
