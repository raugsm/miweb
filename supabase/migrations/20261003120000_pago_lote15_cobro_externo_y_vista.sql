-- LOTE 15 — Cobro de servicio para consumidores EXTERNOS/ANÓNIMOS + vista de lectura.
-- Aditivo. Caso de uso: Cuenta MI (cliente device-auth anónimo, sin usuario_taller/JWT).
-- El edge service_role del servicio externo crea el cobro y lee su estado por la vista.
-- No toca Binance ni el camino créditos/licencia ni los edges JWT existentes.
--
-- Piezas:
--  A) pago.v_cobro_servicio — vista COBRO-céntrica (service_role) para que un panel/edge
--     lea estado/pagado/monto por servicio+referencia_externa+cobro_id (lectura por lote).
--  B) pago.cobro_crear_externo(...) — crea un cobro de SERVICIO llamado por service_role,
--     SIN usuario_taller: usa un uuid CENTINELA para cobro_usuario (no hay FK; el dueño real
--     se rastrea por referencia_externa). País por PARÁMETRO (gating Yape, no del taller).
--     Binance (moneda usd/usdt) confirma solo por el vigía (cobro_confirmar_servicio tolera
--     el centinela y NO acredita créditos). Yape (moneda pen) crea el cobro pero su
--     confirmación anónima (declarar código) llega en un lote posterior (yape_declarar_externo).

-- ===== A) Vista cobro-céntrica (solo lectura, service_role) =====
create or replace view pago.v_cobro_servicio as
select
  cs.servicio,
  cs.referencia_externa,
  c.id                           as cobro_id,
  cc.codigo                      as cobro_codigo,
  (select estado from pago.cobro_estado e where e.cobro_id = c.id order by desde desc limit 1) as estado,
  exists(select 1 from pago.cobro_estado e where e.cobro_id = c.id and e.estado = 'confirmado') as pagado,
  cmo.moneda,
  cm.monto_unidad,
  case when cmo.moneda = 'pen' then round(cm.monto_unidad / 100.0, 2)
       else round(cm.monto_unidad / 100000000.0, 8) end as monto,
  cme.metodo,
  (select min(desde) from pago.cobro_estado e where e.cobro_id = c.id and e.estado = 'confirmado') as confirmado_en,
  c.creado_en
from pago.cobro c
join pago.cobro_servicio cs on cs.cobro_id = c.id
left join pago.cobro_codigo  cc  on cc.cobro_id  = c.id
left join pago.cobro_moneda  cmo on cmo.cobro_id = c.id
left join pago.cobro_monto   cm  on cm.cobro_id  = c.id
left join pago.cobro_metodo  cme on cme.cobro_id = c.id;

revoke all on pago.v_cobro_servicio from anon, authenticated;
grant select on pago.v_cobro_servicio to service_role;

-- ===== B) Creación de cobro externo/anónimo (service_role) =====
create or replace function pago.cobro_crear_externo(
  p_servicio text,
  p_referencia_externa text,
  p_monto numeric,
  p_moneda text default 'usd',
  p_idempotency_key text default null,
  p_pais text default null,
  p_motivo text default 'externo')
 returns jsonb language plpgsql security definer
 set search_path to 'pago','negocio','extensions','public'
as $function$
declare
  -- uuid centinela: dueño de los cobros externos/anónimos (sin usuario_taller; no hay FK).
  -- el dueño real del cobro se rastrea por cobro_servicio.referencia_externa.
  v_sentinela uuid := '00000000-0000-0000-0000-000000000000';
  v_cobro uuid; v_codigo text; v_vence timestamptz := now() + interval '40 minutes';
  v_moneda text := lower(coalesce(nullif(trim(p_moneda), ''), 'usd'));
  v_serv text := coalesce(nullif(trim(p_servicio), ''), 'servicio');
  v_ref  text := nullif(trim(coalesce(p_referencia_externa, '')), '');
  v_key  text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  v_pais text := upper(nullif(trim(coalesce(p_pais, '')), ''));
  v_metodo public.metodo_cobro; v_unidad bigint; v_pen numeric; v_activo text; v_existe uuid;
