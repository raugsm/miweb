// cliente_resumen (sesión): lo que ve el cliente en la web en una sola llamada.
// v2 (2026-10-27, centavos, OK Peter paso 1): `saldo` sigue siendo créditos enteros (lo que Ari-Tool PC muestra) + saldo_centavos
// + saldo_usd; movimientos con cantidad_usd y servicio; totales en créditos (como antes) y en centavos.
// FACTOR sale de negocio.parametro credito_unidad: se puede desplegar antes de migrar.
//
// v19 (PROPUESTA 2026-11-05, SIN DESPLEGAR: espera OK de Peter). Solo AGREGA campos para "Mi cuenta" de la
// web nueva (W12); lo que ya devolvía no cambia, así que la web actual y la app siguen igual:
//   - licencia: null | { estado, fecha_inicio, fecha_fin, pcs }   la licencia anual más nueva del técnico
//   - movimientos[].pedido   el número AT-… del pedido (sale de la referencia, del motivo o del alquiler)
//   - movimientos[].detalle  en alquiler: "Unlock Tool · 6 h" (nombre y horas del catálogo)
//   - trabajos[].con_licencia  true si ese proceso corrió con la licencia (no gastó saldo)
//
// POST {} + JWT → 200 { nombre, saldo, saldo_centavos, saldo_usd, licencia, totales, trabajos, movimientos, parametros }

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { admin, CORS, exigirSesion, resp } from "../_shared/seguridad.ts";
import { factorUnidad, saldoVista } from "../_shared/unidad.ts";

