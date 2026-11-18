// Copiada al repositorio el 18-nov-2026 (antes vivía en el scratchpad de Ari-Web). Correr desde miweb/test/proveedor:
//   npm install  (una vez; solo instala PGlite)  ·  ver LEEME.md
// Prueba local (PGlite) de 20261118-proveedor-alertas-extra.sql (#2, #3, #7 y #11 de la pestaña 13) encima de:
// base de Ari-Master + M1-core REAL + compra.sql (Ari-Web, el de prod) + ganancia-general (propuesta de Ari-Master). Sin red ni prod.
// Correr desde esta carpeta:  M1_SQL=C:/private/AriTool_Recursos/db-diagramas/propuestas/20261118-proveedor-m1-core.sql node probar_alertas_extra.mjs
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
const D = (process.env.PROPUESTAS_DIR ?? "C:/private/AriTool_Recursos/db-diagramas/propuestas").replace(/\/?$/, "/");
const leer = (f) => readFileSync(f, "utf8");
const base = leer(D + "20261118-proveedor-alquiler-base.sql");
const m1 = leer(process.env.M1_SQL ?? D + "20261118-proveedor-m1-core.sql");
const compra = leer(process.env.COMPRA_SQL ?? D + "20261118-proveedor-compra.sql");
const ganancia = leer(process.env.GANANCIA_SQL ?? D + "20261118-proveedor-ganancia-general.sql");
const extra = process.env.EXTRA_SQL ? leer(process.env.EXTRA_SQL)
  : leer(D + "20261118-proveedor-alertas-extra.sql") + "\n" + leer(D + "20261118-proveedor-oculta-motivo.sql");
const db = new PGlite();
let fallas = 0, total = 0;
const ok = (c, m, x = "") => { total++; console.log((c ? "OK   " : "FALLA") + " " + m + (x !== "" && !c ? "  " + (typeof x === "string" ? x : JSON.stringify(x)) : "")); if (!c) fallas++; };
const uno = async (q, p = []) => (await db.query(q, p)).rows[0];
const filas = async (q, p = []) => (await db.query(q, p)).rows;
const tira = async (q, p, re) => { try { await db.query(q, p); return "no tiró"; } catch (e) { return re.test(e.message) || e.message; } };
const servicio = () => db.exec(`select set_config('request.jwt.claims', '{"role":"service_role"}', false); select set_config('prueba.capacidad', '', false)`);
const usuario = (cap) => db.exec(`select set_config('request.jwt.claims', '{"role":"authenticated"}', false); select set_config('prueba.capacidad', '${cap}', false)`);

// ---- Lo que ya existe en prod (simulado lo mínimo de sop_acceso, auth, sop_alquiler y sop_config)
await db.exec(`create role anon; create role authenticated; create role service_role;
  create schema sop_acceso; create schema auth;
  create function sop_acceso.tiene_capacidad(p text) returns boolean language sql stable as $$ select coalesce(current_setting('prueba.capacidad', true), '') = p $$;
  create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
  grant usage on schema sop_acceso, auth to authenticated, service_role;
  grant execute on function sop_acceso.tiene_capacidad(text), auth.uid() to authenticated, service_role;
  create schema sop_alquiler;
  create table sop_alquiler.herramienta (clave text primary key, nombre text, horas int, visible boolean not null default true, orden int);
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
  grant usage on schema sop_alquiler to service_role, authenticated;
  create schema sop_config;
  create table sop_config.ajuste (clave text primary key, valor text not null, actualizado_en timestamptz not null default now(), actualizado_por uuid);
  create function sop_config.ajuste_fijar(p_clave text, p_valor text) returns void language sql as
    $$ insert into sop_config.ajuste (clave, valor) values (p_clave, p_valor) on conflict (clave) do update set valor = excluded.valor $$;`);
await db.exec(base);
await db.exec(m1);
await db.exec(compra);
await db.exec(ganancia);
await db.exec(extra);
ok(true, "aplicados: base + M1-core REAL + compra + ganancia-general + alertas-extra");

