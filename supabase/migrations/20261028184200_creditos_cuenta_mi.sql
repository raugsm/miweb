-- 20261027-creditos-cuenta-mi.sql (REBASE del 20261024 sobre las versiones REALES de prod de cierre/pago_reembolsar al 27-oct, que NO tienen cancelacion_motivo: casos-sin-huecos no esta aplicado en Cuenta MI). · Ari-Web · PROPUESTA, sin aplicar. Requiere OK directo de Peter en el chat de Ari-Web.
-- Pago de un pedido Cuenta MI con SALDO prepago (país obligatorio: regla Peter 24-oct) + devolución automática al saldo
-- si el pedido termina fallido/cancelado o Soporte reembolsa.
-- DEPENDE DE (aplicar antes): 20261024-creditos-centavos.sql + 20261027-creditos-addendum.sql (sop_credito.*). Si despues se aplica
-- casos-sin-huecos en Cuenta MI, ese archivo debe partir de ESTAS versiones (con la devolucion al saldo).
-- Rollback: 20261024-creditos-cuenta-mi.rollback.sql. Dry-run: solo compila (el valor nuevo del enum no se puede usar en la misma transacción).

-- 1) Método nuevo
alter type sop_cuenta_mi.metodo add value if not exists 'saldo';

-- 2) Taller (usuario_taller.codigo) a partir de un auth uid (pedido.taller_uid = auth.uid()); misma regla que sop_credito.taller_actual()
create or replace function sop_credito.taller_de(p_auth uuid)
 returns uuid language sql stable security definer
 set search_path to 'negocio', 'seguridad', 'public' as $fn$
  select ut.codigo
    from auth.users u
    join seguridad.cuenta c on lower(c.correo) = lower(u.email) and c.estado = 'activa'
    join negocio.usuario_taller ut on ut.cuenta_ref = c.codigo
   where u.id = p_auth
   limit 1
$fn$;
revoke all on function sop_credito.taller_de(uuid) from public, anon, authenticated;
grant execute on function sop_credito.taller_de(uuid) to service_role;

-- 3) APP: pagar el pedido con saldo. El país es obligatorio y fija el precio (opción B); el servidor calcula y descuenta.
create or replace function sop_cuenta_mi.pedido_taller_pagar_saldo(p_pedido_id uuid, p_pais text)
 returns jsonb language plpgsql security definer
 set search_path to 'sop_cuenta_mi', 'sop_credito', 'pago', 'public' as $fn$
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
  if v.situacion in ('cancelado', 'exitoso', 'fallido') then raise exception 'pedido_cerrado: el pedido ya está cerrado; creá uno nuevo'; end if;
  if v.pago_situacion in ('confirmado', 'reembolsado') then raise exception 'pago_ya_resuelto'; end if;
  if v.pago_situacion = 'en_revision' then raise exception 'pago_en_curso: Soporte está revisando tu pago'; end if;
  if v.cobro_id is not null then
    select e.estado::text into v_cobro
      from pago.cobro_estado e join pago.cobro_vencimiento cv on cv.cobro_id = e.cobro_id
     where e.cobro_id = v.cobro_id and cv.vence_en > now()
     order by e.desde desc limit 1;
    if v_cobro in ('retenido', 'en_revision', 'confirmado') then raise exception 'pago_en_curso: tu pago está siendo confirmado'; end if;
  end if;

  -- País elegido manda: si cambió (o el pedido no tiene precio), se recalcula con la regla de siempre
  -- (pedido_taller_pais caduca el cobro vivo del país anterior y deja pago_situacion = sin_pago).
  if v.pais is distinct from v_pais or v.monto_usd is null then
    perform sop_cuenta_mi.pedido_taller_pais(p_pedido_id, v_pais);
  elsif v.cobro_id is not null then
    -- mismo país pero había un cobro vivo (Yape/Binance) sin pagar: se caduca, ahora paga con saldo
    v_n := pago.cobro_caducar_pedido_cuenta_mi(p_pedido_id, auth.uid());
  end if;
  select * into v from sop_cuenta_mi.pedido where id = p_pedido_id for update;
  if v.monto_usd is null or v.monto_usd <= 0 then raise exception 'precio_no_configurado'; end if;

  v_taller := sop_credito.taller_de(auth.uid());
  if v_taller is null then raise exception 'sin_taller'; end if;
  v_cent := round(v.monto_usd * 100)::int;

  v_res := sop_credito.consumir(v_taller, v_cent, 'cuenta_mi', v.codigo,
             format('pago con saldo · %s · %s USD', upper(v_pais), to_char(v.monto_usd, 'FM999999990.00')), auth.uid());
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
          format('pago con saldo · %s · %s USD (%s centavos)%s', upper(v_pais), to_char(v.monto_usd, 'FM999999990.00'), v_cent,
                 case when v_n > 0 then ' · cobro anterior caducado' else '' end), auth.uid());
  perform sop_auditoria.registro('cuenta_mi.pedido_taller_pagar_saldo', 'sop_cuenta_mi', 'pedido', p_pedido_id::text,
    jsonb_build_object('pais', v_pais, 'monto_usd', v.monto_usd, 'centavos', v_cent, 'taller', v_taller, 'consumo', v_res, 'cobros_caducados', v_n));

  select * into v from sop_cuenta_mi.pedido where id = p_pedido_id;
  return jsonb_build_object('ok', true, 'saldo_centavos', v_res->'saldo_centavos', 'centavos', v_cent, 'repetido', v_res->'repetido')
         || jsonb_build_object('pedido', sop_cuenta_mi.pedido_json_taller(v));
