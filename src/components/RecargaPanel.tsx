import { useCallback, useEffect, useRef, useState } from "react"
import QRCode from "qrcode"
import { AlertTriangle, Check, Copy, Loader2, Maximize2, ShieldCheck, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  cobroActivo,
  cobroCancelar,
  pagoCobroCrear,
  pagoCobroEstado,
  yapeConfirmar,
  yapeCrear,
  yapeEstado,
  type CobroActivo,
  type CobroCreado,
  type YapeCobro,
} from "@/lib/cuenta"

// Un ÚNICO flujo de recarga, INLINE (no modal), híbrido Binance/Yape, resumible y con
// un solo pago activo a la vez. Vive integrado en el panel, debajo del saldo.

type Metodo = "binance" | "yape"
type Producto = "credito" | "licencia"
type Fase = "cargando" | "elegir" | "pagar" | "validando" | "listo" | "vencido"

const PAQUETES = [1, 5, 10, 20, 50]
const YAPE_VIOLETA = "#742384"

// Ícono de marca (Yape/Binance) en chip blanco: contraste asegurado en cualquier fondo/tema.
// Es un <img> DIRECTO con tamaño explícito (evita el bug de imágenes que colapsan a 0 en flexbox).
function MarcaBadge({ metodo, className = "size-7" }: { metodo: Metodo; className?: string }) {
  return (
    <img
      src={metodo === "yape" ? "/brand/yape.webp" : "/brand/binance.webp"}
      alt={metodo === "yape" ? "Yape" : "Binance"}
      width={28}
      height={28}
      className={`inline-block shrink-0 rounded-md bg-white object-contain p-0.5 shadow-sm ${className}`}
    />
  )
}

// Forma normalizada del cobro en curso, sirva de crear (Binance/Yape) o de retomar.
type CobroVivo = {
  cobro_id: string
  metodo: Metodo
  producto: Producto
  creditos: number
  monto: string // "3.50"
  moneda: string // "PEN" | "USD" | "USDT"
  codigo: string // Binance: ARI-XXXX (va en la nota). Yape: referencia interna (no se muestra).
  destino: string
  pago_url: string
  vence_en: string
}

function montoLabel(c: CobroVivo): string {
  return c.metodo === "yape" ? `S/ ${c.monto}` : `${c.monto} USDT`
}

