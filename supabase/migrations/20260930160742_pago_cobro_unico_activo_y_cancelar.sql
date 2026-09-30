-- UN SOLO PAGO ACTIVO A LA VEZ (cualquier metodo) + cobro_activo (resumir) + cobro_cancelar.
-- "abierto" = ultimo estado in (creado, en_espera, retenido, en_revision) Y vence_en > now().

-- Trae el cobro ABIERTO del usuario con todo lo necesario para retomar el flujo (o null).
create or replace function pago.cobro_activo(p_usuario uuid)
returns jsonb language plpgsql security definer set search_path to 'pago','negocio','public'
as $function$
declare v_cobro uuid; v_metodo text; v_estado public.estado_cobro; v_vence timestamptz;
  v_monto bigint; v_moneda text; v_prod text; v_cred int; v_cod text; v_codn text;
  v_monto_texto text; v_destino text; v_pago_url text := '';
begin
  if p_usuario is null then return null; end if;
  select c.id into v_cobro
    from pago.cobro c
    join pago.cobro_usuario cu on cu.cobro_id = c.id
    join pago.cobro_vencimiento cv on cv.cobro_id = c.id
    where cu.usuario_id = p_usuario
      and cv.vence_en > now()
      and (select estado from pago.cobro_estado e where e.cobro_id = c.id order by desde desc limit 1)
          in ('creado','en_espera','retenido','en_revision')
    order by c.creado_en desc
    limit 1;
  if v_cobro is null then return null; end if;

  select metodo into v_metodo from pago.cobro_metodo where cobro_id = v_cobro;
  select estado into v_estado from pago.cobro_estado where cobro_id = v_cobro order by desde desc limit 1;
  select vence_en into v_vence from pago.cobro_vencimiento where cobro_id = v_cobro;
  select monto_unidad into v_monto from pago.cobro_monto where cobro_id = v_cobro;
  select moneda into v_moneda from pago.cobro_moneda where cobro_id = v_cobro;
  select cc.codigo into v_cod from pago.cobro_codigo cc where cc.cobro_id = v_cobro;
  select r.producto, r.creditos into v_prod, v_cred
    from pago.cobro_recarga cr join negocio.recarga r on r.codigo = cr.recarga_id
    where cr.cobro_id = v_cobro;

  if v_metodo = 'yape' then
    v_monto_texto := trim(to_char(v_monto::numeric / 100, 'FM999999990.00'));
    select valor into v_destino from negocio.parametro where clave = 'yape_destino';
    select codigo into v_codn from pago.cobro_yape_codigo where cobro_id = v_cobro;
  else
    v_monto_texto := trim(to_char(v_monto::numeric / 100000000, 'FM999999990.00'));
    select valor into v_destino  from negocio.parametro where clave = 'binance_pay_id';
    select valor into v_pago_url from negocio.parametro where clave = 'binance_pay_url';
  end if;

  return jsonb_build_object(
    'cobro_id', v_cobro,
    'metodo', case when v_metodo = 'yape' then 'yape' else 'binance' end,
    'estado', v_estado,
    'vence_en', v_vence,
    'producto', coalesce(v_prod, 'credito'),
    'creditos', coalesce(v_cred, 0),
    'monto', v_monto_texto,
    'moneda', upper(coalesce(v_moneda, '')),
    'codigo', pago.codigo_formato(v_cod),
    'codigo_declarado', v_codn,
    'destino', coalesce(v_destino, ''),
    'pago_url', coalesce(v_pago_url, '')
  );
end $function$;

-- Cancelar: libera el slot expirando el cobro. Sigue casable en la ventana si ya pago
-- (queda 'creado' vencido; el barredor yape lo caduca luego). No aplica a confirmado.
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
  update pago.cobro_vencimiento set vence_en = now() where cobro_id = p_cobro;
  perform pago.evento_registrar(p_cobro, 'observacion', jsonb_build_object('cancelado', true));
  return jsonb_build_object('ok', true, 'cancelado', true);
end $function$;

-- Guard un-solo-activo en cobro_crear (Binance): reemplaza la ausencia de tope.
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

-- Guard un-solo-activo en cobro_crear_yape: reemplaza el tope de 4.
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

revoke execute on function pago.cobro_activo(uuid) from public, anon, authenticated;
grant  execute on function pago.cobro_activo(uuid) to service_role;
revoke execute on function pago.cobro_cancelar(uuid, uuid) from public, anon, authenticated;
grant  execute on function pago.cobro_cancelar(uuid, uuid) to service_role;
revoke execute on function pago.cobro_crear(uuid, integer, text) from public, anon, authenticated;
grant  execute on function pago.cobro_crear(uuid, integer, text) to service_role;
revoke execute on function pago.cobro_crear_yape(uuid, text, integer) from public, anon, authenticated;
grant  execute on function pago.cobro_crear_yape(uuid, text, integer) to service_role;