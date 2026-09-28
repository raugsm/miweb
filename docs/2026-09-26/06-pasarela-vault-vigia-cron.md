# 06 - Pasarela: Vault, vigia y cron

## Vault (la caja fuerte de secretos)
Las llaves de Binance NO van en el codigo. Se guardan cifradas en el Vault de
Supabase:
- binance_api_key y binance_api_secret: la clave de SOLO LECTURA de la cuenta de
  Binance de Ariad (hoy la de prueba: raugsm).
- pago_vigia_clave: una clave interna aleatoria que autoriza al cron a llamar al
  vigia.

Detalle util: el Vault solo lo puede escribir el rol postgres (con apply_migration),
no el rol de solo-lectura del MCP. Por eso los secretos se sembraron por migracion.

## El vigia (lee Binance y acredita)
Es una Edge Function (pago_conciliar) que:
1. Lee de Vault la clave de autorizacion y las llaves de Binance (en una sola
   llamada: pago.vigia_arranque).
2. Sincroniza el reloj con Binance, arma la consulta firmada (HMAC) y pide los pagos
   de Binance Pay de una ventana de tiempo.
3. Ingesta lo que vio (dedup por id) y llama a conciliar() para emparejar y acreditar.
4. Avanza el cursor solo si drena la ventana (si no, no avanza y avisa: nunca se
   saltea un pago viejo en silencio).

## El cron (lo dispara cada minuto)
Se habilitaron las extensiones pg_cron y pg_net en Supabase. Un job "pago_vigia"
corre cada minuto y llama a la Edge pago_conciliar, leyendo la clave del Vault en
cada corrida (no queda en texto plano en el job).

## El gran gotcha: error 451 de Binance
Al principio Binance devolvia HTTP 451 ("no disponible por region"): la IP por
defecto de los servidores de Supabase esta geo-bloqueada por Binance (region tipo
US). Por eso en las pruebas locales funcionaba (corria desde Peru).

Solucion: forzar que la Edge se ejecute en una region permitida por Binance,
mandando el header x-region: sa-east-1 (Sao Paulo, Brasil) en la llamada del cron.
Con eso Binance responde bien.

## Otro bug corregido: choque de estados
Las tablas de estado por tiempo usaban now() como marca, pero now() es constante
dentro de una transaccion. Al ingerir y conciliar en la MISMA transaccion, dos
estados de la misma clave chocaban la clave primaria. Fix: usar clock_timestamp()
(que avanza dentro de la transaccion). Verificado: el vigia corre ok, sin errores.

---
[Anterior](05-pasarela-base-de-datos.md) - [Indice](00-indice.md) - [Siguiente: Edge Functions](07-pasarela-edge-functions.md)
