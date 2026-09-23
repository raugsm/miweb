// Estado global del portal cliente AriadGSM.
//
// Reemplaza a `public/portal-modules/state.js` + `session.js` + `live-orders.js`
// + `admin-config-stream.js`. Todo el estado mutable compartido del portal vanilla
// vive acá como estado de React.
//
// Dos canales SSE distintos, igual que el portal viejo:
//   - `/api/portal/orders/events`       órdenes del cliente autenticado.
//   - `/api/portal/admin-config/events` broadcast público (tasa de cambio y
//     activación de métodos de pago). No requiere sesión.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import * as gsmApi from "./api";
import { deriveFlowState, panelsAreFrozen } from "./flow-state";
import type {
  ActiveTechnician,
  CustomerOrder,
  CustomerState,
  FlowState,
  PortalCatalog,
} from "./types";

/** Estado visual del indicador "En vivo" de Mis órdenes. */
export type LiveStatus = "offline" | "connecting" | "live" | "backup" | "error";

/** Aviso efímero de los cajones del panel 1 (cambio de tasa, método pausado). */
export interface PanelNotice {
  id: number;
  message: string;
  variant: "warning" | "success";
  durationMs: number;
}

interface PortalContextValue {
  customer: CustomerState | null;
  catalog: PortalCatalog | null;
  activeTechnician: ActiveTechnician | null;
  flowState: FlowState;
  /** Los paneles 1-2-3 se congelan con comprobante en revisión o pago aprobado. */
  frozen: boolean;
  loading: boolean;
  liveStatus: LiveStatus;
  notice: PanelNotice | null;
  orders: CustomerOrder[];
  isAuthenticated: boolean;
  reloadSession: () => Promise<void>;
  applyCustomer: (next: CustomerState) => void;
  showNotice: (message: string, options?: Partial<Omit<PanelNotice, "id" | "message">>) => void;
  dismissNotice: () => void;
  logout: () => Promise<void>;
}

const PortalContext = createContext<PortalContextValue | null>(null);

const FALLBACK_POLL_MS = 20_000;
const FALLBACK_FIRST_TICK_MS = 3_000;

