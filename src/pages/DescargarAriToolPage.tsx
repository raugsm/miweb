/**
 * W7 · Descargar AriTool (1065:2 compu · 1103:208 celular). Reusa el chrome compartido.
 * Versión, fecha y enlace EN VIVO (useRelease). Compu: tarjeta con "Descargar AriTool" + "Copiar enlace".
 * Celular: caja "AriTool se usa en tu PC" con botones apilados ("Enviarme el enlace por WhatsApp" + "Copiar
 * enlace"), igual que Inicio/App (W8: el programa no corre en el teléfono).
 */
import { ArrowRight, Copy, Download, Monitor, RefreshCw, Shield } from "lucide-react"
import { useEffect, useState } from "react"
import { Link } from "react-router-dom"

import { C, FranjaSoporte, HeaderDesktop, HeaderMobile, IconoWA, MenuMobile, PieDesktop, PieMobile, RUTAS, WA } from "@/components/aritool/chrome"
import { usePrecios } from "@/hooks/use-precios"
import { usePais } from "@/lib/pais"
import { useRelease } from "@/lib/release"

const AYUDA = [
  { icon: Shield, t: "Windows la frena", s: 'Tocá "Más información" y después "Ejecutar de todas formas".' },
  { icon: RefreshCw, t: "Tenés una versión vieja", s: "Abrí AriTool: se actualiza sola. Si no, bajala de nuevo acá." },
]
const AYUDA_M = [
  { icon: Shield, t: "Windows la frena", s: 'Tocá "Más información" y después "Ejecutar de todas formas".' },
  { icon: RefreshCw, t: "Tenés una versión vieja", s: "Abrí AriTool: se actualiza sola. Si no, bajala de nuevo." },
]