const PEDIDO = /AT-\d{6}-\d+/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const s = await exigirSesion(req);
    const db = admin();
    const factor = await factorUnidad(db);
    const aCentavos = (base: number) => factor === 100 ? base : base * 100;

    // Nombre del técnico.
    const { data: utNom } = await db.schema("negocio")
      .from("usuario_taller").select("nombre").eq("codigo", s.usuario).maybeSingle();
    const nombre = (utNom as { nombre: string } | null)?.nombre ?? "";

    // Saldo de créditos.
    const { data: cc } = await db.schema("negocio")
      .from("credito_cuenta").select("saldo").eq("usuario_ref", s.usuario).maybeSingle();
    const vista = saldoVista((cc as { saldo: number } | null)?.saldo ?? 0, factor);

    // v19 · Licencia anual: la más nueva del técnico (por su suscripción) y en cuántas PC está puesta.
    // Si algo de esto falla, `licencia` va en null y el resto del resumen sale igual.
    let licencia: { estado: string; fecha_inicio: string; fecha_fin: string; pcs: number } | null = null;
    try {
      const { data: sus } = await db.schema("negocio")
        .from("suscripcion").select("codigo").eq("usuario_ref", s.usuario).limit(50);
      const susIds = ((sus ?? []) as { codigo: string }[]).map((x) => x.codigo);
      if (susIds.length) {
        const { data: lic } = await db.schema("negocio")
          .from("licencia").select("codigo,estado,fecha_inicio,fecha_fin")
          .in("suscripcion_ref", susIds).order("fecha_fin", { ascending: false }).limit(1).maybeSingle();
        const l = lic as { codigo: string; estado: string; fecha_inicio: string; fecha_fin: string } | null;
        if (l) {
          const { count } = await db.schema("negocio")
            .from("licencia_pc").select("codigo", { count: "exact", head: true })
            .eq("licencia_ref", l.codigo).eq("estado", "activo");
          licencia = { estado: l.estado, fecha_inicio: l.fecha_inicio, fecha_fin: l.fecha_fin, pcs: count ?? 0 };
        }
      }
    } catch (e) {
      console.error("cliente_resumen licencia", String((e as Error)?.message ?? e));
    }

    // Últimos trabajos del técnico (vía sus equipos).
    const { data: eqs } = await db.schema("operacion")
      .from("equipo_cliente").select("codigo,modelo_ref")
      .eq("usuario_ref", s.usuario).limit(200);
    const eqsArr = (eqs ?? []) as { codigo: string; modelo_ref: string | null }[];
    const codigos = eqsArr.map((e) => e.codigo);
    const eqDe: Record<string, string | null> = {};
    for (const e of eqsArr) eqDe[e.codigo] = e.modelo_ref;

    let trabajos: unknown[] = [];
    let procesosTotal = 0;
    if (codigos.length) {
      const { count } = await db.schema("operacion")
        .from("trabajo_parcheo").select("codigo", { count: "exact", head: true })
        .in("equipo_ref", codigos);
      procesosTotal = count ?? 0;

      const { data: tr } = await db.schema("operacion")
        .from("trabajo_parcheo").select("folio,estado,fecha_inicio,equipo_ref,licencia_ref")
        .in("equipo_ref", codigos).order("fecha_inicio", { ascending: false }).limit(10);
      const refs = [...new Set(((tr ?? []) as { equipo_ref: string }[])
        .map((t) => eqDe[t.equipo_ref]).filter((x): x is string => !!x))];
      const modeloDe: Record<string, string> = {};
      for (const r of refs) {
        const { data: mo } = await db.schema("catalogo")
          .from("modelo").select("codigo_modelo").eq("codigo", r).maybeSingle();
        modeloDe[r] = (mo as { codigo_modelo: string } | null)?.codigo_modelo ?? "";
      }
      trabajos = ((tr ?? []) as { folio: string; estado: string; fecha_inicio: string; equipo_ref: string; licencia_ref: string | null }[])
        .map((t) => ({
          folio: t.folio, estado: t.estado, fecha: t.fecha_inicio,
          modelo: modeloDe[eqDe[t.equipo_ref] ?? ""] ?? "",
          con_licencia: t.licencia_ref != null,   // v19
        }));
    }

    // Últimos movimientos de crédito + totales históricos.
    const { data: mv } = await db.schema("negocio")
      .from("credito_movimiento")
      .select("tipo,cantidad,saldo_despues,motivo,referencia,servicio,fecha_registro")
      .eq("usuario_ref", s.usuario).order("fecha_registro", { ascending: false }).limit(20);
    const mvArr = (mv ?? []) as { tipo: string; cantidad: number; saldo_despues: number; motivo: string; referencia: string; servicio: string | null; fecha_registro: string }[];

    // v19 · Alquiler: el movimiento guarda el id del alquiler; de ahí salen su número AT, la herramienta y las horas.
    const alquilerDe: Record<string, { pedido: string | null; detalle: string | null }> = {};
    try {
      const ids = [...new Set(mvArr.filter((m) => m.servicio === "alquiler" && UUID.test(m.referencia ?? "")).map((m) => m.referencia))];
      if (ids.length) {
        const { data: al } = await db.schema("sop_alquiler")
          .from("alquiler").select("id,codigo,herramienta").in("id", ids);
        const { data: hs } = await db.schema("sop_alquiler")
          .from("herramienta").select("clave,nombre,horas");
        const herr: Record<string, { nombre: string; horas: number }> = {};
        for (const h of ((hs ?? []) as { clave: string; nombre: string; horas: number }[])) herr[h.clave] = h;
        for (const a of ((al ?? []) as { id: string; codigo: string | null; herramienta: string }[])) {
          const h = herr[a.herramienta];
          alquilerDe[a.id] = { pedido: a.codigo ?? null, detalle: h ? `${h.nombre} · ${h.horas} h` : null };
        }
      }
    } catch (e) {
      console.error("cliente_resumen alquiler", String((e as Error)?.message ?? e));
    }

    const movimientos = mvArr.map((m) => ({
      ...m,
      cantidad_centavos: aCentavos(m.cantidad), cantidad_usd: Math.round(aCentavos(m.cantidad)) / 100,
      saldo_despues_centavos: aCentavos(m.saldo_despues),
      // v19
      pedido: (m.referencia ?? "").match(PEDIDO)?.[0] ?? (m.motivo ?? "").match(PEDIDO)?.[0] ?? alquilerDe[m.referencia]?.pedido ?? null,
      detalle: alquilerDe[m.referencia]?.detalle ?? null,
    }));

    const { data: todos } = await db.schema("negocio")
      .from("credito_movimiento").select("tipo,cantidad")
      .eq("usuario_ref", s.usuario).limit(5000);
    let consumidos = 0, recargados = 0, devueltos = 0;
    for (const m of ((todos ?? []) as { tipo: string; cantidad: number }[])) {
      if (m.tipo === "consumo") consumidos += -aCentavos(m.cantidad);
      if (m.tipo === "recarga") recargados += aCentavos(m.cantidad);
      if (m.tipo === "devolucion") devueltos += aCentavos(m.cantidad);
    }

    // Parámetros para mostrar (precio y WhatsApp de soporte).
    const { data: par } = await db.schema("negocio")
      .from("parametro").select("clave,valor").eq("estado", "activo")
      .in("clave", ["credito_por_tramite", "precio_credito_usd", "soporte_whatsapp", "credito_unidad"]);
    const parametros: Record<string, string> = {};
    for (const p of ((par ?? []) as { clave: string; valor: string }[])) parametros[p.clave] = p.valor;

    return resp(200, {
      nombre, ...vista,
      licencia,   // v19
      totales: {
        procesos: procesosTotal,
        consumidos: Math.floor(consumidos / 100), recargados: Math.floor(recargados / 100),   // créditos (compatibles)
        consumidos_centavos: consumidos, recargados_centavos: recargados, devueltos_centavos: devueltos,
      },
      trabajos,
      movimientos,
      parametros,
    });
  } catch (e) {
    const m = (e as Error).message;
    console.error("cliente_resumen", m);
    if (m === "rechazo_autorizacion" || m === "sin_sesion" || m === "sesion_invalida") {
      return resp(403, { error: "rechazo_autorizacion" });
    }
    return resp(500, { error: "fallo_interno" });
  }
});
