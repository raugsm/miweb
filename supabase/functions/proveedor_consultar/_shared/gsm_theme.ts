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

// La cuenta que entrega el proveedor. No hay un solo formato y el catálogo no dice cuál manda cada herramienta (INFO vacío):
// 17-nov «User: … | Pass: …»; 20-nov (AT-261120-043, Moto King) «Rental account active | Login: … | Password: … | Expires: … |
// Desktop app only (no web panel).». Por eso se lee por ETIQUETAS, en cualquier orden, separadas por «|», salto de línea, tab,
// « / », « - », o por coma/punto y coma/espacios antes de otra etiqueta. S4.4, auditoría 18-nov G2 y revisión del 20-nov: se
// entrega SOLO si no hay ninguna duda. Si no, null → Soporte (065):
//  - un usuario (User/Username/Login/Email/Usuario…) y una clave (Pass/Password/Pwd/Clave…), cada uno con un solo valor;
//  - cada valor: ASCII visible, sin «| , ; < > " ' `», sin signo o paréntesis suelto en los bordes, sin relleno («pending», «N/A»);
//  - lo demás solo puede ser un dato conocido que no hace falta (Expires, Server, Note…) sin nada que parezca usuario, clave,
//    PIN o código adentro, o una frase sin números ni «: = @», o emojis. Una etiqueta desconocida (PIN, 2FA, «User 2»…) → null.
// «Account» sola no: a veces es el plan («Account: Premium»), no el usuario (verificación del OpenCode, 20-nov).
const USUARIO = new Set(["user", "username", "user name", "userid", "user id", "login", "login id", "loginid", "login name", "usuario",
  "email", "mail", "correo", "email id", "email address", "user/email", "email/user", "login/email", "email/login",
  "username/email", "email/username"]);
const CLAVE = new Set(["pass", "password", "passwd", "pass word", "pwd", "pw", "clave", "contrasena", "contrasenia"]);
const SOBRA = new Set(["expires", "expire", "expiry", "expiration", "expired", "valid", "validity", "until", "till", "duration", "time",
  "left", "remaining", "hours", "hour", "hrs", "plan", "status", "type", "server", "note", "notes", "info", "information", "rental",
  "rent", "order", "service", "tool", "version", "created", "start", "end", "date", "website", "web", "url", "link", "panel",
  "download", "support", "important", "warning", "attention", "notice", "message", "remark", "instructions", "instruction", "price",
  "cost", "region", "country", "devices", "limit", "vence", "vencimiento", "valido", "duracion", "horas", "nota", "servidor", "tipo",
  "estado"]);
const SOBRA_FRASES = new Set(["order id", "order no", "account type", "account status"]);
// Palabras de un dato de la cuenta: en un texto suelto o en el valor de algo que sobra, no se pasan por alto.
const DATO = /(^|[^a-z])(user|username|login|usuario|e-?mail|mail|correo|pass|passwd|password|pwd|pw|clave|contrase[nñ]a|key|pin|code|c[oó]digo|token|serial|licen[cs]e|otp|2fa|auth|anydesk|activation|activaci[oó]n)([^a-z]|$)/i;
const RELLENO = /^(pending|n\/?a|none|null|hidden|same|tbd|soon|wait|waiting|\*+|x{4,}|-+|\.+|\?+)$/i;
const ENTIDAD: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'", "#039": "'" };
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Después de un valor, antes de otra etiqueta conocida («User: a Pass: b», «User: a, Pass: b», «Password: x Expires: …»).
const ANTES_ETIQUETA = new RegExp(`(?:\\s*[,;])?\\s+(?=(?:${[...USUARIO, ...CLAVE, ...SOBRA_FRASES, ...SOBRA, "e-mail"]
  .sort((a, b) => b.length - a.length).map((e) => esc(e).replace(/ /g, "\\s+")).join("|")})\\s*[:=])`, "i");
const ETIQUETA = /^[^\p{L}\p{N}\x21-\x7E]*(\p{L}[\p{L} ._\/-]{0,30}?)\s*[:=]\s*(.*)$/su;

function tipoDe(etiqueta: string): "usuario" | "clave" | "sobra" | null {
  const todo = etiqueta.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[-_.]/g, "").trim().replace(/\s+/g, " ");
  if (CLAVE.has(todo)) return "clave";
  if (USUARIO.has(todo)) return "usuario";
  return SOBRA_FRASES.has(todo) || todo.split(/[ /]/).every((p) => SOBRA.has(p)) ? "sobra" : null;
}

