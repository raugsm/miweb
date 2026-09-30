-- Código de nota más corto: ARI-XXXX (4 aleatorios) en vez de ARI-XXXX-XXXX (8).
-- Vencimiento del pago fijo en 20 minutos para TODOS los métodos.

-- 4 chars aleatorios (charset sin ambiguos), único en cobro_codigo.
create or replace function pago.codigo_nuevo()
returns text language plpgsql security definer set search_path to 'pago','extensions','public'
as $function$
declare abc text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; c text; i int; b bytea; intento int := 0;
begin
  loop
    intento := intento + 1;
    b := extensions.gen_random_bytes(4); c := '';
    for i in 0..3 loop c := c || substr(abc, (get_byte(b, i) & 31) + 1, 1); end loop;
    if not exists (select 1 from pago.cobro_codigo where codigo = c) then return c; end if;
    if intento > 50 then raise exception 'no_se_pudo_generar_codigo'; end if;
  end loop;
end $function$;

-- Formato de display: ARI-XXXX (sin guion intermedio).
create or replace function pago.codigo_formato(p text)
returns text language sql immutable set search_path to ''
as $function$ select 'ARI-' || p $function$;

-- Normaliza la nota a los 4 chars (tolera "ARI-", minúsculas, ambiguos y texto sobrante).
create or replace function pago.codigo_normalizar(p text)
returns text language sql immutable set search_path to ''
as $function$
  select left(translate(regexp_replace(regexp_replace(upper(coalesce(p,'')), '^ARI', ''), '[^0-9A-Z]', '', 'g'), 'ILOU', '110V'), 4)
$function$;

-- Vencimiento 20 min en Binance (era 40).
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
  perform pago.evento_registrar(v_cobro, 'creacion', jsonb_build_object('producto', v_prod, 'creditos', v_cred, 'monto_usd', v_monto_usd, 'codigo', v_codigo));

  return jsonb_build_object(
    'cobro_id', v_cobro, 'codigo', v_codigo, 'codigo_formato', pago.codigo_formato(v_codigo),
    'monto_unidad', v_monto, 'monto_texto', trim(to_char(v_monto_usd,'FM999999990.00')),
    'creditos', v_cred, 'producto', v_prod, 'vence_en', v_vence, 'recarga_id', v_recarga
  );
end $function$;

-- Vencimiento 20 min en Yape (era 30).
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
  perform pago.evento_registrar(v_cobro, 'creacion',
    jsonb_build_object('producto', v_prod, 'creditos', v_cred, 'monto_pen', v_pen, 'metodo', 'yape'));

  return jsonb_build_object(
    'cobro_id', v_cobro, 'codigo', v_codigo, 'codigo_formato', pago.codigo_formato(v_codigo),
    'monto_centimos', v_centimos, 'monto_texto', trim(to_char(v_pen, 'FM999999990.00')),
    'moneda', 'PEN', 'creditos', v_cred, 'producto', v_prod,
    'vence_en', v_vence, 'recarga_id', v_recarga);
end $function$;

revoke execute on function pago.cobro_crear(uuid, integer, text) from public, anon, authenticated;
grant  execute on function pago.cobro_crear(uuid, integer, text) to service_role;
revoke execute on function pago.cobro_crear_yape(uuid, text, integer) from public, anon, authenticated;
grant  execute on function pago.cobro_crear_yape(uuid, text, integer) to service_role;
