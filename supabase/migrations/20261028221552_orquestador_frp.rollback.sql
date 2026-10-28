-- Rollback de 20261028221552_orquestador_frp (Ari-Web, 28-oct-2026)
-- OJO: equipo_terminal/lote_terminal se restauran con sus definiciones previas (guardar antes de aplicar).
drop function if exists frp.clasificar_intentos(int);
drop function if exists frp.proceso_clasificar(uuid);
drop function if exists frp.proveedor_sugerido();
drop view if exists frp.v_proveedor_estado;
drop table if exists frp.evento;
alter table frp.auth_intento drop column if exists motivo_clave;
alter table frp.auth_intento drop column if exists llave_solicitada_en;
drop function if exists frp.clasificar_texto(text);
drop table if exists frp.motivo_terminal;
delete from negocio.parametro where clave = 'frp_reintento_proveedor_max';