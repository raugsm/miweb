-- YAPE (Peru) — paso 2 de 2: MOTOR (aditivo). Reusa el engine 6NF de `pago`
-- (cobro + satelites + acreditacion exactly-once) y las funciones de negocio
-- (credito_mover / licencia_otorgar). NO toca nada de Binance/MixPay/Izipay.
--
-- Modelo Yape PROPIO (estilo BiPe/OkeyPay pero robusto): un telefono lee la notif
-- de Yape y la postea FIRMADA (HMAC) al webhook -> se guarda como `pago_visto`
-- (fuente='yape'). El pago NO se acredita solo: el CLIENTE ingresa en la web el
-- CODIGO DE SEGURIDAD de 3 digitos de su comprobante. El backend CASA:
--   codigo_ingresado == nota del pago_visto  +  monto exacto  +  ventana de tiempo
-- => doble verificacion. Nadie acredita sin haber pagado de verdad.

-- 1) PARAMETROS. Precios en soles + interruptor + destino + version del APK.
--    Editables sin tocar codigo. yape_activo arranca en 'false' (cobro inerte hasta
--    que el dueno lo prenda). yape_destino = numero/nombre Yape a mostrar al cliente.
--    yape_apk_* alimentan el auto-update del telefono (ver yape_version).
insert into negocio.parametro(clave, valor) values
  ('yape_precio_credito_pen',  '3.50'),   -- 1 credito = 1 USD ~ S/3.50
  ('yape_precio_licencia_pen', '157.50'), -- licencia anual = 45 USD ~ S/157.50
  ('yape_activo',              'false'),  -- prender cuando este todo probado
  ('yape_destino',             ''),       -- numero/nombre Yape de Ariad (lo llena el dueno)
  ('yape_apk_version_code',    '0'),      -- 0 = no hay update publicado
  ('yape_apk_version_nombre',  ''),
  ('yape_apk_url',             ''),
  ('yape_apk_sha256',          ''),
  ('yape_apk_obligatorio',     'false')
on conflict (clave) do nothing;

-- 2) ALLOWLIST + SALUD DE TELEFONOS. Solo un device activo puede acreditar. RLS
--    deny-all + grants solo service_role (rule 3). Un device nuevo se auto-registra
--    INACTIVO (ya probo tener el secreto via HMAC): el dueno lo activa a mano.
create table if not exists pago.yape_dispositivo (
  device        text primary key,
  etiqueta      text not null default '',
  activo        boolean not null default false,
  alta          timestamptz not null default now(),
  ultimo_visto  timestamptz,
  ultimo_latido timestamptz,
  pendientes    integer,
  version_code  bigint
);
alter table pago.yape_dispositivo add column if not exists ultimo_latido timestamptz;
alter table pago.yape_dispositivo add column if not exists pendientes    integer;
alter table pago.yape_dispositivo add column if not exists version_code  bigint;
alter table pago.yape_dispositivo enable row level security;
revoke all on pago.yape_dispositivo from anon, authenticated;
grant  all on pago.yape_dispositivo to service_role;

-- 3) ESTADO DE DEVICE (autoregistro inactivo si es nuevo). Devuelve 'activo',
--    'inactivo' o 'pendiente' (recien registrado). El HMAC ya se valido en la edge.
create or replace function pago.yape_dispositivo_estado(p_device text)
returns text
language plpgsql security definer
set search_path to 'pago','public'
as $function$
declare v_activo boolean;
begin
  select activo into v_activo from pago.yape_dispositivo where device = p_device;
  if v_activo is null then
    insert into pago.yape_dispositivo(device, etiqueta, activo)
      values (p_device, 'auto', false) on conflict (device) do nothing;
    return 'pendiente';
  end if;
  return case when v_activo then 'activo' else 'inactivo' end;
end $function$;

-- 4) INGESTA del pago (la llama el webhook yape_notificar con service_role, ya
--    verificada la firma). Guarda el pago visto idempotente por txid = huella.
--    moneda 'pen' => conciliar() de Binance lo ignora; la casacion la dispara el
--    cliente (yape_casar). Devuelve {ok, nuevo|motivo}.
create or replace function pago.yape_ingerir(
  p_device text, p_huella text, p_monto_centimos bigint, p_codigo text,
  p_pagador text, p_ocurrido timestamptz)
