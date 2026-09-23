// Panel 4 — Conexión.
// Spec: docs/specs/cliente/panel-4-conexion.md v1.3 (modelo de 3 estados A/B/C).
//
//   A — inicial: código en placeholder, sin botón Copiar del código.
//   B — comprobante en validación o rechazado: código real + Copiar.
//   C — pago aprobado: código real + instrucciones de conexión.
//
// Las cards de Technician ID y Código, el botón "¿Dónde pegar?" y el de descarga
// son SIEMPRE visibles desde el login.
//
// Sesión 24 (corte 5): ya NO existe el botón obligatorio "Equipo conectado". El
// operador procesa la orden sin depender de una acción del cliente en la página.

import { useState } from "react";

import { Panel } from "@/components/Panel";
import { derivePanel4State } from "@/lib/gsm/flow-state";
import { usePortal } from "@/lib/gsm/portal-context";
import { cn } from "@/lib/utils";

const REDIRECTOR_HREF = "/downloads/usbredirector-customer-module.exe";

/** Technician ID se muestra agrupado de a 4 dígitos: 1000 9983 5478. */
function formatTechnicianId(value: string): string {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ");
}

export function Panel4Connection() {
  const { activeTechnician, customer, flowState } = usePortal();
  const [copied, setCopied] = useState("");
  const [showWherePaste, setShowWherePaste] = useState(false);

  const state = derivePanel4State(flowState);

  // Orden viva más reciente: la que aporta el código del proceso.
  const order = (customer?.orders || []).find((candidate) =>
    [
      "PAGO_EN_REVISION",
      "PAGO_RECHAZADO",
      "EN_PREPARACION",
      "LISTO_PARA_CONEXION",
      "EN_PROCESO",
    ].includes(candidate.publicStatus),
  );

  // El Technician ID se congela al nacer la orden; antes se muestra el global vivo.
  const technicianId = formatTechnicianId(
    order?.technicianId || activeTechnician?.technicianId || "",
  );
  const orderCode = order?.code || "";

  function copyValue(value: string, label: string) {
    if (!value) return;
    navigator.clipboard
      ?.writeText(value)
      .then(() => {
        setCopied(label);
        window.setTimeout(() => setCopied(""), 1_500);
      })
      .catch(() => undefined);
  }

  return (
    <Panel as="article" className="flex flex-col gap-4 p-5" aria-label="Conexión">
      <h3 className="font-display text-sm font-bold tracking-[0.14em] text-foreground uppercase">
        Conexión
      </h3>

      <div className="flex flex-col gap-2">
        <div className="rounded-xl border border-line bg-field p-3">
          <p className="text-[11px] text-muted-foreground">Technician ID</p>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="font-tech text-sm font-semibold text-foreground tabular-nums">
              {technicianId || "—"}
            </span>
            <button
              type="button"
              onClick={() => copyValue(technicianId.replace(/\s/g, ""), "tech")}
              className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-cobalt/40 hover:text-foreground"
            >
              {copied === "tech" ? "Copiado" : "Copiar"}
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-line bg-field p-3">
          <p className="text-[11px] text-muted-foreground">Código del proceso</p>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span
              className={cn(
                "font-tech text-sm font-semibold",
                orderCode ? "text-foreground" : "text-muted-foreground italic",
              )}
            >
              {orderCode || "Aparecerá cuando subas tu pago"}
            </span>
            {state !== "A" && orderCode ? (
              <button
                type="button"
                onClick={() => copyValue(orderCode, "code")}
                className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-cobalt/40 hover:text-foreground"
              >
                {copied === "code" ? "Copiado" : "Copiar"}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div role="status" aria-live="polite" className="rounded-xl bg-cobalt/5 p-3">
        <p className="font-display text-[10px] font-bold tracking-[0.2em] text-kicker uppercase">
          Paso 4
        </p>
        <p className="mt-1 text-sm font-medium text-foreground">
          {state === "C" ? "Mantené el equipo conectado" : "Prepará el equipo"}
        </p>
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
          {state === "C"
            ? "Tu pago está aprobado. Dejá el equipo conectado al Redirector: AriadGSM lo procesa sin que aprietes ningún botón."
            : "Descargá el Redirector y tené el equipo listo. Cuando el pago quede aprobado, AriadGSM podrá procesar la orden sin otro paso."}
        </p>
      </div>

      <button
        type="button"
        onClick={() => setShowWherePaste(true)}
        className="w-full rounded-lg border border-line py-2 text-xs text-muted-foreground transition-colors hover:border-cobalt/40 hover:text-foreground"
      >
        ¿Dónde pegar estos códigos?
      </button>

      <a
        href={REDIRECTOR_HREF}
        download
        className="flex items-center justify-center gap-2 rounded-lg bg-cobalt py-2.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
      >
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
          <path
            d="M12 4v12m0 0l-5-5m5 5l5-5M4 20h16"
            stroke="currentColor"
            strokeWidth="1.6"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Descargar Redirector v2.5
      </a>

      {showWherePaste ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Dónde pegar los códigos"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setShowWherePaste(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-2xl border border-line bg-card p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="relative">
              <img
                src="/images/redirector-screenshot.jpg"
                alt="Captura del Redirector mostrando dónde pegar el Technician ID y el código"
                className="w-full rounded-lg"
              />
              <span className="absolute top-[33%] right-[6%] rounded bg-cobalt px-2 py-0.5 text-[10px] font-bold text-white">
                1° dato
              </span>
              <span className="absolute top-[53%] right-[6%] rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">
                2° dato
              </span>
            </div>
            <ol className="mt-4 flex list-decimal flex-col gap-2 pl-5 text-sm text-foreground">
              <li>
                Pegá el <strong>Technician ID</strong> en el primer campo (azul).
              </li>
              <li>
                Pegá el <strong>Código del proceso</strong> en el segundo campo (verde).
              </li>
              <li>
                Apretá <strong>Connect</strong> y volvé al portal.
              </li>
            </ol>
            <button
              type="button"
              onClick={() => setShowWherePaste(false)}
              className="mt-4 w-full rounded-lg bg-cobalt py-2 text-sm font-semibold text-white"
            >
              Listo, cerrar
            </button>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}
