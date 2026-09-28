# 04 - Arquitectura propuesta (reusar el 80% de lo de Binance)

La idea: reusar el esquema pago 6FN y el patron webhook de MixPay casi intactos;
solo cambia la FUENTE del pago (de sondeo Binance a webhook de pasarela +
reconciliacion de respaldo). Piezas concretas:

## 1) Migracion en Supabase (esquema pago)
- Agregar el valor "yape" al enum metodo_cobro.
- cobro_moneda pasa a soportar PEN (Yape es solo soles).
- El resto NO se toca: cobro (ancla), cobro_codigo (el ARI-XXXX-XXXX se mapea al
  order_number/external_reference de la pasarela), cobro_monto (monto exacto en PEN),
  cobro_vencimiento, cobro_estado.

## 2) cobro_crear (reuso con variante yape)
Genera el cobro, el codigo unico (que viaja como order_number, NO como nota de Yape)
y el monto exacto en PEN. Definir tipo de cambio USD->PEN, o -recomendado- vender
paquetes de creditos con monto PEN fijo para amortiguar la comision fija.

## 3) Edge nueva: pago_cobro_crear_yape  (tecnico logueado)
Patron de pago_cobro_crear: valida sesion/JWT, llama a cobro_crear, y contra la API
de la pasarela crea la Orden de Pago (Culqi) o el pago (Mercado Pago) con
amount + order_number + expiration. Devuelve al frontend el checkout_url o el QR
dinamico + cobro_id + monto + vence_en.

## 4) Edge nueva: pago_webhook_yape  (publica, verify_jwt=false; CLON de recarga_webhook)
NUNCA confia en el body:
- (a) verifica la firma HMAC del webhook (Culqi/MP la dan);
- (b) re-consulta la API de la pasarela por el estado real (fuente de verdad, como
  MixPay payments_result);
- (c) verifica monto exacto + moneda PEN + merchant propio;
- (d) ingesta el pago en pago_visto (dedup natural por el transaction_id de la pasarela);
- (e) llama a conciliar()/cobro_acreditar() que empareja por order_number = cobro_codigo
  y acredita con negocio.credito_mover EXACTAMENTE UNA VEZ (candado acreditacion).

## 5) Vigia reconvertido a red de seguridad (reuso del cron)
En vez de sondear Binance, un cron pago_reconciliar_yape corre cada 1-5 min y consulta
la API de la pasarela por los cobros pendientes cercanos a vencer (por si se perdio un
webhook). Mismo camino conciliar()/cobro_acreditar() -> idempotente, no duplica.

## 6) pago_cobro_estado (reuso literal)
El frontend sondea el estado del cobro hasta que quede confirmado. Sin boton "ya pague".

## 7) Bitacora, reverso, RLS y Vault (reuso sin cambios)
Las tablas evento/evento_hash, reverso y el RLS (todo cerrado, solo service_role via
funciones) se reusan. Los secretos de la pasarela (api key/secret + webhook signing
secret) van al Vault, sembrados por migracion, igual que binance_api_key.

## Frontend
Un componente hermano de RecargaBinance.tsx (RecargaYape.tsx) que muestra el QR
dinamico/checkout y sondea pago_cobro_estado. En server.js, agregar el origen de la
pasarela a connect-src del CSP si el checkout/SDK lo requiere.

## Resultado
~80% del sistema (6FN, exactly-once, credito_mover, bitacora, polling de estado,
patron webhook) se reusa. Lo nuevo es el adaptador de la pasarela (crear orden +
webhook + reconciliacion). El modelo "monto exacto + codigo + acreditacion unica" se
conserva; el codigo pasa de "la nota del yapeo" a order_number por la API (mas fuerte).
Yape se SUMA como metodo; no reemplaza a Binance (el esquema pago ya es multi-metodo).

---
[Anterior](03-opciones-rankeadas.md) - [Indice](00-indice.md) - [Siguiente: Riesgos y pasos](05-riesgos-preguntas-pasos.md)
