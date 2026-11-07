/**
 * TEMPORAL · W11 Cuenta, galería de estados (1097:2..329) para revisar contra el Figma.
 * Es solo presentación, con datos de muestra: NO es la pantalla real (esa es pages/CuentaPage.tsx,
 * cableada a la auth de producción) y no entra en la web final.
 * ?estado=c1|e1|e2|e3|e4|c2|c2e1|c3|c3e1|rec1|rec2|rec3|reclisto muestra uno solo; sin él, todos.
 */
import { AlertCircle, Clock, Lock, Mail, User, WifiOff } from "lucide-react"
import { useEffect, useState } from "react"
import { Link } from "react-router-dom"

import { AuthCard, AuthShell, AyudaWhatsApp, Banner, BotonPausa, BotonPrimario, BotonSecundario, CabezaAuth, Campo, CampoPassword, CampoSelect, CodigoCorreo, Divisor, EnlaceCentro, ReglasPassword } from "@/components/aritool/auth"
import { C, FranjaSoporte, HeaderMobile, MenuMobile, PieMobile, WA } from "@/components/aritool/chrome"
import { usePrecios } from "@/hooks/use-precios"
import { usePais } from "@/lib/pais"
import { paisDeUrl } from "@/lib/precios"

const CORREO_DEMO = "raul@taller.com"
const DOTS = "••••••••••"
const A = (e: string) => `/preview-cuenta-estados?estado=${e}`

function Ingresar() {
  return (
    <AuthCard>
      <CabezaAuth titulo="Ingresá a tu cuenta" texto="Es la misma cuenta que usás en la app AriTool." />
      <Campo label="Correo" placeholder="tu@correo.com" />
      <CampoPassword label="Contraseña" />
      <BotonPrimario>Ingresar</BotonPrimario>
      <EnlaceCentro to={A("rec1")}>¿Olvidaste tu contraseña?</EnlaceCentro>
      <Divisor texto="¿Primera vez?" />
      <BotonSecundario to={A("c2")}>Crear cuenta</BotonSecundario>
      <AyudaWhatsApp wa={WA} />
    </AuthCard>
  )
}

function ContrasenaNoCoincide() {
  return (
    <AuthCard>
      <CabezaAuth titulo="Ingresá a tu cuenta" texto="Es la misma cuenta que usás en la app AriTool." />
      <Campo label="Correo" valor={CORREO_DEMO} />
      <CampoPassword label="Contraseña" valor={DOTS} error="Esa contraseña no coincide." />
      <BotonPrimario>Ingresar</BotonPrimario>
      <BotonSecundario icono={Mail} to={A("c3")}>Entrar con un código al correo</BotonSecundario>
      <EnlaceCentro to={A("rec1")}>¿Olvidaste tu contraseña?</EnlaceCentro>
    </AuthCard>
  )
}

function MuchosIntentos() {
  return (
    <AuthCard>
      <CabezaAuth titulo="Ingresá a tu cuenta" />
      <Banner tipo="rojo" icono={Lock}>
        Probaste muchas veces. Por seguridad, la cuenta queda en pausa 15 minutos. Si no fuiste vos, cambiá la contraseña cuando entres.
      </Banner>
      <Campo label="Correo" valor={CORREO_DEMO} />
      <CampoPassword label="Contraseña" valor={DOTS} />
      <BotonPausa icono={Clock}>Probá de nuevo en 14:32</BotonPausa>
      <BotonSecundario icono={Mail} to={A("c3")}>Entrar con un código al correo</BotonSecundario>
    </AuthCard>
  )
}

function SinConexion() {
  return (
    <AuthCard>
      <CabezaAuth titulo="Ingresá a tu cuenta" />
      <Banner tipo="ambar" icono={WifiOff}>Sin conexión. Revisá tu internet y probá de nuevo.</Banner>
      <Campo label="Correo" valor={CORREO_DEMO} />
      <CampoPassword label="Contraseña" valor={DOTS} />
      <BotonPrimario>Ingresar</BotonPrimario>
    </AuthCard>
  )
}

function YaEntraste() {
  return (
    <AuthCard>
      <CabezaAuth titulo="Ya entraste" texto={`Estás adentro como ${CORREO_DEMO}.`} />
      <BotonPrimario>Ir a mi cuenta</BotonPrimario>
      <BotonSecundario to={A("c1")}>Salir</BotonSecundario>
    </AuthCard>
  )
}