// ---- Catálogo y herramientas de prueba (nombres como los de productos.sql)
await servicio();
const CAT = { "556": ["Unlock tool Source 1", 0.39], "648": ["Unlock tool source 2", 0.59], "1091": ["Griffin Unlocker Premium account", 2.1],
  "650": ["GRIFFIN UNLOCKER TOOL RENT [6 Hours]", 2.0], "667": ["PHOENIX KEY RENT [2 Hours]", 0.42], "668": ["Samsungtool.us RENT [12 Hours]", 2.8],
  "999": ["Una que nadie enlazó", 5] };
const sync = (sin = []) => db.query("select sop_proveedor.catalogo_sincronizar('pkgsmhub', $1::jsonb, true, null)", [JSON.stringify(
  Object.entries(CAT).filter(([n]) => !sin.includes(n)).map(([n, [nombre, costo]]) => ({ numero_servicio: n, nombre, tipo: "REMOTE", costo: String(costo), demora_anunciada: "INSTANT" })))]);
await sync();
await db.exec(`insert into sop_alquiler.herramienta (clave, nombre, horas, visible) values ('unlock_tool','Unlock Tool',24,true),
    ('griffin','Griffin Unlocker',24,true), ('phoenix','Phoenix Key',24,true), ('samsung','Samsungtool.us',24,true), ('pausada','Pausada a mano',24,false);
  insert into sop_proveedor.enlace (herramienta, proveedor_clave, numero_servicio, horas) values ('unlock_tool','pkgsmhub','556',24),
    ('unlock_tool','pkgsmhub','648',24), ('griffin','pkgsmhub','1091',24), ('griffin','pkgsmhub','650',24), ('phoenix','pkgsmhub','667',24),
    ('samsung','pkgsmhub','668',24), ('pausada','pkgsmhub','668',24);
  insert into sop_proveedor.producto_config (herramienta, modo) values ('unlock_tool','respaldo'), ('griffin','solo_proveedor'),
    ('phoenix','solo_proveedor'), ('samsung','solo_proveedor'), ('pausada','solo_proveedor');`);
const TIPOS = ["costo_subio", "opcion_quitada", "herramienta_oculta", "ganancia_baja"];
const vigilar = async () => {
  const r = (await uno("select sop_proveedor.vigilar_alertas_extra('pkgsmhub', true) r")).r;
  const err = Object.entries(r).filter(([, v]) => v && v.error);
  if (err.length) ok(false, "vigilar sin errores", err);
  return r;
};
const viva = (tipo, causa) => uno("select * from sop_proveedor.alerta where tipo = $1 and causa = $2 and resuelta_en is null", [tipo, causa]);
const cuenta = async (tipo, causa = null) => (await uno("select count(*)::int n from sop_proveedor.alerta where tipo = $1 and resuelta_en is null and ($2::text is null or causa = $2)", [tipo, causa])).n;
const resuelta = async (id) => (await uno("select resuelta_en from sop_proveedor.alerta where id = $1", [id])).resuelta_en !== null;
const porEnviar = async () => (await filas("select id from sop_proveedor.alertas_por_enviar('pkgsmhub')")).map((x) => Number(x.id));
const enviar = async () => { const ids = await porEnviar(); if (ids.length) await db.query("select sop_proveedor.alertas_enviadas($1::bigint[])", [ids]); return ids; };
const alquilarYPedir = async (herr, num, costo, cobrado, estado, cuando) => {
  const a = (await uno("insert into sop_alquiler.alquiler (herramienta, precio_final_usdt, situacion) values ($1, $2, 'en_curso') returning id", [herr, cobrado])).id;
  await db.query(`insert into sop_proveedor.pedido (proveedor, alquiler_id, intento, numero_servicio, costo_esperado, precio_cobrado, origen, estado, enviado_en, entregado_en)
    values ('pkgsmhub', $1, 1, $2, $3, $4, 'auto', $5, (${cuando}) - interval '5 minutes', case when $5 = 'entregado' then (${cuando}) end)`, [a, num, costo, cobrado, estado]);
  return a;
};

