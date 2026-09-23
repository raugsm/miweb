import { cn } from "@/lib/utils"

type SectionHeadingProps = {
  id?: string
  eyebrow?: string
  title: string
  lead?: string
  align?: "left" | "center"
  className?: string
}

export function SectionHeading({
  id,
  eyebrow,
  title,
  lead,
  align = "left",
  className,
}: SectionHeadingProps) {
  return (
    <div
      className={cn(
        "max-w-[720px]",
        align === "center" && "mx-auto text-center",
        className
      )}
    >
      {eyebrow ? (
        <p
          className={cn(
            "inline-flex items-center gap-3 font-display text-[11px] font-bold tracking-[0.24em] text-kicker uppercase",
            align === "center" && "justify-center"
          )}
        >
          <span
            aria-hidden="true"
            className="h-px w-8 bg-gradient-to-r from-[#4d8dff] to-transparent"
          />
          {eyebrow}
        </p>
      ) : null}
      <h2
        id={id}
        className="mt-4 font-display text-[1.65rem] leading-[1.15] font-extrabold tracking-[0.03em] text-balance text-foreground uppercase sm:text-3xl lg:text-[2.35rem]"
      >
        {title}
      </h2>
      {lead ? (
        <p className="mt-4 max-w-xl text-base leading-relaxed text-pretty text-foreground/60">
          {lead}
        </p>
      ) : null}
    </div>
  )
}
