-- REGLA 4: secreto_leer con allowlist (no devolver secretos arbitrarios del Vault).
-- Incluye los 4 secretos actuales del backend; cualquier nombre fuera de la lista -> null.
create or replace function pago.secreto_leer(p_nombre text)
returns text language plpgsql security definer set search_path to 'vault','public'
as $function$
declare v text;
begin
  if p_nombre not in ('yape_hmac_secreto','binance_api_key','binance_api_secret','pago_vigia_clave') then
    return null;
  end if;
  select decrypted_secret into v from vault.decrypted_secrets where name = p_nombre limit 1;
  return v;
end $function$;

-- REGLA 10: FK de cobro_yape_codigo con ON DELETE RESTRICT + nombre a la convencion _fk.
alter table pago.cobro_yape_codigo drop constraint cobro_yape_codigo_cobro_id_fkey;
alter table pago.cobro_yape_codigo add constraint cobro_yape_codigo_cobro_fk
  foreign key (cobro_id) references pago.cobro(id) on delete restrict;