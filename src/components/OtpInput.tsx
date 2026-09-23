import { useEffect, useRef } from "react"

import { cn } from "@/lib/utils"

type OtpInputProps = {
  value: string
  onChange: (value: string) => void
  /** Se dispara al completar las 6 casillas: evita tener que apretar un botón. */
  onComplete?: (value: string) => void
  length?: number
  disabled?: boolean
  autoFocus?: boolean
}

/**
 * Código de verificación en casillas separadas, como en la aplicación de
 * escritorio: avanza solo al escribir, retrocede con borrar, acepta pegar el
 * código entero y se autoverifica al completarse.
 */
export function OtpInput({
  value,
  onChange,
  onComplete,
  length = 6,
  disabled = false,
  autoFocus = false,
}: OtpInputProps) {
  const refs = useRef<Array<HTMLInputElement | null>>([])
  const yaCompletado = useRef(false)

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus()
  }, [autoFocus])

  // Autoverificación: una sola vez por código completo.
  useEffect(() => {
    if (value.length === length && !yaCompletado.current) {
      yaCompletado.current = true
      onComplete?.(value)
    }
    if (value.length < length) yaCompletado.current = false
  }, [value, length, onComplete])

  function escribir(indice: number, texto: string) {
    const digitos = texto.replace(/\D/g, "")
    if (!digitos) return

    const actual = value.split("")
    for (let i = 0; i < digitos.length && indice + i < length; i += 1) {
      actual[indice + i] = digitos[i]
    }
    const siguiente = actual.join("").slice(0, length)
    onChange(siguiente)

    const foco = Math.min(indice + digitos.length, length - 1)
    refs.current[foco]?.focus()
    refs.current[foco]?.select()
  }

  function alTeclear(indice: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      e.preventDefault()
      const actual = value.split("")
      if (actual[indice]) {
        actual[indice] = ""
        onChange(actual.join(""))
        return
      }
      if (indice > 0) {
        onChange(value.slice(0, indice - 1))
        refs.current[indice - 1]?.focus()
      }
      return
    }
    if (e.key === "ArrowLeft" && indice > 0) {
      e.preventDefault()
      refs.current[indice - 1]?.focus()
    }
    if (e.key === "ArrowRight" && indice < length - 1) {
      e.preventDefault()
      refs.current[indice + 1]?.focus()
    }
  }

  return (
    <div className="flex justify-between gap-2" role="group" aria-label="Código de verificación">
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          value={value[i] ?? ""}
          onChange={(e) => escribir(i, e.target.value)}
          onKeyDown={(e) => alTeclear(i, e)}
          onPaste={(e) => {
            e.preventDefault()
            escribir(0, e.clipboardData.getData("text"))
          }}
          onFocus={(e) => e.currentTarget.select()}
          disabled={disabled}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={1}
          aria-label={`Dígito ${i + 1} de ${length}`}
          className={cn(
            "h-14 w-full min-w-0 rounded-xl border bg-field text-center font-tech text-xl font-semibold text-foreground transition-all",
            "focus-visible:border-cobalt focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
            value[i] ? "border-cobalt/60 bg-cobalt/[0.06]" : "border-line",
            disabled && "opacity-50"
          )}
        />
      ))}
    </div>
  )
}
