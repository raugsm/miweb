/**
 * Geometría del emblema de Ingresar (Figma W11-E 1172:301, aprobado por Peter 5-nov): el isotipo AR, su
 * anillo, el anillo de puntos y los seis logos con sus rayos. La comparten el dibujo SVG quieto
 * (aritool/EmblemaSvg.tsx) y la escena animada (hero/ingresar-scene.ts), así los dos muestran lo mismo.
 * Sin dependencias: este archivo entra en el JS inicial; Three, no.
 */

// Trazos del isotipo AR (mismo dibujo que public/brand/favicon.svg).
export const GLYPH_FILLS = [
  "M92 790L362 202H505L790 790H610L552 660H338L281 790Z",
  "M508 202H790C887 202 933 274 896 363L854 463C832 516 790 544 728 548L897 790H699L548 562H473L531 428H712C742 428 765 414 776 388L790 354C805 319 785 292 744 292H467Z",
]
export const GLYPH_CUT = "M414 368L365 520H498L447 368Z"
export const GLYPH_STROKES: [string, number][] = [
  ["M506 202L366 520", 34],
  ["M338 660H552", 38],
  ["M548 562L699 790", 32],
]
/** Caja del dibujo del isotipo, en sus propias unidades. */
export const GLYPH_CAJA = { x0: 92, x1: 905, y0: 202, y1: 790 }

/** Lienzo del panel izquierdo, en píxeles del Figma, y el centro del emblema. */
export const LIENZO = { w: 860, h: 900, cx: 430, cy: 330 }
/** Ancho del isotipo (1173:11). */
export const ANCHO_GLIFO = 204.3
/** Radio del anillo que rodea al isotipo. */
export const ANILLO = 130
/** Tramos brillantes del anillo: [desde, largo] en grados, desde la derecha y en sentido antihorario. */
export const ARCOS: [number, number][] = [[70, 90], [-70, 50], [200, 40]]
/** Radio del anillo de puntos, que pasa por el centro de los logos. */
export const ANILLO_PUNTOS = 222
/** Donde nace cada rayo (y su punto), apenas por fuera del anillo. */
export const RAYO_DESDE = 132
/** Lado de cada logo. */
export const LOGO = 72

/** Los seis logos, en el orden en que aparecen (desde arriba, en sentido horario). `angulo` en grados. */
export const LOGOS: { archivo: string; angulo: number }[] = [
  { archivo: "dft_pro.webp", angulo: 90 },
  { archivo: "tsm_tool_pro.webp", angulo: 30 },
  { archivo: "android_multi_tool.webp", angulo: -30 },
  { archivo: "xiaomi_mi.svg", angulo: -90 },
  { archivo: "ts_tool.webp", angulo: 210 },
  { archivo: "unlock_tool.webp", angulo: 150 },
]

/** Punto del lienzo a `radio` píxeles del centro del emblema, en la dirección `grados`. */
export function punto(radio: number, grados: number): [number, number] {
  const a = (grados * Math.PI) / 180
  return [LIENZO.cx + Math.cos(a) * radio, LIENZO.cy - Math.sin(a) * radio]
}

// Red de fondo (1172:303): 54 líneas y 34 nodos, ya como trazos listos para el SVG.
export const RED_LINEAS = "M546 465L505 316M546 465L393 534M546 465L637 440M546 465L486 611M434 620L393 534M434 620L486 611M434 620L603 643M808 357L857 198M808 357L759 212M609 226L505 316M609 226L544 130M609 226L655 248M609 226L530 208M609 226L591 214M609 226L759 212M505 316L655 248M505 316L530 208M505 316L591 214M284 352L229 200M683 790L761 802M683 790L761 817M683 790L548 830M683 790L603 643M96 737L119 830M96 737L3 822M96 737L18 810M96 737L162 872M96 737L45 692M67 366L9 223M67 366L102 440M132 70L65 1M132 70L229 200M857 198L759 212M544 130L655 248M544 130L530 208M544 130L591 214M393 534L486 611M119 830L3 822M119 830L18 810M119 830L162 872M119 830L45 692M761 802L761 817M655 248L530 208M655 248L591 214M655 248L759 212M530 208L591 214M591 214L759 212M102 440L180 508M3 822L18 810M3 822L162 872M3 822L45 692M18 810L162 872M18 810L45 692M486 611L603 643"
export const RED_NODOS = "M546 465h0M434 620h0M808 357h0M609 226h0M505 316h0M284 352h0M683 790h0M96 737h0M67 366h0M132 70h0M857 198h0M544 130h0M393 534h0M119 830h0M761 802h0M761 817h0M655 248h0M9 223h0M65 1h0M530 208h0M637 440h0M591 214h0M759 212h0M322 805h0M102 440h0M3 822h0M548 830h0M18 810h0M162 872h0M486 611h0M229 200h0M180 508h0M45 692h0M603 643h0"
