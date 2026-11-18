// Ciclo del conector de compra (W2 pedir · W3 seguir · W4 alertas · W5 retomar). Ari-Web, 18-nov-2026.
// Sin Deno ni red directa: recibe la base (rpc) y el proveedor (api) por parámetro, así se prueba en Node contra PGlite
// y el proveedor simulado, y en la edge con supabase-js y fetch. Las reglas de plata viven en SQL (20261118-proveedor-compra.sql);
// acá solo se ordena el trabajo y se habla con el proveedor UNA vez por pedido.
import { leerCuenta, type Saldo } from "./gsm_theme.ts";

export type Rpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;

// Lo que contestó el proveedor a una llamada. «falla» = no se sabe (corte, tiempo, respuesta rara): nunca se reintenta un pedido.
export type Falla = { falla: "sin_respuesta" | "sin_conexion" | "respuesta_rara" | "llave"; mensaje: string };
export type RespuestaPedido = { aceptado: true; referencia: string; mensaje: string } | { rechazado: true; mensaje: string; llave: boolean } | Falla;
export type EstadoPedido = { status: number; code: string | null };

export interface Api {
  saldo(): Promise<Saldo | Falla>;
  pedir(numeroServicio: string): Promise<RespuestaPedido>;
  estados(referencias: string[]): Promise<Map<string, EstadoPedido> | Falla>;
}
export interface Avisos { enviar(texto: string): Promise<boolean>; }

const esFalla = (x: unknown): x is Falla => typeof x === "object" && x !== null && "falla" in x;

