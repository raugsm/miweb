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

// Rol de negocio (dueno/tecnico). Sin rol no hay acceso.
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