function ContenidoDesktop() {
  const r = useRelease()
  return (
    <main className="px-20 pb-16 pt-10">
      <div className="mx-auto max-w-[1280px]">
        <h1 style={{ color: C.title, fontWeight: 700, fontSize: 42 }}>Descargar AriTool</h1>
        <div className="mt-7 grid grid-cols-2 items-start gap-5">
          <div className="rounded-[14px] p-6" style={{ background: C.card, border: `1px solid ${C.border}` }}>
            <div className="flex items-center gap-3">
              <span className="flex size-12 items-center justify-center rounded-xl" style={{ background: C.iconBg, border: `1px solid ${C.borderAlt}` }}>
                <img src="/aritool-logo.png" alt="" className="size-8" />
              </span>
              <div>
                <div style={{ color: C.title, fontWeight: 700, fontSize: 20 }}>AriTool para Windows</div>
                <div className="mt-0.5" style={{ color: C.muted2, fontSize: 14 }}>Versión {r.version} · publicada el {r.buildDateLabel}</div>
              </div>
            </div>
            <p className="mt-4" style={{ color: C.muted, fontSize: 13 }}>Windows 10 u 11 de 64 bits · es portable, no se instala · se actualiza sola</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <a href={r.downloadUrl} className="flex items-center gap-2 text-white" style={{ background: C.blue, borderRadius: 9, padding: "11px 18px", fontWeight: 600, fontSize: 14 }}>
                <Download className="size-[16px]" />Descargar AriTool
              </a>
              <button type="button" className="flex items-center gap-2" style={{ border: `1px solid ${C.borderAlt}`, color: C.text, borderRadius: 9, padding: "11px 18px", fontWeight: 600, fontSize: 14 }}>
                <Copy className="size-[16px]" />Copiar enlace
              </button>
            </div>
          </div>
          <div className="rounded-[14px] p-6" style={{ background: C.card, border: `1px solid ${C.border}` }}>
            <p className="uppercase" style={{ color: C.muted, fontWeight: 700, fontSize: 12, letterSpacing: "1.2px" }}>Si algo no anda</p>
            <div className="mt-4 flex flex-col gap-4">
              {AYUDA.map((a) => (
                <div key={a.t} className="flex gap-3">
                  <a.icon className="mt-0.5 size-[18px] shrink-0" style={{ color: C.link }} />
                  <div>
                    <div style={{ color: C.text, fontWeight: 600, fontSize: 15 }}>{a.t}</div>
                    <div className="mt-0.5" style={{ color: C.muted2, fontSize: 13 }}>{a.s}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <Link to={RUTAS.novedades} className="mt-6 inline-flex items-center gap-1.5" style={{ color: C.link, fontWeight: 500, fontSize: 14 }}>
          ¿Qué cambió en esta versión? Ver novedades <ArrowRight className="size-[14px]" />
        </Link>
      </div>
    </main>
  )
}

function ContenidoMobile({ datos }: { datos: { soporte: { whatsapp: string | null } } | null }) {
  const r = useRelease()
  const wa = datos?.soporte.whatsapp ?? WA
  return (
    <main>
      <section className="px-5 pb-6 pt-7">
        <h1 style={{ color: C.title, fontWeight: 700, fontSize: 28 }}>Descargar AriTool</h1>
        <p className="mt-2" style={{ color: C.muted, fontSize: 14 }}>Versión {r.version} · Windows 10 u 11 · no se instala · se actualiza sola</p>
      </section>

      <section className="px-5 pb-6">
        <div className="rounded-2xl p-4" style={{ background: C.cardAlt, border: `1px solid ${C.pcBorder}` }}>
          <div className="flex items-center gap-2.5">
            <Monitor className="size-5" style={{ color: C.link }} />
            <span style={{ color: C.title, fontWeight: 700, fontSize: 16 }}>AriTool se usa en tu PC</span>
          </div>
          <p className="mt-2.5" style={{ color: C.muted, fontSize: 14 }}>Mandate el enlace y abrilo en tu computadora con Windows.</p>
          <a href={wa} target="_blank" rel="noreferrer" className="mt-3.5 flex h-[42px] items-center justify-center gap-2 rounded-lg text-white" style={{ background: C.blue }}>
            <IconoWA className="size-[18px]" style={{ color: "#fff" }} /><span style={{ fontWeight: 600, fontSize: 14 }}>Enviarme el enlace por WhatsApp</span>
          </a>
          <button type="button" className="mt-2.5 flex h-[43px] w-full items-center justify-center gap-2 rounded-lg" style={{ border: `1px solid ${C.borderAlt}`, color: C.text }}>
            <Copy className="size-4" /><span style={{ fontWeight: 600, fontSize: 14 }}>Copiar enlace</span>
          </button>
        </div>
      </section>

      <section className="px-5 pb-6">
        <div className="rounded-[14px]" style={{ background: C.card, border: `1px solid ${C.border}`, padding: 18 }}>
          <p className="uppercase" style={{ color: C.muted, fontWeight: 700, fontSize: 11, letterSpacing: "1.1px" }}>Si algo no anda</p>
          <div className="mt-3.5 flex flex-col gap-3.5">
            {AYUDA_M.map((a) => (
              <div key={a.t} className="flex gap-2.5">
                <a.icon className="mt-0.5 size-[17px] shrink-0" style={{ color: C.link }} />
                <div>
                  <div style={{ color: C.text, fontWeight: 600, fontSize: 14 }}>{a.t}</div>
                  <div className="mt-0.5" style={{ color: C.muted2, fontSize: 13 }}>{a.s}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 pb-6">
        <Link to={RUTAS.novedades} className="inline-flex items-center gap-1.5" style={{ color: C.link, fontWeight: 500, fontSize: 13 }}>
          ¿Qué cambió? Ver novedades <ArrowRight className="size-[13px]" />
        </Link>
      </section>
    </main>
  )
}

export function DescargarAriToolPage() {
  const { datos } = usePrecios()
  const { setPais } = usePais()
  const [menu, setMenu] = useState(false)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const q = params.get("pais")
    if (q) setPais(q.toUpperCase())
    if (params.get("menu") === "1") setMenu(true)
    const prev = document.body.style.background
    document.body.style.background = C.page
    return () => { document.body.style.background = prev }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div className="min-h-screen overflow-x-hidden" style={{ background: C.page, color: C.text, fontFamily: "Inter, system-ui, sans-serif", lineHeight: 1.2 }}>
      <div className="hidden lg:block">
        <HeaderDesktop datos={datos} />
        <ContenidoDesktop />
        <PieDesktop />
      </div>
      <div className="lg:hidden">
        <HeaderMobile onMenu={() => setMenu(true)} />
        <FranjaSoporte datos={datos} />
        <ContenidoMobile datos={datos} />
        <PieMobile />
        {menu ? <MenuMobile datos={datos} onClose={() => setMenu(false)} /> : null}
      </div>
    </div>
  )
}
