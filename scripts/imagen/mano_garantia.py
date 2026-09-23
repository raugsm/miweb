# -*- coding: utf-8 -*-
"""Mete la captura de la garantia dentro de la pantalla del celular.

Se corre a mano cuando cambia la captura:  python scripts/imagen/mano_garantia.py

La pantalla del mockup ocupa x 97..427, y 27..765 (medido pixel a pixel
buscando donde el azul le gana al rojo: el cuerpo del telefono es gris
neutro, la pantalla tira a azul marino incluso en la parte oscura).

Dos cosas que hay que respetar para que no quede pegoteado:
  - El pulgar tapa una franja del borde izquierdo a media altura. La captura
    NO se dibuja ahi: se recorta con la forma real de lo que hoy se ve de
    pantalla, no con un rectangulo.
  - La pantalla apagada tiene un degradado de luz (mas clara arriba, casi
    negra abajo). Esa misma luz se le aplica a la captura, suavizada, para
    que parezca iluminada por la misma escena.
"""
from PIL import Image, ImageDraw, ImageFilter
import numpy as np
import os

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

MANO = os.path.join(RAIZ, "_fuentes", "manoCelular.png")   # AVIF, pese al nombre
CAPTURA = os.path.join(RAIZ, "screenshot", "ariad_garantia.jpeg")
SALIDA = os.path.join(RAIZ, "public", "mano-garantia.avif")

# Pantalla, medida sobre el mockup.
X0, Y0, X1, Y1 = 97, 27, 427, 765          # bordes inclusive
RADIO = 24                                  # esquinas redondeadas
SS = 4                                      # supermuestreo de las mascaras

ANCHO = X1 - X0 + 1
ALTO = Y1 - Y0 + 1


def mascara_redondeada(w, h, radio, ss=SS):
    """Rectangulo redondeado con bordes suaves (se dibuja grande y se achica)."""
    m = Image.new("L", (w * ss, h * ss), 0)
    ImageDraw.Draw(m).rounded_rectangle(
        [0, 0, w * ss - 1, h * ss - 1], radius=radio * ss, fill=255)
    return m.resize((w, h), Image.LANCZOS)


def main():
    mano = Image.open(MANO).convert("RGBA")
    W, H = mano.size
    arr = np.array(mano)
    rgb = arr[..., :3].astype(np.int16)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]

    # --- 1. Que se ve HOY de pantalla (para no pisar el pulgar) -------------
    #     Pantalla = azul oscuro. Piel y cuerpo del telefono = neutros o claros.
    es_pantalla = ((b - r) >= 10) & (r <= 95) & (b >= 20)
    recorte = es_pantalla[Y0:Y1 + 1, X0:X1 + 1]

    visible = Image.fromarray((recorte * 255).astype(np.uint8), "L")
    # Cierra puntitos sueltos y suaviza el filo contra el dedo.
    visible = visible.filter(ImageFilter.MaxFilter(3))
    visible = visible.filter(ImageFilter.MinFilter(3))
    visible = visible.filter(ImageFilter.GaussianBlur(0.8))

    forma = mascara_redondeada(ANCHO, ALTO, RADIO)
    mascara = Image.fromarray(
        (np.array(forma).astype(np.float32) *
         np.array(visible).astype(np.float32) / 255).astype(np.uint8), "L")

    # --- 2. La captura al tamano de la pantalla -----------------------------
    cap = Image.open(CAPTURA).convert("RGB")
    cap = cap.resize((ANCHO, ALTO), Image.LANCZOS)
    cap_a = np.array(cap).astype(np.float32)

    # --- 3. La luz de la escena, tomada de la pantalla apagada --------------
    #     Se usa el brillo original como multiplicador, pero comprimido: crudo
    #     apagaria el pie de la captura casi a negro.
    luz = rgb[Y0:Y1 + 1, X0:X1 + 1].sum(axis=2).astype(np.float32)
    # Solo donde hay pantalla de verdad; el resto se rellena con la mediana.
    validos = recorte & (luz > 0)
    luz[~validos] = np.median(luz[validos])
    # Se pasa a 0..255 para poder desenfocar: el desenfoque no acepta flotantes.
    lo, hi = luz.min(), luz.max()
    luz8 = ((luz - lo) / max(hi - lo, 1e-6) * 255).astype(np.uint8)
    luz = np.array(Image.fromarray(luz8, "L")
                   .filter(ImageFilter.GaussianBlur(45))).astype(np.float32)
    lo, hi = np.percentile(luz, 2), np.percentile(luz, 98)
    luz = np.clip((luz - lo) / max(hi - lo, 1e-6), 0, 1)
    factor = (0.86 + 0.14 * luz)[..., None]        # entre 86% y 100% de brillo
    cap_a *= factor

    # --- 4. Vidrio: reflejo diagonal suave y bordes apenas mas oscuros ------
    yy, xx = np.mgrid[0:ALTO, 0:ANCHO].astype(np.float32)
    diag = (xx / ANCHO) * 0.65 + (1 - yy / ALTO) * 0.35      # 0..1 arriba-der
    brillo = np.clip((diag - 0.58) / 0.42, 0, 1) ** 2 * 26   # blanco muy leve
    cap_a += brillo[..., None]

    borde = np.minimum.reduce([
        xx / 14, (ANCHO - 1 - xx) / 14, yy / 14, (ALTO - 1 - yy) / 14])
    cap_a *= (0.91 + 0.09 * np.clip(borde, 0, 1))[..., None]

    pantalla = Image.fromarray(np.clip(cap_a, 0, 255).astype(np.uint8), "RGB")

    # --- 5. Pegar ------------------------------------------------------------
    fuera = mano.copy()
    fuera.paste(pantalla, (X0, Y0), mascara)

    fuera.save(SALIDA, "AVIF", quality=75)
    print("pantalla:", ANCHO, "x", ALTO)
    print("guardado:", SALIDA, os.path.getsize(SALIDA) // 1024, "KB")


if __name__ == "__main__":
    main()
