// node --test mock.test.mjs
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { iniciarMock, MSG } from './mock.mjs';

const USUARIO = 'u@x.com';
const LLAVE = 'llave-de-prueba';
let mock;

before(async () => { mock = await iniciarMock({ puerto: 0 }); });
after(async () => { await mock.cerrar(); });
beforeEach(async () => { await control({ reset: true }); });

async function api(action, parameters = '', { usuario = USUARIO, llave = LLAVE, signal } = {}) {
  const body = new URLSearchParams({ username: usuario, apiaccesskey: llave, action, requestformat: 'JSON', parameters });
  const r = await fetch(`${mock.url}/public/api/index.php`, { method: 'POST', body, signal });
  const texto = await r.text();
  let json = null;
  try { json = JSON.parse(texto); } catch { /* no es JSON */ }
  return { status: r.status, tipo: r.headers.get('content-type'), cabeceras: r.headers, texto, json };
}
async function control(c) {
  const r = await fetch(`${mock.url}/__control`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(c) });
  const j = await r.json();
  if (r.status !== 200) throw new Error(j.error);
  return j;
}
const estado = async () => (await fetch(`${mock.url}/__estado`)).json();
const xml = (o) => `<PARAMETERS>${Object.entries(o).map(([k, v]) => `<${k}>${v}</${k}>`).join('')}</PARAMETERS>`;
const b64 = (v) => Buffer.from(JSON.stringify(v)).toString('base64');
const pedir = (id, extra = {}, opciones) => api('placeimeiorder', xml({ ID: id, QNT: 1, ...extra }), opciones);
const consultar = (ref) => api('getimeiorder', xml({ ID: ref }));
const errorDe = (r) => r.json?.ERROR?.[0]?.MESSAGE;