begin
  if not (v_serv ~ '^[a-z0-9_-]{1,32}$') then raise exception 'servicio_invalido'; end if;
  if p_monto is null or round(p_monto, 2) <> p_monto then raise exception 'monto_invalido'; end if;

  if v_moneda = 'pen' then
    -- Yape (soles). Gating por el país del PEDIDO (no de un taller).
    if v_pais is distinct from 'PE' then raise exception 'pais_no_habilitado'; end if;
    select valor into v_activo from negocio.parametro where clave = 'yape_activo';
    if coalesce(v_activo, 'false') <> 'true' then raise exception 'yape_inactivo'; end if;
    if not (p_monto > 0 and p_monto <= 20000) then raise exception 'monto_invalido'; end if;
    v_pen := round(p_monto, 2);
    v_unidad := round(v_pen * 100)::bigint;             -- céntimos
    v_metodo := 'yape';
  elsif v_moneda in ('usd','usdt') then
    -- Binance Pay (USD/USDT). Confirmación automática por el vigía.
    if not (p_monto > 0 and p_monto <= 5000) then raise exception 'monto_invalido'; end if;
    v_unidad := (round(p_monto, 2) * 100000000)::bigint; -- ×1e8
    v_metodo := 'binance_pay_c2c';
    v_moneda := 'usd';
  else
    raise exception 'moneda_invalida';
  end if;

  -- Idempotencia: misma key → devolver el cobro existente.
  if v_key is not null then
    perform pg_advisory_xact_lock(hashtext('cobro_idem:' || v_key));
    select cobro_id into v_existe from pago.cobro_idem where idempotency_key = v_key;
    if v_existe is not null then
      return jsonb_build_object(
        'cobro_id', v_existe,
        'codigo', (select codigo from pago.cobro_codigo where cobro_id = v_existe),
        'codigo_formato', pago.codigo_formato((select codigo from pago.cobro_codigo where cobro_id = v_existe)),
        'monto_unidad', (select monto_unidad from pago.cobro_monto where cobro_id = v_existe),
        'moneda', (select moneda from pago.cobro_moneda where cobro_id = v_existe),
        'metodo', (select metodo from pago.cobro_metodo where cobro_id = v_existe)::text,
        'producto', 'servicio',
        'servicio', (select servicio from pago.cobro_servicio where cobro_id = v_existe),
        'referencia_externa', (select referencia_externa from pago.cobro_servicio where cobro_id = v_existe),
        'vence_en', (select vence_en from pago.cobro_vencimiento where cobro_id = v_existe),
        'idempotente', true);
    end if;
  end if;

  v_cobro := gen_random_uuid();
  v_codigo := pago.codigo_nuevo();
  insert into pago.cobro(id) values (v_cobro);
  insert into pago.cobro_usuario(cobro_id, usuario_id)   values (v_cobro, v_sentinela);
  insert into pago.cobro_codigo(cobro_id, codigo)        values (v_cobro, v_codigo);
  insert into pago.cobro_monto(cobro_id, monto_unidad)   values (v_cobro, v_unidad);
  insert into pago.cobro_moneda(cobro_id, moneda)        values (v_cobro, v_moneda::public.moneda);
  insert into pago.cobro_metodo(cobro_id, metodo)        values (v_cobro, v_metodo);
  insert into pago.cobro_vencimiento(cobro_id, vence_en) values (v_cobro, v_vence);
  insert into pago.cobro_estado(cobro_id, estado)        values (v_cobro, 'creado');
  insert into pago.cobro_servicio(cobro_id, servicio, referencia_externa) values (v_cobro, v_serv, v_ref);
  if v_key is not null then
    insert into pago.cobro_idem(idempotency_key, cobro_id) values (v_key, v_cobro);
  end if;
  perform pago.evento_registrar(v_cobro, 'creacion',
    jsonb_build_object('producto', 'servicio', 'servicio', v_serv, 'referencia_externa', v_ref,
      'origen', 'externo', 'metodo', v_metodo::text, 'moneda', v_moneda,
      'motivo', left(coalesce(p_motivo, ''), 160), 'codigo', v_codigo));

  -- Destino a mostrar (según método), de negocio.parametro.
  declare
    v_destino text := ''; v_pago_url text := '';
    v_num text := ''; v_tit text := ''; v_qr text := null; p record;
  begin
    if v_metodo = 'binance_pay_c2c' then
      for p in select clave, valor from negocio.parametro where clave in ('binance_pay_id','binance_pay_url') loop
        if p.clave = 'binance_pay_id'  then v_destino  := coalesce(p.valor,''); end if;
        if p.clave = 'binance_pay_url' then v_pago_url := coalesce(p.valor,''); end if;
      end loop;
      return jsonb_build_object(
        'cobro_id', v_cobro, 'codigo', v_codigo, 'codigo_formato', pago.codigo_formato(v_codigo),
        'monto_unidad', v_unidad, 'monto_texto', trim(to_char(round(p_monto,2), 'FM999999990.00')),
        'moneda', 'usd', 'metodo', 'binance_pay_c2c', 'producto', 'servicio',
        'servicio', v_serv, 'referencia_externa', v_ref, 'idempotente', false,
        'vence_en', v_vence, 'destino', v_destino, 'pago_url', v_pago_url);
    else
      for p in select clave, valor from negocio.parametro
               where clave in ('yape_destino','yape_destino_numero','yape_destino_titular','yape_destino_qr') loop
        if p.clave = 'yape_destino'         then v_destino := coalesce(p.valor,''); end if;
        if p.clave = 'yape_destino_numero'  then v_num := coalesce(p.valor,''); end if;
        if p.clave = 'yape_destino_titular' then v_tit := coalesce(p.valor,''); end if;
        if p.clave = 'yape_destino_qr'      then v_qr  := nullif(coalesce(p.valor,''),''); end if;
      end loop;
      return jsonb_build_object(
        'cobro_id', v_cobro, 'codigo', v_codigo, 'codigo_formato', pago.codigo_formato(v_codigo),
        'monto_unidad', v_unidad, 'monto_texto', trim(to_char(v_pen, 'FM999999990.00')),
        'moneda', 'PEN', 'metodo', 'yape', 'producto', 'servicio',
        'servicio', v_serv, 'referencia_externa', v_ref, 'idempotente', false,
        'vence_en', v_vence, 'destino', v_destino, 'destino_numero', v_num,
        'destino_titular', v_tit, 'destino_qr', v_qr, 'entidad', 'Yape');
    end if;
  end;
end $function$;

revoke all on function pago.cobro_crear_externo(text,text,numeric,text,text,text,text) from public, anon, authenticated;
grant execute on function pago.cobro_crear_externo(text,text,numeric,text,text,text,text) to service_role;
