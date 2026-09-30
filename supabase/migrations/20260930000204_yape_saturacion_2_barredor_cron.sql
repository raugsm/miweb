-- SATURACION #3 (acumulacion): barredor. Caduca cobros yape vencidos que quedaron
-- 'creado'/'en_espera'/'retenido' (cierra tambien el mis-ruteo de cobros viejos), y
-- marca pagos yape huerfanos (vistos hace >24h, sin casar) como 'ignorado' para higiene.
create or replace function pago.yape_barrer()
returns jsonb
language plpgsql security definer set search_path to 'pago','negocio','public'
as $function$
declare v_cad int := 0; v_orf int := 0; r record;
begin
  for r in
    select c.id
    from pago.cobro c
    join pago.cobro_metodo cm on cm.cobro_id = c.id and cm.metodo = 'yape'
    join pago.cobro_vencimiento cv on cv.cobro_id = c.id
    where cv.vence_en < now()
      and (select estado from pago.cobro_estado e where e.cobro_id = c.id order by desde desc limit 1)
          in ('creado','en_espera','retenido')
  loop
    insert into pago.cobro_estado(cobro_id, estado) values (r.id, 'caducado');
    v_cad := v_cad + 1;
  end loop;

  for r in
    select pv.txid
    from pago.pago_visto pv
    join pago.pago_visto_fuente   pf on pf.txid = pv.txid and pf.fuente = 'yape'
    join pago.pago_visto_ocurrido po on po.txid = pv.txid
    where po.ocurrido < now() - interval '24 hours'
      and not exists (select 1 from pago.acreditacion a where a.pago_txid = pv.txid)
      and (select estado from pago.pago_visto_estado e where e.txid = pv.txid order by desde desc limit 1)
          in ('nuevo','sin_codigo')
  loop
    insert into pago.pago_visto_estado(txid, estado) values (r.txid, 'ignorado');
    v_orf := v_orf + 1;
  end loop;

  return jsonb_build_object('ok', true, 'caducados', v_cad, 'huerfanos', v_orf);
end $function$;

-- Programar cada 5 minutos (upsert por jobname).
select cron.schedule('yape_barrer', '*/5 * * * *', $$select pago.yape_barrer();$$);