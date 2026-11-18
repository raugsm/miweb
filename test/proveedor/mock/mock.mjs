// mock.mjs — Proveedor simulado "GSM Theme" (PKGSMHUB) para probar el conector de compra.
// Node 24, sin dependencias. Contrato que imita: API-exacta.md (misma carpeta).
//
//   PUERTO=18080 MOCK_USUARIO=u@x.com MOCK_LLAVE=llave-de-prueba node mock.mjs
//
// API imitada:  POST (o GET) a cualquier ruta que no empiece con /__  (la real es /public/api/index.php)
// Control:      POST /__control  (JSON)  -> ver aplicarControl()
// Estado:       GET  /__estado           -> saldo, órdenes, llamadas, colas
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const APIVERSION = '1.0';

// Catálogo inicial. 556 y su costo son reales (vistos en la API); el resto es inventado para pruebas.
const CATALOGO_BASE = [
  { id: 556, grupo: 'Unlock Tool Rent', tipo: 'REMOTE', nombre: 'Unlock tool Source 1', costo: 0.39, tiempo: '1-10 Minutes', custom: [] },
  { id: 648, grupo: 'Unlock Tool Rent', tipo: 'REMOTE', nombre: 'Unlock tool Source 2', costo: 0.59, tiempo: '1-10 Minutes', custom: [] },
  { id: 807, grupo: 'Ultra Tool Rent', tipo: 'REMOTE', nombre: 'Ultra Tool Rent 1 Hour', costo: 1.2, tiempo: '1-30 Minutes', custom: ['ULTRA ID'] },
];

const ESTADOS = {
  espera: { texto: 'Waiting Action', status: 0 },
  proceso: { texto: 'In Process', status: 1 },
  rechazo: { texto: 'Rejected', status: 3 },
  exito: { texto: 'Success', status: 4 },
};
const RESULTADOS = new Set(['ok', 'rechazo', 'sin_saldo', 'cuelga', 'corta', 'lento', 'no_json', 'llave_mala']);

// Textos exactos del servidor (ver API-exacta.md para la fuente de cada uno).
export const MSG = {
  auth: 'Authentication Failed',
  accion: 'Invalid Action',
  sinId: 'Parameter or Service <ID> missing.',
  paramRequerido: 'Parameter required.',
  noEncontrada: 'Order ID not found!',
  sinSaldo: 'Not enough balance',
  servicio: 'Service not found or inactive.',
  imei: 'IMEI field is required.',
  cfBase64: 'CUSTOMFIELD must be base64 encoded.',
  cfJson: 'CUSTOMFIELD must decode to valid JSON.',
  bulkVacio: 'Parameters required for bulk orders.',
  bulkB64: 'Parameters must be encoded with base64.',
  bulkJson: 'Parameters must be a valid JSON.',
  bulkArray: 'Parameters must be a valid JSON array.',
  bulkSinId: 'Missing targeted service id.',
  bulkSinClave: 'Undefined array key "ID"',
  xmlRoto: "simplexml_load_string(): Entity: line 1: parser error : Start tag expected, '<' not found",
};

const HTML_ERROR = '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Server Error</title></head>'
  + '<body><div class="code">500</div><div class="message">Server Error</div></body></html>';

// ---------- utilidades ----------
const aC = (n) => Math.round(Number(n) * 100); // dinero en centavos para no arrastrar error de coma flotante
const deC = (c) => Math.round(c) / 100;
const entero = (v) => Number.parseInt(String(v ?? '').trim(), 10) || 0; // como (int) de PHP

function esBase64(s) { // misma regla que isBase64() de la versión pública anterior del servidor
  return typeof s === 'string' && /^[A-Za-z0-9+/=]+$/.test(s) && Buffer.from(s, 'base64').toString('base64') === s;
}
function jsonDeBase64(s) {
  try { return { ok: true, valor: JSON.parse(Buffer.from(s, 'base64').toString('utf8')) }; } catch { return { ok: false }; }
}
const esObjeto = (v) => v !== null && typeof v === 'object';
const entradas = (v) => (Array.isArray(v) ? v.map((x, i) => [String(i), x]) : Object.entries(v));
const esListaPhp = (claves) => claves.every((k, i) => k === String(i)); // json_encode de PHP: claves 0..n-1 => array

