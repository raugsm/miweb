# Recarga de créditos con MixPay (Binance Pay / USDT, mundial)

Dos funciones que cobran una recarga de créditos de Ari-Tool a través de
**MixPay**. El técnico (de cualquier país) paga con **Binance Pay** (QR + código)
o **USDT**, y cuando MixPay confirma el pago se le suman los créditos solos.

    recarga_crear    (autenticada)   crea el cobro en MixPay → devuelve la url del QR
    recarga_webhook  (pública)       MixPay avisa → verifica y acredita 1 sola vez

MixPay es **no-custodial**: el dinero llega directo a la cuenta/wallet del
`payeeId` (la cuenta MixPay/Binance de Ariad). **0% de comisión** de MixPay.

## Modelo
1 crédito = 1 USD. Paquetes: 5, 10, 20, 50, 100. Se cotiza en **USD**
(`quoteAssetId = "usd"`) y Ariad **recibe en USDT** (por defecto red **TRC-20**,
barata para pagos chicos; se puede cambiar a BEP-20 con un secreto).

## Migración de la tabla (la tabla ya existe, viene de la etapa CoinGate)
```sql
-- MixPay no usa el `token` por orden (valida re-consultando su API), y guarda
-- su propio código/traza. Migración aditiva y segura:
alter table negocio.recarga alter column token drop not null;
alter table negocio.recarga add column if not exists mixpay_code text;
alter table negocio.recarga add column if not exists mixpay_trace_id text;
notify pgrst, 'reload schema';
```
Las columnas viejas `coingate_order_id` y `token` quedan sin uso (se pueden
dejar; no molestan). `estado`: `pendiente | pagado | fallido`.

## Secretos a cargar en Supabase (Edge Functions → Secrets)
- `MIXPAY_PAYEE_ID` — **(obligatorio)** el payeeId de la cuenta MixPay de Ariad.
  Se saca del dashboard de MixPay (ver abajo). MixPay **no** usa clave secreta de
  API: el payeeId es el "destino" del dinero y alcanza para cobrar.
- `MIXPAY_SETTLEMENT_ASSET_ID` — opcional. En qué recibe Ariad. Por defecto USDT
  TRC-20 (`b91e18ff-a9ae-3dc7-8679-e935d9a4b34b`). USDT BEP-20 =
  `94213408-4ee7-3150-a9c4-9c5cce421c78`.
- `MIXPAY_QUOTE_ASSET_ID` — opcional. Por defecto `"usd"`.
- `ARIAD_URL` — ya está cargado (se usa para la URL del webhook).

## Cómo consigue el dueño el payeeId
1. Registrarse en https://dashboard.mixpay.me (email o wallet; sin papeles, minutos).
2. Elegir el "settlement asset" = **USDT (TRC-20)**.
3. Copiar el **payeeId** (un UUID) desde los ajustes → cargarlo como `MIXPAY_PAYEE_ID`.

## Cómo se prueba (MixPay NO tiene sandbox → prueba real chica)
1. Cargar `MIXPAY_PAYEE_ID` y desplegar las dos funciones (correr antes la migración).
2. Llamar a `recarga_crear` con `{ creditos: 5 }` (con el JWT de un técnico).
3. Abrir la `url` (`https://mixpay.me/code/<code>`), confirmar que aparece
   **Binance Pay**, y pagar 5 USDT desde Binance.
4. Verificar que el saldo del técnico sube (webhook → `credito_mover`, 1 sola vez)
   y que el USDT llega a la cuenta MixPay/Binance de Ariad.

## Anti-doble y seguridad
El aviso (callback) de MixPay **no viene firmado** y **no trae el resultado**.
Por eso `recarga_webhook` **nunca** confía en el body: re-consulta
`payments_result` del lado del servidor y solo acredita si `status = "success"`
y coinciden `payeeId`, `quoteAssetId` y el monto. Reclama la fila con un UPDATE
condicional (pendiente→pagado): los avisos repetidos no vuelven a acreditar.

## Regla de oro (operación)
No dejar saldo acumulado en MixPay: retirar el USDT seguido a la Binance de
Ariad y pasar a soles por P2P. Así, ante cualquier traba, casi no hay fondos ahí.
