-- 20261029240000_cmi_pagar_saldo_comprobante_restore.sql — Ari-Web, 29-oct-2026
-- Restaura el guard de comprobante de CMI #1278 que una migracion posterior
-- de reembolsos volvio a reemplazar sin el chequeo.
begin;

CREATE OR REPLACE FUNCTION sop_cuenta_mi.pedido_taller_pagar_saldo(p_pedido_id uuid, p_pais text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'sop_cuenta_mi', 'sop_credito', 'pago', 'public'
AS $function$
declare
  v sop_cuenta_mi.pedido;
  v_pais text := lower(nullif(btrim(p_pais), ''));
  v_cobro text;
  v_taller uuid;
  v_cent int;
  v_res jsonb;
  v_n int := 0;
begin
  if auth.uid() is null then raise exception 'sin_sesion'; end if;
  if v_pais is null then raise exception 'pais_requerido'; end if;
  select * into v from sop_cuenta_mi.pedido
   where id = p_pedido_id and taller_uid = auth.uid() and estado = 'activo'
   for update;
  if v.id is null then raise exception 'pedido_inexistente'; end if;
  if v.situacion in ('cancelado', 'exitoso', 'fallido') then
    raise exception 'pedido_cerrado: el pedido ya estÃ¡ cerrado; creÃ¡ uno nuevo';
  end if;
  if v.pago_situacion in ('confirmado', 'reembolsado') then raise exception 'pago_ya_resuelto'; end if;
  if v.pago_situacion = 'en_revision' then raise exception 'pago_en_curso: Soporte estÃ¡ revisando tu pago'; end if;
  if v.comprobante_ruta is not null then raise exception 'pago_en_curso: comprobante enviado'; end if;
  if v.cobro_id is not null then
    select e.estado::text into v_cobro
      from pago.cobro_estado e join pago.cobro_vencimiento cv on cv.cobro_id = e.cobro_id
     where e.cobro_id = v.cobro_id and cv.vence_en > now()
     order by e.desde desc limit 1;
    if v_cobro in ('retenido', 'en_revision', 'confirmado') then
      raise exception 'pago_en_curso: tu pago estÃ¡ siendo confirmado';
    end if;
  end if;

  if v.pais is distinct from v_pais or v.monto_usd is null then
    perform sop_cuenta_mi.pedido_taller_pais(p_pedido_id, v_pais);
  elsif v.cobro_id is not null then
    v_n := pago.cobro_caducar_pedido_cuenta_mi(p_pedido_id, auth.uid());
  end if;
  select * into v from sop_cuenta_mi.pedido where id = p_pedido_id for update;
  if v.monto_usd is null or v.monto_usd <= 0 then raise exception 'precio_no_configurado'; end if;

  v_taller := sop_credito.taller_de(auth.uid());
  if v_taller is null then raise exception 'sin_taller'; end if;
  v_cent := round(v.monto_usd * 100)::int;

  v_res := sop_credito.consumir(
    v_taller, v_cent, 'cuenta_mi', v.codigo,
    format('pago con saldo Â· %s Â· %s USD', upper(v_pais), to_char(v.monto_usd, 'FM999999990.00')),
    auth.uid(), v_pais
  );
  if not coalesce((v_res->>'ok')::boolean, false) then
    return v_res || jsonb_build_object('precio_centavos', v_cent, 'pais', v_pais,
                                       'monto_usd', v.monto_usd, 'moneda', v.moneda,
                                       'monto_local', v.monto_local);
  end if;

  update sop_cuenta_mi.pedido
     set pago_situacion = 'confirmado', pagado_en = now(), metodo = 'saldo'::sop_cuenta_mi.metodo,
         cobro_id = null, pago_motivo = null,
         situacion = case when situacion = 'en_espera' then 'en_proceso' else situacion end
   where id = p_pedido_id;

  insert into sop_cuenta_mi.historial (pedido_id, situacion, nota, creado_por)
  values (p_pedido_id, (select situacion from sop_cuenta_mi.pedido where id = p_pedido_id),
          format('pago con saldo Â· %s Â· %s USD (%s centavos)%s',
                 upper(v_pais), to_char(v.monto_usd, 'FM999999990.00'), v_cent,
                 case when v_n > 0 then ' Â· cobro anterior caducado' else '' end), auth.uid());

  perform sop_auditoria.registro('cuenta_mi.pedido_taller_pagar_saldo', 'sop_cuenta_mi', 'pedido', p_pedido_id::text,
    jsonb_build_object('pais', v_pais, 'monto_usd', v.monto_usd, 'centavos', v_cent,
                       'taller', v_taller, 'consumo', v_res, 'cobros_caducados', v_n));

  select * into v from sop_cuenta_mi.pedido where id = p_pedido_id;
  return jsonb_build_object('ok', true, 'saldo_centavos', v_res->'saldo_centavos',
                            'centavos', v_cent, 'repetido', v_res->'repetido')
         || jsonb_build_object('pedido', sop_cuenta_mi.pedido_json_taller(v));
end $function$
;

commit;
