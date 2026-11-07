/**
 * Precios y catálogo EN VIVO de la web AriTool.
 *
 * Lee la MISMA fuente que la app: `sop_publico.precios(p_pais)` en la base de producción
 * (regla W8 de Peter: nada hardcodeado, "que la web nunca muestre algo falso"). Es la ÚNICA
 * puerta pública (anon) a precios; nunca expone costo, ganancia, recargo ni stock.
 *
 * La respuesta se cachea ~60 s por país (la función es STABLE). El país se detecta solo,
 * se puede cambiar arriba y se recuerda en el navegador.
 */
import { supabase } from "@/lib/supabase"

/** Moneda de cada país (enum del backend). */
export type Moneda = "pen" | "mxn" | "cop" | "clp" | "ars" | "usd" | "usdt"

export type PaisPrecios = {
  codigo: string
  nombre: string
  moneda: Moneda
  tasa: number
}

export type ServicioPrecio = {
  clave: string
  nombre: string
  /** USD; null = sin precio para ese país. */
  precio_usd: number | null
  /** En la moneda local (precio_usd × tasa); null = sin precio. */
  precio_local: number | null
  moneda: Moneda
  palabras_clave: string[]
  /** false = sin precio para ese país (no "Próximamente"). */
  disponible: boolean
}

export type HerramientaPrecio = {
  clave: string
  nombre: string
  horas: number
  /** Precio del momento en USDT; null si la herramienta no está disponible. */
  precio_usdt: number | null
  /** Precio del momento en la moneda local; null si no disponible. */
  precio_local: number | null
  moneda: Moneda
  /** Aviso del panel (ej. "En mantenimiento"). Si hay, la web lo muestra; si no y !disponible, "Próximamente". */
  aviso: string | null
  palabras_clave: string[]
  /** false = apagada/mantenimiento → la web muestra el aviso o "Próximamente". */
  disponible: boolean
}

// La lista vive aparte para que también la pueda leer el test del buscador con Node.
export { HERRAMIENTAS_OCULTAS, herramientaVisible } from "./herramientas-ocultas.ts"

/** Precios de la app (crédito/licencia) desde negocio.parametro. Llega desde v1.2 del backend; antes undefined. */
export type AppPrecios = {
  credito_usd: number | null
  licencia_anual_usd: number | null
  credito_local: number | null
  licencia_anual_local: number | null
}

export type Precios = {
  pais: PaisPrecios
  /** Lista de países para el selector (data-driven). Llega desde v1.1 del backend; antes es undefined. */
  paises?: Array<{ codigo: string; nombre: string; moneda: Moneda }>
  servicios: ServicioPrecio[]
  herramientas: HerramientaPrecio[]
  /** Precios de la app (crédito/licencia). Llega desde v1.2; antes undefined. */
  app?: AppPrecios
  soporte: { whatsapp: string | null }
  actualizado_en: string
}

/** Símbolo corto de la moneda (para pills): pen→"S/", usdt→"USDT", resto→"$". */
export function simboloMoneda(m: Moneda): string {
  if (m === "pen") return "S/"
  if (m === "usdt" || m === "usd") return "USDT"
  return "$"
}

/** Nombre de la moneda (para "Precios en ___"): pen→"soles", usdt→"USDT", resto→"pesos". */
export function nombreMoneda(m: Moneda): string {
  if (m === "pen") return "soles"
  if (m === "usdt" || m === "usd") return "USDT"
  return "pesos"
}

/**
 * Países que atendemos (para el selector de arriba). El precio y la moneda reales salen de la
 * respuesta; esta lista es solo las opciones y su bandera. Coincide con sop_frp.pais (activos).
 * TODO: cuando el backend exponga la lista en el payload, consumirla de ahí.
 */
export const PAISES: ReadonlyArray<{ codigo: string; nombre: string; bandera: string }> = [
  { codigo: "PE", nombre: "Perú", bandera: "🇵🇪" },
  { codigo: "MX", nombre: "México", bandera: "🇲🇽" },
  { codigo: "CO", nombre: "Colombia", bandera: "🇨🇴" },
  { codigo: "CL", nombre: "Chile", bandera: "🇨🇱" },
  { codigo: "AR", nombre: "Argentina", bandera: "🇦🇷" },
  { codigo: "EC", nombre: "Ecuador", bandera: "🇪🇨" },
  { codigo: "WW", nombre: "Mundial (USDT)", bandera: "🌎" },
]

