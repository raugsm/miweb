-- LOTE 15b — cobro_crear_externo: la respuesta IDEMPOTENTE ahora también devuelve
-- destino/pago_url (Binance) y destino_numero/titular/qr (Yape), igual que la creación.
-- Antes el 2º+ llamado con la misma idempotency_key omitía destino/pago_url (config
-- estática) y el consumidor tenía que leerlos aparte. Ahora el contrato es uniforme.
-- Solo cambia la FORMA de la respuesta (se unifica el armado del destino para ambas
-- ramas y monto_texto se calcula desde monto_unidad). Sin cambios de lógica de dinero.

create or replace function pago.cobro_crear_externo(
  p_servicio text, p_referencia_externa text, p_monto numeric, p_moneda text default 'usd',
  p_idempotency_key text default null, p_pais text default null, p_motivo text default 'externo')
 returns jsonb language plpgsql security definer set search_path to 'pago','negocio','extensions','public'
as $function$
declare
  v_sentinela uuid := '00000000-0000-0000-0000-000000000000';
  v_cobro uuid; v_codigo text; v_vence timestamptz := now() + interval '40 minutes';
  v_moneda text := lower(coalesce(nullif(trim(p_moneda),''),'usd'));
  v_serv text := coalesce(nullif(trim(p_servicio),''),'servicio');
  v_ref text := nullif(trim(coalesce(p_referencia_externa,'')),'');
  v_key text := nullif(trim(coalesce(p_idempotency_key,'')),'');
  v_pais text := upper(nullif(trim(coalesce(p_pais,'')),''));
  v_metodo public.metodo_cobro; v_unidad bigint; v_activo text; v_existe uuid;
  v_idem boolean := false;
  v_destino text:=''; v_pago_url text:=''; v_num text:=''; v_tit text:=''; v_qr text:=null; p record;
begin
  if not (v_serv ~ '^[a-z0-9_-]{1,32}$') then raise exception 'servicio_invalido'; end if;
  if p_monto is null or round(p_monto,2) <> p_monto then raise exception 'monto_invalido'; end if;
  if v_moneda='pen' then
    if v_pais is distinct from 'PE' then raise exception 'pais_no_habilitado'; end if;
    select valor into v_activo from negocio.parametro where clave='yape_activo';
    if coalesce(v_activo,'false') <> 'true' then raise exception 'yape_inactivo'; end if;
    if not (p_monto>0 and p_monto<=20000) then raise exception 'monto_invalido'; end if;
    v_unidad := round(round(p_monto,2)*100)::bigint; v_metodo := 'yape';
  elsif v_moneda in ('usd','usdt') then
    if not (p_monto>0 and p_monto<=5000) then raise exception 'monto_invalido'; end if;
    v_unidad := (round(p_monto,2)*100000000)::bigint; v_metodo := 'binance_pay_c2c'; v_moneda := 'usd';
  else raise exception 'moneda_invalida'; end if;

  if v_key is not null then
    perform pg_advisory_xact_lock(hashtext('cobro_idem:'||v_key));
    select cobro_id into v_existe from pago.cobro_idem where idempotency_key=v_key;
    if v_existe is not null then
      v_cobro := v_existe; v_idem := true;
      select codigo into v_codigo from pago.cobro_codigo where cobro_id=v_cobro;
      select monto_unidad into v_unidad from pago.cobro_monto where cobro_id=v_cobro;
      select moneda::text into v_moneda from pago.cobro_moneda where cobro_id=v_cobro;
      select metodo into v_metodo from pago.cobro_metodo where cobro_id=v_cobro;
      select servicio, referencia_externa into v_serv, v_ref from pago.cobro_servicio where cobro_id=v_cobro;
      select vence_en into v_vence from pago.cobro_vencimiento where cobro_id=v_cobro;
    end if;
  end if;

  if not v_idem then
    v_cobro := gen_random_uuid(); v_codigo := pago.codigo_nuevo();
    insert into pago.cobro(id) values (v_cobro);
    insert into pago.cobro_usuario(cobro_id,usuario_id) values (v_cobro,v_sentinela);
    insert into pago.cobro_codigo(cobro_id,codigo) values (v_cobro,v_codigo);
    insert into pago.cobro_monto(cobro_id,monto_unidad) values (v_cobro,v_unidad);
    insert into pago.cobro_moneda(cobro_id,moneda) values (v_cobro,v_moneda::public.moneda);
    insert into pago.cobro_metodo(cobro_id,metodo) values (v_cobro,v_metodo);
    insert into pago.cobro_vencimiento(cobro_id,vence_en) values (v_cobro,v_vence);
    insert into pago.cobro_estado(cobro_id,estado) values (v_cobro,'creado');
    insert into pago.cobro_servicio(cobro_id,servicio,referencia_externa) values (v_cobro,v_serv,v_ref);
    if v_key is not null then insert into pago.cobro_idem(idempotency_key,cobro_id) values (v_key,v_cobro); end if;
    perform pago.evento_registrar(v_cobro,'creacion',
      jsonb_build_object('producto','servicio','servicio',v_serv,'referencia_externa',v_ref,'origen','externo',
        'metodo',v_metodo::text,'moneda',v_moneda,'motivo',left(coalesce(p_motivo,''),160),'codigo',v_codigo));
  end if;

  -- Construcción del destino + respuesta (COMÚN a creación e idempotente).
  if v_metodo='binance_pay_c2c' then
    for p in select clave,valor from negocio.parametro where clave in ('binance_pay_id','binance_pay_url') loop
      if p.clave='binance_pay_id' then v_destino:=coalesce(p.valor,''); end if;
      if p.clave='binance_pay_url' then v_pago_url:=coalesce(p.valor,''); end if;
    end loop;
    return jsonb_build_object('cobro_id',v_cobro,'codigo',v_codigo,'codigo_formato',pago.codigo_formato(v_codigo),
      'monto_unidad',v_unidad,'monto_texto',trim(to_char(v_unidad/100000000.0,'FM999999990.00')),
      'moneda','usd','metodo','binance_pay_c2c','producto','servicio','servicio',v_serv,
      'referencia_externa',v_ref,'idempotente',v_idem,'vence_en',v_vence,'destino',v_destino,'pago_url',v_pago_url);
  else
    for p in select clave,valor from negocio.parametro where clave in ('yape_destino','yape_destino_numero','yape_destino_titular','yape_destino_qr') loop
      if p.clave='yape_destino' then v_destino:=coalesce(p.valor,''); end if;
      if p.clave='yape_destino_numero' then v_num:=coalesce(p.valor,''); end if;
      if p.clave='yape_destino_titular' then v_tit:=coalesce(p.valor,''); end if;
      if p.clave='yape_destino_qr' then v_qr:=nullif(coalesce(p.valor,''),''); end if;
    end loop;
    return jsonb_build_object('cobro_id',v_cobro,'codigo',v_codigo,'codigo_formato',pago.codigo_formato(v_codigo),
      'monto_unidad',v_unidad,'monto_texto',trim(to_char(v_unidad/100.0,'FM999999990.00')),
      'moneda','PEN','metodo','yape','producto','servicio','servicio',v_serv,'referencia_externa',v_ref,
      'idempotente',v_idem,'vence_en',v_vence,'destino',v_destino,'destino_numero',v_num,'destino_titular',v_tit,'destino_qr',v_qr,'entidad','Yape');
  end if;
end $function$;

revoke all on function pago.cobro_crear_externo(text,text,numeric,text,text,text,text) from public, anon, authenticated;
grant execute on function pago.cobro_crear_externo(text,text,numeric,text,text,text,text) to service_role;
