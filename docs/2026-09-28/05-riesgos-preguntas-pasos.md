# 05 - Riesgos, preguntas y proximos pasos

## Riesgos clave
- NO existe API oficial de Yape para leer pagos entrantes P2P ni webhook de "pago
  recibido": el modelo Binance no es replicable 1:1. La via pasarela es la unica
  oficial fiable.
- Un yapeo P2P/QR no tiene campo de mensaje que llegue al que cobra: el codigo debe
  ir como order_number por la API de la pasarela.
- DIY (leer notificaciones) es falseable (se simula la notificacion), fragil (el
  regex se rompe con cada update de Yape), depende de un telefono siempre prendido, y
  probablemente viola ToS de Yape (riesgo de cierre de cuenta).
- Cuenta personal: tope de recepcion 5 UIT/mes (~S/26,750), OTP obligatorio sobre
  S/500. Para volumen comercial hay que usar Yape Negocios/Empresa con RUC.
- Tope de S/2000 por operacion (solo PEN) en el modelo pasarela: recargas grandes o
  licencias de 25 USD pueden requerir partir el pago.
- Comisiones ~3-4.5% + IGV + fija S/0.30-0.60: en micro-pagos de 1 USD la fija es
  letal -> vender creditos en paquetes.
- Fiscalizacion SUNAT (2025): ingresos por Yape/Plin a negocios se fiscalizan; sin
  comprobantes y sobre ~S/45,000/ano hay revision retroactiva hasta 4 anos. Requiere
  RUC + comprobantes + bancarizacion.
- Marco en cambio: Reglamento del Sistema Nacional de Pagos (Circular 0022-2025-BCRP)
  vigente 1-abr-2026; apoyarse en pasarela ya regulada.
- Izipay esta siendo absorbido por IFS/Interbank (2025): confirmar continuidad antes
  de firmar. Kushki/Openpay/Prometeo/Floid: soporte de Yape online no confirmado, no
  elegir sin verificar. Culqi y Mercado Pago si lo documentan.
- Seguridad del webhook obligatoria: verificar firma HMAC, re-consultar la API del
  proveedor (no confiar en el POST) e idempotencia por order_number/transaction_id.

## Preguntas para Bryam (definen el camino)
1. Tienes/puedes sacar RUC? persona natural con negocio o persona juridica?
2. La cuenta de cobro es Yape personal o Yape Negocios/Empresa?
3. Cuanto volumen mensual estimas en soles? (topes y umbral SUNAT ~S/45,000/ano).
4. Cual es el ticket promedio de una recarga? (tope S/2000/operacion; y la comision
   fija mata los micro-pagos de 1 USD).
5. Aceptas cobrar en soles (PEN)? Hoy los creditos estan en USD.
6. Aceptas pagar ~3-4.5% + IGV a cambio de deteccion automatica real y exactly-once?
7. Aceptas que el cliente pague dentro de un checkout/QR de pasarela (cambio de UX
   respecto a Binance, que era yapeo/transferencia libre)?
8. El rubro (desbloqueo/FRP) puede ser observado por la politica de riesgo de algunas
   pasarelas: hay que confirmarlo en el onboarding. Preferencia: Culqi (Credicorp/BCP)
   o Mercado Pago (abono instantaneo)?
9. Tienes cuenta bancaria (idealmente BCP) a nombre del negocio para la liquidacion?
10. Emites o puedes emitir comprobantes (boleta/factura electronica)? Obligatorio SUNAT.

## Proximos pasos (cuando se decida)
1. Confirmar las 10 preguntas de arriba antes de escribir codigo.
2. Decidir proveedor: por defecto Culqi (o Mercado Pago). Leer su doc de Yape y
   confirmar que aceptan el rubro.
3. Iniciar onboarding/KYC con la pasarela (RUC, cuenta bancaria, contrato) - tarda dias.
4. Migracion pago: agregar valor yape al enum metodo_cobro + soporte PEN; sembrar los
   secretos de la pasarela en el Vault por migracion.
5. Edge pago_cobro_crear_yape (crear Orden/QR con order_number = cobro_codigo + monto).
6. Edge publica pago_webhook_yape (clon de recarga_webhook: HMAC + re-consulta + validar
   monto/moneda/merchant + ingerir en pago_visto + acreditar exactly-once).
7. Cron pago_reconciliar_yape (red de seguridad para webhooks perdidos).
8. Frontend RecargaYape.tsx + agregar el origen de la pasarela al CSP en server.js.
9. Definir mapeo USD->PEN o paquetes de creditos en PEN.
10. Prueba de punta a punta con un pago real chico, y limpiar los datos de prueba.
11. Mantener Binance/MixPay activo: Yape se suma como metodo, no reemplaza.

---
[Anterior](04-arquitectura-propuesta.md) - [Indice](00-indice.md)
