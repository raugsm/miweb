import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import {
  ArrowLeft,
  Check,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  User,
  Wallet,
} from "lucide-react"

import { Container } from "@/components/Container"
import { OtpInput } from "@/components/OtpInput"
import { SearchableSelect } from "@/components/SearchableSelect"
import { Button } from "@/components/ui/button"
import { PAISES } from "@/data/paises"
import { confirmar, entrarWeb, solicitarAcceso, verificado } from "@/lib/cuenta"
import { supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { useSeo } from "@/lib/seo"

// Acceso del técnico.
//
// Crear cuenta: nombre de usuario + correo + contraseña (con confirmación) + país. Al
// enviar, el código de 6 números llega al correo y se valida EN LA MISMA
// pantalla. Ese código ES la validación: prueba que el correo existe y es suyo,
// y activa la cuenta sola. Nadie aprueba nada a mano desde AriPanel.
// Recién validado se lo manda a iniciar sesión: como el correo ya quedó
// verificado, el ingreso no vuelve a pedir código.
//
// No hay acceso con Google: se retiró por completo.

const VENTAJAS = [
  { icon: Wallet, texto: "Tu saldo de créditos, siempre a la vista" },
  { icon: ShieldCheck, texto: "Historial de tus trabajos con folio" },
  { icon: Sparkles, texto: "Soporte directo por WhatsApp" },
]

type Aviso = { texto: string; error: boolean } | null

/** Campo de texto con icono al costado. */
function Campo({
  id,
  label,
  icon: Icon,
  children,
}: {
  id: string
  label: string
  icon: typeof Mail
  children: React.ReactNode
}) {
  return (
    <div className="mt-4 first:mt-0">
      <label
        htmlFor={id}
        className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-foreground/55"
      >
        <Icon aria-hidden="true" className="size-3.5" />
        {label}
      </label>
      {children}
    </div>
  )
}

const campoClase =
  "h-11 w-full rounded-xl border border-line bg-field px-3.5 text-sm text-foreground transition-colors placeholder:text-foreground/25 focus-visible:border-cobalt focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"

/** Contraseña con ojito para ver lo escrito. */
function CampoClave({
  id,
  valor,
  onChange,
  autoComplete,
  onEnter,
  placeholder = "••••••••",
}: {
  id: string
  valor: string
  onChange: (v: string) => void
  autoComplete: string
  onEnter?: () => void
  placeholder?: string
}) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <input
        id={id}
        type={visible ? "text" : "password"}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className={cn(campoClase, "pr-11")}
        onKeyDown={(e) => {
          if (e.key === "Enter" && onEnter) onEnter()
        }}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-foreground/40 transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {visible ? (
          <EyeOff aria-hidden="true" className="size-4" />
        ) : (
          <Eye aria-hidden="true" className="size-4" />
        )}
      </button>
    </div>
  )
}

/**
 * Lo que Supabase exige para aceptar una contraseña. Se comprueba acá para
 * avisarlo mientras escribe: si se manda floja, el servidor la rechaza con un
 * mensaje en inglés que al técnico no le dice nada.
 */
function requisitosClave(clave: string) {
  return [
    { ok: clave.length >= 8, texto: "8 caracteres o más" },
    { ok: /[a-z]/.test(clave), texto: "Una minúscula" },
    { ok: /[A-Z]/.test(clave), texto: "Una mayúscula" },
    { ok: /[0-9]/.test(clave), texto: "Un número" },
  ]
}

const claveValida = (clave: string) => requisitosClave(clave).every((r) => r.ok)

function Requisitos({ clave }: { clave: string }) {
  return (
    <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
      {requisitosClave(clave).map((r) => (
        <li
          key={r.texto}
          className={cn(
            "flex items-center gap-1.5 text-[11px] transition-colors",
            r.ok ? "text-cyan" : "text-foreground/40"
          )}
        >
          <Check
            aria-hidden="true"
            className={cn("size-3 shrink-0", !r.ok && "opacity-30")}
          />
          {r.texto}
        </li>
      ))}
    </ul>
  )
}

/**
 * Traduce el rechazo del servidor. Supabase contesta en inglés y, con la
 * comprobación de filtraciones activada, puede rechazar una contraseña que
 * cumple todas las reglas solo porque ya apareció en una filtración.
 */
