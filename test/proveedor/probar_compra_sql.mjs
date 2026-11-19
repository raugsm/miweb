// Copiada al repositorio el 18-nov-2026 (antes vivía en el scratchpad de Ari-Web). Correr desde miweb/test/proveedor:
//   npm install  (una vez; solo instala PGlite)  ·  ver LEEME.md
// Prueba local (PGlite) del SQL de compra de Ari-Web (20261118-proveedor-compra.sql) encima de la base de Ari-Master,
// con lo de M1 simulado (opciones_para, proveedor_entregar, respaldo_apagar, columnas nuevas). Sin red ni prod.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
const D = (process.env.PROPUESTAS_DIR ?? "C:/private/AriTool_Recursos/db-diagramas/propuestas").replace(/\/?$/, "/");
const base = readFileSync(D + "20261118-proveedor-alquiler-base.sql", "utf8");
const compra = process.env.COMPRA_SQL ? readFileSync(process.env.COMPRA_SQL, "utf8")
  : ["20261118-proveedor-compra.sql", "20261118-proveedor-alertas-extra.sql", "20261118-proveedor-oculta-motivo.sql", "20261118-proveedor-saldo-v5.sql"].map((x) => readFileSync(D + x, "utf8")).join("\n");
const m1 = process.env.M1_SIMULADO ? null : readFileSync(process.env.M1_SQL ?? D + "20261118-proveedor-m1-core.sql", "utf8");
const vivo = JSON.parse(readFileSync(new URL("./datos/vivo-ultima.json", import.meta.url), "utf8"));
const db = new PGlite();
let fallas = 0;
const ok = (c, m, x = "") => { console.log((c ? "OK   " : "FALLA") + " " + m + (x ? "  " + (typeof x === "string" ? x : JSON.stringify(x)) : "")); if (!c) fallas++; };
const uno = async (q, p = []) => (await db.query(q, p)).rows[0];
const filas = async (q, p = []) => (await db.query(q, p)).rows;
const r1 = async (q, p = []) => (await uno(q, p)).r;
const tira = async (q, p, re) => { try { await db.query(q, p); return "no tiró"; } catch (e) { return re.test(e.message) || e.message; } };
const servicio = () => db.exec(`select set_config('request.jwt.claims', '{"role":"service_role"}', false); select set_config('prueba.capacidad', '', false)`);
const usuario = (cap) => db.exec(`select set_config('request.jwt.claims', '{"role":"authenticated"}', false); select set_config('prueba.capacidad', '${cap}', false)`);

await db.exec(`create role anon; create role authenticated; create role service_role;
  create schema sop_acceso; create schema auth;
  create function sop_acceso.tiene_capacidad(p text) returns boolean language sql stable as $$ select coalesce(current_setting('prueba.capacidad', true), '') = p $$;
  create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
  grant usage on schema sop_acceso, auth to authenticated, service_role;
  grant execute on function sop_acceso.tiene_capacidad(text), auth.uid() to authenticated, service_role;
  create schema sop_alquiler;
  create table sop_alquiler.herramienta (clave text primary key, horas int);
  create table sop_alquiler.alquiler (id uuid primary key default gen_random_uuid(), herramienta text, situacion text default 'en_espera',
    pago_situacion text default 'confirmado', cuenta_id uuid, devolucion_solicitada_en timestamptz, precio_final_usdt numeric,
    pagado_en timestamptz default now(), estado_registro text default 'activo', usuario text, clave text,
    devuelto_en timestamptz, externo boolean, inicio timestamptz, fin_previsto timestamptz);
  create table sop_alquiler.cuenta (id uuid primary key default gen_random_uuid(), herramienta text, usuario text, clave_cif bytea,
    estado text, externa boolean, alquilada_hasta timestamptz, notas text);
  create table sop_alquiler.evento (id bigserial, cuenta_id uuid, alquiler_id uuid, tipo text, grupo text, detalle jsonb, quien uuid);
  create function sop_alquiler.cifrar(t text) returns bytea language sql as $$ select convert_to('cif:' || t, 'UTF8') $$;
  create function sop_alquiler.descifrar(b bytea) returns text language sql as $$ select substr(convert_from(b, 'UTF8'), 5) $$;
  create schema sop_comun;
  grant usage on schema sop_alquiler to service_role, authenticated;`);
await db.exec(base);
if (m1) {
  await db.exec(m1);
} else {
  // ---- M1 simulado (lo que entrega Ari-Master)
  await db.exec(`
    alter table sop_proveedor.proveedor alter column respaldo_encendido set default false;
    update sop_proveedor.proveedor set respaldo_encendido = false;
    alter table sop_proveedor.proveedor add column gasto_maximo_dia numeric, add column nivel_amarillo_dias numeric, add column nivel_rojo_alquileres int, add column apagado_motivo text;
    create table sop_proveedor.producto_config (herramienta text primary key, modo text not null default 'propio', tiempo_max_espera_min int default 15);
    create table sop_proveedor.enlace (herramienta text, numero_servicio text);
    create function sop_proveedor.opciones_para(p_herramienta text) returns table(numero_servicio text, costo numeric, horas int, demora_anunciada text)
      language sql stable as $$ select o.numero_servicio, o.costo, 6, o.demora_anunciada from sop_proveedor.enlace e
        join sop_proveedor.opcion o on o.numero_servicio = e.numero_servicio and o.activa where e.herramienta = p_herramienta order by o.costo, o.numero_servicio $$;
    create function sop_proveedor.respaldo_apagar(p_proveedor text, p_motivo text) returns jsonb language sql as
      $$ update sop_proveedor.proveedor set respaldo_encendido = false where clave = p_proveedor returning jsonb_build_object('ok', true) $$;
    create function sop_alquiler.proveedor_entregar(p_alquiler_id uuid, p_usuario text, p_clave text, p_costo numeric, p_pedido uuid) returns jsonb
      language plpgsql as $$ begin
        update sop_alquiler.alquiler set cuenta_id = gen_random_uuid(), situacion = 'en_curso', usuario = p_usuario, clave = p_clave
         where id = p_alquiler_id and situacion = 'en_espera';
        if not found then return jsonb_build_object('ok', false, 'motivo', 'ya_devuelto'); end if;
        return jsonb_build_object('ok', true); end $$;`);
}
await db.exec(compra);
ok(true, "SQL de compra aplicado encima de la base de Ari-Master + M1 " + (m1 ? "REAL" : "simulado"));

await servicio();
await db.query("select sop_proveedor.catalogo_sincronizar('pkgsmhub', $1::jsonb, true, null)", [JSON.stringify(vivo.opciones)]);
const saldo = (m) => db.query("select sop_proveedor.saldo_registrar('pkgsmhub', $1, 'usd', true, null)", [m]);
await saldo(10);
await db.exec(`insert into sop_alquiler.herramienta values ('unlocktool', 6), ('dft', 48);`);
if (!m1) await db.exec(`insert into sop_proveedor.enlace values ('unlocktool','556'), ('unlocktool','648'), ('unlocktool','649'), ('dft','645');`);
else await db.exec(`insert into sop_proveedor.enlace (herramienta, proveedor_clave, numero_servicio, horas) values
  ('unlocktool','pkgsmhub','556',6), ('unlocktool','pkgsmhub','648',6), ('unlocktool','pkgsmhub','649',6), ('dft','pkgsmhub','645',48);`);
await db.exec(`insert into sop_proveedor.producto_config (herramienta, modo) values ('unlocktool','respaldo'), ('dft','respaldo'), ('sinmodo','propio');
  insert into sop_alquiler.herramienta values ('sinmodo', 6);`);
const alquilar = async (herr = "unlocktool", precio = 1.39) => (await uno("insert into sop_alquiler.alquiler (herramienta, precio_final_usdt) values ($1, $2) returning id", [herr, precio])).id;

// Regla 1: con el respaldo apagado no se crea nada.
ok((await uno("select respaldo_encendido from sop_proveedor.proveedor")).respaldo_encendido === false, "regla 1: el interruptor nace apagado");
const a1 = await alquilar();
let r = await r1("select sop_proveedor.pedidos_auto_crear('pkgsmhub') r");
ok(r.creados === 0 && r.motivo === "respaldo_apagado", "regla 1: respaldo apagado → no compra", r);

await db.exec("update sop_proveedor.proveedor set respaldo_encendido = true");
r = await r1("select sop_proveedor.pedidos_auto_crear('pkgsmhub') r");
ok(r.creados === 0 && r.motivo === "sin_gasto_maximo" && (await uno("select count(*)::int n from sop_proveedor.alerta where tipo='gasto_maximo' and causa='falta' and resuelta_en is null")).n === 1,
   "G1: encendido SIN máximo diario → no compra nada solo y avisa a Admin", r);