function textoXml(t) {
  return t.replace(/<!\[CDATA\[([\s\S]*?)\]\]>|&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (m, cdata, ent) => {
    if (cdata !== undefined) return cdata;
    const fijas = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
    if (fijas[ent]) return fijas[ent];
    return String.fromCodePoint(ent[1] === 'x' ? Number.parseInt(ent.slice(2), 16) : Number.parseInt(ent.slice(1), 10));
  });
}

// Imita simplexml_load_string: XML plano (no base64), cualquier raíz, hijos directos sensibles a mayúsculas.
// Devuelve { NOMBRE_HIJO: texto } o null si no es XML.
export function leerXml(s) {
  if (typeof s !== 'string') return null;
  const t = s.trim().replace(/^<\?xml[\s\S]*?\?>\s*/, '');
  const raiz = t.match(/^<([A-Za-z_][\w.:-]*)(\s[^>]*)?(\/>|>([\s\S]*)<\/\1\s*>)$/);
  if (!raiz) return null;
  const hijos = {};
  const re = /<([A-Za-z_][\w.:-]*)(?:\s[^>]*)?(?:\/>|>([\s\S]*?)<\/\1\s*>)/g;
  for (const h of (raiz[4] ?? '').matchAll(re)) if (!(h[1] in hijos)) hijos[h[1]] = textoXml(h[2] ?? '');
  return hijos;
}

// ---------- estado ----------
function estadoInicial() {
  return {
    saldoC: 1000, // 10.00 USD
    moneda: 'USD',
    catalogo: new Map(CATALOGO_BASE.map((s) => [s.id, { ...s, costoC: aC(s.costo), activo: true }])),
    ordenes: new Map(),
    sigId: 104001,
    cola: [], // resultados forzados para los próximos placeimeiorder
    guiones: [], // guiones de estado para las próximas órdenes creadas
    guionDefecto: ['espera', 'exito'],
    limitarCatalogo: false,
    proximoCatalogo: 0,
    llamadas: {},
    peticiones: [],
  };
}

function validarPasos(pasos) {
  if (!Array.isArray(pasos) || pasos.length === 0) throw new Error('los pasos deben ser un array no vacío');
  for (const p of pasos) {
    const estado = typeof p === 'string' ? p : p?.estado;
    if (!ESTADOS[estado]) throw new Error(`paso inválido: ${JSON.stringify(p)} (usar espera|proceso|rechazo|exito)`);
  }
  return pasos;
}

function normResultado(r) {
  const o = typeof r === 'string' ? { resultado: r } : { ...r };
  if (!RESULTADOS.has(o.resultado)) throw new Error(`resultado inválido: ${JSON.stringify(r)}`);
  if (o.resultado === 'lento' && o.ms !== undefined && !(Number(o.ms) >= 0)) throw new Error('lento.ms debe ser >= 0');
  return o;
}

function codigoPorDefecto(estado, o) {
  if (estado === 'exito') return `User: mock${o.id} | Pass: p${o.id}x`;
  if (estado === 'rechazo') return 'Rejected by supplier';
  return null; // service_comments vacío mientras espera
}

function aplicarPaso(st, orden, k) {
  const crudo = orden.pasos[Math.min(k, orden.pasos.length - 1)];
  const p = typeof crudo === 'string' ? { estado: crudo } : crudo;
  orden.estado = ESTADOS[p.estado].texto;
  orden.status = ESTADOS[p.estado].status;
  orden.codigo = 'codigo' in p ? p.codigo : codigoPorDefecto(p.estado, orden);
  if (p.estado === 'rechazo' && !orden.reembolsado) { // el proveedor devuelve el saldo al rechazar
    st.saldoC += orden.precioC;
    orden.reembolsado = true;
  }
}