async function llamar<T = unknown>(rpc: Rpc, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

// Saldo fresco ANTES de pedir (regla 3): lo registra, informa la salud del proveedor y recalcula el nivel. null = no respondió.
async function saldoFresco(rpc: Rpc, api: Api, proveedor: string): Promise<number | null> {
  const s = await api.saldo();
  if (esFalla(s) || s.monto === null) {
    await llamar(rpc, "conector_resultado", { p_proveedor: proveedor, p_ok: false, p_tipo: esFalla(s) ? s.falla : "respuesta_rara" });
    return null;
  }
  await llamar(rpc, "saldo_registrar", { p_proveedor: proveedor, p_saldo: s.monto, p_moneda: s.moneda?.toLowerCase() ?? null, p_ok: true, p_cruda: s.cruda });
  await llamar(rpc, "conector_resultado", { p_proveedor: proveedor, p_ok: true, p_tipo: null });
  await llamar(rpc, "saldo_nivel", { p_proveedor: proveedor });
  return s.monto;
}

// Manda UN pedido «por enviar». Devuelve el estado en que quedó. Nunca reintenta: lo que no se sabe queda «en duda».
export async function enviarUno(rpc: Rpc, api: Api, proveedor: string, pedido: string): Promise<string> {
  const antes = await saldoFresco(rpc, api, proveedor);
  if (antes === null) return "por_enviar";                                     // fila 17: si no responde el saldo, no se pide
  const prep = await llamar<{ ok: boolean; motivo?: string; numero_servicio?: string; costo?: number; espera?: boolean }>(rpc, "pedido_preparar", { p_pedido: pedido });
  if (!prep.ok) return prep.motivo === "ya_no_esta_por_enviar" ? "ya_tomado" : prep.motivo === "ocupado" ? "ocupado" : prep.espera ? "espera" : "omitido";
  // Desde acá el pedido está «enviando» en la base: si este proceso muere, W5 lo pasa a «en duda».
  let r: RespuestaPedido;
  try { r = await api.pedir(prep.numero_servicio!); } catch (e) { r = { falla: "sin_respuesta", mensaje: String((e as Error)?.message ?? e) }; }
  if ("aceptado" in r) {
    // Si la base falla justo acá, el pedido queda «enviando» y W5 lo pasa a «en duda»: el número tiene que quedar en el registro.
    let g: { ok: boolean; estado?: string };
    try { g = await llamar(rpc, "pedido_respuesta", { p_pedido: pedido, p_tipo: "aceptado", p_referencia: r.referencia, p_mensaje: r.mensaje }); }
    catch (e) { throw new Error(`pedido ${pedido} ACEPTADO con número ${r.referencia} pero no se pudo guardar: ${String((e as Error)?.message ?? e)}`); }
    if (!g.ok) console.error("pedido aceptado que la base no tomó", pedido, "referencia", r.referencia, g.estado);
    await llamar(rpc, "conector_pedido_resultado", { p_proveedor: proveedor, p_claro: true });
    await llamar(rpc, "conector_resultado", { p_proveedor: proveedor, p_ok: true, p_tipo: null });
    // Saldo después, para comparar con lo esperado (068). Si no responde, no pasa nada.
    const d = await api.saldo().catch(() => null);
    if (d && !esFalla(d) && d.monto !== null) {
      await llamar(rpc, "saldo_registrar", { p_proveedor: proveedor, p_saldo: d.monto, p_moneda: d.moneda?.toLowerCase() ?? null, p_ok: true, p_cruda: d.cruda });
      await llamar(rpc, "pedido_saldo_despues", { p_pedido: pedido, p_saldo: d.monto });
    }
    return "en_proceso";
  }
  if ("rechazado" in r) {
    if (r.llave) await llamar(rpc, "conector_resultado", { p_proveedor: proveedor, p_ok: false, p_tipo: "llave" });
    // Doble control: el proveedor puede contestar ERROR después de cobrar. Solo es rechazo limpio si el saldo quedó IGUAL
    // (±0.005). Si bajó, subió (otra devolución en el medio) o no se puede mirar: «en duda», sin probar la siguiente.
    const d = await api.saldo().catch(() => null);
    const mov = d && !esFalla(d) && d.monto !== null ? antes - d.monto : null;
    if (mov === null || Math.abs(mov) > 0.005) {
      await llamar(rpc, "pedido_respuesta", { p_pedido: pedido, p_tipo: "sin_respuesta", p_referencia: null,
        p_mensaje: `error del proveedor y ${mov === null ? "no se pudo mirar el saldo" : "el saldo se movió " + mov.toFixed(4)}: ${r.mensaje}` });
      await llamar(rpc, "conector_pedido_resultado", { p_proveedor: proveedor, p_claro: false });
      return "en_duda";
    }
    await llamar(rpc, "pedido_respuesta", { p_pedido: pedido, p_tipo: "rechazado", p_referencia: null, p_mensaje: r.mensaje });
    await llamar(rpc, "conector_pedido_resultado", { p_proveedor: proveedor, p_claro: true });
    return "rechazado";
  }
  await llamar(rpc, "pedido_respuesta", { p_pedido: pedido, p_tipo: "sin_respuesta", p_referencia: null, p_mensaje: `${r.falla}: ${r.mensaje}` });
  await llamar(rpc, "conector_pedido_resultado", { p_proveedor: proveedor, p_claro: false });
  await llamar(rpc, "conector_resultado", { p_proveedor: proveedor, p_ok: false, p_tipo: r.falla });
  return "en_duda";
}

// Sigue todos los pedidos en curso en grupos de 50 (p17 #1) y entrega los listos en el acto (064).
export async function seguir(rpc: Rpc, api: Api, proveedor: string): Promise<{ consultados: number; entregados: number; ilegibles: number; rechazados: number }> {
  const filas = await llamar<{ pedido: string; referencia: string }[]>(rpc, "pedidos_a_seguir", { p_proveedor: proveedor });
  const res = { consultados: 0, entregados: 0, ilegibles: 0, rechazados: 0 };
  for (let i = 0; i < filas.length; i += 50) {
    const grupo = filas.slice(i, i + 50);
    const est = await api.estados(grupo.map((f) => f.referencia));
    if (esFalla(est)) {
      await llamar(rpc, "conector_resultado", { p_proveedor: proveedor, p_ok: false, p_tipo: est.falla });
      break;
    }
    await llamar(rpc, "conector_resultado", { p_proveedor: proveedor, p_ok: true, p_tipo: null });
    for (const f of grupo) {
      const e = est.get(f.referencia);
      if (!e) continue;
      res.consultados++;
      try {                                                                       // un pedido con problema no frena a los demás
        const r = await llamar<{ estado: string; verificar_saldo?: boolean }>(rpc, "pedido_estado_proveedor", { p_pedido: f.pedido, p_status: e.status, p_code: e.code });
        if (r.estado === "rechazado") {
          res.rechazados++;
          // M4: en automático, la siguiente opción se pide solo si se ve que el saldo volvió.
          if (r.verificar_saldo) {
            const s = await api.saldo().catch(() => null);
            const monto = s && !esFalla(s) && s.monto !== null ? s.monto : null;
            if (monto !== null) await llamar(rpc, "saldo_registrar", { p_proveedor: proveedor, p_saldo: monto, p_moneda: (s as Saldo).moneda?.toLowerCase() ?? null, p_ok: true, p_cruda: (s as Saldo).cruda });
            await llamar(rpc, "pedido_rechazo_verificado", { p_pedido: f.pedido, p_saldo: monto });
          }
        }
        if (r.estado !== "listo") continue;
        const cuenta = leerCuenta(e.code);
        if (cuenta) {
          const ent = await llamar<{ ok: boolean }>(rpc, "pedido_entregar", { p_pedido: f.pedido, p_usuario: cuenta.usuario, p_clave: cuenta.clave });
          if (ent.ok) res.entregados++;
        } else {
          await llamar(rpc, "pedido_ilegible", { p_pedido: f.pedido, p_texto: e.code ?? "" });   // 065: no se entrega nada
          res.ilegibles++;
        }
      } catch (err) { console.error("seguir", f.pedido, String((err as Error)?.message ?? err).slice(0, 160)); }
    }
  }
  return res;
}

// Alertas por Telegram a Admin: lo nuevo una vez, y lo que se repite cuando toca (la SQL decide qué).
export async function avisar(rpc: Rpc, avisos: Avisos | null, proveedor: string): Promise<number> {
  if (!avisos) return 0;
  const lista = await llamar<{ id: number; texto: string }[]>(rpc, "alertas_por_enviar", { p_proveedor: proveedor });
  let n = 0;
  // Cada aviso se marca apenas sale: si la vuelta se corta a mitad, no se repite lo ya mandado.
  for (const a of lista) if (await avisos.enviar("AriTool · Alquiler: " + a.texto)) { await llamar(rpc, "alertas_enviadas", { p_ids: [a.id] }); n++; }
  return n;
}

// Una vuelta completa del cron (cada 30 s). Cada paso va aislado: si uno falla, los demás corren igual y los avisos salen
// siempre. maxEnvios y presupuestoMs: frenos propios para que la vuelta termine mucho antes del límite de la edge (p17 #2):
// no se EMPIEZA un pedido nuevo pasado el presupuesto (uno empezado puede tardar hasta 40 s más).
export async function vuelta(rpc: Rpc, api: Api, avisos: Avisos | null, proveedor: string, maxEnvios = 3, presupuestoMs = 45_000) {
  const t0 = Date.now();
  const out: Record<string, unknown> = {};
  const errores: string[] = [];
  const paso = async (nombre: string, f: () => Promise<unknown>) => {
    try { out[nombre] = await f(); } catch (e) { errores.push(`${nombre}: ${String((e as Error)?.message ?? e).slice(0, 160)}`); }
  };
  await paso("recuperar", () => llamar(rpc, "pedidos_recuperar", { p_proveedor: proveedor }));          // W5
  await paso("copia", () => llamar(rpc, "vigilar_copia", { p_proveedor: proveedor }));                  // W1: 6 h
  await paso("nivel", () => llamar(rpc, "saldo_nivel", { p_proveedor: proveedor }));                    // 054, con el último saldo
  await paso("cierres", () => llamar(rpc, "vigilar_cierres", { p_proveedor: proveedor }));              // M8
  // En pausa por proveedor caído: se prueba con el saldo (no gasta) cada 5 minutos (p17 #6) para que se levante sola.
  // La pausa por saldo agotado no necesita sonda: se levanta con el saldo que trae la consulta de cada hora o «Ya recargué».
  let caido = false;
  await paso("sonda", async () => {
    const con = await llamar<{ pausa_motivo: string | null; ultimo_fallo_en: string | null } | null>(rpc, "conector_ver", { p_proveedor: proveedor });
    if (con?.pausa_motivo !== "proveedor_caido") return null;
    const espera = con.ultimo_fallo_en ? Date.now() - Date.parse(con.ultimo_fallo_en) : Infinity;
    if (espera <= 5 * 60_000) { caido = true; return "esperando_5_min"; }
    const s = await saldoFresco(rpc, api, proveedor);
    caido = s === null;
    return s;
  });
  await paso("auto", () => llamar(rpc, "pedidos_auto_crear", { p_proveedor: proveedor }));              // W2
  await paso("enviados", async () => {
    if (caido) return "proveedor_caido";                // m13: con el proveedor caído no se manda nada (ni se pregunta el saldo cada 30 s)
    const pend = await llamar<{ pedido: string }[]>(rpc, "pedidos_por_enviar", { p_proveedor: proveedor });
    const enviados: string[] = [];
    for (const p of pend.slice(0, maxEnvios)) {
      if (Date.now() - t0 > presupuestoMs) break;
      let e: string;
      try { e = await enviarUno(rpc, api, proveedor, p.pedido); } catch (err) { errores.push(`enviar ${p.pedido}: ${String((err as Error)?.message ?? err).slice(0, 160)}`); continue; }
      enviados.push(e);
      if (e === "por_enviar" || e === "ocupado" || e === "espera") break;                     // saldo sin respuesta, otro en vuelo o pausa
    }
    return enviados;
  });
  await paso("seguir", () => seguir(rpc, api, proveedor));                                         // W3
  await paso("tardando", () => llamar(rpc, "vigilar_tardando", { p_proveedor: proveedor }));
  // p13 #2, #3, #7 y #11. La #7 («quedó oculta») va desde que Ari-Master aplicó la ocultación automática (053, 18-nov).
  await paso("alertas_extra", () => llamar(rpc, "vigilar_alertas_extra", { p_proveedor: proveedor, p_con_ocultas: true }));
  await paso("avisos", () => avisar(rpc, avisos, proveedor));                                      // W4: siempre
  if (errores.length) { out.errores = errores; console.error("proveedor_pedidos vuelta", errores.join(" | ")); }
  out.ms = Date.now() - t0;
  return out;
}
