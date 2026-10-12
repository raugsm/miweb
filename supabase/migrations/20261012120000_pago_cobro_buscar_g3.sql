-- 2026-10-12: pago.cobro_buscar(p_codigo) para el buscador del panel G3 (P-13).
-- Busca cobros por su codigo (acepta '485Q' o 'ARI-485Q') y devuelve estado,
-- servicio, referencia_externa (el pedido), vencimiento y los pagos Yape 'nuevo'
-- asociados al mismo codigo. SOLO LECTURA. La usa Ari-Master desde sop_* (security definer).

create or replace function pago.cobro_buscar(p_codigo text)
returns jsonb
language plpgsql stable security definer set search_path to 'pago','public'
as $function$
declare v_cod text;
begin
  v_cod := regexp_replace(upper(trim(coalesce(p_codigo, ''))), '^ARI-?', '');
  if v_cod = '' then return jsonb_build_object('ok', false, 'motivo', 'codigo_vacio'); end if;

  return jsonb_build_object('ok', true, 'codigo', v_cod, 'cobros', coalesce((
    select jsonb_agg(x.item order by x.creado_en desc)
    from (
      select jsonb_build_object(
        'cobro_id', cc.cobro_id,
        'codigo', cc.codigo,
        'codigo_formato', 'ARI-' || cc.codigo,
        'estado', (select estado from pago.cobro_estado ce where ce.cobro_id = cc.cobro_id order by desde desc limit 1),
        'servicio', (select servicio from pago.cobro_servicio cs where cs.cobro_id = cc.cobro_id),
        'referencia_externa', (select referencia_externa from pago.cobro_servicio cs where cs.cobro_id = cc.cobro_id),
        'monto_unidad', (select monto_unidad from pago.cobro_monto cm where cm.cobro_id = cc.cobro_id),
        'vence_en', (select vence_en from pago.cobro_vencimiento cv where cv.cobro_id = cc.cobro_id),
        'pagos_nuevos', (select coalesce(jsonb_agg(
            jsonb_build_object('txid', pv.txid, 'monto_unidad', pm.monto_unidad, 'visto_en', pv.visto_en)
          ), '[]'::jsonb)
          from pago.pago_visto pv
          join pago.pago_visto_fuente pf on pf.txid = pv.txid and pf.fuente = 'yape'
          join pago.pago_visto_monto  pm on pm.txid = pv.txid
          join pago.pago_visto_nota   pn on pn.txid = pv.txid
          where regexp_replace(pn.nota, '[^0-9]', '', 'g') = cc.codigo
            and not exists (select 1 from pago.acreditacion a where a.pago_txid = pv.txid)
            and (select estado from pago.pago_visto_estado e2 where e2.txid = pv.txid order by desde desc limit 1) = 'nuevo')
      ) as item,
      cc.cobro_id,
      (select creado_en from pago.cobro c where c.id = cc.cobro_id) as creado_en
      from pago.cobro_codigo cc
      where cc.codigo = v_cod
    ) x
  ), '[]'::jsonb));
end $function$;

revoke execute on function pago.cobro_buscar(text) from public, anon, authenticated;
grant  execute on function pago.cobro_buscar(text) to service_role;
