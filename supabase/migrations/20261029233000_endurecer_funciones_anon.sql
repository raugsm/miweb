-- 20261029233000_endurecer_funciones_anon.sql — Ari-Web, 29-oct-2026
-- Hallazgo crítico: el rol `anon` podía ejecutar funciones SECURITY DEFINER
-- administrativas/financieras en los esquemas expuestos por PostgREST.
-- Se revoca `PUBLIC`/`anon` y se deja solo el rol mínimo necesario.
-- No cambia lógica de negocio; solo privilegios.
--
-- Criterio:
--   service_only  -> solo edge functions con service_role (panel/automatización)
--   auth_app      -> app cliente con JWT authenticated (comprueba auth.uid/capacidad)
--   public_keep   -> catálogo/versión/cierre de caso del cliente (público por diseño)
--   trigger       -> función de trigger; no se invoca por RPC

begin;

-- ============ service_only: pagos / panel / operaciones sensibles ============
revoke all on function pago.cobro_detalle(uuid) from public, anon, authenticated;
grant execute on function pago.cobro_detalle(uuid) to service_role;

revoke all on function pago.cobros_activos(uuid, text) from public, anon, authenticated;
grant execute on function pago.cobros_activos(uuid, text) to service_role;

revoke all on function pago.fraude_registrar(text, text, text, bigint, text) from public, anon, authenticated;
grant execute on function pago.fraude_registrar(text, text, text, bigint, text) to service_role;

revoke all on function pago.por_validar(integer) from public, anon;
grant execute on function pago.por_validar(integer) to authenticated, service_role;

revoke all on function pago.validar_confirmar(text, uuid) from public, anon;
grant execute on function pago.validar_confirmar(text, uuid) to authenticated, service_role;

revoke all on function pago.yape_huerfanizar() from public, anon, authenticated;
grant execute on function pago.yape_huerfanizar() to service_role;

revoke all on function pago.yape_reintento() from public, anon, authenticated;
grant execute on function pago.yape_reintento() to service_role;

revoke all on function pago.yape_revision_candidato_agregar(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function pago.yape_revision_candidato_agregar(uuid, uuid, boolean) to service_role;

revoke all on function pago.yape_revision_crear(text, bigint, text, uuid[], boolean, public.motivo_revision) from public, anon, authenticated;
grant execute on function pago.yape_revision_crear(text, bigint, text, uuid[], boolean, public.motivo_revision) to service_role;

revoke all on function sop_frp.caso_cerrar_servido(text, uuid, uuid) from public, anon, authenticated;
grant execute on function sop_frp.caso_cerrar_servido(text, uuid, uuid) to service_role;

revoke all on function sop_frp.conciliacion_auditoria(text) from public, anon;
grant execute on function sop_frp.conciliacion_auditoria(text) to authenticated, service_role;

revoke all on function sop_frp.pagador_banear(text, text) from public, anon;
grant execute on function sop_frp.pagador_banear(text, text) to authenticated, service_role;

revoke all on function sop_frp.pago_candidatos(text) from public, anon;
grant execute on function sop_frp.pago_candidatos(text) to authenticated, service_role;

revoke all on function sop_frp.pago_ficha(text) from public, anon;
grant execute on function sop_frp.pago_ficha(text) to authenticated, service_role;

revoke all on function sop_frp.pendientes_de_servir(integer) from public, anon;
grant execute on function sop_frp.pendientes_de_servir(integer) to authenticated, service_role;

revoke all on function sop_config.ajuste_fijar(text, text) from public, anon;
grant execute on function sop_config.ajuste_fijar(text, text) to authenticated, service_role;

revoke all on function sop_config.frp_b_enviar(text, text) from public, anon;
grant execute on function sop_config.frp_b_enviar(text, text) to authenticated, service_role;

revoke all on function sop_config.frp_b_esperar(bigint) from public, anon;
grant execute on function sop_config.frp_b_esperar(bigint) to authenticated, service_role;

revoke all on function sop_frp.huerfano_asignar(text, uuid, text) from public, anon;
grant execute on function sop_frp.huerfano_asignar(text, uuid, text) to authenticated, service_role;

revoke all on function sop_caso.editar(uuid, text, numeric, numeric) from public, anon;
grant execute on function sop_caso.editar(uuid, text, numeric, numeric) to authenticated, service_role;

revoke all on function sop_alquiler.cuenta_alta(text, text, text, text, text, text, sop_alquiler.cuenta_estado) from public, anon;
grant execute on function sop_alquiler.cuenta_alta(text, text, text, text, text, text, sop_alquiler.cuenta_estado) to authenticated, service_role;

revoke all on function public.talleres_buscar(text) from public, anon;
grant execute on function public.talleres_buscar(text) to authenticated, service_role;

-- ============ auth_app: la app CMI usa JWT y la función valida auth.uid ============
revoke all on function sop_cuenta_mi.pedido_taller_pais(uuid, text) from public, anon;
grant execute on function sop_cuenta_mi.pedido_taller_pais(uuid, text) to authenticated, service_role;

-- ============ trigger: no se invocan por RPC ============
revoke all on function sop_acceso.alta_desde_auth() from public, anon, authenticated;
grant execute on function sop_acceso.alta_desde_auth() to service_role;

revoke all on function sop_alquiler.pago_hook() from public, anon, authenticated;
grant execute on function sop_alquiler.pago_hook() to service_role;

revoke all on function sop_caso.difusion() from public, anon, authenticated;
grant execute on function sop_caso.difusion() to service_role;

revoke all on function sop_cuenta_mi.difusion() from public, anon, authenticated;
grant execute on function sop_cuenta_mi.difusion() to service_role;

revoke all on function sop_cuenta_mi.pedido_exigir_servicio() from public, anon, authenticated;
grant execute on function sop_cuenta_mi.pedido_exigir_servicio() to service_role;

revoke all on function sop_frp.difusion() from public, anon, authenticated;
grant execute on function sop_frp.difusion() to service_role;

-- ============ public_keep: contratos públicos deliberados ============
-- Versión de la app/panel, métodos de pago públicos y cierre de caso del cliente.
grant execute on function public.get_latest_client_version() to anon, authenticated, service_role;
grant execute on function public.close_client_case_cancelled(text, uuid, text) to anon, authenticated, service_role;
grant execute on function public.close_client_case_served(text, uuid, uuid) to anon, authenticated, service_role;
grant execute on function public.es_g3_tecnico(uuid) to anon, authenticated, service_role;
grant execute on function sop_config.metodos_pago_publico(text) to anon, authenticated, service_role;
grant execute on function sop_config.version_panel(text) to anon, authenticated, service_role;

commit;
