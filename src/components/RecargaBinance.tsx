import { useCallback, useEffect, useRef, useState } from "react"
import QRCode from "qrcode"
import { Check, Copy, Loader2, ShieldCheck, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { pagoCobroCrear, pagoCobroEstado, type CobroCreado } from "@/lib/cuenta"

type Paso = "elegir" | "pagar" | "listo" | "vencido"

const PAQUETES = [1, 5, 10, 20, 50]

function Copiable({ texto, etiqueta }: { texto: string; etiqueta: string }) {
  const [copiado, setCopiado] = useState(false)
  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1600)
    } catch {
      /* algunos navegadores bloquean el portapapeles: el valor igual se ve */
    }
  }
  return (
    <button
      type="button"
      onClick={copiar}
      aria-label={`Copiar ${etiqueta}`}
      className="inline-flex items-center gap-1.5 rounded-md border border-line bg-field px-2 py-1 text-xs font-medium text-foreground/70 transition-colors hover:border-cobalt/40 hover:text-foreground"
    >
      {copiado ? <Check className="size-3.5 text-[#0E7A4C] dark:text-[#7CE6B4]" /> : <Copy className="size-3.5" />}
      {copiado ? "Copiado" : "Copiar"}
    </button>
  )
}

export function RecargaBinance({
  jwt,
  onClose,
  onConfirmado,
}: {
  jwt: string
  onClose: () => void
  onConfirmado: () => void
}) {
  const [paso, setPaso] = useState<Paso>("elegir")
  const [creditos, setCreditos] = useState(1)
  const [creando, setCreando] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [cobro, setCobro] = useState<CobroCreado | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [restante, setRestante] = useState<number>(0) // segundos hasta vencer
  const cobroRef = useRef<string | null>(null)

  async function generar() {
    setErr(null)
    const c = Math.trunc(creditos)
    if (!(c >= 1 && c <= 5000)) {
      setErr("Elegí una cantidad válida (1 a 5000).")
      return
    }
    setCreando(true)
    try {
      const r = await pagoCobroCrear(jwt, c)
      if (!r.ok || !r.data || r.data.error || !r.data.cobro_id) {
        setErr("No se pudo generar el pago. Probá de nuevo en un momento.")
        return
      }
      setCobro(r.data)
      cobroRef.current = r.data.cobro_id
      setPaso("pagar")
      if (r.data.pago_url) {
        try {
          setQr(await QRCode.toDataURL(r.data.pago_url, { margin: 1, width: 320 }))
        } catch {
          setQr(null)
        }
      }
    } catch {
      setErr("No se pudo conectar. Revisá tu internet e intentá otra vez.")
    } finally {
      setCreando(false)
    }
  }

  // Cuenta regresiva hasta el vencimiento del cobro.
  useEffect(() => {
    if (paso !== "pagar" || !cobro?.vence_en) return
    const fin = new Date(cobro.vence_en).getTime()
    const tick = () => {
      const seg = Math.max(0, Math.round((fin - Date.now()) / 1000))
      setRestante(seg)
      if (seg <= 0) setPaso("vencido")
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [paso, cobro?.vence_en])

  // Sondea el estado hasta que el vigía confirme el pago (sin botón de "ya pagué").
  const sondear = useCallback(async () => {
    const id = cobroRef.current
    if (!id) return
    try {
      const r = await pagoCobroEstado(jwt, id)
      if (r.ok && r.data?.pagado) {
        setPaso("listo")
        return true
      }
      if (r.ok && (r.data?.estado === "caducado" || r.data?.estado === "anulado")) {
        setPaso("vencido")
        return true
      }
    } catch {
      /* reintenta en el próximo tick */
    }
    return false
  }, [jwt])

  useEffect(() => {
    if (paso !== "pagar") return
    let vivo = true
    const id = setInterval(async () => {
      if (!vivo) return
      const listo = await sondear()
      if (listo) clearInterval(id)
    }, 5000)
    return () => {
      vivo = false
      clearInterval(id)
    }
  }, [paso, sondear])

  const mmss = `${String(Math.floor(restante / 60)).padStart(2, "0")}:${String(restante % 60).padStart(2, "0")}`

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Recargar créditos con Binance Pay"
      onClick={onClose}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-line bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute top-4 right-4 flex size-8 items-center justify-center rounded-lg border border-line text-foreground/50 transition-colors hover:text-foreground"
        >
          <X className="size-4" />
        </button>

        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg border border-[#5A4A20] bg-[#2E2513] text-[#F0C97D]">
            {/* Binance usa amarillo; el chip queda fijo en ambos modos */}
            <span className="text-base font-bold">◈</span>
          </span>
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            Recargar con Binance Pay
          </h2>
        </div>

        {paso === "elegir" ? (
          <div className="mt-5">
            <p className="text-sm leading-relaxed text-foreground/65">
              Pagás desde tu Binance a la cuenta de Ariad. Se acredita solo cuando el
              pago llega (no hace falta avisar). 1 crédito = 1 USDT.
            </p>
            <label className="mt-5 block text-xs font-medium tracking-[0.14em] text-foreground/45 uppercase">
              ¿Cuántos créditos?
            </label>
            <div className="mt-2 flex flex-wrap gap-2">
              {PAQUETES.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setCreditos(p)}
                  className={`h-10 min-w-14 rounded-lg border px-3 text-sm font-medium transition-colors ${
                    creditos === p
                      ? "border-cobalt bg-cobalt text-white"
                      : "border-line bg-field text-foreground/70 hover:border-cobalt/40"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            <div className="mt-3">
              <input
                type="number"
                min={1}
                max={5000}
                value={creditos}
                onChange={(e) => setCreditos(Number(e.target.value))}
                className="h-11 w-full rounded-lg border border-line bg-field px-3 text-sm text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              />
              <p className="mt-2 text-sm text-foreground/55">
                Total a pagar: <span className="font-semibold text-foreground">{creditos || 0}.00 USDT</span>
              </p>
            </div>
            {err ? <p className="mt-3 text-sm font-medium text-[#B42318] dark:text-[#F0A49D]">{err}</p> : null}
            <Button
              type="button"
              className="mt-5 h-11 w-full rounded-lg font-medium"
              disabled={creando}
              onClick={generar}
            >
              {creando ? <Loader2 className="size-4 animate-spin" /> : null}
              {creando ? "Generando…" : "Generar pago"}
            </Button>
          </div>
        ) : null}

        {paso === "pagar" && cobro ? (
          <div className="mt-5">
            {/* MONTO EXACTO */}
            <div className="rounded-xl border border-line bg-field p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium tracking-[0.14em] text-foreground/45 uppercase">
                    Monto exacto
                  </p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground tabular-nums">
                    {cobro.monto} <span className="text-base font-medium text-foreground/60">USDT</span>
                  </p>
                </div>
                <Copiable texto={cobro.monto} etiqueta="monto" />
              </div>
              <p className="mt-1 text-xs text-foreground/50">
                Tiene que ser exacto, sin cambiar los centavos.
              </p>
            </div>

            {/* CÓDIGO OBLIGATORIO EN LA NOTA */}
            <div className="mt-3 rounded-xl border border-cobalt/40 bg-cobalt/[0.06] p-4 dark:bg-[#0E1B30]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium tracking-[0.14em] text-cobalt uppercase dark:text-[#7FB3FF]">
                    Código para la NOTA (obligatorio)
                  </p>
                  <p className="mt-1 font-mono text-xl font-semibold tracking-wide text-foreground">
                    {cobro.codigo}
                  </p>
                </div>
                <Copiable texto={cobro.codigo} etiqueta="código" />
              </div>
              <p className="mt-1 text-xs text-foreground/55">
                Pegá este código en el campo de <strong>nota/mensaje</strong> del pago. Sin él no
                podemos reconocer tu recarga.
              </p>
            </div>

            {/* QR / DESTINO */}
            {qr ? (
              <div className="mt-3 flex flex-col items-center rounded-xl border border-line bg-white p-4">
                <img src={qr} alt="QR de Binance Pay" className="size-44" />
                <p className="mt-2 text-xs text-[#26354F]/70">
                  Escaneá con la app de Binance{cobro.destino ? ` · pagás a ${cobro.destino}` : ""}
                </p>
              </div>
            ) : cobro.destino ? (
              <div className="mt-3 rounded-xl border border-line bg-field p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium tracking-[0.14em] text-foreground/45 uppercase">
                      Pagar a (Binance Pay)
                    </p>
                    <p className="mt-1 truncate text-sm font-medium text-foreground">{cobro.destino}</p>
                  </div>
                  <Copiable texto={cobro.destino} etiqueta="destino" />
                </div>
              </div>
            ) : null}

            {/* PASOS */}
            <ol className="mt-4 space-y-2 text-sm text-foreground/70">
              {[
                "Abrí tu app de Binance → Pay → Enviar / Transferir.",
                cobro.destino ? "Elegí la cuenta de Ariad (arriba) o escaneá el QR." : "Enviá a la cuenta de Ariad de Binance Pay.",
                `Poné el monto EXACTO: ${cobro.monto} USDT.`,
                `Pegá el código ${cobro.codigo} en la nota.`,
                "Confirmá. Los créditos aparecen solos en unos segundos.",
              ].map((t, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border border-line bg-field text-[11px] font-semibold text-foreground/60">
                    {i + 1}
                  </span>
                  <span>{t}</span>
                </li>
              ))}
            </ol>

            {/* ESPERA */}
            <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-line bg-field px-4 py-3">
              <span className="flex items-center gap-2 text-sm text-foreground/70">
                <Loader2 className="size-4 animate-spin text-cobalt dark:text-[#7FB3FF]" />
                Esperando tu pago…
              </span>
              <span className="text-sm font-medium text-foreground/60 tabular-nums">vence en {mmss}</span>
            </div>
            <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-foreground/45">
              <ShieldCheck className="size-3.5" /> Detección automática y segura. No cierres esta ventana.
            </p>
          </div>
        ) : null}

        {paso === "listo" ? (
          <div className="mt-6 flex flex-col items-center text-center">
            <span className="flex size-14 items-center justify-center rounded-full border border-[#1C5A44] bg-[#0F2E24] text-[#7CE6B4]">
              <Check className="size-7" />
            </span>
            <h3 className="mt-4 text-lg font-semibold tracking-tight text-foreground">
              ¡Pago confirmado!
            </h3>
            <p className="mt-2 text-sm text-foreground/65">
              Se acreditaron tus créditos. Ya podés usarlos.
            </p>
            <Button
              type="button"
              className="mt-5 h-11 w-full rounded-lg font-medium"
              onClick={() => {
                onConfirmado()
                onClose()
              }}
            >
              Listo
            </Button>
          </div>
        ) : null}

        {paso === "vencido" ? (
          <div className="mt-6 flex flex-col items-center text-center">
            <span className="flex size-14 items-center justify-center rounded-full border border-[#5A4A20] bg-[#2E2513] text-[#F0C97D]">
              <X className="size-7" />
            </span>
            <h3 className="mt-4 text-lg font-semibold tracking-tight text-foreground">
              El pago venció
            </h3>
            <p className="mt-2 text-sm text-foreground/65">
              No pasa nada: si ya enviaste el dinero con el código correcto, se acreditará igual y lo
              verás en tus movimientos. Si no, generá uno nuevo.
            </p>
            <div className="mt-5 flex w-full gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-11 flex-1 rounded-lg border-line bg-transparent text-foreground hover:border-foreground/30"
                onClick={onClose}
              >
                Cerrar
              </Button>
              <Button
                type="button"
                className="h-11 flex-1 rounded-lg font-medium"
                onClick={() => {
                  setCobro(null)
                  cobroRef.current = null
                  setQr(null)
                  setErr(null)
                  setPaso("elegir")
                }}
              >
                Generar otro
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
