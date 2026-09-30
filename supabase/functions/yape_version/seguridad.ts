import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-ariad-firma, x-ariad-device",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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
