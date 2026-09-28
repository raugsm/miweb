# 02 - Hallazgos por dimension

## 1) API oficial de Yape
NO existe una API/webhook oficial para leer pagos entrantes P2P. La FAQ de Yape
confirma que el negocio debe usar pasarelas autorizadas. "Yape Empresa" oficial
solo da panel + exportacion de movimientos (90 dias) + validacion manual con hasta
5 asistentes: sin API ni webhook. La "Yape Business API" que citan blogs de plugins
WooCommerce NO tiene respaldo oficial (tratar como no verificada).
Fuente: yape.com.pe/preguntas-frecuentes ; yape.com.pe/productos/yape-empresa

## 2) Agregadores / pasarelas
El camino oficial. Culqi, Niubiz, Izipay, Mercado Pago, Nuvei, PayU, ProntoPaga
ofrecen "Yape" como metodo: el cliente ingresa su numero Yape + un codigo de
aprobacion (OTP de su app) en TU checkout, tu backend crea el CARGO por el monto
exacto, y la pasarela confirma por WEBHOOK/IPN. Es cobro iniciado por el comercio
(no una transferencia libre). Variantes: "Yape One Shot", "Yape On File" (recurrente).
Culqi y Mercado Pago lo documentan con claridad; Kushki/Openpay/Prometeo/Floid NO
estan confirmados (no elegir sin verificar).
Fuentes: docs.culqi.com (tokens-yape) ; mercadopago.com.pe/developers (yape) ;
developers.izipay.pe (pay-with-yape-code)

## 3) QR interoperable (Yape + Plin, BCRP)
El QR dinamico EMVCo lleva monto (tag 54) + referencia por operacion (tag 62) = 
emparejamiento nativo, y con un solo QR cobras Yape Y Plin. Pero en la practica el
QR dinamico lo emite igual una pasarela/EEDE regulada que te devuelve el webhook.
El estandar es obligatorio del BCRP; nuevo reglamento (Circular 0022-2025-BCRP)
vigente desde 1-abr-2026: conviene apoyarse en pasarela ya regulada, no auto-integrarse.

## 4) DIY: leer notificaciones del celular
Tecnicamente se puede: un telefono Android con un NotificationListenerService lee
el push de la app Yape y lo reenvia a un servidor (el analogo literal del vigia).
Hay repos MIT reusables. PERO: no trae codigo/referencia, obliga a emparejar por
monto-en-centimos (solo 99 combinaciones por sol -> colisiones), depende de un
telefono dedicado siempre prendido (peleando con el matado de servicios de MIUI/
EMUI), hay que recalibrar el regex con cada update de Yape, y una notificacion
local se puede SIMULAR (falseable). No cumple "imposible falsear ni duplicar".

## 5) Emparejamiento (la restriccion dura)
Un yapeo personal NO expone un campo de mensaje al que recibe. Emparejar por codigo
en la nota: imposible en Yape directo. Alternativas: monto unico con centimos (poco
espacio, colisiona), o nombre/telefono del remitente (no fiable). Con pasarela, el
emparejamiento es intrinseco: tu creas el cargo con tu order_number y el webhook lo
devuelve con el monto exacto.

## 6) Legal / riesgos (Peru)
Cobrar un negocio con Yape es legal SIEMPRE que se formalice (RUC + comprobantes +
bancarizacion). Yape separa cuenta Personal vs Empresa. Riesgos: usar cuenta personal
para comercio y leer notificaciones de forma no oficial probablemente viola los ToS
(riesgo de cierre de cuenta). La cuenta personal se auto-bloquea a 5 UIT/mes
(~S/26,750) y pide OTP sobre S/500. SUNAT (2025) fiscaliza ingresos por Yape/Plin a
negocios: sin comprobantes y sobre ~S/45,000/ano hay revision retroactiva hasta 4 anos.

---
[Anterior](01-veredicto.md) - [Indice](00-indice.md) - [Siguiente: Opciones](03-opciones-rankeadas.md)