await db.exec("update sop_proveedor.proveedor set gasto_maximo_dia = 100");
r = await r1("select sop_proveedor.pedidos_auto_crear('pkgsmhub') r");
ok(r.creados === 1, "respaldo encendido y con máximo → crea el pedido", r);
r = await r1("select sop_proveedor.pedidos_auto_crear('pkgsmhub') r");
ok(r.creados === 0, "otra vuelta del cron: no crea otro (un pedido abierto por alquiler)", r);
let p1 = await uno("select * from sop_proveedor.pedido where alquiler_id = $1", [a1]);
ok(p1.numero_servicio === "556" && Number(p1.costo_esperado) === 0.39 && p1.estado === "por_enviar", "elige la más barata (556, 0.39)", { n: p1.numero_servicio, c: p1.costo_esperado });
ok((await tira("insert into sop_proveedor.pedido (proveedor, alquiler_id, intento, numero_servicio, costo_esperado, origen) values ('pkgsmhub', $1, 9, '648', 0.59, 'auto')", [a1], /duplicate|unique/)) === true,
  "la base no deja un segundo pedido abierto para el mismo alquiler");

// Reserva y saldo (reglas 2 y 3).
r = await r1("select sop_proveedor.pedido_preparar($1) r", [p1.id]);
ok(r.ok && r.numero_servicio === "556", "preparar: reserva y pasa a enviando", r);
r = await r1("select sop_proveedor.pedido_preparar($1) r", [p1.id]);
ok(!r.ok && r.motivo === "ya_no_esta_por_enviar", "dos preparar del mismo pedido: el segundo no sale", r);
r = await r1("select sop_proveedor.pedido_respuesta($1, 'aceptado', '9001', 'ok') r", [p1.id]);
ok(r.estado === "en_proceso", "aceptado con número → en_proceso", r);

// Dos pedidos y saldo para uno (fila 14, historia 060).
const a2 = await alquilar(), a3 = await alquilar();
await db.query("update sop_proveedor.pedido set enviado_en = now() - interval '5 minutes' where id = $1", [p1.id]);   // p1 ya descontado
await saldo(0.5);
await r1("select sop_proveedor.pedidos_auto_crear('pkgsmhub') r");
const p2 = await uno("select id from sop_proveedor.pedido where alquiler_id = $1", [a2]);
const p3 = await uno("select id from sop_proveedor.pedido where alquiler_id = $1", [a3]);
const rp2 = await r1("select sop_proveedor.pedido_preparar($1) r", [p2.id]);
let rp3 = await r1("select sop_proveedor.pedido_preparar($1) r", [p3.id]);
ok(rp2.ok && !rp3.ok && rp3.motivo === "ocupado", "uno en vuelo a la vez: el segundo espera (ocupado) y sigue por enviar", { rp2, rp3 });
ok((await uno("select estado from sop_proveedor.pedido where id = $1", [p3.id])).estado === "por_enviar", "ocupado no se omite");
await r1("select sop_proveedor.pedido_respuesta($1, 'aceptado', '9000', 'ok') r", [p2.id]);
rp3 = await r1("select sop_proveedor.pedido_preparar($1) r", [p3.id]);
ok(!rp3.ok && rp3.motivo === "sin_saldo" && rp3.espera === true, "saldo para uno: el segundo espera la recarga (sin_saldo, el primero quedó reservado)", rp3);
ok((await uno("select estado from sop_proveedor.pedido where id = $1", [p3.id])).estado === "por_enviar", "sin saldo no se omite: queda por enviar");
await db.query("update sop_proveedor.pedido set estado = 'omitido', motivo = 'sin_saldo' where id = $1", [p3.id]);   // Soporte lo toma a mano
ok((await uno("select count(*)::int n from sop_proveedor.alerta where tipo='saldo_agotado' and resuelta_en is null")).n === 1, "alerta de saldo");
r = await r1("select sop_proveedor.pedidos_auto_crear('pkgsmhub') r");
ok((await uno("select count(*)::int n from sop_proveedor.pedido where alquiler_id = $1", [a3])).n === 1, "el omitido no se vuelve a intentar solo (queda para Soporte)");

// Respuesta sin_respuesta → en duda, nunca se reintenta (regla 2, 059).
await db.query("update sop_proveedor.pedido set estado = 'anulado' where id = $1", [p2.id]);          // fuera del camino
const a2b = await alquilar();
await saldo(10);
await r1("select sop_proveedor.pedidos_auto_crear('pkgsmhub') r");
const p2b = await uno("select id from sop_proveedor.pedido where alquiler_id = $1", [a2b]);
await r1("select sop_proveedor.pedido_preparar($1) r", [p2b.id]);
r = await r1("select sop_proveedor.pedido_respuesta($1, 'sin_respuesta', null, 'timeout') r", [p2b.id]);
ok(r.estado === "en_duda", "sin respuesta → en_duda", r);
await r1("select sop_proveedor.pedidos_auto_crear('pkgsmhub') r");
ok((await uno("select count(*)::int n from sop_proveedor.pedido where alquiler_id = $1", [a2b])).n === 1, "en duda: no se crea otro pedido solo");
r = await r1("select sop_proveedor.pedido_respuesta($1, 'aceptado', '9555', 'llegó tarde') r", [p2b.id]);
ok(r.estado === "en_proceso", "el número que llega tarde (después de en_duda) no se pierde", r);
await db.query("update sop_proveedor.pedido set estado = 'en_duda', referencia = null where id = $1", [p2b.id]);
ok((await uno("select count(*)::int n from sop_proveedor.alerta where tipo='pedido_en_duda' and causa = $1", [a2b])).n === 1
   && (await uno("select resuelta_en from sop_proveedor.alerta where tipo='pedido_en_duda' and causa = $1", [a2b])).resuelta_en !== null,
   "alerta pedido en duda (Soporte), resuelta cuando llegó el número");

// Aceptado → seguir → listo → entregar (064).
await saldo(10);
let seg = await filas("select * from sop_proveedor.pedidos_a_seguir('pkgsmhub')");
ok(seg.some((x) => x.referencia === "9001"), "pedidos a seguir", seg);
r = await r1("select sop_proveedor.pedido_estado_proveedor($1, 0, null) r", [p1.id]);
ok(r.estado === "en_proceso", "STATUS 0: sigue esperando");
r = await r1("select sop_proveedor.pedido_estado_proveedor($1, 4, 'User: abc | Pass: x9') r", [p1.id]);
ok(r.estado === "listo", "STATUS 4 → listo");
r = await r1("select sop_proveedor.pedido_entregar($1, 'abc', 'x9') r", [p1.id]);
const al1 = await uno("select situacion, cuenta_id from sop_alquiler.alquiler where id = $1", [a1]);
ok(r.ok && al1.situacion === "en_curso" && al1.cuenta_id, "entrega: el alquiler pasa a en_curso con la cuenta", { r, al1 });
r = await r1("select sop_proveedor.pedido_entregar($1, 'abc', 'x9') r", [p1.id]);
ok(r.ok === false, "no se entrega dos veces");

// 068: cobro distinto del esperado.
// Sin otros pedidos en los mismos 5 minutos (si los hay, la comparación se saltea: no se puede saber cuál descontó).
await db.query("update sop_proveedor.pedido set enviado_en = now() - interval '1 hour' where id <> $1", [p1.id]);
r = await r1("select sop_proveedor.pedido_saldo_despues($1, 9.0) r", [p1.id]);
ok(r.cobro_distinto === true, "bajó 1.00 y se esperaba 0.39 → alerta y opción apagada", r);
ok((await uno("select activa from sop_proveedor.opcion where numero_servicio='556'")).activa === false, "la 556 quedó apagada hasta el próximo catálogo");
await db.query("select sop_proveedor.catalogo_sincronizar('pkgsmhub', $1::jsonb, true, null)", [JSON.stringify(vivo.opciones)]);
ok((await uno("select activa from sop_proveedor.opcion where numero_servicio='556'")).activa === true, "con el catálogo nuevo vuelve");

