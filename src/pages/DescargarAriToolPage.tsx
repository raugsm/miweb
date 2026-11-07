/**
 * W7 · Descargar AriTool (1065:2 compu · 1103:208 celular). Reusa el chrome compartido.
 * Versión, fecha y enlace EN VIVO (useRelease). Compu: tarjeta con "Descargar AriTool" + "Copiar enlace".
 * Celular: caja "AriTool se usa en tu PC" con botones apilados ("Enviarme el enlace por WhatsApp" + "Copiar
 * enlace"), igual que Inicio/App (W8: el programa no corre en el teléfono).
 */
import { ArrowRight, Download, Monitor, RefreshCw, Shield } from "lucide-react"
import { useEffect, useState } from "react"
import { Link } from "react-router-dom"

import { C, FranjaSoporte, HeaderDesktop, HeaderMobile, IconoWA, LogoAriCaja, MenuMobile, PieDesktop, PieMobile, RUTAS, WA, useAncla } from "@/components/aritool/chrome"
import { BotonCopiarEnlace } from "@/components/aritool/descarga"
import { novedades } from "@/data/novedades"
import { usePrecios } from "@/hooks/use-precios"
import { enlaceDescarga, RUTA_DESCARGA } from "@/lib/descarga"
import { usePais } from "@/lib/pais"
import { paisDeUrl } from "@/lib/precios"
import { useRelease } from "@/lib/release"
import { useSeo } from "@/lib/seo"

const AYUDA = [
  { icon: Shield, t: "Windows la frena", s: 'Tocá "Más información" y después "Ejecutar de todas formas".' },
  { icon: RefreshCw, t: "Tenés una versión vieja", s: "Abrí AriTool: se actualiza sola. Si no, bajala de nuevo acá." },
]
const AYUDA_M = [
  { icon: Shield, t: "Windows la frena", s: 'Tocá "Más información" y después "Ejecutar de todas formas".' },
  { icon: RefreshCw, t: "Tenés una versión vieja", s: "Abrí AriTool: se actualiza sola. Si no, bajala de nuevo." },
]