// Cada consulta (getimeiorder o un ítem de getimeiorderbulk) muestra el paso N y avanza al siguiente.
function consultar(st, orden) {
  aplicarPaso(st, orden, orden.consultas);
  orden.consultas += 1;
}

function crearOrden(st, { srv, precioC, qnt, campos, imei, origen }) {
  st.saldoC -= precioC; // se cobra al crear la orden
  const orden = {
    id: st.sigId++, servicio: srv.id, nombre: srv.nombre, origen, qnt, precioC, imei: imei ?? null, campos,
    pasos: st.guiones.length ? st.guiones.shift() : st.guionDefecto,
    consultas: 0, reembolsado: false, estado: null, status: null, codigo: null, creada: new Date().toISOString(),
  };
  aplicarPaso(st, orden, 0);
  st.ordenes.set(orden.id, orden);
  return orden;
}

// Validaciones previas al cobro (equivalente a orderCreatePermission; ver API-exacta.md §4).
function permiso(st, { servicioId, qnt, imei, customfield }) {
  const srv = st.catalogo.get(servicioId);
  if (!srv || !srv.activo) return { ok: false, mensaje: MSG.servicio };
  if (srv.tipo === 'IMEI' && !imei) return { ok: false, mensaje: MSG.imei };
  let campos = {};
  const vacio = customfield === undefined || customfield === null || customfield === ''
    || (Array.isArray(customfield) && customfield.length === 0);
  if (!vacio) {
    if (!esBase64(customfield)) return { ok: false, mensaje: MSG.cfBase64 };
    const j = jsonDeBase64(customfield);
    if (!j.ok) return { ok: false, mensaje: MSG.cfJson };
    campos = esObjeto(j.valor) ? j.valor : {};
  }
  for (const f of srv.custom) {
    const v = campos[f];
    if (v === undefined || v === null || v === '' || v === '0' || v === 0) return { ok: false, mensaje: `${f} is required.` };
  }
  const precioC = srv.costoC * qnt;
  if (st.saldoC < precioC) return { ok: false, mensaje: MSG.sinSaldo };
  return { ok: true, srv, precioC, campos };
}

const err = (mensaje) => ({ ERROR: [{ MESSAGE: mensaje }], apiversion: APIVERSION });
const ok = (data) => ({ ...data, apiversion: APIVERSION });
const J = (data) => ({ json: data });

function infoCuenta(st, cfg) {
  const s = deC(st.saldoC);
  return { credit: `${s} ${st.moneda}`, creditraw: s, mail: cfg.usuario, currency: st.moneda };
}

function decodificarBulk(params) {
  if (params === undefined || params === null || params === '') return { error: MSG.bulkVacio };
  if (!esBase64(params)) return { error: MSG.bulkB64 };
  const j = jsonDeBase64(params);
  if (!j.ok) return { error: MSG.bulkJson };
  if (!esObjeto(j.valor)) return { error: MSG.bulkArray };
  return { valor: j.valor };
}

// ---------- acciones ----------
function accountInfo(st, cfg) {
  return J(ok({ SUCCESS: [{ MESSAGE: 'Your Account Info', AccountInfo: infoCuenta(st, cfg) }] }));
}

function imeiServiceList(st, cfg) {
  if (st.limitarCatalogo) {
    const ahora = Date.now();
    if (st.proximoCatalogo > ahora) {
      const min = Math.floor((st.proximoCatalogo - ahora) / 60000);
      return J(err(`You are calling this API too frequently! Please try after ${min} minutes.`));
    }
    st.proximoCatalogo = ahora + 5 * 60000;
  }
  const LIST = {};
  const activos = [...st.catalogo.values()].filter((s) => s.activo);
  for (const grupo of [...new Set(activos.map((s) => s.grupo))].sort()) {
    const deGrupo = activos.filter((s) => s.grupo === grupo).sort((a, b) => b.nombre.localeCompare(a.nombre));
    LIST[grupo] = { GROUPNAME: grupo, GROUPTYPE: deGrupo[0].tipo, SERVICES: {} };
    for (const s of deGrupo) {
      LIST[grupo].SERVICES[s.id] = {
        SERVICEID: s.id,
        SERVICETYPE: s.tipo,
        SERVER: s.tipo === 'SERVER' ? 1 : s.tipo === 'IMEI' ? 0 : 2,
        QNT: 1,
        MINQNT: '',
        MAXQNT: '',
        SERVICENAME: s.nombre,
        CREDIT: deC(s.costoC),
        TIME: s.tiempo,
        INFO: '',
        'Requires.Custom': s.custom.length
          ? s.custom.map((f) => ({ type: 'serviceimei', fieldname: f, fieldtype: 'text', description: '', fieldoptions: '', required: 'on' }))
          : null, // el servidor en vivo manda null cuando no hay campos
      };
    }
  }
  return J(ok({ SUCCESS: [{ MESSAGE: 'Service List', LIST, ACCOUNTINFO: infoCuenta(st, cfg) }] }));
}