// Rechazo → siguiente más barata (061); todas rechazadas → Soporte.
const a4 = await alquilar();
await r1("select sop_proveedor.pedidos_auto_crear('pkgsmhub') r");
let p4 = await uno("select id, numero_servicio from sop_proveedor.pedido where alquiler_id = $1 and estado='por_enviar'", [a4]);
await saldo(10);
await r1("select sop_proveedor.pedido_preparar($1) r", [p4.id]);
await r1("select sop_proveedor.pedido_respuesta($1, 'rechazado', null, 'Service disabled') r", [p4.id]);
let p4b = await uno("select id, numero_servicio, intento from sop_proveedor.pedido where alquiler_id = $1 and estado='por_enviar'", [a4]);
ok(p4b && p4b.numero_servicio !== p4.numero_servicio && p4b.intento === 2, "rechazo → pedido nuevo con la siguiente", { antes: p4.numero_servicio, despues: p4b });
await saldo(10);
await r1("select sop_proveedor.pedido_preparar($1) r", [p4b.id]);
await r1("select sop_proveedor.pedido_respuesta($1, 'aceptado', '9002', 'ok') r", [p4b.id]);
r = await r1("select sop_proveedor.pedido_estado_proveedor($1, 3, 'Rejected: out of stock') r", [p4b.id]);
ok(r.verificar_saldo === true && (await uno("select count(*)::int n from sop_proveedor.pedido where alquiler_id = $1 and estado='por_enviar'", [a4])).n === 0,
   "M4: rechazo en el seguimiento → todavía no pide la siguiente (espera ver la devolución)", r);
r = await r1("select sop_proveedor.pedido_rechazo_verificado($1, 10) r", [p4b.id]);
ok(r.devolucion_vista === true, "M4: el saldo volvió → recién ahí pide la siguiente", r);
let p4c = await uno("select id, numero_servicio, intento from sop_proveedor.pedido where alquiler_id = $1 and estado='por_enviar'", [a4]);
ok(p4c && p4c.intento === 3, "rechazo en el seguimiento → la tercera opción", p4c);
await saldo(10);
await r1("select sop_proveedor.pedido_preparar($1) r", [p4c.id]);
await r1("select sop_proveedor.pedido_respuesta($1, 'rechazado', null, 'no') r", [p4c.id]);
ok((await uno("select count(*)::int n from sop_proveedor.pedido where alquiler_id = $1 and estado='por_enviar'", [a4])).n === 0
   && (await uno("select count(*)::int n from sop_proveedor.alerta where tipo='sin_opcion' and causa=$1", [a4])).n === 1, "sin más opciones → Soporte con alerta");
await r1("select sop_proveedor.pedidos_auto_crear('pkgsmhub') r");
ok((await uno("select count(*)::int n from sop_proveedor.pedido where alquiler_id = $1", [a4])).n === 3, "y el automático no lo vuelve a intentar");

// Regla 4: daría pérdida.
const a5 = await alquilar("dft", 1.0);
await saldo(10);
await r1("select sop_proveedor.pedidos_auto_crear('pkgsmhub') r");
const p5 = await uno("select id from sop_proveedor.pedido where alquiler_id = $1", [a5]);
r = await r1("select sop_proveedor.pedido_preparar($1) r", [p5.id]);
ok(!r.ok && r.motivo === "daria_perdida", "regla 4: costo 1.69 > pagado 1.00 → no compra", r);

// Regla 5: máximo del día → apaga el interruptor (duro).
await db.exec("update sop_proveedor.proveedor set gasto_maximo_dia = 0.5");
const a6 = await alquilar();
await saldo(10);
await r1("select sop_proveedor.pedidos_auto_crear('pkgsmhub') r");
const p6 = await uno("select id from sop_proveedor.pedido where alquiler_id = $1", [a6]);
r = await r1("select sop_proveedor.pedido_preparar($1) r", [p6.id]);
ok(!r.ok && r.motivo === "gasto_maximo", "regla 5: pasa el máximo del día → no compra", r);
ok((await uno("select respaldo_encendido from sop_proveedor.proveedor")).respaldo_encendido === false, "y el respaldo quedó apagado (lo enciende Admin)");
await db.exec("update sop_proveedor.proveedor set gasto_maximo_dia = 100, respaldo_encendido = true");

// Regla 5: corte tras 3 fallos seguidos, y vuelve solo.
for (let i = 0; i < 3; i++) await r1("select sop_proveedor.conector_resultado('pkgsmhub', false, 'sin_respuesta') r");
let c = await uno("select pausa_motivo, fallos_seguidos from sop_proveedor.conector");
ok(c.pausa_motivo === "proveedor_caido" && c.fallos_seguidos === 3, "3 fallos seguidos → pausa", c);
const a7 = await alquilar();
r = await r1("select sop_proveedor.pedidos_auto_crear('pkgsmhub') r");
ok(r.creados === 0 && r.motivo === "proveedor_caido", "en pausa no se compra", r);
await r1("select sop_proveedor.conector_resultado('pkgsmhub', true, null) r");
c = await uno("select pausa_motivo, fallos_seguidos from sop_proveedor.conector");
ok(c.pausa_motivo === null && (await uno("select count(*)::int n from sop_proveedor.alerta where tipo='proveedor_no_responde' and resuelta_en is null")).n === 0, "responde bien → vuelve solo y se resuelve la alerta", c);

// Llave rechazada → apagado duro.
await r1("select sop_proveedor.conector_resultado('pkgsmhub', false, 'llave') r");
ok((await uno("select respaldo_encendido from sop_proveedor.proveedor")).respaldo_encendido === false, "llave rechazada → respaldo apagado");
await r1("select sop_proveedor.conector_resultado('pkgsmhub', true, null) r");
ok((await uno("select respaldo_encendido from sop_proveedor.proveedor")).respaldo_encendido === false, "ni siquiera cuando la llave vuelve a andar (lo enciende Admin)");
await db.exec("update sop_proveedor.proveedor set respaldo_encendido = true");

// W1: copia vieja de más de 6 h.
await db.exec("update sop_proveedor.proveedor set catalogo_sincronizado_en = now() - interval '7 hours'");
r = await r1("select sop_proveedor.vigilar_copia('pkgsmhub') r");
ok(r.copia_vieja && (await uno("select pausa_motivo from sop_proveedor.conector")).pausa_motivo === "copia_vieja", "6 h sin catálogo → pausa", r);
await db.exec("update sop_proveedor.proveedor set catalogo_sincronizado_en = now()");
await r1("select sop_proveedor.vigilar_copia('pkgsmhub') r");
ok((await uno("select pausa_motivo from sop_proveedor.conector")).pausa_motivo === null, "catálogo al día → vuelve sola");

// W5: caída a mitad del envío.
await r1("select sop_proveedor.pedidos_auto_crear('pkgsmhub') r");
const p7b = await uno("select id from sop_proveedor.pedido where alquiler_id = $1 and estado = 'por_enviar'", [a7]);
await saldo(10);
await r1("select sop_proveedor.pedido_preparar($1) r", [p7b.id]);
await db.query("update sop_proveedor.pedido set enviado_en = now() - interval '3 minutes' where id = $1", [p7b.id]);
r = await r1("select sop_proveedor.pedidos_recuperar('pkgsmhub') r");
ok(r.en_duda === 1 && (await uno("select estado from sop_proveedor.pedido where id = $1", [p7b.id])).estado === "en_duda", "W5: enviando sin respuesta tras la caída → en_duda", r);
await r1("select sop_proveedor.pedidos_auto_crear('pkgsmhub') r");
ok((await uno("select count(*)::int n from sop_proveedor.pedido where alquiler_id = $1", [a7])).n === 1, "W5: ninguno se pide de nuevo solo");

// 065: cuenta ilegible.
const a8 = await alquilar();
await r1("select sop_proveedor.pedidos_auto_crear('pkgsmhub') r");
const p8 = await uno("select id from sop_proveedor.pedido where alquiler_id = $1", [a8]);
await saldo(10);
await r1("select sop_proveedor.pedido_preparar($1) r", [p8.id]);
await r1("select sop_proveedor.pedido_respuesta($1, 'aceptado', '9003', 'ok') r", [p8.id]);
await r1("select sop_proveedor.pedido_estado_proveedor($1, 4, 'tu cuenta: ver correo') r", [p8.id]);
await r1("select sop_proveedor.pedido_ilegible($1, 'tu cuenta: ver correo') r", [p8.id]);
const al8 = await uno("select situacion, cuenta_id from sop_alquiler.alquiler where id = $1", [a8]);
ok(al8.situacion === "en_espera" && al8.cuenta_id === null, "065: no se entiende → no se entrega, el reloj no arranca");

// Fila 8: la cuenta llega y el alquiler ya se devolvió.
const a9 = await alquilar();
await r1("select sop_proveedor.pedidos_auto_crear('pkgsmhub') r");
const p9 = await uno("select id from sop_proveedor.pedido where alquiler_id = $1", [a9]);
await saldo(10);
await r1("select sop_proveedor.pedido_preparar($1) r", [p9.id]);
await r1("select sop_proveedor.pedido_respuesta($1, 'aceptado', '9004', 'ok') r", [p9.id]);
await r1("select sop_proveedor.pedido_estado_proveedor($1, 4, 'User: q | Pass: w') r", [p9.id]);
await db.query("update sop_alquiler.alquiler set situacion = 'devuelto' where id = $1", [a9]);
r = await r1("select sop_proveedor.pedido_entregar($1, 'q', 'w') r", [p9.id]);
ok(r.ok === false && !!r.motivo, "fila 8: ya devuelto → no entrega, queda para Soporte como pérdida", r);

