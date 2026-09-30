-- REGLAS 2/5/9/10: descomponer pago.yape_revision (tabla vacia) a 6FN ancla+satelites,
-- reemplazar arrays por tablas puente, estado por historial+enum, motivo a enum.
-- REGLA 3: renombrar yape_match_pago/cobro -> yape_casar_pago/cobro (interno).

-- ===== Enums (nuevos, singulares, en español) =====
create type public.motivo_revision as enum ('pago_ambiguo', 'cobro_ambiguo');
create type public.estado_revision as enum ('pendiente', 'resuelta', 'anulada');

-- ===== Recrear yape_revision como ANCLA + satelites (estaba vacia) =====
drop table if exists pago.yape_revision cascade;

create table pago.yape_revision (
  id uuid not null default gen_random_uuid(),
  creado_en timestamptz not null default now(),
  constraint yape_revision_pk primary key (id)
);

create table pago.yape_revision_motivo (
  revision_id uuid not null,
  motivo public.motivo_revision not null,
  constraint yape_revision_motivo_pk primary key (revision_id),
  constraint yape_revision_motivo_fk foreign key (revision_id) references pago.yape_revision(id) on delete restrict
);
create table pago.yape_revision_monto (
  revision_id uuid not null,
  monto_unidad bigint not null,
  constraint yape_revision_monto_pk primary key (revision_id),
  constraint yape_revision_monto_fk foreign key (revision_id) references pago.yape_revision(id) on delete restrict
);
create table pago.yape_revision_codigo (
  revision_id uuid not null,
  codigo text not null,
  constraint yape_revision_codigo_pk primary key (revision_id),
  constraint yape_revision_codigo_fk foreign key (revision_id) references pago.yape_revision(id) on delete restrict
);
create table pago.yape_revision_nota (
  revision_id uuid not null,
  nota text not null,
  constraint yape_revision_nota_pk primary key (revision_id),
  constraint yape_revision_nota_fk foreign key (revision_id) references pago.yape_revision(id) on delete restrict
);

-- Puentes 1:N (con integridad referencial real, adios arrays)
create table pago.yape_revision_candidato (
  revision_id uuid not null,
  cobro_id uuid not null,
  constraint yape_revision_candidato_pk primary key (revision_id, cobro_id),
  constraint yape_revision_candidato_revision_fk foreign key (revision_id) references pago.yape_revision(id) on delete restrict,
  constraint yape_revision_candidato_cobro_fk foreign key (cobro_id) references pago.cobro(id) on delete restrict
);
create index yape_revision_candidato_cobro_ix on pago.yape_revision_candidato(cobro_id);

create table pago.yape_revision_pago (
  revision_id uuid not null,
  txid text not null,
  constraint yape_revision_pago_pk primary key (revision_id, txid),
  constraint yape_revision_pago_revision_fk foreign key (revision_id) references pago.yape_revision(id) on delete restrict,
  constraint yape_revision_pago_pago_fk foreign key (txid) references pago.pago_visto(txid) on delete restrict
);
create index yape_revision_pago_txid_ix on pago.yape_revision_pago(txid);

-- Estado por historial (append-only, con enum) — reemplaza el boolean 'resuelto' mutable
create table pago.yape_revision_estado (
  revision_id uuid not null,
  desde timestamptz not null default now(),
  estado public.estado_revision not null,
  constraint yape_revision_estado_pk primary key (revision_id, desde),
  constraint yape_revision_estado_fk foreign key (revision_id) references pago.yape_revision(id) on delete restrict
);

-- Resolucion (par ganador). Fact table cohesionada (patron acreditacion/reverso).
create table pago.yape_revision_resolucion (
  revision_id uuid not null,
  cobro_id uuid not null,
  txid text not null,
  constraint yape_revision_resolucion_pk primary key (revision_id),
  constraint yape_revision_resolucion_revision_fk foreign key (revision_id) references pago.yape_revision(id) on delete restrict,
  constraint yape_revision_resolucion_cobro_fk foreign key (cobro_id) references pago.cobro(id) on delete restrict,
  constraint yape_revision_resolucion_pago_fk foreign key (txid) references pago.pago_visto(txid) on delete restrict
);

-- REGLA 4: RLS en TODAS + grants solo service_role (nada a anon/authenticated)
alter table pago.yape_revision              enable row level security;
alter table pago.yape_revision_motivo       enable row level security;
alter table pago.yape_revision_monto        enable row level security;
alter table pago.yape_revision_codigo       enable row level security;
alter table pago.yape_revision_nota         enable row level security;
alter table pago.yape_revision_candidato    enable row level security;
alter table pago.yape_revision_pago         enable row level security;
alter table pago.yape_revision_estado       enable row level security;
alter table pago.yape_revision_resolucion   enable row level security;
grant select, insert on pago.yape_revision, pago.yape_revision_motivo, pago.yape_revision_monto,
  pago.yape_revision_codigo, pago.yape_revision_nota, pago.yape_revision_candidato,
  pago.yape_revision_pago, pago.yape_revision_estado, pago.yape_revision_resolucion to service_role;