function ordenForzada(st, params) { // para resultados con cobra:true (error/HTML pero la orden sí se creó)
  const x = leerXml(params) ?? {};
  const srv = st.catalogo.get(entero(x.ID)) ?? st.catalogo.values().next().value;
  const qnt = Math.max(1, entero(x.QNT) || 1);
  return crearOrden(st, { srv, precioC: srv.costoC * qnt, qnt, campos: {}, imei: x.IMEI || null, origen: 'placeimeiorder' });
}

function placeImeiOrder(st, params) {
  const r = st.cola.length ? st.cola.shift() : { resultado: 'ok' };
  switch (r.resultado) {
    case 'llave_mala': return J(err(MSG.auth));
    case 'sin_saldo': return J(err(MSG.sinSaldo));
    case 'rechazo': if (r.cobra) ordenForzada(st, params); return J(err(r.mensaje ?? MSG.servicio));
    case 'no_json': if (r.cobra) ordenForzada(st, params); return { html: HTML_ERROR };
    default: break; // ok | lento | cuelga | corta siguen el camino real
  }
  let salida;
  const x = leerXml(params);
  if (!x || !('ID' in x)) salida = J(err(MSG.sinId));
  else {
    const qnt = Math.max(1, entero(x.QNT) || 1);
    const imei = x.IMEI ? x.IMEI : null;
    const p = permiso(st, { servicioId: entero(x.ID), qnt, imei, customfield: x.CUSTOMFIELD });
    if (!p.ok) salida = J(err(p.mensaje));
    else {
      const o = crearOrden(st, { srv: p.srv, precioC: p.precioC, qnt, campos: p.campos, imei, origen: 'placeimeiorder' });
      salida = J(ok({ SUCCESS: [{ MESSAGE: 'Order received', REFERENCEID: o.id }] }));
    }
  }
  if (r.resultado === 'cuelga') return { colgar: true };
  if (r.resultado === 'corta') return { cortar: true };
  if (r.resultado === 'lento') return { ...salida, demoraMs: Number(r.ms ?? 3000) };
  return salida;
}

function placeBulkOrder(st, params) {
  const d = decodificarBulk(params);
  if (d.error) return J(err(d.error));
  const salida = {};
  const claves = [];
  for (const [ref, pedido] of entradas(d.valor)) {
    const o = esObjeto(pedido) ? pedido : {};
    let item;
    if (!o.ID || o.ID === '0') item = { status: 'error', message: MSG.bulkSinId };
    else {
      const qnt = Math.max(1, entero(o.QNT ?? 1) || 1);
      const p = permiso(st, { servicioId: entero(o.ID), qnt, imei: null, customfield: o.CUSTOMFIELD });
      if (!p.ok) item = { status: 'error', message: p.mensaje };
      else {
        const ord = crearOrden(st, { srv: p.srv, precioC: p.precioC, qnt, campos: p.campos, imei: null, origen: 'placebulkorder' });
        item = { status: 'success', message: 'Order received', referenceid: ord.id };
      }
    }
    salida[ref] = item;
    claves.push(ref);
  }
  if (!claves.length) return J(ok({}));
  return J(ok({ SUCCESS: esListaPhp(claves) ? claves.map((k) => salida[k]) : salida }));
}

