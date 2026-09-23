// Panel 1 — Método de pago.
// Spec: docs/specs/cliente/panel-1-metodo-de-pago.md v2.0.
//
// Pills en grilla 3+2 con orden fijo. Card oscura "Estimado · en vivo" con dot
// pulsante. Cuando el panel está congelado, los clics se pierden sin cambio
// visual (decisión de la sesión 13).

import { useMemo } from "react";

import { Panel } from "@/components/Panel";
import { money } from "@/lib/gsm/format";
import {
  PANEL_1_PILL_SLOTS,
  paymentAmountText,
  paymentForSlot,
  writeLastSelectedPill,
} from "@/lib/gsm/payments";
import { usePortal } from "@/lib/gsm/portal-context";
import { cn } from "@/lib/utils";

import { PaymentFlag } from "./PaymentFlag";

interface Panel1Props {
  selectedCode: string;
  onSelect: (code: string) => void;
  /** Total en USDT de la orden en armado; null mientras se cotiza. */
  totalUsdt: number | null;
}

export function Panel1PaymentMethod({ selectedCode, onSelect, totalUsdt }: Panel1Props) {
  const { catalog, frozen, notice } = usePortal();

  const slots = useMemo(() => {
    const methods = catalog?.paymentMethods || [];
    return PANEL_1_PILL_SLOTS.map((slot) => ({ ...slot, payment: paymentForSlot(slot, methods) }));
  }, [catalog]);

  const selected = slots.find((slot) => slot.payment?.code === selectedCode)?.payment || null;
  const rates = catalog?.exchangeRates || [];

  const amountText =
    totalUsdt === null || !selected ? "—" : paymentAmountText(totalUsdt, selected, rates);
  const showsUsdtSub = Boolean(selected) && totalUsdt !== null && amountText !== money(totalUsdt);

  function handleSelect(code: string, disabled: boolean) {
    // Panel congelado: pierde el clic sin feedback visual (spec §3).
    if (frozen || disabled) return;
    writeLastSelectedPill(code);
    onSelect(code);
  }

  return (
    <Panel as="article" className="flex flex-col gap-4 p-5" aria-label="Método de pago">
      <h3 className="font-display text-sm font-bold tracking-[0.14em] text-foreground uppercase">
        Método de pago
      </h3>

      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="País de pago">
        {slots.map((slot) => {
          const payment = slot.payment;
          if (!payment) return null;
          const isSelected = payment.code === selectedCode;
          const isDisabled = payment.active === false;
          return (
            <button
              key={slot.country}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-disabled={isDisabled}
              disabled={isDisabled}
              onClick={() => handleSelect(payment.code, isDisabled)}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-full border px-3 py-2.5 text-xs font-medium whitespace-nowrap transition-colors",
                isSelected
                  ? "border-cobalt bg-cobalt/10 text-foreground"
                  : "border-line bg-field text-muted-foreground hover:border-cobalt/40",
                isDisabled && "cursor-not-allowed opacity-40",
              )}
            >
              <span className="flex size-4 shrink-0 overflow-hidden rounded-full">
                <PaymentFlag country={slot.country} />
              </span>
              {slot.label}
            </button>
          );
        })}
      </div>

      <div className="relative overflow-hidden rounded-xl bg-carbon p-4">
        {notice ? (
          <div
            role="status"
            className="mb-3 rounded-lg bg-amber-400/15 px-3 py-2 text-[11px] leading-snug text-amber-200"
          >
            {notice.message}
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={cn(
              "size-1.5 rounded-full",
              totalUsdt === null ? "bg-white/30" : "animate-pulse bg-cyan",
            )}
          />
          <span className="font-display text-[10px] font-bold tracking-[0.2em] text-white/60 uppercase">
            Estimado · en vivo
          </span>
        </div>

        <div className="mt-2 font-display text-2xl font-bold text-white tabular-nums">
          {amountText}
        </div>

        {showsUsdtSub && totalUsdt !== null ? (
          <div className="mt-0.5 text-xs text-white/50">{money(totalUsdt)}</div>
        ) : null}

        {selected?.active === false && selected.customMessage ? (
          <p className="mt-2 text-[11px] text-amber-200">{selected.customMessage}</p>
        ) : null}
      </div>
    </Panel>
  );
}
