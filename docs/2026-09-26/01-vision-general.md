# 01 - Vision general

## Que es cada cosa

- Ari-Tool: el programa de escritorio (Windows) que usan los tecnicos para remover
  el Security Plugin (MDM) y el AntiCrack en equipos Tecno, Infinix e itel con
  MediaTek. Se paga por uso con creditos.
- La web (ariadgsm.com): la pagina publica de Ari-Tool + el panel del tecnico
  (donde ve su saldo, recarga creditos y su historial).
- Pasarela de pago: el sistema que permite que un tecnico recargue creditos pagando
  con Binance Pay, y que los creditos se acrediten solos, sin apretar "ya pague".

## Que construimos (resumen)

1. Pasarela de pago con Binance Pay (el corazon). Un tecnico logueado pide recargar,
   le damos un monto exacto y un codigo unico, paga desde su Binance, y un vigia en
   el servidor lee la cuenta de Binance de Ariad y le acredita los creditos solo.
   Con seguridad fuerte: cobra una sola vez, es imposible falsear un pago, y queda
   una bitacora inviolable.

2. La web nueva. La pagina estaba casi vacia. Agregamos: precios, dispositivos
   soportados, caracteristicas por categoria, preguntas frecuentes (FAQ) y una
   pagina de descarga con changelog.

3. El panel del tecnico. Lo redisenamos moderno, con animaciones, y le agregamos un
   tutorial guiado que aparece una sola vez para explicarle que es cada cosa.

## El porque de las decisiones grandes

- Por que leer Binance en vez de un boton "ya pague": porque un boton se puede
  falsear. Leyendo la cuenta real de Binance solo se acredita lo que realmente llego.
- Por que monto exacto + codigo: el codigo unico en la nota dice a quien acreditar,
  y el monto exacto evita confusiones y fraudes.
- Por que en Supabase Ariad_SecurityPlugin: ahi ya viven las cuentas de los tecnicos
  y su sistema de creditos. Se integro sin romper nada de lo existente.

---
[Indice](00-indice.md) - [Siguiente: Web Ari-Tool](02-web-ari-tool.md)
