// Copiada al repositorio el 18-nov-2026 (antes vivía en el scratchpad de Ari-Web). Correr desde miweb/test/proveedor:
//   npm install  (una vez; solo instala PGlite)  ·  ver LEEME.md
// Prueba de punta a punta del conector de compra, SIN red real ni prod:
//   ciclo.ts + api_gsm.ts (el mismo código que corre la edge) → proveedor SIMULADO (mock.mjs, imita el código del proveedor)
//   base: PGlite con la base de Ari-Master + su M1 real + 20261118-proveedor-compra.sql.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { iniciarMock } from "./mock/mock.mjs";
import { vuelta, enviarUno } from "../../supabase/functions/proveedor_pedidos/_shared/ciclo.ts";
import { apiGsm } from "../../supabase/functions/proveedor_pedidos/_shared/api_gsm.ts";

const D = (process.env.PROPUESTAS_DIR ?? "C:/private/AriTool_Recursos/db-diagramas/propuestas").replace(/\/?$/, "/");
const vivo = JSON.parse(readFileSync(new URL("./datos/vivo-ultima.json", import.meta.url), "utf8"));
const PUERTO = 18099;
const mock = await iniciarMock({ puerto: PUERTO });
const URL_API = `http://127.0.0.1:${PUERTO}/public/api/index.php`;
const control = (c) => fetch(`http://127.0.0.1:${PUERTO}/__control`, { method: "POST", body: JSON.stringify(c) }).then(async (r) => { if (!r.ok) throw new Error(await r.text()); });
const estadoMock = () => fetch(`http://127.0.0.1:${PUERTO}/__estado`).then((r) => r.json());

const db = new PGlite();
let fallas = 0;
const ok = (c, m, x = "") => { console.log((c ? "OK   " : "FALLA") + " " + m + (x ? "  " + (typeof x === "string" ? x : JSON.stringify(x)) : "")); if (!c) fallas++; };
const uno = async (q, p = []) => (await db.query(q, p)).rows[0];

await db.exec(`create role anon; create role authenticated; create role service_role;
  create schema sop_acceso; create schema auth; create schema sop_comun;
  create function sop_acceso.tiene_capacidad(p text) returns boolean language sql stable as $$ select false $$;
  create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
  create schema sop_alquiler;
  create table sop_alquiler.herramienta (clave text primary key, nombre text, horas int, visible boolean default true);
  create table sop_alquiler.alquiler (id uuid primary key default gen_random_uuid(), herramienta text, situacion text default 'en_espera',
    pago_situacion text default 'confirmado', cuenta_id uuid, devolucion_solicitada_en timestamptz, precio_final_usdt numeric,
    pagado_en timestamptz default now(), estado_registro text default 'activo', devuelto_en timestamptz, externo boolean,
    inicio timestamptz, fin_previsto timestamptz);
  create table sop_alquiler.cuenta (id uuid primary key default gen_random_uuid(), herramienta text, usuario text, clave_cif bytea,
    estado text, externa boolean, alquilada_hasta timestamptz, notas text, estado_registro text default 'activo');
  create table sop_alquiler.evento (id bigserial, cuenta_id uuid, alquiler_id uuid, tipo text, grupo text, detalle jsonb, quien uuid);
  create function sop_alquiler.cifrar(t text) returns bytea language sql as $$ select convert_to('cif:' || t, 'UTF8') $$;
  create function sop_alquiler.descifrar(b bytea) returns text language sql as $$ select substr(convert_from(b, 'UTF8'), 5) $$;`);
