import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertTriangle, Check, Loader2, Upload, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  recargaComprobanteCrear,
  recargaInstrucciones,
  recargaPaises,
  recargaPrecio,
  subirComprobanteRecarga,
  type RecargaCreada,
  type RecargaMetodo,
  type RecargaPais,
  type RecargaPrecio,
} from "@/lib/cuenta"

const PAISES_FALLBACK: RecargaPais[] = [
  { pais: "pe", moneda: "PEN", tasa: 3.55 },
  { pais: "co", moneda: "COP", tasa: 1 },
  { pais: "cl", moneda: "CLP", tasa: 1 },
  { pais: "mx", moneda: "MXN", tasa: 1 },
  { pais: "ar", moneda: "ARS", tasa: 1 },
  { pais: "ec", moneda: "USD", tasa: 1 },
  { pais: "ww", moneda: "USD", tasa: 1 },
]

function etiquetaPais(p: string) {
  return p === "ww" ? "Global" : p.toUpperCase()
}

function money(moneda: string | undefined, monto: number | undefined) {
  if (monto == null || !Number.isFinite(monto)) return "—"
  return `${moneda ?? ""} ${monto.toFixed(2)}`.trim()
}

export function RecargaManualPanel({
  jwt,
  abrir,
  parametros,
  onConfirmado,
  onCerrar,
}: {
  jwt: string
  abrir: boolean
  parametros?: Record<string, string>
  onConfirmado: () => void
  onCerrar: () => void
}) {
  const minimo = Math.max(10, Number(parametros?.recarga_minimo_usd ?? 10) || 10)
  const packs = useMemo(() => {
    const raw = (parametros?.recarga_paquetes_usd ?? "10,20,50")
      .split(",")
      .map((x) => Number(x.trim()))
      .filter((n) => Number.isFinite(n) && n >= minimo)
    return raw.length ? Array.from(new Set(raw)).sort((a, b) => a - b) : [10, 20, 50]
  }, [parametros?.recarga_paquetes_usd, minimo])

  const [paises, setPaises] = useState<RecargaPais[]>(PAISES_FALLBACK)
  const [pais, setPais] = useState((parametros?.pais ?? "pe").toLowerCase())
  const [creditos, setCreditos] = useState(packs[0] ?? 10)
  const [otro, setOtro] = useState(false)
  const [otroValor, setOtroValor] = useState("")
  const [precio, setPrecio] = useState<RecargaPrecio | null>(null)
  const [metodos, setMetodos] = useState<RecargaMetodo[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [creada, setCreada] = useState<RecargaCreada | null>(null)
  const [error, setError] = useState<string | null>(null)

  const creditosElegidos = otro ? Number(otroValor) : creditos
  const montoValido = Number.isFinite(creditosElegidos) && creditosElegidos >= minimo

  useEffect(() => {
    if (!abrir) return
    let vivo = true
    void recargaPaises(jwt).then((r) => {
      if (!vivo) return
      const lista = r.data?.paises
      if (r.ok && Array.isArray(lista) && lista.length) {
        setPaises(lista)
        setPais((actual) => (lista.some((p) => p.pais === actual) ? actual : lista[0].pais))
      }
    })
    return () => {
      vivo = false
    }
  }, [abrir, jwt])

  useEffect(() => {
    if (!abrir) return
    let vivo = true
    setMetodos([])
    void recargaInstrucciones(jwt, pais).then((r) => {
      if (vivo && r.ok) setMetodos(r.data?.metodos ?? [])
    })
    return () => {
      vivo = false
    }
  }, [abrir, jwt, pais])

  useEffect(() => {
    if (!abrir) return
    if (!montoValido) {
      setPrecio(null)
      return
    }
    let vivo = true
    setPrecio(null)
    void recargaPrecio(jwt, creditosElegidos, pais).then((r) => {
      if (!vivo) return
      setPrecio(r.ok ? (r.data ?? { ok: false, motivo: "rpc" }) : { ok: false, motivo: r.error ?? "rpc" })
    })
    return () => {
      vivo = false
    }
  }, [abrir, jwt, pais, creditosElegidos, montoValido])

  const cerrar = useCallback(() => {
    setCreada(null)
    setFile(null)
    setError(null)
    onCerrar()
  }, [onCerrar])

  async function enviar() {
    setError(null)
    if (!montoValido) {
      setError(`El mínimo de recarga es US$ ${minimo}.`)
      return
    }
    if (!precio?.ok) {
      setError("No pudimos calcular el precio para ese país. Probá otro país o escribí a Soporte.")
      return
    }
    if (!file) {
      setError("Adjuntá el comprobante de pago.")
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("El comprobante no puede superar 10 MB.")
      return
    }
    setEnviando(true)
    try {
      const up = await subirComprobanteRecarga(jwt, file)
      if (!up.ok || !up.ruta) {
        setError(`No se pudo subir el comprobante (${up.error ?? "error"}).`)
        return
      }
      const r = await recargaComprobanteCrear(jwt, creditosElegidos, pais, up.ruta)
      if (!r.ok || !r.data) {
        setError(r.error ?? "No se pudo registrar la recarga.")
        return
      }
      if (!r.data.ok) {
        if (r.data.motivo === "recarga_en_revision") {
          setCreada({ ...r.data, ok: true, estado: "en_revision" })
          setError(null)
        } else {
          setError(`No se pudo registrar la recarga: ${r.data.motivo ?? "error"}.`)
        }
        return
      }
      setCreada(r.data)
      onConfirmado()
    } finally {
      setEnviando(false)
    }
  }

  if (!abrir) return null

  if (creada?.ok) {
    return (
      <section id="recarga-panel" className="rounded-2xl border border-[#1C5A44] bg-[#0F2E24] p-5 text-[#D9F7E8] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-[#1C5A44] text-[#7CE6B4]">
            <Check className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold">Recarga en revisión</h3>
            <p className="mt-1 text-sm text-[#A9D9C4]">
              Soporte valida el comprobante y acredita el saldo en tu cuenta. No hace falta que hagas nada más.
            </p>
            {creada.codigo ? (
              <p className="mt-3 inline-flex rounded-lg border border-[#1C5A44] bg-[#0B241D] px-3 py-1.5 font-mono text-sm text-[#7CE6B4]">
                {creada.codigo}
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" size="lg" onClick={cerrar}>
                Listo
              </Button>
            </div>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section id="recarga-panel" className="rounded-2xl border border-line bg-card p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-foreground">Recargar saldo</h3>
          <p className="mt-1 text-sm text-foreground/55">
            Elegí el monto, pagá por Yape, Binance o transferencia y subí el comprobante. Se acredita cuando Soporte lo valida.
          </p>
        </div>
        <Button type="button" variant="ghost" size="icon-sm" onClick={cerrar} aria-label="Cerrar recarga">
          <X />
        </Button>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium tracking-[0.14em] text-foreground/45 uppercase">Monto (US$)</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {packs.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => {
                  setOtro(false)
                  setCreditos(n)
                }}
                className={`h-9 rounded-lg border px-3 text-sm font-semibold transition-colors ${
                  !otro && creditos === n
                    ? "border-cobalt bg-cobalt text-white"
                    : "border-line bg-field text-foreground/75 hover:border-cobalt/40"
                }`}
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setOtro(true)}
              className={`h-9 rounded-lg border px-3 text-sm font-semibold transition-colors ${
                otro ? "border-cobalt bg-cobalt text-white" : "border-line bg-field text-foreground/75 hover:border-cobalt/40"
              }`}
            >
              Otro
            </button>
          </div>
          {otro ? (
            <input
              type="number"
              min={minimo}
              step={1}
              inputMode="numeric"
              value={otroValor}
              onChange={(e) => setOtroValor(e.target.value)}
              placeholder={`Mínimo ${minimo}`}
              className="mt-2 h-9 w-full rounded-lg border border-line bg-field px-3 text-sm text-foreground outline-none focus:border-cobalt/60"
            />
          ) : null}
        </div>

        <div>
          <label htmlFor="recarga-pais" className="text-xs font-medium tracking-[0.14em] text-foreground/45 uppercase">
            País
          </label>
          <select
            id="recarga-pais"
            value={pais}
            onChange={(e) => setPais(e.target.value)}
            className="mt-2 h-9 w-full rounded-lg border border-line bg-field px-3 text-sm text-foreground outline-none focus:border-cobalt/60"
          >
            {paises.map((p) => (
              <option key={p.pais} value={p.pais}>
                {etiquetaPais(p.pais)} · {p.moneda}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-foreground/45">El precio final lo calcula el servidor con la tasa del país.</p>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-line bg-field p-3">
        {precio?.ok ? (
          <p className="text-sm text-foreground">
            Pagás <strong>{money(precio.moneda, precio.monto_local)}</strong> por <strong>US$ {creditosElegidos}</strong> de saldo.
          </p>
        ) : !montoValido ? (
          <p className="text-sm text-foreground/55">Ingresá un monto de al menos US$ {minimo}.</p>
        ) : precio && !precio.ok ? (
          <p className="text-sm text-amber-600 dark:text-amber-400">
            {precio.motivo === "pais_sin_tasa"
              ? "Ese país no tiene tasa de recarga configurada. Probá otro o escribí a Soporte."
              : `No se puede recargar ese monto (${precio.motivo ?? "monto_invalido"}).`}
          </p>
        ) : (
          <p className="inline-flex items-center gap-2 text-sm text-foreground/55">
            <Loader2 className="size-4 animate-spin" /> Calculando precio…
          </p>
        )}
      </div>

      <div className="mt-4">
        <p className="text-xs font-medium tracking-[0.14em] text-foreground/45 uppercase">Datos para pagar</p>
        {metodos.length === 0 ? (
          <p className="mt-2 text-sm text-foreground/55">Cargando datos de pago…</p>
        ) : (
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {metodos.map((m) => (
              <div key={m.nombre} className="rounded-xl border border-line bg-field p-3">
                <p className="text-sm font-semibold text-foreground">{m.nombre}</p>
                <dl className="mt-2 space-y-1 text-xs text-foreground/65">
                  {Object.entries(m.campos ?? {}).map(([k, v]) =>
                    v ? (
                      <div key={k} className="flex gap-2">
                        <dt className="shrink-0 text-foreground/40">{k}:</dt>
                        <dd className="break-all text-foreground/80">
                          {k.toLowerCase() === "link" && /^https?:\/\//i.test(v) ? (
                            <a href={v} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                              {v}
                            </a>
                          ) : (
                            v
                          )}
                        </dd>
                      </div>
                    ) : null
                  )}
                </dl>
                {m.qr_ruta && /^https?:\/\//i.test(m.qr_ruta) ? (
                  <img src={m.qr_ruta} alt={`QR de ${m.nombre}`} className="mt-3 size-32 rounded-lg bg-white object-contain p-1" />
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-field px-3 py-2 text-sm font-medium text-foreground/75 hover:border-cobalt/40">
          <Upload className="size-4" />
          {file ? file.name : "Adjuntar comprobante"}
          <input
            type="file"
            accept="image/*,application/pdf"
            className="sr-only"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <p className="mt-2 text-xs text-foreground/45">Imagen o PDF, hasta 10 MB. El comprobante queda privado.</p>
      </div>

      {error ? (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button type="button" size="lg" disabled={enviando} onClick={() => void enviar()}>
          {enviando ? <Loader2 className="animate-spin" /> : null}
          {enviando ? "Enviando…" : "Enviar recarga a revisión"}
        </Button>
        <p className="text-xs text-foreground/45">No se cobra automáticamente. Se acredita al validar el comprobante.</p>
      </div>
    </section>
  )
}
