// «Las herramientas propias mantienen su lógica» (Peter, 18-nov). Prueba en seco, ANTES = DESPUÉS para las 6 propias con
// opción enlazada (datos copiados de prod el 18-nov: precio, recargo, visible, horas y enlaces). Corre el ciclo REAL de la
// edge (ciclo.ts / api_gsm.ts) contra el proveedor simulado, con el interruptor APAGADO y después ENCENDIDO, y comprueba:
//   · no cambia nada de la herramienta (precio, recargo, visible), ni del alquiler, ni las cuentas propias, ni los eventos;
//   · no se crea ningún pedido solo, no sale ninguna orden al proveedor y no aparece ningún aviso nuevo para ellas;
//   · lo único nuevo es aditivo: el botón «Pedir al proveedor» de Soporte funciona si Soporte lo toca;
//   · y si Admin las pone en «respaldo», la compra automática trae la cuenta sin cambiar precio, recargo ni lo cobrado.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { iniciarMock } from "./mock/mock.mjs";
import { vuelta } from "../../supabase/functions/proveedor_pedidos/_shared/ciclo.ts";
import { apiGsm } from "../../supabase/functions/proveedor_pedidos/_shared/api_gsm.ts";

const D = (process.env.PROPUESTAS_DIR ?? "C:/private/AriTool_Recursos/db-diagramas/propuestas").replace(/\/?$/, "/");
const vivo = JSON.parse(readFileSync(new URL("./datos/vivo-ultima.json", import.meta.url), "utf8"));
const PROPIAS = [
  ["android_multi_tool", "Android Multi Tool", 2, 0.7, 1, true], ["dft_pro", "DFT Pro", 48, 2.1, 1, true],
  ["tfm_tool_pro", "TFM Tool Pro", 4, 2, 1, false], ["tr_tools_pro", "TR Tools Pro", 24, 2.1, 1, false],
  ["tsm_tool_pro", "TSM Tool Pro", 5, 0.7, 1.4, true], ["unlock_tool", "Unlock Tool", 6, 0.7, 1, true]];
const ENLACES = [["android_multi_tool", "36"], ["android_multi_tool", "673"], ["dft_pro", "107"], ["dft_pro", "645"], ["dft_pro", "661"],
  ["tfm_tool_pro", "523"], ["tfm_tool_pro", "669"], ["tr_tools_pro", "651"], ["tr_tools_pro", "652"], ["tsm_tool_pro", "671"],
  ["tsm_tool_pro", "725"], ["unlock_tool", "556"], ["unlock_tool", "648"], ["unlock_tool", "649"]];

const PUERTO = 18098;
const mock = await iniciarMock({ puerto: PUERTO });
const estadoMock = () => fetch(`http://127.0.0.1:${PUERTO}/__estado`).then((r) => r.json());
const db = new PGlite();
let fallas = 0;
const ok = (c, m, x = "") => { console.log((c ? "OK   " : "FALLA") + " " + m + (x ? "  " + (typeof x === "string" ? x : JSON.stringify(x)) : "")); if (!c) fallas++; };
const uno = async (q, p = []) => (await db.query(q, p)).rows[0];

await db.exec(`create role anon; create role authenticated; create role service_role;
  create schema sop_acceso; create schema auth; create schema sop_comun; create schema sop_config;
  create table sop_config.ajuste (clave text primary key, valor text);
  create function sop_acceso.tiene_capacidad(p text) returns boolean language sql stable as $$ select coalesce(current_setting('prueba.capacidad', true), '') = p $$;
  create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
  create schema sop_alquiler;
  create table sop_alquiler.herramienta (clave text primary key, nombre text, horas int, precio_usdt numeric, recargo_usdt numeric, visible boolean);
  create table sop_alquiler.alquiler (id uuid primary key default gen_random_uuid(), herramienta text, situacion text default 'en_espera',
    pago_situacion text default 'confirmado', cuenta_id uuid, devolucion_solicitada_en timestamptz, precio_final_usdt numeric, recargo_usdt numeric,
    pagado_en timestamptz default now() - interval '1 hour', estado_registro text default 'activo', devuelto_en timestamptz, externo boolean,
    inicio timestamptz, fin_previsto timestamptz);
  create table sop_alquiler.cuenta (id uuid primary key default gen_random_uuid(), herramienta text, usuario text, clave_cif bytea, estado text,
    externa boolean, alquilada_hasta timestamptz, notas text);
  create table sop_alquiler.evento (id bigserial, cuenta_id uuid, alquiler_id uuid, tipo text, grupo text, detalle jsonb, quien uuid);
  create function sop_alquiler.cifrar(t text) returns bytea language sql as $$ select convert_to(t, 'UTF8') $$;
  create function sop_alquiler.descifrar(b bytea) returns text language sql as $$ select convert_from(b, 'UTF8') $$;`);