test('auth: usuario/llave incorrectos y acción inválida -> ERROR con HTTP 200 y apiversion', async () => {
  const r = await api('accountinfo', '', { llave: 'otra' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { ERROR: [{ MESSAGE: 'Authentication Failed' }], apiversion: '1.0' });
  assert.equal(r.cabeceras.get('gsmtheme-api-version'), '1.0');
  assert.equal(errorDe(await api('accountinfo', '', { usuario: 'otro@x.com' })), 'Authentication Failed');
  assert.equal(errorDe(await api('noexiste')), 'Invalid Action');
});

test('accountinfo y control saldo', async () => {
  await control({ saldo: 12.5 });
  const r = await api('accountinfo');
  assert.deepEqual(r.json, {
    SUCCESS: [{ MESSAGE: 'Your Account Info', AccountInfo: { credit: '12.5 USD', creditraw: 12.5, mail: USUARIO, currency: 'USD' } }],
    apiversion: '1.0',
  });
});

test('imeiservicelist: forma, Requires.Custom, control costos y límite de 5 minutos', async () => {
  await control({ costos: { 648: 0.65 } });
  let r = await api('imeiservicelist');
  const s = r.json.SUCCESS[0];
  assert.equal(s.MESSAGE, 'Service List');
  const svc = s.LIST['Unlock Tool Rent'].SERVICES;
  assert.equal(svc['556'].SERVICETYPE, 'REMOTE');
  assert.equal(svc['556'].SERVER, 2);
  assert.equal(svc['556'].CREDIT, 0.39);
  assert.equal(svc['556']['Requires.Custom'], null);
  assert.equal(svc['648'].CREDIT, 0.65);
  assert.deepEqual(s.LIST['Ultra Tool Rent'].SERVICES['807']['Requires.Custom'],
    [{ type: 'serviceimei', fieldname: 'ULTRA ID', fieldtype: 'text', description: '', fieldoptions: '', required: 'on' }]);
  assert.equal(s.ACCOUNTINFO.creditraw, 10);
  // sin el flag no hay límite
  assert.ok((await api('imeiservicelist')).json.SUCCESS);
  await control({ limitar_catalogo: true });
  assert.ok((await api('imeiservicelist')).json.SUCCESS);
  r = await api('imeiservicelist');
  assert.match(errorDe(r), /^You are calling this API too frequently! Please try after \d+ minutes\.$/);
  await control({ limitar_catalogo: false });
  assert.ok((await api('imeiservicelist')).json.SUCCESS);
});

test('placeimeiorder ok: REFERENCEID entero, cobra el costo y cuenta la llamada', async () => {
  const r = await pedir(556);
  assert.equal(r.json.SUCCESS[0].MESSAGE, 'Order received');
  assert.equal(typeof r.json.SUCCESS[0].REFERENCEID, 'number');
  assert.equal(r.json.apiversion, '1.0');
  const e = await estado();
  assert.equal(e.saldo, 9.61);
  assert.equal(e.placeimeiorder_llamadas, 1);
  assert.equal(e.ordenes.length, 1);
  assert.equal(e.ordenes[0].referencia, r.json.SUCCESS[0].REFERENCEID);
  assert.equal(e.ordenes[0].estado, 'Waiting Action');
});

test('placeimeiorder: parameters debe ser XML plano (base64 o minúsculas -> <ID> missing)', async () => {
  const plano = xml({ ID: 556, QNT: 1 });
  let r = await api('placeimeiorder', Buffer.from(plano).toString('base64'));
  assert.equal(errorDe(r), MSG.sinId);
  r = await api('placeimeiorder', '<PARAMETERS><id>556</id></PARAMETERS>');
  assert.equal(errorDe(r), MSG.sinId);
  r = await api('placeimeiorder', '<?xml version="1.0"?><X><ID>556</ID></X>'); // cualquier raíz sirve
  assert.ok(r.json.SUCCESS);
  r = await api('placeimeiorder', xml({ ID: 9999 }));
  assert.equal(errorDe(r), 'Service not found or inactive.');
  await control({ activo: { 648: false } });
  assert.equal(errorDe(await pedir(648)), 'Service not found or inactive.');
  assert.equal((await estado()).saldo, 9.61);
});

test('placeimeiorder 807: campo requerido por CUSTOMFIELD = base64(JSON)', async () => {
  assert.equal(errorDe(await pedir(807)), 'ULTRA ID is required.');
  assert.equal(errorDe(await pedir(807, { CUSTOMFIELD: 'no base64!' })), MSG.cfBase64);
  assert.equal(errorDe(await pedir(807, { CUSTOMFIELD: Buffer.from('{malo').toString('base64') })), MSG.cfJson);
  const r = await pedir(807, { CUSTOMFIELD: b64({ 'ULTRA ID': 'u-123' }) });
  assert.ok(r.json.SUCCESS);
  const e = await estado();
  assert.deepEqual(e.ordenes[0].campos, { 'ULTRA ID': 'u-123' });
  assert.equal(e.saldo, 8.8);
});

test('sin_saldo forzado y natural: "Not enough balance" sin cobrar', async () => {
  await control({ siguiente: 'sin_saldo' });
  assert.equal(errorDe(await pedir(556)), 'Not enough balance');
  await control({ saldo: 0.2 });
  assert.equal(errorDe(await pedir(556)), 'Not enough balance');
  const e = await estado();
  assert.equal(e.saldo, 0.2);
  assert.equal(e.ordenes.length, 0);
  assert.equal(e.placeimeiorder_llamadas, 2);
});

test('rechazo: ERROR con mensaje sin cobrar; con cobra:true crea la orden igual', async () => {
  await control({ siguientes: [{ resultado: 'rechazo', mensaje: 'Service is temporarily disabled' }, { resultado: 'rechazo', mensaje: 'SQLSTATE[HY000]', cobra: true }] });
  assert.equal(errorDe(await pedir(556)), 'Service is temporarily disabled');
  assert.equal((await estado()).saldo, 10);
  assert.equal(errorDe(await pedir(648)), 'SQLSTATE[HY000]');
  const e = await estado();
  assert.equal(e.saldo, 9.41);
  assert.equal(e.ordenes.length, 1);
});

test('llave_mala: error de autenticación en el próximo pedido, sin cobrar', async () => {
  await control({ siguiente: 'llave_mala' });
  assert.equal(errorDe(await pedir(556)), 'Authentication Failed');
  assert.equal((await estado()).saldo, 10);
  assert.ok((await pedir(556)).json.SUCCESS); // la cola se consumió
});

test('cuelga: cobra y crea la orden pero nunca responde', async () => {
  await control({ siguiente: 'cuelga' });
  await assert.rejects(pedir(556, {}, { signal: AbortSignal.timeout(300) }), (e) => e.name === 'TimeoutError' || e.name === 'AbortError');
  const e = await estado();
  assert.equal(e.ordenes.length, 1);
  assert.equal(e.saldo, 9.61);
  assert.ok((await pedir(556)).json.SUCCESS); // el servidor sigue atendiendo
});

test('corta: cobra y crea la orden y corta el socket sin respuesta', async () => {
  await control({ siguiente: 'corta' });
  await assert.rejects(pedir(556), (e) => e instanceof TypeError);
  const e = await estado();
  assert.equal(e.ordenes.length, 1);
  assert.equal(e.saldo, 9.61);
});

test('lento: responde bien después de N ms', async () => {
  await control({ siguiente: { resultado: 'lento', ms: 400 } });
  const t0 = Date.now();
  const r = await pedir(556);
  assert.ok(Date.now() - t0 >= 380);
  assert.ok(r.json.SUCCESS[0].REFERENCEID);
});

test('no_json: HTTP 200 con HTML y sin cobrar (cobra:true sí cobra)', async () => {
  await control({ siguientes: ['no_json', { resultado: 'no_json', cobra: true }] });
  let r = await pedir(556);
  assert.equal(r.status, 200);
  assert.match(r.tipo, /text\/html/);
  assert.equal(r.json, null);
  assert.equal((await estado()).saldo, 10);
  r = await pedir(556);
  assert.equal(r.json, null);
  assert.equal((await estado()).ordenes.length, 1);
});

test('guion: espera -> proceso -> éxito con la cuenta', async () => {
  await control({ guion_siguiente: ['espera', 'proceso', { estado: 'exito', codigo: 'User: abc123 | Pass: x9y8' }] });
  const ref = (await pedir(556)).json.SUCCESS[0].REFERENCEID;
  assert.deepEqual((await consultar(ref)).json, { SUCCESS: [{ STATUS: 0, CODE: null }], apiversion: '1.0' });
  assert.equal((await consultar(ref)).json.SUCCESS[0].STATUS, 1);
  assert.deepEqual((await consultar(ref)).json.SUCCESS[0], { STATUS: 4, CODE: 'User: abc123 | Pass: x9y8' });
  assert.deepEqual((await consultar(ref)).json.SUCCESS[0], { STATUS: 4, CODE: 'User: abc123 | Pass: x9y8' }); // se queda en el último
});

test('guion: rechazo devuelve el saldo una sola vez', async () => {
  await control({ guion_siguiente: ['espera', { estado: 'rechazo', codigo: 'Out of stock' }] });
  const ref = (await pedir(648)).json.SUCCESS[0].REFERENCEID;
  assert.equal((await estado()).saldo, 9.41);
  await consultar(ref);
  assert.deepEqual((await consultar(ref)).json.SUCCESS[0], { STATUS: 3, CODE: 'Out of stock' });
  await consultar(ref);
  const e = await estado();
  assert.equal(e.saldo, 10);
  assert.equal(e.ordenes[0].reembolsado, true);
});

test('guion: éxito con CODE no interpretable y guion_orden sobre una orden existente', async () => {
  const ref = (await pedir(556)).json.SUCCESS[0].REFERENCEID;
  await control({ guion_orden: { referencia: ref, pasos: [{ estado: 'exito', codigo: 'Done! Send your next order' }] } });
  assert.deepEqual((await consultar(ref)).json.SUCCESS[0], { STATUS: 4, CODE: 'Done! Send your next order' });
  await control({ guion_por_defecto: ['proceso'] });
  const ref2 = (await pedir(556)).json.SUCCESS[0].REFERENCEID;
  assert.equal((await consultar(ref2)).json.SUCCESS[0].STATUS, 1);
  await assert.rejects(control({ guion_siguiente: ['volando'] }), /paso inválido/);
  await assert.rejects(control({ siguiente: 'explota' }), /resultado inválido/);
  await assert.rejects(control({ sald: 1 }), /control desconocido/);
});

test('referencia inexistente: getimeiorder da ERROR, getimeiorderbulk da STATUS 0 / CODE vacío', async () => {
  assert.equal(errorDe(await consultar(999999)), 'Order ID not found!');
  assert.equal(errorDe(await api('getimeiorder', '')), 'Parameter required.');
  assert.equal(errorDe(await api('getimeiorder', '<P><X>1</X></P>')), 'Parameter required.');
  assert.match(errorDe(await api('getimeiorder', 'PFA+PElEPjE8L0lEPjwvUD4=')), /^simplexml_load_string\(\)/);
  await control({ guion_siguiente: [{ estado: 'exito', codigo: 'User: u1 | Pass: p1' }] });
  await control({ guion_siguiente: ['proceso'] });
  const a = (await pedir(556)).json.SUCCESS[0].REFERENCEID;
  const b = (await pedir(556)).json.SUCCESS[0].REFERENCEID;
  const r = await api('getimeiorderbulk', b64({ x1: { ID: a }, x2: { ID: b }, x3: { ID: 999999 } }));
  assert.deepEqual(r.json, {
    x1: { SUCCESS: [{ STATUS: 4, CODE: 'User: u1 | Pass: p1' }] },
    x2: { SUCCESS: [{ STATUS: 1, CODE: '' }] },
    x3: { SUCCESS: [{ STATUS: 0, CODE: '' }] },
    apiversion: '1.0',
  });
  assert.equal(errorDe(await api('getimeiorderbulk', '')), MSG.bulkVacio);
  assert.equal(errorDe(await api('getimeiorderbulk', xml({ ID: a }))), MSG.bulkB64);
  assert.equal(errorDe(await api('getimeiorderbulk', Buffer.from('{malo').toString('base64'))), MSG.bulkJson);
  assert.equal(errorDe(await api('getimeiorderbulk', b64(5))), MSG.bulkArray);
  assert.equal(errorDe(await api('getimeiorderbulk', b64({ x: { REF: 1 } }))), 'Undefined array key "ID"');
});

test('placebulkorder: claves propias -> objeto; claves 0..n-1 -> array; errores por ítem', async () => {
  await control({ saldo: 1 });
  const r = await api('placebulkorder', b64({
    p1: { ID: 556, QNT: 1, CUSTOMFIELD: b64('') },
    p2: { ID: 807, QNT: 1, CUSTOMFIELD: b64({ 'ULTRA ID': 'u-9' }) },
    p3: { QNT: 1 },
    p4: { ID: 807, QNT: 1 },
  }));
  const S = r.json.SUCCESS;
  assert.equal(S.p1.status, 'success');
  assert.equal(S.p1.message, 'Order received');
  assert.equal(typeof S.p1.referenceid, 'number');
  assert.deepEqual(S.p2, { status: 'error', message: 'Not enough balance' }); // quedaban 0.61
  assert.deepEqual(S.p3, { status: 'error', message: 'Missing targeted service id.' });
  assert.deepEqual(S.p4, { status: 'error', message: 'ULTRA ID is required.' });
  assert.equal((await estado()).saldo, 0.61);
  const lista = await api('placebulkorder', b64([{ ID: 556 }]));
  assert.ok(Array.isArray(lista.json.SUCCESS));
  assert.equal(lista.json.SUCCESS[0].status, 'success');
  assert.equal(errorDe(await api('placebulkorder', '')), MSG.bulkVacio);
});

test('un "+" sin escapar en el form rompe el base64 (igual que PHP)', async () => {
  const conMas = b64({ a: { ID: 556, CUSTOMFIELD: '>>>' } }); // "Pj4+" contiene "+"
  assert.ok(conMas.includes('+'));
  const body = `username=${encodeURIComponent(USUARIO)}&apiaccesskey=${LLAVE}&action=placebulkorder&requestformat=JSON&parameters=${conMas}`;
  const r = await fetch(`${mock.url}/public/api/index.php`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
  assert.equal((await r.json()).ERROR[0].MESSAGE, MSG.bulkB64);
});

test('CLI: arranca con PUERTO, MOCK_USUARIO y MOCK_LLAVE', async () => {
  const archivo = fileURLToPath(new URL('./mock.mjs', import.meta.url));
  const hijo = spawn(process.execPath, [archivo], { env: { ...process.env, PUERTO: '0', MOCK_USUARIO: 'otro@x.com', MOCK_LLAVE: 'otra-llave' } });
  try {
    const url = await new Promise((listo, fallo) => {
      let buf = '';
      hijo.stdout.on('data', (d) => { buf += d; const m = buf.match(/http:\/\/[\d.]+:\d+/); if (m) listo(m[0]); });
      hijo.on('exit', (c) => fallo(new Error(`el mock salió con ${c}`)));
      setTimeout(() => fallo(new Error('el mock no arrancó')), 5000);
    });
    const r = await fetch(`${url}/public/api/index.php`, {
      method: 'POST',
      body: new URLSearchParams({ username: 'otro@x.com', apiaccesskey: 'otra-llave', action: 'accountinfo', requestformat: 'JSON', parameters: '' }),
    });
    assert.equal((await r.json()).SUCCESS[0].AccountInfo.mail, 'otro@x.com');
  } finally {
    hijo.kill();
  }
});
