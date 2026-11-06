"""Pasa los logos de herramientas (SVG de 0.2 a 2.2 MB) a WebP de 144 x 144.
Dibuja cada SVG en el Chrome sin ventana al doble de tamaño, con fondo transparente, y lo reduce.
Uso: python logos_webp.py <carpeta_svg> <carpeta_salida> <url_base_de_los_svg>"""
import sys, io, os, json, time, base64, urllib.request
from websocket import create_connection
from PIL import Image, ImageDraw

origen, salida, base = sys.argv[1], sys.argv[2], sys.argv[3]
info = json.load(urllib.request.urlopen("http://localhost:9333/json"))
ws = create_connection([p["webSocketDebuggerUrl"] for p in info if p.get("type") == "page"][0], suppress_origin=True)
n = [0]


def cmd(method, params=None):
    n[0] += 1
    mid = n[0]
    ws.send(json.dumps({"id": mid, "method": method, "params": params or {}}))
    while True:
        m = json.loads(ws.recv())
        if m.get("id") == mid:
            return m.get("result", {})


cmd("Page.enable")
cmd("Emulation.setDeviceMetricsOverride", {"width": 400, "height": 400, "deviceScaleFactor": 2, "mobile": False})
cmd("Page.navigate", {"url": "about:blank"})  # página vacía: sin los estilos del sitio
time.sleep(2)
cmd("Emulation.setDefaultBackgroundColorOverride", {"color": {"r": 0, "g": 0, "b": 0, "a": 0}})
for f in sorted(os.listdir(origen)):
    if not f.endswith(".svg"):
        continue
    clave = f[:-4]
    # El SVG va como imagen de datos: una página vacía no puede pedirle archivos al servidor local.
    datos = "data:image/svg+xml;base64," + base64.b64encode(open(os.path.join(origen, f), "rb").read()).decode()
    r = cmd("Runtime.evaluate", {"awaitPromise": True, "returnByValue": True, "expression": """new Promise((ok) => {
        document.documentElement.style.background = 'transparent'
        document.body.innerHTML = ''
        document.body.style.cssText = 'margin:0;background:transparent'
        const i = new Image(); i.onload = () => setTimeout(() => ok('ok'), 300); i.onerror = () => ok('error')
        i.style.cssText = 'display:block;width:144px;height:144px'
        i.src = %s; document.body.appendChild(i) })""" % json.dumps(datos)})
    assert r["result"].get("value") == "ok", (f, r)
    res = cmd("Page.captureScreenshot", {"format": "png", "clip": {"x": 0, "y": 0, "width": 144, "height": 144, "scale": 1}})
    im = Image.open(io.BytesIO(base64.b64decode(res["data"]))).convert("RGBA").resize((144, 144), Image.LANCZOS)
    # Los SVG traen un cuadrado oscuro detrás de la insignia redonda: se recorta en círculo (borde suave).
    mascara = Image.new("L", (576, 576), 0)
    ImageDraw.Draw(mascara).ellipse((0, 0, 575, 575), fill=255)
    im.putalpha(mascara.resize((144, 144), Image.LANCZOS))
    destino = os.path.join(salida, clave + ".webp")
    im.save(destino, "WEBP", quality=88, method=6)
    print(clave, im.size, os.path.getsize(os.path.join(origen, f)) // 1024, "KB ->", round(os.path.getsize(destino) / 1024, 1), "KB", "esquina", im.getpixel((2, 2)))
cmd("Emulation.setDefaultBackgroundColorOverride", {})
cmd("Emulation.clearDeviceMetricsOverride")