function getImeiOrder(st, params) {
  if (params === undefined || params === null || params === '') return J(err(MSG.paramRequerido));
  const x = leerXml(params);
  if (x === null) return J(err(MSG.xmlRoto));
  if (!('ID' in x)) return J(err(MSG.paramRequerido));
  const orden = st.ordenes.get(entero(x.ID));
  if (!orden) return J(err(MSG.noEncontrada));
  consultar(st, orden);
  return J(ok({ SUCCESS: [{ STATUS: orden.status, CODE: orden.codigo }] }));
}

function getImeiOrderBulk(st, params) {
  const d = decodificarBulk(params);
  if (d.error) return J(err(d.error));
  const salida = {};
  for (const [ref, para] of entradas(d.valor)) {
    if (!esObjeto(para) || !('ID' in para)) return J(err(MSG.bulkSinClave));
    const orden = st.ordenes.get(entero(para.ID));
    if (!orden) { salida[ref] = { SUCCESS: [{ STATUS: 0, CODE: '' }] }; continue; } // inexistente = "esperando"
    consultar(st, orden);
    const CODE = orden.status === 4 || orden.status === 3 ? orden.codigo : '';
    salida[ref] = { SUCCESS: [{ STATUS: orden.status, CODE }] };
  }
  return J(ok(salida));
}

function atenderApi(st, cfg, campos) {
  const accion = campos.action ?? '(sin action)';
  st.llamadas[accion] = (st.llamadas[accion] ?? 0) + 1;
  st.peticiones.push({ action: accion, parameters: typeof campos.parameters === 'string' ? campos.parameters.slice(0, 2000) : campos.parameters ?? null, en: new Date().toISOString() });
  if (st.peticiones.length > 100) st.peticiones.shift();
  if (campos.username !== cfg.usuario || campos.apiaccesskey !== cfg.llave) return J(err(MSG.auth));
  switch (campos.action) {
    case 'accountinfo': return accountInfo(st, cfg);
    case 'imeiservicelist': return imeiServiceList(st, cfg);
    case 'getimeiorder': return getImeiOrder(st, campos.parameters);
    case 'getimeiorderbulk': return getImeiOrderBulk(st, campos.parameters);
    case 'placeimeiorder': return placeImeiOrder(st, campos.parameters);
    case 'placebulkorder': return placeBulkOrder(st, campos.parameters);
    default: return J(err(MSG.accion));
  }
}

// ---------- control ----------
const CONTROLES = new Set(['reset', 'saldo', 'costos', 'activo', 'siguiente', 'siguientes', 'guion_siguiente', 'guion_por_defecto', 'guion_orden', 'limitar_catalogo']);

