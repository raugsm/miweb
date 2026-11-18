// Hablar con el proveedor «GSM Theme» para COMPRAR y SEGUIR (W2/W3). Ari-Web, 18-nov-2026.
// Formato sacado del código público del proveedor (gsmtheme/gsm-theme-api-standards, ver API-exacta.md del 18-nov):
//   placeimeiorder:   parameters = XML plano <PARAMETERS><ID>556</ID><QNT>1</QNT></PARAMETERS> (REMOTE sin IMEI ni CUSTOMFIELD)
//   getimeiorderbulk: parameters = base64(JSON {"<ref nuestra>": {"ID": <referencia>}}) → {"<ref>": {"SUCCESS":[{STATUS, CODE}]}}
// OJO: el proveedor cobra al crear la orden y puede devolver un ERROR DESPUÉS de cobrar. Por eso solo cuentan como rechazo
// los errores «limpios» (salen antes del cobro según su código). Cualquier otra cosa = no se sabe = «en duda», nunca se reintenta.
// placebulkorder NO se usa: un pedido por alquiler. Usa fetch global (Deno y Node).
import { errorDe, saldoDe, tapar } from "./gsm_theme.ts";
import type { Api, EstadoPedido, Falla, RespuestaPedido } from "./ciclo.ts";

const SOLO = new Set(["accountinfo", "placeimeiorder", "getimeiorderbulk"]);

// Errores que según el código del proveedor salen ANTES de cobrar, con el texto ENTERO (anclados: un «Authentication failed»
// de su correo o de su propio proveedor, que llega después de cobrar, no debe pasar por limpio). «Balance process error!» no
// entra: es el paso del cobro. Aun así, la edge solo lo toma como rechazo si además el saldo quedó igual.
const LIMPIOS = [/^authentication failed!?$/i, /^invalid action!?$/i, /^parameter or service [^.]{0,40} missing\.?$/i,
  /^parameter required\.?$/i, /^not enough balance!?$/i, /^service not found or inactive\.?$/i, /^imei field is required\.?$/i,
  /^customfield must [a-z0-9 ]{1,60}\.?$/i, /^[a-z0-9 _-]{1,60} is required\.?$/i];
const LLAVE = /^authentication failed!?$/i;

export function xmlPedido(numeroServicio: string): string {
  if (!/^\d{1,9}$/.test(numeroServicio)) throw new Error("numero_servicio_invalido");
  return `<PARAMETERS><ID>${numeroServicio}</ID><QNT>1</QNT></PARAMETERS>`;
}

// Claves no numéricas: con claves 0..n-1 PHP devuelve un arreglo en vez de un objeto.
export function paramsEstados(referencias: string[]): string {
  const o: Record<string, { ID: number | string }> = {};
  for (const r of referencias) o["r" + r] = { ID: /^\d+$/.test(r) ? Number(r) : r };
  return btoa(JSON.stringify(o));
}

export function leerPedido(json: unknown, llave = ""): RespuestaPedido {
  if (json === null || typeof json !== "object") return { falla: "respuesta_rara", mensaje: "respuesta vacía o no es un objeto" };
  const err = errorDe(json);
  if (err === null) {
    const s = (json as { SUCCESS?: unknown[] }).SUCCESS;
    const ref = Array.isArray(s) && s[0] && typeof s[0] === "object" ? (s[0] as Record<string, unknown>).REFERENCEID : undefined;
    const referencia = ref === undefined || ref === null ? "" : String(ref).trim();
    if (/^\d+$/.test(referencia)) return { aceptado: true, referencia, mensaje: "Order received" };
    return { falla: "respuesta_rara", mensaje: "SUCCESS sin REFERENCEID" };
  }
  // MESSAGE objeto (validación del formulario) también sale antes de cobrar.
  const msg = tapar(err, llave);
  const e = (json as { ERROR?: { MESSAGE?: unknown }[] }).ERROR;
  const esObjeto = Array.isArray(e) && typeof e[0]?.MESSAGE === "object" && e[0]?.MESSAGE !== null;
  const t = err.trim();
  if (esObjeto || LIMPIOS.some((re) => re.test(t))) return { rechazado: true, mensaje: msg, llave: LLAVE.test(t) };
  return { falla: "respuesta_rara", mensaje: msg };
}

export function leerEstados(json: unknown, referencias: string[]): Map<string, EstadoPedido> | Falla {
  if (!json || typeof json !== "object" || Array.isArray(json)) return { falla: "respuesta_rara", mensaje: "estados: respuesta inesperada" };
  if ("ERROR" in (json as object)) {
    const err = errorDe(json) ?? "error_sin_mensaje";
    return { falla: LLAVE.test(err.trim()) ? "llave" : "respuesta_rara", mensaje: err };
  }
  const m = new Map<string, EstadoPedido>();
  const o = json as Record<string, unknown>;
  for (const r of referencias) {
    const it = o["r" + r] as { SUCCESS?: { STATUS?: unknown; CODE?: unknown }[] } | undefined;
    const s = it?.SUCCESS?.[0];
    const st = s ? Number(s.STATUS) : NaN;
    if (!Number.isInteger(st)) continue;                                // sin dato de ese pedido: se pregunta en la próxima vuelta
    m.set(r, { status: st, code: s?.CODE === null || s?.CODE === undefined ? null : String(s.CODE) });
  }
  return m;
}

export function apiGsm(url: string, usuario: string, llave: string, esperaMs = 40_000): Api {
  async function post(action: string, parameters: string): Promise<unknown | Falla> {
    if (!SOLO.has(action)) throw new Error("accion_no_permitida");
    if (!usuario || !llave) return { falla: "llave", mensaje: "falta_llave" };
    let r: Response;
    try {
      r = await fetch(url, { method: "POST", signal: AbortSignal.timeout(esperaMs),
        body: new URLSearchParams({ username: usuario, apiaccesskey: llave, action, requestformat: "JSON", parameters }) });
    } catch (e) {
      const n = (e as Error)?.name;
      return { falla: n === "TimeoutError" || n === "AbortError" ? "sin_respuesta" : "sin_conexion", mensaje: tapar(String((e as Error)?.message ?? e), llave) };
    }
    let crudo = "";
    try { crudo = await r.text(); } catch (e) { return { falla: "sin_respuesta", mensaje: "cortó a mitad de la respuesta" }; }
    try { return JSON.parse(crudo); } catch { return { falla: "respuesta_rara", mensaje: `no_json_http_${r.status}` }; }
  }
  const falla = (x: unknown): x is Falla => typeof x === "object" && x !== null && "falla" in x;
  return {
    async saldo() {
      const j = await post("accountinfo", "");
      if (falla(j)) return j;
      const e = errorDe(j);
      if (e !== null) return { falla: LLAVE.test(e.trim()) ? "llave" : "respuesta_rara", mensaje: tapar(e, llave) };
      return saldoDe(j);
    },
    async pedir(numeroServicio: string) {
      const j = await post("placeimeiorder", xmlPedido(numeroServicio));
      return falla(j) ? j : leerPedido(j, llave);
    },
    async estados(referencias: string[]) {
      if (referencias.length === 0) return new Map();
      const j = await post("getimeiorderbulk", paramsEstados(referencias));
      return falla(j) ? j : leerEstados(j, referencias);
    },
  };
}
