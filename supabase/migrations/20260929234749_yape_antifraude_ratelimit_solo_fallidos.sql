-- Refina capa 2: contar SOLO declaraciones sobre cobros NO confirmados
-- (las recargas exitosas quedan confirmadas y NO cuentan -> cero falsos positivos
--  para el tecnico legitimo; el ceiling cae solo sobre fuerza bruta).
create or replace function pago.yape_declarar(p_usuario uuid, p_cobro uuid, p_codigo text)
returns jsonb
language plpgsql security definer
set search_path to 'pago','public'
as $function$
declare v_owner uuid; v_codn text; v_intentos int; v_estado public.estado_cobro; v_user_intentos int;
begin
  v_codn := regexp_replace(coalesce(p_codigo, ''), '[^0-9]', '', 'g');
  if length(v_codn) < 3 then return jsonb_build_object('ok', false, 'motivo', 'codigo_invalido'); end if;

  select cu.usuario_id into v_owner from pago.cobro_usuario cu where cu.cobro_id = p_cobro;
  if v_owner is null then return jsonb_build_object('ok', false, 'motivo', 'cobro_desconocido'); end if;
  if v_owner <> p_usuario then raise exception 'no_autorizado'; end if;
  if not exists (select 1 from pago.cobro_metodo where cobro_id = p_cobro and metodo = 'yape') then
    return jsonb_build_object('ok', false, 'motivo', 'no_yape'); end if;

  select estado into v_estado from pago.cobro_estado where cobro_id = p_cobro order by desde desc limit 1;
  if v_estado = 'confirmado' then return jsonb_build_object('ok', true, 'ya', true); end if;

  -- #2: rate-limit por USUARIO. Max 12 declaraciones/hora sobre cobros NO confirmados.
  select count(*) into v_user_intentos
    from pago.evento e
    join pago.evento_cobro   ec on ec.evento_id = e.id
    join pago.evento_tipo    et on et.evento_id = e.id
    join pago.evento_detalle ed on ed.evento_id = e.id
    join pago.cobro_usuario  cu on cu.cobro_id = ec.cobro_id
    where cu.usuario_id = p_usuario and et.tipo = 'observacion'
      and ed.detalle ? 'yape_declara' and e.ocurrido_en > now() - interval '1 hour'
      and (select estado from pago.cobro_estado ce
             where ce.cobro_id = ec.cobro_id order by ce.desde desc limit 1) <> 'confirmado';
  if v_user_intentos >= 12 then
    return jsonb_build_object('ok', false, 'motivo', 'bloqueo_temporal', 'minutos', 60);
  end if;

  insert into pago.cobro_yape_codigo(cobro_id, codigo, intentos) values (p_cobro, v_codn, 1)
    on conflict (cobro_id) do update
      set codigo = excluded.codigo,
          intentos = pago.cobro_yape_codigo.intentos
                     + case when pago.cobro_yape_codigo.codigo <> excluded.codigo then 1 else 0 end,
          declarado_en = now();
  select intentos into v_intentos from pago.cobro_yape_codigo where cobro_id = p_cobro;
  if v_intentos > 6 then return jsonb_build_object('ok', false, 'motivo', 'demasiados_intentos'); end if;

  perform pago.evento_registrar(p_cobro, 'observacion', jsonb_build_object('yape_declara', v_codn));
  return pago.yape_match_cobro(p_cobro);
end $function$;