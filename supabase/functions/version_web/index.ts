// version_web (pública): lo que muestra y ofrece la PÁGINA, no la app.
//
// Por qué existe aparte de version_consultar:
// dentro de cada carpeta de versión conviven DOS archivos distintos.
//
//   AriTool-Cliente/1.0.3/AriTool-1.0.3.exe   instalador  -> lo baja la web
//   AriTool-Cliente/1.0.3/AriTool.exe         exe suelto  -> lo baja la app sola
//
// La app se reemplaza a sí misma con lo que descarga: si le diéramos el
// instalador se quedaría con el instalador en lugar del programa. Por eso
// version_consultar sigue intacta sirviendo el exe suelto, y esta sirve el
// instalador. Nadie toca el enlace del otro.
//
// Manda la carpeta: se publica subiendo AriTool-Cliente/<version>/. La de
// número más alto es la vigente; no hace falta escribir nada en el panel.
//
// POST {} → 200 { version, url_descarga, archivo, fecha, soporte }
//         → 200 { version: null }  si todavía no hay ninguna carpeta

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { admin, CORS, resp } from "../_shared/seguridad.ts";

const BUCKET = "releases";
const RAIZ = "AriTool-Cliente";

// El exe que se actualiza solo. Cualquier OTRO .exe de la carpeta es el
// instalador, se llame "AriTool-1.0.3.exe" o "AriTool 1.0.3.exe".
const EXE_DE_LA_APP = "aritool.exe";

/** 1.0.10 es mayor que 1.0.9: se compara número por número, no como texto. */
function comparar(a: string, b: string): number {
  const na = a.split(".").map(Number);
  const nb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(na.length, nb.length); i++) {
    const d = (nb[i] ?? 0) - (na[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

const esVersion = (s: string) => /^\d+(\.\d+){1,3}$/.test(s);

type Entrada = {
  name: string;
  id: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const db = admin();
    const almacen = db.storage.from(BUCKET);

    // El WhatsApp de soporte viaja siempre, haya o no versión publicada.
    const { data: par } = await db.schema("negocio")
      .from("parametro").select("valor")
      .eq("clave", "soporte_whatsapp").eq("estado", "activo").maybeSingle();
    const soporte = (par as { valor: string } | null)?.valor ?? "";

    const { data: carpetas, error: e1 } = await almacen.list(RAIZ, { limit: 1000 });
    if (e1) {
      console.error("listar_raiz", e1.message);
      return resp(200, { version: null, soporte });
    }

    // Las carpetas vienen sin id. Solo las que son un número de versión.
    const versiones = (carpetas as Entrada[] ?? [])
      .filter((x) => x.id === null && esVersion(x.name))
      .map((x) => x.name)
      .sort(comparar);

    if (versiones.length === 0) return resp(200, { version: null, soporte });

    // De la más nueva hacia atrás: la primera que tenga instalador gana. Así
    // una carpeta subida a medias no deja la página sin descarga.
    for (const version of versiones) {
      const { data: dentro } = await almacen.list(`${RAIZ}/${version}`, { limit: 1000 });
      const archivos = (dentro as Entrada[] ?? []).filter((x) => x.id !== null);
      const instalador = archivos.find((x) =>
        x.name.toLowerCase().endsWith(".exe") &&
        x.name.toLowerCase() !== EXE_DE_LA_APP
      );
      if (!instalador) continue;

      const ruta = `${RAIZ}/${version}/${instalador.name}`;
      const { data: publico } = almacen.getPublicUrl(ruta);
      return resp(200, {
        version,
        url_descarga: publico.publicUrl,
        archivo: instalador.name,
        fecha: instalador.updated_at ?? instalador.created_at ?? null,
        soporte,
      });
    }

    return resp(200, { version: null, soporte });
  } catch (e) {
    console.error("version_web", (e as Error).message);
    return resp(500, { error: "fallo_interno" });
  }
});
