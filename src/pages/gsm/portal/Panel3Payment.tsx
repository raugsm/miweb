// Panel 3 — Datos de pago.
// Spec: docs/specs/cliente/panel-3-datos-de-pago.md v1.0 (+ nota 15b.2-ter).
//
// Card oscura "Total a pagar" con bandera + card de la cuenta con botones Copiar
// y QR opcional + dropzone del comprobante.
//
// Decisión D1 (sesión 15b.2): la orden NACE acá, al subir el comprobante. El
// botón "Equipo conectado" del panel 4 ya no crea nada.
//
// Estado "Rechazado" DESCONGELA los paneles 1-2-3 (fix 15b.2-ter): si no, el
// cliente queda atrapado sin poder volver a subir.

import { useMemo, useRef, useState } from "react";

import { Panel } from "@/components/Panel";
import type { ProofUpload } from "@/lib/gsm/api";
import { orderInPaymentFlow } from "@/lib/gsm/flow-state";
import { paymentAmountText } from "@/lib/gsm/payments";
import { usePortal } from "@/lib/gsm/portal-context";
import { cn } from "@/lib/utils";

import { PaymentFlag } from "./PaymentFlag";

const MAX_PROOF_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

type DropState = "default" | "dragover" | "error-type" | "error-size" | "uploading";

interface Panel3Props {
  selectedCode: string;
  totalUsdt: number | null;
  /** Sube el comprobante y crea la orden. Lo resuelve la página. */
  onSubmitProof: (proof: ProofUpload) => Promise<void>;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
    reader.readAsDataURL(file);
  });
}

