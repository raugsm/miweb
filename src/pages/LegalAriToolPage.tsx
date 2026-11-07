/**
 * Legal · Términos y Privacidad — pedido de Ari-Diseño (7-nov): misma cabecera y pie,
 * título + texto largo, sin tarjetas ni degradados, ancho 800. El texto sale de `src/data/legal.ts`.
 * Dos direcciones: /legal/terminos y /legal/privacidad (el pie lleva a cada una).
 */
import { useEffect, useState } from "react"
import { Link } from "react-router-dom"

import { C, Cont, FranjaSoporte, HeaderDesktop, HeaderMobile, MenuMobile, PieDesktop, PieMobile } from "@/components/aritool/chrome"
import { legalContact, legalSections, legalUpdated, type LegalBlock } from "@/data/legal"
import { usePrecios } from "@/hooks/use-precios"
import { useSeo } from "@/lib/seo"

type LegalProps = { id: "terminos" | "privacidad"; titulo: string; descripcion: string; ruta: string; otro: { ruta: string; texto: string } }

function Bloque({ b }: { b: LegalBlock }) {
  if ("ul" in b) {
    return (
      <ul className="flex list-disc flex-col gap-2 pl-5" style={{ color: C.muted2, fontSize: 15, lineHeight: "24px" }}>
        {b.ul.map((t, i) => <li key={i}>{t}</li>)}
      </ul>
    )
  }
  return <p style={{ color: C.muted2, fontSize: 15, lineHeight: "24px" }}>{b.p}</p>
}

function LegalPagina({ id, titulo, descripcion, ruta, otro }: LegalProps) {
  useSeo({ titulo: `${titulo} | AriTool`, descripcion, ruta })
  const { datos } = usePrecios()
  const [menu, setMenu] = useState(false)
  const seccion = legalSections.find((s) => s.id === id) ?? null

  useEffect(() => {
    const prev = document.body.style.background
    document.body.style.background = C.page
    window.scrollTo(0, 0)
    return () => { document.body.style.background = prev }
  }, [])

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden" style={{ background: C.page, color: C.text, fontFamily: "Inter, system-ui, sans-serif", lineHeight: "normal" }}>
      <div className="hidden lg:block"><HeaderDesktop datos={datos} /></div>
      <div className="lg:hidden"><HeaderMobile onMenu={() => setMenu(true)} /><FranjaSoporte datos={datos} /></div>

      <main className="flex-1">
        <Cont className="py-10 lg:py-14">
          <article className="mx-auto w-full max-w-[800px]">
            <h1 style={{ color: C.title, fontWeight: 700, fontSize: 34, lineHeight: "41px" }}>{titulo}</h1>
            <p className="mt-2" style={{ color: C.muted, fontSize: 13, lineHeight: "18px" }}>Última actualización: {legalUpdated}</p>
            <div className="mt-7 flex flex-col gap-4">
              {seccion?.blocks.map((b, i) => <Bloque key={i} b={b} />)}
            </div>
            <p className="mt-7" style={{ color: C.muted2, fontSize: 15, lineHeight: "24px" }}>
              Ante cualquier duda escribinos a{" "}
              <a href={`mailto:${legalContact}`} style={{ color: C.link }}>{legalContact}</a>.
            </p>
            <p className="mt-8">
              <Link to={otro.ruta} style={{ color: C.link, fontWeight: 500, fontSize: 14 }}>{otro.texto}</Link>
            </p>
          </article>
        </Cont>
      </main>

      <div className="hidden lg:block"><PieDesktop /></div>
      <div className="lg:hidden"><PieMobile /></div>
      {menu ? <MenuMobile datos={datos} onClose={() => setMenu(false)} /> : null}
    </div>
  )
}

export function LegalTerminosPage() {
  return (
    <LegalPagina
      id="terminos"
      titulo="Términos y Condiciones"
      descripcion="Términos y condiciones de uso de AriTool y de los servicios para técnicos."
      ruta="/legal/terminos"
      otro={{ ruta: "/legal/privacidad", texto: "Ver Política de Privacidad" }}
    />
  )
}

export function LegalPrivacidadPage() {
  return (
    <LegalPagina
      id="privacidad"
      titulo="Política de Privacidad"
      descripcion="Cómo AriTool trata los datos de tu cuenta y de tu taller."
      ruta="/legal/privacidad"
      otro={{ ruta: "/legal/terminos", texto: "Ver Términos y Condiciones" }}
    />
  )
}