// Body JSON, todas las claves opcionales, se aplican en este orden:
//  reset: true                         -> estado inicial (saldo 10.00, catálogo base, sin órdenes)
//  saldo: 12.5                         -> fija el saldo
//  costos: { "556": 0.45 }             -> fija el costo de servicios
//  activo: { "648": false }            -> activa/desactiva servicios (inactivo = "Service not found or inactive.")
//  siguientes: [ ... ]                 -> reemplaza la cola de resultados de placeimeiorder
//  siguiente: "ok" | { resultado, ms, mensaje, cobra }  -> agrega uno a la cola
//      resultado: ok | rechazo | sin_saldo | cuelga | corta | lento | no_json | llave_mala
//      ms (lento), mensaje (rechazo), cobra: true (rechazo/no_json: crea y cobra la orden igual)
//  guion_por_defecto: [pasos]          -> guion de las órdenes sin guion propio (inicial: ["espera","exito"])
//  guion_siguiente: [pasos]            -> guion para la próxima orden creada (se encolan)
//  guion_orden: { referencia, pasos }  -> reemplaza el guion de una orden existente (vuelve al paso 0)
//      paso: "espera" | "proceso" | "exito" | "rechazo" | { estado, codigo }
//  limitar_catalogo: true|false        -> aplica "imeiservicelist como mucho cada 5 minutos"
function aplicarControl(ctx, c) {
  if (!esObjeto(c) || Array.isArray(c)) throw new Error('el cuerpo debe ser un objeto JSON');
  for (const k of Object.keys(c)) if (!CONTROLES.has(k)) throw new Error(`control desconocido: ${k}`);
  if (c.reset) ctx.st = estadoInicial();
  const st = ctx.st;
  if (c.saldo !== undefined) {
    if (!Number.isFinite(Number(c.saldo))) throw new Error('saldo inválido');
    st.saldoC = aC(c.saldo);
  }
  for (const [id, costo] of Object.entries(c.costos ?? {})) {
    const s = st.catalogo.get(Number(id));
    if (!s || !Number.isFinite(Number(costo))) throw new Error(`costos: servicio o costo inválido (${id})`);
    s.costoC = aC(costo);
  }
  for (const [id, activo] of Object.entries(c.activo ?? {})) {
    const s = st.catalogo.get(Number(id));
    if (!s) throw new Error(`activo: servicio inexistente (${id})`);
    s.activo = Boolean(activo);
  }
  if (c.siguientes !== undefined) {
    if (!Array.isArray(c.siguientes)) throw new Error('siguientes debe ser un array');
    st.cola = c.siguientes.map(normResultado);
  }
  if (c.siguiente !== undefined) st.cola.push(normResultado(c.siguiente));
  if (c.guion_por_defecto !== undefined) st.guionDefecto = validarPasos(c.guion_por_defecto);
  if (c.guion_siguiente !== undefined) st.guiones.push(validarPasos(c.guion_siguiente));
  if (c.guion_orden !== undefined) {
    const o = st.ordenes.get(Number(c.guion_orden?.referencia));
    if (!o) throw new Error('guion_orden: referencia inexistente');
    o.pasos = validarPasos(c.guion_orden.pasos);
    o.consultas = 0;
    aplicarPaso(st, o, 0);
  }
  if (c.limitar_catalogo !== undefined) {
    st.limitarCatalogo = Boolean(c.limitar_catalogo);
    st.proximoCatalogo = 0;
  }
}

function vistaEstado(st) {
  return {
    saldo: deC(st.saldoC),
    moneda: st.moneda,
    placeimeiorder_llamadas: st.llamadas.placeimeiorder ?? 0,
    llamadas: { ...st.llamadas },
    ordenes: [...st.ordenes.values()].map((o) => ({
      referencia: o.id, servicio: o.servicio, nombre: o.nombre, origen: o.origen, qnt: o.qnt, precio: deC(o.precioC),
      imei: o.imei, campos: o.campos, estado: o.estado, status: o.status, codigo: o.codigo,
      reembolsado: o.reembolsado, consultas: o.consultas, pasos: o.pasos, creada: o.creada,
    })),
    cola_resultados: st.cola,
    guiones_pendientes: st.guiones,
    guion_por_defecto: st.guionDefecto,
    limitar_catalogo: st.limitarCatalogo,
    catalogo: [...st.catalogo.values()].map((s) => ({ id: s.id, nombre: s.nombre, tipo: s.tipo, costo: deC(s.costoC), activo: s.activo, requires_custom: s.custom })),
    peticiones: st.peticiones,
  };
}

// ---------- HTTP ----------
async function leerCuerpo(req) {
  const partes = [];
  for await (const p of req) partes.push(p);
  return Buffer.concat(partes);
}

// Imita lo que Laravel deja en $request: query + cuerpo (urlencoded, multipart o JSON), con TrimStrings y
// ConvertEmptyStringsToNull. Ojo: en urlencoded un "+" sin escapar llega como espacio (igual que en PHP).
async function leerCampos(req, url) {
  const campos = Object.fromEntries(url.searchParams);
  const buf = await leerCuerpo(req);
  const ct = String(req.headers['content-type'] ?? '').toLowerCase();
  if (buf.length) {
    if (ct.includes('application/json')) {
      try { const j = JSON.parse(buf.toString('utf8')); if (esObjeto(j)) Object.assign(campos, j); } catch { /* cuerpo ignorado */ }
    } else if (ct.includes('application/x-www-form-urlencoded') || ct.includes('multipart/form-data')) {
      const fd = await new Request('http://mock/', { method: 'POST', headers: { 'content-type': req.headers['content-type'] }, body: buf }).formData();
      for (const [k, v] of fd) campos[k] = typeof v === 'string' ? v : '';
    }
  }
  for (const k of Object.keys(campos)) {
    if (typeof campos[k] === 'string') {
      campos[k] = campos[k].trim();
      if (campos[k] === '') campos[k] = null;
    }
  }
  return campos;
}

