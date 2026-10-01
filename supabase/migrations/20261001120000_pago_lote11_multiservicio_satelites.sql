-- LOTE 11 — Pasarela multi-servicio: satélites de etiqueta + idempotencia (ADITIVO).
-- Base para que la pasarela sirva a cualquier servicio (no solo créditos):
--   * pago.cobro_servicio: etiqueta `servicio` (slug texto, no enum para no acoplar) +
--     `referencia_externa` (id del servicio dueño, ej. lote_id/pedido_ref FRP). 1:1 con cobro.
--   * pago.cobro_idem: idempotencia de creación (idempotency_key -> cobro existente).
-- Backfill: etiqueta los cobros actuales (créditos/licencia por su recarga; el resto 'servicio').
-- service_role-only, RLS deny-all (patrón de la casa).

create table if not exists pago.cobro_servicio (
  cobro_id           uuid primary key references pago.cobro(id),
  servicio           text not null,
  referencia_externa text
);
alter table pago.cobro_servicio enable row level security;
revoke all on pago.cobro_servicio from public, anon, authenticated;
grant select, insert, update on pago.cobro_servicio to service_role;
create index if not exists cobro_servicio_servicio_ix on pago.cobro_servicio(servicio);
create index if not exists cobro_servicio_refext_ix   on pago.cobro_servicio(referencia_externa) where referencia_externa is not null;

create table if not exists pago.cobro_idem (
  idempotency_key text primary key,
  cobro_id        uuid not null references pago.cobro(id),
  creado_en       timestamptz not null default now()
);
alter table pago.cobro_idem enable row level security;
revoke all on pago.cobro_idem from public, anon, authenticated;
grant select, insert on pago.cobro_idem to service_role;

-- Backfill (idempotente): etiqueta cada cobro que aún no tenga servicio.
insert into pago.cobro_servicio(cobro_id, servicio)
select c.id,
  case
    when r.producto = 'licencia' then 'licencia'
    when r.producto = 'credito'  then 'creditos'
    when cr.cobro_id is not null  then 'creditos'   -- tiene recarga pero sin producto claro
    else 'servicio'                                 -- cobro de servicio (sin recarga)
  end
from pago.cobro c
left join pago.cobro_recarga cr on cr.cobro_id = c.id
left join negocio.recarga     r on r.codigo    = cr.recarga_id
where not exists (select 1 from pago.cobro_servicio s where s.cobro_id = c.id);
