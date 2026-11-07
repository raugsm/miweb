/**
 * Inicio AriTool — computadora (W1 1059:2) + celular (W2 1063:2), aprobados por Peter 4-nov.
 * Fuente Inter, colores y medidas exactos (Ari-Diseño). Precios/catálogo EN VIVO (usePrecios).
 * Dark-only. Barra, menú y pie son los compartidos (components/aritool/chrome). Assets reales:
 * flag-icons, /brand (yape, binance, xiaomi), íconos de herramientas en /tools.
 * Desktop y móvil se muestran por breakpoint (lg).
 *
 * Pendiente: TFM sin ícono (círculo neutro).
 */
import { ArrowRight, CreditCard, Download, Info, Minus, Monitor, Search, Square, X, Zap } from "lucide-react"
import { useEffect, useState } from "react"
import { Link } from "react-router-dom"

import { Flag } from "@/components/Flag"
import { BuscadorCelular, BuscadorCompu } from "@/components/aritool/buscador"
import { C, Cont, FranjaSoporte, HeaderDesktop, HeaderMobile, IconoWA, LogoAriCaja, LogoTool, MenuMobile, PieDesktop, PieMobile, RUTAS, WA, useAncla } from "@/components/aritool/chrome"
import { BotonCopiarEnlace } from "@/components/aritool/descarga"
import { descargaDe } from "@/data/descargas"
import { usePrecios } from "@/hooks/use-precios"
import { NOMBRE_WEB } from "@/lib/buscador"
import { enlaceDescarga, RUTA_DESCARGA } from "@/lib/descarga"
import { usePais } from "@/lib/pais"
import { formatearPrecio, herramientaVisible, nombreMoneda, paisesDisponibles, type HerramientaPrecio, type Precios, type ServicioPrecio } from "@/lib/precios"
import { useRelease } from "@/lib/release"
import { useSeo } from "@/lib/seo"

function nombreServicio(s: ServicioPrecio | null, clave: string, fallback: string): string {
  return NOMBRE_WEB[clave] ?? s?.nombre ?? fallback
}
function precioServicio(s: ServicioPrecio | null): string {
  return s?.precio_local != null ? formatearPrecio(s.precio_local, s.moneda) : "Precio en la app"
}

// El crédito de la app sale del catálogo (negocio.parametro), igual que en la página App AriTool.
function precioApp(datos: Precios | null): string {
  return datos?.app?.credito_usd != null ? `$${datos.app.credito_usd} por proceso` : "Precio en la app"
}

// ======================= DESKTOP (W1) =======================
// Ventana de la app de la portada (W1 1075:1840, W2 1075:3). Se arma con la captura real + barra +
// sombras por CSS, y no con una imagen que trae su propio margen, para que mida lo que mide en el
// Figma a cualquier ancho. `u` = 1 px del diseño de compu (la ventana mide 686 × 506).
function VentanaApp({ u, arriba, trazo }: { u: string; arriba: string; trazo: number }) {
  const px = (n: number) => `calc(${u} * ${n})`
  const control = { color: C.faint, flexShrink: 0 }
  return (
    <div className="absolute left-0 flex flex-col overflow-hidden" style={{ top: arriba, width: px(686), background: C.cardAlt, border: `${px(1)} solid ${C.borderAlt}`, borderRadius: px(12), boxShadow: `0 0 ${px(80)} rgba(59,130,246,0.18), 0 ${px(24)} ${px(60)} rgba(0,0,0,0.55)` }}>
      <div className="flex items-center" style={{ gap: px(8), padding: `${px(8)} ${px(12)}` }}>
        <img src="/aritool-logo-192.webp" alt="" style={{ width: px(16), height: px(16), borderRadius: px(4) }} />
        <span style={{ color: C.muted2, fontWeight: 500, fontSize: px(12), lineHeight: px(15) }}>AriTool</span>
        <span className="flex-1" />
        <Minus strokeWidth={trazo} style={{ ...control, width: px(13), height: px(13) }} />
        <Square strokeWidth={trazo} style={{ ...control, width: px(11), height: px(11) }} />
        <X strokeWidth={trazo} style={{ ...control, width: px(13), height: px(13) }} />
      </div>
      <img src="/hero-captura.png" alt="App AriTool" className="block select-none object-cover" style={{ width: px(684), height: px(472) }} draggable={false} />
    </div>
  )
}