await db.exec(readFileSync(D + "20261118-proveedor-alquiler-base.sql", "utf8"));
await db.exec(readFileSync(D + "20261118-proveedor-m1-core.sql", "utf8"));
await db.exec(readFileSync(D + "20261118-proveedor-compra.sql", "utf8"));
await db.exec(readFileSync(D + "20261118-proveedor-alertas-extra.sql", "utf8"));
await db.exec(readFileSync(D + "20261118-proveedor-oculta-motivo.sql", "utf8"));
await db.exec(readFileSync(D + "20261118-proveedor-saldo-v5.sql", "utf8"));
await db.exec(`select set_config('request.jwt.claims', '{"role":"service_role"}', false)`);
await db.query("select sop_proveedor.catalogo_sincronizar('pkgsmhub', $1::jsonb, true, null)", [JSON.stringify(vivo.opciones)]);
await db.exec(`insert into sop_alquiler.herramienta (clave, nombre, horas) values ('unlocktool', 'Unlock Tool', 6);
  insert into sop_proveedor.enlace (herramienta, proveedor_clave, numero_servicio, horas) values
    ('unlocktool','pkgsmhub','556',6), ('unlocktool','pkgsmhub','648',6), ('unlocktool','pkgsmhub','649',6);
  insert into sop_proveedor.producto_config (herramienta, modo) values ('unlocktool', 'respaldo');
  update sop_proveedor.proveedor set respaldo_encendido = true, gasto_maximo_dia = 1000;`);

// rpc como supabase-js: {data, error}; las que devuelven tabla, como filas.
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
const api = apiGsm(URL_API, "u@x.com", "llave-de-prueba", 1500);
const avisados = [];
const avisos = { enviar: async (t) => { avisados.push(t); return true; } };
const ciclo = () => vuelta(rpc, api, avisos, "pkgsmhub");
const alquilar = async (precio = 1.39) => (await uno("insert into sop_alquiler.alquiler (herramienta, precio_final_usdt) values ('unlocktool', $1) returning id", [precio])).id;
const pedidos = (a) => db.query("select numero_servicio, estado, referencia, motivo, intento from sop_proveedor.pedido where alquiler_id = $1 order by intento", [a]).then((r) => r.rows);
const colocadas = async () => (await estadoMock()).llamadas?.placeimeiorder ?? 0;
// El simulador vuelve a numerar sus órdenes desde 104001 al reiniciarse (el real no): se renombran las viejas.
const limpiar = async () => { await db.exec("update sop_proveedor.pedido set referencia = referencia || '-' || left(id::text, 8) where referencia not like '%-%'; update sop_proveedor.pedido set estado = 'anulado' where estado in ('por_enviar','enviando','en_proceso','listo','en_duda','cuenta_ilegible'); update sop_alquiler.alquiler set situacion = 'cancelado' where situacion = 'en_espera'; update sop_proveedor.conector set pausa_motivo = null, fallos_seguidos = 0, fallos_pedir = 0; update sop_proveedor.proveedor set respaldo_encendido = true"); await rpc("saldo_registrar", { p_proveedor: "pkgsmhub", p_saldo: 10, p_moneda: "usd", p_ok: true, p_cruda: null }); };

// 1) Camino feliz: pedir → número → esperando → listo → entregado, una sola orden y un solo cobro.
await control({ reset: true, saldo: 10, guion_por_defecto: ["espera", "exito"] });
let a = await alquilar();
let o = await ciclo();
let p = await pedidos(a);
ok(p.length === 1 && p[0].estado === "en_proceso" && p[0].referencia, "feliz: se pidió UNA vez y quedó en proceso con número", { p, enviados: o.enviados });
await ciclo();                                                              // el seguimiento ve «espera»
await ciclo();                                                              // ve «exito» → entrega
p = await pedidos(a);
const al = await uno("select situacion, cuenta_id, fin_previsto from sop_alquiler.alquiler where id = $1", [a]);
const cu = al.cuenta_id ? await uno("select usuario, externa from sop_alquiler.cuenta where id = $1", [al.cuenta_id]) : null;
let m = await estadoMock();
ok(p[0].estado === "entregado" && al.situacion === "en_curso" && cu?.externa === true && al.fin_previsto, "feliz: entregado, reloj arrancado, cuenta externa", { al, cu });
ok((m.llamadas?.placeimeiorder ?? 0) === 1 && Math.abs(m.saldo - 9.61) < 0.001, "feliz: una sola orden en el proveedor y un solo cobro (10 → 9.61)", { ordenes: m.llamadas?.placeimeiorder, saldo: m.saldo });

