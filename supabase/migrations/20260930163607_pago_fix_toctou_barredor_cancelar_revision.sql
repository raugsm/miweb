-- FIX auditoría: (1) TOCTOU en el guard un-solo-activo -> advisory lock por usuario;
-- (2) barredor caduca cobros de TODOS los métodos (no solo yape) + conciliar excluye
-- 'caducado' (acota Binance cancelado/vencido); (3) cobro_cancelar no libera en_revision/retenido.

-- (1) cobro_crear (Binance) con lock
create or replace function pago.cobro_crear(p_usuario uuid, p_creditos integer DEFAULT 1, p_producto text DEFAULT 'credito'::text)
returns jsonb language plpgsql security definer set search_path to 'pago','negocio','extensions','public'
as $function$
declare
  v_prod text := lower(coalesce(p_producto,'credito'));
  v_cred int; v_monto_usd numeric; v_monto bigint;
  v_recarga uuid := gen_random_uuid(); v_cobro uuid := gen_random_uuid();
  v_codigo text; v_vence timestamptz := now() + interval '40 minutes';
begin
  if p_usuario is null then raise exception 'usuario_requerido'; end if;
  if not exists (select 1 from negocio.usuario_taller where codigo = p_usuario) then raise exception 'usuario_desconocido'; end if;

  perform pg_advisory_xact_lock(hashtext('cobro_crear:' || p_usuario::text));  -- serializa creación por usuario (anti TOCTOU)

  if exists (
    select 1 from pago.cobro c
    join pago.cobro_usuario cu on cu.cobro_id = c.id
    join pago.cobro_vencimiento cv on cv.cobro_id = c.id
    where cu.usuario_id = p_usuario and cv.vence_en > now()
      and (select estado from pago.cobro_estado e where e.cobro_id = c.id order by desde desc limit 1)
          in ('creado','en_espera','retenido','en_revision')
  ) then raise exception 'cobro_en_curso'; end if;

  if v_prod = 'licencia' then
    v_cred := 0; v_monto_usd := 45;
  else
    v_prod := 'credito';
    v_cred := greatest(1, least(5000, coalesce(p_creditos,1)));
    v_monto_usd := v_cred;
  end if;
  v_monto := (v_monto_usd * 100000000)::bigint;

  insert into negocio.recarga(codigo, usuario_ref, creditos, monto_usd, token, estado, creado, producto)
    values (v_recarga, p_usuario, v_cred, v_monto_usd, encode(extensions.gen_random_bytes(16),'hex'), 'pendiente', now(), v_prod);
  v_codigo := pago.codigo_nuevo();
  insert into pago.cobro(id) values (v_cobro);
  insert into pago.cobro_recarga(cobro_id, recarga_id) values (v_cobro, v_recarga);
  insert into pago.cobro_usuario(cobro_id, usuario_id) values (v_cobro, p_usuario);
  insert into pago.cobro_codigo(cobro_id, codigo) values (v_cobro, v_codigo);
  insert into pago.cobro_monto(cobro_id, monto_unidad) values (v_cobro, v_monto);
  insert into pago.cobro_moneda(cobro_id, moneda) values (v_cobro, 'usd');
  insert into pago.cobro_metodo(cobro_id, metodo) values (v_cobro, 'binance_pay_c2c');
  insert into pago.cobro_vencimiento(cobro_id, vence_en) values (v_cobro, v_vence);
  insert into pago.cobro_estado(cobro_id, estado) values (v_cobro, 'creado');
  perform pago.evento_registrar(v_cobro, 'creacion', jsonb_build_object('producto', v_prod, 'creditos', v_cred, 'monto_usd', v_monto_usd, 'codigo', v_codigo));

  return jsonb_build_object(
    'cobro_id', v_cobro, 'codigo', v_codigo, 'codigo_formato', pago.codigo_formato(v_codigo),
    'monto_unidad', v_monto, 'monto_texto', trim(to_char(v_monto_usd,'FM999999990.00')),
    'creditos', v_cred, 'producto', v_prod, 'vence_en', v_vence, 'recarga_id', v_recarga
  );