function Burbuja({ clave, izq, arriba, lado, sombra }: { clave: string; izq: string; arriba: string; lado: string; sombra: string }) {
  return <img src={`/tools/${clave}.webp`} alt="" className="absolute rounded-full" style={{ left: izq, top: arriba, width: lado, height: lado, filter: `drop-shadow(${sombra})` }} draggable={false} />
}

function AppCompu() {
  const u = "calc(100cqw / 684)"
  const px = (n: number) => `calc(${u} * ${n})`
  const sombra = "0 10px 12px rgba(0,0,0,0.5)"
  return (
    <div className="relative aspect-[684/518] w-full" style={{ containerType: "inline-size" }}>
      <VentanaApp u={u} arriba={px(6)} trazo={2} />
      <Burbuja clave="unlock_tool" izq={px(-34)} arriba={px(60)} lado={px(72)} sombra={sombra} />
      <Burbuja clave="dft_pro" izq={px(-30)} arriba={px(360)} lado={px(64)} sombra={sombra} />
      <Burbuja clave="tsm_tool_pro" izq={px(650)} arriba={px(140)} lado={px(60)} sombra={sombra} />
      <Burbuja clave="android_multi_tool" izq={px(640)} arriba={px(400)} lado={px(56)} sombra={sombra} />
    </div>
  )
}

function AppCelular() {
  // En el celular la ventana ocupa todo el ancho (350 de 350): 1 px de compu = ancho / 686.
  const px = (n: number) => `calc(100cqw * ${n} / 350)`
  const sombra = "0 8px 9px rgba(0,0,0,0.5)"
  return (
    <div className="relative mt-2.5 aspect-[350/274.163] w-full" style={{ containerType: "inline-size" }}>
      <VentanaApp u="calc(100cqw / 686)" arriba={px(10)} trazo={1} />
      <Burbuja clave="unlock_tool" izq="-8px" arriba="-6px" lado={px(44)} sombra={sombra} />
      <Burbuja clave="dft_pro" izq={`calc(100% + 6px - ${px(40)})`} arriba={px(170)} lado={px(40)} sombra={sombra} />
    </div>
  )
}

function HeroDesktop({ datos, busqueda }: { datos: Precios | null; busqueda: string }) {
  return (
    <section className="relative z-10">
      <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(90.91% 45.45% at -21.82% 50%, rgba(59,130,246,0.22), rgba(59,130,246,0))" }} />
      <Cont className="relative grid items-center gap-[56px] py-16 lg:grid-cols-[540px_1fr]">
        <div className="max-w-[540px]">
          <p className="uppercase" style={{ color: C.link, fontWeight: 700, fontSize: 12, lineHeight: "15px", letterSpacing: "1.4px" }}>AriTool · para técnicos de celulares</p>
          <h1 className="mt-5" style={{ color: C.title, fontWeight: 700, fontSize: 52, lineHeight: "108%" }}>Todo tu taller<br />en una sola app.</h1>
          <p className="mt-5" style={{ color: C.muted, fontSize: 18, lineHeight: "150%" }}>Alquilá herramientas por horas, liberá Xiaomi y gestioná Cuentas MI. Pagás con Yape o Binance y empezás al instante.</p>
          <BuscadorCompu className="mt-5" inicial={busqueda} />
          <div className="mt-5 flex flex-wrap items-center gap-4">
            <a href={RUTA_DESCARGA} className="flex h-[46px] items-center gap-2 text-white" style={{ background: C.blue, borderRadius: 10, padding: "0 22px" }}>
              <Download className="size-[18px]" /><span style={{ fontWeight: 600, fontSize: 15 }}>Descargar AriTool</span>
            </a>
            <span style={{ color: C.muted, fontSize: 14 }}>Gratis · Windows 10 y 11</span>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-2.5 pt-[6px]">
            <span className="flex size-[26px] items-center justify-center overflow-hidden rounded-md bg-white"><img src="/brand/yape.webp" alt="Yape" className="size-[22px] object-contain" /></span>
            <span className="flex size-[26px] items-center justify-center overflow-hidden rounded-md bg-white"><img src="/brand/binance.webp" alt="Binance" className="size-[22px] object-contain" /></span>
            <span style={{ color: C.muted2, fontSize: 13 }}>Pagos al instante</span>
            <span className="size-1 rounded-full" style={{ background: "#2a3650" }} />
            <IconoWA className="size-[17px]" style={{ color: C.waGreen }} />
            <a href={datos?.soporte.whatsapp ?? WA} target="_blank" rel="noreferrer" style={{ color: C.muted2, fontSize: 13 }}>Soporte +51 935 186 037</a>
          </div>
        </div>
        <AppCompu />
      </Cont>
    </section>
  )
}