function valor(v: string, esUsuario: boolean): string | null {
  const q = v.trim().match(/^(["'`])([^"'`]+)\1$/);
  const s = q ? q[2] : v.trim();
  if (!/^[\x21-\x7E]{1,128}$/.test(s) || /[|,;<>"'`]/.test(s)) return null;    // sin espacios, emojis, invisibles ni «…»
  // Un signo o paréntesis en el borde puede ser del mensaje («(User: a | Pass: b)», «Pass: x.»), no del valor.
  if (/[.,;:]$/.test(s) || /^[*(\[{]|[*)\]}]$/.test(s)) return null;
  const par = (a: string, b: string) => s.split(a).length === s.split(b).length;
  if (!par("(", ")") || !par("[", "]") || !par("{", "}") || !/[A-Za-z0-9]/.test(s) || RELLENO.test(s)) return null;
  if (esUsuario && (s.includes(":") || /^www\./i.test(s))) return null;           // ni una dirección web ni «mailto:»
  return s;
}

// Texto suelto que se puede pasar por alto: emojis o símbolos que no son ASCII, o una frase de palabras sin números, sin
// «: = @ # / \» y sin nada que parezca un dato («Rental account active», «Desktop app only (no web panel).»).
function sueltoInofensivo(s: string): boolean {
  if (!/[\x21-\x7E]/.test(s)) return true;
  return /\s/.test(s) && !/[0-9:=@#\/\\]/.test(s) && !DATO.test(s)
    && s.split(/\s+/).every((w) => /^[\p{L}()!.,'’-]+$/u.test(w) || !/[\x21-\x7E]/.test(w));
}

export function leerCuenta(code: unknown): { usuario: string; clave: string } | null {
  const t0 = texto(code);
  if (!t0 || t0.length > 2000) return null;
  // Saltos y negrita/cursiva SIN atributos (un estilo puede esconder letras); cualquier otra etiqueta HTML queda y da null.
  const t = t0.replace(/<br\s*\/?>|<\/?(?:p|div|li)>/gi, "\n").replace(/<\/?(?:b|strong|i|em|u|code|small)>/gi, "")
    .replace(/&(nbsp|amp|lt|gt|quot|apos|#0?39);/gi, (_, n: string) => ENTIDAD[n.toLowerCase()])   // una sola pasada
    .replace(/：/g, ":").replace(/[  ]{2,}/g, " ");
  if (/[<>]/.test(t)) return null;
  const cola = t.split(/\r?\n|\r|\||\t|\s[\/–—•-]\s/);
  const usuarios = new Set<string>();
  const claves = new Set<string>();
  while (cola.length) {
    const tramo = cola.shift()!.trim();
    if (!tramo) continue;
    const m = tramo.match(ETIQUETA);
    if (!m) {
      if (sueltoInofensivo(tramo)) continue;
      return null;
    }
    const tipo = tipoDe(m[1]);
    if (!tipo) return null;
    const [v, ...resto] = m[2].split(ANTES_ETIQUETA);
    cola.unshift(...resto);
    if (tipo === "sobra") {
      // «Note: PIN: 1234», «Support: user @x», «Note: backup abc999 Zz998877» (otro par sin etiqueta).
      if (DATO.test(v) || v.includes("@") || v.split(/\s+/).some((w) => w.length >= 5 && /\p{L}/u.test(w) && /\d/.test(w))) return null;
      continue;
    }
    const x = valor(v, tipo === "usuario");
    if (!x) return null;
    (tipo === "usuario" ? usuarios : claves).add(x);
  }
  // Dos usuarios distintos (Login y Email, User ID y Email…) o dos claves: no se elige.
  if (usuarios.size !== 1 || claves.size !== 1) return null;
  return { usuario: [...usuarios][0], clave: [...claves][0] };
}

// Nada que se guarde o se registre puede llevar la llave: se tapa la llave exacta y cualquier ristra larga.
export function tapar(t: string, llave: string): string {
  let s = t;
  if (llave && llave.length >= 4) s = s.split(llave).join("****");
  return s.replace(/[A-Za-z0-9]{24,}/g, "****").slice(0, 300);
}
