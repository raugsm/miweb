/**
 * Buscador de la web AriTool (W4/W5/W6) — lógica pura, sin red ni React.
 *
 * Busca sobre el catálogo EN VIVO que ya trajo `sop_publico.precios` (regla W8 #4): por NOMBRE y por
 * las PALABRAS CLAVE que se cargan en el panel. También mira el renglón chico que la fila muestra
 * ("Alquiler · 6 h", "Servicio remoto, desde la app"), así "alquiler" encuentra las herramientas.
 * Acá no hay ninguna palabra clave escrita a mano: si el panel no las cargó, no existen.
 *
 * Máximo 6 resultados. Nunca inventa un precio: `precio` null = la fila dice "Precio en la app".
 */
import type { Moneda, Precios } from "@/lib/precios"

export const MAX_RESULTADOS = 6

/** Nombre que usa la web cuando difiere del de la base (aprobado en el Figma). */
export const NOMBRE_WEB: Record<string, string> = { cuenta_mi: "Cuenta MI" }

/** La app AriTool no viene como servicio en el catálogo: es la tarjeta fija del Inicio. */
export const APP_ARITOOL = {
  clave: "aritool_app",
  nombre: "AriTool · Security Plugin y AntiCrack",
  detalle: "Tecno · Infinix · itel",
}

export type Resultado = {
  tipo: "herramienta" | "servicio" | "app"
  clave: string
  nombre: string
  /** Renglón chico debajo del nombre. */
  detalle: string
  /** Precio en `moneda`; null = no hay precio para mostrar (nunca se inventa). */
  precio: number | null
  moneda: Moneda
  /** false = herramienta apagada o en mantenimiento → "Próximamente". */
  disponible: boolean
}

type Entrada = Resultado & { nombres: string[]; extra: string[] }

/** Minúsculas, sin tildes, y todo lo que no sea letra o número pasa a espacio. */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function entradas(datos: Precios): Entrada[] {
  const lista: Entrada[] = []
  for (const s of datos.servicios) {
    // "alquiler" es el rubro, no algo que se elige: sus herramientas van una por una abajo.
    if (s.clave === "alquiler") continue
    const nombre = NOMBRE_WEB[s.clave] ?? s.nombre
    const detalle = "Servicio remoto, desde la app"
    lista.push({
      tipo: "servicio",
      clave: s.clave,
      nombre,
      detalle,
      precio: s.precio_local,
      moneda: s.moneda,
      disponible: true,
      nombres: [nombre, s.nombre].map(normalizar),
      extra: [detalle, ...(s.palabras_clave ?? [])].map(normalizar),
    })
  }
  for (const h of datos.herramientas) {
    const detalle = h.disponible ? `Alquiler · ${h.horas} h` : "Alquiler"
    lista.push({
      tipo: "herramienta",
      clave: h.clave,
      nombre: h.nombre,
      detalle,
      precio: h.disponible ? h.precio_local : null,
      moneda: h.moneda,
      disponible: h.disponible,
      nombres: [normalizar(h.nombre)],
      extra: [detalle, ...(h.palabras_clave ?? [])].map(normalizar),
    })
  }
  lista.push({
    tipo: "app",
    clave: APP_ARITOOL.clave,
    nombre: APP_ARITOOL.nombre,
    detalle: APP_ARITOOL.detalle,
    precio: datos.app?.credito_usd ?? null,
    moneda: "usd",
    disponible: true,
    nombres: [normalizar(APP_ARITOOL.nombre)],
    extra: [normalizar(APP_ARITOOL.detalle)],
  })
  return lista
}

const empiezaPalabra = (texto: string, parte: string) => texto.split(" ").some((p) => p.startsWith(parte))
// Una o dos letras sueltas solo valen como comienzo de palabra ("mi" no es "xiaoMI").
const contiene = (texto: string, parte: string) => parte.length >= 3 && texto.includes(parte)

/** 0 = el nombre empieza así · 1 = palabras del nombre · 2 = dentro del nombre · 3 = palabra clave o renglón chico. */
function puntaje(e: Entrada, consulta: string, partes: string[]): number | null {
  if (e.nombres.some((n) => n.startsWith(consulta))) return 0
  if (e.nombres.some((n) => partes.every((p) => empiezaPalabra(n, p)))) return 1
  if (e.nombres.some((n) => partes.every((p) => empiezaPalabra(n, p) || contiene(n, p)))) return 2
  const todo = [...e.nombres, ...e.extra]
  if (partes.every((p) => todo.some((t) => empiezaPalabra(t, p) || contiene(t, p)))) return 3
  return null
}

/** Resultados para lo que escribió la persona. Vacío si no escribió nada o si no hay nada que coincida. */
export function buscar(datos: Precios | null, texto: string): Resultado[] {
  const consulta = normalizar(texto)
  if (!datos || !consulta) return []
  const partes = consulta.split(" ")
  return entradas(datos)
    .map((e, orden) => ({ e, orden, p: puntaje(e, consulta, partes) }))
    .filter((x): x is { e: Entrada; orden: number; p: number } => x.p !== null)
    .sort((a, b) => a.p - b.p || Number(b.e.disponible) - Number(a.e.disponible) || a.orden - b.orden)
    .slice(0, MAX_RESULTADOS)
    .map(({ e }) => ({
      tipo: e.tipo,
      clave: e.clave,
      nombre: e.nombre,
      detalle: e.detalle,
      precio: e.precio,
      moneda: e.moneda,
      disponible: e.disponible,
    }))
}