returns jsonb
language plpgsql security definer
set search_path to 'pago','public'
as $function$
declare v_estado text; v_nuevo boolean;
begin
  v_estado := pago.yape_dispositivo_estado(p_device);
  if v_estado <> 'activo' then
    return jsonb_build_object('ok', false, 'motivo', 'device_' || v_estado);
  end if;
  update pago.yape_dispositivo set ultimo_visto = now() where device = p_device;

  v_nuevo := pago.pago_ingerir(
    p_txid    => p_huella,
    p_monto   => coalesce(p_monto_centimos, 0),
    p_moneda  => 'pen',
    p_nota    => coalesce(p_codigo, ''),
    p_pagador => coalesce(p_pagador, ''),
    p_ocurrido=> coalesce(p_ocurrido, now()),
    p_tipo    => 'yape_recibido',
    p_fuente  => 'yape');
  return jsonb_build_object('ok', true, 'nuevo', v_nuevo);
end $function$;

-- 5) LATIDO de salud (la llama yape_heartbeat). Actualiza marcas de salud del device.
create or replace function pago.yape_latido(
  p_device text, p_pendientes bigint, p_version bigint)
returns jsonb
language plpgsql security definer
set search_path to 'pago','public'
as $function$
declare v_estado text;
begin
  v_estado := pago.yape_dispositivo_estado(p_device);
  update pago.yape_dispositivo
     set ultimo_latido = now(),
         pendientes    = coalesce(p_pendientes, pendientes),
         version_code  = coalesce(p_version, version_code)
   where device = p_device;
  return jsonb_build_object('ok', true, 'estado', v_estado);
end $function$;

-- 6) CREAR COBRO YAPE (la llama yape_crear con service_role, ya validada la sesion).
--    Espeja pago.cobro_crear pero en SOLES (centimos) con metodo 'yape'. Precio y
--    switch salen de negocio.parametro. Inserta la recarga pendiente + el cobro 6NF.
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
  v_precio_cred numeric; v_precio_lic numeric; v_activo text;
begin
  if p_usuario is null then raise exception 'usuario_requerido'; end if;
  if not exists (select 1 from negocio.usuario_taller where codigo = p_usuario) then
    raise exception 'usuario_desconocido'; end if;

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
  insert into pago.cobro_monto(cobro_id, monto_unidad) values (v_cobro, v_centimos);  -- centimos de sol
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

