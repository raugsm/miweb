// precio_publico (PUBLICA, verify_jwt=false): precios publicos FRP + Cuentas MI del
// GATEWAY (sdarsjdwnuimjruthjwz, esquema negocio.parametro). La web (ariadgsm.com)
// lee de aca en vez de la base de AriadGSM Cliente (decision Peter 2026-10-11:
// los precios se manejan desde la base de Ariad_SecurityPlugin).
//
// GET -> { settings: [{key,value}], tasas: [{country_code,currency,rate}], actualizado_en }
// El shape de `settings` espeja las claves historicas (frp_cost_usdt/frp_profit_usdt/
// cuenta_mi_cost_usdt[_xx]/cuenta_mi_profit_usdt[_xx]) para que el builder de la web
// no cambie: el precio final se emite como cost con profit 0. Las claves por pais
// SOLO se emiten cuando estan cargadas (el builder cae al precio global si no).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { admin, CORS, resp } from "./seguridad.ts";

const PAISES = ["ar", "cl", "co", "ec", "mx", "pe", "ww"] as const;

// Tasas fijas en 1 para las plazas que cobran en USDT (igual que la base anterior).
const TASAS_USDT = ["AR", "EC", "WW", "USDT"];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "GET") return resp(405, { error: "metodo" });
  try {
    const db = admin();
    const { data, error } = await db.schema("negocio").from("parametro").select("clave,valor");
    if (error) throw error;

    const mapa: Record<string, string> = {};
    for (const p of (data ?? []) as { clave: string; valor: string }[]) {
      mapa[String(p.clave)] = String(p.valor ?? "");
    }
    const tiene = (k: string) => Object.prototype.hasOwnProperty.call(mapa, k);

    const settings: { key: string; value: string }[] = [];

    // FRP: precio final en USDT (un solo numero, lo que el dueño carga).
    if (tiene("precio_frp_usd")) {
      settings.push({ key: "frp_cost_usdt", value: mapa["precio_frp_usd"] });
      settings.push({ key: "frp_profit_usdt", value: "0" });
    }

    // Cuentas MI: global + por pais (solo las cargadas).
    if (tiene("precio_cuenta_mi_usd")) {
      settings.push({ key: "cuenta_mi_cost_usdt", value: mapa["precio_cuenta_mi_usd"] });
      settings.push({ key: "cuenta_mi_profit_usdt", value: "0" });
    }
    for (const suf of PAISES) {
      const clave = `precio_cuenta_mi_usd_${suf}`;
      if (tiene(clave)) {
        settings.push({ key: `cuenta_mi_cost_usdt_${suf}`, value: mapa[clave] });
        settings.push({ key: `cuenta_mi_profit_usdt_${suf}`, value: "0" });
      }
    }

    // Tasas de cambio: las cargadas en parametro + las fijas en 1 (USDT).
    const tasas: { country_code: string; currency: string; rate: string }[] = [
      { country_code: "PE", currency: "PEN", rate: tiene("tasa_usd_pen") ? mapa["tasa_usd_pen"] : "0" },
      { country_code: "CL", currency: "CLP", rate: tiene("tasa_usd_clp") ? mapa["tasa_usd_clp"] : "0" },
      { country_code: "CO", currency: "COP", rate: tiene("tasa_usd_cop") ? mapa["tasa_usd_cop"] : "0" },
      { country_code: "MX", currency: "MXN", rate: tiene("tasa_usd_mxn") ? mapa["tasa_usd_mxn"] : "0" },
      ...TASAS_USDT.map((c) => ({ country_code: c, currency: "USDT", rate: "1" })),
    ];

    return resp(200, {
      settings,
      tasas,
      actualizado_en: new Date().toISOString(),
    });
  } catch (e) {
    console.error("precio_publico", (e as Error).message);
    return resp(500, { error: "fallo_interno" });
  }
});