// Soporte: en duda → poner número / anular.
await usuario("sop_alquiler.operar");
r = await r1("select sop_proveedor.pedido_seguir_numero($1, '9001') r", [p2b.id]);
ok(r.ok === false && r.motivo === "numero_de_otro_pedido", "S3.3: número de otro pedido no se acepta", r);
r = await r1("select sop_proveedor.pedido_seguir_numero($1, '7777') r", [p2b.id]);
ok(r.ok === true, "S3: Soporte pone el número → se sigue", r);
r = await r1("select sop_proveedor.pedido_anular($1, 'corto') r", [p7b.id]);
ok(r.ok === false && r.motivo === "motivo_corto", "anular pide 10 letras de motivo");
r = await r1("select sop_proveedor.pedido_anular($1, 'no entró en la web del proveedor') r", [p7b.id]);
ok(r.ok === true, "S3: anular un en_duda");
// S2: Soporte pide una opción por toque.
r = await r1("select sop_proveedor.pedido_soporte_pedir($1, '648') r", [a3]);
ok(r.ok === true, "S2: Soporte pide al proveedor (alquiler que había quedado sin saldo)", r);
r = await r1("select sop_proveedor.pedido_soporte_pedir($1, '649') r", [a3]);
ok(r.ok === false && r.motivo === "ya_hay_un_pedido", "S2: no deja dos pedidos abiertos", r);
const ver = await r1("select sop_proveedor.pedido_ver($1) r", [a4]);
ok(ver.length === 3 && ver[0].pasos.length >= 3, "S6: pedido_ver con los 3 intentos y sus pasos", { intentos: ver.length });
await usuario("");
ok((await tira("select sop_proveedor.pedido_soporte_pedir($1, '648')", [a5], /sin_capacidad/)) === true, "sin capacidad no puede pedir");
await usuario("config.gestion");
const vivas = await r1("select sop_proveedor.alertas_vivas('pkgsmhub') r");
ok(vivas.length > 0 && vivas[0].urgencia <= vivas[vivas.length - 1].urgencia, "V6: alertas vivas ordenadas por urgencia", vivas.map((x) => x.tipo));
const cod = await r1("select sop_proveedor.telegram_conectar() r");
ok(/^\d{6}$/.test(cod.codigo), "V7.1: código de Telegram de 6 cifras");
ok((await tira("select sop_proveedor.pedido_preparar($1)", [p5.id], /solo_service_role|permission denied/)) === true, "un admin del panel no puede llamar a lo de la edge");
const cv = await r1("select sop_proveedor.conector_ver('pkgsmhub') r");
ok(cv && "pausa_motivo" in cv, "V7.2: conector_ver", cv);
if (!process.env.COMPRA_SQL) ok(cv && "alcanza" in cv && "ocultas" in cv && "ritmo_dia" in cv, "V5: conector_ver trae alcanza, ritmo_dia y ocultas", cv);

// Telegram: solo Admin, una vez (y lo que se repite, cuando toca).
await servicio();
const env = await filas("select * from sop_proveedor.alertas_por_enviar('pkgsmhub')");
const tiposEnv = (await filas("select tipo, para from sop_proveedor.alerta where id = any($1)", [env.map((x) => x.id)]));
ok(env.length > 0 && tiposEnv.every((x) => x.para !== "soporte"), "Telegram: solo lo de Admin", tiposEnv.map((x) => x.tipo));
await db.query("select sop_proveedor.alertas_enviadas($1)", [env.map((x) => x.id)]);
ok((await filas("select * from sop_proveedor.alertas_por_enviar('pkgsmhub')")).length === 0, "Telegram: no se repite si nada cambió");
await db.exec("update sop_proveedor.alerta set enviada_en = now() - interval '31 minutes' where tipo = 'saldo_agotado'");
ok((await filas("select * from sop_proveedor.alertas_por_enviar('pkgsmhub')")).length === (await uno("select count(*)::int n from sop_proveedor.alerta where tipo='saldo_agotado' and resuelta_en is null")).n,
  "AGOTADO se repite cada 30 min");
await db.query("select sop_proveedor.telegram_guardar(55, '123456789')");
ok((await uno("select chat_id from sop_proveedor.telegram")).chat_id === "123456789", "Telegram: código vigente → guarda el chat");

// Niveles de saldo: un aviso por cambio.
await saldo(0.2);
r = await r1("select sop_proveedor.saldo_nivel('pkgsmhub') r");
ok(r.nivel === "agotado", "saldo 0.2 → agotado", r);
await saldo(1.5);
r = await r1("select sop_proveedor.saldo_nivel('pkgsmhub') r");
const vivasSaldo = (await filas("select tipo from sop_proveedor.alerta where tipo like 'saldo_%' and resuelta_en is null")).map((x) => x.tipo);
ok(r.nivel === "rojo" && vivasSaldo.length === 1 && vivasSaldo[0] === "saldo_rojo", "saldo 1.5 → rojo (menos de 5 alquileres), y el agotado se resuelve", { r, vivasSaldo });
ok((await uno("select pausa_motivo from sop_proveedor.conector")).pausa_motivo === null, "al recargar, la pausa por saldo vuelve sola");
await saldo(100);
r = await r1("select sop_proveedor.saldo_nivel('pkgsmhub') r");
ok(r.nivel === "verde" && (await uno("select count(*)::int n from sop_proveedor.alerta where tipo like 'saldo_%' and resuelta_en is null")).n === 0, "saldo 100 → verde, sin alertas de saldo", r);

// Tardando (15 min desde el pago).
await db.query("update sop_alquiler.alquiler set pagado_en = now() - interval '16 minutes' where id = $1", [a3]);
await r1("select sop_proveedor.vigilar_tardando('pkgsmhub') r");
ok((await uno("select count(*)::int n from sop_proveedor.alerta where tipo='alquiler_tardando' and causa=$1", [a3])).n === 1, "pasó el tiempo máximo → alerta tardando");

// Revisión adversaria: anular NO hace comprar de nuevo solo (crítico 1).
await servicio();
await db.exec("update sop_proveedor.proveedor set respaldo_encendido = true; update sop_proveedor.conector set pausa_motivo = null, fallos_seguidos = 0, fallos_pedir = 0");
await db.exec("update sop_proveedor.pedido set estado = 'anulado' where estado in ('por_enviar','enviando','en_proceso','listo','en_duda','cuenta_ilegible')");
const aR = await alquilar();
await saldo(10);
await r1("select sop_proveedor.pedidos_auto_crear('pkgsmhub') r");
const pR = await uno("select id from sop_proveedor.pedido where alquiler_id = $1", [aR]);
await r1("select sop_proveedor.pedido_preparar($1) r", [pR.id]);
await r1("select sop_proveedor.pedido_respuesta($1, 'aceptado', '9100', 'ok') r", [pR.id]);
await usuario("sop_alquiler.operar");
r = await r1("select sop_proveedor.pedido_anular($1, 'Soporte lo anuló para devolver') r", [pR.id]);
ok(r.ok, "Soporte anula un pedido en proceso (cobrado)");
await servicio();
await r1("select sop_proveedor.pedidos_auto_crear('pkgsmhub') r");
ok((await uno("select count(*)::int n from sop_proveedor.pedido where alquiler_id = $1", [aR])).n === 1, "CRÍTICO 1: después de anular, el automático NO compra otra");
// Modo de la herramienta (Ari-Master): 'propio' no se compra.
const aM = await alquilar("sinmodo");
await r1("select sop_proveedor.pedidos_auto_crear('pkgsmhub') r");
ok((await uno("select count(*)::int n from sop_proveedor.pedido where alquiler_id = $1", [aM])).n === 0, "herramienta en modo propio: el automático no compra");
// Precio nulo: no se compra (regla 4).
const aN = await alquilar("unlocktool", null);
await r1("select sop_proveedor.pedidos_auto_crear('pkgsmhub') r");
const pN = await uno("select id from sop_proveedor.pedido where alquiler_id = $1", [aN]);
r = await r1("select sop_proveedor.pedido_preparar($1) r", [pN.id]);
ok(!r.ok && r.motivo === "daria_perdida", "sin precio cobrado: no se compra", r);
// 3 pedidos seguidos sin respuesta clara: apagado duro.
for (let i = 0; i < 3; i++) await r1("select sop_proveedor.conector_pedido_resultado('pkgsmhub', false) r");
const pr3 = await uno("select respaldo_encendido from sop_proveedor.proveedor");
ok(pr3.respaldo_encendido === false, "3 pedidos sin respuesta clara: el respaldo se apaga (no vuelve solo)");
await r1("select sop_proveedor.conector_resultado('pkgsmhub', true, null) r");
ok((await uno("select respaldo_encendido from sop_proveedor.proveedor")).respaldo_encendido === false, "y no se enciende solo cuando el proveedor vuelve");
// La opción que ya no está: el automático salta a la siguiente.
await db.exec("update sop_proveedor.proveedor set respaldo_encendido = true; update sop_proveedor.conector set fallos_pedir = 0");
const aO = await alquilar();
await saldo(10);
await r1("select sop_proveedor.pedidos_auto_crear('pkgsmhub') r");
const pO = await uno("select id, numero_servicio from sop_proveedor.pedido where alquiler_id = $1", [aO]);
await db.query("update sop_proveedor.opcion set activa = false where numero_servicio = $1", [pO.numero_servicio]);
r = await r1("select sop_proveedor.pedido_preparar($1) r", [pO.id]);
const pO2 = await uno("select numero_servicio, estado from sop_proveedor.pedido where alquiler_id = $1 and estado = 'por_enviar'", [aO]);
ok(!r.ok && r.motivo === "opcion_no_disponible" && pO2 && pO2.numero_servicio !== pO.numero_servicio, "opción que se apagó mientras esperaba: salta a la siguiente", { r, pO2 });
await db.query("update sop_proveedor.opcion set activa = true");
// Copia vieja: una respuesta buena del proveedor NO la levanta (solo un catálogo nuevo).
await db.exec("update sop_proveedor.proveedor set catalogo_sincronizado_en = now() - interval '7 hours'");
await r1("select sop_proveedor.vigilar_copia('pkgsmhub') r");
await r1("select sop_proveedor.conector_resultado('pkgsmhub', true, null) r");
ok((await uno("select pausa_motivo from sop_proveedor.conector")).pausa_motivo === "copia_vieja", "un saldo bueno no levanta la pausa por copia vieja");
await db.exec("update sop_proveedor.proveedor set catalogo_sincronizado_en = now()");
await r1("select sop_proveedor.vigilar_copia('pkgsmhub') r");

