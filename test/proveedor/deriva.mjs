// Uso: DERIVA_DIR=<carpeta con los .sql> DERIVA_OUT=<salida.json> node deriva.mjs  → después: python deriva_cmp.py <ruta sql_api.py> <salida.json>
// Deriva: texto canónico (pg_get_functiondef) y columnas de lo de Ari-Web, aplicando los archivos en orden sobre PGlite.
// Salida: DERIVA_OUT (por defecto deriva.json), para comparar con lo mismo leído de producción.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, writeFileSync } from "node:fs";
const D = (process.env.DERIVA_DIR ?? "C:/private/AriTool_Recursos/db-diagramas/propuestas").replace(/\/?$/, "/");
const MIOS = ["20261118-proveedor-compra.sql", "20261118-proveedor-alertas-extra.sql", "20261118-proveedor-oculta-motivo.sql", "20261118-proveedor-saldo-v5.sql"];
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role;
  create schema sop_acceso; create schema auth; create schema sop_comun; create schema sop_alquiler; create schema sop_config;
  create table sop_config.ajuste (clave text primary key, valor text);
  create function sop_acceso.tiene_capacidad(p text) returns boolean language sql stable as $$ select false $$;
  create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
  create table sop_alquiler.herramienta (clave text primary key, nombre text, horas int, visible boolean default true);
  create table sop_alquiler.alquiler (id uuid primary key default gen_random_uuid(), herramienta text, situacion text, pago_situacion text, cuenta_id uuid,
    devolucion_solicitada_en timestamptz, precio_final_usdt numeric, pagado_en timestamptz, estado_registro text, devuelto_en timestamptz, externo boolean, inicio timestamptz, fin_previsto timestamptz);
  create table sop_alquiler.cuenta (id uuid primary key default gen_random_uuid(), herramienta text, usuario text, clave_cif bytea, estado text, externa boolean, alquilada_hasta timestamptz, notas text);
  create table sop_alquiler.evento (id bigserial, cuenta_id uuid, alquiler_id uuid, tipo text, grupo text, detalle jsonb, quien uuid);
  create function sop_alquiler.cifrar(t text) returns bytea language sql as $$ select convert_to(t, 'UTF8') $$;
  create function sop_alquiler.descifrar(b bytea) returns text language sql as $$ select convert_from(b, 'UTF8') $$;`);
for (const f of ["20261118-proveedor-alquiler-base.sql", "20261118-proveedor-m1-core.sql", ...MIOS]) await db.exec(readFileSync(D + f, "utf8"));
const nombres = [...new Set(MIOS.flatMap((f) => [...readFileSync(D + f, "utf8").matchAll(/create or replace function sop_proveedor\.(\w+)/g)].map((m) => m[1])))].sort();
const funcs = (await db.query(`select p.proname as f, pg_get_function_identity_arguments(p.oid) as args, pg_get_functiondef(p.oid) as def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'sop_proveedor' and p.proname = any($1) order by 1, 2`, [nombres])).rows;
const cols = (await db.query(`select table_name as t, string_agg(column_name || ':' || data_type, ',' order by ordinal_position) as c
  from information_schema.columns where table_schema = 'sop_proveedor' and table_name in ('pedido','pedido_evento','conector','alerta','telegram') group by 1 order by 1`)).rows;
writeFileSync(process.env.DERIVA_OUT ?? "deriva.json", JSON.stringify({ nombres, funcs, cols }));
console.log("funciones:", funcs.length, "de", nombres.length, "· tablas:", cols.length);
