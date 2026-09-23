import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase"

export type ResumenCliente = {
  nombre: string
  saldo: number
  totales: { procesos: number; consumidos: number; recargados: number }
  trabajos: { folio: string; estado: string; fecha: string; modelo: string }[]
  movimientos: {
    tipo: string
    cantidad: number
    saldo_despues: number
    motivo: string
    referencia: string
    fecha_registro: string
  }[]
  parametros: Record<string, string>
}

type EdgeResult<T> = { ok: boolean; status: number; data: T | null; txt: string }

async function edge<T>(funcion: string, cuerpo: object, jwt?: string): Promise<EdgeResult<T>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: SUPABASE_KEY,
  }
  if (jwt) {
    headers.Authorization = `Bearer ${jwt}`
  }
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${funcion}`, {
    method: "POST",
    headers,
    body: JSON.stringify(cuerpo),
  })
  const txt = await res.text()
  let data: T | null = null
  try {
    data = txt ? (JSON.parse(txt) as T) : null
  } catch {
    data = null
  }
  return { ok: res.ok, status: res.status, data, txt }
}

/**
 * Login DE LA WEB. No habla directo con Supabase a propósito: al pasar por
 * nuestra función, cada intento queda contado y, pasado el tope, la cuenta se
 * bloquea 15 minutos en el origen. Ese bloqueo también frena a quien prueba
 * contraseñas por fuera de la web, porque cae sobre la cuenta.
 *
 * `error`:
 *   "credenciales"      correo o contraseña que no coinciden (no dice cuál)
 *   "bloqueo_temporal"  demasiados fallos seguidos; trae `minutos`
 */
export function entrarWeb(correo: string, clave: string) {
  return edge<{
    sesion?: { access_token: string; refresh_token: string; expires_in: number }
    error?: string
    minutos?: number
  }>("acceso_entrar", { correo, clave })
}

/** Resumen del cliente para el dashboard (saldo, licencia, trabajos, movimientos). */
export function resumenCliente(jwt: string) {
  return edge<ResumenCliente>("cliente_resumen", {}, jwt)
}

/**
 * Registro de un técnico.
 *
 * `estado`:
 *   - "pendiente"  cuenta creada; falta validar el correo con el código.
 *   - "ya_existe"  ese correo YA tiene cuenta. No se vuelve a registrar ni se
 *                  toca su contraseña: debe entrar, o pedir un código.
 */
export function solicitarAcceso(
  correo: string,
  clave: string,
  nombre: string,
  pais: string,
  telefono?: string
) {
  return edge<{ estado?: string; error?: string }>("acceso_solicitar", {
    correo,
    clave,
    nombre,
    pais,
    telefono: telefono ?? null,
  })
}

/** ¿La cuenta ya validó su registro con el OTP único? Devuelve también su estado. */
export function verificado(jwt: string) {
  return edge<{ verificado: boolean; estado?: string }>("acceso_verificado", {}, jwt)
}

/** Marca el registro como validado tras el OTP único. */
export function confirmar(jwt: string) {
  return edge<{ estado?: string }>("acceso_confirmar", {}, jwt)
}

/** Completa el registro de una cuenta autenticada sin perfil.
 */
export function completarCuenta(jwt: string, nombre: string, pais: string) {
  return edge<{ estado?: string; error?: string }>("cuenta_completar", { nombre, pais }, jwt)
}
