# Sesion 17 - Redondeo de montos finales

Estado: implementado local, pendiente de validacion final/deploy.

## Objetivo

Evitar montos finales poco claros como `S/ 16.43` en el flujo cliente.

## Regla aprobada

La regla aplica solo a montos finales visibles/cobrables.

- Monedas decimales (`PEN`, `MXN`, `USDT` y equivalentes con `amountMode: decimal`): redondear al salto de `0.10`.
- Monedas enteras (`COP`, `CLP` con `amountMode: thousands`): redondear al salto de `100`.
- El caso exacto `0.05` sube al siguiente `0.10` para evitar ambiguedad.

## No aplica a

- Tasa de cambio.
- Costo interno del proveedor.
- Ganancia objetivo.
- Descuentos por volumen.
- `unitPrice` interno en USDT.
- Validaciones de pricing del panel operador.

## Puntos tocados

- `server.js`: `formatPortalPaymentAmountFromUsdt()` redondea solo el monto final antes de guardar `priceFormatted` en ordenes nuevas del portal.
- `public/portal-modules/payments.js`: `paymentAmountText()` redondea solo el texto visible en Paso 1, Paso 2 y Paso 3.
- `test/phase3a.contract.test.js`: cubre la regla decimal `0.10` y la regla entera `100`.
- `test/phase4.smoke.test.js`: la orden portal ahora espera `S/ 273.90` en vez de `S/ 273.94`.

## Impacto esperado

- Ordenes nuevas: Mis ordenes y recibo PDF nuevo muestran el monto redondeado porque usan `priceFormatted`.
- Ordenes viejas: conservan el `priceFormatted` que ya estaba guardado.
- El texto aproximado en USDT sigue mostrando el valor interno, porque no es el monto local final a cobrar.

## Validacion local

- `node --check server.js`: paso.
- `node --check public/portal-modules/payments.js`: paso.
- `node --check test/phase3a.contract.test.js`: paso.
- `node --check test/phase4.smoke.test.js`: paso.
- `node --test test/phase3a.contract.test.js`: paso, 11 pruebas.
- `node --test test/phase4.smoke.test.js`: paso, 1 prueba.
- `npm.cmd test`: paso completo, 14 pruebas, 0 fallos.
