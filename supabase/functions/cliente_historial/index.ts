// cliente_historial (sesión): todo el historial del cliente, de a 20, para "Tu historial" (W12b) de la web.
// PROPUESTA 2026-11-05, SIN DESPLEGAR: espera OK de Peter. Solo LEE; no toca saldo ni pedidos.
//
// `cliente_resumen` entrega nada más que los últimos 20 movimientos. Esta función pagina con un cursor
// (la fecha de la última fila entregada) y filtra por tipo y por período del lado del servidor.
//
// POST { filtro?, dias?, antes? } + JWT
//   filtro: "todo" (por defecto) | "recargas" | "usos" | "devoluciones"
//   dias:   1..366 → solo los últimos N días; sin él, desde el inicio
//   antes:  cursor `siguiente` de la página anterior; sin él, la primera página
// → 200 { movimientos, trabajos, hay_mas, siguiente }
//   movimientos: misma forma que en cliente_resumen v19 (con pedido y detalle)
//   trabajos:    SOLO procesos hechos con licencia (no mueven saldo), con `saldo_centavos` = saldo en ese momento
//   Entre los dos suman como mucho 20 filas; la web las ordena juntas por fecha.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { admin, CORS, exigirSesion, resp } from "../_shared/seguridad.ts";
import { factorUnidad } from "../_shared/unidad.ts";

const PAGINA = 20;
const TIPOS: Record<string, string[]> = { recargas: ["recarga"], usos: ["consumo"], devoluciones: ["devolucion"] };
const PEDIDO = /AT-\d{6}-\d+/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// El cursor vuelve tal cual lo entregó la base (con microsegundos): no se pasa por Date para no perder precisión.
const FECHA = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d{1,6})?(Z|[+-]\d\d:\d\d)$/;

