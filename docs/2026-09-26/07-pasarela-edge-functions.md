# 07 - Pasarela: Edge Functions (las 3 funciones del servidor)

Las Edge Functions son funciones que corren en el servidor de Supabase (Deno). Todas
usan el patron de seguridad del proyecto (archivo compartido seguridad.ts: admin(),
exigirSesion(), resp(), CORS). Se desplegaron al proyecto Ariad_SecurityPlugin.

## 1) pago_cobro_crear (la llama el tecnico logueado)
- Valida la sesion del tecnico (su JWT) y saca su usuario_taller.
- Llama a pago.cobro_crear -> genera el cobro, el codigo unico y el monto exacto.
- Lee de negocio.parametro el destino de Binance (binance_pay_id) y el link para el
  QR (binance_pay_url), y los devuelve.
- Responde: cobro_id, codigo (ARI-XXXX-XXXX), monto ("1.00"), vence_en, destino,
  pago_url.

## 2) pago_cobro_estado (la llama el frontend, en bucle)
- Valida la sesion y que el cobro sea del tecnico (dueno).
- Devuelve el estado del cobro y si ya esta pagado (confirmado). Sin boton de "ya
  pague": el frontend solo pregunta hasta que el vigia confirme.

## 3) pago_conciliar (el vigia; la dispara el cron, no un usuario)
- Se autoriza con el header x-vigia-clave (comparado contra la clave del Vault). Sin
  esa clave: 401, ni siquiera toca Binance.
- Lee las llaves de Binance del Vault, consulta Binance Pay (firma HMAC), normaliza
  los pagos (incluida la nota, donde viene el codigo) y llama a pago.vigia_correr,
  que ingesta el lote y concilia.
- Corre en region sa-east-1 (por el tema del 451).

## Detalle importante: exponer el esquema "pago"
Para que las Edge (con service_role) puedan llamar las funciones de "pago" por la
API, hubo que agregar "pago" a la lista de esquemas expuestos de PostgREST. Las
tablas siguen cerradas por RLS; solo las funciones (con permiso) entran.

## Verificacion
Se probo de punta a punta con un tecnico real: crear cobro -> simular/pagar ->
acreditar el saldo (0 a 1) -> volver a conciliar no duplica (una sola vez) -> la
bitacora queda integra. Los datos de prueba se limpiaron.

---
[Anterior](06-pasarela-vault-vigia-cron.md) - [Indice](00-indice.md) - [Siguiente: Frontend y QR](08-pasarela-frontend-qr.md)