-- ===== yape_casar_pago (ex yape_match_pago): pago -> cobro, 1:1 o retiene =====
create function pago.yape_casar_pago(p_txid text)
returns void language plpgsql security definer set search_path to 'pago','public'
as $function$
declare v_monto bigint; v_codn text; v_ocurrido timestamptz; v_cands uuid[]; v_n int; c uuid; v_rev uuid;
begin
  perform pg_advisory_xact_lock(hashtext('yape_pago:' || p_txid));
  if exists (select 1 from pago.acreditacion a where a.pago_txid = p_txid) then return; end if;

  select pm.monto_unidad, regexp_replace(pn.nota, '[^0-9]', '', 'g'), po.ocurrido
    into v_monto, v_codn, v_ocurrido
    from pago.pago_visto pv
    join pago.pago_visto_monto    pm on pm.txid = pv.txid
    join pago.pago_visto_nota     pn on pn.txid = pv.txid
    join pago.pago_visto_ocurrido po on po.txid = pv.txid
    where pv.txid = p_txid;
  if v_monto is null then return; end if;

  select array_agg(cd.cobro_id) into v_cands
    from pago.cobro_yape_codigo cd
    join pago.cobro_monto cm on cm.cobro_id = cd.cobro_id and cm.monto_unidad = v_monto
    join pago.cobro c on c.id = cd.cobro_id
    where cd.codigo = v_codn
      and v_ocurrido >= c.creado_en - interval '10 minutes'
      and (select estado from pago.cobro_estado e where e.cobro_id = cd.cobro_id order by desde desc limit 1)
          not in ('confirmado','anulado','revertido','caducado','en_revision');

  v_n := coalesce(array_length(v_cands, 1), 0);
  if v_n = 0 then return; end if;
  if v_n = 1 then perform pago.yape_acreditar_par(v_cands[1], p_txid); return; end if;

  -- AMBIGUO: retener el pago + congelar candidatos + alertar (nunca misrutear)
  insert into pago.pago_visto_estado(txid, estado) values (p_txid, 'revision');
  v_rev := gen_random_uuid();
  insert into pago.yape_revision(id) values (v_rev);
  insert into pago.yape_revision_motivo(revision_id, motivo)        values (v_rev, 'pago_ambiguo');
  insert into pago.yape_revision_monto(revision_id, monto_unidad)   values (v_rev, v_monto);
  insert into pago.yape_revision_codigo(revision_id, codigo)        values (v_rev, v_codn);
  insert into pago.yape_revision_estado(revision_id, estado)        values (v_rev, 'pendiente');
  insert into pago.yape_revision_pago(revision_id, txid)            values (v_rev, p_txid);
  foreach c in array v_cands loop
    insert into pago.yape_revision_candidato(revision_id, cobro_id) values (v_rev, c);
    insert into pago.cobro_estado(cobro_id, estado)                 values (c, 'en_revision');
    perform pago.evento_registrar(c, 'observacion',
      jsonb_build_object('yape_ambiguo', true, 'lado','cobro','revision', v_rev, 'txid', p_txid, 'monto', v_monto, 'codigo', v_codn));
  end loop;
end $function$;

-- ===== yape_casar_cobro (ex yape_match_cobro): cobro -> pago, 1:1 o retiene =====
create function pago.yape_casar_cobro(p_cobro uuid)
returns jsonb language plpgsql security definer set search_path to 'pago','public'
as $function$
declare v_codn text; v_monto bigint; v_creado timestamptz; v_estado public.estado_cobro;
  v_txids text[]; v_n int; t text; v_rev uuid; v_gracia interval := interval '10 minutes';