for (const f of ["20261118-proveedor-alquiler-base.sql", "20261118-proveedor-m1-core.sql", "20261118-proveedor-compra.sql",
                 "20261118-proveedor-alertas-extra.sql", "20261118-proveedor-oculta-motivo.sql", "20261118-proveedor-saldo-v5.sql"]) {
  await db.exec(readFileSync(D + f, "utf8"));
}
const servicio = () => db.exec(`select set_config('request.jwt.claims', '{"role":"service_role"}', false); select set_config('prueba.capacidad', '', false)`);
await servicio();
await db.query("select sop_proveedor.catalogo_sincronizar('pkgsmhub', $1::jsonb, true, null)", [JSON.stringify(vivo.opciones)]);
await db.query("select sop_proveedor.saldo_registrar('pkgsmhub', 100, 'usd', true, null)");
for (const h of PROPIAS) await db.query("insert into sop_alquiler.herramienta values ($1, $2, $3, $4, $5, $6)", h);
for (const [h, n] of ENLACES) {
  if (!(await uno("select 1 x from sop_proveedor.opcion where numero_servicio = $1", [n]))) continue;   // por si la copia del catálogo no la trae
  await db.query("insert into sop_proveedor.enlace (herramienta, proveedor_clave, numero_servicio, horas) values ($1, 'pkgsmhub', $2, 24)", [h, n]);
}
// Sin fila en producto_config: como en prod (modo «propio»). Cuentas propias y dos alquileres esperando por herramienta.
for (const [h] of PROPIAS) {
  await db.query("insert into sop_alquiler.cuenta (herramienta, usuario, estado, externa) values ($1, 'propia-' || $1, 'alquilada', false)", [h]);
  for (let i = 0; i < 2; i++) {
    await db.query(`insert into sop_alquiler.alquiler (herramienta, precio_final_usdt, recargo_usdt)
      select clave, precio_usdt + recargo_usdt, recargo_usdt from sop_alquiler.herramienta where clave = $1`, [h]);
  }
}
const huella = async () => JSON.stringify({
  herramientas: (await db.query("select * from sop_alquiler.herramienta order by clave")).rows,
  alquileres: (await db.query("select herramienta, situacion, pago_situacion, cuenta_id, precio_final_usdt, recargo_usdt, externo, inicio from sop_alquiler.alquiler order by herramienta, id")).rows,
  cuentas: (await db.query("select herramienta, usuario, estado, externa from sop_alquiler.cuenta order by herramienta")).rows,
  eventos: (await uno("select count(*)::int n from sop_alquiler.evento")).n,
});
const antes = await huella();

const TABLA = new Set(["pedidos_a_seguir", "pedidos_por_enviar", "alertas_por_enviar"]);
const rpc = async (fn, args = {}) => {
  const ks = Object.keys(args);
  const vals = ks.map((k) => { const v = args[k]; if (fn === "alertas_enviadas") return `{${v.join(",")}}`; return v !== null && typeof v === "object" ? JSON.stringify(v) : v; });
  const lista = ks.map((k, i) => `${k} => $${i + 1}`).join(", ");
  try {
    if (TABLA.has(fn)) return { data: (await db.query(`select * from sop_proveedor.${fn}(${lista})`, vals)).rows, error: null };
    return { data: (await db.query(`select sop_proveedor.${fn}(${lista}) as r`, vals)).rows[0].r, error: null };
  } catch (e) { return { data: null, error: { message: e.message } }; }
};
const saldoFresco = () => db.query("select sop_proveedor.saldo_registrar('pkgsmhub', 100, 'usd', true, null)");
const api = apiGsm(`http://127.0.0.1:${PUERTO}/public/api/index.php`, "u@x.com", "llave-de-prueba", 1500);
const avisados = [];
const avisos = { enviar: async (t) => { avisados.push(t); return true; } };