// ── Auditoría 18-nov (segunda revisión): arreglos.
await servicio();
await db.exec("update sop_proveedor.proveedor set respaldo_encendido = true; update sop_proveedor.conector set pausa_motivo = null, fallos_seguidos = 0, fallos_pedir = 0");
await db.exec("update sop_proveedor.pedido set estado = 'anulado' where estado in ('por_enviar','enviando','en_proceso','listo','en_duda','cuenta_ilegible')");
// #3: un alquiler cuyo pedido se omitió (daría pérdida) igual avisa «tardando» a los 15 min.
const aT = await alquilar("unlocktool", 0.2);
await saldo(10);
await r1("select sop_proveedor.pedidos_auto_crear('pkgsmhub') r");
const pT = await uno("select id from sop_proveedor.pedido where alquiler_id = $1", [aT]);
await r1("select sop_proveedor.pedido_preparar($1) r", [pT.id]);
await db.query("update sop_alquiler.alquiler set pagado_en = now() - interval '16 minutes' where id = $1", [aT]);
await r1("select sop_proveedor.vigilar_tardando('pkgsmhub') r");
ok((await uno("select count(*)::int n from sop_proveedor.alerta where tipo='alquiler_tardando' and causa=$1", [aT])).n === 1, "#3: omitido por pérdida → igual avisa «tardando»");
// #3: con pausa, el pedido NO se omite: queda por enviar.
const aP = await alquilar();
await r1("select sop_proveedor.pedidos_auto_crear('pkgsmhub') r");
const pP = await uno("select id from sop_proveedor.pedido where alquiler_id = $1 and estado = 'por_enviar'", [aP]);
await db.exec("update sop_proveedor.conector set pausa_motivo = 'proveedor_caido'");
r = await r1("select sop_proveedor.pedido_preparar($1) r", [pP.id]);
ok(!r.ok && r.espera === true && (await uno("select estado from sop_proveedor.pedido where id = $1", [pP.id])).estado === "por_enviar", "#3: en pausa, el pedido espera (no se omite)", r);
await db.exec("update sop_proveedor.conector set pausa_motivo = null");
// #2: lo que W5 pasa a «en duda» cuenta para el corte de 3; y #5: con el corte, Soporte tampoco pide.
await db.exec("update sop_proveedor.conector set fallos_pedir = 2");
await saldo(10);
await r1("select sop_proveedor.pedido_preparar($1) r", [pP.id]);
await db.query("update sop_proveedor.pedido set enviado_en = now() - interval '3 minutes' where id = $1", [pP.id]);
await r1("select sop_proveedor.pedidos_recuperar('pkgsmhub') r");
const c3 = await uno("select fallos_pedir from sop_proveedor.conector");
ok(c3.fallos_pedir === 3 && (await uno("select respaldo_encendido from sop_proveedor.proveedor")).respaldo_encendido === false, "#2: el «en duda» de W5 cuenta y al tercero se apaga", c3);
const aS = await alquilar();
await usuario("sop_alquiler.operar");
r = await r1("select sop_proveedor.pedido_soporte_pedir($1, '648') r", [aS]);
await servicio();
r = await r1("select sop_proveedor.pedido_preparar($1) r", [r.pedido]);
ok(!r.ok && r.motivo === "proveedor_en_duda", "#5: con 3 pedidos sin respuesta, el botón de Soporte tampoco compra", r);
ok((await uno("select sop_proveedor._proveedor_bloqueo('pkgsmhub') r")).r === "proveedor_en_duda", "#4: _proveedor_bloqueo avisa a la 053 que nadie puede pedir");
await db.exec("update sop_proveedor.conector set fallos_pedir = 0; update sop_proveedor.proveedor set respaldo_encendido = true");
ok((await uno("select sop_proveedor._proveedor_bloqueo('pkgsmhub') r")).r === null, "#4: sin bloqueo → null");
// #9: el número de Soporte se normaliza y no deja duplicar.
const aN9 = await alquilar(); await r1("select sop_proveedor.pedidos_auto_crear('pkgsmhub') r");
const pN9 = (await uno("select id from sop_proveedor.pedido where alquiler_id = $1", [aN9])).id;
await saldo(10); await r1("select sop_proveedor.pedido_preparar($1) r", [pN9]);
await r1("select sop_proveedor.pedido_respuesta($1, 'sin_respuesta', null, 'x') r", [pN9]);
await db.exec("update sop_proveedor.pedido set referencia = '104001' where id = (select id from sop_proveedor.pedido where referencia is null and estado = 'anulado' limit 1)");
await usuario("sop_alquiler.operar");
ok((await r1("select sop_proveedor.pedido_seguir_numero($1, 'ABC12') r", [pN9])).motivo === "numero_invalido", "#9: número con letras no se acepta");
ok((await r1("select sop_proveedor.pedido_seguir_numero($1, '0104001') r", [pN9])).motivo === "numero_de_otro_pedido", "#9: «0104001» es el mismo que «104001»");
r = await r1("select sop_proveedor.pedido_seguir_numero($1, '00777') r", [pN9]);
ok(r.ok && (await uno("select referencia from sop_proveedor.pedido where id = $1", [pN9])).referencia === "777", "#9: se guarda normalizado (777)", r);
await servicio();
// #10: dos vueltas a la vez: la segunda no toma el turno.
ok((await uno("select sop_proveedor.vuelta_tomar('pkgsmhub', 150) r")).r === true, "#10: la primera vuelta toma el turno");
ok((await uno("select sop_proveedor.vuelta_tomar('pkgsmhub', 150) r")).r === false, "#10: la segunda, mientras tanto, no");
await db.query("select sop_proveedor.vuelta_soltar('pkgsmhub')");
ok((await uno("select sop_proveedor.vuelta_tomar('pkgsmhub', 150) r")).r === true, "#10: al soltar, la siguiente sí");
await db.query("select sop_proveedor.vuelta_soltar('pkgsmhub')");

// ── Auditoría independiente 18-nov (G1-G3, M4, M5, M7, M8, m4, m6).
await servicio();
await db.exec("update sop_proveedor.proveedor set respaldo_encendido = true, gasto_maximo_dia = 100; update sop_proveedor.conector set pausa_motivo = null, fallos_seguidos = 0, fallos_pedir = 0");
await db.exec("update sop_proveedor.pedido set estado = 'anulado' where estado in ('por_enviar','enviando','en_proceso','listo','en_duda','cuenta_ilegible')");
const nuevo = async () => { const a = await alquilar(); await saldo(10); await r1("select sop_proveedor.pedidos_auto_crear('pkgsmhub') r");
  const p = (await uno("select id from sop_proveedor.pedido where alquiler_id = $1 and estado = 'por_enviar'", [a])).id; return { a, p }; };