const CLAVE_PAIS = "aritool-pais"
const CODIGOS = new Set(PAISES.map((p) => p.codigo))

/** Bandera (emoji) por código de país. Presentación, no viene del backend. */
const BANDERAS: Record<string, string> = Object.fromEntries(
  PAISES.map((p) => [p.codigo, p.bandera])
)
export function banderaDe(codigo: string): string {
  return BANDERAS[codigo] ?? "🌎"
}

/**
 * Lista para el selector de país: la del backend (`payload.paises`, data-driven) si vino; si no,
 * la constante PAISES. Siempre con bandera para la UI.
 */
export function paisesDisponibles(
  p?: Precios | null
): ReadonlyArray<{ codigo: string; nombre: string; bandera: string }> {
  if (p?.paises?.length) {
    const lista = p.paises.map((x) => ({ codigo: x.codigo, nombre: x.nombre, bandera: banderaDe(x.codigo) }))
    // "Mundial (USDT)" va al final, aunque el backend lo devuelva primero (orden 2).
    return [...lista.filter((x) => x.codigo !== "WW"), ...lista.filter((x) => x.codigo === "WW")]
  }
  return PAISES
}

/**
 * Zonas horarias de los países que manejamos: la señal más cercana a "desde dónde lo están viendo"
 * sin pedir IP ni llamar a un servicio externo. Si la zona no está, se usa la región del navegador.
 */
const PAIS_POR_ZONA: Record<string, string> = {
  "America/Lima": "PE",
  "America/Mexico_City": "MX",
  "America/Cancun": "MX",
  "America/Merida": "MX",
  "America/Monterrey": "MX",
  "America/Matamoros": "MX",
  "America/Chihuahua": "MX",
  "America/Ciudad_Juarez": "MX",
  "America/Hermosillo": "MX",
  "America/Mazatlan": "MX",
  "America/Tijuana": "MX",
  "America/Bahia_Banderas": "MX",
  "America/Bogota": "CO",
  "America/Santiago": "CL",
  "America/Punta_Arenas": "CL",
  "Pacific/Easter": "CL",
  "America/Argentina/Buenos_Aires": "AR",
  "America/Argentina/Cordoba": "AR",
  "America/Argentina/Mendoza": "AR",
  "America/Argentina/Salta": "AR",
  "America/Argentina/Tucuman": "AR",
  "America/Argentina/Ushuaia": "AR",
  "America/Argentina/Rio_Gallegos": "AR",
  "America/Argentina/Catamarca": "AR",
  "America/Argentina/Jujuy": "AR",
  "America/Argentina/La_Rioja": "AR",
  "America/Argentina/San_Juan": "AR",
  "America/Argentina/San_Luis": "AR",
  // Nombres viejos que algunos navegadores todavía devuelven para Argentina.
  "America/Buenos_Aires": "AR",
  "America/Cordoba": "AR",
  "America/Mendoza": "AR",
  "America/Salta": "AR",
  "America/Tucuman": "AR",
  "America/Ushuaia": "AR",
  "America/Rio_Gallegos": "AR",
  "America/Catamarca": "AR",
  "America/Jujuy": "AR",
  "America/La_Rioja": "AR",
  "America/San_Juan": "AR",
  "America/San_Luis": "AR",
  "America/Guayaquil": "EC",
  "Pacific/Galapagos": "EC",
}

/** ?pais= de la dirección (y se recuerda) > país recordado > zona horaria > región del navegador (es-PE → PE) > WW. Siempre uno de PAISES. */
export function detectarPais(): string {
  try {
    const pedido = new URLSearchParams(window.location.search).get("pais")?.toUpperCase()
    if (pedido && CODIGOS.has(pedido)) {
      recordarPais(pedido)
      return pedido
    }
  } catch {
    /* sin dirección que leer; seguimos. */
  }
  try {
    const guardado = localStorage.getItem(CLAVE_PAIS)
    if (guardado && CODIGOS.has(guardado)) return guardado
  } catch {
    /* localStorage puede fallar (modo privado); seguimos. */
  }
  try {
    const zona = Intl.DateTimeFormat().resolvedOptions().timeZone
    const porZona = PAIS_POR_ZONA[zona]
    if (porZona) return porZona
  } catch {
    /* sin zona horaria; seguimos. */
  }
  try {
    const region = new Intl.Locale(navigator.language).region
    if (region && CODIGOS.has(region)) return region
  } catch {
    /* navigator.language raro; seguimos. */
  }
  return "WW"
}

