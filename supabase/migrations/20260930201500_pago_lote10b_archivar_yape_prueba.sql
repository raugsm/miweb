-- LOTE 10b — Archivar los pagos Yape de PRUEBA (pedido del dueño) y ocultarlos del panel.
-- NO se borra nada (regla "nada se elimina, se trabaja por estados"): se agrega el estado
-- terminal 'archivado' (append-only) a cada pago Yape actual y se excluye 'archivado' de la
-- vista v_ingreso. Así desaparecen de TODO el panel (resumen, movimientos, pendientes,
-- revisiones) pero quedan en la bitácora (pago_visto_estado + pago.evento) para auditoría.
-- Binance NO se toca. Reversible (se puede re-abrir con un nuevo estado si hiciera falta).

-- 1) Archivar todo pago de fuente 'yape' cuyo último estado aún no sea 'archivado'.
insert into pago.pago_visto_estado(txid, estado)
select pv.txid, 'archivado'::public.estado_pago_visto
from pago.pago_visto pv
join pago.pago_visto_fuente pf on pf.txid = pv.txid and pf.fuente = 'yape'
where (select estado from pago.pago_visto_estado e where e.txid = pv.txid order by desde desc limit 1)
      <> 'archivado';

-- 2) v_ingreso excluye los archivados (una sola fuente de verdad para todo el panel).
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
   ))                                                        as necesita_accion
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
where coalesce(est.estado::text, '') <> 'archivado';

revoke all on pago.v_ingreso from public, anon, authenticated;
grant select on pago.v_ingreso to service_role;