function Titulo({ texto, derecha, chico }: { texto: string; derecha?: string; chico?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="uppercase" style={{ color: C.muted, fontWeight: 700, fontSize: chico ? 11 : 12, lineHeight: chico ? "13px" : "15px", letterSpacing: chico ? "1.1px" : "1.2px" }}>{texto}</h2>
      {derecha ? <span style={{ color: C.faint, fontSize: chico ? 12 : 13, lineHeight: chico ? "15px" : "16px" }}>{derecha}</span> : null}
    </div>
  )
}

function TarjetaHerr({ h }: { h: HerramientaPrecio }) {
  if (!h.disponible) {
    return (
      <div data-ancla={h.clave} className="flex items-center gap-[14px] rounded-xl p-4" style={{ border: `1px solid ${C.border}`, background: C.card }}>
        <LogoTool clave={h.clave} apagado />
        <div className="flex min-w-0 flex-col gap-[3px]">
          <div className="truncate" style={{ color: C.muted, fontWeight: 600, fontSize: 16, lineHeight: "19px" }}>{h.nombre}</div>
          <div style={{ color: C.faint, fontSize: 13, lineHeight: "16px" }}>Próximamente</div>
        </div>
      </div>
    )
  }
  const precio = h.precio_local != null ? formatearPrecio(h.precio_local, h.moneda) : "Precio en la app"
  const desc = descargaDe(h.clave)
  return (
    <div data-ancla={h.clave} className="flex items-center gap-[14px] rounded-xl p-4" style={{ border: `1px solid ${C.border}`, background: C.card }}>
      <LogoTool clave={h.clave} />
      <div className="flex min-w-0 flex-col gap-1">
        <div className="truncate" style={{ color: C.text, fontWeight: 600, fontSize: 16, lineHeight: "19px" }}>{h.nombre}</div>
        <div className="flex items-baseline gap-2 whitespace-nowrap">
          <span style={{ color: C.green, fontWeight: 700, fontSize: 16, lineHeight: "19px" }}>{precio}</span>
          <span style={{ color: C.muted, fontSize: 13, lineHeight: "16px" }}>{h.horas} h de uso</span>
        </div>
        {desc ? (
          <a href={desc.pagina} target="_blank" rel="noreferrer" className="inline-flex items-center gap-[5px] whitespace-nowrap pt-[2px]" style={{ color: C.link, fontWeight: 500, fontSize: 13, lineHeight: "16px" }}>
            <Download className="size-[13px]" strokeWidth={2} />Descargar programa
          </a>
        ) : null}
      </div>
    </div>
  )
}

