// API de proveedores «GSM Theme» (PKGSMHUB y compatibles) · SOLO LECTURA.
// Lógica pura (sin Deno ni red) para poder probarla con node:test. Ari-Web, 18-nov-2026.
// Solo existen dos acciones permitidas y ninguna gasta saldo. Comprar (placeimeiorder / placebulkorder) no se puede desde acá.

export const PERMITIDAS = ["accountinfo", "imeiservicelist"] as const;
export type Accion = typeof PERMITIDAS[number];

// Nombres = columnas de sop_proveedor.opcion (contrato con Ari-Master, 18-nov).
export type Opcion = {
  numero_servicio: string;
  nombre: string;
  tipo: string; // IMEI · SERVER · REMOTE (alquileres = REMOTE)
  grupo: string;
  costo: number | null;
  demora_anunciada: string;
  min_qnt: number | null;
  max_qnt: number | null;
  datos_que_pide: { custom: unknown; requiere: unknown; info: string | null } | null;
  cruda: unknown; // el servicio tal cual llegó
};

// cruda = solo credit / creditraw / currency (sin el correo de la cuenta).
export type Saldo = { monto: number | null; moneda: string | null; texto: string | null; cruda: Record<string, unknown> | null };

export function esPermitida(accion: string): accion is Accion {
  return (PERMITIDAS as readonly string[]).includes(accion);
}

// Formulario del POST. Tira error ante cualquier acción que no sea de lectura.
export function formulario(usuario: string, llave: string, accion: string): URLSearchParams {
  if (!esPermitida(accion)) throw new Error("accion_no_permitida");
  return new URLSearchParams({ username: usuario, apiaccesskey: llave, action: accion, requestformat: "JSON", parameters: "" });
}

type Obj = Record<string, unknown>;
const esObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

function campo(o: Obj, k: string): unknown {
  const kk = k.toLowerCase();
  for (const [n, v] of Object.entries(o)) if (n.toLowerCase() === kk) return v;
  return undefined;
}

// Busca una clave en cualquier nivel (el proveedor cambia la forma: «AccoutInfo», «ACCOUNTINFO»…).
function buscar(v: unknown, k: string): unknown {
  if (Array.isArray(v)) { for (const x of v) { const r = buscar(x, k); if (r !== undefined) return r; } return undefined; }
  if (!esObj(v)) return undefined;
  const d = campo(v, k);
  if (d !== undefined) return d;
  for (const x of Object.values(v)) { const r = buscar(x, k); if (r !== undefined) return r; }
  return undefined;
}

const texto = (v: unknown): string | null =>
  typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : null;

export function numero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const t = texto(v);
  if (!t) return null;
  const limpio = t.replace(/[^0-9.\-]/g, "");
  if (!limpio || !/[0-9]/.test(limpio)) return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

const entero = (v: unknown): number | null => { const n = numero(v); return n === null ? null : Math.trunc(n); };

// El proveedor contesta 200 aunque falle: el error viene adentro. null = respuesta buena.
export function errorDe(json: unknown): string | null {
  if (!esObj(json)) return "respuesta_inesperada";
  const e = campo(json, "ERROR");
  if (e !== undefined) return texto(buscar(e, "MESSAGE"))?.trim() || "error_sin_mensaje";
  if (campo(json, "SUCCESS") === undefined) return "respuesta_inesperada";
  return null;
}

export function version(json: unknown): string | null {
  return texto(buscar(json, "apiversion"));
}

// El bloque de la cuenta («ACCOUNTINFO», «AccoutInfo»…): el primer objeto con credit/creditraw que no sea un servicio
// (cada servicio también trae «CREDIT», que es su precio).
function cuentaDe(v: unknown): Obj | null {
  if (Array.isArray(v)) { for (const x of v) { const r = cuentaDe(x); if (r) return r; } return null; }
  if (!esObj(v) || campo(v, "SERVICEID") !== undefined) return null;
  if (campo(v, "creditraw") !== undefined || texto(campo(v, "credit")) !== null) return v;
  for (const x of Object.values(v)) { const r = cuentaDe(x); if (r) return r; }
  return null;
}