function CrearCuenta() {
  return (
    <AuthCard>
      <CabezaAuth titulo="Creá tu cuenta" texto="Te sirve para la web y para la app AriTool." />
      <Campo label="Nombre de usuario" valor="Taller Rivera" />
      <Campo label="Correo" valor={CORREO_DEMO} />
      <CampoPassword
        label="Contraseña"
        valor={DOTS}
        enfoque
        debajo={
          <ReglasPassword
            reglas={[
              { texto: "8 caracteres o más", ok: true },
              { texto: "Una mayúscula", ok: true },
              { texto: "Una minúscula", ok: true },
              { texto: "Un número", ok: false },
            ]}
          />
        }
      />
      <CampoPassword label="Repetí la contraseña" valor={DOTS} check />
      <CampoSelect label="País" bandera="pe" texto="Perú" />
      <BotonPrimario>Crear cuenta</BotonPrimario>
      <p className="w-full text-center" style={{ color: C.muted, fontSize: 13 }}>Te mandamos un código a tu correo para confirmarlo.</p>
      <div className="flex w-full items-center justify-center gap-1.5">
        <span style={{ color: C.muted, fontSize: 14 }}>¿Ya tenés cuenta?</span>
        <Link to={A("c1")} style={{ color: C.link, fontWeight: 500, fontSize: 14 }}>Ingresar</Link>
      </div>
    </AuthCard>
  )
}

function CorreoYaTieneCuenta() {
  return (
    <AuthCard>
      <CabezaAuth titulo="Creá tu cuenta" />
      <Banner tipo="azul" icono={User}>
        Ese correo ya tiene cuenta. Entrá con tu contraseña de siempre, o pedí un código al correo si no la recordás.
      </Banner>
      <BotonPrimario to={A("c1")}>Ingresar</BotonPrimario>
      <BotonSecundario icono={Mail} to={A("c3")}>Entrar con un código al correo</BotonSecundario>
    </AuthCard>
  )
}

function CodigoPorCorreo() {
  return (
    <AuthCard>
      <CabezaAuth titulo="Revisá tu correo" texto={`Te mandamos un código de 6 números a ${CORREO_DEMO}.`} />
      <CodigoCorreo valor="481" activa={3} />
      <p className="w-full" style={{ color: C.muted, fontSize: 13 }}>Se comprueba solo al completar los 6 números.</p>
      <div className="flex w-full items-center gap-[18px]">
        <span style={{ color: C.faint, fontWeight: 500, fontSize: 14 }}>Reenviar código en 42 s</span>
        <a href="#" style={{ color: C.link, fontWeight: 500, fontSize: 14 }}>Cambiar correo</a>
      </div>
      <p className="w-full" style={{ color: C.faint, fontSize: 12 }}>¿No llega? Mirá en Spam o Promociones.</p>
    </AuthCard>
  )
}

function CodigoNoSirve() {
  return (
    <AuthCard>
      <CabezaAuth titulo="Revisá tu correo" texto={`Te mandamos un código de 6 números a ${CORREO_DEMO}.`} />
      <CodigoCorreo valor="481902" error />
      <div className="flex w-full items-center gap-1.5">
        <AlertCircle className="size-[14px] shrink-0" style={{ color: "#f87171" }} />
        <span style={{ color: "#fca5a5", fontSize: 13 }}>Ese código no sirve o ya venció. Pedí uno nuevo.</span>
      </div>
      <BotonSecundario icono={Mail} to={A("c3")}>Mandarme otro código</BotonSecundario>
    </AuthCard>
  )
}

function RecuperarPedirCorreo() {
  return (
    <AuthCard>
      <CabezaAuth titulo="Recuperá tu contraseña" texto="Escribí el correo de tu cuenta y te mandamos un código." />
      <Campo label="Correo" valor={CORREO_DEMO} />
      <BotonPrimario icono={Mail} to={A("rec2")}>Mandarme el código</BotonPrimario>
      <EnlaceCentro to={A("c1")}>Volver a Ingresar</EnlaceCentro>
    </AuthCard>
  )
}

function RecuperarCodigo() {
  return (
    <AuthCard>
      <CabezaAuth titulo="Revisá tu correo" texto={`Si esa cuenta existe, le llegó un código de 6 números a ${CORREO_DEMO}.`} />
      <CodigoCorreo valor="72" activa={2} />
      <p className="w-full" style={{ color: C.muted, fontSize: 13 }}>Se comprueba solo al completar los 6 números.</p>
    </AuthCard>
  )
}

function RecuperarNueva() {
  return (
    <AuthCard>
      <CabezaAuth titulo="Elegí tu contraseña nueva" texto="Tu correo quedó comprobado." />
      <CampoPassword
        label="Contraseña nueva"
        valor={DOTS}
        debajo={<p style={{ color: C.muted, fontSize: 12 }}>8 o más, con mayúscula, minúscula y número.</p>}
      />
      <CampoPassword label="Repetila" valor={DOTS} check />
      <BotonPrimario to={A("reclisto")}>Guardar contraseña</BotonPrimario>
    </AuthCard>
  )
}

