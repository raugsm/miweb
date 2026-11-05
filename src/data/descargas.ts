/**
 * Páginas oficiales de descarga por herramienta (enlaces que me pasó Peter, 4-nov).
 *
 * INTERINO: por ahora el botón "Descargar programa" abre la página oficial (modo "abrir página oficial"
 * de la regla W8 #16). La descarga directa + chequeo diario vive en la propuesta de backend
 * `20261104-descargas-herramienta` (pendiente de OK de Peter); cuando esté, estos datos saldrán del panel
 * y algunas herramientas pasarán a "baja solo". Clave = clave de sop_alquiler.herramienta.
 */
export type DescargaTool = {
  /** Página oficial para descargar (modo fallback). */
  pagina: string
  /** Dominio oficial que se muestra al cliente ("se abre su página oficial · unlocktool.net"). */
  dominio: string
}

export const DESCARGAS: Record<string, DescargaTool> = {
  android_multi_tool: { pagina: "https://androidmultitool.com/", dominio: "androidmultitool.com" },
  dft_pro: { pagina: "https://www.dftpro.com/#downloads-section", dominio: "dftpro.com" },
  tsm_tool_pro: { pagina: "https://tsm-tool.com/download", dominio: "tsm-tool.com" },
  unlock_tool: { pagina: "https://unlocktool.net/download/", dominio: "unlocktool.net" },
  ts_tool: { pagina: "https://tstool.app/", dominio: "tstool.app" },
  tr_tools_pro: { pagina: "https://www.trtools.pro/tr/download", dominio: "trtools.pro" },
  tfm_tool_pro: { pagina: "https://beta.tfmtool.com/downloads", dominio: "beta.tfmtool.com" },
}

export function descargaDe(clave: string): DescargaTool | null {
  return DESCARGAS[clave] ?? null
}
