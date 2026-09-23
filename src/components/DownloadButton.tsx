import { Download } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useRelease } from "@/lib/release"
import { cn } from "@/lib/utils"

type DownloadButtonProps = {
  label: string
  className?: string
}

export function DownloadButton({ label, className }: DownloadButtonProps) {
  const { downloadAvailable, downloadUrl } = useRelease()

  const buttonClassName = cn(
    "h-11 rounded-lg px-5 font-medium hover:bg-cobalt-deep",
    className
  )
  const icon = <Download aria-hidden="true" />

  if (downloadAvailable) {
    return (
      <Button asChild size="lg" className={buttonClassName}>
        <a href={downloadUrl} download>
          {icon}
          {label}
        </a>
      </Button>
    )
  }

  // Sin release publicada el boton queda inactivo: ya no existe una seccion
  // de descarga a la que enviar al visitante.
  return (
    <Button size="lg" className={buttonClassName} disabled>
      {icon}
      {label}
    </Button>
  )
}