function RecuperarListo() {
  return (
    <AuthCard>
      <CabezaAuth titulo="Listo, contraseña cambiada" texto="Ya podés entrar con la nueva." />
      <BotonPrimario to={A("c1")}>Ingresar</BotonPrimario>
    </AuthCard>
  )
}

type Vista = { id: string; titulo: string; nodo: string; Comp: () => React.JSX.Element }

const VISTAS: Vista[] = [
  { id: "c1", titulo: "Ingresar · normal", nodo: "1097:2", Comp: Ingresar },
  { id: "e1", titulo: "Ingresar · contraseña no coincide", nodo: "1097:33", Comp: ContrasenaNoCoincide },
  { id: "e2", titulo: "Ingresar · muchos intentos (en pausa)", nodo: "1097:66", Comp: MuchosIntentos },
  { id: "e3", titulo: "Ingresar · sin conexión", nodo: "1097:98", Comp: SinConexion },
  { id: "e4", titulo: "Ingresar · ya entraste", nodo: "1097:127", Comp: YaEntraste },
  { id: "c2", titulo: "Crear cuenta", nodo: "1097:136", Comp: CrearCuenta },
  { id: "c2e1", titulo: "Crear cuenta · ese correo ya tiene cuenta", nodo: "1097:206", Comp: CorreoYaTieneCuenta },
  { id: "c3", titulo: "Código por correo", nodo: "1097:222", Comp: CodigoPorCorreo },
  { id: "c3e1", titulo: "Código · no sirve", nodo: "1097:242", Comp: CodigoNoSirve },
  { id: "rec1", titulo: "Recuperar · pedir correo", nodo: "1097:271", Comp: RecuperarPedirCorreo },
  { id: "rec2", titulo: "Recuperar · código", nodo: "1097:288", Comp: RecuperarCodigo },
  { id: "rec3", titulo: "Recuperar · contraseña nueva", nodo: "1097:303", Comp: RecuperarNueva },
  { id: "reclisto", titulo: "Recuperar · listo", nodo: "1097:329", Comp: RecuperarListo },
]

const ESTADOS: Record<string, () => React.JSX.Element> = Object.fromEntries(VISTAS.map((v) => [v.id, v.Comp]))

function Galeria() {
  return (
    <div className="min-h-screen px-5 py-10 md:px-10" style={{ background: C.page, fontFamily: "Inter, system-ui, sans-serif" }}>
      <div className="mx-auto max-w-[1440px]">
        <h1 style={{ color: C.title, fontWeight: 700, fontSize: 28 }}>Cuenta — todas las pantallas</h1>
        <p className="mt-2" style={{ color: C.muted, fontSize: 15 }}>
          Todos los estados de la misma pantalla de Cuenta en una sola vista. Grupos: Ingresar (5), Crear cuenta + Código (4) y Recuperar (4). En celular cada una va con header y pie del sitio.
        </p>
        <div className="mt-8 grid gap-10" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 420px), 1fr))" }}>
          {VISTAS.map((v) => (
            <div key={v.id} className="flex flex-col items-center gap-3">
              <div className="flex w-full max-w-[440px] items-center gap-2">
                <span style={{ color: C.text, fontWeight: 600, fontSize: 14 }}>{v.titulo}</span>
                <span style={{ color: C.faint, fontSize: 12 }}>· {v.nodo}</span>
              </div>
              <div className="w-full max-w-[440px]">
                <v.Comp />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function CuentaEstadosPreview() {
  const { datos } = usePrecios()
  const { setPais } = usePais()
  const [menu, setMenu] = useState(false)
  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "")
  const estado = (params.get("estado") || "").toLowerCase()
  useEffect(() => {
    const q = paisDeUrl()
    if (q) setPais(q)
    const prev = document.body.style.background
    document.body.style.background = C.page
    return () => { document.body.style.background = prev }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // Sin ?estado → galería con TODO junto. Con ?estado=xxx → una sola pantalla.
  if (!estado || estado === "todo") return <Galeria />
  const Vista = ESTADOS[estado] ?? Ingresar
  return (
    <>
      {/* Compu: tarjeta centrada, sin header/pie (como el Figma de compu). */}
      <div className="hidden lg:block">
        <AuthShell><Vista /></AuthShell>
      </div>
      {/* Celular (1104:2): la Cuenta va dentro del chrome del sitio (header + franja soporte + pie). */}
      <div className="min-h-screen overflow-x-hidden lg:hidden" style={{ background: C.page, color: C.text, fontFamily: "Inter, system-ui, sans-serif", lineHeight: "normal" }}>
        <HeaderMobile onMenu={() => setMenu(true)} mostrarIngresar={false} />
        <FranjaSoporte datos={datos} />
        <main className="px-5 pb-7 pt-6"><Vista /></main>
        <PieMobile />
        {menu ? <MenuMobile datos={datos} onClose={() => setMenu(false)} /> : null}
      </div>
    </>
  )
}
