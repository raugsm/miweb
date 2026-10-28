-- 20261028_orquestador_frp_PROPUESTA.sql — Ari-Web, 28-oct-2026 (rev. 3)
-- Orquestador FRP: UNA sola cola/UN solo cron. El cron y el cierre son de Ari-Master en sop_frp.
-- Esta migracion solo aporta datos/clasificacion/eventos y vistas de apoyo:
--   frp.motivo_terminal, frp.clasificar_texto, frp.auth_intento.llave_solicitada_en/motivo_clave,
--   frp.evento, frp.v_proveedor_estado, frp.proveedor_sugerido, frp.proceso_clasificar,
--   y fix de frp.equipo_terminal / frp.lote_terminal para ver tambien resultado='equipo_no_soportado'.
-- PROPUESTA: no aplicar sin OK escrito de Peter en su chat.

-- 1) Catalogo de motivos: patron sobre la respuesta del proveedor -> clasificacion + ambito.
create table if not exists frp.motivo_terminal (
  codigo        text primary key,
  patron        text not null,                 -- ILIKE
  clasificacion text not null check (clasificacion in ('terminal','retryable','bloqueado','ambiguo','ok')),
  ambito        text not null default 'equipo' check (ambito in ('equipo','proveedor','red','otro')),
  devolver      boolean not null default false,
  reintentable  boolean not null default false,
  orden         int not null default 100,
  activo        boolean not null default true,
  creado_en     timestamptz not null default now()
);
alter table frp.motivo_terminal enable row level security;

insert into frp.motivo_terminal (codigo, patron, clasificacion, ambito, devolver, reintentable, orden) values
  ('terminal_this_type',      '%THIS TYPE OF DEVICES COULDN%T BE UNLOCKED%', 'terminal',  'equipo',    false, false, 10),
  ('terminal_this_type_html', '%couldn&#039;t be unlocked%',                 'terminal',  'equipo',    false, false, 16),
  ('terminal_this_type_plain','%couldn''t be unlocked%',                     'terminal',  'equipo',    false, false, 17),
  ('terminal_this_type_none', '%couldnt be unlocked%',                       'terminal',  'equipo',    false, false, 18),
  ('terminal_50001',          '%50001%',                                     'terminal',  'equipo',    false, false, 11),
  ('terminal_china',          '%china%',                                     'terminal',  'equipo',    false, false, 12),
  ('terminal_mdm',            '%mdm%',                                       'terminal',  'equipo',    false, false, 13),
  ('terminal_fmi',            '%fmi%',                                       'terminal',  'equipo',    false, false, 14),
  ('terminal_icloud',         '%icloud%',                                    'terminal',  'equipo',    false, false, 15),
  ('retry_daily_limit',       '%DAILY LIMIT REACHED%',                       'retryable', 'proveedor', false, true,  30),
  ('retry_limit_service',     '%limit Service FRP%',                         'retryable', 'proveedor', false, true,  31),
  ('retry_waiting',           '%waiting%',                                   'retryable', 'proveedor', false, true,  32),
  ('blocked_account',         '%Account blocked%',                           'bloqueado', 'proveedor', false, true,  40),
  ('blocked_credit',          '%Credit not enough%',                         'bloqueado', 'proveedor', false, true,  41),
  ('blocked_not_enough',      '%not enough%',                                'bloqueado', 'proveedor', false, true,  42),
  ('ambiguous_telegram',      '%Telegram API Error%',                        'ambiguo',   'red',       false, true,  50),
  ('ambiguous_503',           '%http_503%',                                  'ambiguo',   'red',       false, true,  51),
  ('ambiguous_520',           '%http_520%',                                  'ambiguo',   'red',       false, true,  52),
  ('ambiguous_522',           '%http_522%',                                  'ambiguo',   'red',       false, true,  53),
  ('ambiguous_525',           '%http_525%',                                  'ambiguo',   'red',       false, true,  54),
  ('ok_sukses',               '%sukses%',                                    'ok',        'otro',      false, false, 90),
  ('ok_success',              '%"status":"success"%',                        'ok',        'otro',      false, false, 91)
on conflict (codigo) do nothing;

