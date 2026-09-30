-- LOTE 3 — Libro de ingresos (B3). Vistas de SOLO LECTURA (riesgo cero, no tocan datos).
-- Da la base del "seguimiento confiable de todos los ingresos" que pide el dueño:
--   * pago.v_ingreso           — un renglón por pago visto (Yape + Binance), enriquecido:
--                                método, moneda, monto NORMALIZADO a decimal, estado final,
--                                cobro/usuario/código si casó, acreditado, reversado, y la
--                                bandera necesita_accion (huérfano / sin_codigo / monto_distinto /
--                                revision / ignorado / nuevo viejo).
--   * pago.v_ingreso_diario    — total visto vs acreditado por método/moneda/día (para cuadre).
--   * pago.v_revision_pendiente— cola de revisiones Yape abiertas con candidatos y pagos.
-- Solo service_role puede leerlas (se consumen desde el edge de operador del Lote 5).

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
left join pago.cobro_codigo        cc  on cc.cobro_id = a.cobro_id;

create or replace view pago.v_ingreso_diario as
select
  coalesce(ocurrido, visto_en)::date            as dia,
  metodo,
  moneda,
  count(*)                                      as pagos_vistos,
  sum(monto)                                    as monto_visto,
  count(*) filter (where acreditado)            as pagos_acreditados,
  coalesce(sum(monto) filter (where acreditado), 0)      as monto_acreditado,
  count(*) filter (where necesita_accion)       as pagos_pendientes,
  coalesce(sum(monto) filter (where necesita_accion), 0) as monto_pendiente
from pago.v_ingreso
group by 1, 2, 3;

create or replace view pago.v_revision_pendiente as
with rest as (
  select distinct on (revision_id) revision_id, estado, desde
  from pago.yape_revision_estado
  order by revision_id, desde desc
)
select
  r.id                                          as revision_id,
  r.creado_en,
  coalesce(rest.estado, 'pendiente')            as estado,
  rm.motivo,
  rmo.monto_unidad,
  round(rmo.monto_unidad / 100.0, 2)            as monto_pen,
  rc.codigo,
  (select array_agg(cand.cobro_id) from pago.yape_revision_candidato cand where cand.revision_id = r.id) as candidatos,
  (select array_agg(rp.txid)       from pago.yape_revision_pago      rp   where rp.revision_id   = r.id) as pagos
from pago.yape_revision r
left join rest                       on rest.revision_id = r.id
left join pago.yape_revision_motivo  rm  on rm.revision_id  = r.id
left join pago.yape_revision_monto   rmo on rmo.revision_id = r.id
left join pago.yape_revision_codigo  rc  on rc.revision_id  = r.id
where coalesce(rest.estado, 'pendiente') = 'pendiente';

revoke all on pago.v_ingreso            from public, anon, authenticated;
revoke all on pago.v_ingreso_diario     from public, anon, authenticated;
revoke all on pago.v_revision_pendiente from public, anon, authenticated;
grant select on pago.v_ingreso            to service_role;
grant select on pago.v_ingreso_diario     to service_role;
grant select on pago.v_revision_pendiente to service_role;
