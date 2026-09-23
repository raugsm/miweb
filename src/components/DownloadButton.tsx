import { Download } from "lucide-react"
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
  const { downloadAvailable, downloadUrl } = useRelease()

  const buttonClassName = cn(
    "h-11 rounded-lg px-5 font-medium",
    !variant && "hover:bg-cobalt-deep",
    className
  )
  const icon = conIcono ? <Download aria-hidden="true" /> : null

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

  // Sin release publicada el boton queda inactivo: ya no existe una seccion
  // de descarga a la que enviar al visitante.
  return (
    <Button size={size} variant={variant} className={buttonClassName} disabled>
      {icon}
      {label}
    </Button>
  )
}