function enviarApi(res, data) {
  const cuerpo = JSON.stringify(data);
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Powered-By': 'GSM-THEME',
    'gsmtheme-api-version': APIVERSION,
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache',
    Expires: '0',
    'Content-Length': Buffer.byteLength(cuerpo),
  });
  res.end(cuerpo);
}

function enviarJson(res, codigo, data) {
  const cuerpo = JSON.stringify(data, null, 2);
  res.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(cuerpo) });
  res.end(cuerpo);
}

/**
 * Arranca el proveedor simulado.
 * @returns {Promise<{url:string, puerto:number, cerrar:()=>Promise<void>, estado:()=>object}>}
 */
export async function iniciarMock({ puerto = 18080, host = '127.0.0.1', usuario = 'u@x.com', llave = 'llave-de-prueba' } = {}) {
  const cfg = { usuario, llave };
  const ctx = { st: estadoInicial() };

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://mock');
      if (url.pathname === '/__estado') return enviarJson(res, 200, vistaEstado(ctx.st));
      if (url.pathname === '/__control') {
        if (req.method !== 'POST') return enviarJson(res, 405, { error: 'usar POST' });
        let cuerpo;
        try { cuerpo = JSON.parse((await leerCuerpo(req)).toString('utf8') || '{}'); } catch { return enviarJson(res, 400, { error: 'JSON inválido' }); }
        try { aplicarControl(ctx, cuerpo); } catch (e) { return enviarJson(res, 400, { error: e.message }); }
        return enviarJson(res, 200, vistaEstado(ctx.st));
      }
      const campos = await leerCampos(req, url);
      const r = atenderApi(ctx.st, cfg, campos); // síncrono: cada petición cambia el estado de forma atómica
      if (r.colgar) return; // orden creada y cobrada; nunca se responde (el socket queda abierto)
      if (r.cortar) { req.socket.destroy(); return; } // orden creada y cobrada; se corta sin respuesta
      if (r.demoraMs) await new Promise((listo) => setTimeout(listo, r.demoraMs));
      if (r.html) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8', 'Content-Length': Buffer.byteLength(HTML_ERROR) });
        return res.end(HTML_ERROR);
      }
      return enviarApi(res, r.json);
    } catch (e) {
      if (!res.headersSent) enviarJson(res, 500, { error: `mock: ${e.message}` });
      else res.destroy();
    }
  });

  await new Promise((listo, fallo) => {
    server.once('error', fallo);
    server.listen(puerto, host, listo);
  });
  const real = server.address().port;
  return {
    url: `http://${host}:${real}`,
    puerto: real,
    estado: () => vistaEstado(ctx.st),
    cerrar: () => new Promise((listo) => { server.closeAllConnections(); server.close(() => listo()); }),
  };
}

// ---------- CLI ----------
const esPrincipal = process.argv[1]
  && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
if (esPrincipal) {
  const env = process.env;
  const mock = await iniciarMock({
    puerto: env.PUERTO !== undefined && env.PUERTO !== '' ? Number(env.PUERTO) : 18080,
    host: env.HOST || '127.0.0.1',
    usuario: env.MOCK_USUARIO || 'u@x.com',
    llave: env.MOCK_LLAVE || 'llave-de-prueba',
  });
  console.log(`mock GSM Theme escuchando en ${mock.url}  (API: ${mock.url}/public/api/index.php, control: /__control, estado: /__estado)`);
  const salir = () => mock.cerrar().then(() => process.exit(0));
  process.on('SIGINT', salir);
  process.on('SIGTERM', salir);
}