end $fn$;
revoke all on function sop_cuenta_mi.pedido_taller_pagar_saldo(uuid,text) from public, anon;
grant execute on function sop_cuenta_mi.pedido_taller_pagar_saldo(uuid,text) to authenticated, service_role;

-- 4) Devolución automática al saldo (interna): la llaman cierre() y pago_reembolsar() cuando metodo = 'saldo'.
--    Idempotente (sop_credito.devolver). Nunca frena el cierre: si falla, auditoría y sigue.
create or replace function sop_cuenta_mi.saldo_devolver(p_pedido sop_cuenta_mi.pedido, p_centavos int, p_motivo text)
 returns jsonb language plpgsql security definer
 set search_path to 'sop_cuenta_mi', 'sop_credito', 'public' as $fn$
declare v_taller uuid; v_res jsonb;
begin
  if p_pedido.metodo is distinct from 'saldo'::sop_cuenta_mi.metodo then return jsonb_build_object('ok', false, 'motivo', 'no_pagado_con_saldo'); end if;
  v_taller := sop_credito.taller_de(p_pedido.taller_uid);
  if v_taller is null then return jsonb_build_object('ok', false, 'motivo', 'sin_taller'); end if;
  v_res := sop_credito.devolver(v_taller, p_centavos, 'cuenta_mi', p_pedido.codigo, p_motivo, auth.uid());
  perform sop_auditoria.registro('cuenta_mi.saldo_devolver', 'sop_cuenta_mi', 'pedido', p_pedido.id::text,
    jsonb_build_object('centavos', p_centavos, 'motivo', p_motivo, 'resultado', v_res));
  return v_res;
exception when others then
  begin
    perform sop_auditoria.registro('cuenta_mi.saldo_devolver_fallo', 'sop_cuenta_mi', 'pedido', p_pedido.id::text,
      jsonb_build_object('error', sqlerrm, 'centavos', p_centavos));
  exception when others then null; end;
  return jsonb_build_object('ok', false, 'motivo', 'error', 'detalle', sqlerrm);
end $fn$;
revoke all on function sop_cuenta_mi.saldo_devolver(sop_cuenta_mi.pedido,int,text) from public, anon, authenticated;

-- 5) cierre(): parte de la versión REAL de prod al 27-oct (sin cancelacion_motivo). NUEVO: fallido/cancelado con metodo 'saldo'
--    y pago confirmado → devolución total al saldo + pedido 'reembolsado' (misma foto que un reembolso de Soporte).
create or replace function sop_cuenta_mi.cierre(p_pedido_id uuid, p_situacion sop_cuenta_mi.situacion, p_nota text DEFAULT NULL::text)
 returns void language plpgsql security definer set search_path to 'sop_cuenta_mi', 'public'
