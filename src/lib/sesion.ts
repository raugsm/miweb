/**
 * Sesión del cliente en este navegador, para las páginas AriTool.
 *
 * Es la misma sesión de Supabase que deja la pantalla de Ingresar. `nombre` es el del taller (sale de
 * `cliente_resumen`) y se guarda mientras dure la pestaña, así la barra de arriba no lo pide en cada página.
 */
import { useEffect, useState } from "react"

import { resumenCliente } from "@/lib/cuenta"
import { supabase } from "@/lib/supabase"

export type Sesion = {
  /** "cargando" mientras se lee; "sin" = nadie ingresó; "con" = hay sesión. */
  estado: "cargando" | "sin" | "con"
  correo: string
  jwt: string
  /** Nombre del taller; "" hasta que se sepa. */
  nombre: string
}

const CLAVE = "aritool-nombre"
const AVISO = "aritool:nombre"

function leerNombre(id: string): string {
  try {
    const g = JSON.parse(sessionStorage.getItem(CLAVE) ?? "null") as { id: string; nombre: string } | null
    return g && g.id === id ? g.nombre : ""
  } catch {
    return ""
  }
}

/** Guarda el nombre del cliente (lo llama Mi cuenta cuando ya lo tiene) y avisa a la barra. */
export function recordarNombre(id: string, nombre: string): void {
  try {
    sessionStorage.setItem(CLAVE, JSON.stringify({ id, nombre }))
  } catch {
    /* sin sessionStorage: vale igual para esta página. */
  }
  window.dispatchEvent(new CustomEvent(AVISO, { detail: { id, nombre } }))
}

export function useSesion(): Sesion {
  const [sesion, setSesion] = useState<Sesion>({ estado: "cargando", correo: "", jwt: "", nombre: "" })
  const [id, setId] = useState("")

  useEffect(() => {
    let vivo = true
    const poner = (s: { access_token: string; user: { id: string; email?: string } } | null) => {
      if (!vivo) return
      setId(s?.user.id ?? "")
      setSesion(s ? { estado: "con", correo: s.user.email ?? "", jwt: s.access_token, nombre: leerNombre(s.user.id) } : { estado: "sin", correo: "", jwt: "", nombre: "" })
    }
    void supabase.auth.getSession().then(({ data }) => poner(data.session)).catch(() => poner(null))
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, s) => poner(s))
    return () => {
      vivo = false
      sub.subscription.unsubscribe()
    }
  }, [])

  // El nombre: si otra parte de la página ya lo consiguió, se toma de ahí; si no, se pide una vez.
  useEffect(() => {
    if (!id || !sesion.jwt) return
    const escuchar = (e: Event) => {
      const d = (e as CustomEvent<{ id: string; nombre: string }>).detail
      if (d.id === id) setSesion((s) => ({ ...s, nombre: d.nombre }))
    }
    window.addEventListener(AVISO, escuchar)
    const espera = window.setTimeout(() => {
      if (leerNombre(id)) return
      void resumenCliente(sesion.jwt).then((r) => {
        if (r.ok && r.data?.nombre) recordarNombre(id, r.data.nombre)
      }).catch(() => { /* sin nombre: la barra muestra las iniciales del correo. */ })
    }, 1200)
    return () => {
      window.removeEventListener(AVISO, escuchar)
      window.clearTimeout(espera)
    }
  }, [id, sesion.jwt])

  return sesion
}