function TarjetaSkeleton() {
  return (
    <div className="flex items-center gap-[14px] rounded-xl p-4" style={{ border: `1px solid ${C.border}`, background: C.card }}>
      <div className="size-[52px] shrink-0 animate-pulse rounded-full" style={{ background: C.border }} />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-24 animate-pulse rounded" style={{ background: C.border }} />
        <div className="h-3 w-28 animate-pulse rounded" style={{ background: C.border }} />
        <div className="h-3 w-24 animate-pulse rounded" style={{ background: C.border }} />
      </div>
    </div>
  )
}

function AlquilerDesktop({ cargando, error, datos, refrescar }: { cargando: boolean; error: boolean; datos: Precios | null; refrescar: () => void }) {
  const herrs = datos ? datos.herramientas.filter(herramientaVisible).slice().sort((a, b) => Number(b.disponible) - Number(a.disponible)) : []
  return (
    <section id="alquiler" data-ancla="alquiler" className="scroll-mt-24 pb-9">
      <Cont>
        <Titulo texto="Alquiler de herramientas" derecha="Precio por uso, en tu moneda" />
        {error && !datos ? (
          <div className="mt-[14px] rounded-xl p-6 text-center" style={{ border: `1px solid ${C.border}`, background: C.card }}>
            <p style={{ color: C.muted, fontSize: 14 }}>No pudimos cargar las herramientas ahora mismo.</p>
            <button type="button" onClick={refrescar} className="mt-3 inline-flex h-9 items-center rounded-lg px-4 text-white" style={{ background: C.blue, fontSize: 14, fontWeight: 600 }}>Reintentar</button>
          </div>
        ) : (
          <div className="mt-[14px] grid grid-cols-3 items-center gap-[14px] xl:grid-cols-4">
            {cargando && !datos ? Array.from({ length: 8 }).map((_, i) => <TarjetaSkeleton key={i} />) : herrs.map((h) => <TarjetaHerr key={h.clave} h={h} />)}
          </div>
        )}
        <p className="mt-[14px] flex items-center gap-2 pt-1" style={{ color: C.muted, fontSize: 14, lineHeight: "17px" }}>
          <Info className="size-4 shrink-0" />Bajás el programa de cada herramienta acá y alquilás la cuenta en la app AriTool.
        </p>
      </Cont>
    </section>
  )
}

function TarjetaServicioDesktop({ ancla, logo, nombre, precio, nota }: { ancla?: string; logo: React.ReactNode; nombre: string; precio: string; nota: string }) {
  return (
    <div data-ancla={ancla} className="flex items-center gap-[14px] rounded-xl p-4" style={{ border: `1px solid ${C.border}`, background: C.card }}>
      {logo}
      <div className="flex min-w-0 flex-col gap-1">
        <div className="truncate" style={{ color: C.text, fontWeight: 600, fontSize: 16, lineHeight: "19px" }}>{nombre}</div>
        <div className="flex items-baseline gap-2 whitespace-nowrap">
          <span style={{ color: C.green, fontWeight: 700, fontSize: 16, lineHeight: "19px" }}>{precio}</span>
          <span style={{ color: C.muted, fontSize: 13, lineHeight: "16px" }}>{nota}</span>
        </div>
      </div>
    </div>
  )
}

const LogoXiaomi = <img src="/brand/xiaomi.png" alt="" className="size-[52px] shrink-0 rounded-[10px]" />
const LogoAri = <LogoAriCaja lado={52} radio={13} />

