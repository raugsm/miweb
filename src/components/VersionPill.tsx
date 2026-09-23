import { useRelease } from "@/lib/release"
import { cn } from "@/lib/utils"

type VersionPillProps = {
  tone?: "dark" | "light"
  label?: string
  className?: string
}

export function VersionPill({ tone = "dark", label, className }: VersionPillProps) {
  const release = useRelease()

  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-2 rounded-full border px-3 text-xs font-medium whitespace-nowrap",
        tone === "light"
          ? "border-black/10 bg-black/[0.04] text-[#0B0B0C]"
          : "border-line bg-carbon text-foreground/85",
        className
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 rounded-full",
          tone === "light" ? "bg-cobalt" : "bg-cyan"
        )}
      />
      {label ?? (release.resolved ? (
        release.versionLabel
      ) : (
        // Reserva el ancho para que el pill no salte al llegar la versión real.
        <span
          aria-hidden="true"
          className={cn(
            "inline-block h-3 w-12 animate-pulse rounded-full",
            tone === "light" ? "bg-black/10" : "bg-foreground/15"
          )}
        />
      ))}
    </span>
  )
}