function mensajeClave(mensaje: string): string {
  // Textos reales de Supabase, comprobados contra el servidor:
  //   "Password is known to be weak and easy to guess, please choose a different one."
  //   "Password should contain at least one character of each: abc..., ABC..., 012..."
  //   "Password should be at least 8 characters."
  const m = mensaje.toLowerCase()
  if (m.includes("easy to guess") || m.includes("pwned") || m.includes("leaked")) {
    return "Esa contraseña ya apareció en filtraciones de otros sitios, así que es de las primeras que prueban. Elegí una distinta."
  }
  if (m.includes("at least one character of each")) {
    return "Te falta una minúscula, una mayúscula o un número."
  }
  if (m.includes("should be at least") || m.includes("length")) {
    return "La contraseña necesita al menos 8 caracteres."
  }
  if (m.includes("same") || m.includes("different from the old")) {
    return "Esa es la contraseña que ya tenías. Elegí una nueva."
  }
  return "No se pudo guardar la contraseña. Probá con otra."
}

/** Fuerza de la contraseña: tres tramos, sin reglas imposibles. */
function fuerzaClave(clave: string) {
  let puntos = 0
  if (clave.length >= 8) puntos += 1
  if (clave.length >= 12) puntos += 1
  if (/[^a-zA-Z]/.test(clave) && /[a-zA-Z]/.test(clave)) puntos += 1
  return Math.min(puntos, 3)
}

