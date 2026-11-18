// Módulo compartido: puerta de seguridad para todas las Edge de Ariad.
// Sin secretos en código. Todo sale de variables de entorno (Vault/secrets).
// RLS es DENY ALL: solo el cliente service_role toca tablas.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function resp(codigo: number, cuerpo: unknown) {
  return new Response(JSON.stringify(cuerpo), {
    status: codigo,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function env(nombre: string): string {
  const v = Deno.env.get(nombre);
  if (!v) throw new Error(`falta secreto ${nombre}`);
  return v;
}

export function admin() {
  return createClient(env("ARIAD_URL"), env("ARIAD_SVC"));
}

export function anon() {
  return createClient(env("ARIAD_URL"), env("ARIAD_ANON_KEY"));
}

export async function llamante(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("sin_sesion");
  const c = createClient(env("ARIAD_URL"), env("ARIAD_ANON_KEY"), {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await c.auth.getUser();
  if (error || !data.user) throw new Error("sesion_invalida");
  return data.user;
}

export async function rolDe(correo: string): Promise<string | null> {
  const db = admin();
  const { data: cuenta } = await db.schema("seguridad")
    .from("cuenta").select("codigo").eq("correo", correo).maybeSingle();
  if (!cuenta) return null;
  const { data: ut } = await db.schema("negocio")
    .from("usuario_taller").select("codigo")
    .eq("cuenta_ref", (cuenta as { codigo: string }).codigo).maybeSingle();
  if (!ut) return null;
  const { data: ur } = await db.schema("negocio")
    .from("usuario_rol").select("rol_ref")
    .eq("usuario_ref", (ut as { codigo: string }).codigo)
    .eq("estado", "activo").maybeSingle();
  if (!ur) return null;
  const { data: rol } = await db.schema("negocio")
    .from("rol").select("nombre")
    .eq("codigo", (ur as { rol_ref: string }).rol_ref).maybeSingle();
  return (rol as { nombre: string } | null)?.nombre ?? null;
}

export async function exigirDueno(req: Request) {
  const u = await llamante(req);
  const rol = await rolDe(u.email ?? "");
  if (rol !== "dueno") throw new Error("rechazo_autorizacion");
  return u;
}

export function esCorreo(v: unknown): v is string {
  return typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
}

export async function exigirSesion(req: Request) {
  const u = await llamante(req);
  const correo = (u.email ?? "").toLowerCase();
  const db = admin();
  const { data: cuenta } = await db.schema("seguridad")
    .from("cuenta").select("codigo,estado").eq("correo", correo).maybeSingle();
  const c = cuenta as { codigo: string; estado: string } | null;
  if (!c || c.estado !== "activa") throw new Error("rechazo_autorizacion");
  const { data: ut } = await db.schema("negocio")
    .from("usuario_taller").select("codigo").eq("cuenta_ref", c.codigo).maybeSingle();
  if (!ut) throw new Error("rechazo_autorizacion");
  return { auth: u, correo, cuenta: c.codigo, usuario: (ut as { codigo: string }).codigo };
}

export async function licenciaVigente(usuario: string) {
  const db = admin();
  const hoy = new Date().toISOString().slice(0, 10);
  const { data: lic } = await db.schema("negocio")
    .from("licencia").select("codigo,folio,fecha_fin,estado,suscripcion_ref")
    .eq("estado", "vigente").order("fecha_fin", { ascending: false }).limit(10);
  const filas = (lic ?? []) as { codigo: string; folio: string; fecha_fin: string; estado: string; suscripcion_ref: string }[];
  for (const l of filas) {
    const { data: sus } = await db.schema("negocio")
      .from("suscripcion").select("usuario_ref").eq("codigo", l.suscripcion_ref).maybeSingle();
    if ((sus as { usuario_ref: string } | null)?.usuario_ref !== usuario) continue;
    if (l.fecha_fin < hoy) {
      await db.schema("negocio").from("licencia").update({ estado: "vencida" }).eq("codigo", l.codigo);
      continue;
    }
    return l;
  }
  return null;
}

export function ipDe(req: Request): string | null {
  const f = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  return /^[0-9a-fA-F:.]{3,45}$/.test(f) ? f : null;
}

export async function auditarEvento(
  db: ReturnType<typeof admin>,
  req: Request,
  cuentaRef: string | null,
  tipo: string,
  detalle?: unknown,
) {
  try {
    await db.schema("auditoria").from("evento_seguridad").insert({
      cuenta_ref: cuentaRef,
      tipo_evento: tipo,
      detalle: detalle ?? null,
      ip_origen: ipDe(req),
    });
  } catch (_e) { /* best-effort */ }
}

export async function auditarIntento(
  db: ReturnType<typeof admin>,
  req: Request,
  correo: string,
  exito: boolean,
  tipo: string,
  huella: string | null = null,
) {
  try {
    await db.schema("seguridad").from("intento_acceso").insert({
      correo: correo,
      exito: exito,
      tipo_evento: tipo,
      ip_origen: ipDe(req),
      huella_pc: huella,
    });
  } catch (_e) { /* best-effort */ }
}