as $function$
declare v sop_cuenta_mi.pedido; v_dev jsonb;
begin
  if not sop_acceso.tiene_capacidad('cuenta_mi.cierre') then raise exception 'sin_capacidad: cuenta_mi.cierre'; end if;
  if p_situacion not in ('exitoso','fallido','cancelado') then raise exception 'situacion_invalida'; end if;
  select * into v from sop_cuenta_mi.pedido where id=p_pedido_id and estado='activo' for update;
  if v.id is null then raise exception 'pedido_inexistente'; end if;
  if not sop_caso.es_visible(v.grupo) then raise exception 'fuera_de_alcance'; end if;
  if p_situacion='exitoso' and v.pago_situacion<>'confirmado' then raise exception 'pago_no_confirmado: no se puede completar sin pago'; end if;
  if v.situacion in ('exitoso','fallido','cancelado') then raise exception 'pedido_ya_cerrado'; end if;
  update sop_cuenta_mi.pedido set situacion=p_situacion, cierre_en=now(), cierre_por=auth.uid() where id=p_pedido_id;
  insert into sop_cuenta_mi.historial (pedido_id, situacion, nota, creado_por) values (p_pedido_id, p_situacion, coalesce(p_nota,'cierre G3'), auth.uid());
  -- [2026-10-24] pagado con saldo y no se completó → devolución automática al saldo (decisión Peter)
  if p_situacion in ('fallido','cancelado') and v.pago_situacion = 'confirmado' and v.metodo = 'saldo'::sop_cuenta_mi.metodo then
    v_dev := sop_cuenta_mi.saldo_devolver(v, null, format('devolución automática · %s · %s', p_situacion, v.codigo));
    if coalesce((v_dev->>'ok')::boolean, false) then
      update sop_cuenta_mi.pedido
         set pago_situacion='reembolsado', reembolso_monto=v.monto_local, reembolso_usd=v.monto_usd,
             reembolso_motivo='devolución automática al saldo ('||p_situacion||')', reembolso_en=now(), reembolso_por=auth.uid()
       where id=p_pedido_id;
      insert into sop_cuenta_mi.historial (pedido_id, situacion, nota, creado_por)
      values (p_pedido_id, p_situacion, format('devolución al saldo · %s centavos', v_dev->>'centavos'), auth.uid());
    end if;
  end if;
  perform sop_auditoria.registro('cuenta_mi.cierre','sop_cuenta_mi','pedido',p_pedido_id::text, jsonb_build_object('situacion',p_situacion,'devolucion_saldo',v_dev));
end; $function$;

-- 6) pago_reembolsar(): parte de la versión REAL de prod al 27-oct. NUEVO: si metodo = 'saldo', la plata vuelve al saldo
--    (parcial permitido, en la proporción USD del monto pedido) en vez de salir por la pasarela.
create or replace function sop_cuenta_mi.pago_reembolsar(p_pedido_id uuid, p_monto numeric, p_motivo text)
 returns void language plpgsql security definer set search_path to 'sop_cuenta_mi', 'public'
as $function$
declare v sop_cuenta_mi.pedido; v_usd numeric; v_dev jsonb;
begin
  if not sop_acceso.tiene_capacidad('reembolso.decidir') then raise exception 'sin_capacidad: reembolso.decidir'; end if;
  select * into v from sop_cuenta_mi.pedido where id = p_pedido_id and estado = 'activo' for update;
  if v.id is null then raise exception 'pedido_inexistente'; end if;
  if v.pago_situacion <> 'confirmado' then raise exception 'pago_no_confirmado'; end if;
  if p_monto is null or p_monto <= 0 then raise exception 'monto_invalido'; end if;
  if p_monto > coalesce(v.monto_local, v.monto_usd) then raise exception 'monto_excede'; end if;
  v_usd := case when coalesce(v.monto_local,0) > 0 then round(p_monto * v.monto_usd / v.monto_local, 2) else p_monto end;
  -- [2026-10-24] pagado con saldo → vuelve al saldo (centavos del USD devuelto); si falla, no se marca reembolsado
  if v.metodo = 'saldo'::sop_cuenta_mi.metodo then
    v_dev := sop_cuenta_mi.saldo_devolver(v, round(v_usd * 100)::int, 'reembolso al saldo · '||coalesce(p_motivo,''));
    if not coalesce((v_dev->>'ok')::boolean, false) then raise exception 'devolucion_saldo_fallo: %', coalesce(v_dev->>'motivo', '?'); end if;
  end if;
  update sop_cuenta_mi.pedido
     set pago_situacion='reembolsado', reembolso_monto=p_monto, reembolso_usd=v_usd,
         reembolso_motivo=nullif(btrim(coalesce(p_motivo,'')),''), reembolso_en=now(), reembolso_por=auth.uid(),
         situacion='cancelado', cierre_en=now(), cierre_por=auth.uid()
   where id=p_pedido_id;
  insert into sop_cuenta_mi.historial (pedido_id, situacion, nota, creado_por)
  values (p_pedido_id, 'cancelado', 'reembolso '||p_monto::text||coalesce(' · '||p_motivo,'')||case when v.metodo = 'saldo'::sop_cuenta_mi.metodo then ' · al saldo' else '' end, auth.uid());
  perform sop_auditoria.registro('sop_cuenta_mi.pago_reembolsar','cuenta_mi','pedido',p_pedido_id::text, jsonb_build_object('monto',p_monto,'usd',v_usd,'devolucion_saldo',v_dev));
end; $function$;
