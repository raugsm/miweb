/**
 * Enlace público de descarga de AriTool.
 *
 * Siempre pasa por la web (`/descargar`): el servidor resuelve la última versión y redirige
 * al instalador. Así, cuando alguien copia el botón, copia `https://ariadgsm.com/descargar`
 * y no la dirección interna de Supabase Storage.
 */
export const RUTA_DESCARGA = "/descargar"

/** Enlace absoluto para copiar/compartir (ej. https://ariadgsm.com/descargar). */
export function enlaceDescarga(): string {
  return new URL(RUTA_DESCARGA, window.location.origin).href
}

/** Copia el enlace público. Devuelve false si el navegador no deja usar el portapapeles. */
export async function copiarEnlaceDescarga(): Promise<boolean> {
  const texto = enlaceDescarga()
  try {
    await navigator.clipboard.writeText(texto)
    return true
  } catch {
    // Respaldo para navegadores viejos o sin permiso de portapapeles.
    try {
      const campo = document.createElement("textarea")
      campo.value = texto
      campo.style.position = "fixed"
      campo.style.opacity = "0"
      document.body.appendChild(campo)
      campo.select()
      const ok = document.execCommand("copy")
      campo.remove()
      return ok
    } catch {
      return false
    }
  }
}