function fmtFecha(iso: string): string {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00`) : new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" })
}

/** Archivo de versiones (pedido de Ari-Diseño 7-nov): vive acá y Novedades salta a #versiones-anteriores. */
function VersionesAnteriores({ movil }: { movil: boolean }) {
  return (
    <section data-ancla="versiones-anteriores" className={movil ? "px-5 pb-6 pt-2" : "mt-10"}>
      <h2 style={{ color: C.title, fontWeight: 700, fontSize: movil ? 20 : 22, lineHeight: movil ? "25px" : "27px" }}>Versiones anteriores</h2>
      <p className="mt-1" style={{ color: C.muted, fontSize: movil ? 13 : 14, lineHeight: movil ? "18px" : "19px" }}>El historial completo de AriTool, versión por versión.</p>
      <div className={`mt-4 overflow-hidden ${movil ? "rounded-[14px]" : "rounded-[14px]"}`} style={{ background: C.card, border: `1px solid ${C.border}` }}>
        {novedades.map((e, i) => (
          <div key={e.version} className={movil ? "flex flex-col gap-2 p-4" : "flex gap-6 p-5"} style={i > 0 ? { borderTop: `1px solid ${C.border}` } : undefined}>
            <div className={movil ? "flex items-center gap-2" : "w-32 shrink-0"}>
              <span style={{ color: C.title, fontWeight: 700, fontSize: movil ? 15 : 16, lineHeight: "20px" }}>{e.version}</span>
              {movil ? <><span className="flex-1" /><span style={{ color: C.muted, fontSize: 12 }}>{fmtFecha(e.fecha)}</span></> : <div className="mt-1" style={{ color: C.muted, fontSize: 12, lineHeight: "15px" }}>{fmtFecha(e.fecha)}</div>}
            </div>
            <div className={movil ? "flex flex-col gap-1.5" : "flex flex-1 flex-col gap-2"}>
              {e.notas.map((n, j) => (
                <div key={j} className={movil ? "flex flex-col gap-0.5" : "flex gap-3"}>
                  {n.area ? <span className={movil ? "" : "w-16 shrink-0"} style={{ color: C.muted, fontWeight: 600, fontSize: 12, lineHeight: "16px" }}>{n.area}</span> : null}
                  <span style={{ color: "#d1d5db", fontSize: movil ? 13 : 14, lineHeight: "20px" }}>{n.texto}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function ContenidoDesktop() {
  const r = useRelease()
  return (
    <main className="px-20 pb-14 pt-12">
      <div className="mx-auto max-w-[1280px]">
        <h1 style={{ color: C.title, fontWeight: 700, fontSize: 34, lineHeight: "41px" }}>Descargar AriTool</h1>
        <div className="mt-7 grid grid-cols-2 items-start gap-5">
          <div className="rounded-[14px] p-7" style={{ background: C.card, border: `1px solid ${C.border}` }}>
            <div className="flex items-center gap-3.5">
              <LogoAriCaja lado={52} radio={13} />
              <div>
                <div style={{ color: C.title, fontWeight: 700, fontSize: 22, lineHeight: "27px" }}>AriTool para Windows</div>
                <div className="mt-[3px]" style={{ color: C.muted2, fontSize: 14, lineHeight: "17px" }}>{r.version ? `Versión ${r.version} · publicada el ${r.buildDateLabel}` : "La última versión disponible"}</div>
              </div>
            </div>
            <p className="mt-3.5" style={{ color: C.muted, fontSize: 14, lineHeight: "17px" }}>Windows 10 u 11 de 64 bits · es portable, no se instala · se actualiza sola</p>
            <div className="mt-3.5 flex flex-wrap items-center gap-3 pt-1">
              <a href={RUTA_DESCARGA} className="flex items-center gap-2 text-white" style={{ background: C.blue, borderRadius: 9, padding: "11px 18px", fontWeight: 600, fontSize: 14, lineHeight: "17px" }}>
                <Download className="size-[16px]" />Descargar AriTool
              </a>
              <BotonCopiarEnlace movil={false} />
            </div>
          </div>
          <div className="rounded-[14px] p-7" style={{ background: C.card, border: `1px solid ${C.border}` }}>
            <p className="uppercase" style={{ color: C.muted, fontWeight: 700, fontSize: 11, lineHeight: "13px", letterSpacing: "1.1px" }}>Si algo no anda</p>
            <div className="mt-4 flex flex-col gap-4">
              {AYUDA.map((a) => (
                <div key={a.t} className="flex gap-3">
                  <a.icon className="size-[18px] shrink-0" style={{ color: C.link }} />
                  <div>
                    <div style={{ color: C.text, fontWeight: 600, fontSize: 14, lineHeight: "17px" }}>{a.t}</div>
                    <div className="mt-[3px]" style={{ color: C.muted2, fontSize: 13, lineHeight: "18px" }}>{a.s}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <Link to={RUTAS.novedades} className="mt-7 flex w-fit items-center gap-1.5" style={{ color: C.link, fontWeight: 500, fontSize: 14, lineHeight: "17px" }}>
          ¿Qué cambió en esta versión? Ver novedades <ArrowRight className="size-[14px]" />
        </Link>
        <VersionesAnteriores movil={false} />
      </div>
    </main>
  )
}

function ContenidoMobile({ datos }: { datos: { soporte: { whatsapp: string | null } } | null }) {
  const r = useRelease()
  const wa = datos?.soporte.whatsapp ?? WA
  const waLink = `${wa}${wa.includes("?") ? "&" : "?"}text=${encodeURIComponent(`AriTool para Windows: ${enlaceDescarga()}`)}`
  return (
    <main>
      <section className="px-5 pb-6 pt-7">
        <h1 style={{ color: C.title, fontWeight: 700, fontSize: 28, lineHeight: "34px" }}>Descargar AriTool</h1>
        <p className="mt-1.5" style={{ color: C.muted, fontSize: 14, lineHeight: "20px" }}>{r.version ? `Versión ${r.version} · ` : "La última versión disponible · "}Windows 10 u 11 · no se instala · se actualiza sola</p>
      </section>

      <section className="px-5 pb-6">
        <div className="rounded-2xl p-4" style={{ background: C.cardAlt, border: `1px solid ${C.pcBorder}` }}>
          <div className="flex items-center gap-2.5">
            <Monitor className="size-5" style={{ color: C.link }} />
            <span style={{ color: C.title, fontWeight: 700, fontSize: 16, lineHeight: "19px" }}>AriTool se usa en tu PC</span>
          </div>
          <p className="mt-2.5" style={{ color: C.muted2, fontSize: 13, lineHeight: "18px" }}>Mandate el enlace y abrilo en tu computadora con Windows.</p>
          <a href={waLink} target="_blank" rel="noreferrer" className="mt-2.5 flex h-[42px] items-center justify-center gap-2 rounded-lg text-white" style={{ background: C.blue }}>
            <IconoWA className="size-[18px]" style={{ color: "#fff" }} /><span style={{ fontWeight: 600, fontSize: 14 }}>Enviarme el enlace por WhatsApp</span>
          </a>
          <BotonCopiarEnlace movil />
        </div>
      </section>

      <section className="px-5 pb-3">
        <div className="rounded-[14px]" style={{ background: C.card, border: `1px solid ${C.border}`, padding: 18 }}>
          <p className="uppercase" style={{ color: C.muted, fontWeight: 700, fontSize: 11, lineHeight: "13px", letterSpacing: "1.1px" }}>Si algo no anda</p>
          <div className="mt-3.5 flex flex-col gap-3.5">
            {AYUDA_M.map((a) => (
              <div key={a.t} className="flex gap-2.5">
                <a.icon className="size-[17px] shrink-0" style={{ color: C.link }} />
                <div>
                  <div style={{ color: C.text, fontWeight: 600, fontSize: 14, lineHeight: "17px" }}>{a.t}</div>
                  <div className="mt-[3px]" style={{ color: C.muted2, fontSize: 13, lineHeight: "18px" }}>{a.s}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 pb-6">
        <Link to={RUTAS.novedades} className="flex w-fit items-center gap-1.5" style={{ color: C.link, fontWeight: 500, fontSize: 13, lineHeight: "16px" }}>
          ¿Qué cambió? Ver novedades <ArrowRight className="size-[13px]" />
        </Link>
      </section>

      <VersionesAnteriores movil />
    </main>
  )
}

export function DescargarAriToolPage() {
  useSeo({ titulo: "Descargar AriTool", descripcion: "AriTool para Windows 10 u 11 de 64 bits. Es portable, no se instala y se actualiza sola.", ruta: "/descargas" })
  useAncla()
  const { datos } = usePrecios()
  const { setPais } = usePais()
  const [menu, setMenu] = useState(false)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const q = paisDeUrl()
    if (q) setPais(q)
    if (params.get("menu") === "1") setMenu(true)
    const prev = document.body.style.background
    document.body.style.background = C.page
    return () => { document.body.style.background = prev }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div className="min-h-screen overflow-x-hidden" style={{ background: C.page, color: C.text, fontFamily: "Inter, system-ui, sans-serif", lineHeight: "normal" }}>
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
