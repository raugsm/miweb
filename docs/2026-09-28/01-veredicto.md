# 01 - Veredicto y recomendacion

## La verdad dura (confirmada por la investigacion)
El modelo exacto de Binance NO se puede replicar 1:1 con Yape, por dos motivos:

1. Yape (BCP) NO ofrece hoy (2026) una API ni webhook OFICIAL para LEER las
   transferencias entrantes a tu cuenta ni para ser notificado de un pago P2P.
   La propia FAQ de Yape dice que un negocio no puede integrar Yape directo y
   debe pasar por una pasarela autorizada (Culqi, Niubiz, Izipay, Mercado Pago...).

2. Un yapeo P2P/QR NO lleva un campo de mensaje/nota que le llegue al que cobra.
   O sea, el truco del "codigo en la nota" (clave en Binance) es imposible en Yape.

Conclusion: falta la API de lectura Y falta el campo del codigo. El vigia
read-only que lee tu cuenta y empareja por codigo-en-la-nota + monto exacto no
tiene equivalente oficial en Yape.

## Recomendacion
Cobrar Yape a traves de una PASARELA / AGREGADOR con API + webhook:
- Primera opcion: CULQI (Ordenes de Pago, evento order.status.changed). Es del
  grupo Credicorp/BCP, el mismo dueno que Yape.
- Segunda opcion: MERCADO PAGO Peru (external_reference + webhook, abono
  instantaneo).

Por que: es el UNICO camino oficial que da deteccion automatica real y
emparejamiento por pedido. Y encaja 1:1 con el patron webhook de MixPay que Ariad
ya tiene (nunca confia en el body, re-consulta la fuente de verdad, verifica
monto/moneda/destinatario, reclama la fila atomica y acredita una sola vez con
negocio.credito_mover).

El codigo deja de ir "en la nota del yapeo" (imposible) y pasa a viajar como
order_number / external_reference por la API de la pasarela: es mas fuerte, porque
el pago queda ligado a tu pedido en el servidor del proveedor.

## El costo de tener esto bien
- Comision ~3 a 4.5% + IGV (Culqi ~3.99% + S/0.60; Mercado Pago ~4.49%).
- Tope de S/2000 por operacion. Solo soles (PEN).
- Requiere RUC / afiliacion como comercio (KYC).
- Para micro-recargas de 1 USD conviene vender PAQUETES de creditos, para que la
  comision fija no se coma el ticket.

## Y la cuenta personal (tu caso)?
La via pasarela necesita RUC. Con cuenta personal, lo unico que corre es el DIY
(leer notificaciones del celular), pero es fragil, falseable y probablemente viola
los ToS de Yape (riesgo de bloqueo). No cumple "imposible falsear ni duplicar".
En una frase: con Yape, la seguridad tipo-Binance cuesta un RUC + ~3-4% de comision;
sin eso, lo que hay es fragil.

---
[Indice](00-indice.md) - [Siguiente: Hallazgos](02-hallazgos.md)
