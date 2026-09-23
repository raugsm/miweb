import { Link } from "react-router-dom"

import { Container } from "@/components/Container"
import { Kicker } from "@/components/Panel"
import { VersionPill } from "@/components/VersionPill"
import {
  footerContent,
  footerLinks,
  headerLinks,
  legalLinks,
  product,
} from "@/data/product"

const linkClassName =
  "rounded-md text-sm text-foreground/60 transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"

export function SiteFooter() {
  return (
    <footer className="relative border-t border-line">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#4d8dff]/40 to-transparent"
      />
      <Container className="py-12 sm:py-16">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_0.8fr_0.8fr_1.2fr]">
          <div className="min-w-0">
            <Link
              to="/"
              aria-label={`${product.name}, ir al inicio`}
              className="inline-flex items-center gap-2.5 rounded-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <img
                src="/ariad-logo.webp"
                alt="Logotipo de Ari-Tool"
                width={169}
                height={112}
 loading="lazy"
 decoding="async"
                className="h-7 w-auto"
              />
              <span className="font-display text-sm font-extrabold tracking-[0.08em] text-foreground uppercase">
                {product.name}
              </span>
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-foreground/55">
              {footerContent.tagline}
            </p>
            <div className="mt-5">
              <VersionPill className="font-display text-[10px] font-bold tracking-[0.18em] uppercase" />
            </div>
          </div>

          <nav aria-label="Navegación del pie">
            <Kicker className="text-foreground/45">{footerContent.navTitle}</Kicker>
            <ul className="mt-4 space-y-2.5">
              {headerLinks.map((link) => (
                <li key={link.href}>
                  <Link to={link.href} className={linkClassName}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Recursos">
            <Kicker className="text-foreground/45">{footerContent.resourcesTitle}</Kicker>
            <ul className="mt-4 space-y-2.5">
              {footerLinks.map((link) => (
                <li key={link.href}>
                  <Link to={link.href} className={linkClassName}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="min-w-0">
            <Kicker className="text-foreground/45">{footerContent.noticeTitle}</Kicker>
            <p className="mt-4 text-[13px] leading-relaxed text-foreground/50">
              {footerContent.disclaimer}
            </p>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-line pt-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="font-display text-[10px] font-bold tracking-[0.18em] text-foreground/40 uppercase">
              {footerContent.copyright}
            </p>
            <p className="mt-2 max-w-md text-[11px] leading-relaxed text-foreground/40">
              {footerContent.professionalUse}
            </p>
          </div>
          <ul className="flex flex-wrap gap-x-4 gap-y-2">
            {legalLinks.map((link) => (
              <li key={link.href}>
                <Link to={link.href} className={linkClassName}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </footer>
  )
}
