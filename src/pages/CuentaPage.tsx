/**
 * W11 · Cuenta — Ingresar, Crear cuenta, Código y Recuperar (1097:2..329 compu · 1104:2 celular),
 * aprobado por Peter 4-nov. Pantalla REAL: habla con la misma cuenta que usa la app AriTool.
 *
 * Es el mismo flujo que ya está probado en producción (pages/AccountPage.tsx):
 *  - Ingresar pasa por la función `acceso_entrar` (cuenta los fallos y pausa la cuenta 15 min).
 *  - Crear cuenta pasa por `acceso_solicitar` y se confirma con un código de 6 números al correo.
 *  - Recuperar: correo → código → contraseña nueva. Nunca dice si un correo tiene cuenta o no.
 * En compu es una tarjeta centrada sin barra; en celular va dentro del sitio (barra + soporte + pie).
 * La galería de estados para comparar con el Figma está en pages/CuentaEstadosPreview.tsx.
 */
import { AlertCircle, Clock, Lock, type LucideIcon, Mail, User, WifiOff } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"

import { AuthCard, AuthShell, AyudaWhatsApp, Banner, BotonPausa, BotonPrimario, BotonSecundario, CabezaAuth, Campo, CampoPassword, CampoSelect, CodigoCorreo, Divisor, EnlaceCentro, ReglasPassword } from "@/components/aritool/auth"
import { C, FranjaSoporte, HeaderMobile, MenuMobile, PieMobile, RUTAS, WA } from "@/components/aritool/chrome"
import { PAISES } from "@/data/paises"
import { usePrecios } from "@/hooks/use-precios"
import { confirmar, entrarWeb, solicitarAcceso, verificado } from "@/lib/cuenta"
import { usePais } from "@/lib/pais"
import { useSeo } from "@/lib/seo"
import { supabase } from "@/lib/supabase"

type Vista = "cargando" | "ya" | "ingresar" | "crear" | "yaExiste" | "codigo" | "rec1" | "rec2" | "rec3" | "reclisto"
type Aviso = { tipo: "rojo" | "ambar" | "azul"; icono: LucideIcon; texto: string } | null

const SIN_CONEXION: Aviso = { tipo: "ambar", icono: WifiOff, texto: "Sin conexión. Revisá tu internet y probá de nuevo." }
const ESPERA_REENVIO = 60
const OPCIONES_PAIS = PAISES.map((p) => ({ valor: p.iso, texto: p.nombre }))

const esCorreo = (c: string) => c.length >= 5 && c.includes("@")

/** Lo que Supabase exige para aceptar una contraseña (mismas reglas que la app). */
function reglasClave(clave: string) {
  return [
    { texto: "8 caracteres o más", ok: clave.length >= 8 },
    { texto: "Una mayúscula", ok: /[A-Z]/.test(clave) },
    { texto: "Una minúscula", ok: /[a-z]/.test(clave) },
    { texto: "Un número", ok: /[0-9]/.test(clave) },
  ]
}
const claveValida = (clave: string) => reglasClave(clave).every((r) => r.ok)

/** Traduce el rechazo de Supabase al guardar una contraseña (responde en inglés). */
function mensajeClave(mensaje: string): string {
  const m = mensaje.toLowerCase()
  if (m.includes("easy to guess") || m.includes("pwned") || m.includes("leaked")) return "Esa contraseña ya apareció en filtraciones de otros sitios. Elegí una distinta."
  if (m.includes("at least one character of each")) return "Te falta una minúscula, una mayúscula o un número."
  if (m.includes("should be at least") || m.includes("length")) return "La contraseña necesita al menos 8 caracteres."
  if (m.includes("same") || m.includes("different from the old")) return "Esa es la contraseña que ya tenías. Elegí una nueva."
  return "No se pudo guardar la contraseña. Probá con otra."
}

