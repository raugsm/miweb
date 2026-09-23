// Pantalla principal del portal cliente AriadGSM.
// Spec: docs/specs/cliente/pantalla-principal-cliente.md v1.1.
//
// NO es un flujo de 4 pasos secuenciales: son 4 paneles PARALELOS visibles a la
// vez, más "Mis órdenes" debajo. Los paneles 1-2-3 se congelan cuando hay un
// comprobante en revisión o un pago aprobado, y se descongelan si lo rechazan.

import { useCallback, useEffect, useMemo, useState } from "react";

import { Container } from "@/components/Container";
import { Kicker } from "@/components/Panel";
import * as gsmApi from "@/lib/gsm/api";
import type { ProofUpload } from "@/lib/gsm/api";
import {
  PANEL_1_PILL_SLOTS,
  paymentForSlot,
  readLastSelectedPill,
  resolveSelectedPayment,
} from "@/lib/gsm/payments";
import { PortalProvider, usePortal } from "@/lib/gsm/portal-context";

import { MyOrders } from "./MyOrders";
import { Panel1PaymentMethod } from "./Panel1PaymentMethod";
import { Panel2Request } from "./Panel2Request";
import { Panel3Payment } from "./Panel3Payment";
import { Panel4Connection } from "./Panel4Connection";
import { PortalAuth } from "./PortalAuth";

function PortalWorkspace() {
  const { catalog, customer, isAuthenticated, loading, applyCustomer, reloadSession, logout } =
    usePortal();

  const [selectedCode, setSelectedCode] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [model, setModel] = useState("");
  const [quote, setQuote] = useState<{ unitPrice: number; totalPrice: number } | null>(null);
  const [error, setError] = useState("");

  // Preselección de la pill: última elegida → país del perfil → primera disponible.
  useEffect(() => {
    if (!catalog) return;
    const methods = catalog.paymentMethods || [];
    const slots = PANEL_1_PILL_SLOTS.map((slot) => ({
      ...slot,
      payment: paymentForSlot(slot, methods),
    }));
    const available = slots
      .filter((slot) => slot.payment)
      .map((slot) => (slot.payment ? slot.payment.code : ""));
    setSelectedCode((current) =>
      resolveSelectedPayment({
        current,
        available,
        remembered: readLastSelectedPill(),
        profileCountry: customer?.client?.country || "",
        slots,
      }),
    );
  }, [catalog, customer]);

  // Cotización en vivo: cambia con la cantidad y el método elegido.
  useEffect(() => {
    let cancelled = false;
    if (!isAuthenticated) {
      setQuote(null);
      return undefined;
    }
    gsmApi
      .fetchQuote({ quantity, paymentMethod: selectedCode })
      .then((payload) => {
        if (cancelled) return;
        setQuote(
          payload?.available
            ? { unitPrice: Number(payload.unitPrice), totalPrice: Number(payload.totalPrice) }
            : null,
        );
      })
      .catch(() => {
        if (!cancelled) setQuote(null);
      });
    return () => {
      cancelled = true;
    };
  }, [quantity, selectedCode, isAuthenticated]);

  const handleSubmitProof = useCallback(
    async (proof: ProofUpload) => {
      setError("");
      try {
        // Decisión D1: subir el comprobante ES lo que crea la orden.
        const payload = await gsmApi.createOrder({
          quantity,
          paymentMethod: selectedCode,
          items: model ? [{ model }] : undefined,
          paymentProofs: [proof],
        });
        if (payload?.customer) applyCustomer(payload.customer);
        else await reloadSession();
      } catch (caught) {
        setError((caught as Error).message);
        throw caught;
      }
    },
    [quantity, selectedCode, model, applyCustomer, reloadSession],
  );

  const totals = useMemo(
    () => ({
      total: quote ? quote.totalPrice : null,
      unit: quote ? quote.unitPrice : null,
    }),
    [quote],
  );

  if (loading) {
    return (
      <Container className="py-16">
        <p className="text-center text-sm text-muted-foreground" aria-busy="true">
          Cargando portal…
        </p>
      </Container>
    );
  }

  if (!isAuthenticated) {
    return (
      <Container className="py-12">
        <div className="mb-8 text-center">
          <Kicker>Portal cliente</Kicker>
          <h1 className="mt-2 font-display text-2xl font-bold text-foreground">
            Xiaomi FRP Express con seguimiento en línea
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Registrá tus equipos, subí el comprobante y seguí el avance sin depender de mensajes
            sueltos.
          </p>
        </div>
        <PortalAuth />
      </Container>
    );
  }

  const verificationPending = customer?.client && !customer.client.emailVerified;
  const debt = customer?.pendingDebtUsdt || 0;

  return (
    <Container className="flex flex-col gap-8 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Kicker>Sesión cliente</Kicker>
          <h1 className="mt-1 font-display text-xl font-bold text-foreground">
            {customer?.client?.name || "Portal AriadGSM"}
          </h1>
          <p className="text-[11px] text-muted-foreground">
            {customer?.client?.status} · {customer?.monthlyUsage || 0} equipos este mes
          </p>
        </div>
        <button
          type="button"
          onClick={() => logout()}
          className="rounded-lg border border-line px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-cobalt/40 hover:text-foreground"
        >
          Salir
        </button>
      </header>

      {verificationPending ? (
        <div className="rounded-xl bg-amber-400/15 px-4 py-3 text-sm text-amber-700 dark:text-amber-200">
          Confirmá tu correo para poder crear solicitudes.
        </div>
      ) : null}

      {debt > 0 ? (
        <div className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-300">
          Tenés una deuda pendiente de {debt} USDT. Pagala para volver a crear solicitudes.
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Panel1PaymentMethod
          selectedCode={selectedCode}
          onSelect={setSelectedCode}
          totalUsdt={totals.total}
        />
        <Panel2Request
          quantity={quantity}
          onQuantityChange={setQuantity}
          model={model}
          onModelChange={setModel}
          totalUsdt={totals.total}
          unitPriceUsdt={totals.unit}
        />
        <Panel3Payment
          selectedCode={selectedCode}
          totalUsdt={totals.total}
          onSubmitProof={handleSubmitProof}
        />
        <Panel4Connection />
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-300"
        >
          {error}
        </p>
      ) : null}

      <MyOrders />
    </Container>
  );
}

export function PortalPage() {
  return (
    <PortalProvider>
      <PortalWorkspace />
    </PortalProvider>
  );
}
