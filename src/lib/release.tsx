import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"

import { product } from "@/data/product"

// Datos públicos del proyecto: la página le pregunta a version_web cuál es la
// versión vigente. Esa función mira las carpetas de AriTool-Cliente, se queda
// con la de número más alto y devuelve el INSTALADOR que hay adentro. Publicar
// es subir la carpeta: la página se entera sola (versión, enlace y fecha).
//
// Ojo: NO usa version_consultar. Esa sirve el exe suelto con el que la app se
// reemplaza a sí misma al actualizarse; si la web ofreciera ese archivo, el
// técnico se bajaría el programa sin instalador.
const SUPABASE_URL = "https://sdarsjdwnuimjruthjwz.supabase.co"
const SUPABASE_KEY = "sb_publishable_XVMUL7TMS7SjAtKV42Hn6g_Bpksm3Ux"

// Enlace de soporte por defecto (se reemplaza por el del servidor si está fijado).
const SOPORTE_FALLBACK = "https://wa.me/51935186037"

// Cada cuánto vuelve a preguntar la pestaña que está a la vista.
const REFRESCO_MS = 60_000

type LiveRelease = {
  version: string
  url: string
  fecha: string | null
  soporte: string
}

export type Release = {
  version: string
  versionLabel: string
  buildDateLabel: string
  downloadUrl: string
  downloadAvailable: boolean
  live: boolean
  soporte: string
  /**
   * false hasta que la primera consulta a Supabase se asienta (con éxito o
   * error). Deja distinguir "todavía cargando" de "no hay versión": el botón
   * de descarga muestra un loader en vez de aparecer muerto sin explicación.
   */
  resolved: boolean
}

function formatFecha(iso: string | null): string | null {
  if (!iso) {
    return null
  }
  // Date-only strings are parsed as UTC midnight by spec; force local time to avoid
  // rendering the previous day in negative-offset timezones.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(iso)
    ? new Date(`${iso}T00:00:00`)
    : new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  return date.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

/**
 * Convierte la direccion del archivo en una descarga de verdad.
 *
 * Sin esto el navegador decide solo: el archivo llega con un tipo generico y,
 * segun el navegador, se abre una pestana o se sale de la pagina en vez de
 * bajarlo. El parametro `download` hace que el servidor conteste "esto es un
 * archivo adjunto, guardalo", y ademas le pone nombre limpio.
 *
 * El atributo `download` del enlace no alcanza: los navegadores solo lo
 * respetan si el archivo esta en el mismo dominio, y este vive en Supabase.
 */
function comoDescarga(url: string): string {
  if (!url) return url
  const nombre = url.split("/").pop() || "Ari-Tool.exe"
  const separador = url.includes("?") ? "&" : "?"
  return `${url}${separador}download=${encodeURIComponent(nombre)}`
}

function resolveRelease(live: LiveRelease | null, soporte: string, resolved: boolean): Release {
  if (live) {
    return {
      version: live.version,
      versionLabel: `v${live.version}`,
      buildDateLabel: formatFecha(live.fecha) ?? product.buildDateLabel,
      downloadUrl: comoDescarga(live.url) || product.downloadPath,
      downloadAvailable: Boolean(live.url),
      live: true,
      soporte: soporte || live.soporte || SOPORTE_FALLBACK,
      resolved,
    }
  }

  return {
    version: product.version,
    versionLabel: product.versionLabel,
    buildDateLabel: product.buildDateLabel,
    downloadUrl: product.downloadPath,
    downloadAvailable: product.downloadAvailable,
    live: false,
    soporte: soporte || SOPORTE_FALLBACK,
    resolved,
  }
}

const ReleaseContext = createContext<Release>(resolveRelease(null, "", false))

export function ReleaseProvider({ children }: { children: ReactNode }) {
  const [live, setLive] = useState<LiveRelease | null>(null)
  const [soporte, setSoporte] = useState<string>("")
  const [resolved, setResolved] = useState(false)

  useEffect(() => {
    let alive = true

    async function load() {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/version_web`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_KEY,
          },
          body: JSON.stringify({}),
        })
        if (!res.ok) {
          return
        }
        const data = (await res.json()) as {
          version?: string | null
          url_descarga?: string
          fecha?: string | null
          soporte?: string
        }
        if (!alive) {
          return
        }
        // El WhatsApp de soporte llega SIEMPRE (haya o no versión publicada).
        if (data?.soporte) {
          setSoporte(data.soporte)
        }
        if (!data?.version) {
          return
        }
        const recibido: LiveRelease = {
          version: data.version,
          url: data.url_descarga ?? "",
          fecha: data.fecha ?? null,
          soporte: data.soporte ?? "",
        }
        setLive((previo) =>
          previo &&
          previo.version === recibido.version &&
          previo.url === recibido.url &&
          previo.fecha === recibido.fecha
            ? previo
            : recibido
        )
      } catch {
        // Sin conexión o sin versión publicada: la página sigue con los datos locales.
      } finally {
        // Con éxito o error, la primera consulta ya se asentó: los loaders paran.
        if (alive) {
          setResolved(true)
        }
      }
    }

    // Sin recargar: la pestaña vuelve a preguntar sola. Cada minuto mientras
    // se la está mirando, y siempre al volver a ella desde otra pestaña, que
    // es cuando uno acaba de subir la versión y se da la vuelta a mirar.
    // Con la pestaña de fondo no consulta: no tiene sentido gastar llamadas
    // contra algo que nadie está viendo.
    void load()

    const reloj = window.setInterval(() => {
      if (!document.hidden) {
        void load()
      }
    }, REFRESCO_MS)

    // Al volver a la pestaña saltan 'visibilitychange' y 'focus' casi juntos.
    // Sin esta pausa serian dos consultas para la misma vuelta.
    let ultima = 0
    const alVolver = () => {
      const ahora = Date.now()
      if (document.hidden || ahora - ultima < 5000) {
        return
      }
      ultima = ahora
      void load()
    }
    document.addEventListener("visibilitychange", alVolver)
    window.addEventListener("focus", alVolver)

    return () => {
      alive = false
      window.clearInterval(reloj)
      document.removeEventListener("visibilitychange", alVolver)
      window.removeEventListener("focus", alVolver)
    }
  }, [])

  const value = useMemo(() => resolveRelease(live, soporte, resolved), [live, soporte, resolved])

  return <ReleaseContext.Provider value={value}>{children}</ReleaseContext.Provider>
}

export function useRelease(): Release {
  return useContext(ReleaseContext)
}