// G2: el texto de «listo» queda guardado cifrado siempre.
let k = await nuevo();
await r1("select sop_proveedor.pedido_preparar($1) r", [k.p]); await r1("select sop_proveedor.pedido_respuesta($1, 'aceptado', '7001', 'ok') r", [k.p]);
await r1("select sop_proveedor.pedido_estado_proveedor($1, 4, 'User: zz | Pass: yy') r", [k.p]);
ok((await uno("select sop_alquiler.descifrar(cuenta_cif) t from sop_proveedor.pedido where id = $1", [k.p])).t === "User: zz | Pass: yy", "G2: el texto original de la cuenta queda cifrado");
// G3: pasó por «en duda» → lo que llegue no se entrega solo; un rechazo no compra la siguiente.
k = await nuevo();
await r1("select sop_proveedor.pedido_preparar($1) r", [k.p]); await r1("select sop_proveedor.pedido_respuesta($1, 'sin_respuesta', null, 'x') r", [k.p]);
await usuario("sop_alquiler.operar"); await r1("select sop_proveedor.pedido_seguir_numero($1, '7002') r", [k.p]); await servicio();
r = await r1("select sop_proveedor.pedido_estado_proveedor($1, 4, 'User: aa | Pass: bb') r", [k.p]);
ok(r.estado === "cuenta_ilegible" && (await uno("select situacion from sop_alquiler.alquiler where id = $1", [k.a])).situacion === "en_espera",
   "G3: cuenta de un pedido que estuvo en duda → no se entrega sola, Soporte confirma", r);
k = await nuevo();
await r1("select sop_proveedor.pedido_preparar($1) r", [k.p]); await r1("select sop_proveedor.pedido_respuesta($1, 'sin_respuesta', null, 'x') r", [k.p]);
await usuario("sop_alquiler.operar"); await r1("select sop_proveedor.pedido_seguir_numero($1, '7003') r", [k.p]); await servicio();
await r1("select sop_proveedor.pedido_estado_proveedor($1, 3, 'Rejected') r", [k.p]);
ok((await uno("select count(*)::int n from sop_proveedor.pedido where alquiler_id = $1", [k.a])).n === 1, "G3: rechazo de un pedido que estuvo en duda → no compra la siguiente sola");
// M4: rechazado y el saldo NO volvió → Soporte, sin pedir otra.
k = await nuevo();
await r1("select sop_proveedor.pedido_preparar($1) r", [k.p]); await r1("select sop_proveedor.pedido_respuesta($1, 'aceptado', '7004', 'ok') r", [k.p]);
await r1("select sop_proveedor.pedido_estado_proveedor($1, 3, 'Rejected') r", [k.p]);
r = await r1("select sop_proveedor.pedido_rechazo_verificado($1, 9.61) r", [k.p]);
ok(r.devolucion_vista === false && (await uno("select count(*)::int n from sop_proveedor.pedido where alquiler_id = $1", [k.a])).n === 1, "M4: sin devolución a la vista → Soporte, no compra otra", r);
r = await r1("select sop_proveedor.pedido_rechazo_verificado($1, null) r", [k.p]);
ok(r.ok === false, "M4: no se verifica dos veces");
// M5: un pedido anulado con número se sigue; si llega la cuenta, se guarda y avisa.
k = await nuevo();
await r1("select sop_proveedor.pedido_preparar($1) r", [k.p]); await r1("select sop_proveedor.pedido_respuesta($1, 'aceptado', '7005', 'ok') r", [k.p]);
await usuario("sop_alquiler.operar"); await r1("select sop_proveedor.pedido_anular($1, 'Soporte lo anuló para devolver') r", [k.p]); await servicio();
ok((await filas("select * from sop_proveedor.pedidos_a_seguir('pkgsmhub')")).some((x) => x.pedido === k.p), "M5: el anulado con número se sigue");
await r1("select sop_proveedor.pedido_estado_proveedor($1, 4, 'User: q1 | Pass: w1') r", [k.p]);
const an = await uno("select estado, cuenta_cif is not null as guardada from sop_proveedor.pedido where id = $1", [k.p]);
ok(an.estado === "anulado" && an.guardada && (await uno("select count(*)::int n from sop_proveedor.alerta where tipo='cuenta_ilegible' and causa=$1", ["anulado:" + k.p])).n === 1,
   "M5: llegó la cuenta del anulado → guardada cifrada y alerta (pérdida)", an);
ok(!(await filas("select * from sop_proveedor.pedidos_a_seguir('pkgsmhub')")).some((x) => x.pedido === k.p), "M5: con el estado final, se deja de seguir");
// M7: si la entrega da error, no rebota: queda con la cuenta guardada y alerta.
k = await nuevo();
await r1("select sop_proveedor.pedido_preparar($1) r", [k.p]); await r1("select sop_proveedor.pedido_respuesta($1, 'aceptado', '7006', 'ok') r", [k.p]);
await r1("select sop_proveedor.pedido_estado_proveedor($1, 4, 'User: e1 | Pass: e2') r", [k.p]);
r = await r1("select sop_proveedor.pedido_entregar($1, '', 'e2') r", [k.p]);
ok(r.ok === false && (await uno("select estado from sop_proveedor.pedido where id = $1", [k.p])).estado === "cuenta_ilegible", "M7: entrega con error → cuenta ilegible guardada, no rebota", r);
// m6: un «por enviar» se puede anular.
k = await nuevo();
await usuario("sop_alquiler.operar");
r = await r1("select sop_proveedor.pedido_anular($1, 'no era para este taller') r", [k.p]);
await servicio();
ok(r.ok === true, "m6: se puede anular un pedido que todavía no salió", r);
// m4: con pausa por saldo agotado, el botón de Soporte igual compra si la reserva alcanza.
const a4b = await alquilar();
await usuario("sop_alquiler.operar"); r = await r1("select sop_proveedor.pedido_soporte_pedir($1, '556') r", [a4b]); await servicio();
await saldo(10); await db.exec("update sop_proveedor.conector set pausa_motivo = 'saldo_agotado'");
r = await r1("select sop_proveedor.pedido_preparar($1) r", [r.pedido]);
ok(r.ok === true, "m4: la pausa por saldo (promedio) no frena una compra de Soporte que sí alcanza", r);
await db.exec("update sop_proveedor.conector set pausa_motivo = null");
// M8: cierres. Un alquiler entregado a mano cierra sus alertas; con máximo cargado se cierra la de «falta».
await db.query("update sop_alquiler.alquiler set situacion = 'en_curso' where id = $1", [aT]);
r = await r1("select sop_proveedor.vigilar_cierres('pkgsmhub') r");
ok((await uno("select count(*)::int n from sop_proveedor.alerta where causa = $1 and resuelta_en is null and tipo <> 'cuenta_ilegible'", [aT])).n === 0
   && (await uno("select count(*)::int n from sop_proveedor.alerta where tipo='gasto_maximo' and causa='falta' and resuelta_en is null")).n === 0, "M8: se cierran las alertas que ya no corresponden", r);

// ── Tercera revisión (18-nov): lo que trajeron los arreglos.
await servicio();
await db.exec("update sop_proveedor.proveedor set respaldo_encendido = true, gasto_maximo_dia = 100; update sop_proveedor.conector set pausa_motivo = null, fallos_seguidos = 0, fallos_pedir = 0");
await db.exec("update sop_proveedor.pedido set estado = 'anulado' where estado in ('por_enviar','enviando','en_proceso','listo','en_duda','cuenta_ilegible')");
// P1: el alquiler deja de esperar pero tiene un pedido «en duda» → el aviso NO se cierra solo.
let q = await nuevo();
await r1("select sop_proveedor.pedido_preparar($1) r", [q.p]); await r1("select sop_proveedor.pedido_respuesta($1, 'sin_respuesta', null, 'x') r", [q.p]);
await db.query("update sop_alquiler.alquiler set situacion = 'devuelto', devuelto_en = now() where id = $1", [q.a]);
await r1("select sop_proveedor.vigilar_cierres('pkgsmhub') r");
ok((await uno("select count(*)::int n from sop_proveedor.alerta where tipo='pedido_en_duda' and causa=$1 and resuelta_en is null", [q.a])).n === 1,
   "P1: con un pedido «en duda», el aviso no se cierra aunque el alquiler se haya devuelto");
// P2: con el corte duro activo (3 fallos + un «en duda»), el automático no crea ni omite: espera.
await db.exec("update sop_proveedor.conector set fallos_pedir = 3");
const aC = await alquilar();
r = await r1("select sop_proveedor.pedidos_auto_crear('pkgsmhub') r");
ok(r.creados === 0 && r.motivo === "proveedor_en_duda" && (await uno("select count(*)::int n from sop_proveedor.pedido where alquiler_id = $1", [aC])).n === 0,
   "P2: con el corte duro, el automático no crea pedidos (no los pierde)", r);
