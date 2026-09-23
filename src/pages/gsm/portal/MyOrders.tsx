// "Mis órdenes" — zona inferior de la pantalla principal del cliente.
// Spec: docs/specs/cliente/mis-ordenes.md v1.0 (+ nota de migración D1).
//
// Card por orden con la lista de equipos individuales y su estado. El botón
// "Recibo de operación" se activa solo cuando la orden queda FINALIZADA.

import { Panel } from "@/components/Panel";
import { money } from "@/lib/gsm/format";
import { usePortal } from "@/lib/gsm/portal-context";
import type { CustomerOrder, JobStatus, PublicOrderStatus } from "@/lib/gsm/types";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<PublicOrderStatus, string> = {
  SOLICITUD_RECIBIDA: "Solicitud recibida",
  REVISION_COMPATIBILIDAD: "Revisando compatibilidad",
  ESPERANDO_PAGO: "Esperando pago",
  PAGO_EN_REVISION: "Pago en revisión",
  PAGO_RECHAZADO: "Pago rechazado",
  EN_PREPARACION: "En preparación",
  LISTO_PARA_CONEXION: "Listo para conexión",
  EN_PROCESO: "En proceso",
  FINALIZADO: "Finalizado",
  REQUIERE_ATENCION: "Requiere atención",
  POSTPAGO_SOLICITADO: "Postpago solicitado",
  CANCELADO: "Cancelado",
};

const ITEM_LABEL: Partial<Record<JobStatus, string>> = {
  ESPERANDO_PREPARACION: "Pendiente",
  LISTO_PARA_TECNICO: "Esperando técnico",
  EN_PROCESO: "En proceso",
  FINALIZADO: "Finalizado",
  REQUIERE_REVISION: "Requiere revisión",
  ESPERANDO_CLIENTE: "Esperando al cliente",
  CANCELADO: "Cancelado",
};

function statusTone(status: PublicOrderStatus): string {
  if (status === "FINALIZADO") return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300";
  if (status === "PAGO_RECHAZADO" || status === "REQUIERE_ATENCION" || status === "CANCELADO") {
    return "bg-red-500/15 text-red-600 dark:text-red-300";
  }
  if (status === "EN_PROCESO") return "bg-cobalt/15 text-cobalt";
  return "bg-foreground/10 text-muted-foreground";
}

function OrderCard({ order }: { order: CustomerOrder }) {
  const finished = order.publicStatus === "FINALIZADO";
  const activeItems = order.items.filter((item) => item.status !== "CANCELADO");

  return (
    <Panel as="article" className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-tech text-sm font-semibold text-foreground">
            {order.shortCode || order.code}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {order.quantity} {order.quantity === 1 ? "equipo" : "equipos"} ·{" "}
            {money(order.totalPrice)}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold",
            statusTone(order.publicStatus),
          )}
        >
          {STATUS_LABEL[order.publicStatus] || order.publicStatus}
        </span>
      </div>

      {order.nextAction ? (
        <p className="text-[11px] leading-snug text-muted-foreground">{order.nextAction}</p>
      ) : null}

      {activeItems.length > 1 ? (
        <ul className="flex flex-col gap-1.5">
          {activeItems.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-2 rounded-lg bg-field px-3 py-2"
            >
              <span className="font-tech text-[11px] text-muted-foreground">
                {item.shortCode || `Equipo ${item.sequence}`}
              </span>
              <span className="text-[11px] text-foreground">
                {ITEM_LABEL[item.status] || item.status}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {order.activityLog.length ? (
        <details>
          <summary className="cursor-pointer list-none text-[11px] text-muted-foreground hover:text-foreground">
            Registro de actividad
          </summary>
          <ul className="mt-2 flex flex-col gap-1.5 border-l border-line pl-3">
            {order.activityLog.map((event, index) => (
              <li key={`${event.at}-${index}`} className="text-[11px] text-muted-foreground">
                {event.label}
                {event.actor === "customer" ? " (vos)" : ""}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <a
        href={finished ? `/api/portal/orders/${order.id}/receipt` : undefined}
        target="_blank"
        rel="noopener"
        aria-disabled={!finished}
        className={cn(
          "rounded-lg border py-2 text-center text-xs transition-colors",
          finished
            ? "border-cobalt bg-cobalt/10 text-foreground hover:bg-cobalt/20"
            : "pointer-events-none border-line text-muted-foreground opacity-50",
        )}
      >
        Recibo de operación
      </a>
    </Panel>
  );
}

export function MyOrders() {
  const { orders, liveStatus } = usePortal();

  const liveLabel =
    liveStatus === "live"
      ? "En vivo"
      : liveStatus === "connecting"
        ? "Conectando"
        : liveStatus === "backup"
          ? "Modo respaldo"
          : liveStatus === "error"
            ? "Sin conexión"
            : "Desconectado";

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-bold text-foreground">Mis órdenes</h2>
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span
            aria-hidden="true"
            className={cn(
              "size-1.5 rounded-full",
              liveStatus === "live" ? "animate-pulse bg-emerald-500" : "bg-muted-foreground/40",
            )}
          />
          {liveLabel}
        </span>
      </div>

      {orders.length === 0 ? (
        <p className="rounded-xl border border-line bg-field px-4 py-6 text-center text-sm text-muted-foreground">
          Aún no tenés órdenes. Tu primera orden aparecerá acá.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {orders.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </div>
      )}
    </section>
  );
}