// Ícono oficial de WhatsApp (inline SVG) para el botón de soporte.
function IconoWhatsapp({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}

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

export function RecargaPanel({
  jwt,
  abrir,
  productoInicial = "credito",
  parametros,
  onConfirmado,
  onCerrar,
  onActivoChange,
}: {
  jwt: string
  abrir: boolean
  productoInicial?: Producto
  parametros?: Record<string, string>
  onConfirmado: () => void
  onCerrar: () => void
  onActivoChange?: (hayActivo: boolean) => void
}) {
  const [fase, setFase] = useState<Fase>("cargando")
  const [metodo, setMetodo] = useState<Metodo>("binance")
  const [producto, setProducto] = useState<Producto>(productoInicial)
  const [validandoTipo, setValidandoTipo] = useState<"esperando" | "error" | "bloqueado">("esperando")
  const [creditos, setCreditos] = useState(1)
  const [cobro, setCobro] = useState<CobroVivo | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [restante, setRestante] = useState(0)
  const [codigo, setCodigo] = useState("")
  const [creando, setCreando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [cancelando, setCancelando] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [intentosRestantes, setIntentosRestantes] = useState<number | null>(null)
  const [bloqueado, setBloqueado] = useState(false)
  const [qrZoom, setQrZoom] = useState<string | null>(null)
  const [demorado, setDemorado] = useState(false)
  const cobroRef = useRef<string | null>(null)
  const listoAvisado = useRef(false)
  const resumido = useRef(false)

  // Precios desde parámetros de negocio (con fallback), para que el preview no mienta.
  const precioCredYape = Number(parametros?.yape_precio_credito_pen ?? 3.5) || 3.5
  const precioCredBin = Number(parametros?.precio_credito_usd ?? 1) || 1
  const precioLicYape = Number(parametros?.yape_precio_licencia_pen ?? 157.5) || 157.5
  const precioCred = metodo === "yape" ? precioCredYape : precioCredBin
  const simbolo = metodo === "yape" ? "S/ " : ""
  const sufijo = metodo === "yape" ? "" : " USDT"
  const wsp = parametros?.soporte_whatsapp ?? ""

  async function armarQr(url: string) {
    try {
      setQr(await QRCode.toDataURL(url, { margin: 1, width: 320 }))
    } catch {
      setQr(null)
    }
  }

  // Retoma un cobro en curso (de crear o de cobro_activo).
  const aplicarCobro = useCallback((c: CobroVivo, codigoDeclarado?: string | null) => {
    setCobro(c)
    cobroRef.current = c.cobro_id
    setErr(null)
    setAviso(null)
    setIntentosRestantes(null)
    setBloqueado(false)
    setValidandoTipo("esperando")
    setDemorado(false)
    listoAvisado.current = false
    setQr(null)
    if (c.metodo === "binance" && c.pago_url) void armarQr(c.pago_url)
    if (c.metodo === "yape" && codigoDeclarado) {
      setCodigo(codigoDeclarado)
      setFase("validando")
    } else {
      setCodigo("")
      setFase("pagar")
    }
  }, [])

  const activoADef = (a: CobroActivo): CobroVivo => ({
    cobro_id: a.cobro_id,
    metodo: a.metodo,
    producto: a.producto,
    creditos: a.creditos,
    monto: a.monto,
    moneda: a.moneda === "PEN" ? "PEN" : "USDT",
    codigo: a.codigo,
    destino: a.destino,
    pago_url: a.pago_url,
    vence_en: a.vence_en,
  })

  const cargarActivo = useCallback(async () => {
    try {
      const r = await cobroActivo(jwt)
      if (r.ok && r.data?.activo) {
        const a = r.data.activo
        setMetodo(a.metodo)
        setProducto(a.producto)
        aplicarCobro(activoADef(a), a.codigo_declarado)
        return true
      }
    } catch {
      /* sin conexión: caemos al selector */
    }
    setCobro(null)
    cobroRef.current = null
    setFase("elegir")
    return false
  }, [jwt, aplicarCobro])

  // Al montar (una sola vez): ¿hay un pago en curso? → retomarlo. Si no, el selector.
  // El ref evita re-ejecutar el resume si cambia el jwt (y pisar lo que el cliente tipeó).
  useEffect(() => {
    if (resumido.current) return
    resumido.current = true
    void cargarActivo()
  }, [cargarActivo])

  // Avisar al dashboard si hay un pago EN CURSO (pagar/validando) — no en listo/vencido.
  useEffect(() => {
    onActivoChange?.(fase === "pagar" || fase === "validando")
  }, [fase, onActivoChange])

  // El dashboard puede abrir el panel pidiendo un producto puntual (créditos/licencia),
  // pero NO debe pisar el producto de un pago ya en curso.
  useEffect(() => {
    if (cobro) return
    setProducto(productoInicial)
  }, [productoInicial, cobro])

  // Cerrar el QR ampliado con Escape.
  useEffect(() => {
    if (!qrZoom) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setQrZoom(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [qrZoom])

  // Cuenta regresiva.
  useEffect(() => {
    if ((fase !== "pagar" && fase !== "validando") || !cobro?.vence_en) return
    const fin = new Date(cobro.vence_en).getTime()
    const tick = () => {
      const seg = Math.max(0, Math.round((fin - Date.now()) / 1000))
      setRestante(seg)
      if (seg <= 0) setFase("vencido")
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [fase, cobro?.vence_en])

  const marcarListo = useCallback(() => {
    setFase("listo")
    if (!listoAvisado.current) {
      listoAvisado.current = true
      onConfirmado()
    }
  }, [onConfirmado])

  // Sondeo del estado (por si se casa por otra vía). Sirve para ambos métodos.
  const sondear = useCallback(async () => {
    const id = cobroRef.current
    const m = cobro?.metodo
    if (!id || !m) return false
    try {
      if (m === "binance") {
        const r = await pagoCobroEstado(jwt, id)
        if (r.ok && r.data?.pagado) { marcarListo(); return true }
        if (r.ok && (r.data?.estado === "caducado" || r.data?.estado === "anulado")) { setFase("vencido"); return true }
      } else {
        const r = await yapeEstado(jwt, id)
        if (r.ok && r.data?.estado === "confirmado") { marcarListo(); return true }
        if (r.ok && (r.data?.estado === "caducado" || r.data?.estado === "anulado")) { setFase("vencido"); return true }
      }
    } catch {
      /* reintenta en el próximo tick */
    }
    return false
  }, [jwt, cobro?.metodo, marcarListo])

  useEffect(() => {
    if (fase !== "pagar" && fase !== "validando") return
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
  }, [fase, sondear])

  // Si "validando" pasa de 2 min sin acreditar: algo salió mal (Yape no mostró la notif
  // o el código está equivocado). Avisamos que revise el código y ofrecemos soporte.
  useEffect(() => {
    if (fase !== "validando") {
      setDemorado(false)
      return
    }
    const t = setTimeout(() => setDemorado(true), 120000) // 2 min sin acreditar -> ofrecer soporte
    return () => clearTimeout(t)
  }, [fase])

  async function generar() {
    if (creando) return
    setErr(null)
    const c = Math.trunc(creditos)
    if (producto === "credito" && !(c >= 1 && c <= 5000)) {
      setErr("Elegí una cantidad válida (1 a 5000).")
      return
    }
    setCreando(true)
    try {
      const cred = producto === "credito" ? c : 0
      if (metodo === "yape") {
        const r = await yapeCrear(jwt, cred, producto)
        if (r.status === 409 || r.data?.error === "cobro_en_curso") { await cargarActivo(); return }
        if (r.status === 503 || r.data?.error === "yape_inactivo") {
          setErr("El pago con Yape no está disponible ahora. Probá con Binance Pay.")
          return
        }
        if (!r.ok || !r.data || r.data.error || !r.data.cobro_id) {
          setErr("No se pudo generar el pago. Probá de nuevo en un momento.")
          return
        }
        const d = r.data as YapeCobro
        aplicarCobro({
          cobro_id: d.cobro_id, metodo: "yape", producto, creditos: cred,
          monto: d.monto, moneda: "PEN", codigo: d.codigo, destino: d.destino ?? "",
          pago_url: "", vence_en: d.vence_en,
        })
      } else {
        const r = await pagoCobroCrear(jwt, cred, producto)
        if (r.status === 409 || r.data?.error === "cobro_en_curso") { await cargarActivo(); return }
        if (!r.ok || !r.data || r.data.error || !r.data.cobro_id) {
          setErr("No se pudo generar el pago. Probá de nuevo en un momento.")
          return
        }
        const d = r.data as CobroCreado
        aplicarCobro({
          cobro_id: d.cobro_id, metodo: "binance", producto, creditos: cred,
          monto: d.monto, moneda: "USDT", codigo: d.codigo, destino: d.destino ?? "",
          pago_url: d.pago_url ?? "", vence_en: d.vence_en,
        })
      }
    } catch {
      setErr("No se pudo conectar. Revisá tu internet e intentá otra vez.")
    } finally {
      setCreando(false)
    }
  }

  // Yape: el cliente ingresa su código de seguridad. El backend cruza el pago.
  async function confirmar() {
    const id = cobroRef.current
    if (!id || confirmando) return
    const cod = codigo.replace(/[^0-9]/g, "")
    if (cod.length < 3) {
      setAviso("Ingresá el código de seguridad de 3 dígitos de tu comprobante Yape.")
      return
    }
    setConfirmando(true)
    setAviso(null)
    setValidandoTipo("esperando")
    try {
      const r = await yapeConfirmar(jwt, id, cod)
      const d = r.data
      if (typeof d?.intentos_restantes === "number") setIntentosRestantes(d.intentos_restantes)
      if (r.ok && d && (d.casado || d.ya)) {
        marcarListo()
        return
      }
      if (d?.motivo === "codigo_invalido") {
        setAviso("El código debe tener 3 dígitos (aparece en tu comprobante Yape).")
        return
      }
      if (d?.motivo === "codigo_incorrecto") {
        const q = typeof d.intentos_restantes === "number" ? d.intentos_restantes : 0
        setValidandoTipo("error")
        setAviso(
          q > 0
            ? `Ese código no coincide con tu pago. Revisá los 3 dígitos de tu comprobante y probá de nuevo (te ${
                q === 1 ? "queda 1 intento" : `quedan ${q} intentos`
              }).`
            : "Ese código no coincide con tu pago. Es tu último intento: revisá bien tu comprobante antes de reenviar."
        )
        setFase("validando")
        return
      }
      if (d?.motivo === "bloqueado") {
        const min = typeof d.minutos === "number" ? d.minutos : 15
        setBloqueado(true)
        setValidandoTipo("bloqueado")
        setAviso(
          `Demasiados códigos incorrectos. Por seguridad pausamos los intentos ${min} min. Escribinos a soporte con tu comprobante y lo acreditamos a mano.`
        )
        setFase("validando")
        return
      }
      if (d?.motivo === "bloqueo_temporal") {
        const min = typeof d.minutos === "number" ? d.minutos : 60
        setValidandoTipo("bloqueado")
        setAviso(`Por seguridad pausamos los intentos ${min} min. Si ya pagaste, tranquilo: apenas llegue tu Yape se acredita solo.`)
        setFase("validando")
        return
      }
      // Código declarado; el server casa cuando llegue el pago. Pasa a "validando".
      if (r.ok && d) {
        setValidandoTipo("esperando")
        setFase("validando")
        return
      }
      setAviso("No se pudo registrar el código. Revisá tu internet e intentá otra vez.")
    } catch {
      setAviso("No se pudo conectar. Revisá tu internet e intentá otra vez.")
    } finally {
      setConfirmando(false)
    }
  }

  async function cancelar() {
    const id = cobroRef.current
    if (!id || cancelando) return
    setCancelando(true)
    setAviso(null)
    try {
      const r = await cobroCancelar(jwt, id)
      if (r.ok && (r.data?.cancelado || r.data?.ya)) {
        volverAElegir()
      } else if (r.data?.motivo === "en_revision") {
        setAviso("Tu pago está en verificación. No se puede cancelar ahora: se resuelve solo o escribinos a soporte.")
      } else {
        setAviso("No se pudo cancelar. Reintentá en un momento.")
      }
    } catch {
      setAviso("No se pudo cancelar. Revisá tu internet e intentá otra vez.")
    } finally {
      setCancelando(false)
    }
  }

  function volverAElegir() {
    setCobro(null)
    cobroRef.current = null
    setQr(null)
    setCodigo("")
    setErr(null)
    setAviso(null)
    setIntentosRestantes(null)
    setBloqueado(false)
    setDemorado(false)
    listoAvisado.current = false
    setFase("elegir")
  }

  function cerrar() {
    volverAElegir()
    onCerrar()
  }

  // Producto vigente: si hay un pago en curso, manda el del cobro (no el selector).
  const prodVigente: Producto = cobro ? cobro.producto : producto
  const esLicencia = prodVigente === "licencia"
  const totalNum = esLicencia ? (metodo === "yape" ? precioLicYape : 45) : (creditos || 0) * precioCred
  const totalTexto = `${simbolo}${totalNum.toFixed(2)}${sufijo}`
  const mmss = `${String(Math.floor(restante / 60)).padStart(2, "0")}:${String(restante % 60).padStart(2, "0")}`

  // Visibilidad: si hay pago en curso o el usuario abrió el selector o hay resultado.
  const visible = fase === "cargando" ? abrir : Boolean(cobro) || abrir || fase === "listo" || fase === "vencido"
  if (!visible) return null

  const enCurso = fase === "pagar" || fase === "validando"
  const titulo =
    fase === "listo"
      ? "¡Pago confirmado!"
      : fase === "vencido"
        ? "El pago venció"
        : esLicencia
          ? "Comprá tu licencia anual"
          : "Recargá tu cuenta"

  return (
    <div
      id="recarga-panel"
      className="scroll-mt-24 rounded-2xl border border-line bg-card p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {cobro ? (
            <MarcaBadge metodo={cobro.metodo} className="size-8" />
          ) : (
            <span className="flex size-8 items-center justify-center rounded-lg border border-cobalt/25 bg-cobalt/10 text-cobalt dark:border-[#2C4A78] dark:bg-[#0E1B30] dark:text-[#7FB3FF]">
              <span aria-hidden="true" className="text-base leading-none">◆</span>
            </span>
          )}
          <h2 className="text-base font-semibold tracking-tight text-foreground">{titulo}</h2>
        </div>
        {enCurso ? (
          <Button
            type="button"
            variant="outline"
            className="h-9 rounded-lg border-line bg-transparent px-3 text-sm text-foreground/70 hover:border-[#B42318]/40 hover:text-[#B42318] dark:hover:text-[#F0A49D]"
            disabled={cancelando}
            onClick={cancelar}
          >
            {cancelando ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
            Cancelar pago
          </Button>
        ) : (
          <button
            type="button"
            onClick={cerrar}
            aria-label="Cerrar"
            className="flex size-8 items-center justify-center rounded-lg border border-line text-foreground/50 transition-colors hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {fase === "cargando" ? (
        <div className="flex items-center gap-2 py-8 text-sm text-foreground/60">
          <Loader2 className="size-4 animate-spin" /> Cargando…
        </div>
      ) : null}

      {/* ─────────── ELEGIR (selector híbrido) ─────────── */}
      {fase === "elegir" ? (
        <div className="mt-5">
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Producto */}
            <div>
              <p className="text-xs font-medium tracking-[0.14em] text-foreground/45 uppercase">Producto</p>
              <div className="mt-2 flex gap-2">
                {(["credito", "licencia"] as Producto[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={producto === p}
                    onClick={() => setProducto(p)}
                    className={`h-10 flex-1 rounded-lg border px-3 text-sm font-medium transition-colors ${
                      producto === p ? "border-cobalt bg-cobalt text-white" : "border-line bg-field text-foreground/70 hover:border-cobalt/40"
                    }`}
                  >
                    {p === "credito" ? "Créditos" : "Licencia anual"}
                  </button>
                ))}
              </div>
            </div>
            {/* Método */}
            <div>
              <p className="text-xs font-medium tracking-[0.14em] text-foreground/45 uppercase">Método de pago</p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  aria-pressed={metodo === "binance"}
                  onClick={() => setMetodo("binance")}
                  className={`flex h-12 flex-1 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors ${
                    metodo === "binance" ? "border-cobalt bg-cobalt text-white" : "border-line bg-field text-foreground/70 hover:border-cobalt/40"
                  }`}
                >
                  <MarcaBadge metodo="binance" className="size-6" />
                  Binance
                </button>
                <button
                  type="button"
                  aria-pressed={metodo === "yape"}
                  onClick={() => setMetodo("yape")}
                  className="flex h-12 flex-1 items-center justify-center gap-2 rounded-lg border border-line bg-field px-3 text-sm font-medium text-foreground/70 transition-colors hover:border-cobalt/40"
                  style={
                    metodo === "yape"
                      ? { backgroundColor: YAPE_VIOLETA, borderColor: YAPE_VIOLETA, color: "#fff" }
                      : undefined
                  }
                >
                  <MarcaBadge metodo="yape" className="size-6" />
                  Yape (S/)
                </button>
              </div>
            </div>
          </div>

          {esLicencia ? (
            <div className="mt-4 rounded-xl border border-cobalt/40 bg-cobalt/[0.06] p-4 dark:bg-[#0E1B30]">
              <p className="text-xs font-medium tracking-[0.14em] text-cobalt uppercase dark:text-[#7FB3FF]">Licencia anual</p>
              <p className="mt-1 text-3xl font-semibold tracking-tight text-foreground">
                {totalTexto} <span className="text-sm font-medium text-foreground/55">/ 1 año</span>
              </p>
              <ul className="mt-3 space-y-1.5 text-sm text-foreground/70">
                <li>· Procesos ilimitados en 1 PC durante 1 año.</li>
                <li>· Se ata a tu cuenta y a la PC donde la actives.</li>
                <li>· Si ya tenés licencia vigente, se extiende +1 año.</li>
              </ul>
            </div>
          ) : (
            <div className="mt-4">
              <label htmlFor="recarga-creditos" className="block text-xs font-medium tracking-[0.14em] text-foreground/45 uppercase">
                ¿Cuántos créditos?
              </label>
              <div className="mt-2 flex flex-wrap gap-2">
                {PAQUETES.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setCreditos(p)}
                    className={`h-10 min-w-14 rounded-lg border px-3 text-sm font-medium transition-colors ${
                      creditos === p ? "border-cobalt bg-cobalt text-white" : "border-line bg-field text-foreground/70 hover:border-cobalt/40"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <input
                id="recarga-creditos"
                type="number"
                min={1}
                max={5000}
                value={creditos}
                onChange={(e) => setCreditos(Number(e.target.value))}
                className="mt-3 h-11 w-full rounded-lg border border-line bg-field px-3 text-sm text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              />
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-foreground/60">
              Total a pagar: <span className="font-semibold text-foreground tabular-nums">{totalTexto}</span>
            </p>
            <Button type="button" className="h-11 rounded-lg px-6 font-medium" disabled={creando} onClick={generar}>
              {creando ? <Loader2 className="size-4 animate-spin" /> : null}
              {creando ? "Generando…" : "Generar pago"}
            </Button>
          </div>
          {err ? <p className="mt-3 text-sm font-medium text-[#B42318] dark:text-[#F0A49D]">{err}</p> : null}
        </div>
      ) : null}

      {/* ─────────── PAGAR ─────────── */}
      {fase === "pagar" && cobro ? (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {/* Columna izquierda: monto + código/destino + QR */}
          <div className="space-y-3">
            <div className="rounded-xl border border-line bg-field p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium tracking-[0.14em] text-foreground/45 uppercase">Monto exacto</p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground tabular-nums">{montoLabel(cobro)}</p>
                </div>
                <Copiable texto={cobro.monto} etiqueta="monto" />
              </div>
              <p className="mt-1 text-xs text-foreground/50">Tiene que ser exacto, sin cambiar los centavos.</p>
            </div>

            {cobro.metodo === "binance" ? (
              <div className="rounded-xl border border-cobalt/40 bg-cobalt/[0.06] p-4 dark:bg-[#0E1B30]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium tracking-[0.14em] text-cobalt uppercase dark:text-[#7FB3FF]">
                      Código para la NOTA (obligatorio)
                    </p>
                    <p className="mt-1 font-mono text-xl font-semibold tracking-wide text-foreground">{cobro.codigo}</p>
                  </div>
                  <Copiable texto={cobro.codigo} etiqueta="código" />
                </div>
                <p className="mt-1 text-xs text-foreground/55">
                  Pegá este código en la <strong>nota/mensaje</strong> del pago. Sin él no reconocemos tu recarga.
                </p>
              </div>
            ) : null}

            {cobro.metodo === "binance" && qr ? (
              <button
                type="button"
                onClick={() => setQrZoom(qr)}
                aria-label="Ampliar el QR de Binance Pay"
                className="flex w-full flex-col items-center rounded-xl border border-line bg-white p-4 transition-shadow hover:shadow-md"
              >
                <img src={qr} alt="QR de Binance Pay" className="size-40" />
                <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-[#26354F]/80">
                  <Maximize2 className="size-3.5" /> Tocá para ampliar{cobro.destino ? ` · pagás a ${cobro.destino}` : ""}
                </p>
              </button>
            ) : cobro.metodo === "yape" ? (
              <button
                type="button"
                onClick={() => setQrZoom("/yape-qr.png")}
                aria-label="Ampliar el QR de Yape"
                className="flex w-full flex-col items-center rounded-xl border border-line bg-white p-4 transition-shadow hover:shadow-md"
              >
                <img src="/yape-qr.png" alt="QR de Yape de Ariad" loading="lazy" className="w-40 max-w-full rounded-lg" />
                <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-[#26354F]/80">
                  <Maximize2 className="size-3.5" /> Tocá para ampliar y escanealo con tu Yape
                </p>
              </button>
            ) : null}

            {cobro.destino ? (
              <div className="rounded-xl border border-line bg-field p-4">
                <div className="flex items-center gap-3">
                  <MarcaBadge metodo={cobro.metodo} className="size-9" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium tracking-[0.14em] text-foreground/45 uppercase">
                      {cobro.metodo === "yape" ? "Yapear a" : "Pagar a (Binance Pay)"}
                    </p>
                    <p className="mt-1 truncate text-sm font-medium text-foreground">{cobro.destino}</p>
                  </div>
                  <Copiable texto={cobro.destino} etiqueta="destino" />
                </div>
              </div>
            ) : null}
          </div>

          {/* Columna derecha: pasos + estado / código de seguridad (Yape) */}
          <div className="space-y-3">
            <ol className="space-y-2 text-sm text-foreground/70">
              {(cobro.metodo === "yape"
                ? [
                    "Abrí tu app de Yape → Yapear / Enviar.",
                    cobro.destino ? `Yapeá a ${cobro.destino}.` : "Yapeá al número de Ariad.",
                    `Poné el monto EXACTO: ${montoLabel(cobro)}.`,
                    "Confirmá el pago en Yape.",
                    "Copiá el CÓDIGO DE SEGURIDAD de 3 dígitos de tu comprobante e ingresalo abajo.",
                  ]
                : [
                    "Abrí Binance → Pay → Enviar / Transferir.",
                    cobro.destino ? "Elegí la cuenta de Ariad o escaneá el QR." : "Enviá a la cuenta de Ariad de Binance Pay.",
                    `Poné el monto EXACTO: ${montoLabel(cobro)}.`,
                    `Pegá el código ${cobro.codigo} en la nota.`,
                    "Confirmá. Los créditos aparecen solos en unos segundos.",
                  ]
              ).map((t, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border border-line bg-field text-[11px] font-semibold text-foreground/60">
                    {i + 1}
                  </span>
                  <span>{t}</span>
                </li>
              ))}
            </ol>

            {cobro.metodo === "yape" ? (
              <div className="rounded-xl border border-cobalt/40 bg-cobalt/[0.06] p-4 dark:bg-[#0E1B30]">
                <label className="block text-xs font-medium tracking-[0.14em] text-cobalt uppercase dark:text-[#7FB3FF]">
                  Código de seguridad (de tu comprobante)
                </label>
                <div className="mt-2 flex gap-2">
                  <input
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={3}
                    aria-label="Código de seguridad de 3 dígitos"
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value.replace(/[^0-9]/g, ""))}
                    placeholder="Ej: 132"
                    className="h-11 w-full rounded-lg border border-line bg-field px-3 text-center font-mono text-lg tracking-[0.3em] text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  />
                  <Button type="button" className="h-11 shrink-0 rounded-lg px-5 font-medium" disabled={confirmando} onClick={confirmar}>
                    {confirmando ? <Loader2 className="size-4 animate-spin" /> : null}
                    {confirmando ? "Verificando…" : "Confirmar"}
                  </Button>
                </div>
                <p className="mt-2 text-xs text-foreground/55">Sin el código correcto no podemos acreditar tu pago.</p>
                {aviso ? <p className="mt-2 text-sm font-medium text-[#B42318] dark:text-[#F0A49D]">{aviso}</p> : null}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-field px-4 py-3">
                  <span className="flex items-center gap-2 text-sm text-foreground/70">
                    <Loader2 className="size-4 animate-spin text-cobalt dark:text-[#7FB3FF]" />
                    Esperando tu pago…
                  </span>
                </div>
                {aviso ? <p className="text-sm font-medium text-[#B42318] dark:text-[#F0A49D]">{aviso}</p> : null}
              </div>
            )}

            <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-field px-4 py-3">
              <span className="flex items-center gap-2 text-sm text-foreground/70">
                <ShieldCheck className="size-4 text-cobalt dark:text-[#7FB3FF]" />
                Detección automática y segura.
              </span>
              <span className="text-sm font-medium text-foreground/60 tabular-nums">vence en {mmss}</span>
            </div>
          </div>
        </div>
      ) : null}

      {/* ─────────── VALIDANDO (Yape) ─────────── */}
      {fase === "validando" && cobro ? (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="flex flex-col items-center justify-center text-center">
            {demorado ? (
              <>
                <span className="flex size-14 items-center justify-center rounded-full border border-[#5A4A20] bg-[#2E2513] text-[#F0C97D]">
                  <AlertTriangle className="size-7" />
                </span>
                <h3 className="mt-4 text-lg font-semibold tracking-tight text-foreground">Está tardando más de lo normal</h3>
                <p className="mt-2 text-sm leading-relaxed text-foreground/65">
                  Puede que Yape no haya mostrado la notificación, o que el código de seguridad esté equivocado.
                  Revisá los 3 dígitos de tu comprobante y corregilo acá. Si tu código es el correcto, escribinos a
                  soporte y lo resolvemos.
                </p>
              </>
            ) : validandoTipo === "esperando" ? (
              <>
                <span className="flex size-14 items-center justify-center rounded-full border border-cobalt/40 bg-cobalt/[0.06] text-cobalt dark:text-[#7FB3FF]">
                  <Loader2 className="size-7 animate-spin" />
                </span>
                <h3 className="mt-4 text-lg font-semibold tracking-tight text-foreground">Validando tu pago…</h3>
                <p className="mt-2 text-sm leading-relaxed text-foreground/65">
                  Apenas confirmemos tu Yape se acredita <span className="font-semibold text-foreground">solo</span>.
                  Puede tardar un par de minutos — podés cerrar, igual se acredita cuando llegue tu pago.
                </p>
              </>
            ) : validandoTipo === "bloqueado" ? (
              <>
                <span className="flex size-14 items-center justify-center rounded-full border border-[#5A2620] bg-[#2E1513] text-[#F0A49D]">
                  <AlertTriangle className="size-7" />
                </span>
                <h3 className="mt-4 text-lg font-semibold tracking-tight text-foreground">Intentos pausados</h3>
                <p className="mt-2 text-sm leading-relaxed text-foreground/65">
                  Probaste con varios códigos. Por seguridad pausamos los intentos un rato. Si ya pagaste,
                  escribinos a soporte y lo acreditamos a mano.
                </p>
              </>
            ) : (
              <>
                <span className="flex size-14 items-center justify-center rounded-full border border-[#5A4A20] bg-[#2E2513] text-[#F0C97D]">
                  <AlertTriangle className="size-7" />
                </span>
                <h3 className="mt-4 text-lg font-semibold tracking-tight text-foreground">Revisá tu código</h3>
                <p className="mt-2 text-sm leading-relaxed text-foreground/65">
                  Ese código no coincide con tu pago. Corregí los 3 dígitos de tu comprobante Yape acá abajo.
                </p>
              </>
            )}
          </div>

          <div className="rounded-xl border border-cobalt/40 bg-cobalt/[0.06] p-4 dark:bg-[#0E1B30]">
            <p className="text-xs font-medium tracking-[0.14em] text-cobalt uppercase dark:text-[#7FB3FF]">
              Código que ingresaste
            </p>
            <p className="mt-1 text-center font-mono text-3xl font-semibold tracking-[0.3em] text-foreground tabular-nums">
              {codigo || "—"}
            </p>
            {!bloqueado ? (
              <>
                <p className="mt-2 text-xs text-foreground/60">
                  ¿Te equivocaste? Revisá los 3 dígitos de tu comprobante Yape y corregilo acá.{" "}
                  {intentosRestantes != null
                    ? `Te ${intentosRestantes === 1 ? "queda 1 intento" : `quedan ${intentosRestantes} intentos`}.`
                    : "Tenés hasta 3 intentos."}
                </p>
                <div className="mt-2 flex gap-2">
                  <input
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={3}
                    aria-label="Código de seguridad de 3 dígitos"
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value.replace(/[^0-9]/g, ""))}
                    placeholder="Ej: 132"
                    className="h-11 w-full rounded-lg border border-line bg-field px-3 text-center font-mono text-lg tracking-[0.3em] text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  />
                  <Button type="button" className="h-11 shrink-0 rounded-lg px-5 font-medium" disabled={confirmando} onClick={confirmar}>
                    {confirmando ? <Loader2 className="size-4 animate-spin" /> : null}
                    {confirmando ? "Verificando…" : "Corregir"}
                  </Button>
                </div>
              </>
            ) : null}
            {aviso ? <p className="mt-2 text-sm font-medium text-[#B42318] dark:text-[#F0A49D]">{aviso}</p> : null}
            {(demorado || bloqueado) && wsp ? (
              <a
                href={wsp}
                target="_blank"
                rel="noreferrer"
                className="mt-3 flex items-center justify-center gap-2 rounded-lg bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
              >
                <IconoWhatsapp className="size-5" /> Escribir a soporte
              </a>
            ) : null}
            <p className="mt-3 text-xs text-foreground/45 tabular-nums">vence en {mmss}</p>
          </div>
        </div>
      ) : null}

      {/* ─────────── LISTO ─────────── */}
      {fase === "listo" ? (
        <div className="mt-6 flex flex-col items-center text-center">
          <span className="flex size-14 items-center justify-center rounded-full border border-[#1C5A44] bg-[#0F2E24] text-[#7CE6B4]">
            <Check className="size-7" />
          </span>
          <h3 className="mt-4 text-lg font-semibold tracking-tight text-foreground">¡Pago confirmado!</h3>
          <p className="mt-2 text-sm text-foreground/65">
            {esLicencia
              ? "Tu licencia quedó activa. Actívala en tu PC desde Ari-Tool y procesás sin gastar créditos."
              : "Se acreditaron tus créditos. Ya podés usarlos."}
          </p>
          <div className="mt-5 flex w-full max-w-sm gap-2">
            <Button type="button" variant="outline" className="h-11 flex-1 rounded-lg border-line bg-transparent text-foreground hover:border-foreground/30" onClick={cerrar}>
              Listo
            </Button>
            <Button type="button" className="h-11 flex-1 rounded-lg font-medium" onClick={volverAElegir}>
              Recargar de nuevo
            </Button>
          </div>
        </div>
      ) : null}

      {/* ─────────── VENCIDO ─────────── */}
      {fase === "vencido" ? (
        <div className="mt-6 flex flex-col items-center text-center">
          <span className="flex size-14 items-center justify-center rounded-full border border-[#5A4A20] bg-[#2E2513] text-[#F0C97D]">
            <X className="size-7" />
          </span>
          <h3 className="mt-4 text-lg font-semibold tracking-tight text-foreground">El pago venció</h3>
          <p className="mt-2 text-sm text-foreground/65">
            No pasa nada: si ya pagaste con el monto y el código correctos, se acreditará igual y lo verás en tus
            movimientos. Si no, generá uno nuevo.
          </p>
          <div className="mt-5 flex w-full max-w-sm gap-2">
            <Button type="button" variant="outline" className="h-11 flex-1 rounded-lg border-line bg-transparent text-foreground hover:border-foreground/30" onClick={cerrar}>
              Cerrar
            </Button>
            <Button type="button" className="h-11 flex-1 rounded-lg font-medium" onClick={volverAElegir}>
              Generar otro
            </Button>
          </div>
        </div>
      ) : null}

      {/* QR AMPLIADO (lightbox) */}
      {qrZoom ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="QR ampliado"
          onClick={() => setQrZoom(null)}
        >
          <div className="relative flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
            <div className="rounded-2xl bg-white p-5 shadow-2xl">
              <img src={qrZoom} alt="Código QR para pagar" className="size-72 max-w-[78vw] object-contain" />
            </div>
            {cobro ? (
              <p className="text-center text-sm font-medium text-white">
                {montoLabel(cobro)} · {cobro.metodo === "yape" ? "Escaneá con tu app de Yape" : "Escaneá con Binance"}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => setQrZoom(null)}
              className="flex items-center gap-1.5 rounded-lg border border-white/30 bg-white/10 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20"
            >
              <X className="size-4" /> Cerrar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