end $function$;

-- (1) cobro_crear_yape con lock
create or replace function pago.cobro_crear_yape(p_usuario uuid, p_producto text DEFAULT 'credito'::text, p_creditos integer DEFAULT 1)
returns jsonb language plpgsql security definer set search_path to 'pago','negocio','extensions','public'
as $function$
declare
  v_prod text := lower(coalesce(p_producto, 'credito'));
  v_cred int; v_monto_usd numeric; v_pen numeric; v_centimos bigint;
  v_recarga uuid := gen_random_uuid(); v_cobro uuid := gen_random_uuid();
  v_codigo text; v_vence timestamptz := now() + interval '30 minutes';
  v_precio_cred numeric; v_precio_lic numeric; v_activo text;
begin
  if p_usuario is null then raise exception 'usuario_requerido'; end if;
  if not exists (select 1 from negocio.usuario_taller where codigo = p_usuario) then
    raise exception 'usuario_desconocido'; end if;

  perform pg_advisory_xact_lock(hashtext('cobro_crear:' || p_usuario::text));  -- serializa creación por usuario (anti TOCTOU)

  if exists (
    select 1 from pago.cobro c
    join pago.cobro_usuario cu on cu.cobro_id = c.id
    join pago.cobro_vencimiento cv on cv.cobro_id = c.id
    where cu.usuario_id = p_usuario and cv.vence_en > now()
      and (select estado from pago.cobro_estado e where e.cobro_id = c.id order by desde desc limit 1)
          in ('creado','en_espera','retenido','en_revision')
  ) then raise exception 'cobro_en_curso'; end if;

  select valor into v_activo from negocio.parametro where clave = 'yape_activo';
  if coalesce(v_activo, 'false') <> 'true' then raise exception 'yape_inactivo'; end if;
  select valor::numeric into v_precio_cred from negocio.parametro where clave = 'yape_precio_credito_pen';
  select valor::numeric into v_precio_lic  from negocio.parametro where clave = 'yape_precio_licencia_pen';

  if v_prod = 'licencia' then
    v_cred := 0; v_monto_usd := 45; v_pen := v_precio_lic;
  else
    v_prod := 'credito';
    v_cred := greatest(1, least(5000, coalesce(p_creditos, 1)));
    v_monto_usd := v_cred; v_pen := v_precio_cred * v_cred;
  end if;
  if v_pen is null or v_pen <= 0 then raise exception 'precio_no_configurado'; end if;
  v_centimos := round(v_pen * 100)::bigint;

  insert into negocio.recarga(codigo, usuario_ref, creditos, monto_usd, token, estado, creado, producto)
    values (v_recarga, p_usuario, v_cred, v_monto_usd,
            encode(extensions.gen_random_bytes(16), 'hex'), 'pendiente', now(), v_prod);

  v_codigo := pago.codigo_nuevo();
  insert into pago.cobro(id) values (v_cobro);
  insert into pago.cobro_recarga(cobro_id, recarga_id) values (v_cobro, v_recarga);
  insert into pago.cobro_usuario(cobro_id, usuario_id) values (v_cobro, p_usuario);
  insert into pago.cobro_codigo(cobro_id, codigo)      values (v_cobro, v_codigo);
  insert into pago.cobro_monto(cobro_id, monto_unidad) values (v_cobro, v_centimos);
  insert into pago.cobro_moneda(cobro_id, moneda)      values (v_cobro, 'pen');
  insert into pago.cobro_metodo(cobro_id, metodo)      values (v_cobro, 'yape');
  insert into pago.cobro_vencimiento(cobro_id, vence_en) values (v_cobro, v_vence);
  insert into pago.cobro_estado(cobro_id, estado)      values (v_cobro, 'creado');
  perform pago.evento_registrar(v_cobro, 'creacion',
    jsonb_build_object('producto', v_prod, 'creditos', v_cred, 'monto_pen', v_pen, 'metodo', 'yape'));

  return jsonb_build_object(
    'cobro_id', v_cobro, 'codigo', v_codigo, 'codigo_formato', pago.codigo_formato(v_codigo),
    'monto_centimos', v_centimos, 'monto_texto', trim(to_char(v_pen, 'FM999999990.00')),
    'moneda', 'PEN', 'creditos', v_cred, 'producto', v_prod,
    'vence_en', v_vence, 'recarga_id', v_recarga);
