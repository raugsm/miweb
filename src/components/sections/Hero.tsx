import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { ArrowRight } from "lucide-react"

import { Container } from "@/components/Container"
import { CountUp } from "@/components/CountUp"
import { Button } from "@/components/ui/button"
import type { HeroScene } from "@/components/hero/hero-scene"
import { heroContent } from "@/data/product"
import { useInView } from "@/hooks/use-in-view"
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion"
import { cn } from "@/lib/utils"

// La secuencia larga (consola + armado del logo) se ve una vez por sesión.
// Al volver a la portada, el logo se arma rápido y el texto ya está a la vista.
const INTRO_KEY = "ariad-hero-intro"

function introYaVista(): boolean {
  try {
    return sessionStorage.getItem(INTRO_KEY) === "1"
  } catch {
    return false
  }
}

function marcarIntroVista() {
  try {
    sessionStorage.setItem(INTRO_KEY, "1")
  } catch {
    // sin almacenamiento: la próxima visita repite la intro, no pasa nada
  }
}

/** Glifo AR estático: respaldo sin WebGL y primer cuadro en visitas repetidas. */
function GlyphAR({ className }: { className?: string }) {
  return (
    <svg viewBox="94 157 330 230" width="330" height="230" aria-hidden="true" className={className}>
      <g transform="translate(58 78) scale(0.39)">
        <path d="M92 790L362 202H505L790 790H610L552 660H338L281 790Z" fill="#fff" />
        <path
          d="M508 202H790C887 202 933 274 896 363L854 463C832 516 790 544 728 548L897 790H699L548 562H473L531 428H712C742 428 765 414 776 388L790 354C805 319 785 292 744 292H467Z"
          fill="#fff"
        />
        <path d="M414 368L365 520H498L447 368Z" fill="#04060d" />
        <path d="M506 202L366 520" stroke="#04060d" strokeWidth="34" strokeLinecap="round" />
        <path d="M338 660H552" stroke="#04060d" strokeWidth="38" strokeLinecap="round" />
        <path d="M548 562L699 790" stroke="#04060d" strokeWidth="32" strokeLinecap="round" />
      </g>
    </svg>
  )
}

/** Consola de arranque: escribe las líneas de a poco, como un sistema que inicia. */
function BootConsole() {
  const lines = heroContent.boot
  const [state, setState] = useState({ line: 0, chars: 0 })

  useEffect(() => {
    const id = window.setInterval(() => {
      setState((s) => {
        if (s.line >= lines.length) return s
        const next = s.chars + 2
        return next >= lines[s.line].text.length ? { line: s.line + 1, chars: 0 } : { ...s, chars: next }
      })
    }, 16)
    return () => window.clearInterval(id)
  }, [lines])

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute bottom-[18%] left-1/2 -translate-x-1/2 font-mono text-[11px] leading-[1.9] whitespace-pre text-[#7aa9ff] sm:text-xs"
    >
      {lines.slice(0, state.line).map((l) => (
        <div key={l.text}>
          {l.text}
          {l.ok ? <span className="text-[#3dff9a]">{"  [ OK ]"}</span> : null}
        </div>
      ))}
      <div>
        {state.line < lines.length ? lines[state.line].text.slice(0, state.chars) : ""}
        <span className="inline-block h-[13px] w-[7px] animate-pulse bg-[#7aa9ff] align-[-2px]" />
      </div>
    </div>
  )
}

type SceneState = "loading" | "ready" | "failed"

/**
 * Hero de la portada. Fondo siempre oscuro (en ambos temas) con la escena 3D:
 * las partículas arman el logo AR, que queda rodeado por un HUD tecnológico.
 * Three.js se descarga aparte y solo si hay WebGL; si no, queda el logo fijo.
 */
