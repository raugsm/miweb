# 05 - Pasarela: base de datos (motor 6FN)

Todo esto se construyo en Supabase Ariad_SecurityPlugin, en un esquema nuevo
llamado "pago", sin tocar ni romper lo que ya existia (cuentas, creditos, etc.).

## Reglas que se respetaron (las 11 del proyecto)
100% escalable, 6FN, todo en espanol, seguridad impenetrable, sin plural/infinitivos,
funciones claras, soft-delete por estados, buen uso de enums, arquitectura clara, y
todo con Edge Functions + Vault sin romper nada.

## Que es 6FN (en simple)
Cada cosa guarda un solo dato por tabla: una tabla "ancla" con la clave, y tablas
satelite con un dato cada una. Los estados (creado, confirmado, etc.) se guardan por
tiempo (una fila nueva por cambio), nunca se pisan. Es maximo orden y trazabilidad.

## Piezas principales del esquema "pago" (26 tablas)
- cobro: el ancla (una recarga pedida). Satelites 1 a 1: cobro_recarga, cobro_usuario,
  cobro_codigo (el codigo unico), cobro_monto (monto exacto), cobro_moneda,
  cobro_metodo, cobro_vencimiento. Y cobro_estado (historial de estados por tiempo).
- pago_visto: cada pago que el vigia vio en Binance (id unico = dedup natural), con
  satelites (monto, moneda, nota, pagador, cuando, tipo, fuente) y su estado.
- acreditacion: el candado de "una sola vez". Clave por cobro + clave unica por pago:
  imposible acreditar dos veces el mismo cobro o el mismo pago.
- reverso: para deshacer (clawback) si hiciera falta.
- vigia: el "latido" y cursor del vigia (hasta donde leyo Binance).
- evento + evento_hash: la bitacora encadenada por firma (hash), append-only (no se
  puede editar ni borrar; hay triggers que lo impiden).

## Enums (en espanol)
estado_cobro (creado, confirmado, retenido, revertido, anulado...), metodo_cobro,
estado_pago_visto (nuevo, casado, sin_codigo, monto_distinto, duplicado...), etc.

## Funciones clave (dentro de "pago")
- cobro_crear(usuario, creditos): crea el cobro, genera el codigo unico y el monto
  exacto (1 credito = 1 USD, en enteros para no usar decimales).
- cobro_ver(usuario, cobro): el tecnico consulta el estado de SU cobro (verifica que
  sea el dueno).
- pago_ingerir(...): guarda un pago visto en Binance (idempotente por id).
- conciliar(): el emparejador. Por cada pago nuevo: valida moneda, busca el cobro por
  el codigo de la nota, exige monto exacto, aplica anti-cosecha y umbral, y acredita.
- cobro_acreditar(cobro, pago): suma los creditos (reusa la funcion existente
  negocio.credito_mover) exactamente una vez, marca la recarga pagada y deja el evento.
- reverso_aplicar(pago): deshace un credito si hiciera falta.
- cadena_integra(): verifica que la bitacora no fue alterada.

## Seguridad de la base
Todas las tablas de "pago" tienen RLS y NINGUN permiso para el cliente (anon /
authenticated). Solo entra el backend (rol service_role) a traves de las funciones.
Nadie desde afuera puede leer ni escribir esas tablas.

---
[Anterior](04-pasarela-como-funciona.md) - [Indice](00-indice.md) - [Siguiente: Vault y vigia](06-pasarela-vault-vigia-cron.md)