function ServiciosDesktop({ datos }: { datos: Precios | null }) {
  const find = (clave: string) => datos?.servicios.find((s) => s.clave === clave) ?? null
  const frp = find("xiaomi_frp")
  const cm = find("cuenta_mi")
  return (
    <section id="servicios" data-ancla="servicios" className="scroll-mt-24 pb-9">
      <Cont>
        <Titulo texto="Servicios" />
        <div className="mt-[14px] grid grid-cols-2 gap-[14px] xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(379px,1fr)]">
          <TarjetaServicioDesktop ancla="xiaomi_frp" logo={LogoXiaomi} nombre={nombreServicio(frp, "xiaomi_frp", "Xiaomi Reset + FRP")} precio={precioServicio(frp)} nota="Remoto · desde la app" />
          <TarjetaServicioDesktop ancla="cuenta_mi" logo={LogoXiaomi} nombre={nombreServicio(cm, "cuenta_mi", "Cuenta MI")} precio={precioServicio(cm)} nota="Remoto · desde la app" />
          <TarjetaServicioDesktop logo={LogoAri} nombre="AriTool · Security Plugin y AntiCrack" precio={precioApp(datos)} nota="Tecno · Infinix · itel" />
        </div>
        <p className="mt-[14px] flex flex-wrap items-center gap-2 pt-1" style={{ color: C.muted, fontSize: 14, lineHeight: "17px" }}>
          Otras marcas: Motorola F4 · Samsung · pedidos especiales
          <a href={WA} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2" style={{ color: C.link, fontWeight: 500 }}>Consultar por WhatsApp<ArrowRight className="size-[14px]" /></a>
        </p>
      </Cont>
    </section>
  )
}

function Paso({ icono, titulo, texto, extra }: { icono: React.ReactNode; titulo: string; texto: string; extra?: React.ReactNode }) {
  return (
    <div className="flex gap-[14px]">
      <span className="flex size-10 shrink-0 items-center justify-center" style={{ background: C.cardAlt, border: `1px solid ${C.borderSoft}`, borderRadius: 10, color: C.link }}>{icono}</span>
      <div>
        <div style={{ color: C.text, fontWeight: 600, fontSize: 15, lineHeight: "18px" }}>{titulo}</div>
        <div className="mt-1" style={{ color: C.muted, fontSize: 13, lineHeight: "16px" }}>{texto}</div>
        {extra}
      </div>
    </div>
  )
}

function ComoFunciona() {
  return (
    <section className="pb-9">
      <Cont>
        <Titulo texto="Cómo funciona" />
        <div className="mt-[14px] grid grid-cols-3 items-center gap-10">
          <Paso icono={<Monitor className="size-[18px]" />} titulo="1. Descargá AriTool" texto="En tu PC con Windows 10 u 11. No se instala." />
          <Paso icono={<CreditCard className="size-[18px]" />} titulo="2. Elegí y pagá" texto="Con Yape, Binance o tu saldo." extra={
            <div className="mt-1 flex items-center gap-1.5 pt-1">
              <span className="flex size-[30px] items-center justify-center overflow-hidden rounded-[7px] bg-white"><img src="/brand/yape.webp" alt="Yape" className="size-[26px] object-contain" /></span>
              <span className="flex size-[30px] items-center justify-center overflow-hidden rounded-[7px] bg-white"><img src="/brand/binance.webp" alt="Binance" className="size-[26px] object-contain" /></span>
            </div>
          } />
          <Paso icono={<Zap className="size-[18px]" />} titulo="3. Usalo al instante" texto="La cuenta o el servicio te llega en la app." />
        </div>
      </Cont>
    </section>
  )
}

function Descarga() {
  const r = useRelease()
  return (
    <section className="pb-9">
      <Cont>
        <Titulo texto="Descarga" />
        <div className="mt-[14px] rounded-xl p-6" style={{ border: `1px solid ${C.border}`, background: C.card }}>
          <div className="flex items-center gap-3">
            <LogoAriCaja lado={40} radio={10} />
            <div>
              <div style={{ color: C.title, fontWeight: 700, fontSize: 18, lineHeight: "22px" }}>AriTool para Windows</div>
              <div className="mt-0.5" style={{ color: C.muted2, fontSize: 14, lineHeight: "17px" }}>Versión {r.version} · {r.buildDateLabel}</div>
            </div>
          </div>
          <p className="mt-2.5" style={{ color: C.muted, fontSize: 13, lineHeight: "16px" }}>Windows 10 u 11 de 64 bits · es portable, no se instala · se actualiza sola</p>
          <div className="mt-2.5 flex flex-wrap items-center gap-4 pt-[6px]">
            <a href={RUTA_DESCARGA} className="flex items-center gap-2 text-white" style={{ background: C.blue, borderRadius: 8, padding: "10px 16px", fontWeight: 600, fontSize: 14, lineHeight: "17px" }}><Download className="size-[16px]" />Descargar</a>
            <Link to={RUTAS.novedades} className="inline-flex items-center gap-1.5" style={{ color: C.link, fontWeight: 500, fontSize: 13, lineHeight: "16px" }}>Qué cambió en la {r.version}<ArrowRight className="size-[13px]" /></Link>
          </div>
        </div>
      </Cont>
    </section>
  )
}