export function Hero() {
  const hostRef = useRef<HTMLElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const panelLeftRef = useRef<HTMLDivElement>(null)
  const panelRightRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<HeroScene | null>(null)
  const activeRef = useRef(true)

  const reduced = usePrefersReducedMotion()
  const inView = useInView(hostRef)
  const [quick] = useState(introYaVista)
  const [initialReduced] = useState(reduced)
  const [sceneState, setSceneState] = useState<SceneState>("loading")
  const [revealed, setRevealed] = useState(quick || reduced)
  const [solid, setSolid] = useState(false)
  const [pageHidden, setPageHidden] = useState(false)

  // Monta la escena una sola vez.
  useEffect(() => {
    let cancelled = false
    let scene: HeroScene | null = null

    import("@/components/hero/hero-scene")
      .then(({ createHeroScene }) => {
        const canvas = canvasRef.current
        const host = hostRef.current
        const stage = stageRef.current
        const left = panelLeftRef.current
        const right = panelRightRef.current
        if (cancelled || !canvas || !host || !stage || !left || !right) return
        try {
          scene = createHeroScene({
            canvas,
            host,
            stage,
            panels: { left, right },
            reduced: initialReduced,
            quick,
            onFormed: () => {
              setRevealed(true)
              marcarIntroVista()
            },
            onSolid: () => setSolid(true),
          })
        } catch {
          scene = null
        }
        if (!scene) {
          setSceneState("failed")
          setRevealed(true)
          return
        }
        sceneRef.current = scene
        setSceneState("ready")
        scene.setActive(activeRef.current)
      })
      .catch(() => {
        if (cancelled) return
        setSceneState("failed")
        setRevealed(true)
      })

    return () => {
      cancelled = true
      scene?.destroy()
      sceneRef.current = null
    }
  }, [initialReduced, quick])

  // Red de seguridad: el texto nunca queda oculto más de unos segundos.
  useEffect(() => {
    if (revealed) return
    const id = window.setTimeout(() => setRevealed(true), 4200)
    return () => window.clearTimeout(id)
  }, [revealed])

  // Pausa la animación fuera de pantalla o con la pestaña oculta.
  useEffect(() => {
    const onVis = () => setPageHidden(document.visibilityState === "hidden")
    document.addEventListener("visibilitychange", onVis)
    return () => document.removeEventListener("visibilitychange", onVis)
  }, [])
  useEffect(() => {
    activeRef.current = inView && !pageHidden
    sceneRef.current?.setActive(activeRef.current)
  }, [inView, pageHidden])

  const showBoot = !quick && !initialReduced && !revealed
  const showStaticLogo = sceneState === "failed" || (quick && sceneState === "loading")
  const reveal = (delayMs: number) => ({
    className: cn(
      "transition-[opacity,translate] duration-700 ease-out motion-reduce:transition-none",
      revealed ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
    ),
    style: { transitionDelay: revealed ? `${delayMs}ms` : "0ms" },
  })
  const r = (delayMs: number, extra: string) => {
    const v = reveal(delayMs)
    return { className: cn(v.className, extra), style: v.style }
  }

  return (
    <section
      ref={hostRef}
      aria-labelledby="hero-title"
      className="relative isolate flex min-h-[max(640px,calc(100svh-3.5rem))] flex-col overflow-hidden border-b border-line bg-[#04060d] text-white"
    >
      {/* Fondo: resplandor azul, escena 3D, viñeta y líneas de monitor */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(1100px_650px_at_50%_30%,rgba(32,112,252,0.14),transparent_62%)]"
      />
      <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 -z-10 size-full" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_bottom,transparent_50%,rgba(4,6,13,0.88)_92%),radial-gradient(130%_110%_at_50%_35%,transparent_60%,rgba(2,3,8,0.6)_100%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[repeating-linear-gradient(to_bottom,rgba(255,255,255,0.018)_0_1px,transparent_1px_3px)] opacity-40"
      />

      {/* Estado, arriba a la izquierda */}
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute top-4 left-4 flex items-center gap-2 font-mono text-[10px] tracking-[0.16em] text-[#5d74a3] uppercase transition-opacity duration-700 sm:left-6",
          revealed ? "opacity-100" : "opacity-0"
        )}
      >
        <span className="size-1.5 animate-pulse rounded-full bg-[#3dff9a] shadow-[0_0_10px_#3dff9a]" />
        {heroContent.status}
      </div>

      {/* Paneles de datos: la escena los ubica al final de las pistas de circuito */}
      <div
        ref={panelLeftRef}
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute hidden w-[190px] -translate-y-1/2 text-right font-mono transition-opacity duration-700",
          solid ? "opacity-100" : "opacity-0"
        )}
      >
        <div className="text-[10px] tracking-[0.2em] text-[#5d74a3] uppercase">{heroContent.panelLeft.kicker}</div>
        <div className="mt-2 mb-1.5 font-display text-[44px] leading-none font-extrabold tracking-tight text-white">
          <CountUp target={heroContent.panelLeft.value} run={solid} durationMs={1400} />
        </div>
        <div className="text-[11px] leading-relaxed text-[#9db0d4]">
          {heroContent.panelLeft.label}
          <br />
          {heroContent.panelLeft.detail}
        </div>
        <div className="mt-3 h-0.5 bg-[linear-gradient(270deg,transparent,#2070fc)]" />
      </div>
      <div
        ref={panelRightRef}
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute hidden w-[190px] -translate-y-1/2 font-mono transition-opacity duration-700",
          solid ? "opacity-100" : "opacity-0"
        )}
      >
        <div className="text-[10px] tracking-[0.2em] text-[#5d74a3] uppercase">{heroContent.panelRight.kicker}</div>
        <div className="mt-2 mb-1.5 font-display text-[44px] leading-none font-extrabold tracking-tight text-white">
          {heroContent.panelRight.from} <span className="text-[22px] text-[#7aa9ff]">→</span> {heroContent.panelRight.to}
        </div>
        <div className="text-[11px] leading-relaxed text-[#9db0d4]">
          {heroContent.panelRight.label}
          <br />
          {heroContent.panelRight.detail}
        </div>
        <div className="mt-3 h-0.5 bg-[linear-gradient(90deg,transparent,#2070fc)]" />
      </div>

      {/* Zona del logo: la escena centra y escala el AR acá adentro */}
      <div ref={stageRef} className="relative flex min-h-[200px] flex-1 items-center justify-center">
        <GlyphAR
          className={cn(
            "h-[clamp(110px,22vh,190px)] w-auto shrink-0 drop-shadow-[0_0_28px_rgba(32,112,252,0.85)] transition-opacity duration-500",
            showStaticLogo ? "opacity-100" : "opacity-0"
          )}
        />
      </div>

      {showBoot ? <BootConsole /> : null}

      <Container className="relative flex flex-col items-center pt-2 pb-12 text-center sm:pb-16">
        <p {...r(0, "font-display text-[13px] font-black tracking-[0.32em] text-white uppercase sm:text-sm")}>
          Ariad <span className="text-[#7aa9ff]">GSM</span>
        </p>
        <h1
          id="hero-title"
          {...r(100, "mt-3.5 max-w-[18ch] font-display text-[2rem] leading-[1.05] font-extrabold tracking-tight text-balance sm:text-5xl lg:text-[3.4rem]")}
        >
          {heroContent.titleLead}{" "}
          <span className="bg-[linear-gradient(100deg,#fff_0%,#7aa9ff_60%,#2070fc_100%)] bg-clip-text text-transparent">
            {heroContent.titleHighlight}
          </span>
        </h1>
        <p {...r(220, "mt-4 max-w-[54ch] text-[15px] leading-relaxed text-pretty text-[#9db0d4] sm:text-lg")}>
          {heroContent.lead}
        </p>
        <div {...r(340, "mt-6 flex flex-wrap justify-center gap-3")}>
          <Button
            asChild
            className="h-11 rounded-xl bg-[#2070fc] px-6 text-[15px] font-semibold text-white shadow-[0_10px_30px_-8px_rgba(32,112,252,0.65)] hover:bg-[#3b83ff]"
          >
            <a href={heroContent.primaryCta.href}>
              {heroContent.primaryCta.label}
              <ArrowRight aria-hidden="true" className="size-4" />
            </a>
          </Button>
          <Button
            asChild
            variant="outline"
            className="h-11 rounded-xl border-white/15 bg-white/[0.03] px-6 text-[15px] font-semibold text-white hover:border-[#7aa9ff]/60 hover:bg-[#7aa9ff]/10 hover:text-white"
          >
            <Link to={heroContent.secondaryCta.href}>{heroContent.secondaryCta.label}</Link>
          </Button>
        </div>
        <ul {...r(480, "mt-6 flex max-w-3xl flex-wrap justify-center gap-2")} aria-label="Servicios">
          {heroContent.services.map((s) => (
            <li
              key={s}
              className="rounded-full border border-[#7aa9ff]/20 bg-[#7aa9ff]/[0.05] px-3 py-1.5 text-xs text-white/90"
            >
              {s}
            </li>
          ))}
        </ul>
      </Container>
    </section>
  )
}
