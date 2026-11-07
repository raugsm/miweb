/**
 * W10 · Novedades (1081:2 compu · 1103:142 celular). Reusa el chrome compartido.
 * Versión viva + enlace EN VIVO (useRelease). Las novedades salen de src/data/novedades.ts (PLACEHOLDER:
 * la fuente real la publica Ari-Cliente por versión, con ÁREA — W8 regla 6). "actual" = versión viva.
 */
import { Download } from "lucide-react"
import { useEffect, useState } from "react"
import { Link } from "react-router-dom"

import { C, FranjaSoporte, HeaderDesktop, HeaderMobile, MenuMobile, PieDesktop, PieMobile } from "@/components/aritool/chrome"
import { novedades } from "@/data/novedades"
import { usePrecios } from "@/hooks/use-precios"
import { usePais } from "@/lib/pais"
import { useRelease } from "@/lib/release"
import { useSeo } from "@/lib/seo"

function fmtFecha(iso: string): string {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00`) : new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" })
}

function Badge() {
  return <span className="rounded-[5px] px-[7px] py-0.5" style={{ background: "#0f1a2e", color: C.link, fontWeight: 600, fontSize: 11, lineHeight: "13px" }}>actual</span>
}

function ContenidoDesktop() {
  const r = useRelease()
  const lista = novedades.slice(0, 4)
  return (
    <main className="px-20 pb-14 pt-12">
      <div className="mx-auto max-w-[1280px]">
        <div className="flex items-end gap-4">
          <div className="flex-1">
            <h1 style={{ color: C.title, fontWeight: 700, fontSize: 34, lineHeight: "41px" }}>Novedades</h1>
            <p className="mt-1.5" style={{ color: C.muted, fontSize: 16, lineHeight: "19px" }}>Lo nuevo de AriTool, versión por versión. La app se actualiza sola.</p>
          </div>
          <a href={r.downloadUrl} className="inline-flex shrink-0 items-center gap-2" style={{ border: `1px solid ${C.borderAlt}`, borderRadius: 9, padding: "11px 16px" }}>
            <Download className="size-4" style={{ color: C.text }} />
            <span style={{ color: C.text, fontWeight: 600, fontSize: 14, lineHeight: "17px" }}>Descargar la {r.version}</span>
          </a>
        </div>

        <div className="mt-6 overflow-hidden rounded-[14px]" style={{ background: C.card, border: `1px solid ${C.border}` }}>
          {lista.map((e, i) => (
            <div key={e.version} className="flex gap-8 p-6" style={i > 0 ? { borderTop: `1px solid ${C.border}` } : undefined}>
              <div className="w-40 shrink-0">
                <div className="flex items-center gap-2">
                  <span style={{ color: C.title, fontWeight: 700, fontSize: 17, lineHeight: "21px" }}>{e.version}</span>
                  {e.version === r.version ? <Badge /> : null}
                </div>
                <div className="mt-1" style={{ color: C.muted, fontSize: 13, lineHeight: "16px" }}>{fmtFecha(e.fecha)}</div>
              </div>
              <div className="flex flex-1 flex-col gap-2.5">
                {e.notas.map((n, j) => (
                  <div key={j} className="flex gap-3">
                    <span className="w-16 shrink-0" style={{ color: C.muted, fontWeight: 600, fontSize: 13, lineHeight: "16px" }}>{n.area ?? ""}</span>
                    <span className="flex-1" style={{ color: "#d1d5db", fontSize: 14, lineHeight: "20px" }}>{n.texto}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <Link to="/descargas#versiones-anteriores" className="mt-6 block w-fit" style={{ color: C.link, fontWeight: 500, fontSize: 13, lineHeight: "16px" }}>Ver versiones anteriores</Link>
      </div>
    </main>
  )
}

function ContenidoMobile() {
  const r = useRelease()
  const lista = novedades.slice(0, 3)
  return (
    <main>
      <section className="px-5 pb-6 pt-7">
        <h1 style={{ color: C.title, fontWeight: 700, fontSize: 28, lineHeight: "34px" }}>Novedades</h1>
        <p className="mt-1.5" style={{ color: C.muted, fontSize: 14, lineHeight: "20px" }}>Lo nuevo de AriTool, versión por versión. La app se actualiza sola.</p>
      </section>
      <div className="mx-5 overflow-hidden rounded-[14px]" style={{ background: C.card, border: `1px solid ${C.border}` }}>
        {lista.map((e, i) => (
          <div key={e.version} className="flex flex-col gap-2.5 p-4" style={i > 0 ? { borderTop: `1px solid ${C.border}` } : undefined}>
            <div className="flex items-center gap-2">
              <span style={{ color: C.title, fontWeight: 700, fontSize: 16, lineHeight: "19px" }}>{e.version}</span>
              {e.version === r.version ? <Badge /> : null}
              <span className="flex-1" />
              <span style={{ color: C.muted, fontSize: 12, lineHeight: "15px" }}>{fmtFecha(e.fecha)}</span>
            </div>
            {e.notas.map((n, j) => (
              <div key={j} className="flex flex-col gap-0.5">
                {n.area ? <span style={{ color: C.muted, fontWeight: 600, fontSize: 12, lineHeight: "15px" }}>{n.area}</span> : null}
                <span style={{ color: "#d1d5db", fontSize: 14, lineHeight: "20px" }}>{n.texto}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="px-5 pb-6 pt-[38px]">
        <Link to="/descargas#versiones-anteriores" className="block w-fit" style={{ color: C.link, fontWeight: 500, fontSize: 13, lineHeight: "16px" }}>Ver versiones anteriores</Link>
      </div>
    </main>
  )
}

export function NovedadesPage() {
  useSeo({ titulo: "Novedades | AriTool", descripcion: "Lo nuevo de AriTool, versión por versión. La app se actualiza sola.", ruta: "/novedades" })
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
    <div className="min-h-screen overflow-x-hidden" style={{ background: C.page, color: C.text, fontFamily: "Inter, system-ui, sans-serif", lineHeight: "normal" }}>
      <div className="hidden lg:block">
        <HeaderDesktop datos={datos} active="Novedades" />
        <ContenidoDesktop />
        <PieDesktop />
      </div>
      <div className="lg:hidden">
        <HeaderMobile onMenu={() => setMenu(true)} />
        <FranjaSoporte datos={datos} />
        <ContenidoMobile />
        <PieMobile />
        {menu ? <MenuMobile datos={datos} onClose={() => setMenu(false)} /> : null}
      </div>
    </div>
  )
}