// 2) El proveedor no contesta (cobra igual): en duda y NUNCA otro pedido.
await limpiar(); await control({ reset: true, saldo: 10, siguiente: "cuelga" });
a = await alquilar();
await ciclo(); await ciclo(); await ciclo();
p = await pedidos(a); m = await estadoMock();
ok(p.length === 1 && p[0].estado === "en_duda" && (m.llamadas?.placeimeiorder ?? 0) === 1, "no contesta: un solo pedido, en duda, sin reintento (3 vueltas)", { p, ordenes: m.llamadas?.placeimeiorder });

// 3) Corta la conexión a mitad (cobró): en duda.
await limpiar(); await control({ reset: true, saldo: 10, siguiente: "corta" });
a = await alquilar(); await ciclo(); await ciclo();
p = await pedidos(a); m = await estadoMock();
ok(p.length === 1 && p[0].estado === "en_duda" && m.llamadas?.placeimeiorder === 1, "corta la conexión: en duda, sin reintento", p);

// 4) Rechazo limpio (servicio apagado, sin cobro): prueba la siguiente más barata.
await limpiar(); await control({ reset: true, saldo: 10, siguiente: { resultado: "rechazo", mensaje: "Service not found or inactive." } });
a = await alquilar(); await ciclo(); await ciclo(); await ciclo(); await ciclo();
p = await pedidos(a); m = await estadoMock();
ok(p.length === 2 && p[0].estado === "rechazado" && p[1].numero_servicio === "648" && p[1].estado === "entregado", "rechazo limpio → la siguiente (648) y se entrega", p);
ok(Math.abs(m.saldo - 9.41) < 0.001, "rechazo limpio: solo se cobró la 648", { saldo: m.saldo });

// 5) ERROR pero COBRÓ (lo que vio el código del proveedor): no es rechazo, queda en duda y NO se pide la siguiente.
await limpiar(); await control({ reset: true, saldo: 10, siguiente: { resultado: "rechazo", mensaje: "SQLSTATE[HY000]: General error", cobra: true } });
a = await alquilar(); await ciclo(); await ciclo();
p = await pedidos(a); m = await estadoMock();
ok(p.length === 1 && p[0].estado === "en_duda" && m.llamadas?.placeimeiorder === 1, "error raro con cobro: en duda, no se compra otra (no paga doble)", p);
// Mensaje «limpio» pero el saldo igual bajó: también en duda.
await limpiar(); await control({ reset: true, saldo: 10, siguiente: { resultado: "rechazo", mensaje: "Service not found or inactive.", cobra: true } });
a = await alquilar(); await ciclo(); await ciclo();
p = await pedidos(a);
ok(p.length === 1 && p[0].estado === "en_duda", "mensaje limpio pero el saldo bajó: en duda (doble control)", p);

// 6) Respuesta que no es JSON: en duda.
await limpiar(); await control({ reset: true, saldo: 10, siguiente: { resultado: "no_json", cobra: true } });
a = await alquilar(); await ciclo(); await ciclo();
p = await pedidos(a);
ok(p.length === 1 && p[0].estado === "en_duda", "HTML en vez de JSON: en duda", p);

// 7) Sin saldo: no se llama a comprar.
await limpiar(); await control({ reset: true, saldo: 0.2 });
const antes7 = await colocadas();
a = await alquilar(); await ciclo();
p = await pedidos(a);
ok(p.length === 1 && p[0].estado === "por_enviar" && (await colocadas()) === antes7
   && (await uno("select count(*)::int n from sop_proveedor.alerta where tipo = 'saldo_agotado' and resuelta_en is null")).n === 1,
   "sin saldo: no se pide nada, queda esperando la recarga (no se omite) y salta la alerta de saldo", p);
// Admin recarga: el mismo pedido sale solo en la vuelta siguiente (antes quedaba omitido para siempre, auditoría #3).
await control({ saldo: 10 }); await rpc("saldo_registrar", { p_proveedor: "pkgsmhub", p_saldo: 10, p_moneda: "usd", p_ok: true, p_cruda: null });
await ciclo();
p = await pedidos(a);
ok(p.length === 1 && p[0].estado === "en_proceso" && (await colocadas()) === antes7 + 1, "recargado: el pedido que esperaba sale una sola vez", p);

