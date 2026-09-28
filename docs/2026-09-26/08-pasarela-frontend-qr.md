# 08 - Pasarela: frontend y QR

## La pantalla de recarga
Componente: src/components/RecargaBinance.tsx (un modal). Helpers en
src/lib/cuenta.ts: pagoCobroCrear(jwt, creditos) y pagoCobroEstado(jwt, cobro_id).

## Flujo en la pantalla
1. El tecnico elige cuantos creditos (paquetes 1/5/10/20/50 o a mano).
2. Toca "Generar pago" -> llama a pago_cobro_crear.
3. Se muestra:
   - Monto exacto (ej. 1.00 USDT) con boton de copiar.
   - Codigo ARI-XXXX-XXXX con boton de copiar (OBLIGATORIO en la nota).
   - QR de Binance Pay (se arma en el navegador con la libreria qrcode a partir del
     pago_url).
   - Pasos claros + a quien se paga (destino).
   - Cuenta regresiva hasta que vence el cobro.
4. El modal consulta el estado cada 5 segundos (sin boton de "ya pague"). Cuando el
   vigia confirma, muestra "Pago confirmado" y refresca el saldo.

## El QR (por que al principio no salia)
El QR sale del parametro binance_pay_url (el link "Recibir" de Binance Pay de la
cuenta de Ariad). Al principio no estaba cargado ese parametro, entonces no habia
QR. Se cargo en negocio.parametro:
- binance_pay_url = el link uni-qr de la cuenta (hoy la de prueba raugsm).
- binance_pay_id = el nombre a quien se paga.

Cuando se pase a la cuenta REAL de Binance, se cambia ese link (y las llaves del
Vault) y listo, sin re-desplegar nada.

## Donde se usa
El boton "Recargar con Binance Pay" esta en el panel del tecnico
(src/pages/DashboardPage.tsx). Cualquier tecnico logueado puede recargar.

---
[Anterior](07-pasarela-edge-functions.md) - [Indice](00-indice.md) - [Siguiente: Seguridad y deploy](09-seguridad-deploy-pendientes.md)