-- 2) Clasificador: devuelve el primer motivo activo que matchea (terminal primero).
create or replace function frp.clasificar_texto(p_texto text)
returns table(codigo text, clasificacion text, ambito text, devolver boolean, reintentable boolean)
language sql stable security definer
set search_path to 'frp', 'public' as $fn$
  select m.codigo, m.clasificacion, m.ambito, m.devolver, m.reintentable
    from frp.motivo_terminal m
   where m.activo and coalesce(p_texto, '') ilike m.patron
   order by m.orden, m.codigo
   limit 1
$fn$;
revoke all on function frp.clasificar_texto(text) from public, anon, authenticated;
grant execute on function frp.clasificar_texto(text) to service_role;

-- 3) Llave solicitada + motivo en el intento.
alter table frp.auth_intento add column if not exists llave_solicitada_en timestamptz;
alter table frp.auth_intento add column if not exists motivo_clave text;

-- 4) Eventos que reporta la app (inicio | precheck | ... | desconexion | fin).
create table if not exists frp.evento (
  id          bigserial primary key,
  lote_id     uuid,
  trabajo_id  uuid,
  etapa       text not null check (etapa in ('inicio','precheck','leer','autorizar','clave','llave','llave_solicitada','escribir','verificar','desconexion','fin')),
  resultado   text check (resultado in ('ok','terminal','soporte','reintentable','fallido')),
  motivo      text,
  devolucion  boolean,
  detalle     jsonb,
  creado_en   timestamptz not null default now()
);
alter table frp.evento enable row level security;
create index if not exists frp_evento_lote_idx on frp.evento (lote_id, creado_en desc);

-- 5) Parametro de reintentos por saldo/limite del proveedor (no por equipo).
insert into negocio.parametro (clave, valor, descripcion)
values ('frp_reintento_proveedor_max', '2',
        'Reintentos por lote cuando el proveedor rechaza por saldo/limite/cuenta (Ari-Web 28-oct)')
on conflict (clave) do nothing;

-- 6) Vista de creditos/limites por proveedor para el panel (pedido de Peter).
create or replace view frp.v_proveedor_estado as
  select p.clave as proveedor, p.nombre, p.estado::text as estado, p.costo_usdt,
         s.saldo, s.costo, s.servidores_online, s.agotado_hasta, s.visto_en,
         case
           when p.estado::text <> 'activo' then 'inactivo'
           when s.proveedor is null then 'sin_datos'
           when s.agotado_hasta is not null and s.agotado_hasta > now() then 'agotado'
           when s.saldo is null then 'sin_datos'
           when s.saldo < coalesce(s.costo, p.costo_usdt) then 'sin_saldo'
           else 'ok'
         end as clasificacion,
         (select count(*) from frp.auth_intento a
           where a.proveedor = p.clave and a.cobro
             and (a.fecha_registro at time zone 'America/Lima')::date = (now() at time zone 'America/Lima')::date) as cobros_hoy,
         (select left(a.respuesta, 140) from frp.auth_intento a
           where a.proveedor = p.clave order by a.fecha_registro desc limit 1) as ultima_respuesta
    from frp.proveedor p
    left join frp.proveedor_salud s on s.proveedor = p.clave;
revoke all on frp.v_proveedor_estado from public, anon, authenticated;
grant select on frp.v_proveedor_estado to service_role;

-- 7) Proveedor sano sugerido (para el panel: a quien cambiar).
create or replace function frp.proveedor_sugerido()
returns text language sql stable security definer
set search_path to 'frp', 'public' as $fn$
  select proveedor from frp.v_proveedor_estado
   where clasificacion = 'ok'
   order by (saldo / greatest(coalesce(costo, 1), 0.01)) desc nulls last
   limit 1
$fn$;
revoke all on function frp.proveedor_sugerido() from public, anon, authenticated;
grant execute on function frp.proveedor_sugerido() to service_role;

-- 8) Backfill de clasificacion/llave en intentos (lo puede llamar el cron de Ari-Master).
create or replace function frp.clasificar_intentos(p_horas int default 168)
returns int language plpgsql security definer
set search_path to 'frp', 'public' as $fn$
declare v_n int;
begin
  update frp.auth_intento a
     set motivo_clave = coalesce(a.motivo_clave,
                                 (select c.codigo from frp.clasificar_texto(a.respuesta) c limit 1)),
         llave_solicitada_en = coalesce(a.llave_solicitada_en,
                                        case when a.ruta ilike '%requestAuth%' then a.fecha_registro end)
   where a.fecha_registro > now() - make_interval(hours => greatest(coalesce(p_horas, 168), 1))
     and (a.motivo_clave is null or a.llave_solicitada_en is null);
  get diagnostics v_n = row_count;
  return v_n;
