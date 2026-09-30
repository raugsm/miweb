-- SATURACION #1 (colision/mis-ruteo) + #2 (rafagas): casar SOLO 1:1; si hay
-- ambiguedad (mismo monto+codigo de 3 digitos), RETENER + alertar (nunca mis-rutear).
-- Advisory locks para serializar procesamiento del mismo pago/cobro bajo rafaga.

-- Cola de revision para pares ambiguos (los resuelve el operador / resolver).
create table if not exists pago.yape_revision (
  id            uuid primary key default gen_random_uuid(),
  motivo        text not null,                 -- 'pago_ambiguo' | 'cobro_ambiguo'
  txid          text,                          -- pago involucrado (lado pago_ambiguo)
  monto_unidad  bigint,
  codigo        text,
  candidatos    uuid[] not null default '{}',  -- cobros candidatos
  pagos         text[] not null default '{}',  -- pagos candidatos (lado cobro_ambiguo)
  creado_en     timestamptz not null default now(),
  resuelto      boolean not null default false,
  resuelto_en   timestamptz,
  resuelto_cobro uuid,
  nota          text
);
create index if not exists yape_revision_pendiente on pago.yape_revision(creado_en) where resuelto = false;

-- PAGO -> COBRO (llamado al ingerir un pago): casa 1:1 o retiene.
create or replace function pago.yape_match_pago(p_txid text)
returns void
language plpgsql security definer set search_path to 'pago','public'
as $function$
declare v_monto bigint; v_codn text; v_ocurrido timestamptz; v_cands uuid[]; v_n int; c uuid;
begin
  perform pg_advisory_xact_lock(hashtext('yape_pago:' || p_txid));   -- anti-rafaga (mismo pago)
  if exists (select 1 from pago.acreditacion a where a.pago_txid = p_txid) then return; end if;

  select pm.monto_unidad, regexp_replace(pn.nota, '[^0-9]', '', 'g'), po.ocurrido
    into v_monto, v_codn, v_ocurrido
    from pago.pago_visto pv
    join pago.pago_visto_monto    pm on pm.txid = pv.txid
    join pago.pago_visto_nota     pn on pn.txid = pv.txid
    join pago.pago_visto_ocurrido po on po.txid = pv.txid
    where pv.txid = p_txid;
  if v_monto is null then return; end if;

  -- candidatos: cobros pendientes con ese codigo+monto dentro de ventana (excluye terminales y en_revision)
  select array_agg(cd.cobro_id) into v_cands
    from pago.cobro_yape_codigo cd
    join pago.cobro_monto cm on cm.cobro_id = cd.cobro_id and cm.monto_unidad = v_monto
    join pago.cobro c on c.id = cd.cobro_id
    where cd.codigo = v_codn
      and v_ocurrido >= c.creado_en - interval '10 minutes'
      and (select estado from pago.cobro_estado e where e.cobro_id = cd.cobro_id order by desde desc limit 1)
          not in ('confirmado','anulado','revertido','caducado','en_revision');

  v_n := coalesce(array_length(v_cands, 1), 0);
  if v_n = 0 then return; end if;                         -- aun no hay cobro (esperando)
  if v_n = 1 then perform pago.yape_acreditar_par(v_cands[1], p_txid); return; end if;

  -- AMBIGUO: no misrutear. Retener el pago + congelar candidatos + alertar.
  insert into pago.pago_visto_estado(txid, estado) values (p_txid, 'revision');
  insert into pago.yape_revision(motivo, txid, monto_unidad, codigo, candidatos)
    values ('pago_ambiguo', p_txid, v_monto, v_codn, v_cands);
  foreach c in array v_cands loop
    insert into pago.cobro_estado(cobro_id, estado) values (c, 'en_revision');
    perform pago.evento_registrar(c, 'observacion',
      jsonb_build_object('yape_ambiguo', true, 'lado', 'cobro', 'txid', p_txid, 'monto', v_monto, 'codigo', v_codn));
  end loop;
end $function$;

-- COBRO -> PAGO (llamado al declarar el codigo): casa 1:1 o retiene.
create or replace function pago.yape_match_cobro(p_cobro uuid)
returns jsonb
language plpgsql security definer set search_path to 'pago','public'
as $function$
declare v_codn text; v_monto bigint; v_creado timestamptz; v_estado public.estado_cobro;
  v_txids text[]; v_n int; v_gracia interval := interval '10 minutes';
begin
  perform pg_advisory_xact_lock(hashtext('yape_cobro:' || p_cobro::text));   -- anti-rafaga (mismo cobro)

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

  -- AMBIGUO por el lado del pago (2+ pagos sin casar con mismo monto+codigo): retener.
  insert into pago.cobro_estado(cobro_id, estado) values (p_cobro, 'en_revision');
  insert into pago.yape_revision(motivo, monto_unidad, codigo, candidatos, pagos)
    values ('cobro_ambiguo', v_monto, v_codn, array[p_cobro], v_txids);
  perform pago.evento_registrar(p_cobro, 'observacion',
    jsonb_build_object('yape_ambiguo', true, 'lado', 'pago', 'monto', v_monto, 'codigo', v_codn, 'pagos', to_jsonb(v_txids)));
  return jsonb_build_object('ok', false, 'motivo', 'en_revision');
end $function$;

-- RESOLVER (admin): elige el par ganador, acredita, y descongela + re-casa a los otros.
create or replace function pago.yape_revision_resolver(p_revision uuid, p_cobro uuid, p_txid text)
returns jsonb
language plpgsql security definer set search_path to 'pago','public'
as $function$
declare v pago.yape_revision%rowtype; v_res jsonb; c uuid;
begin
  select * into v from pago.yape_revision where id = p_revision;
  if v.id is null then return jsonb_build_object('ok', false, 'motivo', 'revision_desconocida'); end if;
  if v.resuelto then return jsonb_build_object('ok', false, 'motivo', 'ya_resuelto'); end if;
  if not (p_cobro = any(v.candidatos)) then return jsonb_build_object('ok', false, 'motivo', 'cobro_fuera_de_revision'); end if;
  if v.motivo = 'pago_ambiguo' then
    if p_txid is distinct from v.txid then return jsonb_build_object('ok', false, 'motivo', 'txid_no_coincide'); end if;
  else
    if not (p_txid = any(v.pagos)) then return jsonb_build_object('ok', false, 'motivo', 'txid_fuera_de_revision'); end if;
  end if;

  v_res := pago.yape_acreditar_par(p_cobro, p_txid);

  foreach c in array v.candidatos loop
    if c <> p_cobro then
      insert into pago.cobro_estado(cobro_id, estado) values (c, 'en_espera');
      perform pago.yape_match_cobro(c);   -- que retome su propio pago si lo hay
    end if;
  end loop;

  update pago.yape_revision
     set resuelto = true, resuelto_en = now(), resuelto_cobro = p_cobro,
         nota = coalesce(nota,'') || ' resuelto->' || p_txid
   where id = p_revision;

  return jsonb_build_object('ok', true, 'resuelto', true, 'acreditacion', v_res);
end $function$;