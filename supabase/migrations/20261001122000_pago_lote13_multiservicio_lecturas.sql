-- LOTE 13 — Exponer servicio + referencia_externa en las LECTURAS (ADITIVO).
-- v_ingreso, cobro_ver (pago_cobro_estado), panel_movimientos, panel_ingresos_resumen.
-- El servicio sale del cobro casado (vía acreditacion); en pagos no casados queda null
-- (correcto: aún no se sabe de qué servicio es). cobro_ver sí lo trae directo (es por cobro).

-- v_ingreso: + servicio + referencia_externa (desde cobro_servicio del cobro casado)
create or replace view pago.v_ingreso as
with est as (
  select distinct on (txid) txid, estado, desde
  from pago.pago_visto_estado
  order by txid, desde desc
)
select
  pv.txid,
  pf.fuente,
  case coalesce(pf.fuente,'')
    when 'yape'    then 'yape'
    when 'pay_c2c' then 'binance'
    else coalesce(pf.fuente,'?')
  end                                                        as metodo,
  upper(coalesce(pmo.moneda,''))                             as moneda,
  pm.monto_unidad,
  case
    when lower(coalesce(pmo.moneda,'')) in ('usd','usdt') then round(pm.monto_unidad / 1e8, 8)
    when lower(coalesce(pmo.moneda,'')) = 'pen'           then round(pm.monto_unidad / 100.0, 2)
    else pm.monto_unidad::numeric
  end                                                        as monto,
  pn.nota,
  pa.pagador,
  pt.tipo,
  po.ocurrido,
  pv.visto_en,
  est.estado                                                 as estado_final,
  est.desde                                                  as estado_desde,
  a.cobro_id,
  cu.usuario_id,
  ut.nombre                                                  as usuario_nombre,
  cc.codigo                                                  as cobro_codigo,
  (a.pago_txid is not null)                                  as acreditado,
  a.delta                                                    as creditos,
  a.aplicado_en,
  (rv.pago_txid is not null)                                 as reversado,
  (a.pago_txid is null and (
      est.estado in ('sin_codigo','monto_distinto','revision','ignorado')
      or (est.estado = 'nuevo' and coalesce(po.ocurrido, pv.visto_en) < now() - interval '30 minutes')
   ))                                                        as necesita_accion,
  cs.servicio                                                as servicio,
  cs.referencia_externa                                      as referencia_externa
from pago.pago_visto pv
left join est                          on est.txid = pv.txid
left join pago.pago_visto_fuente   pf  on pf.txid  = pv.txid
left join pago.pago_visto_moneda   pmo on pmo.txid = pv.txid
left join pago.pago_visto_monto    pm  on pm.txid  = pv.txid
left join pago.pago_visto_nota     pn  on pn.txid  = pv.txid
left join pago.pago_visto_pagador  pa  on pa.txid  = pv.txid
left join pago.pago_visto_tipo     pt  on pt.txid  = pv.txid
left join pago.pago_visto_ocurrido po  on po.txid  = pv.txid
left join pago.acreditacion        a   on a.pago_txid = pv.txid
left join pago.reverso             rv  on rv.pago_txid = pv.txid
left join pago.cobro_usuario       cu  on cu.cobro_id = a.cobro_id
left join negocio.usuario_taller   ut  on ut.codigo = cu.usuario_id
left join pago.cobro_codigo        cc  on cc.cobro_id = a.cobro_id
left join pago.cobro_servicio      cs  on cs.cobro_id = a.cobro_id
where coalesce(est.estado::text, '') <> 'archivado';

revoke all on pago.v_ingreso from public, anon, authenticated;
grant select on pago.v_ingreso to service_role;

-- cobro_ver (lo usa pago_cobro_estado): + servicio + referencia_externa (directo por cobro)
create or replace function pago.cobro_ver(p_usuario uuid, p_cobro uuid)
 returns jsonb language plpgsql security definer set search_path to 'pago','public'
as $function$
declare v_owner uuid;
begin
  select usuario_id into v_owner from pago.cobro_usuario where cobro_id = p_cobro;
  if v_owner is null then return null; end if;
  if v_owner <> p_usuario then raise exception 'no_autorizado'; end if;
  return jsonb_build_object('cobro_id', p_cobro,
    'codigo_formato', pago.codigo_formato((select codigo from pago.cobro_codigo where cobro_id = p_cobro)),
    'monto_unidad', (select monto_unidad from pago.cobro_monto where cobro_id = p_cobro),
    'estado', (select estado from pago.cobro_estado where cobro_id = p_cobro order by desde desc limit 1),
    'vence_en', (select vence_en from pago.cobro_vencimiento where cobro_id = p_cobro),
    'servicio', (select servicio from pago.cobro_servicio where cobro_id = p_cobro),
    'referencia_externa', (select referencia_externa from pago.cobro_servicio where cobro_id = p_cobro));
end $function$;

revoke execute on function pago.cobro_ver(uuid,uuid) from public, anon, authenticated;
grant  execute on function pago.cobro_ver(uuid,uuid) to service_role;

-- panel_movimientos: + servicio + referencia_externa
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
      cobro_codigo, servicio, referencia_externa, acreditado, creditos, aplicado_en, reversado, necesita_accion
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

-- panel_ingresos_resumen: + servicio en pendientes + bloque por_servicio
create or replace function pago.panel_ingresos_resumen(p_dias int default 14)
 returns jsonb language sql security definer set search_path to 'pago','public' stable
as $function$
  select jsonb_build_object(
    'totales', coalesce((
      select jsonb_agg(jsonb_build_object(
               'metodo', t.metodo, 'moneda', t.moneda,
               'acreditado', coalesce(t.acred, 0), 'pendiente', coalesce(t.pend, 0),
               'pagos_acreditados', t.n_acred, 'pagos_pendientes', t.n_pend))
      from (
        select metodo, moneda,
               sum(monto) filter (where acreditado)       as acred,
               sum(monto) filter (where necesita_accion)  as pend,
               count(*)   filter (where acreditado)       as n_acred,
               count(*)   filter (where necesita_accion)  as n_pend
        from pago.v_ingreso group by metodo, moneda
      ) t), '[]'::jsonb),
    'por_servicio', coalesce((
      select jsonb_agg(jsonb_build_object(
               'servicio', coalesce(s.servicio,'(sin asignar)'), 'moneda', s.moneda,
               'acreditado', coalesce(s.acred,0), 'pagos_acreditados', s.n_acred))
      from (
        select servicio, moneda,
               sum(monto) filter (where acreditado) as acred,
               count(*)   filter (where acreditado) as n_acred
        from pago.v_ingreso where acreditado group by servicio, moneda
      ) s), '[]'::jsonb),
    'diario', coalesce((
      select jsonb_agg(to_jsonb(d) order by d.dia desc, d.metodo)
      from pago.v_ingreso_diario d
      where d.dia >= (now() - make_interval(days => greatest(1, p_dias)))::date
    ), '[]'::jsonb),
    'pendientes', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.ocurrido desc nulls last)
      from (
        select txid, metodo, moneda, monto, nota, pagador, ocurrido, visto_en, estado_final, servicio, referencia_externa
        from pago.v_ingreso where necesita_accion
      ) p), '[]'::jsonb),
    'revisiones', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.creado_en desc)
      from pago.v_revision_pendiente r
    ), '[]'::jsonb)
  );
$function$;

revoke execute on function pago.panel_ingresos_resumen(int) from public, anon, authenticated;
grant  execute on function pago.panel_ingresos_resumen(int) to service_role;