// 8) Llave rechazada al pedir: apagado duro.
await limpiar(); await control({ reset: true, saldo: 10, siguiente: "llave_mala" });
a = await alquilar(); await ciclo();
const pr = await uno("select respaldo_encendido, apagado_motivo from sop_proveedor.proveedor");
ok(pr.respaldo_encendido === false && pr.apagado_motivo === "llave_rechazada", "llave rechazada → respaldo apagado (lo enciende Admin)", pr);

// 9) El proveedor rechaza en el seguimiento (STATUS 3, devuelve el saldo): la siguiente.
await limpiar(); await control({ reset: true, saldo: 10, guion_siguiente: ["espera", "rechazo"], guion_por_defecto: ["exito"] });
a = await alquilar();
for (let i = 0; i < 5; i++) await ciclo();
p = await pedidos(a); m = await estadoMock();
ok(p.length === 2 && p[0].estado === "rechazado" && p[1].estado === "entregado", "rechazo en el seguimiento → la siguiente y se entrega", p);
ok(Math.abs(m.saldo - (10 - 0.59)) < 0.001, "el rechazado devolvió su saldo; quedó cobrada solo la segunda", { saldo: m.saldo });

// 10) Llega «listo» pero la cuenta no se entiende: no se entrega nada.
await limpiar(); await control({ reset: true, saldo: 10, guion_siguiente: [{ estado: "exito", codigo: "Tu cuenta te llega por correo" }] });
a = await alquilar(); await ciclo(); await ciclo();
p = await pedidos(a);
const al10 = await uno("select situacion, cuenta_id from sop_alquiler.alquiler where id = $1", [a]);
ok(p[0].estado === "cuenta_ilegible" && al10.cuenta_id === null && al10.situacion === "en_espera", "cuenta que no se entiende: no se entrega, el reloj no arranca", { p, al10 });

// 11) Dos vueltas al mismo tiempo (cron + botón de Soporte): una sola orden.
await limpiar(); await control({ reset: true, saldo: 10, siguiente: { resultado: "lento", ms: 300 } });
a = await alquilar();
await Promise.all([ciclo(), ciclo(), ciclo()]);
m = await estadoMock();
p = await pedidos(a);
ok(m.llamadas?.placeimeiorder === 1 && p.length === 1, "tres vueltas a la vez: una sola orden", { ordenes: m.llamadas?.placeimeiorder, p });

// 12) W5: el servidor se cayó después de marcar «enviando» y antes de saber la respuesta.
await limpiar(); await control({ reset: true, saldo: 10 });
a = await alquilar();
await rpc("pedidos_auto_crear", { p_proveedor: "pkgsmhub" });
const p12 = (await uno("select id from sop_proveedor.pedido where alquiler_id = $1 and estado = 'por_enviar'", [a])).id;
await rpc("saldo_registrar", { p_proveedor: "pkgsmhub", p_saldo: 10, p_moneda: "usd", p_ok: true, p_cruda: null });
await rpc("pedido_preparar", { p_pedido: p12 });                       // quedó «enviando» y el proceso «murió»
await db.query("update sop_proveedor.pedido set enviado_en = now() - interval '3 minutes' where id = $1", [p12]);
const antes12 = await colocadas();
await ciclo(); await ciclo();
p = await pedidos(a);
ok(p.length === 1 && p[0].estado === "en_duda" && (await colocadas()) === antes12, "W5: tras la caída queda en duda y no se pide de nuevo", p);

// 13) 3 fallos seguidos del proveedor (no contesta el saldo): pausa, no se pide nada; al volver, sigue solo.
await limpiar(); await control({ reset: true, saldo: 10 });
const api13 = apiGsm(`http://127.0.0.1:1/public/api/index.php`, "u@x.com", "llave-de-prueba", 500);   // nadie escucha
a = await alquilar();
for (let i = 0; i < 3; i++) await vuelta(rpc, api13, avisos, "pkgsmhub");
const c13 = await uno("select pausa_motivo, fallos_seguidos from sop_proveedor.conector");
p = await pedidos(a);
ok(c13.pausa_motivo === "proveedor_caido" && p.every((x) => x.estado === "por_enviar"), "3 fallos: pausa y nada salió", { c13, p });
await ciclo();
ok((await pedidos(a)).every((x) => x.estado === "por_enviar"), "m13: recién caído no se manda nada (espera la sonda de 5 min)");
await db.exec("update sop_proveedor.conector set ultimo_fallo_en = now() - interval '6 minutes'");
await ciclo(); await ciclo(); await ciclo();
p = await pedidos(a);
ok((await uno("select pausa_motivo from sop_proveedor.conector")).pausa_motivo === null && p.some((x) => x.estado === "entregado"), "vuelve a responder: la pausa se levanta sola y se entrega", p);