function minSeg(total: number): string {
  const s = Math.max(0, total)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

function ErrorLinea({ texto }: { texto: string }) {
  return (
    <div className="flex w-full items-center gap-1.5" role="alert">
      <AlertCircle className="size-[14px] shrink-0" style={{ color: "#f87171" }} />
      <span style={{ color: "#fca5a5", fontSize: 13 }}>{texto}</span>
    </div>
  )
}

function Cuenta({ whatsapp }: { whatsapp: string }) {
  const nav = useNavigate()
  const { pais: paisSitio } = usePais()
  const [vista, setVista] = useState<Vista>("cargando")
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState<Aviso>(null)
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [sesionCorreo, setSesionCorreo] = useState("")

  const [correo, setCorreo] = useState("")
  const [clave, setClave] = useState("")
  const [ofrecerCodigo, setOfrecerCodigo] = useState(false)
  const [pausa, setPausa] = useState(0) // segundos que faltan de la pausa por muchos intentos
  const [minutosPausa, setMinutosPausa] = useState(15)

  const [nombre, setNombre] = useState("")
  const [claveN, setClaveN] = useState("")
  const [claveN2, setClaveN2] = useState("")
  const [pais, setPais] = useState(() => (PAISES.some((p) => p.iso === paisSitio) ? paisSitio : "PE"))

  const [codigo, setCodigo] = useState("")
  const [codigoMal, setCodigoMal] = useState(false)
  const [origenCodigo, setOrigenCodigo] = useState<"registro" | "ingreso">("ingreso")
  const [reenvio, setReenvio] = useState(0) // segundos para poder pedir otro código
  const verificando = useRef(false)

  // Al entrar: si ya hay sesión en este navegador, se avisa (e4) en vez de pedir la contraseña.
  useEffect(() => {
    const pedida = new URLSearchParams(window.location.search).get("v")
    void supabase.auth.getSession().then(({ data }) => {
      const c = data.session?.user?.email
      if (c) {
        setSesionCorreo(c)
        setVista("ya")
      } else {
        setVista(pedida === "crear" ? "crear" : pedida === "recuperar" ? "rec1" : "ingresar")
      }
    }).catch(() => setVista("ingresar"))
  }, [])

  // Relojes: pausa por intentos y espera para reenviar el código.
  useEffect(() => {
    if (pausa <= 0 && reenvio <= 0) return
    const id = window.setTimeout(() => {
      setPausa((s) => Math.max(0, s - 1))
      setReenvio((s) => Math.max(0, s - 1))
    }, 1000)
    return () => window.clearTimeout(id)
  }, [pausa, reenvio])

  const ir = (v: Vista) => {
    setAviso(null)
    setErrores({})
    setCodigo("")
    setCodigoMal(false)
    setVista(v)
  }
  const irAMiCuenta = () => nav(RUTAS.miCuenta)

  /** Corre una acción con el botón en espera; si se cae la red, muestra "Sin conexión". */
  async function accion(f: () => Promise<void>) {
    if (ocupado) return
    setOcupado(true)
    setAviso(null)
    setErrores({})
    try {
      await f()
    } catch {
      setAviso(SIN_CONEXION)
    } finally {
      setOcupado(false)
    }
  }

  async function mandarCodigo(c: string): Promise<boolean> {
    const { error } = await supabase.auth.signInWithOtp({ email: c, options: { shouldCreateUser: false } })
    if (!error) setReenvio(ESPERA_REENVIO)
    return !error
  }

  // ---------- Ingresar ----------
  const ingresar = () => accion(async () => {
    const c = correo.trim().toLowerCase()
    if (!esCorreo(c)) return setErrores({ correo: "Escribí tu correo." })
    if (!clave) return setErrores({ clave: "Escribí tu contraseña." })
    const r = await entrarWeb(c, clave)
    if (r.data?.error === "bloqueo_temporal") {
      const min = r.data.minutos ?? 15
      setMinutosPausa(min)
      setPausa(min * 60)
      setOfrecerCodigo(true)
      return
    }
    if (!r.data?.sesion) {
      // Misma respuesta para "no existe" y "contraseña equivocada": no se puede saber cuál.
      if (r.status !== 401) return setAviso({ tipo: "ambar", icono: WifiOff, texto: "No pudimos entrar ahora. Probá de nuevo en un rato." })
      setOfrecerCodigo(true)
      return setErrores({ clave: "Esa contraseña no coincide." })
    }
    const { data, error } = await supabase.auth.setSession({ access_token: r.data.sesion.access_token, refresh_token: r.data.sesion.refresh_token })
    if (error || !data.session) return setAviso({ tipo: "ambar", icono: WifiOff, texto: "No pudimos abrir la sesión. Probá de nuevo." })
    // Con la contraseña bien ya entra. El código solo se pide si la cuenta todavía no confirmó su
    // correo; si esa consulta falla no se lo manda al código, para no dejarlo rebotando.
    const v = await verificado(data.session.access_token)
    if (!v.ok || v.data?.verificado) return irAMiCuenta()
    if (!(await mandarCodigo(c))) return setAviso({ tipo: "ambar", icono: Mail, texto: "No pudimos enviar el código. Esperá un minuto y volvé a intentarlo." })
    setOrigenCodigo("ingreso")
    ir("codigo")
  })

  const entrarConCodigo = () => accion(async () => {
    const c = correo.trim().toLowerCase()
    if (!esCorreo(c)) {
      setVista("ingresar")
      return setErrores({ correo: "Escribí tu correo." })
    }
    if (!(await mandarCodigo(c))) return setAviso({ tipo: "ambar", icono: Mail, texto: "No pudimos enviar el código. Esperá un minuto y volvé a intentarlo." })
    setCorreo(c)
    setOrigenCodigo("ingreso")
    ir("codigo")
  })

  const salir = () => accion(async () => {
    // Solo este navegador: cerrar en todos lados le cerraría la sesión de la app.
    await supabase.auth.signOut({ scope: "local" })
    setSesionCorreo("")
    ir("ingresar")
  })

  // ---------- Crear cuenta ----------
  const crear = () => accion(async () => {
    const n = nombre.trim()
    const c = correo.trim().toLowerCase()
    if (!n) return setErrores({ nombre: "Escribí tu nombre de usuario." })
    if (!esCorreo(c)) return setErrores({ correo: "Escribí un correo válido." })
    if (!claveValida(claveN)) return setErrores({ claveN: "La contraseña todavía no cumple los cuatro requisitos." })
    if (claveN !== claveN2) return setErrores({ claveN2: "Las contraseñas no coinciden." })
    const r = await solicitarAcceso(c, claveN, n, pais)
    if (r.status === 429) return setAviso({ tipo: "ambar", icono: Clock, texto: "Demasiados intentos seguidos. Esperá un rato y volvé a probar, o escribinos por WhatsApp." })
    // Un correo que ya tiene cuenta no se vuelve a registrar ni se le toca la contraseña.
    if (r.data?.estado === "ya_existe") {
      setCorreo(c)
      return ir("yaExiste")
    }
    if (!r.ok || r.data?.estado !== "pendiente") {
      return setErrores({ claveN: r.data?.error === "clave_corta" ? "La contraseña necesita al menos 8 caracteres." : "No se pudo crear la cuenta. Revisá los datos, y probá con otra contraseña si la que pusiste es muy común." })
    }
    setCorreo(c)
    setClave("")
    if (!(await mandarCodigo(c))) {
      ir("ingresar")
      return setAviso({ tipo: "azul", icono: User, texto: "Cuenta creada, pero no pudimos enviar el código. Entrá con tu correo y contraseña." })
    }
    setOrigenCodigo("registro")
    ir("codigo")
  })

  // ---------- Código al correo (registro o ingreso) ----------
  async function comprobarCodigo(valor: string, tipo: "email" | "recovery") {
    if (verificando.current || valor.length !== 6) return
    verificando.current = true
    setOcupado(true)
    setAviso(null)
    try {
      const { data, error } = await supabase.auth.verifyOtp({ email: correo.trim().toLowerCase(), token: valor, type: tipo })
      if (error || !data.session) return setCodigoMal(true)
      if (tipo === "recovery") return ir("rec3")
      await confirmar(data.session.access_token)
      irAMiCuenta()
    } catch {
      setAviso(SIN_CONEXION)
    } finally {
      setOcupado(false)
      verificando.current = false
    }
  }

  const escribirCodigo = (valor: string, tipo: "email" | "recovery") => {
    setCodigo(valor)
    setCodigoMal(false)
    if (valor.length === 6) void comprobarCodigo(valor, tipo)
  }

  const otroCodigo = (tipo: "email" | "recovery") => accion(async () => {
    const c = correo.trim().toLowerCase()
    if (tipo === "recovery") {
      await supabase.auth.resetPasswordForEmail(c)
      setReenvio(ESPERA_REENVIO)
    } else if (!(await mandarCodigo(c))) {
      return setAviso({ tipo: "ambar", icono: Mail, texto: "No pudimos enviar el código. Esperá un minuto y volvé a intentarlo." })
    }
    setCodigo("")
    setCodigoMal(false)
  })

  // ---------- Recuperar la contraseña ----------
  // Tres pasos y ninguno se salta: sin el código no hay sesión, y sin sesión no se cambia nada.
  const pedirCodigoClave = () => accion(async () => {
    const c = correo.trim().toLowerCase()
    if (!esCorreo(c)) return setErrores({ correo: "Escribí el correo de tu cuenta." })
    await supabase.auth.resetPasswordForEmail(c)
    setCorreo(c)
    setReenvio(ESPERA_REENVIO)
    setClaveN("")
    setClaveN2("")
    ir("rec2")
  })

  const guardarClave = () => accion(async () => {
    if (!claveValida(claveN)) return setErrores({ claveN: "La contraseña todavía no cumple los cuatro requisitos." })
    if (claveN !== claveN2) return setErrores({ claveN2: "Las dos contraseñas no coinciden." })
    const { error } = await supabase.auth.updateUser({ password: claveN })
    if (error) return setErrores({ claveN: mensajeClave(error.message) })
    // Se cierra la sesión corta del código: que entre con la nueva y compruebe que quedó guardada.
    await supabase.auth.signOut({ scope: "local" })
    setClave("")
    setClaveN("")
    setClaveN2("")
    ir("reclisto")
  })

  const reglas = useMemo(() => reglasClave(claveN), [claveN])
  const repetidaOk = claveN2.length > 0 && claveN === claveN2
  const nombrePais = PAISES.find((p) => p.iso === pais)?.nombre ?? pais
  const banner = aviso ? <Banner tipo={aviso.tipo} icono={aviso.icono}>{aviso.texto}</Banner> : null
  const enPausa = pausa > 0

  if (vista === "cargando") return <AuthCard><CabezaAuth titulo="Ingresá a tu cuenta" /></AuthCard>

  if (vista === "ya") {
    return (
      <AuthCard>
        <CabezaAuth titulo="Ya entraste" texto={`Estás adentro como ${sesionCorreo}.`} />
        {banner}
        <BotonPrimario onClick={irAMiCuenta}>Ir a mi cuenta</BotonPrimario>
        <BotonSecundario onClick={salir} ocupado={ocupado}>Salir</BotonSecundario>
      </AuthCard>
    )
  }

  if (vista === "ingresar") {
    const conError = Boolean(errores.clave) && ofrecerCodigo
    const simple = enPausa || conError || aviso !== null
    return (
      <AuthCard>
        <CabezaAuth titulo="Ingresá a tu cuenta" texto={simple && !conError ? undefined : "Es la misma cuenta que usás en la app AriTool."} />
        {enPausa ? (
          <Banner tipo="rojo" icono={Lock}>Probaste muchas veces. Por seguridad, la cuenta queda en pausa {minutosPausa} minutos. Si no fuiste vos, cambiá la contraseña cuando entres.</Banner>
        ) : banner}
        <Campo id="correo" label="Correo" tipo="email" placeholder="tu@correo.com" autoComplete="username" autoFocus valor={correo} error={errores.correo} onChange={setCorreo} onEnter={ingresar} />
        <CampoPassword id="clave" label="Contraseña" autoComplete="current-password" valor={clave} error={errores.clave} onChange={setClave} onEnter={ingresar} />
        {enPausa ? <BotonPausa icono={Clock}>Probá de nuevo en {minSeg(pausa)}</BotonPausa> : <BotonPrimario onClick={ingresar} ocupado={ocupado}>Ingresar</BotonPrimario>}
        {(enPausa || conError) ? <BotonSecundario icono={Mail} onClick={entrarConCodigo} ocupado={ocupado}>Entrar con un código al correo</BotonSecundario> : null}
        {enPausa || aviso ? null : <EnlaceCentro onClick={() => ir("rec1")}>¿Olvidaste tu contraseña?</EnlaceCentro>}
        {simple ? null : (
          <>
            <Divisor texto="¿Primera vez?" />
            <BotonSecundario onClick={() => ir("crear")}>Crear cuenta</BotonSecundario>
            <AyudaWhatsApp wa={whatsapp} />
          </>
        )}
      </AuthCard>
    )
  }

  if (vista === "crear") {
    return (
      <AuthCard>
        <CabezaAuth titulo="Creá tu cuenta" texto="Te sirve para la web y para la app AriTool." />
        {banner}
        <Campo id="nombre" label="Nombre de usuario" autoComplete="nickname" autoFocus valor={nombre} error={errores.nombre} onChange={setNombre} />
        <Campo id="correoN" label="Correo" tipo="email" placeholder="tu@correo.com" autoComplete="email" valor={correo} error={errores.correo} onChange={setCorreo} />
        <CampoPassword id="claveN" label="Contraseña" autoComplete="new-password" valor={claveN} error={errores.claveN} onChange={setClaveN} debajo={<ReglasPassword reglas={reglas} />} />
        <CampoPassword id="claveN2" label="Repetí la contraseña" autoComplete="new-password" valor={claveN2} error={errores.claveN2} check={repetidaOk} onChange={setClaveN2} onEnter={crear} />
        <CampoSelect id="pais" label="País" bandera={pais.toLowerCase()} texto={nombrePais} valor={pais} opciones={OPCIONES_PAIS} onChange={setPais} />
        <BotonPrimario onClick={crear} ocupado={ocupado}>Crear cuenta</BotonPrimario>
        <p className="w-full text-center" style={{ color: C.muted, fontSize: 13 }}>Te mandamos un código a tu correo para confirmarlo.</p>
        <div className="flex w-full items-center justify-center gap-1.5">
          <span style={{ color: C.muted, fontSize: 14 }}>¿Ya tenés cuenta?</span>
          <button type="button" onClick={() => ir("ingresar")} style={{ color: C.link, fontWeight: 500, fontSize: 14 }}>Ingresar</button>
        </div>
      </AuthCard>
    )
  }

  if (vista === "yaExiste") {
    return (
      <AuthCard>
        <CabezaAuth titulo="Creá tu cuenta" />
        <Banner tipo="azul" icono={User}>Ese correo ya tiene cuenta. Entrá con tu contraseña de siempre, o pedí un código al correo si no la recordás.</Banner>
        {banner}
        <BotonPrimario onClick={() => ir("ingresar")}>Ingresar</BotonPrimario>
        <BotonSecundario icono={Mail} onClick={entrarConCodigo} ocupado={ocupado}>Entrar con un código al correo</BotonSecundario>
      </AuthCard>
    )
  }

  if (vista === "codigo" || vista === "rec2") {
    const tipo = vista === "codigo" ? "email" : "recovery"
    const texto = vista === "codigo" ? `Te mandamos un código de 6 números a ${correo}.` : `Si esa cuenta existe, le llegó un código de 6 números a ${correo}.`
    return (
      <AuthCard>
        <CabezaAuth titulo="Revisá tu correo" texto={texto} />
        {banner}
        <CodigoCorreo id="codigo" autoFocus valor={codigo} error={codigoMal} onChange={(v) => escribirCodigo(v, tipo)} />
        {codigoMal ? (
          <>
            <ErrorLinea texto="Ese código no sirve o ya venció. Pedí uno nuevo." />
            <BotonSecundario icono={Mail} onClick={() => otroCodigo(tipo)} ocupado={ocupado || reenvio > 0}>{reenvio > 0 ? `Mandarme otro código en ${reenvio} s` : "Mandarme otro código"}</BotonSecundario>
          </>
        ) : (
          <>
            <p className="w-full" style={{ color: C.muted, fontSize: 13 }}>Se comprueba solo al completar los 6 números.</p>
            <div className="flex w-full items-center gap-[18px]">
              {reenvio > 0
                ? <span style={{ color: C.faint, fontWeight: 500, fontSize: 14 }}>Reenviar código en {reenvio} s</span>
                : <button type="button" onClick={() => otroCodigo(tipo)} disabled={ocupado} style={{ color: C.link, fontWeight: 500, fontSize: 14 }}>Reenviar código</button>}
              <button type="button" onClick={() => ir(vista === "rec2" ? "rec1" : origenCodigo === "registro" ? "crear" : "ingresar")} style={{ color: C.link, fontWeight: 500, fontSize: 14 }}>Cambiar correo</button>
            </div>
            <p className="w-full" style={{ color: C.faint, fontSize: 12 }}>¿No llega? Mirá en Spam o Promociones.</p>
          </>
        )}
      </AuthCard>
    )
  }

  if (vista === "rec1") {
    return (
      <AuthCard>
        <CabezaAuth titulo="Recuperá tu contraseña" texto="Escribí el correo de tu cuenta y te mandamos un código." />
        {banner}
        <Campo id="correoR" label="Correo" tipo="email" placeholder="tu@correo.com" autoComplete="username" autoFocus valor={correo} error={errores.correo} onChange={setCorreo} onEnter={pedirCodigoClave} />
        <BotonPrimario icono={Mail} onClick={pedirCodigoClave} ocupado={ocupado}>Mandarme el código</BotonPrimario>
        <EnlaceCentro onClick={() => ir("ingresar")}>Volver a Ingresar</EnlaceCentro>
      </AuthCard>
    )
  }

  if (vista === "rec3") {
    return (
      <AuthCard>
        <CabezaAuth titulo="Elegí tu contraseña nueva" texto="Tu correo quedó comprobado." />
        {banner}
        <CampoPassword id="claveN" label="Contraseña nueva" autoComplete="new-password" autoFocus valor={claveN} error={errores.claveN} onChange={setClaveN} debajo={<p style={{ color: C.muted, fontSize: 12 }}>8 o más, con mayúscula, minúscula y número.</p>} />
        <CampoPassword id="claveN2" label="Repetila" autoComplete="new-password" valor={claveN2} error={errores.claveN2} check={repetidaOk} onChange={setClaveN2} onEnter={guardarClave} />
        <BotonPrimario onClick={guardarClave} ocupado={ocupado}>Guardar contraseña</BotonPrimario>
      </AuthCard>
    )
  }

  return (
    <AuthCard>
      <CabezaAuth titulo="Listo, contraseña cambiada" texto="Ya podés entrar con la nueva." />
      <BotonPrimario onClick={() => ir("ingresar")}>Ingresar</BotonPrimario>
    </AuthCard>
  )
}

export function CuentaPage() {
  const { datos } = usePrecios()
  const [menu, setMenu] = useState(false)
  const whatsapp = datos?.soporte.whatsapp ?? WA
  useSeo({ titulo: "Ingresar | AriTool", descripcion: "Entrá a tu cuenta de AriTool: es la misma que usás en la app.", ruta: "/cuenta", indexar: false })
  useEffect(() => {
    const prev = document.body.style.background
    document.body.style.background = C.page
    return () => { document.body.style.background = prev }
  }, [])
  // Se monta UNA sola rama (compu o celular): son campos reales y no pueden existir dos veces.
  const [compu, setCompu] = useState(() => window.matchMedia("(min-width: 1024px)").matches)
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)")
    const cambio = () => setCompu(mq.matches)
    mq.addEventListener("change", cambio)
    return () => mq.removeEventListener("change", cambio)
  }, [])
  if (compu) return <AuthShell><Cuenta whatsapp={whatsapp} /></AuthShell>
  return (
    <div className="min-h-screen overflow-x-hidden" style={{ background: C.page, color: C.text, fontFamily: "Inter, system-ui, sans-serif", lineHeight: "normal" }}>
      <HeaderMobile onMenu={() => setMenu(true)} mostrarIngresar={false} alto={57} />
      <FranjaSoporte datos={datos} />
      <main className="px-5 pb-7 pt-6"><Cuenta whatsapp={whatsapp} /></main>
      <PieMobile />
      {menu ? <MenuMobile datos={datos} onClose={() => setMenu(false)} /> : null}
    </div>
  )
}
