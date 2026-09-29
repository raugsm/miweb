// Puerta de seguridad compartida para las Edge Functions de PAGO.
// Copia del patron de Ariad (_shared/seguridad.ts): sin secretos en codigo.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-ariad-firma, x-ariad-device",
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
