# -*- coding: utf-8 -*-
"""Plantillas de correo de Ari-Tool.

Correo en tablas con estilos en linea: es lo unico que Outlook y Gmail
renderizan igual. El logo sale del dominio, que ya lo sirve publico.
"""
import io, json, os

# El logo de Ari-Tool, servido desde el almacen publico del proyecto: no
# depende de que la web este desplegada.
LOGO = ("https://sdarsjdwnuimjruthjwz.supabase.co"
        "/storage/v1/object/public/marca/ari-tool-logo.png")
SITIO = "https://ariadgsm.com"

BG      = "#0b0b0c"   # fondo de la pagina
TARJETA = "#16171b"   # tarjeta
CAMPO   = "#0e0f12"   # bloque del codigo
LINEA   = "#26282e"   # bordes
AZUL    = "#0052d4"   # primario
CIELO   = "#9dc1ff"   # acento claro
BLANCO  = "#ffffff"
TENUE   = "#9aa0aa"

FUENTE = ("-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,"
          "Helvetica,Arial,sans-serif")
MONO = "'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace"


def envoltura(titulo_previo, cuerpo):
    """Cabecera con logo + tarjeta + pie. `cuerpo` son celdas <tr>."""
    return f"""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>Ari-Tool</title>
</head>
<body style="margin:0;padding:0;background:{BG};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">{titulo_previo}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:{BG};margin:0;padding:0;">
<tr><td align="center" style="padding:32px 16px;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;width:100%;">

<!-- marca -->
<tr><td align="center" style="padding:0 0 20px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="padding-right:12px;line-height:0;">
      <img src="{LOGO}" width="88" height="56" alt="Ari-Tool"
           style="display:block;width:88px;height:56px;border:0;">
    </td>
    <td style="font-family:{FUENTE};font-size:15px;font-weight:700;
               letter-spacing:2px;color:{BLANCO};text-transform:uppercase;
               white-space:nowrap;">Ari-Tool
      <span style="color:{CIELO};font-weight:600;">Soporte</span></td>
  </tr></table>
</td></tr>

<!-- tarjeta -->
<tr><td style="background:{TARJETA};border:1px solid {LINEA};border-radius:16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="background:{AZUL};height:3px;line-height:3px;font-size:0;
                   border-radius:16px 16px 0 0;">&nbsp;</td></tr>
{cuerpo}
  </table>
</td></tr>

<!-- pie -->
<tr><td align="center" style="padding:22px 8px 0;font-family:{FUENTE};
      font-size:12px;line-height:19px;color:{TENUE};">
  Enviado por Ari-Tool Soporte ·
  <a href="{SITIO}" style="color:{TENUE};text-decoration:underline;">ariadgsm.com</a><br>
  Este correo es automático, no hace falta responderlo.
</td></tr>

</table>
</td></tr></table>
</body>
</html>"""


def titulo(texto, bajada):
    return f"""    <tr><td style="padding:30px 30px 0;">
      <div style="font-family:{FUENTE};font-size:22px;line-height:30px;
                  font-weight:700;color:{BLANCO};margin:0;">{texto}</div>
      <div style="font-family:{FUENTE};font-size:15px;line-height:23px;
                  color:{TENUE};margin:10px 0 0;">{bajada}</div>
    </td></tr>
"""


def boton(etiqueta, url):
    return f"""    <tr><td style="padding:24px 30px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
        <td align="center" bgcolor="{AZUL}" style="border-radius:10px;">
          <a href="{url}" style="display:block;padding:14px 20px;font-family:{FUENTE};
             font-size:15px;font-weight:600;color:{BLANCO};text-decoration:none;">{etiqueta}</a>
        </td>
      </tr></table>
    </td></tr>
"""


def nota(texto):
    return f"""    <tr><td style="padding:24px 30px 30px;">
      <div style="border-top:1px solid {LINEA};padding-top:18px;font-family:{FUENTE};
                  font-size:13px;line-height:20px;color:{TENUE};">{texto}</div>
    </td></tr>
"""


def codigo_grande():
    """El recuadro con los seis dígitos. Lo comparten el acceso y la clave."""
    return f"""    <tr><td style="padding:24px 30px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td align="center" bgcolor="{CAMPO}"
                style="border:1px solid {LINEA};border-radius:12px;padding:20px 12px;
                       font-family:{MONO};font-size:32px;line-height:40px;font-weight:700;
                       color:{BLANCO};letter-spacing:10px;text-indent:10px;">{{{{ .Token }}}}</td></tr>
      </table>
      <div style="font-family:{FUENTE};font-size:13px;line-height:20px;color:{CIELO};
                  padding-top:12px;text-align:center;">Vence en 10 minutos · un solo uso</div>
    </td></tr>
"""


# ---------------------------------------------------------------- codigo OTP
CODIGO = envoltura(
    "Tu código de acceso a Ari-Tool. Vence en 10 minutos.",
    titulo("Tu código de acceso",
           "Escribí estos seis dígitos en Ari-Tool para entrar a tu cuenta.")
    + codigo_grande()
    + boton("Entrar sin escribir el código", "{{ .ConfirmationURL }}")
    + nota("Si no pediste este código, ignorá el correo: sin él nadie entra a tu cuenta. "
           "Ari-Tool nunca te va a pedir tu contraseña por correo ni por chat."))

# ------------------------------------------------------------ recuperar clave
RECUPERAR = envoltura(
    "Tu código para cambiar la contraseña de Ari-Tool.",
    titulo("Cambiá tu contraseña",
           "Escribí estos seis dígitos en Ari-Tool y ahí vas a poder poner "
           "una contraseña nueva.")
    + codigo_grande()
    + nota("Si no pediste el cambio, ignorá el correo: tu contraseña de siempre "
           "sigue funcionando y nadie puede cambiarla sin este código. "
           "Ari-Tool nunca te va a pedir tu contraseña por correo ni por chat."))

# --------------------------------------------------------------- confirmación
CONFIRMAR = envoltura(
    "Confirmá tu correo para activar tu cuenta de Ari-Tool.",
    titulo("Confirmá tu correo",
           "Un paso más y tu cuenta de Ari-Tool queda lista para trabajar.")
    + boton("Confirmar mi correo", "{{ .ConfirmationURL }}")
    + nota("Si no creaste ninguna cuenta en Ari-Tool, ignorá este correo."))


if __name__ == "__main__":
    salida = {
        "mailer_subjects_magic_link": "Ari-Tool Soporte",
        "mailer_templates_magic_link_content": CODIGO,
        "mailer_subjects_recovery": "Ari-Tool Soporte",
        "mailer_templates_recovery_content": RECUPERAR,
        "mailer_subjects_confirmation": "Ari-Tool Soporte",
        "mailer_templates_confirmation_content": CONFIRMAR,
    }
    carpeta = os.path.dirname(os.path.abspath(__file__))
    io.open(os.path.join(carpeta, "correo.json"), "w", encoding="utf-8").write(
        json.dumps(salida, ensure_ascii=False))
    io.open(os.path.join(carpeta, "vista_codigo.html"), "w", encoding="utf-8").write(
        CODIGO.replace("{{ .Token }}", "082143")
              .replace("{{ .ConfirmationURL }}", "#"))
    print("listo:", len(CODIGO), "bytes la del código")