// 13b) Pausa sin pedidos esperando: la sonda de saldo la levanta sola (caído y agotado).
await limpiar();
// Sin pedidos, los fallos los cuenta la consulta de cada hora (proveedor_consultar llama a conector_resultado).
for (let i = 0; i < 3; i++) await rpc("conector_resultado", { p_proveedor: "pkgsmhub", p_ok: false, p_tipo: "sin_respuesta" });
ok((await uno("select pausa_motivo from sop_proveedor.conector")).pausa_motivo === "proveedor_caido", "pausa por caído sin pedidos");
const sondas0 = (await estadoMock()).llamadas?.accountinfo ?? 0;
await ciclo();
ok(((await estadoMock()).llamadas?.accountinfo ?? 0) === sondas0 && (await uno("select pausa_motivo from sop_proveedor.conector")).pausa_motivo === "proveedor_caido",
   "recién caído: no se sondea antes de 5 minutos (p17 #6)");
await db.exec("update sop_proveedor.conector set ultimo_fallo_en = now() - interval '6 minutes'");
await ciclo();
ok((await uno("select pausa_motivo from sop_proveedor.conector")).pausa_motivo === null, "a los 5 minutos la sonda de saldo levanta la pausa por caído");
// El saldo de 0.10 llega por la consulta de cada hora (proveedor_consultar), no por el ciclo.
await control({ saldo: 0.1 });
await rpc("saldo_registrar", { p_proveedor: "pkgsmhub", p_saldo: 0.1, p_moneda: "usd", p_ok: true, p_cruda: null });
await ciclo();
ok((await uno("select pausa_motivo from sop_proveedor.conector")).pausa_motivo === "saldo_agotado", "saldo 0.10: pausa por agotado");
const sondas1 = (await estadoMock()).llamadas?.accountinfo ?? 0;
await control({ saldo: 25 }); await ciclo();
ok((await estadoMock()).llamadas?.accountinfo === sondas1 && (await uno("select pausa_motivo from sop_proveedor.conector")).pausa_motivo === "saldo_agotado",
   "en pausa por agotado no se le pregunta el saldo al proveedor cada 30 s");
// Admin recarga y toca «Ya recargué» (o llega la consulta de cada hora): ese saldo nuevo levanta la pausa en la vuelta siguiente.
await rpc("saldo_registrar", { p_proveedor: "pkgsmhub", p_saldo: 25, p_moneda: "usd", p_ok: true, p_cruda: null });
await ciclo();
ok((await uno("select pausa_motivo from sop_proveedor.conector")).pausa_motivo === null, "Admin recargó: la pausa por agotado se levanta sola");

// 17) Regla 8: un número que el proveedor no conoce (por ejemplo, mal puesto por Soporte en S3) aparece como «esperando»
// en la consulta por lote: no se entrega nada, sigue en proceso y a los 15 minutos salta «tardando».
await limpiar(); await control({ reset: true, saldo: 10, siguiente: "cuelga" });
const a17 = await alquilar(); await ciclo();
const p17 = (await uno("select id from sop_proveedor.pedido where alquiler_id = $1 and estado = 'en_duda'", [a17])).id;
await db.query("update sop_proveedor.pedido set estado = 'en_proceso', referencia = '999999' where id = $1", [p17]);   // como S3
await ciclo(); await ciclo();
const e17 = await uno("select estado, ultimo_status from sop_proveedor.pedido where id = $1", [p17]);
ok(e17.estado === "en_proceso" && e17.ultimo_status === 0, "regla 8: número que el proveedor no conoce → STATUS 0, sigue esperando", e17);
await db.query("update sop_alquiler.alquiler set pagado_en = now() - interval '16 minutes' where id = $1", [a17]);
await ciclo();
ok((await uno("select count(*)::int n from sop_proveedor.alerta where tipo = 'alquiler_tardando' and causa = $1 and resuelta_en is null", [a17])).n === 1
   && (await uno("select situacion from sop_alquiler.alquiler where id = $1", [a17])).situacion === "en_espera",
   "regla 8: a los 15 minutos salta «tardando» y no se entregó nada");