await db.exec("update sop_proveedor.conector set fallos_pedir = 0");
await db.query("update sop_proveedor.pedido set estado = 'anulado' where id = $1", [q.p]);
// P3: devolución «vista» solo si volvió justo lo del pedido y nada más se movió.
q = await nuevo();
await r1("select sop_proveedor.pedido_preparar($1) r", [q.p]); await r1("select sop_proveedor.pedido_respuesta($1, 'aceptado', '7101', 'ok') r", [q.p]);
await r1("select sop_proveedor.pedido_saldo_despues($1, 9.61) r", [q.p]);
await r1("select sop_proveedor.pedido_estado_proveedor($1, 3, 'Rejected') r", [q.p]);
r = await r1("select sop_proveedor.pedido_rechazo_verificado($1, 30) r", [q.p]);
ok(r.devolucion_vista === false, "P3: el saldo subió de más (recarga de Admin) → no se toma como devolución, va a Soporte", r);
q = await nuevo();
await r1("select sop_proveedor.pedido_preparar($1) r", [q.p]); await r1("select sop_proveedor.pedido_respuesta($1, 'aceptado', '7102', 'ok') r", [q.p]);
await r1("select sop_proveedor.pedido_saldo_despues($1, 9.61) r", [q.p]);
const otro = await nuevo();                                        // otro pedido sale entre medio
await saldo(9.61); await r1("select sop_proveedor.pedido_preparar($1) r", [otro.p]);
await r1("select sop_proveedor.pedido_estado_proveedor($1, 3, 'Rejected') r", [q.p]);
r = await r1("select sop_proveedor.pedido_rechazo_verificado($1, 10) r", [q.p]);
ok(r.devolucion_vista === false, "P3: salió otro pedido entre medio → no se puede saber, va a Soporte", r);
await db.query("update sop_proveedor.pedido set estado = 'anulado' where id = $1", [otro.p]);
// P6: un pedido de Soporte que esperaba no sale si el taller pidió la devolución.
const aD = await alquilar();
await usuario("sop_alquiler.operar"); r = await r1("select sop_proveedor.pedido_soporte_pedir($1, '556') r", [aD]); await servicio();
await db.query("update sop_alquiler.alquiler set devolucion_solicitada_en = now() where id = $1", [aD]);
await saldo(10);
const rD = await r1("select sop_proveedor.pedido_preparar($1) r", [r.pedido]);
ok(!rD.ok && rD.motivo === "devolucion_pedida", "P6: devolución pedida → el pedido de Soporte tampoco sale", rD);
// P7: el aviso «no alcanza para el pedido» tiene su causa y se cierra cuando el pedido sale.
q = await nuevo();
await saldo(0.1);
r = await r1("select sop_proveedor.pedido_preparar($1) r", [q.p]);
const vivaR = (await uno("select count(*)::int n from sop_proveedor.alerta where tipo='saldo_agotado' and causa='reserva' and resuelta_en is null")).n;
await saldo(10);
await db.exec("update sop_proveedor.conector set pausa_motivo = null");
r = await r1("select sop_proveedor.pedido_preparar($1) r", [q.p]);
ok(vivaR === 1 && r.ok && (await uno("select count(*)::int n from sop_proveedor.alerta where tipo='saldo_agotado' and causa='reserva' and resuelta_en is null")).n === 0,
   "P7: «no alcanza» se avisa con su causa y se cierra cuando el pedido sale", r);
// P5: volver a pedir con una orden anulada viva en el proveedor → aviso a Soporte.
await r1("select sop_proveedor.pedido_respuesta($1, 'aceptado', '7103', 'ok') r", [q.p]);
await usuario("sop_alquiler.operar"); await r1("select sop_proveedor.pedido_anular($1, 'Soporte lo anuló para probar') r", [q.p]);
r = await r1("select sop_proveedor.pedido_soporte_pedir($1, '648') r", [q.a]); await servicio();
ok(!r.ok && r.motivo === "hay_un_pedido_vivo_en_el_proveedor", "R1: con una orden anulada viva en el proveedor, Soporte no puede pedir otra (serían dos pagadas)", r);
r = await r1("select sop_proveedor.pedido_estado_proveedor($1, 3, 'Rejected') r", [q.p]);          // el proveedor la cierra
await usuario("sop_alquiler.operar"); r = await r1("select sop_proveedor.pedido_soporte_pedir($1, '648') r", [q.a]); await servicio();
ok(r.ok === true, "R1: cuando la anulada llega a su estado final, Soporte puede volver a pedir", r);

// ── R1 · Anular el alquiler (cascada de Ari-Master): la API no cancela, el pedido no queda huérfano ni se paga dos veces.
await db.exec("update sop_proveedor.pedido set estado = 'anulado' where estado in ('por_enviar','enviando','en_proceso','listo','en_duda','cuenta_ilegible')");
const anularA = async (a) => { await usuario(""); const x = await r1("select sop_proveedor.pedido_anular_alquiler($1, null) r", [a]); await servicio(); return x; };   // con el token del taller (devolución)
r = await anularA(await alquilar());
ok(r.ok && r.accion === "sin_pedido", "R1: alquiler sin pedido → nada que cortar", r);
// por_enviar → anulado y nunca sale
q = await nuevo();
r = await anularA(q.a);
const rPrep = await r1("select sop_proveedor.pedido_preparar($1) r", [q.p]);
ok(r.accion === "anulado" && r.sigue_vivo_en_proveedor === false && !rPrep.ok && rPrep.motivo === "ya_no_esta_por_enviar",
   "R1: un «por enviar» se anula y ya no sale nunca", { r, rPrep });
// enviando → no se corta (se perdería el número de una orden cobrada)
q = await nuevo();
await r1("select sop_proveedor.pedido_preparar($1) r", [q.p]);
r = await anularA(q.a);
const rAn = await (async () => { await usuario("sop_alquiler.operar"); const x = await r1("select sop_proveedor.pedido_anular($1, 'Soporte quiere cortarlo ya') r", [q.p]); await servicio(); return x; })();
ok(!r.ok && r.accion === "se_esta_enviando" && !rAn.ok && rAn.motivo === "se_esta_enviando"
   && (await uno("select estado from sop_proveedor.pedido where id = $1", [q.p])).estado === "enviando",
   "R1: «enviando» no se corta ni por alquiler ni por pedido (se reintenta en minutos)", { r, rAn });
// en_proceso → anulado, sigue vivo; si después entrega, la cuenta queda guardada y avisa
r = await r1("select sop_proveedor.pedido_respuesta($1, 'aceptado', '7201', 'ok') r", [q.p]);
r = await anularA(q.a);
ok(r.ok && r.accion === "anulado" && r.sigue_vivo_en_proveedor === true, "R1: «en proceso» se anula y avisa que sigue vivo (y pagado) en el proveedor", r);
ok((await uno("select count(*)::int n from sop_proveedor.pedidos_a_seguir('pkgsmhub') s where s.pedido = $1", [q.p])).n === 1,
   "R1: el anulado con número se sigue consultando (24 h)");
r = await r1("select sop_proveedor.pedido_estado_proveedor($1, 4, 'User: tarde | Pass: zz') r", [q.p]);
ok((await uno("select count(*)::int n from sop_proveedor.alerta where tipo='cuenta_ilegible' and causa=$1 and resuelta_en is null", ["anulado:" + q.p])).n === 1
   && (await uno("select sop_alquiler.descifrar(cuenta_cif) t from sop_proveedor.pedido where id = $1", [q.p])).t === "User: tarde | Pass: zz",
   "R1: si igual entrega, la cuenta queda cifrada para Soporte y avisa");
// listo → anulado con la cuenta guardada
q = await nuevo();
await db.query("update sop_alquiler.alquiler set devolucion_solicitada_en = null where id = $1", [q.a]);
await r1("select sop_proveedor.pedido_preparar($1) r", [q.p]); await r1("select sop_proveedor.pedido_respuesta($1, 'aceptado', '7202', 'ok') r", [q.p]);
await db.query("update sop_proveedor.pedido set estado = 'listo', cuenta_cif = sop_alquiler.cifrar('User: l | Pass: m'), ultimo_status = 4 where id = $1", [q.p]);
r = await anularA(q.a);
ok(r.ok && r.accion === "anulado" && r.cuenta_guardada === true && r.sigue_vivo_en_proveedor === false, "R1: «listo» se anula con la cuenta guardada", r);
// en_duda → NO se anula solo (puede estar cobrado sin número): queda abierto con su aviso
q = await nuevo();
await r1("select sop_proveedor.pedido_preparar($1) r", [q.p]); await r1("select sop_proveedor.pedido_respuesta($1, 'sin_respuesta', null, 'x') r", [q.p]);
r = await anularA(q.a);
ok(r.ok && r.accion === "queda_en_duda" && (await uno("select estado from sop_proveedor.pedido where id = $1", [q.p])).estado === "en_duda"
   && (await uno("select count(*)::int n from sop_proveedor.alerta where tipo='pedido_en_duda' and causa=$1 and resuelta_en is null", [q.a])).n === 1,
   "R1: «en duda» queda abierto con su aviso (la devolución al taller sigue igual)", r);
