-- LOTE 4a — Funciones de panel de operador para el seguimiento de ingresos (B5 + A5).
--   * pago.panel_ingresos_resumen(dias) — libro para el dueño: totales por método/moneda,
--     resumen diario, cola de pagos que necesitan acción y revisiones Yape pendientes.
--   * pago.panel_ingreso_atribuir(txid, cobro) — atribución manual de un pago no casado
--     (sin_codigo / monto_distinto / ignorado / huérfano) a un cobro, acreditando exactly-once.
--   El resolver de revisiones ya existe (pago.yape_revision_resolver) — el edge del Lote 4b
--     lo cablea (A5: hoy no lo invoca nadie). service_role-only. Aditivo.

create or replace function pago.panel_ingresos_resumen(p_dias int default 14)
 returns jsonb language sql security definer set search_path to 'pago','public' stable
as $function$
  select jsonb_build_object(
    'totales', coalesce((
      select jsonb_agg(jsonb_build_object(
               'metodo', t.metodo, 'moneda', t.moneda,
               'acreditado', coalesce(t.acred, 0), 'pendiente', coalesce(t.pend, 0),
               'pagos_acreditados', t.n_acred, 'pagos_pendientes', t.n_pend))
      from (
        select metodo, moneda,
               sum(monto) filter (where acreditado)       as acred,
               sum(monto) filter (where necesita_accion)  as pend,
               count(*)   filter (where acreditado)       as n_acred,
               count(*)   filter (where necesita_accion)  as n_pend
        from pago.v_ingreso group by metodo, moneda
      ) t), '[]'::jsonb),
    'diario', coalesce((
      select jsonb_agg(to_jsonb(d) order by d.dia desc, d.metodo)
      from pago.v_ingreso_diario d
      where d.dia >= (now() - make_interval(days => greatest(1, p_dias)))::date
    ), '[]'::jsonb),
    'pendientes', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.ocurrido desc nulls last)
      from (
        select txid, metodo, moneda, monto, nota, pagador, ocurrido, visto_en, estado_final
        from pago.v_ingreso where necesita_accion
      ) p), '[]'::jsonb),
    'revisiones', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.creado_en desc)
      from pago.v_revision_pendiente r
    ), '[]'::jsonb)
  );
$function$;

create or replace function pago.panel_ingreso_atribuir(p_txid text, p_cobro uuid)
 returns jsonb language plpgsql security definer set search_path to 'pago','negocio','public'
as $function$
declare v_fuente text; v_res jsonb; v_ok boolean;
begin
  if p_txid is null or p_cobro is null then return jsonb_build_object('ok', false, 'motivo', 'faltan_datos'); end if;
  if not exists (select 1 from pago.pago_visto where txid = p_txid) then
    return jsonb_build_object('ok', false, 'motivo', 'pago_desconocido'); end if;
  if exists (select 1 from pago.acreditacion where pago_txid = p_txid) then
    return jsonb_build_object('ok', false, 'motivo', 'pago_ya_acreditado'); end if;
  if not exists (select 1 from pago.cobro where id = p_cobro) then
    return jsonb_build_object('ok', false, 'motivo', 'cobro_desconocido'); end if;

  perform pg_advisory_xact_lock(hashtext('atribuir:' || p_txid));
  select fuente into v_fuente from pago.pago_visto_fuente where txid = p_txid;

  if coalesce(v_fuente,'') = 'yape' then
    v_res := pago.yape_acreditar_par(p_cobro, p_txid);   -- marca pago_visto 'casado' internamente
  else
    v_ok := pago.cobro_acreditar(p_cobro, p_txid);
    if v_ok then
      insert into pago.pago_visto_estado(txid, estado) values (p_txid, 'casado');   -- cobro_acreditar no lo marca
      v_res := jsonb_build_object('ok', true, 'casado', true);
    else
      v_res := jsonb_build_object('ok', false, 'motivo', 'cobro_no_acreditable');
    end if;
  end if;

  if coalesce((v_res->>'ok')::boolean, false) then
    perform pago.evento_registrar(p_cobro, 'recuperacion',
      jsonb_build_object('motivo', 'atribucion_manual', 'txid', p_txid, 'fuente', coalesce(v_fuente,'?')));
  end if;
  return v_res;
end $function$;

revoke execute on function pago.panel_ingresos_resumen(int)         from public, anon, authenticated;
grant  execute on function pago.panel_ingresos_resumen(int)         to service_role;
revoke execute on function pago.panel_ingreso_atribuir(text, uuid)  from public, anon, authenticated;
grant  execute on function pago.panel_ingreso_atribuir(text, uuid)  to service_role;
