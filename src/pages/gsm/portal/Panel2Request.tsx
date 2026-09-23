// Panel 2 — Solicitud.
// Spec: docs/specs/cliente/panel-2-solicitud.md v1.1.
//
// Stepper editable a mano (mínimo 1, máximo 10, cap automático con aviso).
// Validación de modelo opcional contra `catalog.eligibilityHints`: nunca bloquea,
// solo advierte (98% de los modelos están soportados).

import { useMemo, useState } from "react";

import { Panel } from "@/components/Panel";
import { money, normalizeForMatch } from "@/lib/gsm/format";
import { usePortal } from "@/lib/gsm/portal-context";
import { cn } from "@/lib/utils";

const MIN_QUANTITY = 1;
const MAX_QUANTITY = 10;

interface Panel2Props {
  quantity: number;
  onQuantityChange: (value: number) => void;
  model: string;
  onModelChange: (value: string) => void;
  totalUsdt: number | null;
  unitPriceUsdt: number | null;
}

type ModelCheck = { state: "ok" | "unsupported" | "unknown"; message: string } | null;

export function Panel2Request({
  quantity,
  onQuantityChange,
  model,
  onModelChange,
  totalUsdt,
  unitPriceUsdt,
}: Panel2Props) {
  const { catalog, frozen } = usePortal();
  const [capNotice, setCapNotice] = useState("");

  const modelCheck = useMemo<ModelCheck>(() => {
    const value = normalizeForMatch(model);
    if (!value) return null;
    const hints = catalog?.eligibilityHints || [];
    const match = hints.find(
      (hint) =>
        normalizeForMatch(hint.publicName) === value
        || hint.aliases.some((alias) => normalizeForMatch(alias) === value),
    );
    if (!match) return { state: "ok", message: "" };
    if (match.status === "NO_APTO_MODO") {
      return { state: "unsupported", message: match.publicMessage || "Este modelo no es soportado" };
    }
    if (match.status === "REQUIERE_REVISION") {
      return {
        state: "unknown",
        message: match.publicMessage || "Revisaremos si este modelo aplica",
      };
    }
    return { state: "ok", message: "" };
  }, [model, catalog]);

  function commitQuantity(raw: number) {
    if (frozen) return;
    if (!Number.isFinite(raw) || raw < MIN_QUANTITY) {
      onQuantityChange(MIN_QUANTITY);
      return;
    }
    if (raw > MAX_QUANTITY) {
      onQuantityChange(MAX_QUANTITY);
      setCapNotice("Para más de 10 equipos, contactanos por WhatsApp");
      window.setTimeout(() => setCapNotice(""), 15_000);
      return;
    }
    setCapNotice("");
    onQuantityChange(raw);
  }

  return (
    <Panel as="article" className="flex flex-col gap-4 p-5" aria-label="Solicitud">
      <h3 className="font-display text-sm font-bold tracking-[0.14em] text-foreground uppercase">
        Solicitud
      </h3>

      <div>
        <p className="mb-2 text-xs text-muted-foreground">Equipos a desbloquear</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Restar equipo"
            disabled={frozen || quantity <= MIN_QUANTITY}
            onClick={() => commitQuantity(quantity - 1)}
            className="size-9 rounded-lg border border-line bg-field text-lg text-foreground transition-colors hover:border-cobalt/40 disabled:opacity-40"
          >
            −
          </button>
          <input
            type="text"
            inputMode="numeric"
            aria-label="Cantidad de equipos"
            maxLength={2}
            disabled={frozen}
            value={quantity}
            onChange={(event) => {
              const digits = event.target.value.replace(/\D/g, "");
              commitQuantity(digits ? Number(digits) : MIN_QUANTITY);
            }}
            className="h-9 w-14 rounded-lg border border-line bg-field text-center text-sm font-semibold text-foreground tabular-nums outline-none focus:border-cobalt"
          />
          <button
            type="button"
            aria-label="Sumar equipo"
            disabled={frozen || quantity >= MAX_QUANTITY}
            onClick={() => commitQuantity(quantity + 1)}
            className="size-9 rounded-lg border border-line bg-field text-lg text-foreground transition-colors hover:border-cobalt/40 disabled:opacity-40"
          >
            +
          </button>
        </div>
        {capNotice ? (
          <p role="status" className="mt-2 text-[11px] text-emerald-500">
            {capNotice}
          </p>
        ) : null}
      </div>

      <div>
        <p className="mb-2 text-xs text-muted-foreground">Modelo (opcional)</p>
        <input
          type="text"
          placeholder="ej: Redmi Note 13"
          autoComplete="off"
          maxLength={60}
          disabled={frozen}
          value={model}
          onChange={(event) => onModelChange(event.target.value)}
          className={cn(
            "h-9 w-full rounded-lg border bg-field px-3 text-sm text-foreground outline-none transition-colors",
            modelCheck?.state === "ok" && "border-emerald-500/60",
            (modelCheck?.state === "unsupported" || modelCheck?.state === "unknown")
              && "border-red-500/60",
            !modelCheck && "border-line focus:border-cobalt",
          )}
        />
        {modelCheck && modelCheck.message ? (
          <p className="mt-2 rounded-lg bg-amber-400/15 px-3 py-2 text-[11px] text-amber-600 dark:text-amber-200">
            {modelCheck.message}
          </p>
        ) : null}
      </div>

      <div className="rounded-xl bg-carbon p-4">
        <div className="font-display text-[10px] font-bold tracking-[0.2em] text-white/60 uppercase">
          Total
        </div>
        <div className="mt-2 font-display text-2xl font-bold text-white tabular-nums">
          {totalUsdt === null ? "—" : money(totalUsdt)}
        </div>
        {unitPriceUsdt !== null && quantity > 1 ? (
          <div className="mt-0.5 text-xs text-white/50">
            {quantity} equipos × {money(unitPriceUsdt)}
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="10" fill="#639922" />
          <path
            d="M7 12.5l3.5 3.5L17 9"
            stroke="white"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />
        </svg>
        98% de modelos soportados
      </div>
    </Panel>
  );
}