// ---- Estado inicial: todo en orden → ninguna alerta
await vigilar(); await vigilar();
ok((await uno(`select count(*)::int n from sop_proveedor.alerta where tipo = any($1)`, [TIPOS])).n === 0, "todo en orden: ninguna de las 4 alertas");

// ---- Permisos
for (const rol of ["anon", "authenticated"]) {
  await db.exec(`set role ${rol}`);
  ok((await tira("select sop_proveedor.vigilar_alertas_extra('pkgsmhub')", [], /permission denied/)) === true, `${rol} no puede llamar a vigilar_alertas_extra`);
  ok((await tira("select sop_proveedor._vigilar_ocultas('pkgsmhub')", [], /permission denied/)) === true, `${rol} no puede llamar a los ayudantes`);
  await db.exec("reset role");
}
await usuario("config.gestion");
ok((await tira("select sop_proveedor.vigilar_alertas_extra('pkgsmhub')", [], /solo_service_role/)) === true, "un Admin del panel (JWT authenticated) tampoco: solo_service_role");
await db.exec("set role service_role");
await servicio();
ok(typeof (await uno("select sop_proveedor.vigilar_alertas_extra('pkgsmhub') r")).r === "object", "service_role sí puede");
await db.exec("reset role");
ok((await tira("select sop_proveedor.vigilar_alertas_extra('otro')", [], /proveedor_inexistente/)) === true, "proveedor que no existe: error claro");

// ════════ #2 · Subió el costo de una opción
await alquilarYPedir("griffin", "1091", 2.1, 3.1, "entregado", "now() - interval '3 days'");   // la última compra de la 1091 fue a 2.10
await db.exec("update sop_proveedor.producto_config set tope_costo_usd = 2.2 where herramienta = 'griffin'");
await vigilar();
ok((await cuenta("costo_subio")) === 0, "#2: 2.10 con tope 2.20 → nada");
CAT["1091"][1] = 2.5; await sync();
await vigilar();
let a2 = await viva("costo_subio", "griffin|1091");
ok(a2 && Number(a2.datos.costo_anterior) === 2.1 && a2.datos.costo_anterior_fuente === "ultimo_pedido" && Number(a2.datos.costo_nuevo) === 2.5 && Number(a2.datos.tope) === 2.2,
  "#2: sube a 2.50 → alerta con herramienta, costo anterior (del último pedido) y costo nuevo", a2?.datos);
ok(a2 && a2.texto.includes("Griffin Unlocker") && a2.texto.includes("pasó de US$ 2.10 a US$ 2.50") && a2.texto.includes("tope de US$ 2.20"), "#2: el texto lo dice", a2?.texto);
ok(a2 && a2.para === "admin" && a2.urgencia === 5, "#2: para Admin, urgencia 5 (V6.1 «el resto»)");
ok(!(await filas("select numero_servicio from sop_proveedor.opciones_para('griffin')")).some((x) => x.numero_servicio === "1091"), "#2: opciones_para ya no la usa");
ok((await cuenta("herramienta_oculta", "griffin")) === 0, "#2: Griffin sigue con la 650 → no se oculta");
await vigilar(); await vigilar();
ok((await cuenta("costo_subio")) === 1 && (await viva("costo_subio", "griffin|1091")).id === a2.id, "#2: no se duplica en las vueltas siguientes");
let pe = await porEnviar();
ok(pe.filter((x) => x === Number(a2.id)).length === 1, "#2: Telegram la manda una vez");
await enviar();
ok(!(await porEnviar()).includes(Number(a2.id)), "#2: enviada → no se repite si nada cambió");
CAT["1091"][1] = 2.9; await sync(); await vigilar();
let a2b = await viva("costo_subio", "griffin|1091");
ok(a2b.id === a2.id && Number(a2b.datos.costo_anterior) === 2.5 && a2b.datos.costo_anterior_fuente === "alerta_anterior" && Number(a2b.datos.costo_nuevo) === 2.9,
  "#2: vuelve a subir (2.90) → la misma alerta, anterior = 2.50", a2b.datos);
