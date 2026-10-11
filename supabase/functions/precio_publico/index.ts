// precio_publico (PUBLICA, verify_jwt=false): precios publicos FRP + Cuentas MI para
// la web (ariadgsm.com). FUENTE DE VERDAD: el PANEL de Ari-Master, que escribe en el
// GATEWAY (sdarsjdwnuimjruthjwz) en sop_config.ajuste / sop_config.precio_servicio /
// sop_config.tasa_cambio. Esta edge llama a negocio.precio_publico_report() por RPC
// (las tablas sop_config no estan expuestas por REST) y devuelve el shape historico
// { settings, tasas, actualizado_en } que el builder de la web ya consume.
//
// Cuando el panel cambia un precio, la web lo refleja solo: la landing refresca cada
// 5s contra el server de la web, que llama aca (el server cachea brevemente).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { admin, CORS, resp } from "./seguridad.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "GET") return resp(405, { error: "metodo" });
  try {
    const db = admin();
    const { data, error } = await db.schema("negocio").rpc("precio_publico_report");
    if (error) throw error;
    const d = (data ?? {}) as { settings?: unknown; tasas?: unknown; actualizado_en?: string };
    if (!Array.isArray(d.settings) || !Array.isArray(d.tasas)) {
      throw new Error("shape invalido");
    }
    return resp(200, {
      settings: d.settings,
      tasas: d.tasas,
      actualizado_en: d.actualizado_en || new Date().toISOString(),
    });
  } catch (e) {
    console.error("precio_publico", (e as Error).message);
    return resp(500, { error: "fallo_interno" });
  }
});
