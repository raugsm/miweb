import { useCallback, useEffect, useRef, useState } from "react"
import { Check, Copy, Loader2, ShieldCheck, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { yapeConfirmar, yapeCrear, yapeEstado, type YapeCobro } from "@/lib/cuenta"

type Paso = "elegir" | "pagar" | "validando" | "listo" | "vencido"

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

// Yape usa un violeta característico; el chip queda fijo en ambos modos.
const YAPE = "#742384"

export function RecargaYape({
  jwt,
  onClose,
  onConfirmado,
  producto = "credito",
}: {
  jwt: string
  onClose: () => void
  onConfirmado: () => void
  producto?: "credito" | "licencia"
}) {
  const esLicencia = producto === "licencia"
  const [paso, setPaso] = useState<Paso>("elegir")
  const [creditos, setCreditos] = useState(1)
  const [creando, setCreando] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [cobro, setCobro] = useState<YapeCobro | null>(null)
  const [restante, setRestante] = useState<number>(0)
  const [codigo, setCodigo] = useState("")
  const [confirmando, setConfirmando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const cobroRef = useRef<string | null>(null)

  async function generar() {
    setErr(null)
    const c = Math.trunc(creditos)
    if (!esLicencia && !(c >= 1 && c <= 5000)) {
      setErr("Elegí una cantidad válida (1 a 5000).")
      return
    }
    setCreando(true)
    try {
      const r = esLicencia
        ? await yapeCrear(jwt, 0, "licencia")
        : await yapeCrear(jwt, c, "credito")
      if (r.status === 503 || r.data?.error === "yape_inactivo") {
        setErr("El pago con Yape todavía no está disponible. Probá con Binance Pay.")
        return
      }
      if (!r.ok || !r.data || r.data.error || !r.data.cobro_id) {
        setErr("No se pudo generar el pago. Probá de nuevo en un momento.")
        return
      }
      setCobro(r.data)
      cobroRef.current = r.data.cobro_id
      setCodigo("")
      setAviso(null)
      setPaso("pagar")
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

  // El cliente ingresa su código de seguridad y confirma. El backend cruza el pago.
  async function confirmar() {
    const id = cobroRef.current
    if (!id) return
    const cod = codigo.replace(/[^0-9]/g, "")
    if (cod.length < 3) {
      setAviso("Ingresá el código de seguridad de 3 dígitos de tu comprobante Yape.")
      return
    }
    setConfirmando(true)
    setAviso(null)
    try {
      const r = await yapeConfirmar(jwt, id, cod)
      const d = r.data
      if (r.ok && d && (d.casado || d.ya)) {
        setPaso("listo")
        return
      }
      if (d?.motivo === "demasiados_intentos") {
        setAviso("Demasiados intentos con códigos distintos. Esperá unos minutos y reintentá.")
        return
      }
      if (d?.motivo === "codigo_invalido") {
        setAviso("El código debe tener 3 dígitos (aparece en tu comprobante Yape).")
        return
      }
      if (r.ok && d) {
        // Código DECLARADO. El servidor casa solo cuando llegue el pago; el cliente
        // NO reintenta: pasa a "validando" y el sondeo detecta la acreditación.
        setPaso("validando")
        return
      }
      setAviso("No se pudo registrar el código. Revisá tu internet e intentá otra vez.")
    } catch {
      setAviso("No se pudo conectar. Revisá tu internet e intentá otra vez.")
    } finally {
      setConfirmando(false)
    }
  }

  // Sondeo pasivo: por si el pago se casa por otra vía, cerramos el flujo solo.
  const sondear = useCallback(async () => {
    const id = cobroRef.current
    if (!id) return false
    try {
      const r = await yapeEstado(jwt, id)
      if (r.ok && r.data?.estado === "confirmado") {
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
    if (paso !== "pagar" && paso !== "validando") return
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
      aria-label="Recargar créditos con Yape"
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
          <span
            className="flex size-8 items-center justify-center rounded-lg text-base font-bold text-white"
            style={{ backgroundColor: YAPE }}
          >
            Y
          </span>
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            {esLicencia ? "Comprar licencia — Yape" : "Recargar con Yape"}
          </h2>
        </div>

        {paso === "elegir" ? (
          <div className="mt-5">
            {esLicencia ? (
              <>
                <p className="text-sm leading-relaxed text-foreground/65">
                  Pagás por Yape al número de Ariad con el monto exacto. Después confirmás
                  con el código de seguridad de tu comprobante y la licencia se activa.
                </p>
                <div className="mt-5 rounded-xl border border-cobalt/40 bg-cobalt/[0.06] p-4 dark:bg-[#0E1B30]">
                  <p className="text-xs font-medium tracking-[0.14em] text-cobalt uppercase dark:text-[#7FB3FF]">
                    Licencia anual
                  </p>
                  <p className="mt-1 text-3xl font-semibold tracking-tight text-foreground">
                    S/ 157.50 <span className="text-sm font-medium text-foreground/55">/ 1 año</span>
                  </p>
                  <ul className="mt-3 space-y-1.5 text-sm text-foreground/70">
                    <li>· Procesos ilimitados en 1 PC durante 1 año.</li>
                    <li>· Se ata a tu cuenta y a la PC donde la actives.</li>
                    <li>· Si ya tenés licencia vigente, se extiende +1 año.</li>
                  </ul>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm leading-relaxed text-foreground/65">
                  Pagás por Yape al número de Ariad con el monto exacto. Después confirmás
                  con el código de seguridad de tu comprobante. 1 crédito = S/ 3.50.
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
                    Total a pagar:{" "}
                    <span className="font-semibold text-foreground">
                      S/ {((creditos || 0) * 3.5).toFixed(2)}
                    </span>
                  </p>
                </div>
              </>
            )}
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
            {/* QR — escanear con la app de Yape */}
            <div className="flex flex-col items-center">
              <p className="text-xs font-medium tracking-[0.14em] text-foreground/45 uppercase">
                Escaneá con tu Yape
              </p>
              <img
                src="/yape-qr.png"
                alt="Código QR de Yape de Ariad"
                loading="lazy"
                className="mt-3 w-56 max-w-full rounded-xl border border-line shadow-sm"
              />
              <p className="mt-2 text-xs text-foreground/50">
                O yapeá manualmente con los datos de abajo.
              </p>
            </div>

            {/* MONTO EXACTO */}
            <div className="rounded-xl border border-line bg-field p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium tracking-[0.14em] text-foreground/45 uppercase">
                    Monto exacto
                  </p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground tabular-nums">
                    S/ {cobro.monto}
                  </p>
                </div>
                <Copiable texto={cobro.monto} etiqueta="monto" />
              </div>
              <p className="mt-1 text-xs text-foreground/50">
                Tiene que ser exacto, sin cambiar los centavos.
              </p>
            </div>

            {/* DESTINO YAPE */}
            {cobro.destino ? (
              <div className="mt-3 rounded-xl border border-line bg-field p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium tracking-[0.14em] text-foreground/45 uppercase">
                      Yapear a
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
                "Abrí tu app de Yape → Yapear / Enviar.",
                cobro.destino ? `Yapeá a ${cobro.destino}.` : "Yapeá al número de Ariad.",
                `Poné el monto EXACTO: S/ ${cobro.monto}.`,
                "Confirmá el pago en Yape.",
                "Copiá el CÓDIGO DE SEGURIDAD de 3 dígitos de tu comprobante e ingresalo abajo.",
              ].map((t, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border border-line bg-field text-[11px] font-semibold text-foreground/60">
                    {i + 1}
                  </span>
                  <span>{t}</span>
                </li>
              ))}
            </ol>

            {/* CÓDIGO DE SEGURIDAD (obligatorio) */}
            <div className="mt-4 rounded-xl border border-cobalt/40 bg-cobalt/[0.06] p-4 dark:bg-[#0E1B30]">
              <label className="block text-xs font-medium tracking-[0.14em] text-cobalt uppercase dark:text-[#7FB3FF]">
                Código de seguridad (de tu comprobante)
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="Ej: 132"
                  className="h-11 w-full rounded-lg border border-line bg-field px-3 text-center font-mono text-lg tracking-[0.3em] text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                />
                <Button
                  type="button"
                  className="h-11 shrink-0 rounded-lg px-5 font-medium"
                  disabled={confirmando}
                  onClick={confirmar}
                >
                  {confirmando ? <Loader2 className="size-4 animate-spin" /> : null}
                  {confirmando ? "Verificando…" : "Confirmar"}
                </Button>
              </div>
              <p className="mt-2 text-xs text-foreground/55">
                Sin el código correcto no podemos acreditar tu pago. Es tu comprobante.
              </p>
              {aviso ? (
                <p className="mt-2 text-sm font-medium text-[#B42318] dark:text-[#F0A49D]">{aviso}</p>
              ) : null}
            </div>

            <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-line bg-field px-4 py-3">
              <span className="flex items-center gap-2 text-sm text-foreground/70">
                <ShieldCheck className="size-4 text-cobalt dark:text-[#7FB3FF]" />
                Verificación doble y segura.
              </span>
              <span className="text-sm font-medium text-foreground/60 tabular-nums">vence en {mmss}</span>
            </div>
          </div>
        ) : null}

        {paso === "validando" ? (
          <div className="mt-6 flex flex-col items-center text-center">
            <span className="flex size-14 items-center justify-center rounded-full border border-cobalt/40 bg-cobalt/[0.06] text-cobalt dark:text-[#7FB3FF]">
              <Loader2 className="size-7 animate-spin" />
            </span>
            <h3 className="mt-4 text-lg font-semibold tracking-tight text-foreground">
              Validando tu pago…
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-foreground/65">
              Ya registramos tu código. Apenas confirmemos tu Yape, se acredita{" "}
              <span className="font-semibold text-foreground">solo</span> — no tenés que hacer nada más.
            </p>
            <p className="mt-2 text-xs text-foreground/45">
              Puede tardar un par de minutos. Podés cerrar esta ventana: igual se acredita
              cuando llegue tu pago.
            </p>
            <div className="mt-5 flex items-center gap-2 text-sm text-foreground/60">
              <ShieldCheck className="size-4 text-cobalt dark:text-[#7FB3FF]" />
              Verificación segura en curso…
            </div>
            <Button
              type="button"
              variant="outline"
              className="mt-5 h-11 w-full rounded-lg border-line bg-transparent text-foreground hover:border-foreground/30"
              onClick={onClose}
            >
              Cerrar (se acredita igual)
            </Button>
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
              {esLicencia
                ? "Tu licencia quedó activa. Actívala en tu PC desde Ari-Tool y procesás sin gastar créditos."
                : "Se acreditaron tus créditos. Ya podés usarlos."}
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
            <span
              className="flex size-14 items-center justify-center rounded-full text-white"
              style={{ backgroundColor: YAPE }}
            >
              <X className="size-7" />
            </span>
            <h3 className="mt-4 text-lg font-semibold tracking-tight text-foreground">
              El pago venció
            </h3>
            <p className="mt-2 text-sm text-foreground/65">
              No pasa nada: si ya pagaste con el monto correcto, ingresá tu código en un cobro
              nuevo del mismo monto y se acreditará. Si no, generá uno nuevo.
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
                  setCodigo("")
                  setAviso(null)
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
