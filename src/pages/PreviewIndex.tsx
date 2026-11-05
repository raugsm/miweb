/**
 * Índice único de vista previa: TODO el trabajo AriTool embebido en una sola página (un solo link).
 * Cada sección es un iframe de la ruta real (datos en vivo de producción). Botón compu/celular arriba.
 * Temporal, solo para revisar. No entra en la web final.
 */
import { useState } from "react"

import { C } from "@/components/aritool/chrome"

type Seccion = { t: string; src: string; h: number; nota?: string }

const SECCIONES: Seccion[] = [
  { t: "Inicio", src: "/preview-home", h: 2600, nota: "Portada: alquiler + servicios + cómo funciona + descarga" },
  { t: "App AriTool", src: "/preview-app", h: 2200, nota: "Créditos / licencia / Security Plugin" },
  { t: "Novedades", src: "/preview-novedades", h: 1100, nota: "Changelog por versión (placeholder hasta el RPC de Ari-Cliente)" },
  { t: "Descargar", src: "/preview-descargar", h: 900, nota: "Última versión en vivo" },
  { t: "Cuenta — todas las pantallas", src: "/preview-cuenta", h: 2300, nota: "Ingresar (5) + Crear cuenta/Código (4). Falta Recuperar y celular." },
]

export function PreviewIndex() {
  const [movil, setMovil] = useState(false)
  const ancho = movil ? 390 : 0 // 0 = 100%
  return (
    <div className="min-h-screen" style={{ background: C.page, color: C.text, fontFamily: "Inter, system-ui, sans-serif" }}>
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b px-5 py-4 md:px-10" style={{ background: C.card, borderColor: C.border }}>
        <div className="flex items-center gap-2.5">
          <img src="/aritool-logo.png" alt="" className="size-7" />
          <span style={{ color: C.title, fontWeight: 700, fontSize: 18 }}>AriTool · vista previa (todo junto)</span>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-1 rounded-lg p-1" style={{ background: C.cardAlt, border: `1px solid ${C.border}` }}>
          {[{ k: false, l: "Compu" }, { k: true, l: "Celular" }].map((o) => (
            <button
              key={o.l}
              type="button"
              onClick={() => setMovil(o.k)}
              style={{
                background: movil === o.k ? C.blue : "transparent",
                color: movil === o.k ? "#fff" : C.muted,
                borderRadius: 7, padding: "6px 14px", fontWeight: 600, fontSize: 13,
              }}
            >
              {o.l}
            </button>
          ))}
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-5 py-8 md:px-10">
        <p className="mb-8" style={{ color: C.muted, fontSize: 15 }}>
          Todo el trabajo en una sola página. Cada bloque es la pantalla real andando con datos de producción. Cambiá Compu/Celular arriba. Para verla sola y grande, tocá “abrir ↗”.
        </p>
        <div className="flex flex-col gap-12">
          {SECCIONES.map((s) => (
            <section key={s.src}>
              <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 style={{ color: C.title, fontWeight: 700, fontSize: 22 }}>{s.t}</h2>
                {s.nota ? <span style={{ color: C.faint, fontSize: 13 }}>{s.nota}</span> : null}
                <a href={s.src} target="_blank" rel="noreferrer" style={{ color: C.link, fontWeight: 500, fontSize: 13 }}>abrir ↗</a>
              </div>
              <div className="overflow-hidden rounded-xl" style={{ border: `1px solid ${C.border}`, background: C.page }}>
                <div className="mx-auto" style={{ width: ancho ? `${ancho}px` : "100%" }}>
                  <iframe
                    title={s.t}
                    src={s.src}
                    loading="lazy"
                    style={{ width: "100%", height: `${s.h}px`, border: "0", display: "block", background: C.page }}
                  />
                </div>
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  )
}
