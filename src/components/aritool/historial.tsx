/**
 * Piezas del historial que comparten Mi cuenta (W12) y Tu historial (W12b): la tabla de compu, la lista
 * de celular y los estados de W13 (historial vacío, cargando, no se pudo cargar).
 */
import { List } from "lucide-react"

import { C } from "@/components/aritool/chrome"
import { fechaCorta, montoTexto, type FilaHistorial } from "@/lib/historial"

const saldoTexto = (n: number) => n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function Monto({ f, chico }: { f: FilaHistorial; chico?: boolean }) {
  if (f.monto == null) return <span style={{ color: C.muted, fontSize: chico ? 12 : 14 }}>con licencia</span>
  return <span style={{ color: f.monto >= 0 ? C.green : C.text, fontWeight: 600, fontSize: chico ? 15 : 14 }}>{montoTexto(f.monto)}</span>
}

export function Barra({ w, h }: { w: number; h: number }) {
  return <span className="block animate-pulse rounded" style={{ width: w, height: h, background: C.border }} />
}

// ----- Compu: tabla -----
const COL = ["w-[150px] shrink-0", "min-w-0 flex-1", "w-[200px] shrink-0", "w-[140px] shrink-0 text-right", "w-[140px] shrink-0 text-right"]

export function CabeceraHistorial() {
  return (
    <div className="flex items-center px-6 py-3" style={{ color: C.faint, fontWeight: 500, fontSize: 12, lineHeight: "15px" }}>
      {["Fecha", "Qué fue", "Pedido", "Monto", "Saldo"].map((t, i) => <span key={t} className={COL[i]}>{t}</span>)}
    </div>
  )
}

export function FilaCompu({ f }: { f: FilaHistorial }) {
  return (
    <div className="flex items-center px-6 py-[14px]" style={{ borderTop: `1px solid ${C.border}`, fontSize: 14, lineHeight: "17px" }}>
      <span className={COL[0]} style={{ color: "#d1d5db" }}>{fechaCorta(f.fecha)}</span>
      <span className={`${COL[1]} truncate`} style={{ color: "#d1d5db" }}>{f.que}</span>
      <span className={COL[2]} style={{ color: C.muted }}>{f.pedido ?? "—"}</span>
      <span className={COL[3]}><Monto f={f} /></span>
      <span className={COL[4]} style={{ color: C.muted }}>{f.saldo != null ? saldoTexto(f.saldo) : "—"}</span>
    </div>
  )
}

export function FilasCargandoCompu() {
  return <>{[0, 1, 2].map((i) => <div key={i} className="flex items-center px-6 py-[17px]" style={{ borderTop: `1px solid ${C.border}` }}><Barra w={420} h={11} /></div>)}</>
}

// ----- Celular: lista -----
export function FilaCelular({ f, primera }: { f: FilaHistorial; primera: boolean }) {
  return (
    <div className="flex items-center gap-2.5 p-[14px]" style={primera ? undefined : { borderTop: `1px solid ${C.border}` }}>
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="truncate" style={{ color: C.text, fontWeight: 500, fontSize: 14, lineHeight: "17px" }}>{f.que}</span>
        <span className="truncate" style={{ color: C.muted, fontSize: 12, lineHeight: "15px" }}>{[fechaCorta(f.fecha), f.pedido].filter(Boolean).join(" · ")}</span>
      </div>
      <span className="shrink-0" style={{ lineHeight: "18px" }}><Monto f={f} chico /></span>
    </div>
  )
}

export function FilasCargandoCelular() {
  return <>{[0, 1, 2].map((i) => <div key={i} className="p-[14px]" style={i ? { borderTop: `1px solid ${C.border}` } : undefined}><Barra w={200} h={35} /></div>)}</>
}

// ----- Estados (W13) -----
export function HistorialVacio() {
  // W13 S5
  return (
    <div className="flex w-full flex-col items-center gap-2 py-[18px]">
      <List className="size-7" style={{ color: C.faint }} />
      <p style={{ color: C.muted2, fontWeight: 600, fontSize: 15, lineHeight: "18px" }}>Todavía no hay movimientos.</p>
      <p style={{ color: C.muted, fontSize: 13, lineHeight: "16px" }}>Cuando recargues o uses algo, aparece acá.</p>
    </div>
  )
}

export function NoSePudo({ onReintentar }: { onReintentar: () => void }) {
  // W13 S7
  return (
    <div className="flex w-full max-w-[420px] flex-col items-start gap-4 rounded-2xl p-7" style={{ border: `1px solid ${C.borderSoft}`, background: C.card }}>
      <p style={{ color: C.title, fontWeight: 700, fontSize: 20, lineHeight: "24px" }}>No pudimos cargar tu cuenta</p>
      <p style={{ color: C.muted, fontSize: 14, lineHeight: "20px" }}>Revisá tu internet y probá de nuevo.</p>
      <button type="button" onClick={onReintentar} className="flex w-full items-center justify-center text-white" style={{ background: C.blue, borderRadius: 10, padding: "13px 18px", fontWeight: 600, fontSize: 15, lineHeight: "18px" }}>Reintentar</button>
    </div>
  )
}
