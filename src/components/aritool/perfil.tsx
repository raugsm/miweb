/**
 * Estado de una cuenta que entró pero todavía no tiene perfil de taller.
 * Lo dibujó Ari-Diseño el 7-nov: mensaje claro y dos salidas (Soporte o Inicio).
 * No manda al panel viejo: el cliente se queda en la web nueva.
 */
import { ArrowLeft } from "lucide-react"
import { Link } from "react-router-dom"

import { C, IconoWA, RUTAS } from "@/components/aritool/chrome"

export function SinPerfil({ whatsapp, movil, titulo }: { whatsapp: string; movil: boolean; titulo: string }) {
  return (
    <section className={movil ? "px-5 pb-10 pt-6" : "mx-auto w-full max-w-[800px] px-5 pb-16 pt-10"}>
      <h1 style={{ color: C.title, fontWeight: 700, fontSize: movil ? 26 : 32, lineHeight: movil ? "31px" : "39px" }}>{titulo}</h1>
      <p className="mt-6" style={{ color: C.title, fontWeight: 600, fontSize: movil ? 18 : 22, lineHeight: movil ? "23px" : "28px" }}>
        Tu cuenta no tiene perfil de taller.
      </p>
      <p className="mt-2" style={{ color: C.muted2, fontSize: movil ? 14 : 16, lineHeight: movil ? "20px" : "23px" }}>
        Escribí a Soporte para que te den acceso.
      </p>
      <div className={`mt-6 flex gap-2.5 ${movil ? "flex-col" : "flex-row"}`}>
        <a
          href={whatsapp}
          target="_blank"
          rel="noreferrer"
          className="flex h-11 items-center justify-center gap-2 text-white"
          style={{ background: C.blue, borderRadius: 10, padding: "0 18px", fontWeight: 600, fontSize: movil ? 14 : 15 }}
        >
          <IconoWA className="size-[18px]" style={{ color: "#fff" }} />
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
    </section>
  )
}
