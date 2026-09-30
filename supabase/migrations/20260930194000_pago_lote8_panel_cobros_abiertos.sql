-- LOTE 8 — Helper de solo lectura para la atribución manual (pedido por la app de seguimiento).
-- pago.panel_cobros_abiertos(p_usuario) lista los cobros NO confirmados de los últimos 30 días
-- (opcionalmente de un usuario) para que el operador elija a cuál atribuir un pago huérfano.
-- Solo lectura, service_role-only, aditivo. No toca el motor.

create or replace function pago.panel_cobros_abiertos(p_usuario uuid default null)
 returns jsonb language sql security definer set search_path to 'pago','negocio','public' stable
as $function$
  with ce as (
    select distinct on (cobro_id) cobro_id, estado, desde
    from pago.cobro_estado order by cobro_id, desde desc
  )
  select coalesce(jsonb_agg(to_jsonb(t) order by t.creado_en desc), '[]'::jsonb)
  from (
    select
      c.id                                                as cobro_id,
      cu.usuario_id,
      ut.nombre                                           as usuario_nombre,
      cme.metodo::text                                    as metodo,
      upper(coalesce(cmo.moneda::text,''))                as moneda,
      case
        when lower(coalesce(cmo.moneda::text,'')) in ('usd','usdt') then round(cm.monto_unidad / 1e8, 8)
        when lower(coalesce(cmo.moneda::text,'')) = 'pen'           then round(cm.monto_unidad / 100.0, 2)
        else cm.monto_unidad::numeric
      end                                                 as monto,
      cc.codigo,
      pago.codigo_formato(cc.codigo)                      as codigo_formato,
      ce.estado                                           as estado,
      c.creado_en,
      r.producto,
      r.creditos
    from pago.cobro c
    join ce on ce.cobro_id = c.id
    left join pago.cobro_usuario   cu  on cu.cobro_id  = c.id
    left join negocio.usuario_taller ut on ut.codigo   = cu.usuario_id
    left join pago.cobro_metodo    cme on cme.cobro_id = c.id
    left join pago.cobro_moneda    cmo on cmo.cobro_id = c.id
    left join pago.cobro_monto     cm  on cm.cobro_id  = c.id
    left join pago.cobro_codigo    cc  on cc.cobro_id  = c.id
    left join pago.cobro_recarga   cr  on cr.cobro_id  = c.id
    left join negocio.recarga      r   on r.codigo     = cr.recarga_id
    where ce.estado not in ('confirmado','anulado','revertido')
      and (p_usuario is null or cu.usuario_id = p_usuario)
      and c.creado_en > now() - interval '30 days'
  ) t;
$function$;

revoke execute on function pago.panel_cobros_abiertos(uuid) from public, anon, authenticated;
grant  execute on function pago.panel_cobros_abiertos(uuid) to service_role;
