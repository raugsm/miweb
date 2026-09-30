-- LOTE 7 (B8) — Clawback de reversos correcto y seguro.
-- reverso_aplicar(p_txid) se invoca con el TXID ORIGINAL ya acreditado (el dueño/panel
-- admin elige la acreditación a revertir; hoy es la única forma fiable, porque un refund
-- de Binance trae un txid propio distinto del original).
-- Arreglos vs la versión anterior (bugs de la revisión):
--   * Créditos: clawback ACOTADO al saldo disponible (least(delta, saldo)); si ya gastó,
--     NO hace rollback: registra la deuda pendiente en el evento (deuda = delta - quitado).
--   * Licencia: NO se auto-revoca (licencia_otorgar renueva/extiende y no liga cobro↔licencia;
--     revocar a ciegas podría anular una licencia legítima). Se marca para revisión manual.
--   * Exactly-once del reverso por UNIQUE(pago_txid) en pago.reverso (ON CONFLICT DO NOTHING).
-- Nadie la llamaba (código muerto), así que cambiar su retorno a jsonb es seguro. Aditivo.

drop function if exists pago.reverso_aplicar(text);

create function pago.reverso_aplicar(p_txid text)
 returns jsonb language plpgsql security definer set search_path to 'pago','negocio','public'
as $function$
declare
  v_ac record; v_usuario uuid; v_codigo text; v_producto text;
  v_saldo int; v_quita int; v_deuda int; v_ins int;
begin
  if p_txid is null then return jsonb_build_object('ok', false, 'motivo', 'faltan_datos'); end if;

  perform pg_advisory_xact_lock(hashtext('reverso:' || p_txid));

  select * into v_ac from pago.acreditacion where pago_txid = p_txid;
  if v_ac.cobro_id is null then return jsonb_build_object('ok', false, 'motivo', 'no_acreditado'); end if;

  insert into pago.reverso(pago_txid, delta) values (p_txid, -v_ac.delta) on conflict do nothing;
  get diagnostics v_ins = row_count;
  if v_ins = 0 then return jsonb_build_object('ok', false, 'motivo', 'ya_revertido'); end if;

  select cu.usuario_id, cc.codigo, r.producto
    into v_usuario, v_codigo, v_producto
    from pago.cobro_usuario cu
    join pago.cobro_codigo cc on cc.cobro_id = cu.cobro_id
    left join pago.cobro_recarga cr on cr.cobro_id = cu.cobro_id
    left join negocio.recarga r on r.codigo = cr.recarga_id
    where cu.cobro_id = v_ac.cobro_id;

  if coalesce(v_producto, 'credito') = 'licencia' then
    -- No revocar a ciegas: marcar para revisión manual del dueño.
    insert into pago.cobro_estado(cobro_id, estado) values (v_ac.cobro_id, 'revertido');
    perform pago.evento_registrar(v_ac.cobro_id, 'reverso',
      jsonb_build_object('txid', p_txid, 'producto', 'licencia', 'nota', 'revocacion_licencia_manual_requerida'));
    return jsonb_build_object('ok', true, 'producto', 'licencia', 'revision_manual', true);
  end if;

  -- Créditos: quitar lo que haya disponible (nunca negativo); el resto queda como deuda.
  select saldo into v_saldo from negocio.credito_cuenta where usuario_ref = v_usuario;
  v_saldo := coalesce(v_saldo, 0);
  v_quita := least(coalesce(v_ac.delta, 0), greatest(0, v_saldo));
  v_deuda := coalesce(v_ac.delta, 0) - v_quita;

  if v_quita > 0 then
    perform negocio.credito_mover(v_usuario, -v_quita, 'ajuste', 'Reverso Binance Pay', v_codigo, null);
  end if;

  insert into pago.cobro_estado(cobro_id, estado) values (v_ac.cobro_id, 'revertido');
  perform pago.evento_registrar(v_ac.cobro_id, 'reverso',
    jsonb_build_object('txid', p_txid, 'producto', 'credito', 'delta', v_ac.delta, 'quitado', v_quita, 'deuda', v_deuda));

  return jsonb_build_object('ok', true, 'producto', 'credito', 'quitado', v_quita, 'deuda', v_deuda);
end $function$;

revoke execute on function pago.reverso_aplicar(text) from public, anon, authenticated;
grant  execute on function pago.reverso_aplicar(text) to service_role;
