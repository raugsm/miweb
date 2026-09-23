# Correos de Ari-Tool

`plantillas.py` arma el HTML de los correos que manda Supabase Auth:

| Correo | Cuándo llega | Asunto |
|---|---|---|
| Código de acceso | Al pedir un código para entrar | `Ari-Tool Soporte` |
| Contraseña | Al pedir restablecerla | `Ari-Tool Soporte` |
| Confirmación | Al confirmar el correo | `Ari-Tool Soporte` |

Los tres llevan el mismo asunto a propósito: el correo se reconoce por la
marca, y lo que cambia lo dice el título de adentro.

El remitente aparece como **Ari-Tool Soporte `no-reply@ariadgsm.com`**.

El logo es `ari-tool-logo.png` (el mismo de la web, recortado y a 2x para que
se vea nítido). Vive en el depósito público `marca` del proyecto, no en la web:
así el correo no depende de que el sitio esté desplegado.

    https://sdarsjdwnuimjruthjwz.supabase.co/storage/v1/object/public/marca/ari-tool-logo.png

Si se cambia el logo, hay que volver a subir ese archivo con el mismo nombre.

## Para cambiar un texto

1. Editar `plantillas.py`.
2. `python plantillas.py` → deja `correo.json` y `vista_codigo.html`
   (la vista se abre en el navegador para revisar el diseño).
3. Subirlo con un PATCH a `/v1/projects/<ref>/config/auth` usando
   `SUPABASE_ACCESS_TOKEN`.

Todo va en tablas con estilos en línea: es lo único que Outlook y Gmail
dibujan igual. Nada de CSS en `<style>`, no lo respetan.