begin
  perform pg_advisory_xact_lock(hashtext('yape_cobro:' || p_cobro::text));
  select estado into v_estado from pago.cobro_estado where cobro_id = p_cobro order by desde desc limit 1;
  if v_estado = 'confirmado' then return jsonb_build_object('ok', true, 'ya', true); end if;
  if v_estado = 'en_revision' then return jsonb_build_object('ok', false, 'motivo', 'en_revision'); end if;
  if v_estado in ('anulado','revertido','caducado') then
    return jsonb_build_object('ok', false, 'motivo', 'cobro_' || v_estado::text); end if;

  select codigo into v_codn from pago.cobro_yape_codigo where cobro_id = p_cobro;
  if v_codn is null then return jsonb_build_object('ok', false, 'motivo', 'sin_codigo'); end if;
  select monto_unidad into v_monto from pago.cobro_monto where cobro_id = p_cobro;
  select creado_en into v_creado from pago.cobro where id = p_cobro;

  select array_agg(pv.txid) into v_txids
    from pago.pago_visto pv
    join pago.pago_visto_fuente   pf on pf.txid = pv.txid and pf.fuente = 'yape'
    join pago.pago_visto_monto    pm on pm.txid = pv.txid
    join pago.pago_visto_nota     pn on pn.txid = pv.txid
    join pago.pago_visto_ocurrido po on po.txid = pv.txid
    where pm.monto_unidad = v_monto
      and regexp_replace(pn.nota, '[^0-9]', '', 'g') = v_codn
      and po.ocurrido >= v_creado - v_gracia
      and po.ocurrido <= now() + interval '5 minutes'
      and not exists (select 1 from pago.acreditacion a where a.pago_txid = pv.txid)
      and (select estado from pago.pago_visto_estado e where e.txid = pv.txid order by desde desc limit 1)
          not in ('casado','reverso','ignorado','revision');

  v_n := coalesce(array_length(v_txids, 1), 0);
  if v_n = 0 then return jsonb_build_object('ok', false, 'motivo', 'esperando'); end if;
  if v_n = 1 then return pago.yape_acreditar_par(p_cobro, v_txids[1]); end if;

  -- AMBIGUO por el lado del pago: retener
  v_rev := gen_random_uuid();
  insert into pago.yape_revision(id) values (v_rev);
  insert into pago.yape_revision_motivo(revision_id, motivo)      values (v_rev, 'cobro_ambiguo');
  insert into pago.yape_revision_monto(revision_id, monto_unidad) values (v_rev, v_monto);
  insert into pago.yape_revision_codigo(revision_id, codigo)      values (v_rev, v_codn);
  insert into pago.yape_revision_estado(revision_id, estado)      values (v_rev, 'pendiente');
  insert into pago.yape_revision_candidato(revision_id, cobro_id) values (v_rev, p_cobro);
  foreach t in array v_txids loop
    insert into pago.yape_revision_pago(revision_id, txid) values (v_rev, t);
  end loop;
  insert into pago.cobro_estado(cobro_id, estado) values (p_cobro, 'en_revision');
  perform pago.evento_registrar(p_cobro, 'observacion',
    jsonb_build_object('yape_ambiguo', true, 'lado','pago','revision', v_rev, 'monto', v_monto, 'codigo', v_codn, 'pagos', to_jsonb(v_txids)));
  return jsonb_build_object('ok', false, 'motivo', 'en_revision');
end $function$;

-- ===== Resolver (6FN, append-only) =====
create or replace function pago.yape_revision_resolver(p_revision uuid, p_cobro uuid, p_txid text)
returns jsonb language plpgsql security definer set search_path to 'pago','public'
as $function$
declare v_estado_rev public.estado_revision; v_res jsonb; c uuid;
begin
  if not exists (select 1 from pago.yape_revision where id = p_revision) then
    return jsonb_build_object('ok', false, 'motivo', 'revision_desconocida'); end if;
  select estado into v_estado_rev from pago.yape_revision_estado where revision_id = p_revision order by desde desc limit 1;
  if v_estado_rev is distinct from 'pendiente' then
    return jsonb_build_object('ok', false, 'motivo', 'ya_resuelta'); end if;
  if not exists (select 1 from pago.yape_revision_candidato where revision_id = p_revision and cobro_id = p_cobro) then
    return jsonb_build_object('ok', false, 'motivo', 'cobro_fuera_de_revision'); end if;
  if not exists (select 1 from pago.yape_revision_pago where revision_id = p_revision and txid = p_txid) then
    return jsonb_build_object('ok', false, 'motivo', 'txid_fuera_de_revision'); end if;

  v_res := pago.yape_acreditar_par(p_cobro, p_txid);

  insert into pago.yape_revision_resolucion(revision_id, cobro_id, txid) values (p_revision, p_cobro, p_txid);
  insert into pago.yape_revision_estado(revision_id, estado) values (p_revision, 'resuelta');

  for c in select cobro_id from pago.yape_revision_candidato where revision_id = p_revision and cobro_id <> p_cobro loop
    insert into pago.cobro_estado(cobro_id, estado) values (c, 'en_espera');
    perform pago.yape_casar_cobro(c);
  end loop;

  return jsonb_build_object('ok', true, 'resuelto', true, 'acreditacion', v_res);
end $function$;

