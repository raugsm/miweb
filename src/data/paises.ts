// Países del mundo con bandera disponible.
//
// Se listan los códigos ISO 3166-1 alpha-2 que tienen bandera en `flag-icons`
// (255 en total). Los nombres NO se escriben a mano: los resuelve
// `Intl.DisplayNames` en español, así quedan siempre bien escritos y
// acentuados, y se ordenan con las reglas del idioma.

export const CODIGOS_PAIS: string[] = [
  "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AQ", "AR", "AS", "AT",
  "AU", "AW", "AX", "AZ", "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI",
  "BJ", "BL", "BM", "BN", "BO", "BQ", "BR", "BS", "BT", "BV", "BW", "BY",
  "BZ", "CA", "CC", "CD", "CF", "CG", "CH", "CI", "CK", "CL", "CM", "CN",
  "CO", "CP", "CR", "CU", "CV", "CW", "CX", "CY", "CZ", "DE", "DG", "DJ",
  "DK", "DM", "DO", "DZ", "EC", "EE", "EG", "EH", "ER", "ES", "ET", "EU",
  "FI", "FJ", "FK", "FM", "FO", "FR", "GA", "GB", "GD", "GE", "GF", "GG",
  "GH", "GI", "GL", "GM", "GN", "GP", "GQ", "GR", "GS", "GT", "GU", "GW",
  "GY", "HK", "HM", "HN", "HR", "HT", "HU", "IC", "ID", "IE", "IL", "IM",
  "IN", "IO", "IQ", "IR", "IS", "IT", "JE", "JM", "JO", "JP", "KE", "KG",
  "KH", "KI", "KM", "KN", "KP", "KR", "KW", "KY", "KZ", "LA", "LB", "LC",
  "LI", "LK", "LR", "LS", "LT", "LU", "LV", "LY", "MA", "MC", "MD", "ME",
  "MF", "MG", "MH", "MK", "ML", "MM", "MN", "MO", "MP", "MQ", "MR", "MS",
  "MT", "MU", "MV", "MW", "MX", "MY", "MZ", "NA", "NC", "NE", "NF", "NG",
  "NI", "NL", "NO", "NP", "NR", "NU", "NZ", "OM", "PA", "PE", "PF", "PG",
  "PH", "PK", "PL", "PM", "PN", "PR", "PS", "PT", "PW", "PY", "QA", "RE",
  "RO", "RS", "RU", "RW", "SA", "SB", "SC", "SD", "SE", "SG", "SH", "SI",
  "SJ", "SK", "SL", "SM", "SN", "SO", "SR", "SS", "ST", "SV", "SX", "SY",
  "SZ", "TC", "TD", "TF", "TG", "TH", "TJ", "TK", "TL", "TM", "TN", "TO",
  "TR", "TT", "TV", "TW", "TZ", "UA", "UG", "UM", "UN", "US", "UY", "UZ",
  "VA", "VC", "VE", "VG", "VI", "VN", "VU", "WF", "WS", "XK", "YE", "YT",
  "ZA", "ZM", "ZW",
]

export type Pais = { iso: string; nombre: string }

function resolverNombres(): Pais[] {
  let nombreDe: (iso: string) => string
  try {
    const dn = new Intl.DisplayNames(["es"], { type: "region" })
    nombreDe = (iso) => dn.of(iso) ?? iso
  } catch {
    // Navegador sin Intl.DisplayNames: se muestra el código.
    nombreDe = (iso) => iso
  }
  return CODIGOS_PAIS.map((iso) => ({ iso, nombre: nombreDe(iso) })).sort((a, b) =>
    a.nombre.localeCompare(b.nombre, "es")
  )
}

/** Los 255 países, ordenados alfabéticamente en español. */
export const PAISES: Pais[] = resolverNombres()