-- 7) CASACION (la llama yape_confirmar con service_role, ya validada la sesion).
--    El cliente manda su codigo de seguridad de 3 digitos. Cruza contra el pago_visto
--    de Yape: monto exacto + nota(codigo) igual + ventana + no consumido. Acredita
--    EXACTLY-ONCE via pago.acreditacion (PK cobro_id, UNIQUE pago_txid). Rate-limit
--    por intentos fallidos recientes (eventos 'observacion').
create or replace function pago.yape_casar(p_usuario uuid, p_cobro uuid, p_codigo text)
returns jsonb
language plpgsql security definer
set search_path to 'pago','negocio','public'
as $function$
declare
  v_owner uuid; v_estado public.estado_cobro; v_vence timestamptz; v_creado timestamptz;
  v_monto bigint; v_cred int; v_recarga uuid; v_producto text; v_codn text;
  v_txid text; v_intentos int; v_saldo int; v_lic jsonb; v_ins int;
  v_gracia interval := interval '10 minutes';
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
  if v_estado in ('anulado','caducado','revertido') then
    return jsonb_build_object('ok', false, 'motivo', 'cobro_' || v_estado::text); end if;

  select vence_en into v_vence from pago.cobro_vencimiento where cobro_id = p_cobro;
  select creado_en into v_creado from pago.cobro where id = p_cobro;
  if now() > v_vence then
    insert into pago.cobro_estado(cobro_id, estado) values (p_cobro, 'caducado');
    return jsonb_build_object('ok', false, 'motivo', 'caducado'); end if;

  select cm.monto_unidad, cr.recarga_id, r.creditos, r.producto
    into v_monto, v_recarga, v_cred, v_producto
    from pago.cobro_monto cm
    join pago.cobro_recarga cr on cr.cobro_id = cm.cobro_id
    join negocio.recarga r on r.codigo = cr.recarga_id
    where cm.cobro_id = p_cobro;

  -- rate-limit: max 6 intentos fallidos en 15 min por cobro.
  select count(*) into v_intentos from pago.evento e
    join pago.evento_cobro ec on ec.evento_id = e.id
    join pago.evento_tipo  et on et.evento_id = e.id
    where ec.cobro_id = p_cobro and et.tipo = 'observacion' and e.ocurrido_en > now() - interval '15 minutes';
  if v_intentos >= 6 then return jsonb_build_object('ok', false, 'motivo', 'demasiados_intentos'); end if;

  -- buscar el pago Yape visto que cuadra (monto exacto + codigo + ventana + libre).
  select pv.txid into v_txid
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
    order by po.ocurrido asc
    limit 1;

  if v_txid is null then
    perform pago.evento_registrar(p_cobro, 'observacion',
      jsonb_build_object('yape_intento', true, 'codigo', v_codn, 'monto', v_monto));
    return jsonb_build_object('ok', false, 'motivo', 'no_encontrado', 'intentos', v_intentos + 1);
  end if;

  -- acreditar exactly-once: reservar el txid.
  insert into pago.acreditacion(cobro_id, pago_txid, delta)
    values (p_cobro, v_txid, coalesce(v_cred, 0)) on conflict do nothing;
  get diagnostics v_ins = row_count;
  if v_ins = 0 then return jsonb_build_object('ok', true, 'ya', true); end if;  -- ya usado

  if coalesce(v_producto, 'credito') = 'licencia' then
    v_lic := negocio.licencia_otorgar(v_owner, 12, 'yape:' || v_txid, null);
  else
    v_saldo := negocio.credito_mover(v_owner, v_cred, 'recarga', 'Yape', 'yape:' || v_txid, null);
  end if;

  update negocio.recarga set estado = 'pagado', pagado_en = now()
    where codigo = v_recarga and estado = 'pendiente';
  insert into pago.cobro_estado(cobro_id, estado) values (p_cobro, 'confirmado');
  insert into pago.pago_visto_estado(txid, estado) values (v_txid, 'casado');
  perform pago.evento_registrar(p_cobro, 'casacion',
    jsonb_build_object('txid', v_txid, 'fuente', 'yape', 'codigo', v_codn,
                       'creditos', v_cred, 'producto', coalesce(v_producto, 'credito')));

  return jsonb_build_object('ok', true, 'casado', true, 'producto', coalesce(v_producto, 'credito'),
                            'creditos', v_cred, 'saldo', v_saldo, 'licencia', v_lic);
end $function$;

-- 8) GRANTS: solo service_role ejecuta las funciones Yape (rule 3). El cliente jamas
--    llama estas RPC directo: pasa por las Edge Functions (que validan sesion/firma).
revoke all on function pago.yape_dispositivo_estado(text)                             from public, anon, authenticated;
revoke all on function pago.yape_ingerir(text,text,bigint,text,text,timestamptz)      from public, anon, authenticated;
revoke all on function pago.yape_latido(text,bigint,bigint)                           from public, anon, authenticated;
revoke all on function pago.cobro_crear_yape(uuid,text,integer)                       from public, anon, authenticated;
revoke all on function pago.yape_casar(uuid,uuid,text)                                from public, anon, authenticated;
grant execute on function pago.yape_dispositivo_estado(text)                          to service_role;
grant execute on function pago.yape_ingerir(text,text,bigint,text,text,timestamptz)   to service_role;
grant execute on function pago.yape_latido(text,bigint,bigint)                        to service_role;
grant execute on function pago.cobro_crear_yape(uuid,text,integer)                    to service_role;
grant execute on function pago.yape_casar(uuid,uuid,text)                             to service_role;
