// Copiada al repositorio el 18-nov-2026 (antes vivía en el scratchpad de Ari-Web). Correr desde miweb/test/proveedor:
//   npm install  (una vez; solo instala PGlite)  ·  ver LEEME.md
// ¿Un catálogo (security definer) llamado por un TALLER puede usar _oculta_motivo? Antes no (opciones_para tiene compuerta).
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
const D = (process.env.PROPUESTAS_DIR ?? "C:/private/AriTool_Recursos/db-diagramas/propuestas").replace(/\/?$/, "/");
const leer = (f) => readFileSync(D + f, "utf8");
async function armar(conNueva) {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema sop_acceso; create schema auth; create schema sop_comun; create schema sop_alquiler; create schema sop_config;
    create table sop_config.ajuste (clave text primary key, valor text);
    create function sop_acceso.tiene_capacidad(p text) returns boolean language sql stable as $$ select false $$;
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    create table sop_alquiler.herramienta (clave text primary key, nombre text, horas int, visible boolean default true);
    create table sop_alquiler.alquiler (id uuid primary key default gen_random_uuid(), herramienta text, situacion text, pago_situacion text, cuenta_id uuid,
      devolucion_solicitada_en timestamptz, precio_final_usdt numeric, pagado_en timestamptz, estado_registro text, devuelto_en timestamptz, externo boolean, inicio timestamptz, fin_previsto timestamptz);
    create table sop_alquiler.cuenta (id uuid primary key default gen_random_uuid(), herramienta text, usuario text, clave_cif bytea, estado text, externa boolean, alquilada_hasta timestamptz, notas text, estado_registro text default 'activo');
    create table sop_alquiler.evento (id bigserial, cuenta_id uuid, alquiler_id uuid, tipo text, grupo text, detalle jsonb, quien uuid);
    create function sop_alquiler.cifrar(t text) returns bytea language sql as $$ select convert_to(t, 'UTF8') $$;
    create function sop_alquiler.descifrar(b bytea) returns text language sql as $$ select convert_from(b, 'UTF8') $$;
    grant usage on schema sop_acceso, auth, sop_alquiler to authenticated;
    grant execute on function sop_acceso.tiene_capacidad(text) to authenticated;`);
  for (const f of ["20261118-proveedor-alquiler-base.sql", "20261118-proveedor-m1-core.sql", "20261118-proveedor-compra.sql", "20261118-proveedor-alertas-extra.sql"]) await db.exec(leer(f));
  if (conNueva) await db.exec(leer("20261118-proveedor-oculta-motivo.sql"));
  await db.exec(`insert into sop_proveedor.opcion (proveedor_clave, numero_servicio, nombre, tipo, costo, activa) values ('pkgsmhub','556','Unlock',  'REMOTE', 0.39, true);
    insert into sop_alquiler.herramienta (clave, nombre, horas) values ('unlocktool','Unlock Tool',6), ('sinenlace','Sin enlace',6);
    insert into sop_proveedor.enlace (herramienta, proveedor_clave, numero_servicio, horas) values ('unlocktool','pkgsmhub','556',6);
    create function sop_alquiler.catalogo_prueba() returns jsonb language sql security definer as
      $$ select jsonb_object_agg(clave, coalesce(sop_proveedor._oculta_motivo(clave), 'se_puede')) from sop_alquiler.herramienta $$;
    grant execute on function sop_alquiler.catalogo_prueba() to authenticated;`);
  await db.exec(`select set_config('request.jwt.claims', '{"role":"authenticated"}', false); set role authenticated;`);
  try { return (await db.query("select sop_alquiler.catalogo_prueba() r")).rows[0].r; } catch (e) { return "ERROR: " + e.message; }
}
const vieja = await armar(false), nueva = await armar(true);
console.log("versión publicada:", JSON.stringify(vieja));
console.log("versión nueva    :", JSON.stringify(nueva));
const ok = typeof nueva === "object" && nueva.unlocktool === "se_puede" && nueva.sinenlace === "sin_opcion_encendida";
console.log(ok ? "TODO OK" : "FALLA");
process.exit(ok ? 0 : 1);
