// ¿Lo publicado (BASE) + el delta (DELTA) queda IGUAL que la fuente nueva? Correr: node valida_arreglos.mjs (variables BASE y DELTA)
// ¿«lo publicado + arreglos» queda IGUAL que «la fuente nueva»? Compara funciones y columnas de sop_proveedor.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
const D = (process.env.PROPUESTAS_DIR ?? "C:/private/AriTool_Recursos/db-diagramas/propuestas").replace(/\/?$/, "/");
const leer = (f) => readFileSync(f, "utf8");
async function armar(archivos) {
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
    create function sop_alquiler.descifrar(b bytea) returns text language sql as $$ select convert_from(b, 'UTF8') $$;`);
  for (const f of archivos) await db.exec(leer(f));
  const funcs = (await db.query(`select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' k, regexp_replace(pg_get_functiondef(p.oid), '\s+', ' ', 'g') d,
      coalesce(p.proacl::text, '') acl from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'sop_proveedor' order by 1`)).rows;
  const cols = (await db.query(`select table_name || '.' || column_name || ':' || data_type c from information_schema.columns where table_schema = 'sop_proveedor' order by table_name, ordinal_position`)).rows.map((r) => r.c);
  return { funcs, cols };
}
const comun = [D + "20261118-proveedor-alquiler-base.sql", D + "20261118-proveedor-m1-core.sql"];
const despues = [D + "20261118-proveedor-alertas-extra.sql", D + "20261118-proveedor-oculta-motivo.sql", D + "20261118-proveedor-saldo-v5.sql"];
const BASE = process.env.BASE ?? "20261118-proveedor-compra.publicada-1518Z.sql", DELTA = process.env.DELTA ?? "20261119-proveedor-tope-cuenta-libre.sql";
console.log("base:", BASE, "· delta:", DELTA);
const prodMasArreglos = await armar([...comun, D + BASE, ...despues, D + DELTA]);
const fuente = await armar([...comun, D + "20261118-proveedor-compra.sql", ...despues]);
const a = new Map(prodMasArreglos.funcs.map((f) => [f.k, f.d + "|" + f.acl])), b = new Map(fuente.funcs.map((f) => [f.k, f.d + "|" + f.acl]));
const dif = [...new Set([...a.keys(), ...b.keys()])].filter((k) => a.get(k) !== b.get(k));
const colsIguales = JSON.stringify(prodMasArreglos.cols) === JSON.stringify(fuente.cols);
console.log("funciones:", a.size, "/", b.size, "· distintas:", JSON.stringify(dif), "· columnas iguales:", colsIguales);
process.exit(dif.length || !colsIguales ? 1 : 0);
