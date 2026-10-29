-- 20261029190000_creditos_recarga_manual_cmi.sql â€” Ari-Web, 29-oct-2026
-- CMI: pagar_con_saldo rechaza comprobante enviado + pago_via en el JSON.
-- Web: wrappers de recarga manual en sop_frp (sop_credito no esta expuesto).
-- PROPUESTA: no aplicar sin OK escrito de Peter.
CREATE OR REPLACE FUNCTION sop_cuenta_mi.pedido_taller_pagar_saldo(p_pedido_id uuid, p_pais text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'sop_cuenta_mi', 'sop_credito', 'pago', 'public'
AS $function$
declare
  v        sop_cuenta_mi.pedido;
  v_pais   text := lower(nullif(btrim(p_pais), ''));
  v_cobro  text;
  v_taller uuid;
  v_cent   int;
  v_res    jsonb;
  v_n      int := 0;
begin
  if auth.uid() is null then raise exception 'sin_sesion'; end if;
  if v_pais is null then raise exception 'pais_requerido'; end if;
  select * into v from sop_cuenta_mi.pedido where id = p_pedido_id and taller_uid = auth.uid() and estado = 'activo' for update;
  if v.id is null then raise exception 'pedido_inexistente'; end if;
  if v.situacion in ('cancelado', 'exitoso', 'fallido') then raise exception 'pedido_cerrado: el pedido ya estÃ¡ cerrado; creÃ¡ uno nuevo'; end if;
  if v.pago_situacion in ('confirmado', 'reembolsado') then raise exception 'pago_ya_resuelto'; end if;

  if v.comprobante_ruta is not null then raise exception 'pago_en_curso: comprobante enviado'; end if;
  if v.cobro_id is not null then
    select e.estado::text into v_cobro
      from pago.cobro_estado e join pago.cobro_vencimiento cv on cv.cobro_id = e.cobro_id
     where e.cobro_id = v.cobro_id and cv.vence_en > now()
     order by e.desde desc limit 1;
    if v_cobro in ('retenido', 'en_revision', 'confirmado') then raise exception 'pago_en_curso: tu pago estÃ¡ siendo confirmado'; end if;
  end if;

  -- PaÃ­s elegido manda: si cambiÃ³ (o el pedido no tiene precio), se recalcula con la regla de siempre
  -- (pedido_taller_pais caduca el cobro vivo del paÃ­s anterior y deja pago_situacion = sin_pago).
  if v.pais is distinct from v_pais or v.monto_usd is null then
    perform sop_cuenta_mi.pedido_taller_pais(p_pedido_id, v_pais);
  elsif v.cobro_id is not null then
    -- mismo paÃ­s pero habÃ­a un cobro vivo (Yape/Binance) sin pagar: se caduca, ahora paga con saldo
    v_n := pago.cobro_caducar_pedido_cuenta_mi(p_pedido_id, auth.uid());
  end if;
  select * into v from sop_cuenta_mi.pedido where id = p_pedido_id for update;
  if v.monto_usd is null or v.monto_usd <= 0 then raise exception 'precio_no_configurado'; end if;

  v_taller := sop_credito.taller_de(auth.uid());
  if v_taller is null then raise exception 'sin_taller'; end if;
  v_cent := round(v.monto_usd * 100)::int;

  v_res := sop_credito.consumir(v_taller, v_cent, 'cuenta_mi', v.codigo,
             format('pago con saldo Â· %s Â· %s USD', upper(v_pais), to_char(v.monto_usd, 'FM999999990.00')), auth.uid());
  if not coalesce((v_res->>'ok')::boolean, false) then
    -- saldo_insuficiente (con saldo_centavos y faltan_centavos): la app ofrece recargar o pagar al momento
    return v_res || jsonb_build_object('precio_centavos', v_cent, 'pais', v_pais, 'monto_usd', v.monto_usd,
                                       'moneda', v.moneda, 'monto_local', v.monto_local);
  end if;

  update sop_cuenta_mi.pedido
     set pago_situacion = 'confirmado', pagado_en = now(), metodo = 'saldo'::sop_cuenta_mi.metodo,
         cobro_id = null, pago_motivo = null,
         situacion = case when situacion = 'en_espera' then 'en_proceso' else situacion end
   where id = p_pedido_id;
  insert into sop_cuenta_mi.historial (pedido_id, situacion, nota, creado_por)
  values (p_pedido_id, (select situacion from sop_cuenta_mi.pedido where id = p_pedido_id),
          format('pago con saldo Â· %s Â· %s USD (%s centavos)%s', upper(v_pais), to_char(v.monto_usd, 'FM999999990.00'), v_cent,
                 case when v_n > 0 then ' Â· cobro anterior caducado' else '' end), auth.uid());
  perform sop_auditoria.registro('cuenta_mi.pedido_taller_pagar_saldo', 'sop_cuenta_mi', 'pedido', p_pedido_id::text,
    jsonb_build_object('pais', v_pais, 'monto_usd', v.monto_usd, 'centavos', v_cent, 'taller', v_taller, 'consumo', v_res, 'cobros_caducados', v_n));

  select * into v from sop_cuenta_mi.pedido where id = p_pedido_id;
  return jsonb_build_object('ok', true, 'saldo_centavos', v_res->'saldo_centavos', 'centavos', v_cent, 'repetido', v_res->'repetido')
         || jsonb_build_object('pedido', sop_cuenta_mi.pedido_json_taller(v));
end $function$
;

CREATE OR REPLACE FUNCTION sop_cuenta_mi.pedido_json_taller(v sop_cuenta_mi.pedido)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  with cob as (select sop_cuenta_mi.cobro_resumen(v.cobro_id) as j),
       eq  as (select e.imei from sop_cuenta_mi.equipo e
                where e.pedido_id = v.id and e.estado = 'activo' order by e.creado_en desc limit 1),
       bl  as (select b.lock_code, b.foto_ruta from sop_cuenta_mi.bloqueo b
                where b.pedido_id = v.id and b.estado = 'activo' order by b.declarado_en desc nulls last limit 1),
       nt  as (select h.nota from sop_cuenta_mi.historial h
                where h.pedido_id = v.id and h.situacion in ('exitoso','fallido')
                  and nullif(btrim(h.nota), '') is not null and h.nota <> 'cierre G3'
                  and (v.reapertura_en is null or h.creado_en > v.reapertura_en)   -- no arrastrar el motivo de antes de reabrir
                order by h.creado_en desc limit 1),
       rs  as (select s.situacion from sop_cobranza.reembolso_solicitud s
                where s.tipo = 'cuenta_mi' and s.ref_id = v.id and s.estado = 'activo'
                order by s.solicitado_en desc limit 1),
       fs  as (select sop_cuenta_mi.fase_calc(v.situacion, v.pago_situacion) as fase)
  select jsonb_build_object(
    -- v1 (sin cambios)
    'id', v.id, 'codigo', v.codigo, 'situacion', v.situacion, 'pago', v.pago_situacion,
    'pago_via', case when v.metodo = 'saldo'::sop_cuenta_mi.metodo then 'saldo' when v.cobro_id is not null then 'pasarela' else null end,
    'fase', fs.fase, 'metodo', v.metodo,
    'monto_usd', v.monto_usd, 'moneda', v.moneda, 'monto_local', v.monto_local,
    'pais', v.pais, 'cobro_id', v.cobro_id, 'pago_motivo', v.pago_motivo, 'creado_en', v.creado_en,
    -- v2 (230001)
    'servicio', 'cuenta_mi',
    'ticket', cob.j->>'ticket',
    'cobro_estado', cob.j->>'estado',
    'vence_en', cob.j->'vence_en',
    'imei', eq.imei,
    'lock_code', bl.lock_code,
    'foto_ruta', bl.foto_ruta,
    'equipo_etiqueta', coalesce(bl.lock_code, case when eq.imei is not null then 'IMEI Â·Â·Â·' || right(eq.imei, 4) end),
    'comprobante_ruta', v.comprobante_ruta,
    'nota_soporte', case when v.situacion in ('exitoso','fallido') then nt.nota end,
    'cierre_en',    case when v.situacion in ('exitoso','fallido','cancelado') then v.cierre_en end,
    'accion_requerida',
      (fs.fase = 'espera_pago' and (v.cobro_id is null or coalesce(cob.j->>'estado','') in ('caducado','anulado','revertido')))
      or fs.fase = 'rechazado',
    -- v3 (este archivo): reapertura + reembolso
    'reapertura_en', v.reapertura_en,
    'reapertura_motivo', v.reapertura_motivo,
    'reembolso_monto', v.reembolso_monto,
    'reembolso_usd', v.reembolso_usd,
    'reembolso_motivo', v.reembolso_motivo,
    'reembolso_en', v.reembolso_en,
    'reembolso_solicitud', rs.situacion
  )
  from fs
  left join cob on true
  left join eq  on true
  left join bl  on true
  left join nt  on true
  left join rs  on true;
$function$
;

-- =====================================================================
-- Wrappers de recarga manual en sop_frp (sop_credito no esta expuesto).
-- El web /panel llama a estas RPC con el JWT del taller.
-- =====================================================================
create or replace function sop_frp.recarga_paises()
returns jsonb language sql stable security definer
set search_path to 'sop_config', 'public' as $fn$
  select jsonb_build_object('ok', true, 'paises',
    coalesce(jsonb_agg(jsonb_build_object('pais', pais, 'moneda', upper(moneda::text), 'tasa', tasa) order by pais), '[]'::jsonb))
    from sop_config.tasa_cambio where estado = 'activo';
$fn$;
revoke all on function sop_frp.recarga_paises() from public, anon;
grant execute on function sop_frp.recarga_paises() to authenticated, service_role;

create or replace function sop_frp.recarga_precio(p_creditos integer, p_pais text)
returns jsonb language sql stable security definer
set search_path to 'sop_credito', 'public' as $fn$
  select sop_credito.recarga_precio(p_creditos, p_pais);
$fn$;
revoke all on function sop_frp.recarga_precio(integer, text) from public, anon;
grant execute on function sop_frp.recarga_precio(integer, text) to authenticated, service_role;

create or replace function sop_frp.recarga_comprobante_crear(p_creditos integer, p_pais text, p_ruta text)
returns jsonb language sql security definer
set search_path to 'sop_credito', 'public' as $fn$
  select sop_credito.recarga_comprobante_crear(p_creditos, p_pais, p_ruta);
$fn$;
revoke all on function sop_frp.recarga_comprobante_crear(integer, text, text) from public, anon;
grant execute on function sop_frp.recarga_comprobante_crear(integer, text, text) to authenticated, service_role;

create or replace function sop_frp.recargas(p_limite integer default 20)
returns jsonb language sql stable security definer
set search_path to 'sop_credito', 'public' as $fn$
  select sop_credito.recargas(p_limite);
$fn$;
revoke all on function sop_frp.recargas(integer) from public, anon;
grant execute on function sop_frp.recargas(integer) to authenticated, service_role;

create or replace function sop_frp.recarga_instrucciones(p_pais text)
returns jsonb language plpgsql stable security definer
set search_path to 'negocio', 'sop_config', 'public' as $fn$
declare
  v_pais text := lower(nullif(btrim(p_pais), ''));
  v_metodos jsonb;
begin
  -- Transferencias locales del panel (CL/CO/MX, etc.)
  select coalesce(jsonb_agg(jsonb_build_object('nombre', m.nombre, 'campos', m.campos, 'qr_ruta', m.qr_ruta) order by m.orden), '[]'::jsonb)
    into v_metodos
    from sop_config.metodo_pago m
   where m.pais = v_pais and m.estado = 'activo';

  -- Peru: Yape propio (no hay fila de transferencia para PE).
  if v_pais = 'pe' then
    v_metodos := jsonb_build_array(jsonb_build_object(
      'nombre', 'Yape',
      'campos', jsonb_build_object(
        'Numero', (select valor from negocio.parametro where clave = 'yape_destino_numero' and estado = 'activo'),
        'Titular', (select valor from negocio.parametro where clave = 'yape_destino_titular' and estado = 'activo')
      ),
      'qr_ruta', (select valor from negocio.parametro where clave = 'yape_destino_qr' and estado = 'activo')
    )) || v_metodos;
  end if;

  -- Binance Pay global.
  v_metodos := v_metodos || jsonb_build_array(jsonb_build_object(
    'nombre', 'Binance Pay',
    'campos', jsonb_build_object(
      'ID', (select valor from negocio.parametro where clave = 'binance_pay_id' and estado = 'activo'),
      'Link', (select valor from negocio.parametro where clave = 'binance_pay_url' and estado = 'activo')
    ),
    'qr_ruta', null
  ));

  return jsonb_build_object('ok', true, 'pais', v_pais, 'metodos', v_metodos);
end $fn$;
revoke all on function sop_frp.recarga_instrucciones(text) from public, anon;
grant execute on function sop_frp.recarga_instrucciones(text) to authenticated, service_role;