// permisos reales: ningún usuario llama a _pedido_anular ni a la cascada; el servidor sí a la cascada
const priv = async (rol, fn) => (await uno("select has_function_privilege($1, $2, 'execute') x", [rol, fn])).x;
ok(!(await priv("authenticated", "sop_proveedor._pedido_anular(uuid, text)")) && !(await priv("anon", "sop_proveedor._pedido_anular(uuid, text)"))
   && !(await priv("service_role", "sop_proveedor._pedido_anular(uuid, text)")),
   "R1: _pedido_anular no la ejecuta nadie de afuera");
ok(!(await priv("authenticated", "sop_proveedor.pedido_anular_alquiler(uuid, text)")) && !(await priv("anon", "sop_proveedor.pedido_anular_alquiler(uuid, text)"))
   && (await priv("service_role", "sop_proveedor.pedido_anular_alquiler(uuid, text)")),
   "R1: la cascada no la llama un usuario del panel ni un taller directo; el servidor sí");
r = await r1("select sop_proveedor.pedido_anular_alquiler($1, 'cascada del servidor') r", [q.a]);
ok(r.accion === "queda_en_duda", "R1: el servidor (service_role) también puede llamarla", r);

// ── Revisión de R1 (19-nov)
await db.exec("update sop_proveedor.pedido set estado = 'anulado' where estado in ('por_enviar','enviando','en_proceso','listo','en_duda','cuenta_ilegible')");
// 1: el anulado vivo se sigue y frena a Soporte aunque pasen más de 24 h
q = await nuevo();
await r1("select sop_proveedor.pedido_preparar($1) r", [q.p]); await r1("select sop_proveedor.pedido_respuesta($1, 'aceptado', '7301', 'ok') r", [q.p]);
await anularA(q.a);
await db.query("update sop_proveedor.pedido set cerrado_en = now() - interval '30 hours' where id = $1", [q.p]);
await usuario("sop_alquiler.operar"); r = await r1("select sop_proveedor.pedido_soporte_pedir($1, '648') r", [q.a]); await servicio();
ok(!r.ok && r.motivo === "hay_un_pedido_vivo_en_el_proveedor"
   && (await uno("select count(*)::int n from sop_proveedor.pedidos_a_seguir('pkgsmhub') s where s.pedido = $1", [q.p])).n === 1,
   "revisión R1 #1: a las 30 h el anulado vivo se sigue y Soporte no puede pedir otro", r);
// 8: un anulado que el proveedor devolvió (STATUS 3) no suma al gasto del día
const gastoAntes = (await uno(`select coalesce(sum(costo_esperado),0)::float g from sop_proveedor.pedido where estado in ('enviando','en_proceso','listo','entregado','en_duda','cuenta_ilegible','anulado')
   and (estado <> 'anulado' or ultimo_status is distinct from 3) and enviado_en::date = now()::date`)).g;
await r1("select sop_proveedor.pedido_estado_proveedor($1, 3, 'Rejected') r", [q.p]);
const gastoDespues = (await uno(`select coalesce(sum(costo_esperado),0)::float g from sop_proveedor.pedido where estado in ('enviando','en_proceso','listo','entregado','en_duda','cuenta_ilegible','anulado')
   and (estado <> 'anulado' or ultimo_status is distinct from 3) and enviado_en::date = now()::date`)).g;
await db.exec("update sop_proveedor.proveedor set gasto_maximo_dia = " + (gastoDespues + 0.40));   // alcanza solo si el devuelto no cuenta
const q8 = await nuevo(); r = await r1("select sop_proveedor.pedido_preparar($1) r", [q8.p]);
ok(gastoAntes > gastoDespues && r.ok === true, "revisión R1 #8: el anulado devuelto no ocupa el máximo del día", { gastoAntes, gastoDespues, r });
await db.exec("update sop_proveedor.proveedor set gasto_maximo_dia = 100, respaldo_encendido = true");
await db.query("update sop_proveedor.pedido set estado = 'anulado' where id = $1", [q8.p]);
// 3: un «enviando» de más de 2 minutos no traba la cascada: pasa a «en duda»
q = await nuevo();
await r1("select sop_proveedor.pedido_preparar($1) r", [q.p]);
await db.query("update sop_proveedor.pedido set enviado_en = now() - interval '10 minutes' where id = $1", [q.p]);
r = await anularA(q.a);
ok(r.ok && r.accion === "queda_en_duda" && (await uno("select estado from sop_proveedor.pedido where id = $1", [q.p])).estado === "en_duda"
   && (await uno("select count(*)::int n from sop_proveedor.alerta where tipo='pedido_en_duda' and causa=$1 and resuelta_en is null", [q.a])).n === 1,
   "revisión R1 #3: «enviando» viejo (cron caído) pasa a «en duda» con aviso y no traba la devolución", r);
// 6: el número que llega tarde para un «en duda» que Soporte ya anuló se guarda (y se sigue)
await usuario("sop_alquiler.operar"); await r1("select sop_proveedor.pedido_anular($1, 'Soporte lo anuló sin número') r", [q.p]); await servicio();
r = await r1("select sop_proveedor.pedido_respuesta($1, 'aceptado', '7302', 'llegó tarde') r", [q.p]);
ok(r.ok && r.estado === "anulado" && (await uno("select referencia from sop_proveedor.pedido where id = $1", [q.p])).referencia === "7302"
   && (await uno("select count(*)::int n from sop_proveedor.pedidos_a_seguir('pkgsmhub') s where s.pedido = $1", [q.p])).n === 1,
   "revisión R1 #6: el número que llega tarde de un anulado se guarda y se sigue", r);
// 5: anular un «listo» con la cuenta guardada avisa la pérdida
q = await nuevo();
await r1("select sop_proveedor.pedido_preparar($1) r", [q.p]); await r1("select sop_proveedor.pedido_respuesta($1, 'aceptado', '7303', 'ok') r", [q.p]);
await db.query("update sop_proveedor.pedido set estado = 'listo', cuenta_cif = sop_alquiler.cifrar('User: p | Pass: q'), ultimo_status = 4 where id = $1", [q.p]);
await anularA(q.a);
ok((await uno("select count(*)::int n from sop_proveedor.alerta where tipo='cuenta_ilegible' and causa=$1 and resuelta_en is null", ["anulado:" + q.p])).n === 1,
   "revisión R1 #5: anular un «listo» deja el aviso de la cuenta guardada (pérdida)");
// M3: un pedido enviado ANTES no impide comparar (antes se salteaba con cualquier envío en 5 min).
await db.exec("update sop_proveedor.pedido set estado = 'anulado' where estado in ('por_enviar','enviando','en_proceso','listo','en_duda','cuenta_ilegible')");
const m3a = await nuevo(); await r1("select sop_proveedor.pedido_preparar($1) r", [m3a.p]); await r1("select sop_proveedor.pedido_respuesta($1, 'aceptado', '7104', 'ok') r", [m3a.p]);
const m3b = await nuevo(); await r1("select sop_proveedor.pedido_preparar($1) r", [m3b.p]); await r1("select sop_proveedor.pedido_respuesta($1, 'aceptado', '7105', 'ok') r", [m3b.p]);
r = await r1("select sop_proveedor.pedido_saldo_despues($1, 9.0) r", [m3b.p]);
ok(r.cobro_distinto === true, "M3: con otro pedido enviado ANTES, igual compara y detecta el cobro de más", r);

// Permisos: anon / authenticated no llegan a lo de la edge.
for (const rol of ["anon", "authenticated"]) {
  await db.exec(`set role ${rol}`);
  ok((await tira("select sop_proveedor.pedidos_auto_crear('pkgsmhub')", [], /permission denied/)) === true, `${rol} no puede crear pedidos`);
  ok((await tira("select * from sop_proveedor.pedido", [], /permission denied/)) === true, `${rol} no puede leer pedidos`);
  ok((await tira("select sop_proveedor.alertas_enviadas(array[1]::bigint[])", [], /permission denied/)) === true, `${rol} no puede marcar alertas`);
  await db.exec("reset role");
}
console.log(fallas === 0 ? "\nTODO OK" : `\n${fallas} FALLAS`);
process.exit(fallas ? 1 : 0);
