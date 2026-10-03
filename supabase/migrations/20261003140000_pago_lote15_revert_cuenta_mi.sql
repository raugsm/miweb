-- LOTE 15-revert — Cuenta MI se pausó (decisión del dueño: volver a estado limpio).
-- Se revierten los dos objetos que se agregaron para el pago in-app de Cuenta MI
-- (lote15 + lote15b): el RPC externo y la vista de lectura. El esquema `pago` vuelve
-- EXACTO a su estado anterior. Nada de esto movía dinero por sí solo (service_role-only,
-- sin uso actual). Los lotes 15/15b quedan en el repo para re-aplicar si se rearma.
-- No toca el motor (conciliar/cobro_confirmar_servicio/créditos/licencia/Yape intactos).
-- Los cobros de prueba servicio='cuenta_mi' creados quedaron caducados (sin pago) e inertes.

drop function if exists pago.cobro_crear_externo(text, text, numeric, text, text, text, text);
drop view if exists pago.v_cobro_servicio;