type Mov = { tipo: string; cantidad: number; saldo_despues: number; motivo: string; referencia: string; servicio: string | null; fecha_registro: string };
type Trab = { folio: string; estado: string; fecha_inicio: string; equipo_ref: string };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const s = await exigirSesion(req);
    const db = admin();
    const cuerpo = await req.json().catch(() => ({})) as { filtro?: unknown; dias?: unknown; antes?: unknown };
    const filtro = typeof cuerpo.filtro === "string" && cuerpo.filtro in TIPOS ? cuerpo.filtro : "todo";
    const dias = typeof cuerpo.dias === "number" && Number.isInteger(cuerpo.dias) && cuerpo.dias >= 1 && cuerpo.dias <= 366 ? cuerpo.dias : null;
    const antes = typeof cuerpo.antes === "string" && FECHA.test(cuerpo.antes) ? cuerpo.antes : null;
    const desde = dias ? new Date(Date.now() - dias * 86_400_000).toISOString() : null;

    const factor = await factorUnidad(db);
    const aCentavos = (base: number) => factor === 100 ? base : base * 100;

    // Movimientos del saldo. Se pide uno de más para saber si hay otra página.
    let qm = db.schema("negocio").from("credito_movimiento")
      .select("tipo,cantidad,saldo_despues,motivo,referencia,servicio,fecha_registro")
      .eq("usuario_ref", s.usuario).order("fecha_registro", { ascending: false }).limit(PAGINA + 1);
    if (filtro !== "todo") qm = qm.in("tipo", TIPOS[filtro]);
    if (antes) qm = qm.lt("fecha_registro", antes);
    if (desde) qm = qm.gte("fecha_registro", desde);
    const { data: mv, error: eMv } = await qm;
    if (eMv) throw new Error(`movimientos: ${eMv.message}`);
    const movs = (mv ?? []) as Mov[];

    // Procesos hechos con licencia: son "usos" que no mueven saldo, así que no están entre los movimientos.
    let trabs: Trab[] = [];
    const modeloDeEquipo: Record<string, string | null> = {};
    if (filtro === "todo" || filtro === "usos") {
      const { data: eqs } = await db.schema("operacion")
        .from("equipo_cliente").select("codigo,modelo_ref").eq("usuario_ref", s.usuario).limit(200);
      for (const e of ((eqs ?? []) as { codigo: string; modelo_ref: string | null }[])) modeloDeEquipo[e.codigo] = e.modelo_ref;
      const equipos = Object.keys(modeloDeEquipo);
      if (equipos.length) {
        let qt = db.schema("operacion").from("trabajo_parcheo")
          .select("folio,estado,fecha_inicio,equipo_ref")
          .in("equipo_ref", equipos).not("licencia_ref", "is", null)
          .order("fecha_inicio", { ascending: false }).limit(PAGINA + 1);
        if (antes) qt = qt.lt("fecha_inicio", antes);
        if (desde) qt = qt.gte("fecha_inicio", desde);
        const { data: tr, error: eTr } = await qt;
        if (eTr) throw new Error(`trabajos: ${eTr.message}`);
        trabs = (tr ?? []) as Trab[];
      }
    }

    // Las dos listas juntas, de la más nueva a la más vieja; la página son las primeras 20.
    const juntas = [
      ...movs.map((m) => ({ fecha: m.fecha_registro, m, t: null as Trab | null })),
      ...trabs.map((t) => ({ fecha: t.fecha_inicio, m: null as Mov | null, t })),
    ].sort((a, b) => Date.parse(b.fecha) - Date.parse(a.fecha) || (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));
    const pagina = juntas.slice(0, PAGINA);
    const hay_mas = juntas.length > PAGINA;
    const movsPagina = pagina.map((x) => x.m).filter((m): m is Mov => m !== null);
    const trabsPagina = pagina.map((x) => x.t).filter((t): t is Trab => t !== null);

    // Alquiler: el movimiento guarda el id del alquiler; de ahí salen su número AT, la herramienta y las horas.
    const alquilerDe: Record<string, { pedido: string | null; detalle: string | null }> = {};
    try {
      const ids = [...new Set(movsPagina.filter((m) => m.servicio === "alquiler" && UUID.test(m.referencia ?? "")).map((m) => m.referencia))];
      if (ids.length) {
        const { data: al } = await db.schema("sop_alquiler").from("alquiler").select("id,codigo,herramienta").in("id", ids);
        const { data: hs } = await db.schema("sop_alquiler").from("herramienta").select("clave,nombre,horas");
        const herr: Record<string, { nombre: string; horas: number }> = {};
        for (const h of ((hs ?? []) as { clave: string; nombre: string; horas: number }[])) herr[h.clave] = h;
        for (const a of ((al ?? []) as { id: string; codigo: string | null; herramienta: string }[])) {
          const h = herr[a.herramienta];
          alquilerDe[a.id] = { pedido: a.codigo ?? null, detalle: h ? `${h.nombre} · ${h.horas} h` : null };
        }
      }
    } catch (e) {
      console.error("cliente_historial alquiler", String((e as Error)?.message ?? e));
    }

    const movimientos = movsPagina.map((m) => ({
      ...m,
      cantidad_centavos: aCentavos(m.cantidad), cantidad_usd: Math.round(aCentavos(m.cantidad)) / 100,
      saldo_despues_centavos: aCentavos(m.saldo_despues),
      pedido: (m.referencia ?? "").match(PEDIDO)?.[0] ?? (m.motivo ?? "").match(PEDIDO)?.[0] ?? alquilerDe[m.referencia]?.pedido ?? null,
      detalle: alquilerDe[m.referencia]?.detalle ?? null,
    }));

    // Cada proceso con licencia lleva el saldo de ese momento: el del último movimiento anterior (0 si no hubo).
    const modeloDe: Record<string, string> = {};
    for (const ref of [...new Set(trabsPagina.map((t) => modeloDeEquipo[t.equipo_ref]).filter((x): x is string => !!x))]) {
      const { data: mo } = await db.schema("catalogo").from("modelo").select("codigo_modelo").eq("codigo", ref).maybeSingle();
      modeloDe[ref] = (mo as { codigo_modelo: string } | null)?.codigo_modelo ?? "";
    }
    const trabajos = await Promise.all(trabsPagina.map(async (t) => {
      const { data: previo } = await db.schema("negocio").from("credito_movimiento")
        .select("saldo_despues").eq("usuario_ref", s.usuario).lt("fecha_registro", t.fecha_inicio)
        .order("fecha_registro", { ascending: false }).limit(1).maybeSingle();
      return {
        folio: t.folio, estado: t.estado, fecha: t.fecha_inicio,
        modelo: modeloDe[modeloDeEquipo[t.equipo_ref] ?? ""] ?? "",
        con_licencia: true,
        saldo_centavos: aCentavos((previo as { saldo_despues: number } | null)?.saldo_despues ?? 0),
      };
    }));

    return resp(200, { movimientos, trabajos, hay_mas, siguiente: hay_mas ? pagina[pagina.length - 1].fecha : null });
  } catch (e) {
    const m = (e as Error).message;
    console.error("cliente_historial", m);
    if (m === "rechazo_autorizacion" || m === "sin_sesion" || m === "sesion_invalida") {
      return resp(403, { error: "rechazo_autorizacion" });
    }
    return resp(500, { error: "fallo_interno" });
  }
});