end $function$;

-- (3) cobro_cancelar: no liberar cobros en revisión/retenidos (plata en juego)
create or replace function pago.cobro_cancelar(p_usuario uuid, p_cobro uuid)
returns jsonb language plpgsql security definer set search_path to 'pago','public'
as $function$
declare v_owner uuid; v_estado public.estado_cobro;
begin
  select usuario_id into v_owner from pago.cobro_usuario where cobro_id = p_cobro;
  if v_owner is null then return jsonb_build_object('ok', false, 'motivo', 'cobro_desconocido'); end if;
  if v_owner <> p_usuario then raise exception 'no_autorizado'; end if;
  select estado into v_estado from pago.cobro_estado where cobro_id = p_cobro order by desde desc limit 1;
  if v_estado = 'confirmado' then return jsonb_build_object('ok', true, 'ya', true); end if;
  if v_estado in ('en_revision','retenido') then
    return jsonb_build_object('ok', false, 'motivo', 'en_revision');
  end if;
  update pago.cobro_vencimiento set vence_en = now() where cobro_id = p_cobro;
  perform pago.evento_registrar(p_cobro, 'observacion', jsonb_build_object('cancelado', true));
  return jsonb_build_object('ok', true, 'cancelado', true);
end $function$;

-- (2a) barredor: caduca cobros vencidos de CUALQUIER método (no solo yape)
create or replace function pago.yape_barrer()
returns jsonb language plpgsql security definer set search_path to 'pago','negocio','public'
as $function$
declare v_cad int := 0; v_orf int := 0; r record;
begin
  for r in
    select c.id
    from pago.cobro c
    join pago.cobro_vencimiento cv on cv.cobro_id = c.id
    where cv.vence_en < now()
      and (select estado from pago.cobro_estado e where e.cobro_id = c.id order by desde desc limit 1)
          in ('creado','en_espera','retenido')
  loop
    insert into pago.cobro_estado(cobro_id, estado) values (r.id, 'caducado');
    v_cad := v_cad + 1;
  end loop;

  for r in
    select pv.txid
    from pago.pago_visto pv
    join pago.pago_visto_fuente   pf on pf.txid = pv.txid and pf.fuente = 'yape'
    join pago.pago_visto_ocurrido po on po.txid = pv.txid
    where po.ocurrido < now() - interval '24 hours'
      and not exists (select 1 from pago.acreditacion a where a.pago_txid = pv.txid)
      and (select estado from pago.pago_visto_estado e where e.txid = pv.txid order by desde desc limit 1)
          in ('nuevo','sin_codigo')
  loop
    insert into pago.pago_visto_estado(txid, estado) values (r.txid, 'ignorado');
    v_orf := v_orf + 1;
  end loop;

  return jsonb_build_object('ok', true, 'caducados', v_cad, 'huerfanos', v_orf);
end $function$;

-- (2b) conciliar: excluir 'caducado' del casado Binance (acota cobros vencidos/cancelados)
create or replace function pago.conciliar()
returns jsonb language plpgsql security definer set search_path to 'pago','negocio','public'
as $function$
declare r record; v_cobro uuid; v_monto bigint; v_cred int; v_creado timestamptz; v_estado public.estado_cobro;
        v_es_recarga boolean;
        v_umbral int := coalesce(current_setting('pago.umbral_hold', true)::int, 200); v_acred int := 0;