export function Panel3Payment({ selectedCode, totalUsdt, onSubmitProof }: Panel3Props) {
  const { catalog, customer } = usePortal();
  const [dropState, setDropState] = useState<DropState>("default");
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const payment = useMemo(
    () => (catalog?.paymentMethods || []).find((method) => method.code === selectedCode) || null,
    [catalog, selectedCode],
  );

  const paymentOrder = orderInPaymentFlow(customer);
  const proofState: "none" | "uploaded" | "rejected" = (() => {
    if (!paymentOrder) return "none";
    if (paymentOrder.publicStatus === "PAGO_RECHAZADO") return "rejected";
    if (paymentOrder.publicStatus === "PAGO_EN_REVISION") return "uploaded";
    return "none";
  })();

  const approved = (customer?.orders || []).some((order) =>
    ["EN_PREPARACION", "LISTO_PARA_CONEXION", "EN_PROCESO"].includes(order.publicStatus),
  );

  const amountText =
    totalUsdt === null || !payment
      ? "—"
      : paymentAmountText(totalUsdt, payment, catalog?.exchangeRates || []);

  async function handleFile(file: File | null) {
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      setDropState("error-type");
      return;
    }
    if (file.size > MAX_PROOF_BYTES) {
      setDropState("error-size");
      return;
    }
    setDropState("uploading");
    try {
      const dataUrl = await readAsDataUrl(file);
      await onSubmitProof({ name: file.name, type: file.type, dataUrl });
      setDropState("default");
    } catch {
      setDropState("default");
    }
  }

  function copyValue(value: string, label: string) {
    navigator.clipboard
      ?.writeText(value)
      .then(() => {
        setCopied(label);
        window.setTimeout(() => setCopied(""), 1_500);
      })
      .catch(() => undefined);
  }

  return (
    <Panel as="article" className="flex flex-col gap-4 p-5" aria-label="Datos de pago">
      <h3 className="font-display text-sm font-bold tracking-[0.14em] text-foreground uppercase">
        Datos de pago
      </h3>

      <div className="rounded-xl bg-carbon p-4">
        <div className="font-display text-[10px] font-bold tracking-[0.2em] text-white/60 uppercase">
          Total a pagar
        </div>
        <div className="mt-2 flex items-center gap-2">
          {payment ? (
            <span className="flex size-5 shrink-0 overflow-hidden rounded-full">
              <PaymentFlag country={payment.country} size={20} />
            </span>
          ) : null}
          <span className="font-display text-2xl font-bold text-white tabular-nums">
            {amountText}
          </span>
        </div>
      </div>

      {!payment ? (
        <p className="text-xs text-muted-foreground">Elegí un método de pago primero</p>
      ) : (
        <div className="rounded-xl border border-line bg-field p-4">
          <p className="mb-3 text-sm font-semibold text-foreground">
            {payment.displayName || payment.label}
          </p>

          {showQr && payment.qrImageUrl ? (
            <img
              src={payment.qrImageUrl}
              alt={`QR de ${payment.displayName || payment.label}`}
              className="mx-auto mb-3 w-40 rounded-lg"
            />
          ) : null}

          <div className="flex flex-col gap-2">
            {(payment.fields || []).map((field) => (
              <div key={field.label} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] text-muted-foreground">{field.label}</p>
                  <p className="truncate text-sm text-foreground">{field.value}</p>
                </div>
                <button
                  type="button"
                  onClick={() => copyValue(field.value, field.label)}
                  className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-cobalt/40 hover:text-foreground"
                >
                  {copied === field.label ? "Copiado" : "Copiar"}
                </button>
              </div>
            ))}
          </div>

          {payment.qrImageUrl ? (
            <button
              type="button"
              onClick={() => setShowQr((value) => !value)}
              className="mt-3 w-full rounded-lg border border-line py-2 text-xs text-muted-foreground transition-colors hover:border-cobalt/40 hover:text-foreground"
            >
              {showQr ? "Ocultar QR" : "Mostrar QR"}
            </button>
          ) : null}
        </div>
      )}

      {/* Comprobante */}
      {approved ? (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-600 dark:text-emerald-300"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <circle cx="12" cy="12" r="10" fill="#639922" />
            <path
              d="M7 12.5l3.5 3.5L17 9"
              stroke="#FFFFFF"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
            />
          </svg>
          Comprobante validado
        </div>
      ) : proofState === "uploaded" ? (
        <div
          role="status"
          className="rounded-xl border border-line bg-field px-3 py-2.5 text-sm text-muted-foreground"
        >
          Comprobante recibido · esperando validación
        </div>
      ) : (
        <div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*,.pdf,application/pdf"
            className="sr-only"
            onChange={(event) => handleFile(event.target.files?.[0] || null)}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setDropState("dragover");
            }}
            onDragLeave={() => setDropState("default")}
            onDrop={(event) => {
              event.preventDefault();
              handleFile(event.dataTransfer.files?.[0] || null);
            }}
            disabled={dropState === "uploading" || !payment}
            className={cn(
              "flex w-full flex-col items-center gap-1 rounded-xl border border-dashed px-4 py-6 text-center transition-colors",
              dropState === "dragover" ? "border-cobalt bg-cobalt/5" : "border-line bg-field",
              (dropState === "error-type" || dropState === "error-size") && "border-red-500/60",
              !payment && "cursor-not-allowed opacity-50",
            )}
          >
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              aria-hidden="true"
              className="text-muted-foreground"
            >
              <path
                d="M12 4v12m0-12l-5 5m5-5l5 5M4 20h16"
                stroke="currentColor"
                strokeWidth="1.6"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="text-sm font-medium text-foreground">
              {dropState === "uploading" ? "Subiendo comprobante…" : "Subí tu comprobante"}
            </span>
            <span className="text-[11px] text-muted-foreground">Foto o PDF · máx 5 MB</span>
            {dropState === "error-type" ? (
              <span role="alert" className="text-[11px] text-red-500">
                Formato no permitido. Usá JPG, PNG o PDF.
              </span>
            ) : null}
            {dropState === "error-size" ? (
              <span role="alert" className="text-[11px] text-red-500">
                El archivo supera los 5 MB.
              </span>
            ) : null}
          </button>

          {proofState === "rejected" && paymentOrder ? (
            <div
              role="alert"
              className="mt-2 rounded-xl bg-red-500/10 px-3 py-2 text-[11px] text-red-600 dark:text-red-300"
            >
              {paymentOrder.paymentRejectedReason || "Comprobante rechazado."} Subí uno nuevo.
            </div>
          ) : null}
        </div>
      )}
    </Panel>
  );
}
