-- 20261029174500_frp_saldo_cobro_del_lote.sql — Ari-Web, 29-oct-2026
-- Refuerzo de #1265 #1 sobre la version vigente de sop_frp.pagar_con_saldo (pago_via='saldo'):
-- ademas de lote.cobro_id, buscar el cobro vinculado por pago.cobro_servicio (sop_frp.cobro_del_lote).
-- Sin esto, un cobro vivo con lote.cobro_id NULL podria convivir con el pago con saldo.
-- No cambia el resto de la version vigente. No publica 1.1.23.

create or replace function sop_frp.pagar_con_saldo(p_lote_id uuid)
returns jsonb language plpgsql security definer
set search_path to 'sop_frp', 'sop_credito', 'pago', 'negocio', 'public' as $fn$
declare
  v_uid    uuid := auth.uid();
  v_taller uuid;
  v_lote   sop_frp.lote;
  v_cent   integer;
  v_res    jsonb;
  v_n      integer := 0;
  v_estado public.estado_cobro;
  v_cancel jsonb;
  v_cobro  uuid;
begin
  if v_uid is null then raise exception 'sin_sesion'; end if;
  v_taller := sop_credito.taller_actual();
  if v_taller is null then raise exception 'sin_taller'; end if;

  select * into v_lote
    from sop_frp.lote
   where id = p_lote_id and taller_uid = v_uid and estado = 'activo'
   for update;
  if v_lote.id is null then raise exception 'lote_inexistente'; end if;

  -- Idempotente: si ya hay un caso activo pagado, no vuelve a cobrar.
  if exists (select 1 from sop_frp.caso
              where lote_id = p_lote_id and estado = 'activo' and pago_situacion = 'confirmado') then
    select coalesce(saldo, 0) into v_cent from negocio.credito_cuenta where usuario_ref = v_taller;
    return jsonb_build_object('ok', true, 'repetido', true, 'lote_id', p_lote_id,
                              'casos', 0, 'saldo_centavos', v_cent);
  end if;

  if not exists (select 1 from sop_frp.caso
                  where lote_id = p_lote_id and estado = 'activo'
                    and situacion in ('pendiente_conexion', 'en_proceso')
                    and pago_situacion in ('pendiente', 'sin_pago', 'en_revision')) then
    raise exception 'sin_casos_por_pagar';
  end if;

  -- #1265 #1: cobro vivo por lote.cobro_id O por pago.cobro_servicio (referencia_externa = lote).
  v_cobro := coalesce(v_lote.cobro_id, sop_frp.cobro_del_lote(p_lote_id));
  if v_cobro is not null then
    select ce.estado into v_estado
      from pago.cobro_estado ce
     where ce.cobro_id = v_cobro
     order by ce.desde desc limit 1;
    if v_estado = 'confirmado' then
      raise exception 'pago_ya_confirmado';
    elsif v_estado in ('retenido', 'en_revision') then
      raise exception 'pago_en_curso';
    elsif v_estado in ('creado', 'en_espera') then
      v_cancel := pago.cobro_cancelar(v_uid, v_cobro);
      if not coalesce((v_cancel ->> 'ok')::boolean, false) then
        raise exception 'pago_en_curso';
      end if;
    end if;
    update sop_frp.lote set cobro_id = null where id = p_lote_id;
    v_lote.cobro_id := null;
  end if;

  v_cent := round(coalesce(v_lote.total_usd, 0) * 100)::int;
  if v_cent <= 0 then raise exception 'precio_invalido'; end if;

  v_res := sop_credito.consumir(v_taller, v_cent, 'frp', p_lote_id::text,
                                'FRP ' || coalesce(v_lote.codigo, ''), v_uid, v_lote.pais);
  if not coalesce((v_res ->> 'ok')::boolean, false) then
    return jsonb_build_object(
      'ok', false,
      'motivo', coalesce(v_res ->> 'motivo', 'saldo_insuficiente'),
      'saldo_centavos', coalesce((v_res ->> 'saldo_centavos')::int, 0),
      'faltan_centavos', coalesce((v_res ->> 'faltan_centavos')::int, 0),
      'precio_centavos', v_cent);
  end if;

  update sop_frp.caso
     set pago_situacion = 'confirmado',
         pagado_en = now(),
         pagado_por = v_uid,
         pago_motivo = null
   where lote_id = p_lote_id and estado = 'activo'
     and situacion in ('pendiente_conexion', 'en_proceso')
     and pago_situacion in ('pendiente', 'sin_pago', 'en_revision');
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'sin_casos_por_pagar'; end if;

  insert into sop_frp.historial (caso_id, situacion, nota, creado_por)
    select c.id, c.situacion, 'pago con saldo · ' || v_cent || ' centavos', v_uid
      from sop_frp.caso c
     where c.lote_id = p_lote_id and c.estado = 'activo'
       and c.pago_situacion = 'confirmado';

  update sop_frp.lote
     set actualizado_en = now(),
         pago_via = 'saldo',
         metodo_pago_id = null
   where id = p_lote_id;

  perform sop_auditoria.registro('sop_frp.pagar_con_saldo', 'sop_frp', 'lote', p_lote_id::text,
    jsonb_build_object('casos', v_n, 'centavos', v_cent, 'taller', v_taller,
                       'saldo_despues', (v_res ->> 'saldo_centavos')::int, 'pago_via', 'saldo',
                       'cobro_cancelado', v_cobro));

  return jsonb_build_object('ok', true, 'repetido', false, 'lote_id', p_lote_id,
    'casos', v_n, 'centavos', v_cent, 'saldo_centavos', (v_res ->> 'saldo_centavos')::int);
end $fn$;
revoke all on function sop_frp.pagar_con_saldo(uuid) from public, anon;
grant execute on function sop_frp.pagar_con_saldo(uuid) to authenticated, service_role;

-- Rollback: restaurar la version previa (AriTool_Recursos/sql/20261029-frp-pagar-saldo.sql con el fix de pago_via).