export function PortalProvider({ children }: { children: ReactNode }) {
  const [customer, setCustomer] = useState<CustomerState | null>(null);
  const [catalog, setCatalog] = useState<PortalCatalog | null>(null);
  const [activeTechnician, setActiveTechnician] = useState<ActiveTechnician | null>(null);
  const [loading, setLoading] = useState(true);
  const [liveStatus, setLiveStatus] = useState<LiveStatus>("offline");
  const [notice, setNotice] = useState<PanelNotice | null>(null);

  const adminStreamRef = useRef<EventSource | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const noticeSeqRef = useRef(0);

  const isAuthenticated = Boolean(customer?.user && customer?.client);
  const flowState = useMemo(() => deriveFlowState(customer), [customer]);
  const frozen = panelsAreFrozen(flowState);
  const orders = useMemo(() => customer?.orders || [], [customer]);

  const applyCustomer = useCallback((next: CustomerState) => {
    setCustomer(next);
  }, []);

  const showNotice = useCallback(
    (message: string, options: Partial<Omit<PanelNotice, "id" | "message">> = {}) => {
      noticeSeqRef.current += 1;
      const next: PanelNotice = {
        id: noticeSeqRef.current,
        message,
        variant: options.variant || "warning",
        durationMs: options.durationMs ?? 15_000,
      };
      setNotice(next);
      if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = window.setTimeout(() => setNotice(null), next.durationMs);
    },
    [],
  );

  const dismissNotice = useCallback(() => {
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    setNotice(null);
  }, []);

  const reloadSession = useCallback(async () => {
    const [session, technician] = await Promise.all([
      gsmApi.fetchSession(),
      gsmApi
        .fetchActiveTechnician()
        .then((payload) => (payload as { technician?: ActiveTechnician }).technician ?? null)
        .catch(() => null),
    ]);
    setCustomer(session.customer);
    setCatalog(session.catalog);
    if (technician) setActiveTechnician(technician);
  }, []);

  // --- Carga inicial -------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await reloadSession();
      } catch {
        // Sin sesión válida el portal muestra el formulario de acceso.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadSession]);

  // --- Polling de respaldo cuando el SSE no está disponible ----------------
  const stopFallbackPolling = useCallback(() => {
    if (pollTimerRef.current) window.clearTimeout(pollTimerRef.current);
    pollTimerRef.current = null;
  }, []);

  const refreshOrdersSilently = useCallback(async () => {
    const payload = await gsmApi.api<{ orders: CustomerOrder[] }>("/api/portal/orders");
    setCustomer((prev) => (prev ? { ...prev, orders: payload.orders || [] } : prev));
  }, []);

  const startFallbackPolling = useCallback(() => {
    if (pollTimerRef.current) return;
    const tick = async () => {
      try {
        await refreshOrdersSilently();
      } catch {
        stopFallbackPolling();
        setLiveStatus("error");
        return;
      }
      pollTimerRef.current = window.setTimeout(tick, FALLBACK_POLL_MS);
    };
    pollTimerRef.current = window.setTimeout(tick, FALLBACK_FIRST_TICK_MS);
  }, [refreshOrdersSilently, stopFallbackPolling]);

  // --- SSE de órdenes (requiere sesión) -----------------------------------
  useEffect(() => {
    if (!isAuthenticated) return undefined;

    if (!window.EventSource) {
      setLiveStatus("backup");
      startFallbackPolling();
      return () => stopFallbackPolling();
    }

    setLiveStatus("connecting");
    const stream = new EventSource("/api/portal/orders/events");

    stream.onopen = () => {
      stopFallbackPolling();
      setLiveStatus("live");
    };

    stream.addEventListener("orders", (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data || "{}");
        setCustomer((prev) => (prev ? { ...prev, orders: payload.orders || [] } : prev));
        setLiveStatus("live");
      } catch {
        setLiveStatus("error");
      }
    });

    stream.onerror = () => {
      setLiveStatus("connecting");
      startFallbackPolling();
    };

    return () => {
      stream.close();
      stopFallbackPolling();
      setLiveStatus("offline");
    };
  }, [isAuthenticated, startFallbackPolling, stopFallbackPolling]);

  // --- SSE admin-config (broadcast público, sin sesión) --------------------
  useEffect(() => {
    if (!catalog || !window.EventSource) return undefined;
    if (adminStreamRef.current) return undefined;

    const stream = new EventSource("/api/portal/admin-config/events");
    adminStreamRef.current = stream;

    stream.addEventListener("exchange_rate_changed", (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data || "{}");
        if (!data?.currency) return;
        setCatalog((prev) => {
          if (!prev) return prev;
          const rates = prev.exchangeRates.slice();
          const index = rates.findIndex((rate) => rate.currency === data.currency);
          const next = {
            country: index >= 0 ? rates[index].country : "",
            currency: String(data.currency),
            ratePerUsdt: Number(data.ratePerUsdt || 0),
            updatedAt: String(data.updatedAt || ""),
          };
          if (index >= 0) rates[index] = next;
          else rates.push(next);
          return { ...prev, exchangeRates: rates };
        });
        showNotice("El tipo de cambio cambió, monto actualizado", { durationMs: 15_000 });
      } catch {
        // payload inválido: el canal es best-effort, no crítico para el flujo.
      }
    });

    stream.addEventListener("payment_method_toggled", (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data || "{}");
        if (!data?.code) return;
        setCatalog((prev) => {
          if (!prev) return prev;
          const methods = prev.paymentMethods.map((method) =>
            method.code === data.code
              ? {
                  ...method,
                  active: data.active !== false,
                  customMessage: typeof data.customMessage === "string" ? data.customMessage : "",
                }
              : method,
          );
          return { ...prev, paymentMethods: methods };
        });
      } catch {
        // idem.
      }
    });

    stream.addEventListener("portal_catalog_changed", (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data || "{}");
        if (data?.scope && data.scope !== "frp_pricing") return;
        if (data?.requiresSessionRefresh === false) return;
        reloadSession()
          .then(() => showNotice("Precio FRP actualizado", { durationMs: 8_000 }))
          .catch(() => undefined);
      } catch {
        // idem.
      }
    });

    return () => {
      stream.close();
      adminStreamRef.current = null;
    };
  }, [catalog, reloadSession, showNotice]);

  useEffect(
    () => () => {
      if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    },
    [],
  );

  const logout = useCallback(async () => {
    await gsmApi.logout().catch(() => undefined);
    setCustomer(null);
    setLiveStatus("offline");
    await reloadSession().catch(() => undefined);
  }, [reloadSession]);

  const value = useMemo<PortalContextValue>(
    () => ({
      customer,
      catalog,
      activeTechnician,
      flowState,
      frozen,
      loading,
      liveStatus,
      notice,
      orders,
      isAuthenticated,
      reloadSession,
      applyCustomer,
      showNotice,
      dismissNotice,
      logout,
    }),
    [
      customer,
      catalog,
      activeTechnician,
      flowState,
      frozen,
      loading,
      liveStatus,
      notice,
      orders,
      isAuthenticated,
      reloadSession,
      applyCustomer,
      showNotice,
      dismissNotice,
      logout,
    ],
  );

  return <PortalContext.Provider value={value}>{children}</PortalContext.Provider>;
}

export function usePortal(): PortalContextValue {
  const context = useContext(PortalContext);
  if (!context) throw new Error("usePortal debe usarse dentro de <PortalProvider>");
  return context;
}
