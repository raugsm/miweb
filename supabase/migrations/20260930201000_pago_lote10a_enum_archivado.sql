-- LOTE 10a — Nuevo estado terminal 'archivado' para pago_visto (ocultar pruebas sin borrar).
-- Cumple la regla "nada se borra, se trabaja por estados". Aditivo. Debe ir en su propia
-- migración (commit) antes de usarse en el Lote 10b.
alter type public.estado_pago_visto add value if not exists 'archivado';
