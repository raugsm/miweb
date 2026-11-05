/**
 * W9 · App AriTool — compu (1082:2) + celular (1103:2). Reusa el chrome compartido.
 * Datos en vivo (versión por useRelease; precio de la app por datos.app, v1.2 de sop_publico).
 * El celular es una composición PROPIA (no la de compu achicada).
 *
 * PENDIENTE: datos.app llega con la v1.2 de sop_publico; hasta entonces los precios salen como skeleton
 * (nunca un número falso — W8). Peter decidió licencia $45; se refleja al actualizar negocio.parametro.
 */
import { Copy, Download, HardDrive, Minus, Monitor, Square, Usb, Wifi, X } from "lucide-react"
import { useEffect, useState } from "react"

import { C, Cont, FranjaSoporte, HeaderDesktop, HeaderMobile, IconoWA, MenuMobile, PieDesktop, PieMobile, WA } from "@/components/aritool/chrome"
import { usePrecios } from "@/hooks/use-precios"
import { usePais } from "@/lib/pais"
import { type Precios } from "@/lib/precios"
import { useRelease } from "@/lib/release"

const LEYENDA = [
  { n: "1", t: "Marcas y servicios", s: "A la izquierda elegís la marca: Xiaomi, Infinix, Tecno, itel. Arriba, el servicio." },
  { n: "2", t: "Tu trabajo al centro", s: "Ahí elegís, pagás y ves tu pedido o tu herramienta en uso." },
  { n: "3", t: "La consola", s: "Te dice qué está pasando en cada paso. Nada queda a la adivinanza." },
]
const LEYENDA_M = [
  { n: "1", t: "Marcas y servicios", s: "A la izquierda elegís la marca; arriba, el servicio." },
  { n: "2", t: "Tu trabajo al centro", s: "Elegís, pagás y ves tu pedido o tu herramienta." },
  { n: "3", t: "La consola", s: "Te dice qué pasa en cada paso." },
]
const REQUISITOS = [
  { icon: Monitor, t: "Windows 10 u 11 de 64 bits" },
  { icon: Wifi, t: "Internet" },
  { icon: Usb, t: "Cable USB y drivers" },
  { icon: HardDrive, t: "15 GB libres si vas a flashear" },
]

function preciosApp(datos: Precios | null) {
  const app = datos?.app
  return {
    credito: app?.credito_usd != null ? `$${app.credito_usd}` : null,
    licencia: app?.licencia_anual_usd != null ? `$${app.licencia_anual_usd}` : null,
  }
}

// ======================= COMPUTADORA =======================
function Plan({ label, precio, unidad, nota }: { label: string; precio: string | null; unidad: string; nota: string }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-[10px] p-4" style={{ background: C.cardAlt, border: `1px solid ${C.borderSoft}` }}>
      <p style={{ color: C.muted2, fontWeight: 500, fontSize: 13, lineHeight: "16px" }}>{label}</p>
      <div className="flex items-end gap-1.5">
        {precio != null ? (
          <>
            <span style={{ color: C.title, fontWeight: 700, fontSize: 26, lineHeight: "31px" }}>{precio}</span>
            <span style={{ color: C.muted, fontSize: 13, lineHeight: "16px" }}>{unidad}</span>
          </>
        ) : (
          <span className="my-[5.5px] h-5 w-16 animate-pulse rounded" style={{ background: C.border }} />
        )}
      </div>
      <p style={{ color: C.muted, fontSize: 12, lineHeight: "15px" }}>{nota}</p>
    </div>
  )
}

// Ventana de la app (compu 1086:16, celular 1103:27): captura real + barra + 3 marcas + sombras por CSS.
// Todo va en unidades del diseño (`u` = ancho / 1080), así la misma pieza mide 1080 × 780 en compu y
// 350 × 252.8 en celular, como el Figma. (Una imagen exportada con sombra traía margen y achicaba la ventana.)
const MARCAS = [
  { n: "1", x: 138, y: 242 },
  { n: "2", x: 655, y: 74 },
  { n: "3", x: 915, y: 74 },
]
function VentanaW9() {
  const px = (n: number) => `calc(100cqw / 1080 * ${n})`
  return (
    <div className="relative mx-auto aspect-[1080/780] w-[1080px] max-w-full" style={{ containerType: "inline-size" }}>
      <div className="absolute left-0 top-0 overflow-hidden" style={{ width: px(1082), background: C.cardAlt, border: `${px(1)} solid ${C.borderAlt}`, borderRadius: px(12), boxShadow: `0 0 ${px(60)} rgba(0,0,0,0.55), 0 0 ${px(80)} rgba(59,130,246,0.18)` }}>
        <div className="flex items-center" style={{ gap: px(8), padding: `${px(9)} ${px(12)}` }}>
          <img src="/aritool-logo.png" alt="" style={{ width: px(16), height: px(16), borderRadius: px(4) }} />
          <span style={{ color: C.muted2, fontWeight: 500, fontSize: px(12), lineHeight: px(15) }}>AriTool</span>
          <div className="flex-1" />
          <Minus style={{ color: C.muted, width: px(13), height: px(13) }} />
          <Square style={{ color: C.muted, width: px(11), height: px(11) }} />
          <X style={{ color: C.muted, width: px(13), height: px(13) }} />
        </div>
        <img src="/w9-captura.png" alt="App AriTool por dentro" className="block" style={{ width: px(1080), height: px(744) }} draggable={false} />
      </div>
      {MARCAS.map((m) => (
        <span key={m.n} className="absolute flex items-center justify-center text-white" style={{ left: px(m.x), top: px(m.y), width: px(32), height: px(32), borderRadius: px(16), background: C.blue, border: `${px(3)} solid ${C.page}`, boxShadow: `0 ${px(4)} ${px(6)} rgba(0,0,0,0.5)`, fontWeight: 700, fontSize: px(15), lineHeight: 1 }}>{m.n}</span>
      ))}
    </div>
  )
}