ok((await porEnviar()).includes(Number(a2.id)), "#2: cambió el costo → Telegram la vuelve a mandar (una vez)");
await enviar();
// Sin historial: costo anterior «sin dato». Y si era la única de una «solo proveedor», la herramienta queda oculta (#7, pasó el tope).
await db.exec("update sop_proveedor.producto_config set tope_costo_usd = 0.4 where herramienta = 'phoenix'");
await vigilar();
const a2c = await viva("costo_subio", "phoenix|667");
ok(a2c && a2c.datos.costo_anterior === null && a2c.texto.includes("sin dato"), "#2: sin pedidos de esa opción → costo anterior «sin dato»", a2c?.texto);
let o7 = await viva("herramienta_oculta", "phoenix");
ok(o7 && o7.datos.motivo === "paso_el_tope" && o7.texto.startsWith("Phoenix Key quedó oculta: pasó el tope (US$ 0.40)"), "#2/#7: era la única → Phoenix oculta por «pasó el tope»", o7?.texto);
await db.exec("update sop_proveedor.producto_config set tope_costo_usd = null where herramienta = 'phoenix'");
await vigilar();
ok(await resuelta(a2c.id) && await resuelta(o7.id), "#2/#7: sin tope → las dos se resuelven solas");
await db.exec("update sop_proveedor.producto_config set tope_costo_usd = 3 where herramienta = 'griffin'");
await vigilar();
ok(await resuelta(a2.id), "#2: Admin sube el tope a 3 → se resuelve sola");
await enviar();

// ════════ #3 · El proveedor quitó una opción
await sync(["648"]); await vigilar();
let a3 = await viva("opcion_quitada", "648");
ok(a3 && JSON.stringify(a3.datos.herramientas) === '["unlock_tool"]' && a3.datos.sin_otra_opcion.length === 0 && a3.texto.includes("Siguen con otra opción")
   && a3.texto.includes("n.º 648") && a3.para === "admin", "#3: la 648 no vino → alerta a Admin (Unlock sigue con la 556)", a3);
await vigilar(); await vigilar();
ok((await cuenta("opcion_quitada")) === 1, "#3: no se duplica");
ok((await porEnviar()).filter((x) => x === Number(a3.id)).length === 1, "#3: Telegram una vez"); await enviar();
ok(!(await porEnviar()).includes(Number(a3.id)), "#3: enviada → no se repite");
// Apagada por el sistema (#6 rechazos / #8 cobro distinto): sí vino en el catálogo → NO es «quitada».
await db.exec("update sop_proveedor.opcion set activa = false, actualizado_en = now() where numero_servicio = '556'");
await vigilar();
ok((await cuenta("opcion_quitada", "556")) === 0, "#3: la que apagó el sistema (rechazos/cobro distinto) no cuenta como quitada");
ok((await cuenta("herramienta_oculta", "unlock_tool")) === 0, "#7: Unlock (modo respaldo, tiene cuentas propias) no se marca oculta");
await db.exec("update sop_proveedor.opcion set activa = true where numero_servicio = '556'");
await sync(); await vigilar();
ok(await resuelta(a3.id), "#3: vuelve al catálogo → se resuelve sola");
// La única opción de una «solo proveedor»: #3 dice que se quedó sin otra, y #7 la marca oculta.
await sync(["667"]); await vigilar();
const a3b = await viva("opcion_quitada", "667");
ok(a3b && JSON.stringify(a3b.datos.sin_otra_opcion) === '["phoenix"]' && a3b.texto.includes("Sin otra opción: Phoenix Key"), "#3: era la única → «Sin otra opción: Phoenix Key»", a3b?.texto);
o7 = await viva("herramienta_oculta", "phoenix");
ok(o7 && o7.datos.motivo === "proveedor_no_la_tiene" && o7.texto.includes("Phoenix Key quedó oculta: el proveedor no la tiene") && o7.texto.includes("Desde el")
   && o7.texto.includes("hora de Perú") && o7.datos.desde, "#7: cuál, por qué y desde cuándo", o7?.texto);
