export function SiteBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-background"
    >
      <div className="absolute -top-[18rem] left-1/2 h-[36rem] w-[52rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(0,82,212,0.10),transparent)]" />
    </div>
  )
}