end $fn$;
revoke all on function frp.clasificar_intentos(int) from public, anon, authenticated;
grant execute on function frp.clasificar_intentos(int) to service_role;

-- 9) Clasificacion de un lote para el cron de Ari-Master (una sola fuente de verdad).
create or replace function frp.proceso_clasificar(p_lote uuid)
returns jsonb language sql stable security definer
set search_path to 'frp', 'sop_frp', 'negocio', 'public' as $fn$
  with ult0 as (
    select coalesce(a.motivo_clave,
                    (select c.codigo from frp.clasificar_texto(a.respuesta) c limit 1)) as motivo_clave
      from frp.auth_intento a
     where a.lote_id = p_lote
       and (a.motivo_clave is not null or a.respuesta is not null)
     order by a.fecha_registro desc limit 1
  ), ult as (
    select u.motivo_clave, m.clasificacion, m.ambito, m.devolver, m.reintentable
      from ult0 u
      left join frp.motivo_terminal m on m.codigo = u.motivo_clave
  ), llv as (
    select coalesce(a.llave_solicitada_en,
                    case when a.ruta ilike '%requestAuth%' then a.fecha_registro end) as llave_en
      from frp.auth_intento a
     where a.lote_id = p_lote
       and (a.llave_solicitada_en is not null or a.ruta ilike '%requestAuth%')
     order by a.fecha_registro desc limit 1
  ), ev as (
    select e.etapa || coalesce(':' || e.resultado, '') as ultimo_evento,
           e.motivo as evento_motivo, e.resultado as evento_resultado
      from frp.evento e
     where e.lote_id = p_lote
     order by e.creado_en desc limit 1
  ), cnt as (
    select count(*) as intentos_proveedor
      from frp.auth_intento a2
     where a2.lote_id = p_lote
       and a2.fecha_registro > now() - interval '24 hours'
       and coalesce(
             (select m2.ambito from frp.motivo_terminal m2 where m2.codigo = a2.motivo_clave),
             (select c.ambito from frp.clasificar_texto(a2.respuesta) c limit 1)
           ) = 'proveedor'
  ), cas as (
    select c.situacion, c.pago_situacion
      from sop_frp.caso c
     where c.lote_id = p_lote and c.estado = 'activo'
     order by c.creado_en desc limit 1
  )
  select jsonb_build_object(
    'lote_id', p_lote,
    'situacion', cas.situacion,
    'pago_situacion', cas.pago_situacion,
    'motivo', coalesce(ev.evento_motivo, ult.motivo_clave),
    'clasificacion', case
                       when ev.evento_resultado in ('terminal','soporte') then 'terminal'
                       when ev.evento_resultado = 'reintentable' then 'retryable'
                       else ult.clasificacion end,
    'ambito', case
                when ev.evento_resultado in ('terminal','soporte') then 'equipo'
                when ev.evento_resultado = 'reintentable' then coalesce(ult.ambito, 'red')
                else ult.ambito end,
    'devolver', case when llv.llave_en is not null then false
                     when ev.evento_resultado in ('terminal','soporte') then false
                     else coalesce(ult.devolver, false) end,
    'reintentable', case when llv.llave_en is not null then false
                         when ev.evento_resultado = 'reintentable' then true
                         else coalesce(ult.reintentable, false) end,
    'llave_solicitada_en', llv.llave_en,
    'ultimo_evento', ev.ultimo_evento,
    'evento_motivo', ev.evento_motivo,
    'evento_resultado', ev.evento_resultado,
    'intentos_proveedor', cnt.intentos_proveedor,
    'proveedor_sugerido', frp.proveedor_sugerido()
  )
  from (select 1) b
  left join ult on true
  left join llv on true
  left join ev on true
  left join cas on true
  cross join cnt;
$fn$;
revoke all on function frp.proceso_clasificar(uuid) from public, anon, authenticated;
grant execute on function frp.proceso_clasificar(uuid) to service_role;