await enviar();
// Una opción enlazada a dos herramientas (una pausada a mano).
await sync(["667", "668"]); await vigilar();
const a3c = await viva("opcion_quitada", "668");
ok(a3c && JSON.stringify(a3c.datos.herramientas) === '["pausada","samsung"]', "#3: lista todas las herramientas enlazadas", a3c?.datos);
let o7s = await viva("herramienta_oculta", "samsung");
ok(o7s && o7s.datos.motivo === "proveedor_no_la_tiene", "#7: Samsung oculta (el proveedor no la tiene)");
ok((await cuenta("herramienta_oculta", "pausada")) === 0, "#7: la pausada a mano no avisa (la pausó Admin)");
await enviar();
const desdeS = o7s.datos.desde;
await db.exec("update sop_proveedor.enlace set activo = false where numero_servicio = '668'");          // Admin apaga los enlaces
await vigilar();
ok(await resuelta(a3c.id), "#3: sin enlaces encendidos a esa opción → se resuelve");
o7s = await viva("herramienta_oculta", "samsung");
ok(o7s && o7s.datos.motivo === "sin_opcion_encendida" && o7s.datos.desde === desdeS && o7s.texto.includes("sin opción encendida"),
  "#7: cambió el motivo → la misma alerta, motivo «sin opción encendida» (V4.5) y el mismo «desde»", o7s?.datos);
ok((await porEnviar()).includes(Number(o7s.id)), "#7: cambió el motivo → Telegram la vuelve a mandar"); await enviar();
await vigilar();
ok(!(await porEnviar()).includes(Number(o7s.id)), "#7: y no otra vez si nada cambió");
await db.exec("update sop_proveedor.enlace set activo = true where numero_servicio = '668'");
await sync(); await vigilar();
ok(await resuelta(a3b.id) && await resuelta(o7.id) && await resuelta(o7s.id), "#3/#7: todo vuelve al catálogo → se resuelven solas");
await enviar();

// ════════ #7 · por proveedor: sin saldo / proveedor caído (una sola alerta con la lista)
await db.query("select sop_proveedor.saldo_registrar('pkgsmhub', 0.1, 'usd', true, null)");
ok((await uno("select sop_proveedor.saldo_nivel('pkgsmhub') r")).r.nivel === "agotado", "saldo 0.10 → agotado (función real de compra.sql)");
await vigilar(); await vigilar();
let og = await viva("herramienta_oculta", "*sin_saldo");
ok(og && JSON.stringify(og.datos.herramientas) === '["griffin","phoenix","samsung"]' && og.texto.startsWith("Se ocultaron 3 herramientas «solo proveedor» por falta de saldo")
   && og.texto.includes("Griffin Unlocker, Phoenix Key, Samsungtool.us") && og.texto.includes("Vuelven solas al recargar"),
  "#7: saldo agotado → UNA alerta con las 3 «solo proveedor» a la venta (sin la pausada)", og?.texto);
ok((await cuenta("herramienta_oculta")) === 1, "#7: no una por herramienta ni duplicada");
ok((await porEnviar()).filter((x) => x === Number(og.id)).length === 1, "#7: Telegram una vez"); await enviar();
await db.exec(`insert into sop_alquiler.herramienta (clave, nombre, horas) values ('nueva','Nueva Tool',24);
  insert into sop_proveedor.producto_config (herramienta, modo) values ('nueva','solo_proveedor');
  insert into sop_proveedor.enlace (herramienta, proveedor_clave, numero_servicio, horas) values ('nueva','pkgsmhub','650',24);`);