/** Recuerda el país elegido. No rompe si localStorage no está disponible. */
export function recordarPais(codigo: string): void {
  try {
    localStorage.setItem(CLAVE_PAIS, codigo)
  } catch {
    /* sin persistencia: se usa igual en esta sesión. */
  }
}

/** true si el país vino de `?pais=` o de una elección guardada: el visitante ya eligió y la IP no manda. */
export function paisElegido(): boolean {
  try {
    const pedido = new URLSearchParams(window.location.search).get("pais")?.toUpperCase()
    if (pedido && CODIGOS.has(pedido)) return true
  } catch {
    /* sin dirección que leer; seguimos. */
  }
  try {
    const guardado = localStorage.getItem(CLAVE_PAIS)
    return Boolean(guardado && CODIGOS.has(guardado))
  } catch {
    return false
  }
}

/**
 * Traduce el país que devuelve la IP (Cloudflare `CF-IPCountry`) al país de la web.
 * - null: no se pudo saber (sin cabecera, Tor, desconocido) → se usa zona horaria/idioma.
 * - "WW": está fuera de los países que manejamos → precios en USDT.
 */
export function paisDeIp(codigo: string | null | undefined): string | null {
  if (!codigo) return null
  const c = String(codigo).toUpperCase()
  if (!/^[A-Z]{2}$/.test(c) || c === "XX" || c === "T1") return null
  return CODIGOS.has(c) ? c : "WW"
}

// --- Caché simple en memoria: ~60 s por país (la función es STABLE). ---
const TTL_MS = 60_000
const cache = new Map<string, { datos: Precios; en: number }>()
// Pedido en curso por país: si dos partes de la página piden a la vez, viaja uno solo.
const enCurso = new Map<string, Promise<Precios>>()

/**
 * Trae precios + catálogo del país. Cachea 60 s. Lanza si la red/base falla (el llamador
 * muestra el estado "no se pudo leer"; las tarjetas nunca inventan un número).
 */
export async function traerPrecios(pais: string, opciones?: { forzar?: boolean }): Promise<Precios> {
  const clave = (pais || "WW").toUpperCase()
  const ahora = Date.now()
  const hit = cache.get(clave)
  if (!opciones?.forzar && hit && ahora - hit.en < TTL_MS) return hit.datos

  const pendiente = enCurso.get(clave)
  if (pendiente) return pendiente

  const pedido = (async () => {
    const { data, error } = await supabase
      .schema("sop_publico")
      .rpc("precios", { p_pais: clave })
    if (error) throw error
    if (!data || typeof data !== "object") throw new Error("precios_respuesta_invalida")

    const datos = data as Precios
    cache.set(clave, { datos, en: Date.now() })
    return datos
  })().finally(() => enCurso.delete(clave))
  enCurso.set(clave, pedido)
  return pedido
}

/** Limpia la caché (ej. tras cambiar de país o para forzar un refresco). */
export function limpiarCachePrecios(): void {
  cache.clear()
}

/**
 * Formatea un monto en su moneda para mostrarlo al cliente. Presentación pura.
 * pen → "S/ 8.52" · mxn → "$ 46.73" · cop/clp → "$ 54.450" (sin decimales) · usdt → "2.40 USDT".
 */
export function formatearPrecio(monto: number, moneda: Moneda): string {
  const n = (dec: number) =>
    monto.toLocaleString("es-PE", { minimumFractionDigits: dec, maximumFractionDigits: dec })
  switch (moneda) {
    case "pen":
      return `S/ ${n(2)}`
    case "mxn":
      return `$ ${n(2)}`
    case "cop":
    case "clp":
    case "ars":
      return `$ ${n(0)}`
    case "usd":
      return `$ ${n(2)}`
    case "usdt":
      return `${n(2)} USDT`
    default:
      return n(2)
  }
}
