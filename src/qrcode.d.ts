// El paquete `qrcode` no trae tipos propios. Declaración mínima de lo que usamos.
declare module "qrcode" {
  export interface QRToDataURLOptions {
    margin?: number
    width?: number
    color?: { dark?: string; light?: string }
    errorCorrectionLevel?: "L" | "M" | "Q" | "H"
  }
  export function toDataURL(text: string, options?: QRToDataURLOptions): Promise<string>
  const _default: { toDataURL: typeof toDataURL }
  export default _default
}
