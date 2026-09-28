# 04 - Pasarela Binance Pay: como funciona

## La idea en una frase
El tecnico paga desde su Binance a la cuenta de Ariad con un monto exacto y un
codigo unico en la nota; un vigia en el servidor lee la cuenta de Binance de Ariad,
encuentra ese pago y acredita los creditos solos.

## El flujo, paso a paso
1. El tecnico entra a su panel y toca "Recargar con Binance Pay".
2. El servidor crea un cobro y le devuelve: el monto exacto (ej. 1.00 USDT), un
   codigo ARI-XXXX-XXXX (obligatorio en la nota) y un QR.
3. El tecnico paga desde su app de Binance: monto exacto + pega el codigo en la nota.
4. Un vigia (proceso de fondo, cada minuto) consulta la cuenta de Binance de Ariad
   con una clave de SOLO LECTURA.
5. El vigia ve el pago, lo empareja por codigo (en la nota) + monto exacto, y
   acredita los creditos al tecnico. Una sola vez.
6. El panel del tecnico lo detecta y muestra "Pago confirmado". Sin boton de "ya
   pague".

## Por que es seguro (las defensas)
- Nadie reporta pagos, se LEEN. El sistema no confia en el navegador; lee la cuenta
  real de Binance. Un pago inventado no existe en Binance, no se acredita.
- Codigo unico + monto exacto. Sin el codigo correcto no se sabe a quien acreditar;
  si el monto no coincide, va a revision (no se acredita solo).
- Cobra una sola vez (exactly-once). Aunque el vigia vea el mismo pago varias veces,
  o dos personas paguen al mismo tiempo, cada pago acredita una vez y cada cobro se
  paga una vez (candados unicos en la base).
- Clave de Binance de SOLO LECTURA. Si se filtrara, no puede mover ni retirar plata.
- Anti-cosecha. Un cobro creado DESPUES de que ya se vio un pago no puede reclamar
  ese pago viejo.
- Montos altos a revision manual. Por encima de un umbral no auto-acredita.
- Bitacora inviolable. Cada paso queda en un registro encadenado por firma (hash)
  que no se puede editar ni borrar.

## Donde vive cada parte
- Base de datos + funciones + vigia: Supabase Ariad_SecurityPlugin.
- Pantalla de recarga: la web (src/components/RecargaBinance.tsx).
- Secretos (llaves Binance): en el Vault de Supabase.

---
[Anterior](03-panel-y-tutorial.md) - [Indice](00-indice.md) - [Siguiente: Base de datos](05-pasarela-base-de-datos.md)
