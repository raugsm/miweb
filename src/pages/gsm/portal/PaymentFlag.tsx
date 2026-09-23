import { Flag } from "@/components/Flag"

// El catálogo del backend identifica la plaza por nombre ("Peru", "Global"),
// no por código ISO. Acá se traduce para poder mostrar la bandera real.
const ISO_POR_PAIS: Record<string, string> = {
  Peru: "pe",
  Perú: "pe",
  Mexico: "mx",
  México: "mx",
  Chile: "cl",
  Colombia: "co",
  Argentina: "ar",
  Ecuador: "ec",
  Global: "global",
  Internacional: "global",
  Worldwide: "global",
}

/** Bandera circular de las pills del panel 1 y de la card del panel 3. */
export function PaymentFlag({ country, size = 16 }: { country: string; size?: number }) {
  const code = ISO_POR_PAIS[country] ?? "global"
  return (
    <Flag
      code={code}
      shape="circle"
      title={country}
      className="block"
      style={{ width: size, height: size }}
    />
  )
}
