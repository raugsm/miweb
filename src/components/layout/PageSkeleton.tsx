import { Container } from "@/components/Container"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * Relleno mientras carga una página perezosa. Imita la forma de una página real
 * (encabezado + tres tarjetas) para que el cambio no sea un hueco en blanco ni
 * un salto brusco. El header y el footer se quedan quietos alrededor.
 */
export function PageSkeleton() {
  return (
    <div role="status" aria-busy="true" className="py-16 sm:py-24">
      <span className="sr-only">Cargando…</span>
      <Container>
        <Skeleton className="h-3 w-24 rounded-full" />
        <Skeleton className="mt-4 h-9 w-2/3 max-w-lg" />
        <Skeleton className="mt-3 h-4 w-full max-w-xl" />
        <Skeleton className="mt-2 h-4 w-4/5 max-w-md" />
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-2xl border border-line bg-card p-6">
              <Skeleton className="size-9 rounded-lg" />
              <Skeleton className="mt-5 h-4 w-1/2" />
              <Skeleton className="mt-3 h-3 w-full" />
              <Skeleton className="mt-2 h-3 w-4/5" />
            </div>
          ))}
        </div>
      </Container>
    </div>
  )
}