export function saldoDe(json: unknown): Saldo {
  const c = cuentaDe(json);
  if (!c) return { monto: null, moneda: null, texto: null, cruda: null };
  const crudo = campo(c, "creditraw");
  const t = texto(campo(c, "credit"));
  const monto = numero(crudo) ?? numero(t);
  const moneda = texto(campo(c, "currency")) ?? (t?.match(/[A-Za-z]{3}\s*$/)?.[0].trim() ?? null);
  return { monto, moneda, texto: t ?? texto(crudo), cruda: { credit: t, creditraw: crudo ?? null, currency: moneda } };
}

// Junta cada objeto con SERVICEID + SERVICENAME, recordando el grupo, sin depender de la forma exacta.
export function opcionesDe(json: unknown): Opcion[] {
  const lista: Opcion[] = [];
  const recorrer = (v: unknown, grupo: string, tipo: string) => {
    if (Array.isArray(v)) { for (const x of v) recorrer(x, grupo, tipo); return; }
    if (!esObj(v)) return;
    if (campo(v, "SERVICEID") !== undefined && campo(v, "SERVICENAME") !== undefined) {
      const custom = campo(v, "CUSTOM") ?? null;
      const requiere = campo(v, "Requires.Custom") ?? null;
      const info = texto(campo(v, "INFO"))?.trim() || null;
      lista.push({
        numero_servicio: texto(campo(v, "SERVICEID"))?.trim() ?? "",
        nombre: (texto(campo(v, "SERVICENAME")) ?? "").trim(),
        tipo: (texto(campo(v, "SERVICETYPE")) ?? tipo).trim().toUpperCase(),
        grupo,
        costo: numero(campo(v, "CREDIT")),
        demora_anunciada: (texto(campo(v, "TIME")) ?? "").trim(),
        min_qnt: entero(campo(v, "MINQNT")),
        max_qnt: entero(campo(v, "MAXQNT")),
        datos_que_pide: custom === null && requiere === null && info === null ? null : { custom, requiere, info },
        cruda: v,
      });
      return;
    }
    const g = texto(campo(v, "GROUPNAME")) ?? grupo;
    const t = texto(campo(v, "GROUPTYPE")) ?? tipo;
    for (const x of Object.values(v)) recorrer(x, g, t);
  };
  recorrer(json, "", "");
  // Un mismo SERVICEID repetido se guarda una sola vez (el primero).
  const vistos = new Set<string>();
  return lista.filter((o) => o.numero_servicio !== "" && !vistos.has(o.numero_servicio) && vistos.add(o.numero_servicio));
}

// La cuenta que entrega el proveedor (formato real: «User: … | Pass: …»). S4.4 + auditoría 18-nov G2: se acepta SOLO si el
// texto ENTERO es «User: <usuario> <separador> Pass: <clave>» (mayúsculas o minúsculas; separador «|», salto de línea o
// espacios). Cualquier sobrante (otro texto, etiquetas, una coma, un espacio en la clave, un signo al final) → null → Soporte.
export function leerCuenta(code: unknown): { usuario: string; clave: string } | null {
  const t0 = texto(code);
  if (!t0) return null;
  // Solo se traducen el salto <br> y las entidades comunes; cualquier otra etiqueta queda y hace que no calce.
  const t = t0.replace(/<br\s*\/?>/gi, "\n").replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&").replace(/&#0?39;|&apos;/gi, "'").replace(/&quot;/gi, '"').replace(/&lt;/gi, "<").replace(/&gt;/gi, ">");
  const m = t.match(/^\s*user(?:name)?\s*[:=]\s*([^\s|,;<>]+)\s*(?:\||\r?\n|[ \t])\s*pass(?:word)?\s*[:=]\s*([^\s|,;<>]+)\s*$/i);
  if (!m) return null;
  // Un punto, coma, punto y coma o dos puntos pegado al final puede ser puntuación del mensaje, no parte del valor.
  if (/[.,;:]$/.test(m[1]) || /[.,;:]$/.test(m[2])) return null;
  return { usuario: m[1], clave: m[2] };
}

// Nada que se guarde o se registre puede llevar la llave: se tapa la llave exacta y cualquier ristra larga.
export function tapar(t: string, llave: string): string {
  let s = t;
  if (llave && llave.length >= 4) s = s.split(llave).join("****");
  return s.replace(/[A-Za-z0-9]{24,}/g, "****").slice(0, 300);
}
