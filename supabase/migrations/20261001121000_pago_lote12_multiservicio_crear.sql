-- LOTE 12 — Creación multi-servicio (ADITIVO).
-- (B) cobro_crear_servicio: + p_servicio, p_referencia_externa, p_idempotency_key.
--     Idempotencia: misma idempotency_key -> devuelve el cobro EXISTENTE (no crea otro).
--     Etiqueta el cobro en pago.cobro_servicio. Devuelve servicio + referencia_externa.
-- Auto-tag: cobro_crear (créditos) y cobro_crear_yape etiquetan servicio=creditos|licencia.
-- No cambia la vía feliz: montos/validaciones/exactly-once intactos.

-- cobro_crear_servicio: nueva firma (la vieja de 3 args se reemplaza). El edge la llama por
-- nombre (p_usuario/p_monto_usd/p_motivo) -> sigue resolviendo con los defaults nuevos.
drop function if exists pago.cobro_crear_servicio(uuid, numeric, text);

create function pago.cobro_crear_servicio(
  p_usuario uuid,
  p_monto_usd numeric,
  p_motivo text default 'servicio',
  p_servicio text default 'servicio',
  p_referencia_externa text default null,
  p_idempotency_key text default null
) returns jsonb language plpgsql security definer set search_path to 'pago','negocio','extensions','public'
as $function$
declare
  v_cobro uuid; v_codigo text; v_vence timestamptz := now() + interval '40 minutes'; v_monto bigint;
  v_serv text := coalesce(nullif(trim(p_servicio), ''), 'servicio');
  v_ref  text := nullif(trim(coalesce(p_referencia_externa, '')), '');
  v_key  text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  v_existe uuid;
begin
  if p_usuario is null then raise exception 'usuario_requerido'; end if;
  if not exists (select 1 from negocio.usuario_taller where codigo = p_usuario) then raise exception 'usuario_desconocido'; end if;
  if p_monto_usd is null or p_monto_usd <= 0 or p_monto_usd > 5000 then raise exception 'monto_invalido'; end if;
  if round(p_monto_usd, 2) <> p_monto_usd then raise exception 'monto_invalido'; end if;

  -- Idempotencia: misma key -> devolver el cobro existente, no crear otro.
  if v_key is not null then
    perform pg_advisory_xact_lock(hashtext('cobro_idem:' || v_key));
    select cobro_id into v_existe from pago.cobro_idem where idempotency_key = v_key;
    if v_existe is not null then
      return jsonb_build_object(
        'cobro_id', v_existe,
        'codigo', (select codigo from pago.cobro_codigo where cobro_id = v_existe),
        'codigo_formato', pago.codigo_formato((select codigo from pago.cobro_codigo where cobro_id = v_existe)),
        'monto_unidad', (select monto_unidad from pago.cobro_monto where cobro_id = v_existe),
        'monto_texto', trim(to_char((select monto_unidad from pago.cobro_monto where cobro_id = v_existe) / 100000000.0, 'FM999999990.00')),
        'producto', 'servicio',
        'servicio', (select servicio from pago.cobro_servicio where cobro_id = v_existe),
        'referencia_externa', (select referencia_externa from pago.cobro_servicio where cobro_id = v_existe),
        'vence_en', (select vence_en from pago.cobro_vencimiento where cobro_id = v_existe),
        'idempotente', true
      );
    end if;
  end if;

  v_monto := (p_monto_usd * 100000000)::bigint;
  v_cobro := gen_random_uuid();
  v_codigo := pago.codigo_nuevo();
  insert into pago.cobro(id) values (v_cobro);
  insert into pago.cobro_usuario(cobro_id, usuario_id) values (v_cobro, p_usuario);
  insert into pago.cobro_codigo(cobro_id, codigo) values (v_cobro, v_codigo);
  insert into pago.cobro_monto(cobro_id, monto_unidad) values (v_cobro, v_monto);
  insert into pago.cobro_moneda(cobro_id, moneda) values (v_cobro, 'usd');
  insert into pago.cobro_metodo(cobro_id, metodo) values (v_cobro, 'binance_pay_c2c');
  insert into pago.cobro_vencimiento(cobro_id, vence_en) values (v_cobro, v_vence);
  insert into pago.cobro_estado(cobro_id, estado) values (v_cobro, 'creado');
  insert into pago.cobro_servicio(cobro_id, servicio, referencia_externa) values (v_cobro, v_serv, v_ref);
  if v_key is not null then
    insert into pago.cobro_idem(idempotency_key, cobro_id) values (v_key, v_cobro);
  end if;
  perform pago.evento_registrar(v_cobro, 'creacion',
    jsonb_build_object('producto', 'servicio', 'servicio', v_serv, 'referencia_externa', v_ref,
      'motivo', left(coalesce(p_motivo, ''), 160), 'monto_usd', p_monto_usd, 'codigo', v_codigo));

  return jsonb_build_object(
    'cobro_id', v_cobro, 'codigo', v_codigo, 'codigo_formato', pago.codigo_formato(v_codigo),
    'monto_unidad', v_monto, 'monto_texto', trim(to_char(p_monto_usd, 'FM999999990.00')),
    'producto', 'servicio', 'servicio', v_serv, 'referencia_externa', v_ref, 'vence_en', v_vence
  );