// 1) Interruptor APAGADO (como hoy en prod): varias vueltas.
for (let i = 0; i < 3; i++) await vuelta(rpc, api, avisos, "pkgsmhub");
ok((await huella()) === antes, "interruptor apagado: las 6 propias quedan EXACTAMENTE igual (herramienta, alquileres, cuentas, eventos)");
// 2) Interruptor ENCENDIDO y con máximo: siguen sin config (modo «propio») → tampoco compra solo.
await db.exec("update sop_proveedor.proveedor set respaldo_encendido = true, gasto_maximo_dia = 100");
for (let i = 0; i < 3; i++) await vuelta(rpc, api, avisos, "pkgsmhub");
ok((await huella()) === antes, "interruptor encendido: las 6 propias siguen EXACTAMENTE igual (sin modo respaldo no se compra solo)");
ok((await uno("select count(*)::int n from sop_proveedor.pedido")).n === 0, "ningún pedido automático para las propias");
ok(((await estadoMock()).llamadas?.placeimeiorder ?? 0) === 0, "ninguna orden salió al proveedor");
ok((await uno(`select count(*)::int n from sop_proveedor.alerta where causa in (select id::text from sop_alquiler.alquiler)`)).n === 0,
   "ningún aviso nuevo por estos alquileres (el flujo de Soporte de siempre no cambia)");
ok((await uno("select count(*)::int n from sop_alquiler.herramienta where clave in ('tfm_tool_pro','tr_tools_pro') and visible = false")).n === 2
   && (await uno("select count(*)::int n from sop_alquiler.herramienta where visible")).n === 4, "la visibilidad de cada una no cambió");
// 3) Lo nuevo es solo aditivo: si Soporte toca «Pedir al proveedor», sale (con el interruptor apagado también).
await db.exec("update sop_proveedor.proveedor set respaldo_encendido = false");
const aU = (await uno("select id from sop_alquiler.alquiler where herramienta = 'unlock_tool' order by id limit 1")).id;
await db.exec(`select set_config('request.jwt.claims', '{"role":"authenticated"}', false); select set_config('prueba.capacidad', 'sop_alquiler.operar', false)`);
const s2 = (await uno("select sop_proveedor.pedido_soporte_pedir($1, '556') r", [aU])).r;
await servicio();
ok(s2.ok === true, "aditivo: el botón «Pedir al proveedor» de Soporte funciona en una propia", s2);
ok((await uno("select count(*)::int n from sop_proveedor.pedido")).n === 1 && (await huella()) === antes,
   "y solo crea ESE pedido: herramientas, los 12 alquileres, cuentas y eventos siguen idénticos");
// 4) Aunque Admin las ponga en «respaldo» y se encienda el interruptor (lo que sí compra solo), precio, recargo,
//    visibilidad y lo cobrado al taller no cambian: la compra solo trae la cuenta.
const precios = async () => JSON.stringify({
  herramientas: (await db.query("select * from sop_alquiler.herramienta order by clave")).rows,
  cobrado: (await db.query("select id, precio_final_usdt, recargo_usdt, pago_situacion from sop_alquiler.alquiler order by id")).rows,
});
const preciosAntes = await precios();
await db.exec(`insert into sop_proveedor.producto_config (herramienta, modo) select clave, 'respaldo' from sop_alquiler.herramienta;
  update sop_proveedor.proveedor set respaldo_encendido = true, gasto_maximo_dia = 100`);
await saldoFresco();
for (let i = 0; i < 3; i++) await vuelta(rpc, api, avisos, "pkgsmhub");
const comprados = (await uno("select count(*)::int n from sop_proveedor.pedido where origen = 'auto'")).n;
ok(comprados > 0 && (await precios()) === preciosAntes,
   "modo respaldo + interruptor: compra solo (" + comprados + " pedidos) y precio, recargo, visibilidad y lo cobrado NO cambian");

await mock.cerrar?.();
console.log(fallas === 0 ? "\nTODO OK" : `\n${fallas} FALLAS`);
process.exit(fallas ? 1 : 0);
