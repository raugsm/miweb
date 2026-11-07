/**
 * Legal · Términos y Privacidad — pedido de Ari-Diseño (7-nov): misma cabecera y pie,
 * título + texto largo, sin tarjetas ni degradados, ancho 800. El texto sale de `src/data/legal.ts`.
 *
 * Dos direcciones: /legal/terminos (Términos + Reembolsos + Uso aceptable, con ancla) y
 * /legal/privacidad (solo Privacidad). El pie lleva a cada una.
 */
import { useEffect, useState } from "react"
import { Link, useLocation } from "react-router-dom"

import { C, Cont, FranjaSoporte, HeaderDesktop, HeaderMobile, MenuMobile, PieDesktop, PieMobile } from "@/components/aritool/chrome"
import { legalContact, legalSections, legalUpdated, type LegalBlock, type LegalSection } from "@/data/legal"
import { usePrecios } from "@/hooks/use-precios"
import { useSeo } from "@/lib/seo"

type LegalProps = { ids: string[]; titulo: string; descripcion: string; ruta: string; otro: { ruta: string; texto: string } }

function Bloque({ b }: { b: LegalBlock }) {
  if ("ul" in b) {
    return (
      <ul className="flex list-disc flex-col gap-2 pl-5" style={{ color: C.muted2, fontSize: 15, lineHeight: "22px" }}>
        {b.ul.map((t, i) => <li key={i}>{t}</li>)}
      </ul>
    )
  }
  return <p style={{ color: C.muted2, fontSize: 15, lineHeight: "22px" }}>{b.p}</p>
}

function Seccion({ s, primera }: { s: LegalSection; primera: boolean }) {
  return (
    <section id={s.id} style={{ scrollMarginTop: 90 }}>
      {primera ? null : <h2 className="mt-10" style={{ color: C.title, fontWeight: 700, fontSize: 22, lineHeight: "28px" }}>{s.title}</h2>}
      <div className={`${primera ? "mt-7" : "mt-4"} flex flex-col gap-4`}>
        {s.blocks.map((b, i) => <Bloque key={i} b={b} />)}
      </div>
    </section>
  )
}

function LegalPagina({ ids, titulo, descripcion, ruta, otro }: LegalProps) {
  useSeo({ titulo: `${titulo} | AriTool`, descripcion, ruta })
  const { datos } = usePrecios()
  const { hash } = useLocation()
  const [menu, setMenu] = useState(false)
  const secciones = ids
    .map((id) => legalSections.find((s) => s.id === id))
    .filter((s): s is LegalSection => Boolean(s))

  useEffect(() => {
    const prev = document.body.style.background
    document.body.style.background = C.page
    return () => { document.body.style.background = prev }
  }, [])

  // Si llega con #reembolsos o #uso-aceptable, baja a esa sección; si no, empieza arriba.
  useEffect(() => {
    if (hash) {
      const id = decodeURIComponent(hash.slice(1))
      const t = window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: "start" }), 60)
      return () => window.clearTimeout(t)
    }
    window.scrollTo(0, 0)
  }, [hash])

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden" style={{ background: C.page, color: C.text, fontFamily: "Inter, system-ui, sans-serif", lineHeight: "normal" }}>
      <div className="hidden lg:block"><HeaderDesktop datos={datos} /></div>
      <div className="lg:hidden"><HeaderMobile onMenu={() => setMenu(true)} mostrarBuscar={false} /><FranjaSoporte datos={datos} /></div>

      <main className="flex-1">
        <Cont className="py-10 lg:py-14">
          <article className="mx-auto w-full max-w-[800px]">
            <h1 className="text-[28px] leading-[34px] lg:text-[41px] lg:leading-[44px]" style={{ color: C.title, fontWeight: 700 }}>{titulo}</h1>
            <p className="mt-2" style={{ color: C.muted, fontSize: 13, lineHeight: "18px" }}>Última actualización: {legalUpdated}</p>
            {secciones.map((s, i) => <Seccion key={s.id} s={s} primera={i === 0} />)}
            <p className="mt-7" style={{ color: C.muted2, fontSize: 15, lineHeight: "22px" }}>
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
      ids={["terminos", "reembolsos", "uso-aceptable"]}
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
      ids={["privacidad"]}
      titulo="Política de Privacidad"
      descripcion="Cómo AriTool trata los datos de tu cuenta y de tu taller."
      ruta="/legal/privacidad"
      otro={{ ruta: "/legal/terminos", texto: "Ver Términos y Condiciones" }}
    />
  )
}
