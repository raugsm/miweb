-- LOTE 14 — Cobro de SERVICIO por Yape (solo Perú). Aditivo.
-- Objetivo: que cualquier servicio de la empresa (hoy FRP) pueda cobrar por Yape
-- igual que ya cobra por Binance, reusando el motor Yape probado (lector + casación
-- 1:1 + revisión + exactly-once). El técnico paga Yape y DECLARA su código de
-- seguridad de 3 díg (se auto-verifica contra el lector; sin comprobante/foto).
--
-- Dos piezas:
--  A) yape_acreditar_par: hacerlo CONSCIENTE DE SERVICIO. Hoy un cobro sin recarga
--     caería al camino de créditos y llamaría credito_mover(owner, NULL) → crédito
--     indebido. Ahora: si el cobro NO tiene recarga (es de servicio) SOLO confirma,
--     sin acreditar créditos ni licencia. El resto (créditos/licencia) intacto.
--  B) cobro_crear_servicio_yape: espeja cobro_crear_servicio (servicio + referencia_
--     externa + idempotencia) pero en SOLES/céntimos, método 'yape', SIN recarga, y
--     con gating server-side país=='PE' + yape_activo. La confirmación es por el flujo
--     Yape existente (yape_confirmar → yape_declarar → yape_casar_cobro → yape_acreditar_par).
--
-- No toca Binance ni el camino créditos/licencia de Yape. exactly-once intacto.

-- ===== A) yape_acreditar_par consciente de servicio =====
create or replace function pago.yape_acreditar_par(p_cobro uuid, p_txid text)
 returns jsonb language plpgsql security definer set search_path to 'pago','negocio','public'
as $function$
declare v_owner uuid; v_cred int; v_recarga uuid; v_producto text; v_ins int; v_saldo int; v_lic jsonb;
        v_servicio text;
begin
  select cu.usuario_id into v_owner from pago.cobro_usuario cu where cu.cobro_id = p_cobro;
  select cr.recarga_id, r.creditos, r.producto into v_recarga, v_cred, v_producto
    from pago.cobro_recarga cr join negocio.recarga r on r.codigo = cr.recarga_id
    where cr.cobro_id = p_cobro;

  insert into pago.acreditacion(cobro_id, pago_txid, delta)
    values (p_cobro, p_txid, coalesce(v_cred, 0)) on conflict do nothing;
  get diagnostics v_ins = row_count;
  if v_ins = 0 then return jsonb_build_object('ok', true, 'ya', true); end if;  -- cobro o txid ya usado

  if v_recarga is null then
    -- COBRO DE SERVICIO (sin recarga): SOLO confirmar. No se acreditan créditos ni licencia.
    select servicio into v_servicio from pago.cobro_servicio where cobro_id = p_cobro;
    insert into pago.cobro_estado(cobro_id, estado) values (p_cobro, 'confirmado');
    insert into pago.pago_visto_estado(txid, estado) values (p_txid, 'casado');
    perform pago.evento_registrar(p_cobro, 'casacion',
      jsonb_build_object('txid', p_txid, 'fuente', 'yape', 'producto', 'servicio',
                         'servicio', coalesce(v_servicio, 'servicio')));
    return jsonb_build_object('ok', true, 'casado', true, 'producto', 'servicio',
                              'servicio', coalesce(v_servicio, 'servicio'));
  end if;

  -- Camino original (créditos / licencia) — sin cambios.
  if coalesce(v_producto, 'credito') = 'licencia' then
    v_lic := negocio.licencia_otorgar(v_owner, 12, 'yape:' || p_txid, null);
  else
    v_saldo := negocio.credito_mover(v_owner, v_cred, 'recarga', 'Yape', 'yape:' || p_txid, null);
  end if;

  update negocio.recarga set estado = 'pagado', pagado_en = now()
    where codigo = v_recarga and estado = 'pendiente';
  insert into pago.cobro_estado(cobro_id, estado) values (p_cobro, 'confirmado');
  insert into pago.pago_visto_estado(txid, estado) values (p_txid, 'casado');
  perform pago.evento_registrar(p_cobro, 'casacion',
    jsonb_build_object('txid', p_txid, 'fuente', 'yape', 'creditos', v_cred, 'producto', coalesce(v_producto, 'credito')));

  return jsonb_build_object('ok', true, 'casado', true, 'producto', coalesce(v_producto, 'credito'),
                            'creditos', v_cred, 'saldo', v_saldo, 'licencia', v_lic);
end $function$;

-- ===== B) cobro_crear_servicio_yape (nuevo) =====
create or replace function pago.cobro_crear_servicio_yape(
  p_usuario uuid, p_monto_pen numeric, p_servicio text default 'servicio',
  p_referencia_externa text default null, p_idempotency_key text default null,
  p_motivo text default 'servicio')
 returns jsonb language plpgsql security definer
 set search_path to 'pago','negocio','extensions','public'