await vigilar();
const og2 = await viva("herramienta_oculta", "*sin_saldo");
ok(og2.id === og.id && og2.datos.herramientas.length === 4 && og2.datos.desde === og.datos.desde && og2.envios === 1, "#7: se suma una herramienta → la misma alerta corrige la lista", og2.datos);
ok(!(await porEnviar()).includes(Number(og.id)), "#7: y no vuelve a mandar Telegram por eso");
await db.query("select sop_proveedor.saldo_registrar('pkgsmhub', 100, 'usd', true, null)");
ok((await uno("select sop_proveedor.saldo_nivel('pkgsmhub') r")).r.nivel === "verde", "recarga → verde");
await vigilar();
ok(await resuelta(og.id), "#7: al recargar se resuelve sola");
for (let i = 0; i < 3; i++) await db.query("select sop_proveedor.conector_resultado('pkgsmhub', false, 'sin_respuesta')");
await vigilar();
const oc = await viva("herramienta_oculta", "*proveedor_caido");
ok(oc && oc.texto.includes("porque el proveedor no responde") && oc.texto.includes("Vuelven solas cuando responda") && (await cuenta("herramienta_oculta", "*sin_saldo")) === 0,
  "#7: 3 fallos (proveedor caído) → alerta con la lista", oc?.texto);
await db.query("select sop_proveedor.conector_resultado('pkgsmhub', true, null)");
await vigilar();
ok(await resuelta(oc.id), "#7: el proveedor responde → se resuelve sola");
// Pausada a mano mientras estaba oculta sola → la alerta se cierra (ya no se ocultó sola).
await sync(["667"]); await vigilar();
const op = await viva("herramienta_oculta", "phoenix");
await db.exec("update sop_alquiler.herramienta set visible = false where clave = 'phoenix'");
await vigilar();
ok(op && await resuelta(op.id), "#7: Admin la pausa a mano → la alerta se cierra");
await db.exec("update sop_alquiler.herramienta set visible = true where clave = 'phoenix'");
await vigilar();
const op2 = await viva("herramienta_oculta", "phoenix");
ok(op2 && op2.id !== op.id && op2.datos.motivo === "proveedor_no_la_tiene", "#7: la reactiva y sigue sin opción → avisa de nuevo con el otro motivo (V2.2)");
await sync(); await vigilar(); await enviar();

// ════════ #11 · Ganancia baja: un resumen por día
const AYER = "((now() at time zone 'America/Lima')::date - 1 + time '12:00') at time zone 'America/Lima'";
const HOY = "now()";
const dia = (await uno("select ((now() at time zone 'America/Lima')::date - 1)::text d, to_char((now() at time zone 'America/Lima')::date - 1, 'DD/MM') dm"));
await alquilarYPedir("griffin", "1091", 2.5, 3.0, "entregado", AYER);        // deja 0.50  → baja
await alquilarYPedir("griffin", "650", 2.0, 3.5, "entregado", AYER);         // deja 1.50
await alquilarYPedir("unlock_tool", "556", 0.39, 1.0, "entregado", AYER);    // deja 0.61  → baja
await alquilarYPedir("phoenix", "667", 0.42, 1.42, "entregado", AYER);       // deja 1.00 (igual, no menos)
await alquilarYPedir("unlock_tool", "556", 0.39, 0.5, "entregado", HOY);     // hoy: va en el resumen de mañana
await alquilarYPedir("unlock_tool", "556", 0.39, 0.4, "en_duda", AYER);      // no entregado: no cuenta
await alquilarYPedir("griffin", "650", 2.0, null, "entregado", AYER);        // sin precio cobrado: no cuenta
ok((await uno("select valor from sop_config.ajuste where clave = 'alquiler_ganancia_general'")).valor === "1", "#11: la ganancia general sale de sop_config.ajuste (propuesta de Ari-Master), arranca en 1");
await vigilar();
let g = await viva("ganancia_baja", dia.d);
ok(g && g.datos.alquileres === 2 && Number(g.datos.minimo) === 1 && g.datos.herramientas.map((x) => x.herramienta).join() === "griffin,unlock_tool"
   && Number(g.datos.herramientas[0].ganancia_min) === 0.5, "#11: resumen de ayer con las 2 que dejaron menos de US$ 1.00", g?.datos);