begin
  for r in
    select pv.txid, pm.monto_unidad, pmo.moneda, pn.nota, pv.visto_en, pt.tipo
    from pago.pago_visto pv
    join pago.pago_visto_estado pe on pe.txid = pv.txid
      and pe.desde = (select max(desde) from pago.pago_visto_estado x where x.txid = pv.txid)
    left join pago.pago_visto_monto pm on pm.txid = pv.txid
    left join pago.pago_visto_moneda pmo on pmo.txid = pv.txid
    left join pago.pago_visto_nota pn on pn.txid = pv.txid
    left join pago.pago_visto_tipo pt on pt.txid = pv.txid
    where pe.estado = 'nuevo'
  loop
    if upper(coalesce(r.moneda,'')) <> 'USDT' then
      insert into pago.pago_visto_estado(txid, estado) values (r.txid, 'ignorado'); continue;
    end if;
    if r.tipo ~* 'REFUND|REVERS|_RF' or coalesce(r.monto_unidad,0) <= 0 then
      insert into pago.pago_visto_estado(txid, estado) values (r.txid, 'reverso'); continue;
    end if;
    select cc.cobro_id into v_cobro from pago.cobro_codigo cc where cc.codigo = pago.codigo_normalizar(r.nota) limit 1;
    if v_cobro is null then
      insert into pago.pago_visto_estado(txid, estado) values (r.txid, 'sin_codigo'); continue;
    end if;
    select cm.monto_unidad, cb.creado_en, rec.creditos, (cr.cobro_id is not null)
      into v_monto, v_creado, v_cred, v_es_recarga
      from pago.cobro_monto cm join pago.cobro cb on cb.id = cm.cobro_id
      left join pago.cobro_recarga cr on cr.cobro_id = cm.cobro_id
      left join negocio.recarga rec on rec.codigo = cr.recarga_id
      where cm.cobro_id = v_cobro;
    select estado into v_estado from pago.cobro_estado where cobro_id = v_cobro order by desde desc limit 1;
    if v_estado in ('confirmado','revertido','anulado','caducado') then
      insert into pago.pago_visto_estado(txid, estado) values (r.txid, 'duplicado'); continue;
    end if;
    if r.monto_unidad <> v_monto then
      insert into pago.pago_visto_estado(txid, estado) values (r.txid, 'monto_distinto'); continue;
    end if;
    if v_creado > r.visto_en then
      insert into pago.pago_visto_estado(txid, estado) values (r.txid, 'revision'); continue;
    end if;
    if coalesce(v_es_recarga, false) and v_cred > v_umbral then
      insert into pago.cobro_estado(cobro_id, estado) values (v_cobro, 'retenido');
      insert into pago.pago_visto_estado(txid, estado) values (r.txid, 'revision');
      perform pago.evento_registrar(v_cobro, 'retencion', jsonb_build_object('txid', r.txid, 'creditos', v_cred)); continue;
    end if;
    if coalesce(v_es_recarga, false) then
      if pago.cobro_acreditar(v_cobro, r.txid) then
        insert into pago.pago_visto_estado(txid, estado) values (r.txid, 'casado'); v_acred := v_acred + 1;
      else
        insert into pago.pago_visto_estado(txid, estado) values (r.txid, 'duplicado');
      end if;
    else
      if pago.cobro_confirmar_servicio(v_cobro, r.txid) then
        insert into pago.pago_visto_estado(txid, estado) values (r.txid, 'casado'); v_acred := v_acred + 1;
      else
        insert into pago.pago_visto_estado(txid, estado) values (r.txid, 'duplicado');
      end if;
    end if;
  end loop;
  return jsonb_build_object('acreditados', v_acred);
end $function$;

revoke execute on function pago.cobro_crear(uuid, integer, text) from public, anon, authenticated;
grant  execute on function pago.cobro_crear(uuid, integer, text) to service_role;
revoke execute on function pago.cobro_crear_yape(uuid, text, integer) from public, anon, authenticated;
grant  execute on function pago.cobro_crear_yape(uuid, text, integer) to service_role;
revoke execute on function pago.cobro_cancelar(uuid, uuid) from public, anon, authenticated;
grant  execute on function pago.cobro_cancelar(uuid, uuid) to service_role;