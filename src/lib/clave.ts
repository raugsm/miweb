/**
 * Reglas y mensajes de contraseña, compartidos por las pantallas de cuenta
 * (crear/recuperar) y por la sección "Cambiar contraseña" de Mi cuenta.
 *
 * Son las mismas reglas que exige Supabase Auth (`signUp`/`updateUser`): si acá
 * dice que pasa, el servidor la acepta; si el servidor la rechaza igual (por
 * filtraciones), `mensajeClave` traduce el motivo.
 */

export type ReglaClave = { texto: string; ok: boolean }

/** Lo que Supabase exige para aceptar una contraseña (mismas reglas que la app). */
export function reglasClave(clave: string): ReglaClave[] {
  return [
    { texto: "8 caracteres o más", ok: clave.length >= 8 },
    { texto: "Una mayúscula", ok: /[A-Z]/.test(clave) },
    { texto: "Una minúscula", ok: /[a-z]/.test(clave) },
    { texto: "Un número", ok: /[0-9]/.test(clave) },
  ]
}

export const claveValida = (clave: string) => reglasClave(clave).every((r) => r.ok)

/** Traduce el rechazo de Supabase al guardar una contraseña (responde en inglés). */
export function mensajeClave(mensaje: string): string {
  const m = mensaje.toLowerCase()
  if (m.includes("easy to guess") || m.includes("pwned") || m.includes("leaked")) return "Esa contraseña ya apareció en filtraciones de otros sitios. Elegí una distinta."
  if (m.includes("at least one character of each")) return "Te falta una minúscula, una mayúscula o un número."
  if (m.includes("should be at least") || m.includes("length")) return "La contraseña necesita al menos 8 caracteres."
  if (m.includes("same") || m.includes("different from the old")) return "Esa es la contraseña que ya tenías. Elegí una nueva."
  return "No se pudo guardar la contraseña. Probá con otra."
}

export type CambioClave = { actual: string; nueva: string; repetir: string }

/** Errores por campo del formulario de cambio de contraseña (vacío = todo bien). */
export type ErroresCambio = Partial<Record<"actual" | "nueva" | "repetir", string>>

/**
 * Valida el formulario antes de llamar a Supabase. No sabe si la contraseña
 * actual es correcta: eso lo confirma el servidor al reautenticar.
 */
export function revisarCambio({ actual, nueva, repetir }: CambioClave): ErroresCambio {
  const errores: ErroresCambio = {}
  if (!actual) errores.actual = "Escribí tu contraseña actual."
  if (!nueva) errores.nueva = "Escribí la contraseña nueva."
  else if (!claveValida(nueva)) errores.nueva = "Necesita 8 caracteres, una mayúscula, una minúscula y un número."
  else if (actual && nueva === actual) errores.nueva = "Esa es la contraseña que ya tenías. Elegí una nueva."
  if (!repetir) errores.repetir = "Repetí la contraseña nueva."
  else if (nueva !== repetir) errores.repetir = "Las contraseñas no coinciden."
  return errores
}
