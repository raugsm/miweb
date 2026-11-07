/**
 * Estado de una cuenta que entró pero todavía no tiene perfil de taller.
 * Lo dibujó Ari-Diseño el 7-nov (W18 · 1214:2): el título es el mensaje, botón verde de
 * WhatsApp, "Volver a Inicio" y "Salir" como texto arriba a la derecha. Sin buscador ni /panel.
 */
import { ArrowLeft } from "lucide-react"
import { Link } from "react-router-dom"

import { C, Cont, IconoWA, RUTAS } from "@/components/aritool/chrome"

export function SinPerfil({ whatsapp, movil, onSalir }: { whatsapp: string; movil: boolean; onSalir?: () => void }) {
  return (
    <section className={movil ? "pb-10 pt-6" : "pb-16 pt-10"}>
      <Cont>
        <div className="flex items-start justify-between gap-4">
          <h1 style={{ color: C.title, fontWeight: 700, fontSize: movil ? 26 : 32, lineHeight: movil ? "31px" : "39px", maxWidth: 800 }}>
            Tu cuenta no tiene perfil de taller.
          </h1>
          {onSalir ? (
            <button type="button" onClick={onSalir} className="shrink-0 pt-1" style={{ color: C.link, fontWeight: 500, fontSize: movil ? 13 : 14 }}>
              Salir
            </button>
          ) : null}
        </div>
        <p className="mt-3" style={{ color: C.muted2, fontSize: movil ? 14 : 16, lineHeight: movil ? "20px" : "23px", maxWidth: 800 }}>
          Escribí a Soporte para que te den acceso. Es la misma cuenta que usás en la app.
        </p>
        <div className={`mt-6 flex gap-2.5 ${movil ? "flex-col" : "flex-row"}`} style={{ maxWidth: 800 }}>
          <a
            href={whatsapp}
            target="_blank"
            rel="noreferrer"
            className="flex h-11 items-center justify-center gap-2"
            style={{ background: C.waGreen, color: "#052e16", borderRadius: 10, padding: "0 18px", fontWeight: 700, fontSize: movil ? 14 : 15 }}
          >
            <IconoWA className="size-[18px]" style={{ color: "#052e16" }} />
            Escribir a Soporte
          </a>
          <Link
            to={RUTAS.inicio}
            className="flex h-11 items-center justify-center gap-2"
            style={{ border: `1px solid ${C.borderAlt}`, color: C.text, borderRadius: 10, padding: "0 18px", fontWeight: 600, fontSize: movil ? 14 : 15 }}
          >
            <ArrowLeft className="size-4" />
            Volver a Inicio
          </Link>
        </div>
      </Cont>
    </section>
  )
}
