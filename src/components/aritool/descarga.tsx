/**
 * Botón "Copiar enlace" de descarga. Copia el enlace público de la web (`/descargar`),
 * nunca la dirección de Supabase Storage. Muestra "Enlace copiado" un momento.
 */
import { Check, Copy } from "lucide-react"
import { useState } from "react"

import { C } from "@/components/aritool/chrome"
import { copiarEnlaceDescarga } from "@/lib/descarga"

export function BotonCopiarEnlace({ movil }: { movil: boolean }) {
  const [copiado, setCopiado] = useState(false)

  const copiar = async () => {
    const ok = await copiarEnlaceDescarga()
    if (!ok) return
    setCopiado(true)
    window.setTimeout(() => setCopiado(false), 1800)
  }

  return (
    <button
      type="button"
      onClick={() => void copiar()}
      className={movil ? "mt-2.5 flex h-[43px] w-full items-center justify-center gap-2 rounded-lg" : "flex items-center gap-2"}
      style={movil
        ? { border: `1px solid ${C.borderAlt}`, color: C.text }
        : { border: `1px solid ${C.borderAlt}`, color: C.text, borderRadius: 9, padding: "11px 18px", fontWeight: 600, fontSize: 14, lineHeight: "17px" }}
    >
      {copiado ? <Check className={movil ? "size-4" : "size-[16px]"} style={{ color: C.green }} /> : <Copy className={movil ? "size-4" : "size-[16px]"} />}
      <span style={movil ? { fontWeight: 600, fontSize: 14 } : undefined}>{copiado ? "Enlace copiado" : "Copiar enlace"}</span>
    </button>
  )
}
