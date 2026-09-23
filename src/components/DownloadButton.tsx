import { Download, Loader2 } from "lucide-react"
import type { ComponentProps } from "react"

import { Button } from "@/components/ui/button"
import { useRelease } from "@/lib/release"
import { cn } from "@/lib/utils"

type DownloadButtonProps = {
  label: string
  className?: string
  variant?: ComponentProps<typeof Button>["variant"]
  size?: ComponentProps<typeof Button>["size"]
  /** El icono sobra en la barra de arriba, donde el espacio es poco. */
  conIcono?: boolean
}

export function DownloadButton({
  label,
  className,
  variant,
  size = "lg",
  conIcono = true,
}: DownloadButtonProps) {
  const { downloadAvailable, downloadUrl, resolved } = useRelease()

  const buttonClassName = cn(
    "h-11 rounded-lg px-5 font-medium",
    !variant && "hover:bg-cobalt-deep",
    className
  )
  const icon = conIcono ? <Download aria-hidden="true" /> : null

  // Todavía consultando la versión: en vez de un botón muerto sin explicación,
  // un estado "preparando" que late. Recién al asentarse se decide si hay
  // descarga o no, y así el paso a habilitado no es un salto brusco.
  if (!resolved) {
    return (
      <Button
        size={size}
        variant={variant}
        className={cn(buttonClassName, "pointer-events-none")}
        aria-busy="true"
        disabled
      >
        {conIcono ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
        <span className="animate-pulse">{label}</span>
      </Button>
    )
  }

  if (downloadAvailable) {
    return (
      <Button asChild size={size} variant={variant} className={buttonClassName}>
        {/* `download` solo lo respeta el navegador dentro del mismo dominio;
            el archivo vive en Supabase. Lo que fuerza la descarga es el
            parametro que lleva la direccion (ver comoDescarga en release). */}
        <a href={downloadUrl} download rel="noopener">
          {icon}
          {label}
        </a>
      </Button>
    )
  }

  // Ya se resolvió y no hay release publicada: botón inactivo de verdad.
  return (
    <Button size={size} variant={variant} className={buttonClassName} disabled>
      {icon}
      {label}
    </Button>
  )
}