as $function$
declare
  v_cobro uuid; v_codigo text; v_vence timestamptz := now() + interval '30 minutes';
  v_centimos bigint; v_pen numeric := round(coalesce(p_monto_pen, 0), 2);
  v_serv text := coalesce(nullif(trim(p_servicio), ''), 'servicio');
  v_ref  text := nullif(trim(coalesce(p_referencia_externa, '')), '');
  v_key  text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  v_pais text; v_activo text; v_existe uuid;
begin
  if p_usuario is null then raise exception 'usuario_requerido'; end if;
  select trim(pais) into v_pais from negocio.usuario_taller where codigo = p_usuario;
  if v_pais is null then raise exception 'usuario_desconocido'; end if;
  if upper(v_pais) <> 'PE' then raise exception 'pais_no_habilitado'; end if;  -- Yape solo Perú

  select valor into v_activo from negocio.parametro where clave = 'yape_activo';
  if coalesce(v_activo, 'false') <> 'true' then raise exception 'yape_inactivo'; end if;

  if p_monto_pen is null or round(p_monto_pen, 2) <> p_monto_pen then raise exception 'monto_invalido'; end if;
  if v_pen <= 0 or v_pen > 20000 then raise exception 'monto_invalido'; end if;
  v_centimos := round(v_pen * 100)::bigint;

  -- Idempotencia: misma key → devolver el cobro existente (anti cobro-doble por reintento).
  if v_key is not null then
    perform pg_advisory_xact_lock(hashtext('cobro_idem:' || v_key));
    select cobro_id into v_existe from pago.cobro_idem where idempotency_key = v_key;
    if v_existe is not null then
      return jsonb_build_object(
        'cobro_id', v_existe,
        'codigo', (select codigo from pago.cobro_codigo where cobro_id = v_existe),
        'codigo_formato', pago.codigo_formato((select codigo from pago.cobro_codigo where cobro_id = v_existe)),
        'monto_centimos', (select monto_unidad from pago.cobro_monto where cobro_id = v_existe),
        'monto_texto', trim(to_char((select monto_unidad from pago.cobro_monto where cobro_id = v_existe) / 100.0, 'FM999999990.00')),
        'moneda', 'PEN', 'producto', 'servicio',
        'servicio', (select servicio from pago.cobro_servicio where cobro_id = v_existe),
        'referencia_externa', (select referencia_externa from pago.cobro_servicio where cobro_id = v_existe),
        'vence_en', (select vence_en from pago.cobro_vencimiento where cobro_id = v_existe),
        'idempotente', true);
    end if;
  end if;

  v_cobro := gen_random_uuid();
  v_codigo := pago.codigo_nuevo();
  insert into pago.cobro(id) values (v_cobro);
  insert into pago.cobro_usuario(cobro_id, usuario_id) values (v_cobro, p_usuario);
  insert into pago.cobro_codigo(cobro_id, codigo)      values (v_cobro, v_codigo);
  insert into pago.cobro_monto(cobro_id, monto_unidad) values (v_cobro, v_centimos);  -- céntimos de sol
  insert into pago.cobro_moneda(cobro_id, moneda)      values (v_cobro, 'pen');
  insert into pago.cobro_metodo(cobro_id, metodo)      values (v_cobro, 'yape');
  insert into pago.cobro_vencimiento(cobro_id, vence_en) values (v_cobro, v_vence);
  insert into pago.cobro_estado(cobro_id, estado)      values (v_cobro, 'creado');
  insert into pago.cobro_servicio(cobro_id, servicio, referencia_externa) values (v_cobro, v_serv, v_ref);
  if v_key is not null then
    insert into pago.cobro_idem(idempotency_key, cobro_id) values (v_key, v_cobro);
  end if;
  perform pago.evento_registrar(v_cobro, 'creacion',
    jsonb_build_object('producto', 'servicio', 'servicio', v_serv, 'referencia_externa', v_ref,
      'metodo', 'yape', 'motivo', left(coalesce(p_motivo, ''), 160), 'monto_pen', v_pen, 'codigo', v_codigo));

  return jsonb_build_object(
    'cobro_id', v_cobro, 'codigo', v_codigo, 'codigo_formato', pago.codigo_formato(v_codigo),
    'monto_centimos', v_centimos, 'monto_texto', trim(to_char(v_pen, 'FM999999990.00')),
    'moneda', 'PEN', 'producto', 'servicio', 'servicio', v_serv, 'referencia_externa', v_ref,
    'vence_en', v_vence, 'idempotente', false);
end $function$;

-- ===== Grants (service_role-only; el cliente pasa por la Edge) =====
revoke all on function pago.cobro_crear_servicio_yape(uuid,numeric,text,text,text,text) from public, anon, authenticated;
grant execute on function pago.cobro_crear_servicio_yape(uuid,numeric,text,text,text,text) to service_role;