-- 9) Fix: las terminales nuevas quedan resultado='equipo_no_soportado' y el pre-check solo miraba 'ok'.
create or replace function frp.equipo_terminal(p_equipo_id text)
returns jsonb language plpgsql stable security definer
set search_path to 'frp', 'sop_frp', 'negocio', 'public' as $function$
declare v_re text; r record; v_perm timestamptz; v_causa text;
begin
  if p_equipo_id is null or p_equipo_id !~ '^[0-9a-f]{64}$' then return jsonb_build_object('terminal', false); end if;
  select nullif(valor,'') into v_re from negocio.parametro where clave = 'frp_respuestas_terminales' and estado = 'activo' limit 1;
  if v_re is null then return jsonb_build_object('terminal', false); end if;
  select a.fecha_registro, a.respuesta, a.proveedor, a.lote_id, l.codigo, l.taller_uid into r
    from frp.auth_intento a left join sop_frp.lote l on l.id = a.lote_id
   where a.equipo_id = p_equipo_id
     and a.resultado in ('ok','equipo_no_soportado')
     and a.aceptado is not true
     and a.respuesta ~* v_re
   order by a.fecha_registro desc limit 1;
  if r.fecha_registro is null then return jsonb_build_object('terminal', false); end if;
  select ra.fecha into v_perm from frp.reintento_autorizado ra
   where ra.fecha > r.fecha_registro
     and ra.lote_id in (select distinct a2.lote_id from frp.auth_intento a2 where a2.equipo_id = p_equipo_id and a2.lote_id is not null)
   order by ra.fecha desc limit 1;
  if v_perm is not null then return jsonb_build_object('terminal', false, 'permitido_por_soporte', true, 'permitido_en', v_perm); end if;
  v_causa := case when r.respuesta ~* 'mdm|couldn''?t be unlocked|could not be unlocked' then 'mdm' else 'no_compatible' end;
  return jsonb_build_object('terminal', true, 'motivo', 'equipo_no_soportado', 'causa', v_causa, 'pedido', r.codigo, 'lote_id', r.lote_id,
    'taller_uid', r.taller_uid, 'proveedor', r.proveedor, 'fecha', r.fecha_registro, 'respuesta', left(r.respuesta, 300));
end $function$;

create or replace function frp.lote_terminal(p_lote_id uuid)
returns jsonb language plpgsql stable security definer
set search_path to 'frp', 'negocio', 'public' as $function$
declare v_re text; r record; v_perm timestamptz;
begin
  if p_lote_id is null then return jsonb_build_object('terminal', false); end if;
  select nullif(valor,'') into v_re from negocio.parametro where clave = 'frp_respuestas_terminales' and estado = 'activo' limit 1;
  if v_re is null then return jsonb_build_object('terminal', false); end if;
  select a.fecha_registro, a.respuesta, a.proveedor into r
    from frp.auth_intento a
   where a.lote_id = p_lote_id
     and a.resultado in ('ok','equipo_no_soportado')
     and a.aceptado is not true
     and a.respuesta ~* v_re
   order by a.fecha_registro desc limit 1;
  if r.fecha_registro is null then return jsonb_build_object('terminal', false); end if;
  select fecha into v_perm from frp.reintento_autorizado
   where lote_id = p_lote_id and fecha > r.fecha_registro limit 1;
  if v_perm is not null then
    return jsonb_build_object('terminal', false, 'permitido_por_soporte', true, 'permitido_en', v_perm);
  end if;
  return jsonb_build_object('terminal', true, 'motivo', 'equipo_no_soportado', 'proveedor', r.proveedor,
    'respuesta', left(r.respuesta, 300), 'fecha', r.fecha_registro);
end $function$;

-- 10) Rollback (comentado):
-- drop function if exists frp.proceso_clasificar(uuid);
-- drop function if exists frp.proveedor_sugerido();
-- drop view if exists frp.v_proveedor_estado;
-- drop table if exists frp.evento;
-- alter table frp.auth_intento drop column if exists motivo_clave;
-- alter table frp.auth_intento drop column if exists llave_solicitada_en;
-- drop function if exists frp.clasificar_texto(text);
-- drop table if exists frp.motivo_terminal;
-- delete from negocio.parametro where clave = 'frp_reintento_proveedor_max';
-- (las funciones equipo_terminal/lote_terminal se restauran con sus definiciones previas; guardar antes)