function ContenidoDesktop({ datos }: { datos: Precios | null }) {
  const r = useRelease()
  const p = preciosApp(datos)
  return (
    <main>
      <section className="px-20 pb-7 pt-12">
        <div className="mx-auto flex max-w-[1280px] flex-row items-end gap-6">
          <div className="flex-1">
            <p className="uppercase" style={{ color: C.link, fontWeight: 700, fontSize: 12, lineHeight: "15px", letterSpacing: "1.3px" }}>App AriTool · para Windows</p>
            <h1 className="mt-2 text-[36px]" style={{ color: C.title, fontWeight: 700, lineHeight: "44px" }}>Así se ve AriTool por dentro.</h1>
            <p className="mt-2" style={{ color: C.muted, fontSize: 17, lineHeight: "21px" }}>Una sola ventana: elegís, pagás y trabajás sin salir de la app.</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <a href={r.downloadUrl} className="flex items-center gap-2 text-white" style={{ background: C.blue, borderRadius: 10, padding: "13px 20px" }}>
              <Download className="size-[17px]" /><span style={{ fontWeight: 600, fontSize: 15, lineHeight: "18px" }}>Descargar AriTool</span>
            </a>
            <span style={{ color: C.faint, fontSize: 12, lineHeight: "15px" }}>Gratis · versión {r.version}</span>
          </div>
        </div>
      </section>

      <section className="px-20 pb-5">
        <VentanaW9 />
        <div className="mx-auto mt-7 grid w-[1080px] max-w-full grid-cols-3 gap-8">
          {LEYENDA.map((l) => (
            <div key={l.n} className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-xl" style={{ background: "#0f1a2e", color: C.link, fontWeight: 700, fontSize: 12 }}>{l.n}</span>
              <div>
                <div style={{ color: C.text, fontWeight: 600, fontSize: 15, lineHeight: "18px" }}>{l.t}</div>
                <div className="mt-1" style={{ color: C.muted2, fontSize: 13, lineHeight: "19px" }}>{l.s}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="px-20 pb-14 pt-11">
        <Cont className="grid grid-cols-2 items-stretch gap-5 !px-0">
          <div className="rounded-2xl p-6" style={{ background: C.card, border: `1px solid ${C.border}` }}>
            <p className="uppercase" style={{ color: C.muted, fontWeight: 700, fontSize: 12, lineHeight: "15px", letterSpacing: "1.2px" }}>Security Plugin y AntiCrack</p>
            <p className="mt-3.5" style={{ color: C.muted2, fontSize: 13, lineHeight: "16px" }}>Tecno · Infinix · itel · MediaTek · 424 modelos</p>
            <div className="mt-3.5 grid grid-cols-2 gap-3">
              <Plan label="Créditos" precio={p.credito} unidad="por proceso" nota="Se cobra cuando termina bien." />
              <Plan label="Licencia anual" precio={p.licencia} unidad="al año" nota="Sin límite en 1 PC." />
            </div>
          </div>
          <div className="rounded-2xl p-6" style={{ background: C.card, border: `1px solid ${C.border}` }}>
            <p className="uppercase" style={{ color: C.muted, fontWeight: 700, fontSize: 12, lineHeight: "15px", letterSpacing: "1.2px" }}>Lo que necesitás</p>
            <div className="mt-3.5 flex flex-col gap-3.5">
              {REQUISITOS.map((req) => (
                <div key={req.t} className="flex items-center gap-2.5">
                  <req.icon className="size-[18px] shrink-0" style={{ color: C.link }} />
                  <span style={{ color: "#d1d5db", fontSize: 14, lineHeight: "17px" }}>{req.t}</span>
                </div>
              ))}
            </div>
          </div>
        </Cont>
      </section>
    </main>
  )
}

// ======================= CELULAR =======================
function FilaPlanM({ nombre, nota, precio, unidad }: { nombre: string; nota: string; precio: string | null; unidad: string }) {
  return (
    <div className="flex items-center justify-between rounded-[10px] p-3.5" style={{ background: C.card, border: `1px solid ${C.border}` }}>
      <div className="min-w-0">
        <div style={{ color: C.text, fontWeight: 500, fontSize: 13, lineHeight: "16px" }}>{nombre}</div>
        <div className="mt-0.5 truncate" style={{ color: C.muted, fontSize: 12, lineHeight: "15px" }}>{nota}</div>
      </div>
      <div className="flex shrink-0 items-end gap-1">
        {precio != null ? (
          <>
            <span style={{ color: C.title, fontWeight: 700, fontSize: 22, lineHeight: "27px" }}>{precio}</span>
            <span style={{ color: C.muted, fontSize: 12, lineHeight: "15px" }}>{unidad}</span>
          </>
        ) : (
          <span className="mb-1 h-4 w-12 animate-pulse rounded" style={{ background: C.border }} />
        )}
      </div>
    </div>
  )
}

function ContenidoMobile({ datos }: { datos: Precios | null }) {
  const p = preciosApp(datos)
  return (
    <main>
      <section className="px-5 pb-6 pt-7">
        <p className="uppercase" style={{ color: C.link, fontWeight: 700, fontSize: 11, lineHeight: "13px", letterSpacing: "1.2px" }}>App AriTool · para Windows</p>
        <h1 className="mt-2" style={{ color: C.title, fontWeight: 700, fontSize: 26, lineHeight: "30px" }}>Así se ve AriTool por dentro.</h1>
        <p className="mt-2" style={{ color: C.muted, fontSize: 15, lineHeight: "21px" }}>Una sola ventana: elegís, pagás y trabajás sin salir.</p>
      </section>

      <section className="px-5 pb-6">
        <VentanaW9 />
        <div className="mt-3.5 flex flex-col gap-3">
          {LEYENDA_M.map((l) => (
            <div key={l.n} className="flex items-start gap-3">
              <span className="flex size-[22px] shrink-0 items-center justify-center rounded-lg" style={{ background: "#0f1a2e", color: C.link, fontWeight: 700, fontSize: 11 }}>{l.n}</span>
              <div>
                <div style={{ color: C.text, fontWeight: 600, fontSize: 14, lineHeight: "17px" }}>{l.t}</div>
                <div className="mt-0.5" style={{ color: C.muted2, fontSize: 13, lineHeight: "18px" }}>{l.s}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="px-5 pb-6">
        <div className="rounded-2xl p-4" style={{ background: C.cardAlt, border: `1px solid ${C.pcBorder}` }}>
          <div className="flex items-center gap-2.5">
            <Monitor className="size-5" style={{ color: C.link }} />
            <span style={{ color: C.title, fontWeight: 700, fontSize: 16, lineHeight: "19px" }}>AriTool se usa en tu PC</span>
          </div>
          <p className="mt-2.5" style={{ color: C.muted2, fontSize: 13, lineHeight: "18px" }}>Mandate el enlace y abrilo en tu computadora con Windows.</p>
          <a href={datos?.soporte.whatsapp ?? WA} target="_blank" rel="noreferrer" className="mt-2.5 flex h-[42px] items-center justify-center gap-2 rounded-lg text-white" style={{ background: C.blue }}>
            <IconoWA className="size-[18px]" style={{ color: "#fff" }} /><span style={{ fontWeight: 600, fontSize: 14 }}>Enviarme el enlace por WhatsApp</span>
          </a>
          <button type="button" className="mt-2.5 flex h-[43px] w-full items-center justify-center gap-2 rounded-lg" style={{ border: `1px solid ${C.borderAlt}`, color: C.text }}>
            <Copy className="size-4" /><span style={{ fontWeight: 600, fontSize: 14 }}>Copiar enlace</span>
          </button>
        </div>
      </section>

      <section className="px-5 pb-6">
        <p className="uppercase" style={{ color: C.muted, fontWeight: 700, fontSize: 11, lineHeight: "13px", letterSpacing: "1.1px" }}>Security Plugin y AntiCrack</p>
        <p className="mt-2.5" style={{ color: C.muted2, fontSize: 13, lineHeight: "16px" }}>Tecno · Infinix · itel · MediaTek · 424 modelos</p>
        <div className="mt-2.5 flex flex-col gap-2.5">
          <FilaPlanM nombre="Créditos" nota="Se cobra cuando termina bien." precio={p.credito} unidad="por proceso" />
          <FilaPlanM nombre="Licencia anual" nota="Sin límite en 1 PC." precio={p.licencia} unidad="al año" />
        </div>
      </section>

      <section className="px-5 pb-6">
        <p className="uppercase" style={{ color: C.muted, fontWeight: 700, fontSize: 11, lineHeight: "13px", letterSpacing: "1.1px" }}>Lo que necesitás</p>
        <div className="mt-2.5 flex flex-col gap-2.5">
          {REQUISITOS.map((req) => (
            <div key={req.t} className="flex items-center gap-2.5">
              <req.icon className="size-[17px] shrink-0" style={{ color: C.link }} />
              <span style={{ color: "#d1d5db", fontSize: 14, lineHeight: "17px" }}>{req.t}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}

export function AppAriToolPage() {
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
        <HeaderDesktop datos={datos} active="App AriTool" />
        <ContenidoDesktop datos={datos} />
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
