# 03 - Opciones rankeadas

## 1. Pasarela con Yape por API + webhook  (RECOMENDADA)
Culqi (Ordenes de Pago / webhook order.status.changed) o Mercado Pago
(external_reference + webhook).
- Viabilidad: ALTA. Unico camino oficial con deteccion automatica y emparejamiento
  por pedido. Culqi es de Credicorp/BCP (mismo dueno que Yape); Mercado Pago abona
  al instante. Encaja 1:1 con el patron webhook de MixPay que ya tenemos.
- Esfuerzo: MEDIO. Reusa el esquema pago 6FN, credito_mover y recarga_webhook.
  Trabajo real: alta/KYC, edge de crear-cobro, edge webhook (re-consulta + HMAC),
  agregar metodo yape y moneda PEN, cron de reconciliacion de respaldo.
- Costo: ~3.99% + S/0.60 (Culqi) o ~4.49% (MP) + IGV. Tope S/2000/operacion, PEN.
- Legalidad: ALTA/limpia (RUC + comprobantes; es el modo que Yape habilita).
- Fiabilidad: ALTA. Webhook firmado + re-consulta + idempotencia = exactly-once
  real, imposible falsear con capturas.

## 2. QR dinamico interoperable (EMVCo/BCRP)  emitido por pasarela
- Viabilidad: ALTA, pero es una VARIANTE de la opcion 1 (el QR lo emite una pasarela
  regulada que devuelve el webhook). Ventaja: un solo QR cobra Yape y Plin.
- Esfuerzo: MEDIO (similar a opcion 1; se usa el endpoint de QR dinamico).
- Costo: el de la pasarela (~2.5-2.95% + fija + IGV segun proveedor). Tope S/2000, PEN.
- Legalidad: ALTA (estandar obligatorio BCRP; Circular 0022-2025 vigente 1-abr-2026).
- Fiabilidad: ALTA (igual que opcion 1). Mejor UX: el cliente escanea y listo, y
  ademas capta Plin.

## 3. DIY: leer notificaciones push de Android  (el "vigia" sobre cuenta propia)
- Viabilidad: BAJA para produccion critica. Detecta en tiempo real sin boton, pero
  NO trae codigo: obliga a emparejar por monto-en-centimos (99 buckets por sol).
- Esfuerzo: MEDIO-ALTO y CONTINUO: telefono dedicado siempre prendido, permisos,
  pelear con MIUI/EMUI, recalibrar regex con cada update.
- Costo: casi cero comision + un telefono dedicado. Barato pero fragil.
- Legalidad: RIESGOSA. Uso comercial en cuenta personal + lectura no oficial de
  notificaciones probablemente contra ToS (riesgo de cierre de cuenta), sin comprobantes.
- Fiabilidad: BAJA. Notificacion local se puede simular (falseable); cuenta personal
  se auto-bloquea a 5 UIT/mes; single-point-of-failure en un telefono. NO cumple
  "imposible falsear ni duplicar".

## 4. API/webhook oficial de Yape para P2P entrantes  (analogo directo de Binance)
- Viabilidad: NULA. NO EXISTE. Ningun producto oficial expone lectura de pagos
  recibidos ni webhook de pago entrante.

## 5. Yape Empresa/Negocios oficial (sin pasarela)
- Viabilidad: BAJA para automatizar. Es oficial y legal, pero la validacion es
  MANUAL (hasta 5 asistentes miran la app); no hay API/webhook para acreditar en tu
  backend. Tope de recepcion S/999.99 por operacion. Comision ~2.95% de recaudacion.

---
[Anterior](02-hallazgos.md) - [Indice](00-indice.md) - [Siguiente: Arquitectura](04-arquitectura-propuesta.md)
