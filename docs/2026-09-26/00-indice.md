# Bitacora de construccion - 2026-09-26

Documentacion paso a paso de lo que se construyo en la web Ari-Tool (AriadGSM) y en
la pasarela de pago con Binance Pay. Cada tema en su propia pagina.

## Indice

- 01 - [Vision general](01-vision-general.md) - Que se hizo y el mapa de todo
- 02 - [Web Ari-Tool](02-web-ari-tool.md) - Secciones: precios, dispositivos, caracteristicas, FAQ, changelog
- 03 - [Panel del tecnico + tutorial](03-panel-y-tutorial.md) - Rediseno del panel y el tour
- 04 - [Pasarela: como funciona](04-pasarela-como-funciona.md) - El flujo y por que es seguro
- 05 - [Pasarela: base de datos](05-pasarela-base-de-datos.md) - Motor 6FN, cobrar una sola vez, auditoria
- 06 - [Pasarela: Vault, vigia y cron](06-pasarela-vault-vigia-cron.md) - Secretos, el vigia y el error 451
- 07 - [Pasarela: Edge Functions](07-pasarela-edge-functions.md) - Las 3 funciones del servidor
- 08 - [Pasarela: frontend y QR](08-pasarela-frontend-qr.md) - La pantalla de recarga y el QR
- 09 - [Seguridad, deploy y pendientes](09-seguridad-deploy-pendientes.md) - Revision, publicacion y que falta

## Datos clave

- Repo: github.com/raugsm/miweb (rama main). Produccion: Render (ariadgsm.com).
- Backend/base de datos: Supabase proyecto Ariad_SecurityPlugin (ref sdarsjdwnuimjruthjwz).
- Precio: 1 credito = 1 USD = 1 proceso. Licencia futura: 25 USD.
- Binance Pay: hoy con la cuenta de prueba (raugsm). Falta pasar a la cuenta real.

Nota: los secretos (llaves de Binance, service_role) NO estan en el codigo; viven en
el Vault de Supabase y en las variables de entorno de Render.
