// Avisos por Telegram para Admin (W4 · V7.1). Ari-Web, 18-nov-2026.
// Bot propio de AriTool: secreto PROV_TELEGRAM_TOKEN. Admin toca «Conectar» en el panel, ve un código y se lo escribe al bot;
// la vuelta del cron lee getUpdates y guarda ese chat (sop_proveedor.telegram). Mientras ese bot no exista, los avisos salen
// por el bot de avisos que ya existe (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID, el de FRP), sin conectar nada.
import type { Avisos, Rpc } from "./ciclo.ts";

const API = "https://api.telegram.org/bot";

async function mandar(token: string, chat: string, texto: string): Promise<boolean> {
  try {
    const r = await fetch(`${API}${token}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({ chat_id: chat, text: texto.slice(0, 3500), disable_web_page_preview: true }),
    });
    return r.ok;
  } catch { return false; }
}

// Lee los mensajes nuevos del bot: si alguien escribió el código vigente, ese chat queda conectado.
export async function vincular(rpc: Rpc, token: string): Promise<string> {
  const { data } = await rpc("telegram_leer", {});
  const t = data as { offset: number; codigo: string | null } | null;
  if (!t || !t.codigo) return "sin_codigo";
  let ups: { update_id: number; message?: { text?: string; chat?: { id?: number | string; type?: string } } }[] = [];
  try {
    const r = await fetch(`${API}${token}/getUpdates?timeout=0&offset=${Number(t.offset) + 1}&allowed_updates=%5B%22message%22%5D`,
      { signal: AbortSignal.timeout(10_000) });
    const j = await r.json() as { ok?: boolean; result?: typeof ups };
    if (!j.ok) return "telegram_error";
    ups = j.result ?? [];
  } catch { return "telegram_sin_respuesta"; }
  let max = Number(t.offset), chat: string | null = null;
  // Gana el PRIMER chat privado que mandó el código (no el último, así no se lo puede pisar alguien que lo vio después).
  for (const u of ups) {
    max = Math.max(max, u.update_id);
    if (!chat && (u.message?.text ?? "").trim() === t.codigo && u.message?.chat?.type === "private" && u.message?.chat?.id !== undefined) {
      chat = String(u.message.chat.id);
    }
  }
  await rpc("telegram_guardar", { p_offset: max, p_chat_id: chat });
  if (chat) await mandar(token, chat, "Listo: los avisos de AriTool · Alquiler llegan a este chat.");
  return chat ? "conectado" : "sin_novedad";
}

// A dónde van los avisos: el chat conectado al bot propio, o el bot de avisos que ya existe.
export async function armarAvisos(rpc: Rpc, env: (k: string) => string | undefined): Promise<Avisos | null> {
  const propio = env("PROV_TELEGRAM_TOKEN") ?? "";
  if (propio) {
    const { data } = await rpc("telegram_leer", {});
    const chat = (data as { chat_id: string | null } | null)?.chat_id;
    if (chat) return { enviar: (t) => mandar(propio, chat, t) };
  }
  const token = env("TELEGRAM_BOT_TOKEN") ?? "", chat = env("TELEGRAM_CHAT_ID") ?? "";
  if (token && chat) return { enviar: (t) => mandar(token, chat, t) };
  return null;
}