export function AccountPage() {
  useSeo({
    titulo: "Entrar a mi cuenta de Ari-Tool | AriadGSM",
    descripcion:
      "Acceso de técnicos a Ari-Tool: entrá a tu cuenta, mirá tus créditos y el historial de tus trabajos.",
    ruta: "/cuenta",
  })

  const nav = useNavigate()
  const [pestana, setPestana] = useState<"entrar" | "crear">("entrar")
  const [paso, setPaso] = useState<
    "datos" | "otp" | "rec_correo" | "rec_otp" | "rec_clave"
  >("datos")
  const [otpOrigen, setOtpOrigen] = useState<"registro" | "login">("login")
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState<Aviso>(null)
  const [sesionCorreo, setSesionCorreo] = useState<string | null>(null)
  const [segundos, setSegundos] = useState(0)
  // Se enciende cuando la contraseña falla: ofrece entrar con un código.
  const [ofrecerCodigo, setOfrecerCodigo] = useState(false)

  const [correo, setCorreo] = useState("")
  const [clave, setClave] = useState("")
  const [otp, setOtp] = useState("")

  const [nombre, setNombre] = useState("")
  const [correoN, setCorreoN] = useState("")
  const [claveN, setClaveN] = useState("")
  const [claveN2, setClaveN2] = useState("")
  const [pais, setPais] = useState("PE")

  const verificando = useRef(false)

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSesionCorreo(data.session?.user?.email ?? null)
    })
  }, [])

  useEffect(() => {
    if (segundos <= 0) return
    const id = window.setTimeout(() => setSegundos((s) => s - 1), 1000)
    return () => window.clearTimeout(id)
  }, [segundos])

  const fuerza = useMemo(() => fuerzaClave(claveN), [claveN])
  const coinciden = claveN.length > 0 && claveN === claveN2
  const puedeCrear =
    nombre.trim().length > 0 &&
    correoN.includes("@") &&
    claveValida(claveN) &&
    coinciden &&
    !ocupado

  async function cerrarSesion() {
    await supabase.auth.signOut({ scope: "local" })
    setSesionCorreo(null)
    setAviso({ texto: "Sesión cerrada.", error: false })
  }

  async function entrar() {
    if (ocupado) return
    const c = correo.trim().toLowerCase()
    if (c.length < 5 || !c.includes("@")) {
      setAviso({ texto: "Escribí tu correo para continuar.", error: true })
      return
    }
    if (clave.length === 0) {
      setAviso({ texto: "Escribí tu contraseña.", error: true })
      return
    }
    setOcupado(true)
    setAviso(null)
    try {
      // El login pasa por nuestra función: ahí se cuentan los fallos y, pasado
      // el tope, la cuenta se bloquea un rato en el origen.
      const r = await entrarWeb(c, clave)

      if (r.data?.error === "bloqueo_temporal") {
        setAviso({
          texto: `Demasiados intentos fallidos. Por seguridad la cuenta queda bloqueada ${r.data.minutos ?? 15} minutos. Si no fuiste vos, cambiá la contraseña cuando puedas entrar.`,
          error: true,
        })
        return
      }
      if (!r.data?.sesion) {
        // Puede pasar que el correo ya tuviera cuenta de antes: en ese caso el
        // registro no vuelve a guardar la contraseña, así que la nueva nunca
        // sirve. Se le ofrece entrar con un código al correo para no dejarlo
        // afuera.
        setOfrecerCodigo(true)
        setAviso({
          texto: "Esa contraseña no coincide. Si ya tenías cuenta, entrá con un código al correo.",
          error: true,
        })
        return
      }

      // La sesión llega armada desde la función; se la damos al navegador.
      const { data, error: eSesion } = await supabase.auth.setSession({
        access_token: r.data.sesion.access_token,
        refresh_token: r.data.sesion.refresh_token,
      })
      if (eSesion || !data.session) {
        setAviso({ texto: "No se pudo abrir la sesión. Probá de nuevo.", error: true })
        return
      }

      const v = await verificado(data.session.access_token)
      // La contraseña ya fue correcta, así que el usuario entra. El código solo
      // se pide cuando la consulta responde Y dice que todavía no validó su
      // correo. Si la consulta falla, NO se lo manda al OTP: su cuenta puede
      // estar validada hace rato y quedaría rebotando entre el código y el
      // login sin poder entrar nunca.
      if (!v.ok || v.data?.verificado) {
        nav("/panel")
        return
      }
      const { error: e2 } = await supabase.auth.signInWithOtp({
        email: c,
        options: { shouldCreateUser: false },
      })
      if (e2) {
        setAviso({ texto: "No se pudo enviar el código. Intentá de nuevo.", error: true })
        return
      }
      setOtpOrigen("login")
      setPaso("otp")
      setSegundos(60)
    } catch {
      setAviso({ texto: "Sin conexión. Revisá tu internet e intentá de nuevo.", error: true })
    } finally {
      setOcupado(false)
    }
  }

  /** Salida cuando la contraseña no sirve: se entra con un código al correo. */
  async function entrarConCodigo() {
    if (ocupado) return
    const c = correo.trim().toLowerCase()
    if (c.length < 5 || !c.includes("@")) {
      setAviso({ texto: "Escribí tu correo para continuar.", error: true })
      return
    }
    setOcupado(true)
    setAviso(null)
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: c,
        options: { shouldCreateUser: false },
      })
      if (error) {
        setAviso({
          texto: "No pudimos enviar el código. Esperá un minuto y volvé a intentarlo.",
          error: true,
        })
        return
      }
      setOfrecerCodigo(false)
      setOtpOrigen("login")
      setPaso("otp")
      setSegundos(60)
    } catch {
      setAviso({ texto: "Sin conexión. Revisá tu internet e intentá de nuevo.", error: true })
    } finally {
      setOcupado(false)
    }
  }

  async function verificarOtp(codigo: string) {
    if (verificando.current) return
    if (codigo.length !== 6) return
    verificando.current = true
    setOcupado(true)
    setAviso(null)
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: correo.trim().toLowerCase(),
        token: codigo,
        type: "email",
      })
      if (error || !data.session) {
        setAviso({ texto: "Código inválido o vencido. Pedí uno nuevo.", error: true })
        setOtp("")
        return
      }
      await confirmar(data.session.access_token)

      if (otpOrigen === "registro") {
        // Solo esta pestaña: un signOut global le cerraria la sesion de la app.
        await supabase.auth.signOut({ scope: "local" })
        setPaso("datos")
        setPestana("entrar")
        setOtp("")
        setClave("")
        setClaveN("")
        setClaveN2("")
        setAviso({ texto: "¡Listo! Ya podés entrar con tu correo y contraseña.", error: false })
        return
      }
      nav("/panel")
    } catch {
      setAviso({ texto: "Sin conexión. Revisá tu internet e intentá de nuevo.", error: true })
    } finally {
      setOcupado(false)
      verificando.current = false
    }
  }

  async function reenviar() {
    if (ocupado || segundos > 0) return
    setOcupado(true)
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: correo.trim().toLowerCase(),
        options: { shouldCreateUser: false },
      })
      setAviso(
        error
          ? { texto: "No pudimos reenviar el código.", error: true }
          : { texto: "Te reenviamos el código.", error: false }
      )
      if (!error) setSegundos(60)
    } finally {
      setOcupado(false)
    }
  }

  // --- Recuperar la contraseña ------------------------------------------
  //
  // Tres pasos, y cada uno solo se abre con el anterior resuelto:
  //   1. el correo  -> se manda un código de 6 números
  //   2. el código  -> prueba que la casilla es suya y abre una sesión corta
  //   3. recién ahí aparecen los campos de la contraseña nueva
  //
  // El paso 2 no se puede saltar: sin ese código no hay sesión, y sin sesión
  // Supabase no deja cambiar nada. Tampoco se dice si el correo existe o no:
  // la respuesta es la misma en los dos casos, para que nadie use esta
  // pantalla como lista de clientes.

  async function pedirCodigoClave() {
    if (ocupado) return
    const c = correo.trim().toLowerCase()
    if (c.length < 5 || !c.includes("@")) {
      setAviso({ texto: "Escribí el correo de tu cuenta.", error: true })
      return
    }
    setOcupado(true)
    setAviso(null)
    try {
      await supabase.auth.resetPasswordForEmail(c)
      setOtp("")
      setClaveN("")
      setClaveN2("")
      setPaso("rec_otp")
      setSegundos(60)
    } catch {
      setAviso({ texto: "Sin conexión. Revisá tu internet e intentá de nuevo.", error: true })
    } finally {
      setOcupado(false)
    }
  }

  async function verificarOtpClave(codigo: string) {
    if (verificando.current || codigo.length !== 6) return
    verificando.current = true
    setOcupado(true)
    setAviso(null)
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: correo.trim().toLowerCase(),
        token: codigo,
        type: "recovery",
      })
      if (error || !data.session) {
        setAviso({ texto: "Código inválido o vencido. Pedí uno nuevo.", error: true })
        setOtp("")
        return
      }
      setPaso("rec_clave")
    } catch {
      setAviso({ texto: "Sin conexión. Revisá tu internet e intentá de nuevo.", error: true })
    } finally {
      setOcupado(false)
      verificando.current = false
    }
  }

  async function guardarClaveNueva() {
    if (ocupado) return
    if (!claveValida(claveN)) {
      setAviso({ texto: "La contraseña todavía no cumple los cuatro requisitos.", error: true })
      return
    }
    if (claveN !== claveN2) {
      setAviso({ texto: "Las dos contraseñas no coinciden.", error: true })
      return
    }
    setOcupado(true)
    setAviso(null)
    try {
      const { error } = await supabase.auth.updateUser({ password: claveN })
      if (error) {
        setAviso({ texto: mensajeClave(error.message), error: true })
        return
      }
      // Se cierra la sesión corta del código: que entre con la contraseña
      // nueva, así comprueba en el momento que quedó bien guardada.
      await supabase.auth.signOut({ scope: "local" })
      setClave("")
      setClaveN("")
      setClaveN2("")
      setOtp("")
      setPaso("datos")
      setPestana("entrar")
      setAviso({ texto: "Contraseña cambiada. Entrá con la nueva.", error: false })
    } catch {
      setAviso({ texto: "Sin conexión. Revisá tu internet e intentá de nuevo.", error: true })
    } finally {
      setOcupado(false)
    }
  }

  async function reenviarClave() {
    if (ocupado || segundos > 0) return
    setOcupado(true)
    try {
      await supabase.auth.resetPasswordForEmail(correo.trim().toLowerCase())
      setAviso({ texto: "Te reenviamos el código.", error: false })
      setSegundos(60)
    } finally {
      setOcupado(false)
    }
  }

  async function crear() {
    if (ocupado) return
    const n = nombre.trim()
    const c = correoN.trim().toLowerCase()
    if (claveN !== claveN2) {
      setAviso({ texto: "Las contraseñas no coinciden.", error: true })
      return
    }
    setOcupado(true)
    setAviso(null)
    try {
      const r = await solicitarAcceso(c, claveN, n, pais)

      // El servidor frena los registros en cadena desde la misma conexión o
      // con el mismo correo. A una persona no le pasa; a un robot, enseguida.
      if (r.status === 429) {
        setAviso({
          texto:
            "Demasiados intentos seguidos. Esperá un rato y volvé a probar, o escribinos por Soporte.",
          error: true,
        })
        return
      }

      // Filtro: un correo ya registrado NO se vuelve a registrar. Antes el
      // backend respondía "pendiente" igual, la web daba el alta por buena y la
      // contraseña nueva se perdía en silencio: el técnico quedaba sin poder
      // entrar. Ahora se lo mandamos a Entrar con su cuenta de siempre.
      if (r.data?.estado === "ya_existe") {
        setCorreo(c)
        setPestana("entrar")
        setOfrecerCodigo(true)
        setAviso({
          texto:
            "Ese usuario ya existe. Entrá con tu contraseña de siempre, o pedí un código al correo si no la recordás.",
          error: true,
        })
        return
      }

      if (!r.ok || r.data?.estado !== "pendiente") {
        // El servidor rechaza la contraseña si es corta, si le falta una
        // minúscula, una mayúscula o un número, o si aparece en filtraciones
        // conocidas. Como no distingue el motivo, se nombran los tres.
        setAviso({
          texto:
            r.data?.error === "clave_corta"
              ? "La contraseña necesita al menos 8 caracteres."
              : "No se pudo crear la cuenta. Revisá los datos, y probá con otra contraseña si la que pusiste es muy común.",
          error: true,
        })
        return
      }
      const { error } = await supabase.auth.signInWithOtp({
        email: c,
        options: { shouldCreateUser: false },
      })
      setCorreo(c)
      if (error) {
        setAviso({
          texto: "Cuenta creada, pero no pudimos enviar el código. Entrá con tu correo y clave.",
          error: true,
        })
        setPestana("entrar")
        return
      }
      setOtpOrigen("registro")
      setPaso("otp")
      setSegundos(60)
    } catch {
      setAviso({ texto: "Sin conexión. Revisá tu internet e intentá de nuevo.", error: true })
    } finally {
      setOcupado(false)
    }
  }

  return (
    <section className="py-12 sm:py-20">
      <Container>
        <div className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-[1fr_minmax(0,26rem)] lg:items-center lg:gap-16">
          {/* Columna de valor */}
          <div className="max-w-md">
            <p className="font-display text-[11px] font-bold tracking-[0.22em] text-kicker uppercase">
              Acceso de técnicos
            </p>
            <h1 className="mt-3 text-3xl leading-[1.08] font-semibold tracking-tight text-balance text-foreground sm:text-4xl">
              {paso.startsWith("rec_")
                ? "Recuperá tu contraseña."
                : pestana === "crear" && paso === "datos"
                  ? "Creá tu cuenta en un minuto."
                  : "Entrá a tu cuenta."}
            </h1>
            <p className="mt-4 text-base leading-relaxed text-foreground/60">
              Desde tu panel controlás los créditos y seguís cada trabajo que hiciste con Ari-Tool.
            </p>
            <ul className="mt-7 flex flex-col gap-3">
              {VENTAJAS.map(({ icon: Icon, texto }) => (
                <li key={texto} className="flex items-center gap-3 text-sm text-foreground/70">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-line bg-field text-cyan">
                    <Icon aria-hidden="true" className="size-4" />
                  </span>
                  {texto}
                </li>
              ))}
            </ul>
          </div>

          {/* Tarjeta de acceso */}
          <div className="relative">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-16 right-0 h-56 w-56 rounded-full bg-[radial-gradient(closest-side,rgba(0,82,212,0.22),transparent)]"
            />
            <div className="relative rounded-2xl border border-line bg-card p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] sm:p-7">
              {sesionCorreo ? (
                <div className="text-center">
                  <span className="mx-auto flex size-12 items-center justify-center rounded-xl border border-line bg-field text-cyan">
                    <ShieldCheck aria-hidden="true" className="size-5" />
                  </span>
                  <h2 className="mt-4 text-base font-semibold text-foreground">
                    Ya tenés sesión abierta
                  </h2>
                  <p className="mt-1 text-sm break-words text-foreground/60">{sesionCorreo}</p>
                  <Button asChild className="mt-6 h-11 w-full rounded-xl font-medium">
                    <Link to="/panel">Ir a mi panel</Link>
                  </Button>
                  <button
                    type="button"
                    onClick={cerrarSesion}
                    className="mt-3 text-sm text-foreground/50 transition-colors hover:text-foreground"
                  >
                    Cerrar sesión
                  </button>
                </div>
              ) : paso === "rec_correo" ? (
                /* Paso 1: el correo. */
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      setPaso("datos")
                      setAviso(null)
                    }}
                    className="flex items-center gap-1.5 text-sm text-foreground/50 transition-colors hover:text-foreground"
                  >
                    <ArrowLeft aria-hidden="true" className="size-4" />
                    Volver
                  </button>

                  <span className="mt-5 flex size-12 items-center justify-center rounded-xl border border-line bg-field text-cyan">
                    <KeyRound aria-hidden="true" className="size-5" />
                  </span>
                  <h2 className="mt-4 text-lg font-semibold text-foreground">
                    Recuperar contraseña
                  </h2>
                  <p className="mt-1.5 text-sm leading-relaxed text-foreground/60">
                    Escribí el correo de tu cuenta. Te mandamos un código de 6
                    números para comprobar que la casilla es tuya.
                  </p>

                  <div className="mt-6">
                    <Campo id="correoR" label="Correo de la cuenta" icon={Mail}>
                      <input
                        id="correoR"
                        value={correo}
                        onChange={(e) => setCorreo(e.target.value)}
                        autoComplete="email"
                        inputMode="email"
                        placeholder="tu@correo.com"
                        className={campoClase}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void pedirCodigoClave()
                        }}
                      />
                    </Campo>
                  </div>

                  <Button
                    type="button"
                    className="mt-6 h-11 w-full rounded-xl font-medium"
                    disabled={ocupado}
                    onClick={pedirCodigoClave}
                  >
                    {ocupado ? (
                      <>
                        <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                        Enviando…
                      </>
                    ) : (
                      "Enviarme el código"
                    )}
                  </Button>
                </div>
              ) : paso === "rec_otp" ? (
                /* Paso 2: el código. Sin esto no se llega a la contraseña. */
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      setPaso("rec_correo")
                      setOtp("")
                      setAviso(null)
                    }}
                    className="flex items-center gap-1.5 text-sm text-foreground/50 transition-colors hover:text-foreground"
                  >
                    <ArrowLeft aria-hidden="true" className="size-4" />
                    Volver
                  </button>

                  <span className="mt-5 flex size-12 items-center justify-center rounded-xl border border-line bg-field text-cyan">
                    <Mail aria-hidden="true" className="size-5" />
                  </span>
                  <h2 className="mt-4 text-lg font-semibold text-foreground">
                    Revisá tu correo
                  </h2>
                  <p className="mt-1.5 text-sm leading-relaxed text-foreground/60">
                    Si esa cuenta existe, le llegó un código de 6 números a{" "}
                    <span className="font-medium text-foreground">
                      {correo.trim().toLowerCase()}
                    </span>
                  </p>

                  <div className="mt-6">
                    <OtpInput
                      value={otp}
                      onChange={setOtp}
                      onComplete={verificarOtpClave}
                      disabled={ocupado}
                      autoFocus
                    />
                  </div>

                  {ocupado ? (
                    <p className="mt-4 flex items-center justify-center gap-2 text-sm text-foreground/60">
                      <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                      Comprobando…
                    </p>
                  ) : (
                    <p className="mt-4 text-center text-xs text-foreground/45">
                      Se comprueba solo al completar los 6 números.
                    </p>
                  )}

                  <div className="mt-5 border-t border-line pt-4 text-center">
                    <button
                      type="button"
                      onClick={reenviarClave}
                      disabled={segundos > 0 || ocupado}
                      className="text-sm text-foreground/50 transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:text-foreground/50"
                    >
                      {segundos > 0 ? `Reenviar código en ${segundos}s` : "Reenviar código"}
                    </button>
                  </div>
                </div>
              ) : paso === "rec_clave" ? (
                /* Paso 3: la contraseña nueva. Solo con el código bien puesto. */
                <div>
                  <span className="flex size-12 items-center justify-center rounded-xl border border-line bg-field text-cyan">
                    <ShieldCheck aria-hidden="true" className="size-5" />
                  </span>
                  <h2 className="mt-4 text-lg font-semibold text-foreground">
                    Correo comprobado
                  </h2>
                  <p className="mt-1.5 text-sm leading-relaxed text-foreground/60">
                    Ahora elegí tu contraseña nueva.
                  </p>

                  <div className="mt-6">
                    <Campo id="claveR" label="Contraseña nueva" icon={Lock}>
                      <CampoClave
                        id="claveR"
                        valor={claveN}
                        onChange={setClaveN}
                        autoComplete="new-password"
                      />
                      <Requisitos clave={claveN} />
                      {claveN.length > 0 ? (
                        <div className="mt-2 flex gap-1" aria-hidden="true">
                          {[0, 1, 2].map((i) => (
                            <span
                              key={i}
                              className={cn(
                                "h-1 flex-1 rounded-full transition-colors",
                                i < fuerza ? "bg-cyan" : "bg-line"
                              )}
                            />
                          ))}
                        </div>
                      ) : null}
                    </Campo>
                    <Campo id="claveR2" label="Repetir contraseña" icon={Lock}>
                      <CampoClave
                        id="claveR2"
                        valor={claveN2}
                        onChange={setClaveN2}
                        autoComplete="new-password"
                        onEnter={() => void guardarClaveNueva()}
                      />
                      {claveN2.length > 0 ? (
                        <p
                          className={cn(
                            "mt-2 flex items-center gap-1.5 text-[11px]",
                            claveN === claveN2 ? "text-cyan" : "text-red-400"
                          )}
                        >
                          {claveN === claveN2 ? (
                            <>
                              <Check aria-hidden="true" className="size-3" />
                              Las dos coinciden
                            </>
                          ) : (
                            <>
                              <TriangleAlert aria-hidden="true" className="size-3" />
                              Todavía no coinciden
                            </>
                          )}
                        </p>
                      ) : null}
                    </Campo>
                  </div>

                  <Button
                    type="button"
                    className="mt-6 h-11 w-full rounded-xl font-medium"
                    disabled={ocupado || !claveValida(claveN) || claveN !== claveN2}
                    onClick={guardarClaveNueva}
                  >
                    {ocupado ? (
                      <>
                        <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                        Guardando…
                      </>
                    ) : (
                      "Guardar contraseña"
                    )}
                  </Button>
                </div>
              ) : paso === "otp" ? (
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      setPaso("datos")
                      setOtp("")
                      setAviso(null)
                    }}
                    className="flex items-center gap-1.5 text-sm text-foreground/50 transition-colors hover:text-foreground"
                  >
                    <ArrowLeft aria-hidden="true" className="size-4" />
                    Volver
                  </button>

                  <span className="mt-5 flex size-12 items-center justify-center rounded-xl border border-line bg-field text-cyan">
                    <Mail aria-hidden="true" className="size-5" />
                  </span>
                  <h2 className="mt-4 text-lg font-semibold text-foreground">
                    Revisá tu correo
                  </h2>
                  <p className="mt-1.5 text-sm leading-relaxed text-foreground/60">
                    Te enviamos un código de 6 números a{" "}
                    <span className="font-medium text-foreground">
                      {correo.trim().toLowerCase()}
                    </span>
                  </p>

                  <div className="mt-6">
                    <OtpInput
                      value={otp}
                      onChange={setOtp}
                      onComplete={verificarOtp}
                      disabled={ocupado}
                      autoFocus
                    />
                  </div>

                  {ocupado ? (
                    <p className="mt-4 flex items-center justify-center gap-2 text-sm text-foreground/60">
                      <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                      Verificando…
                    </p>
                  ) : (
                    <p className="mt-4 text-center text-xs text-foreground/45">
                      Se verifica solo al completar los 6 números.
                    </p>
                  )}

                  <div className="mt-5 border-t border-line pt-4 text-center">
                    <button
                      type="button"
                      onClick={reenviar}
                      disabled={segundos > 0 || ocupado}
                      className="text-sm text-foreground/50 transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:text-foreground/50"
                    >
                      {segundos > 0 ? `Reenviar código en ${segundos}s` : "Reenviar código"}
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  {/* Selector de pestaña */}
                  <div className="relative flex rounded-xl border border-line bg-field p-1">
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute inset-y-1 w-[calc(50%-0.25rem)] rounded-lg bg-cobalt transition-transform duration-200 ease-out",
                        pestana === "crear" && "translate-x-[calc(100%+0.5rem)]"
                      )}
                    />
                    {(["entrar", "crear"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => {
                          setPestana(t)
                          setAviso(null)
                          setOfrecerCodigo(false)
                        }}
                        className={cn(
                          "relative z-10 h-9 flex-1 rounded-lg text-sm font-medium transition-colors",
                          pestana === t ? "text-white" : "text-foreground/55 hover:text-foreground"
                        )}
                      >
                        {t === "entrar" ? "Entrar" : "Crear cuenta"}
                      </button>
                    ))}
                  </div>

                  {pestana === "entrar" ? (
                    <div className="mt-6">
                      <Campo id="correo" label="Correo" icon={Mail}>
                        <input
                          id="correo"
                          value={correo}
                          onChange={(e) => setCorreo(e.target.value)}
                          autoComplete="email"
                          inputMode="email"
                          placeholder="tu@correo.com"
                          className={campoClase}
                        />
                      </Campo>
                      <Campo id="clave" label="Contraseña" icon={Lock}>
                        <CampoClave
                          id="clave"
                          valor={clave}
                          onChange={setClave}
                          autoComplete="current-password"
                          onEnter={() => void entrar()}
                        />
                      </Campo>
                      <Button
                        type="button"
                        className="mt-6 h-11 w-full rounded-xl font-medium"
                        disabled={ocupado}
                        onClick={entrar}
                      >
                        {ocupado ? (
                          <>
                            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                            Entrando…
                          </>
                        ) : (
                          "Entrar"
                        )}
                      </Button>
                      {ofrecerCodigo ? (
                        <button
                          type="button"
                          onClick={() => void entrarConCodigo()}
                          disabled={ocupado}
                          className="mt-3 w-full text-center text-xs text-cyan underline-offset-4 transition-colors hover:text-foreground hover:underline disabled:opacity-50"
                        >
                          Entrar con un código al correo
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => {
                          setAviso(null)
                          setOfrecerCodigo(false)
                          setPaso("rec_correo")
                        }}
                        className="mt-3 w-full text-center text-xs text-foreground/45 underline-offset-4 transition-colors hover:text-foreground hover:underline"
                      >
                        ¿Olvidaste tu contraseña?
                      </button>
                    </div>
                  ) : (
                    <div className="mt-6">
                      <Campo id="nombre" label="Nombre de usuario" icon={User}>
                        <input
                          id="nombre"
                          value={nombre}
                          onChange={(e) => setNombre(e.target.value)}
                          autoComplete="username"
                          placeholder="Con el que te vamos a identificar"
                          className={campoClase}
                        />
                      </Campo>
                      <Campo id="correoN" label="Correo" icon={Mail}>
                        <input
                          id="correoN"
                          value={correoN}
                          onChange={(e) => setCorreoN(e.target.value)}
                          autoComplete="email"
                          inputMode="email"
                          placeholder="tu@correo.com"
                          className={campoClase}
                        />
                      </Campo>

                      <Campo id="claveN" label="Contraseña" icon={Lock}>
                        <CampoClave
                          id="claveN"
                          valor={claveN}
                          onChange={setClaveN}
                          autoComplete="new-password"
                          placeholder="Mínimo 8 caracteres"
                        />
                        <Requisitos clave={claveN} />
                        {claveN.length > 0 ? (
                          <div className="mt-2 flex items-center gap-2">
                            <div className="flex flex-1 gap-1">
                              {[0, 1, 2].map((i) => (
                                <span
                                  key={i}
                                  className={cn(
                                    "h-1 flex-1 rounded-full transition-colors",
                                    i < fuerza
                                      ? fuerza === 1
                                        ? "bg-amber-500"
                                        : fuerza === 2
                                          ? "bg-cyan"
                                          : "bg-emerald-500"
                                      : "bg-foreground/10"
                                  )}
                                />
                              ))}
                            </div>
                            <span className="text-[11px] text-foreground/45">
                              {fuerza <= 1 ? "Débil" : fuerza === 2 ? "Buena" : "Fuerte"}
                            </span>
                          </div>
                        ) : null}
                      </Campo>

                      <Campo id="claveN2" label="Repetí la contraseña" icon={Lock}>
                        <CampoClave
                          id="claveN2"
                          valor={claveN2}
                          onChange={setClaveN2}
                          autoComplete="new-password"
                        />
                        {claveN2.length > 0 ? (
                          <p
                            className={cn(
                              "mt-2 flex items-center gap-1.5 text-[11px]",
                              coinciden ? "text-emerald-500" : "text-destructive"
                            )}
                          >
                            {coinciden ? (
                              <>
                                <Check aria-hidden="true" className="size-3.5" />
                                Coinciden
                              </>
                            ) : (
                              <>
                                <TriangleAlert aria-hidden="true" className="size-3.5" />
                                No coinciden
                              </>
                            )}
                          </p>
                        ) : null}
                      </Campo>

                      <Campo id="pais" label="País" icon={Globe}>
                        <SearchableSelect
                          id="pais"
                          options={PAISES.map((p) => ({ value: p.iso, label: p.nombre, flag: p.iso }))}
                          value={pais}
                          onChange={setPais}
                          placeholder="Escribí tu país…"
                          emptyLabel="No encontramos ese país"
                          className="mt-0"
                        />
                      </Campo>

                      <Button
                        type="button"
                        className="mt-6 h-11 w-full rounded-xl font-medium"
                        disabled={!puedeCrear}
                        onClick={crear}
                      >
                        {ocupado ? (
                          <>
                            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                            Creando…
                          </>
                        ) : (
                          "Crear cuenta"
                        )}
                      </Button>
                      <p className="mt-3 text-center text-[11px] leading-relaxed text-foreground/40">
                        Te enviamos un código para validar tu correo acá mismo.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {aviso ? (
                <p
                  aria-live="polite"
                  className={cn(
                    "mt-5 flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs leading-relaxed",
                    aviso.error
                      ? "bg-destructive/10 text-destructive"
                      : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
                  )}
                >
                  {aviso.error ? (
                    <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                  ) : (
                    <Check aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                  )}
                  {aviso.texto}
                </p>
              ) : null}
            </div>

            <p className="mt-5 text-center text-xs leading-relaxed text-foreground/45">
              ¿Te quedaste sin créditos? Escribinos desde{" "}
              <Link to="/soporte" className="text-cyan transition-colors hover:text-foreground">
                Soporte
              </Link>
              .
            </p>
          </div>
        </div>
      </Container>
    </section>
  )
}