// ======================= MÓVIL (W2 / W3) =======================
function PaisLineaMobile({ datos }: { datos: Precios | null }) {
  const { pais, setPais } = usePais()
  const [open, setOpen] = useState(false)
  const texto = datos ? `Precios en ${nombreMoneda(datos.pais.moneda)} (${datos.pais.nombre})` : "Precios"
  return (
    <div className="relative mt-2.5 flex items-center gap-1.5 pt-0.5">
      <Flag code={pais.toLowerCase()} shape="rect" style={{ width: 18, height: 12 }} />
      <span style={{ color: C.muted, fontWeight: 400, fontSize: 12 }}>{texto}</span>
      <button type="button" onClick={() => setOpen((v) => !v)} style={{ color: C.link, fontWeight: 500, fontSize: 12 }}>Cambiar</button>
      {open ? (
        <div className="absolute left-0 top-7 z-50 w-56 overflow-hidden rounded-xl py-1" style={{ border: `1px solid ${C.border}`, background: C.card }}>
          {paisesDisponibles(datos).map((p) => (
            <button key={p.codigo} type="button" onClick={() => { setPais(p.codigo); setOpen(false) }} className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-white/5" style={{ color: pais === p.codigo ? C.text : C.muted2, fontSize: 13 }}>
              <Flag code={p.codigo.toLowerCase()} shape="rect" style={{ width: 18, height: 12 }} />{p.nombre}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function HeroMobile({ datos, onBuscar }: { datos: Precios | null; onBuscar: () => void }) {
  return (
    <section className="px-5 py-7" style={{ background: "radial-gradient(55.56% 83.33% at 11.11% 8.33%, rgba(59,130,246,0.2), rgba(59,130,246,0))" }}>
      <p className="uppercase" style={{ color: C.link, fontWeight: 700, fontSize: 11, lineHeight: "13px", letterSpacing: "1.3px" }}>AriTool · para técnicos</p>
      <h1 className="mt-2.5" style={{ color: C.title, fontWeight: 700, fontSize: 28, lineHeight: 1.15 }}>Todo tu taller<br />en una sola app.</h1>
      <p className="mt-2.5" style={{ color: C.muted, fontSize: 15, lineHeight: 1.4 }}>Alquilá herramientas por horas, liberá Xiaomi y gestioná Cuentas MI.</p>
      <button type="button" onClick={onBuscar} className="mt-2.5 flex h-12 w-full items-center gap-2.5 text-left" style={{ background: C.cardAlt, border: `1px solid ${C.borderAlt}`, borderRadius: 12, padding: "0 14px" }}>
        <Search className="size-[18px]" style={{ color: C.muted }} /><span style={{ color: C.faint, fontSize: 15 }}>Buscá: Unlock, FRP, Cuenta MI…</span>
      </button>
      <PaisLineaMobile datos={datos} />
      <AppCelular />
    </section>
  )
}

function TarjetaHerrMobile({ h }: { h: HerramientaPrecio }) {
  const precio = h.precio_local != null ? formatearPrecio(h.precio_local, h.moneda) : "Precio en la app"
  const desc = descargaDe(h.clave)
  return (
    <div data-ancla={h.clave} className="flex min-w-0 flex-col overflow-hidden rounded-xl p-3" style={{ border: `1px solid ${C.border}`, background: C.card }}>
      <LogoTool clave={h.clave} size={40} />
      <div className="mt-2 w-full truncate" style={{ color: C.text, fontWeight: 600, fontSize: 14, lineHeight: "17px" }}>{h.nombre}</div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span style={{ color: C.green, fontWeight: 700, fontSize: 14, lineHeight: "17px" }}>{precio}</span>
        <span style={{ color: C.muted, fontSize: 12, lineHeight: "15px" }}>{h.horas} h</span>
      </div>
      {desc ? (
        <a href={desc.pagina} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-[5px] whitespace-nowrap pt-[2px]" style={{ color: C.link, fontWeight: 500, fontSize: 12, lineHeight: "15px" }}>
          <Download className="size-[12px] max-[374px]:hidden" strokeWidth={2} />Descargar programa
        </a>
      ) : null}
    </div>
  )
}

function TarjetaProximamenteMobile({ items }: { items: HerramientaPrecio[] }) {
  return (
    <div data-ancla={items.map((h) => h.clave).join(" ")} className="flex min-w-0 flex-col overflow-hidden rounded-xl p-3" style={{ border: `1px solid ${C.border}`, background: C.card }}>
      <div className="flex">
        {items.slice(0, 3).map((h, i) => (
          <span key={h.clave} style={{ marginLeft: i === 0 ? 0 : -10 }}><LogoTool clave={h.clave} size={40} apagado /></span>
        ))}
      </div>
      <div className="mt-2" style={{ color: C.muted, fontWeight: 600, fontSize: 14, lineHeight: "17px" }}>{items.length} más</div>
      <div className="mt-2" style={{ color: C.faint, fontSize: 12, lineHeight: "15px" }}>Próximamente</div>
    </div>
  )
}

function AlquilerMobile({ datos }: { datos: Precios | null }) {
  const disp = datos ? datos.herramientas.filter(herramientaVisible).filter((h) => h.disponible) : []
  const apag = datos ? datos.herramientas.filter(herramientaVisible).filter((h) => !h.disponible) : []
  return (
    <section data-ancla="alquiler" className="scroll-mt-16 px-5 pb-6">
      <Titulo chico texto="Alquiler de herramientas" derecha="precio por uso" />
      <div className="mt-2.5 grid grid-cols-2 items-start gap-2.5">
        {disp.map((h) => <TarjetaHerrMobile key={h.clave} h={h} />)}
        {apag.length ? <TarjetaProximamenteMobile items={apag} /> : null}
      </div>
      <p className="mt-2.5 flex items-center gap-2 pt-1" style={{ color: C.muted, fontSize: 12, lineHeight: "15px" }}>
        <Info className="size-[14px] shrink-0" />Bajás el programa acá y alquilás la cuenta en la app.
      </p>
    </section>
  )
}

function ServiciosMobile({ datos }: { datos: Precios | null }) {
  const find = (clave: string) => datos?.servicios.find((s) => s.clave === clave) ?? null
  const fila = (logo: React.ReactNode, nombre: string, precio: string, nota: string, ancla?: string) => (
    <div data-ancla={ancla} className="flex items-center gap-3 rounded-xl p-3" style={{ border: `1px solid ${C.border}`, background: C.card }}>
      <span className="shrink-0">{logo}</span>
      <div className="flex min-w-0 flex-col">
        <div className="truncate" style={{ color: C.text, fontWeight: 600, fontSize: 14, lineHeight: "17px" }}>{nombre}</div>
        <div className="mt-[3px] flex items-baseline gap-1.5">
          <span style={{ color: C.green, fontWeight: 700, fontSize: 14, lineHeight: "17px" }}>{precio}</span>
          <span style={{ color: C.muted, fontSize: 12, lineHeight: "15px" }}>{nota}</span>
        </div>
      </div>
    </div>
  )
  const xiaomi = <img src="/brand/xiaomi.png" alt="" className="size-10 rounded-lg" />
  const ari = <LogoAriCaja lado={40} radio={10} />
  const frp = find("xiaomi_frp")
  const cm = find("cuenta_mi")
  return (
    <section data-ancla="servicios" className="scroll-mt-16 px-5 pb-6">
      <Titulo chico texto="Servicios" />
      <div className="mt-2.5 flex flex-col gap-2.5">
        {fila(xiaomi, nombreServicio(frp, "xiaomi_frp", "Xiaomi Reset + FRP"), precioServicio(frp), "remoto", "xiaomi_frp")}
        {fila(xiaomi, nombreServicio(cm, "cuenta_mi", "Cuenta MI"), precioServicio(cm), "remoto", "cuenta_mi")}
        {fila(ari, "AriTool · Security Plugin", precioApp(datos), "Tecno · Infinix · itel")}
      </div>
      <p className="mt-2.5 flex flex-col gap-0.5 pt-0.5" style={{ color: C.muted, fontSize: 13, lineHeight: "16px" }}>
        <span>Otras marcas: Motorola F4 · Samsung · especiales</span>
        <a href={WA} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5" style={{ color: C.link, fontWeight: 500 }}>Consultar por WhatsApp<ArrowRight className="size-[13px]" /></a>
      </p>
    </section>
  )
}

function EnTuPC({ datos }: { datos: Precios | null }) {
  const wa = datos?.soporte.whatsapp ?? WA
  const waLink = `${wa}${wa.includes("?") ? "&" : "?"}text=${encodeURIComponent(`AriTool para Windows: ${enlaceDescarga()}`)}`
  return (
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
  )
}

export function HomeAriTool() {
  useSeo({ titulo: "AriTool · Todo tu taller en una sola app", descripcion: "Alquilá herramientas por horas, liberá Xiaomi y gestioná Cuentas MI. Pagás con Yape o Binance y empezás al instante.", ruta: "/" })
  const { cargando, error, datos, refrescar } = usePrecios()
  const { setPais } = usePais()
  const [menuAbierto, setMenuAbierto] = useState(false)
  // ?q=frp abre la web ya buscando (en compu, la lista bajo el buscador; en celular, la pantalla de buscar).
  const [busqueda] = useState(() => new URLSearchParams(window.location.search).get("q") ?? "")
  const [buscando, setBuscando] = useState(false)
  useAncla()
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const q = params.get("pais")
    if (q) setPais(q.toUpperCase())
    if (params.get("menu") === "1") setMenuAbierto(true)
    if (busqueda && !window.matchMedia("(min-width: 1024px)").matches) setBuscando(true)
    const prev = document.body.style.background
    document.body.style.background = C.page
    return () => {
      document.body.style.background = prev
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div className="min-h-screen overflow-x-hidden" style={{ background: C.page, color: C.text, fontFamily: "Inter, system-ui, sans-serif", lineHeight: "normal" }}>
      {/* DESKTOP */}
      <div className="hidden lg:block">
        <HeaderDesktop datos={datos} />
        <main>
          <HeroDesktop datos={datos} busqueda={busqueda} />
          <AlquilerDesktop cargando={cargando} error={error} datos={datos} refrescar={refrescar} />
          <ServiciosDesktop datos={datos} />
          <ComoFunciona />
          <Descarga />
        </main>
        <PieDesktop />
      </div>
      {/* MÓVIL */}
      <div className="lg:hidden">
        <HeaderMobile onMenu={() => setMenuAbierto(true)} />
        <FranjaSoporte datos={datos} />
        <main>
          <HeroMobile datos={datos} onBuscar={() => setBuscando(true)} />
          <AlquilerMobile datos={datos} />
          <ServiciosMobile datos={datos} />
          <EnTuPC datos={datos} />
        </main>
        <PieMobile />
        {menuAbierto ? <MenuMobile datos={datos} onClose={() => setMenuAbierto(false)} /> : null}
        {buscando ? <BuscadorCelular inicial={busqueda} onClose={() => setBuscando(false)} /> : null}
      </div>
    </div>
  )
}
