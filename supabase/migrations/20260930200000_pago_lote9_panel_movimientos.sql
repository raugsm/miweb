-- LOTE 9 — Listado de movimientos para la pestaña "Todos" del panel de ingresos.
-- pago.panel_movimientos(metodo?, dias?, estado?) lista pagos de v_ingreso filtrados por
-- método (yape|binance), opcional por días y estado, orden visto_en desc, tope 500.
-- Solo lectura sobre v_ingreso, service_role-only, aditivo. No toca el motor.

create or replace function pago.panel_movimientos(
  p_metodo text default null,
  p_dias   int  default 30,
  p_estado text default null
) returns jsonb language sql security definer set search_path to 'pago','public' stable
as $function$
  select coalesce(jsonb_agg(to_jsonb(t) order by t.visto_en desc), '[]'::jsonb)
  from (
    select
      txid, fuente, metodo, moneda, monto, nota, pagador, tipo,
      ocurrido, visto_en, estado_final, cobro_id, usuario_id, usuario_nombre,
      cobro_codigo, acreditado, creditos, aplicado_en, reversado, necesita_accion
    from pago.v_ingreso
    where (p_metodo is null or metodo = p_metodo)
      and (p_estado is null or estado_final::text = p_estado)
      and coalesce(ocurrido, visto_en) > now() - make_interval(days => greatest(1, coalesce(p_dias, 30)))
    order by visto_en desc
    limit 500
  ) t;
$function$;

revoke execute on function pago.panel_movimientos(text, int, text) from public, anon, authenticated;
grant  execute on function pago.panel_movimientos(text, int, text) to service_role;
