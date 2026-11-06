/**
 * Historial de "Mi cuenta" (W12 1099:73 / W12m 1104:117) — lógica pura, sin red ni React.
 *
 * Convierte lo que devuelve `cliente_resumen` (movimientos del saldo + trabajos) en las filas que ve
 * el cliente: fecha, qué fue, número de pedido, monto y saldo. No inventa nada: si un dato no viene,
 * la fila lo deja en blanco. Los nombres de los servicios salen del catálogo en vivo.
 *
 * Formas reales de los movimientos (producción, nov-2026):
 *   recarga    · motivo "Yape" | "Binance Pay" | texto libre del panel · referencia interna
 *   consumo    · servicio "frp" (motivo "FRP AT-…") | "cuenta_mi" (referencia "AT-…") |
 *                "alquiler" (motivo "Alquiler AT-…") | null (proceso de la app)
 *   devolucion · servicio como el consumo; el AT viene en el motivo o en la referencia
 *   ajuste     · corrección hecha desde el panel (motivo = texto del operador, no se muestra)
 */
import type { ResumenCliente } from "@/lib/cuenta"

export type FiltroHistorial = "todo" | "recargas" | "usos" | "devoluciones"

export type FilaHistorial = {
  /** Fecha ISO del movimiento. */
  fecha: string
  /** Para los filtros: recarga, uso (consumo o proceso con licencia), devolución u otro (ajuste del panel). */
  clase: "recarga" | "uso" | "devolucion" | "otro"
  /** "Recarga · Binance", "Alquiler · Unlock Tool · 6 h", "Devolución · Cuenta MI"… */
  que: string
  /** "AT-261103-112", "folio 88213" o null (se muestra "—"). */
  pedido: string | null
  /** Monto en USD con signo; null = proceso cubierto por la licencia ("con licencia"). */
  monto: number | null
  /** Saldo en USD después del movimiento (en "con licencia", el de ese momento); null si no se sabe. */
  saldo: number | null
}

const PEDIDO = /AT-\d{6}-\d+/

/** Nombre que ve el cliente para cada `servicio` del movimiento. `catalogo` = clave → nombre en vivo. */
function nombreServicio(servicio: string | null | undefined, catalogo: Record<string, string>): string {
  if (!servicio) return "Security Plugin"
  if (servicio === "frp") return catalogo.xiaomi_frp ?? "Xiaomi FRP"
  if (servicio === "alquiler") return "Alquiler"
  return catalogo[servicio] ?? servicio
}

function queFue(m: ResumenCliente["movimientos"][number], catalogo: Record<string, string>): string {
  if (m.tipo === "recarga") {
    const motivo = (m.motivo ?? "").trim().toLowerCase()
    if (motivo === "yape") return "Recarga · Yape"
    if (motivo.startsWith("binance")) return "Recarga · Binance"
    return "Recarga"
  }
  if (m.tipo === "ajuste") return "Ajuste"
  const nombre = nombreServicio(m.servicio, catalogo)
  const conDetalle = m.detalle ? `${nombre} · ${m.detalle}` : nombre
  return m.tipo === "devolucion" ? `Devolución · ${nombre}` : conDetalle
}

/** Filas del historial, de la más nueva a la más vieja. */
export function filasHistorial(resumen: Pick<ResumenCliente, "movimientos" | "trabajos" | "saldo" | "saldo_usd">, catalogo: Record<string, string> = {}): FilaHistorial[] {
  const filas: FilaHistorial[] = resumen.movimientos.map((m) => ({
    fecha: m.fecha_registro,
    clase: m.tipo === "recarga" ? "recarga" : m.tipo === "consumo" ? "uso" : m.tipo === "devolucion" ? "devolucion" : "otro",
    que: queFue(m, catalogo),
    pedido: m.pedido ?? (m.referencia ?? "").match(PEDIDO)?.[0] ?? (m.motivo ?? "").match(PEDIDO)?.[0] ?? null,
    monto: m.cantidad_usd ?? m.cantidad,
    saldo: m.saldo_despues_centavos != null ? m.saldo_despues_centavos / 100 : m.saldo_despues,
  }))
  // Procesos hechos con la licencia: no mueven el saldo, así que no están entre los movimientos.
  for (const t of resumen.trabajos) {
    if (!t.con_licencia) continue
    filas.push({ fecha: t.fecha, clase: "uso", que: t.modelo ? `Security Plugin · ${t.modelo}` : "Security Plugin", pedido: t.folio ? `folio ${t.folio}` : null, monto: null, saldo: t.saldo_centavos != null ? t.saldo_centavos / 100 : null })
  }
  filas.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0))

  // Saldo de las filas "con licencia": el que había en ese momento. Si el servidor no lo mandó, es
  // el del movimiento anterior; si no hay uno anterior, el de antes del movimiento que sigue; sin
  // ningún movimiento, el de hoy.
  const centavos = (n: number) => Math.round(n * 100) / 100
  for (let i = filas.length - 1; i >= 0; i--) {
    if (filas[i].monto != null || filas[i].saldo != null) continue
    const anterior = filas[i + 1]?.saldo
    if (anterior != null) {
      filas[i].saldo = anterior
      continue
    }
    const sigue = filas.slice(0, i).reverse().find((f) => f.monto != null)
    if (sigue) filas[i].saldo = sigue.saldo != null && sigue.monto != null ? centavos(sigue.saldo - sigue.monto) : null
    else if (!resumen.movimientos.length) filas[i].saldo = resumen.saldo_usd ?? resumen.saldo
  }
  return filas
}

const CLASE: Record<Exclude<FiltroHistorial, "todo">, FilaHistorial["clase"]> = { recargas: "recarga", usos: "uso", devoluciones: "devolucion" }

/** Filas que pasan el filtro y caen dentro de los últimos `dias` (null = sin límite). */
export function filtrarHistorial(filas: FilaHistorial[], filtro: FiltroHistorial, dias: number | null, ahora = new Date()): FilaHistorial[] {
  const desde = dias != null ? ahora.getTime() - dias * 86_400_000 : null
  return filas.filter((f) => (filtro === "todo" || f.clase === CLASE[filtro]) && (desde == null || new Date(f.fecha).getTime() >= desde))
}

/** "+20.00" / "−2.40" (con el signo menos tipográfico del diseño) / "0.00" sin signo. */
export function montoTexto(monto: number): string {
  const n = Math.abs(monto).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${monto < 0 ? "−" : monto > 0 ? "+" : ""}${n}`
}

/** "03/11 18:05" en la hora del navegador. */
export function fechaCorta(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const p = (n: number) => String(n).padStart(2, "0")
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** Iniciales para el avatar: "Taller Rivera" → "TR". */
export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean)
  if (!partes.length) return ""
  const letras = partes.length === 1 ? partes[0].slice(0, 2) : partes[0][0] + partes[1][0]
  return letras.toUpperCase()
}
