/**
 * Recargar saldo (W14) — lógica pura, sin red ni React.
 *
 * Reglas (W8 1066:2 y W14-E 1133:103): mínimo US$ 10, máximo US$ 5000, montos enteros; el campo de
 * "Otro monto" vacío no muestra 0 ni admite ceros a la izquierda. Yape es solo para Perú.
 */
import type { CobroActivo, ResumenCliente } from "@/lib/cuenta"

export const MONTO_MIN = 10
export const MONTO_MAX = 5000
/** Montos de un toque (W14-1). */
export const MONTOS = [10, 20, 50, 100]
/** El que viene elegido al entrar, como en el dibujo. */
export const MONTO_INICIAL = 20

export type Metodo = "yape" | "binance"

/** Lo que el cliente va tecleando en "Otro monto" → solo dígitos, sin ceros adelante, 4 cifras como mucho. */
export function limpiarMonto(texto: string): string {
  return texto.replace(/\D/g, "").replace(/^0+/, "").slice(0, 4)
}

/**
 * El monto que viene en la dirección (?monto=35), para no perderlo al refrescar. Solo vale un número entero
 * escrito limpio; cualquier otra cosa ("1e3", "-5", "20.5", "abc") se ignora.
 */
export function montoDeDireccion(q: string | null): number | null {
  return q != null && /^[1-9]\d{0,3}$/.test(q) ? Number(q) : null
}

/** ¿Se puede cargar ese monto? */
export function montoValido(monto: number | null): monto is number {
  return monto != null && Number.isInteger(monto) && monto >= MONTO_MIN && monto <= MONTO_MAX
}

/**
 * El monto con el que se sigue: si escribió en "Otro monto", manda eso (aunque no sirva: se le avisa);
 * si no, la tarjeta elegida.
 */
export function montoElegido(tarjeta: number | null, otro: string): number | null {
  const limpio = limpiarMonto(otro)
  return limpio ? Number(limpio) : tarjeta
}

/** Formas de pago que funcionan en ese país. */
export function metodosDe(pais: string): Metodo[] {
  return pais === "PE" ? ["yape", "binance"] : ["binance"]
}

/** "999888777" → "999 888 777" (número de Yape o Pay ID). Lo que no son solo dígitos queda igual. */
export function enGrupos(destino: string): string {
  const d = destino.trim()
  return /^\d{7,}$/.test(d) ? d.replace(/(\d{3})(?=\d)/g, "$1 ") : d
}

/** 872 → "14:32". */
export function minSeg(total: number): string {
  const t = Math.max(0, Math.floor(total))
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`
}

/** 20 → "20.00". */
export const dosDecimales = (n: number) => n.toFixed(2)

/** Lo que paga con cada forma: "S/ 71.00" / "20.00 USDT". `monto` = el del cobro ("71.00"). */
export function pagoTexto(metodo: Metodo, monto: string): string {
  return metodo === "yape" ? `S/ ${monto}` : `${monto} USDT`
}

/** Un pago en curso, venga de crearlo o de retomarlo. */
export type Pago = {
  id: string
  metodo: Metodo
  producto: "credito" | "licencia"
  /** Dólares que se cargan al saldo. */
  creditos: number
  /** Monto exacto a pagar, como texto: "71.00" (soles) o "20.00" (USDT). */
  monto: string
  /** Yape: referencia interna. Binance: el código ARI-XXXX que va en la nota. */
  codigo: string
  /** Número de Yape o Pay ID de Binance. */
  destino: string
  /** Binance: enlace para armar el QR ("" si no hay). */
  pagoUrl: string
  /** Hasta cuándo se puede pagar (ISO). */
  venceEn: string
  /** Yape: el código de seguridad que el cliente ya mandó, si mandó alguno. */
  codigoDeclarado: string | null
}

export function pagoDeActivo(a: CobroActivo): Pago {
  return {
    id: a.cobro_id, metodo: a.metodo, producto: a.producto, creditos: a.creditos, monto: a.monto,
    codigo: a.codigo, destino: a.destino ?? "", pagoUrl: a.pago_url ?? "", venceEn: a.vence_en,
    codigoDeclarado: a.codigo_declarado ?? null,
  }
}

/** Segundos que le quedan al pago. Una fecha que no se entiende cuenta como vencida. */
export function restan(pago: Pick<Pago, "venceEn">, ahora = Date.now()): number {
  const fin = new Date(pago.venceEn).getTime()
  return Number.isFinite(fin) ? Math.max(0, Math.round((fin - ahora) / 1000)) : 0
}

// ---------- Licencia anual (W15) ----------

type Licencia = ResumenCliente["licencia"]

/** "2027-11-04T05:00:00Z" → "04/11/2027". */
export const diaMesAnio = (fecha: string) => fecha.slice(0, 10).split("-").reverse().join("/")

/** Hoy en el reloj del cliente, "2026-11-06". */
export function hoyLocal(ahora = new Date()): string {
  return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}-${String(ahora.getDate()).padStart(2, "0")}`
}

/** ¿Tiene una licencia vigente hoy? Entonces comprar es renovar. */
export function licenciaVigente(l: Licencia, hoy: string): boolean {
  return !!l && l.estado === "vigente" && l.fecha_fin.slice(0, 10) >= hoy
}

/**
 * Después de pagar: ¿la licencia que devuelve el servidor ya es la nueva? Tiene que estar vigente y vencer
 * más tarde que la que tenía al entrar: al renovar se suma un año, así que ver "vigente" solo no alcanza.
 */
export function licenciaActivada(antes: Licencia, ahora: Licencia, hoy: string): boolean {
  if (!ahora || !licenciaVigente(ahora, hoy)) return false
  return !antes || ahora.fecha_fin.slice(0, 10) > antes.fecha_fin.slice(0, 10)
}