end $function$;

revoke execute on function pago.cobro_crear_servicio(uuid,numeric,text,text,text,text) from public, anon, authenticated;
grant  execute on function pago.cobro_crear_servicio(uuid,numeric,text,text,text,text) to service_role;

-- cobro_crear (créditos/licencia): etiqueta automática servicio=creditos|licencia.
create or replace function pago.cobro_crear(p_usuario uuid, p_creditos integer DEFAULT 1, p_producto text DEFAULT 'credito'::text)
 returns jsonb language plpgsql security definer set search_path to 'pago','negocio','extensions','public'
as $function$
declare
  v_prod text := lower(coalesce(p_producto,'credito'));
  v_cred int; v_monto_usd numeric; v_monto bigint;
  v_recarga uuid := gen_random_uuid(); v_cobro uuid := gen_random_uuid();
  v_codigo text; v_vence timestamptz := now() + interval '20 minutes';
begin
  if p_usuario is null then raise exception 'usuario_requerido'; end if;
  if not exists (select 1 from negocio.usuario_taller where codigo = p_usuario) then raise exception 'usuario_desconocido'; end if;

  perform pg_advisory_xact_lock(hashtext('cobro_crear:' || p_usuario::text));

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
  insert into pago.cobro_servicio(cobro_id, servicio) values (v_cobro, case when v_prod = 'licencia' then 'licencia' else 'creditos' end);
  perform pago.evento_registrar(v_cobro, 'creacion', jsonb_build_object('producto', v_prod, 'creditos', v_cred, 'monto_usd', v_monto_usd, 'codigo', v_codigo));

  return jsonb_build_object(
    'cobro_id', v_cobro, 'codigo', v_codigo, 'codigo_formato', pago.codigo_formato(v_codigo),
    'monto_unidad', v_monto, 'monto_texto', trim(to_char(v_monto_usd,'FM999999990.00')),
    'creditos', v_cred, 'producto', v_prod, 'vence_en', v_vence, 'recarga_id', v_recarga
  );
end $function$;

-- cobro_crear_yape: etiqueta automática servicio=creditos|licencia.
create or replace function pago.cobro_crear_yape(p_usuario uuid, p_producto text DEFAULT 'credito'::text, p_creditos integer DEFAULT 1)
 returns jsonb language plpgsql security definer set search_path to 'pago','negocio','extensions','public'
as $function$
declare
  v_prod text := lower(coalesce(p_producto, 'credito'));
  v_cred int; v_monto_usd numeric; v_pen numeric; v_centimos bigint;
  v_recarga uuid := gen_random_uuid(); v_cobro uuid := gen_random_uuid();
  v_codigo text; v_vence timestamptz := now() + interval '20 minutes';
  v_precio_cred numeric; v_precio_lic numeric; v_activo text;
begin
  if p_usuario is null then raise exception 'usuario_requerido'; end if;
  if not exists (select 1 from negocio.usuario_taller where codigo = p_usuario) then
    raise exception 'usuario_desconocido'; end if;

  perform pg_advisory_xact_lock(hashtext('cobro_crear:' || p_usuario::text));

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
  insert into pago.cobro_servicio(cobro_id, servicio)  values (v_cobro, case when v_prod = 'licencia' then 'licencia' else 'creditos' end);
  perform pago.evento_registrar(v_cobro, 'creacion',
    jsonb_build_object('producto', v_prod, 'creditos', v_cred, 'monto_pen', v_pen, 'metodo', 'yape'));

  return jsonb_build_object(
    'cobro_id', v_cobro, 'codigo', v_codigo, 'codigo_formato', pago.codigo_formato(v_codigo),
    'monto_centimos', v_centimos, 'monto_texto', trim(to_char(v_pen, 'FM999999990.00')),
    'moneda', 'PEN', 'creditos', v_cred, 'producto', v_prod,
    'vence_en', v_vence, 'recarga_id', v_recarga);
end $function$;

revoke execute on function pago.cobro_crear(uuid, integer, text)      from public, anon, authenticated;
grant  execute on function pago.cobro_crear(uuid, integer, text)      to service_role;
revoke execute on function pago.cobro_crear_yape(uuid, text, integer) from public, anon, authenticated;
grant  execute on function pago.cobro_crear_yape(uuid, text, integer) to service_role;
