-- ANTI-FRAUDE capas 2 y 3 (aditivo):
--  #3 tope de cobros yape PENDIENTES por usuario (anti-spam / superficie de ataque)
--  #2 rate-limit por USUARIO en declaraciones de codigo (anti fuerza bruta) + bloqueo temporal

-- #3 en cobro_crear_yape
create or replace function pago.cobro_crear_yape(
  p_usuario uuid, p_producto text default 'credito', p_creditos integer default 1)
returns jsonb
language plpgsql security definer
set search_path to 'pago','negocio','extensions','public'
as $function$
declare
  v_prod text := lower(coalesce(p_producto, 'credito'));
  v_cred int; v_monto_usd numeric; v_pen numeric; v_centimos bigint;
  v_recarga uuid := gen_random_uuid(); v_cobro uuid := gen_random_uuid();
  v_codigo text; v_vence timestamptz := now() + interval '30 minutes';
  v_precio_cred numeric; v_precio_lic numeric; v_activo text; v_abiertos int;
begin
  if p_usuario is null then raise exception 'usuario_requerido'; end if;
  if not exists (select 1 from negocio.usuario_taller where codigo = p_usuario) then
    raise exception 'usuario_desconocido'; end if;

  -- #3: max 4 cobros yape PENDIENTES (creados, no vencidos) por usuario.
  select count(*) into v_abiertos
    from pago.cobro c
    join pago.cobro_usuario cu on cu.cobro_id = c.id
    join pago.cobro_metodo  cm on cm.cobro_id = c.id and cm.metodo = 'yape'
    join pago.cobro_vencimiento cv on cv.cobro_id = c.id
    where cu.usuario_id = p_usuario and cv.vence_en > now()
      and (select estado from pago.cobro_estado e where e.cobro_id = c.id order by desde desc limit 1) = 'creado';
  if v_abiertos >= 4 then raise exception 'demasiados_cobros_abiertos'; end if;

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

-- #2 en yape_declarar
create or replace function pago.yape_declarar(p_usuario uuid, p_cobro uuid, p_codigo text)
returns jsonb
language plpgsql security definer
set search_path to 'pago','public'
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

  -- #2: rate-limit por USUARIO. Max 12 declaraciones/hora en sus cobros yape.
  select count(*) into v_user_intentos
    from pago.evento e
    join pago.evento_cobro   ec on ec.evento_id = e.id
    join pago.evento_tipo    et on et.evento_id = e.id
    join pago.evento_detalle ed on ed.evento_id = e.id
    join pago.cobro_usuario  cu on cu.cobro_id = ec.cobro_id
    where cu.usuario_id = p_usuario and et.tipo = 'observacion'
      and ed.detalle ? 'yape_declara' and e.ocurrido_en > now() - interval '1 hour';
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
  return pago.yape_match_cobro(p_cobro);
end $function$;