-- ===== Reapuntar los callers internos al nombre nuevo =====
create or replace function pago.yape_ingerir(p_device text, p_huella text, p_monto_centimos bigint, p_codigo text, p_pagador text, p_ocurrido timestamptz)
returns jsonb language plpgsql security definer set search_path to 'pago','public'
as $function$
declare v_estado text; v_nuevo boolean;
begin
  v_estado := pago.yape_dispositivo_estado(p_device);
  if v_estado <> 'activo' then return jsonb_build_object('ok', false, 'motivo', 'device_' || v_estado); end if;
  update pago.yape_dispositivo set ultimo_visto = now() where device = p_device;
  v_nuevo := pago.pago_ingerir(p_txid => p_huella, p_monto => coalesce(p_monto_centimos, 0), p_moneda => 'pen',
    p_nota => coalesce(p_codigo, ''), p_pagador => coalesce(p_pagador, ''),
    p_ocurrido => coalesce(p_ocurrido, now()), p_tipo => 'yape_recibido', p_fuente => 'yape');
  begin perform pago.yape_casar_pago(p_huella); exception when others then null; end;
  return jsonb_build_object('ok', true, 'nuevo', v_nuevo);
end $function$;

create or replace function pago.yape_declarar(p_usuario uuid, p_cobro uuid, p_codigo text)
returns jsonb language plpgsql security definer set search_path to 'pago','public'
as $function$
declare v_owner uuid; v_codn text; v_intentos int; v_estado public.estado_cobro; v_user_intentos int;
begin
  v_codn := regexp_replace(coalesce(p_codigo, ''), '[^0-9]', '', 'g');
  if length(v_codn) < 3 then return jsonb_build_object('ok', false, 'motivo', 'codigo_invalido'); end if;

  select cu.usuario_id into v_owner from pago.cobro_usuario cu where cu.cobro_id = p_cobro;
  if v_owner is null then return jsonb_build_object('ok', false, 'motivo', 'cobro_desconocido'); end if;
  if v_owner <> p_usuario then raise exception 'no_autorizado'; end if;
  if not exists (select 1 from pago.cobro_metodo where cobro_id = p_cobro and metodo = 'yape') then
    return jsonb_build_object('ok', false, 'motivo', 'no_yape'); end if;

  select estado into v_estado from pago.cobro_estado where cobro_id = p_cobro order by desde desc limit 1;
  if v_estado = 'confirmado' then return jsonb_build_object('ok', true, 'ya', true); end if;
  if v_estado = 'en_revision' then return jsonb_build_object('ok', false, 'motivo', 'en_revision'); end if;
  if v_estado in ('anulado','revertido','caducado') then
    return jsonb_build_object('ok', false, 'motivo', 'cobro_' || v_estado::text); end if;

  select count(*) into v_user_intentos
    from pago.evento e
    join pago.evento_cobro   ec on ec.evento_id = e.id
    join pago.evento_tipo    et on et.evento_id = e.id
    join pago.evento_detalle ed on ed.evento_id = e.id
    join pago.cobro_usuario  cu on cu.cobro_id = ec.cobro_id
    where cu.usuario_id = p_usuario and et.tipo = 'observacion'
      and ed.detalle ? 'yape_declara' and e.ocurrido_en > now() - interval '1 hour'
      and (select estado from pago.cobro_estado ce where ce.cobro_id = ec.cobro_id order by ce.desde desc limit 1) <> 'confirmado';
  if v_user_intentos >= 12 then
    return jsonb_build_object('ok', false, 'motivo', 'bloqueo_temporal', 'minutos', 60);
  end if;

  insert into pago.cobro_yape_codigo(cobro_id, codigo, intentos) values (p_cobro, v_codn, 1)
    on conflict (cobro_id) do update
      set codigo = excluded.codigo,
          intentos = pago.cobro_yape_codigo.intentos
                     + case when pago.cobro_yape_codigo.codigo <> excluded.codigo then 1 else 0 end,
          declarado_en = now();
  select intentos into v_intentos from pago.cobro_yape_codigo where cobro_id = p_cobro;
  if v_intentos > 6 then return jsonb_build_object('ok', false, 'motivo', 'demasiados_intentos'); end if;

  perform pago.evento_registrar(p_cobro, 'observacion', jsonb_build_object('yape_declara', v_codn));
  return pago.yape_casar_cobro(p_cobro);
end $function$;

-- ===== Eliminar los nombres viejos en ingles =====
drop function if exists pago.yape_match_pago(text);
drop function if exists pago.yape_match_cobro(uuid);

-- ===== REGLA 4: bloquear EXECUTE de las funciones nuevas (default de Postgres es PUBLIC) =====
revoke execute on function pago.yape_casar_pago(text)  from public, anon, authenticated;
grant  execute on function pago.yape_casar_pago(text)  to service_role;
revoke execute on function pago.yape_casar_cobro(uuid) from public, anon, authenticated;
grant  execute on function pago.yape_casar_cobro(uuid) to service_role;
revoke execute on function pago.yape_revision_resolver(uuid, uuid, text) from public, anon, authenticated;
grant  execute on function pago.yape_revision_resolver(uuid, uuid, text) to service_role;