ok(g && g.texto.startsWith(`Ganancia baja el ${dia.dm}: 2 alquileres`) && g.texto.includes("Griffin Unlocker: 1 (US$ 0.50)") && g.texto.includes("Unlock Tool: 1 (US$ 0.61)")
   && g.texto.includes("(US$ 1.00)") && g.para === "admin", "#11: el texto lo dice", g?.texto);
await vigilar(); await vigilar();
ok((await uno("select count(*)::int n from sop_proveedor.alerta where tipo = 'ganancia_baja'")).n === 1, "#11: una sola por día aunque la vuelta corra cada 30 s");
ok((await porEnviar()).filter((x) => x === Number(g.id)).length === 1, "#11: Telegram una vez"); await enviar();
await vigilar();
ok(!(await porEnviar()).includes(Number(g.id)), "#11: y no se repite ese día");
// Llega el día siguiente (se simula corriendo la causa un día para atrás): el resumen nuevo cierra el anterior.
const correrDia = (id) => db.query("update sop_proveedor.alerta set causa = (causa::date - 1)::text where id = $1", [id]);
await correrDia(g.id); await vigilar();
let g2 = await viva("ganancia_baja", dia.d);
ok(g2 && g2.id !== g.id && await resuelta(g.id) && (await cuenta("ganancia_baja")) === 1, "#11: al día siguiente sale el resumen nuevo y el anterior se resuelve");
ok((await porEnviar()).includes(Number(g2.id)), "#11: el resumen nuevo sale por Telegram (una vez por día)"); await enviar();
// El mínimo es la ganancia general: si Admin la cambia, cambia el corte.
await db.exec("update sop_config.ajuste set valor = '0.55' where clave = 'alquiler_ganancia_general'");
await correrDia(g2.id); await vigilar();
const g3 = await viva("ganancia_baja", dia.d);
ok(g3 && g3.datos.alquileres === 1 && Number(g3.datos.minimo) === 0.55 && g3.datos.herramientas[0].herramienta === "griffin", "#11: ganancia general 0.55 → solo la de 0.50", g3?.datos);
await db.exec("delete from sop_config.ajuste where clave = 'alquiler_ganancia_general'");
await correrDia(g3.id); await vigilar();
const g4 = await viva("ganancia_baja", dia.d);
ok(g4 && Number(g4.datos.minimo) === 1 && g4.datos.alquileres === 2, "#11: sin ganancia general cargada → 1, como precio_automatico", g4?.datos);
// Un día sin ganancia baja: se resuelve el anterior y no se abre nada.
await db.exec("update sop_proveedor.pedido set precio_cobrado = costo_esperado + 2 where estado = 'entregado' and precio_cobrado is not null");
await correrDia(g4.id); await vigilar(); await vigilar();
ok(await resuelta(g4.id) && (await cuenta("ganancia_baja")) === 0, "#11: día sin ganancia baja → no hay resumen y el anterior se resuelve");

// ---- Nada de lo de antes cambió: alertas_por_enviar es la de compra.sql (no se tocó) y las 4 son para Admin.
ok((await uno(`select count(*)::int n from sop_proveedor.alerta where tipo = any($1) and (para <> 'admin' or urgencia <> 5)`, [TIPOS])).n === 0, "las 4 van a Admin con urgencia 5");
ok(!/function\s+sop_proveedor\.alertas_por_enviar/i.test(extra),"alertas-extra no reescribe alertas_por_enviar (se mantiene igual que en prod)");

console.log(fallas === 0 ? `\nTODO OK (${total}/${total})` : `\n${fallas} FALLAS de ${total}`);
process.exit(fallas ? 1 : 0);
