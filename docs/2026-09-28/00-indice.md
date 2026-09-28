# Investigacion: pasarela de pago con Yape (Peru) - 2026-09-28

Resultado de una investigacion (6 lineas en paralelo + sintesis) sobre como
replicar para YAPE el modelo que ya funciona con Binance Pay en Ariad: cliente
paga un monto exacto con un identificador y un "vigia" detecta el pago solo y
acredita exactly-once, sin boton "ya pague".

## Indice

- 01 - [Veredicto y recomendacion](01-veredicto.md) - La verdad dura y que conviene hacer
- 02 - [Hallazgos por dimension](02-hallazgos.md) - API oficial, agregadores, QR, DIY, emparejamiento, legal
- 03 - [Opciones rankeadas](03-opciones-rankeadas.md) - Comparacion camino por camino
- 04 - [Arquitectura propuesta](04-arquitectura-propuesta.md) - Como reusar el 80% de lo de Binance
- 05 - [Riesgos, preguntas y proximos pasos](05-riesgos-preguntas-pasos.md)

## Resumen en una linea

El modelo tipo-Binance (leer tu propia cuenta + codigo en la nota) NO se puede
replicar en Yape: no hay API oficial para leer pagos entrantes ni campo de nota.
El camino serio es una PASARELA (Culqi o Mercado Pago) con webhook, que necesita
RUC. La alternativa DIY (leer notificaciones del celular) corre en cuenta personal
pero es fragil y falseable.

## Contexto de Ariad
- Cuenta de cobro hoy: Yape PERSONAL (sin RUC).
- Ya tenemos el motor de Binance: esquema pago 6FN, exactly-once, vigia, y el
  patron webhook de MixPay (recarga_webhook) - reusable casi tal cual para Yape.
