# version_web

Lo que muestra y ofrece **la página**. Manda la carpeta: publicar una versión
es subirla, no hace falta tocar ningún panel.

```
releases/
  AriTool-Cliente/
    1.0.4/
      AriTool-1.0.4.exe   ← instalador · lo baja el técnico desde la web
      AriTool.exe         ← exe suelto · lo baja la app sola al actualizarse
```

La función lista `AriTool-Cliente/`, se queda con la carpeta de número más
alto y devuelve el instalador que hay adentro. Si esa carpeta todavía no
tiene instalador (subida a medias), baja a la anterior en vez de dejar la
página sin descarga.

## Por qué no usa version_consultar

`version_consultar` sirve `AriTool.exe`, el exe suelto. La app **se reemplaza
a sí misma** con lo que descarga de ahí, y además exige que la huella SHA-256
publicada coincida o rechaza la actualización.

Si la web ofreciera ese mismo archivo, el técnico que descarga por primera vez
se bajaría el programa sin instalador. Y al revés: si `version_consultar`
apuntara al instalador, cada app instalada se sobrescribiría con el instalador
y quedaría rota. Son dos archivos para dos públicos: no mezclar los enlaces.

## Nombres

El instalador es cualquier `.exe` de la carpeta que **no** se llame
`AriTool.exe`. Da igual si es `AriTool-1.0.4.exe` o `AriTool 1.0.4.exe`.
Preferir el guion: el espacio sale como `%20` en el enlace.

Las versiones se ordenan número por número, no como texto, para que 1.0.10
quede por encima de 1.0.9.