// 18) G3: un pedido que quedó «en duda» y Soporte le puso el número: cuando el proveedor dice «listo», NO se entrega solo.
await limpiar(); await control({ reset: true, saldo: 10, siguiente: "cuelga", guion_por_defecto: ["exito"] });
const a18 = await alquilar(); await ciclo();
const p18 = (await uno("select id from sop_proveedor.pedido where alquiler_id = $1 and estado = 'en_duda'", [a18])).id;
const ref18 = String((await estadoMock()).ordenes?.at?.(-1)?.referencia ?? (await estadoMock()).ordenes?.[0]?.id ?? "104001");
await db.query("update sop_proveedor.pedido set estado = 'en_proceso', referencia = $2 where id = $1", [p18, ref18]);   // como S3
await ciclo(); await ciclo();
const e18 = await uno("select estado, motivo from sop_proveedor.pedido where id = $1", [p18]);
ok(e18.estado === "cuenta_ilegible" && (await uno("select situacion from sop_alquiler.alquiler where id = $1", [a18])).situacion === "en_espera",
   "G3: llegó la cuenta de un pedido que estuvo en duda → Soporte la confirma, no se entrega sola", e18);

// 15) Revisión: un «Authentication failed» que NO es el texto entero (su correo, después de cobrar) no pasa por limpio.
await limpiar(); await control({ reset: true, saldo: 10, siguiente: { resultado: "rechazo", mensaje: "SMTP 535 Authentication failed", cobra: true } });
a = await alquilar(); await ciclo(); await ciclo();
p = await pedidos(a); m = await estadoMock();
ok(p.length === 1 && p[0].estado === "en_duda" && m.llamadas?.placeimeiorder === 1, "error de su correo con cobro: en duda, no compra otra", p);
ok((await uno("select respaldo_encendido from sop_proveedor.proveedor")).respaldo_encendido === true, "y no se toma como llave mala");

// 16) Revisión: 3 pedidos seguidos sin respuesta clara (el saldo sí responde): el respaldo se APAGA, no sigue pidiendo.
await limpiar(); await control({ reset: true, saldo: 10, siguientes: ["cuelga", "cuelga", "cuelga", "cuelga"] });
const a16 = [await alquilar(), await alquilar(), await alquilar(), await alquilar()];
for (let i = 0; i < 6; i++) await ciclo();
m = await estadoMock();
const pr16 = await uno("select respaldo_encendido, apagado_motivo from sop_proveedor.proveedor");
ok(pr16.respaldo_encendido === false && m.llamadas?.placeimeiorder === 3, "3 sin respuesta: se apaga y el cuarto NO sale", { pr16, ordenes: m.llamadas?.placeimeiorder });
await db.exec("update sop_proveedor.proveedor set respaldo_encendido = true; update sop_proveedor.conector set fallos_pedir = 0");

// 14) Telegram: solo Admin, sin repetir.
const textos = avisados.join("\n");
ok(avisados.length > 0 && /llave/i.test(textos) && !/no hubo respuesta/i.test(textos), "Telegram: llegaron las de Admin y no las de Soporte", avisados.length);
const n14 = avisados.length; await ciclo();
ok(avisados.length === n14, "Telegram: una vuelta más sin novedades no repite nada");

const ult = await ciclo();
ok(!ult.errores && ult.alertas_extra && ("herramienta_oculta" in ult.alertas_extra) && Object.values(ult.alertas_extra).every((v) => !(v && v.error)), "la vuelta corre las 4 alertas extra (con la #7) sin errores", ult.alertas_extra);
await mock.cerrar?.(); await mock.close?.();
console.log(fallas === 0 ? "\nTODO OK" : `\n${fallas} FALLAS`);
process.exit(fallas ? 1 : 0);
