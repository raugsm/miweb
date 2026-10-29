-- 20261029234000_storage_limites.sql — Ari-Web, 29-oct-2026
-- Limita tamaño y tipo de archivos en buckets privados de comprobantes/fotos.
-- Evita abuso de almacenamiento/costo y cargas ejecutables o gigantes.

begin;

update storage.buckets
   set file_size_limit = 15728640,
       allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf']
 where id = 'app_cuenta_mi';

update storage.buckets
   set file_size_limit = 10485760,
       allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf']
 where id = 'comprobante';

update storage.buckets
   set file_size_limit = 10485760,
       allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf']
 where id = 'payment-proofs';

commit;
