import { useEffect, useId, useMemo, useRef, useState } from "react"
import { Check, ChevronDown } from "lucide-react"

import { Flag } from "@/components/Flag"
import { cn } from "@/lib/utils"

export type SelectOption = {
  value: string
  label: string
  /** Código de bandera a mostrar junto a la opción (ISO de 2 letras). */
  flag?: string
}

type SearchableSelectProps = {
  id?: string
  options: SelectOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  emptyLabel?: string
  className?: string
}

/** Compara sin tildes ni mayúsculas: "peru" encuentra "Perú". */
function normalizar(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
}

/**
 * Selector con buscador: se ve como un desplegable, pero se puede escribir para
 * filtrar. Sin dependencias extra; navegable con teclado y anunciado por
 * lectores de pantalla (combobox + listbox).
 */
export function SearchableSelect({
  id,
  options,
  value,
  onChange,
  placeholder = "Escribí para buscar…",
  emptyLabel = "Sin resultados",
  className,
}: SearchableSelectProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const listId = `${inputId}-lista`

  const [abierto, setAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState("")
  const [resaltado, setResaltado] = useState(0)

  const contenedor = useRef<HTMLDivElement>(null)
  const listaRef = useRef<HTMLUListElement>(null)

  const seleccionada = options.find((o) => o.value === value) ?? null

  const filtradas = useMemo(() => {
    const q = normalizar(busqueda)
    if (!q) return options
    return options.filter((o) => normalizar(o.label).includes(q))
  }, [options, busqueda])

  // Cerrar al hacer clic fuera.
  useEffect(() => {
    if (!abierto) return
    function alClic(e: MouseEvent) {
      if (!contenedor.current?.contains(e.target as Node)) {
        setAbierto(false)
        setBusqueda("")
      }
    }
    document.addEventListener("mousedown", alClic)
    return () => document.removeEventListener("mousedown", alClic)
  }, [abierto])

  // Mantener visible la opción resaltada.
  useEffect(() => {
    if (!abierto) return
    const nodo = listaRef.current?.children[resaltado] as HTMLElement | undefined
    nodo?.scrollIntoView({ block: "nearest" })
  }, [resaltado, abierto])

  function elegir(opcion: SelectOption) {
    onChange(opcion.value)
    setBusqueda("")
    setAbierto(false)
  }

  function alTeclear(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      if (!abierto) {
        setAbierto(true)
        setResaltado(0)
        return
      }
      setResaltado((i) => Math.min(i + 1, filtradas.length - 1))
      return
    }
    if (e.key === "ArrowUp") {
      e.preventDefault()
      setResaltado((i) => Math.max(i - 1, 0))
      return
    }
    if (e.key === "Enter") {
      if (!abierto) return
      e.preventDefault()
      const opcion = filtradas[resaltado]
      if (opcion) elegir(opcion)
      return
    }
    if (e.key === "Escape") {
      setAbierto(false)
      setBusqueda("")
    }
  }

  return (
    <div ref={contenedor} className="relative">
      <input
        id={inputId}
        role="combobox"
        aria-expanded={abierto}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          abierto && filtradas[resaltado] ? `${listId}-${resaltado}` : undefined
        }
        autoComplete="off"
        value={abierto ? busqueda : (seleccionada?.label ?? "")}
        placeholder={seleccionada ? seleccionada.label : placeholder}
        onChange={(e) => {
          setBusqueda(e.target.value)
          setResaltado(0)
          if (!abierto) setAbierto(true)
        }}
        onFocus={() => setAbierto(true)}
        onKeyDown={alTeclear}
        className={cn(
          "mt-1 h-11 w-full rounded-lg border border-line bg-field px-3 pr-10 text-sm text-foreground placeholder:text-foreground/30 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
          className
        )}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={abierto ? "Cerrar lista" : "Abrir lista"}
        onClick={() => setAbierto((v) => !v)}
        className="absolute top-1 right-0 flex h-11 w-10 items-center justify-center text-foreground/45 transition-colors hover:text-foreground"
      >
        <ChevronDown
          aria-hidden="true"
          className={cn("size-4 transition-transform", abierto && "rotate-180")}
        />
      </button>

      {abierto ? (
        <ul
          ref={listaRef}
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-line bg-card py-1 shadow-lg"
        >
          {filtradas.length === 0 ? (
            <li className="px-3 py-2 text-sm text-foreground/45">{emptyLabel}</li>
          ) : (
            filtradas.map((opcion, i) => {
              const activa = opcion.value === value
              return (
                <li
                  key={opcion.value}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={activa}
                  onMouseEnter={() => setResaltado(i)}
                  onMouseDown={(e) => {
                    // mousedown para ganarle al blur del input.
                    e.preventDefault()
                    elegir(opcion)
                  }}
                  className={cn(
                    "flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm text-foreground",
                    i === resaltado && "bg-foreground/[0.06]"
                  )}
                >
                  {opcion.flag ? (
                    <Flag code={opcion.flag} title={opcion.label} className="h-3.5 w-5" />
                  ) : null}
                  <span className="min-w-0 flex-1 truncate">{opcion.label}</span>
                  {activa ? <Check aria-hidden="true" className="size-4 shrink-0 text-cyan" /> : null}
                </li>
              )
            })
          )}
        </ul>
      ) : null}
    </div>
  )
}
