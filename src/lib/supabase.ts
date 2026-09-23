import { createClient } from "@supabase/supabase-js"

// Datos públicos del proyecto (clave publicable, no secreta).
export const SUPABASE_URL = "https://sdarsjdwnuimjruthjwz.supabase.co"
export const SUPABASE_KEY = "sb_publishable_XVMUL7TMS7SjAtKV42Hn6g_Bpksm3Ux"

// Cliente público de la web: la sesión se guarda local y se refresca sola.
// El dashboard habla con las Edge Functions usando el JWT del usuario.
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
