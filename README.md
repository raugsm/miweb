# AriadGSM Ops MVP

MVP interno para login, registro, roles, tickets y auditoria.

## Flujo actual

- Registro/login con roles y canal asignado.
- Creacion rapida de clientes desde texto libre, por ejemplo `Amilkar Arrieta Colombia`.
- Tickets con codigo `V-YYYYMMDD-001`.
- Tablero de seguimiento por arrastre: Nuevo, En cola, En proceso y Finalizado.
- Finalizar un ticket exige guardar el log final.
- Recuperacion de contrasena por enlace temporal enviado desde `soporte@ariadgsm.com`.

## Xiaomi Reset + FRP SPA backend

La API nueva vive bajo `/api/xiaomi-frp/*` y usa los modelos existentes:
`customer_orders`, `customer_order_items`, `frp_orders`, `frp_jobs`,
`payment_proofs`, `operator_users/sessions`, `audit_events` y
`service_pricing_rules`.

Los pedidos publicos usan codigo secuencial `AG-NNNN` y token privado de 10
caracteres:

```text
https://ariadgsm.com/pedido/AG-0247?t=<token>
```

Sin token valido el backend responde `404`, no `401`, para no revelar si el
pedido existe. El operador ve solo `AG-0247`.

Rollover: `AG-0001` a `AG-9999` cubre aproximadamente 3 meses a 100 pedidos/dia.
Cuando el contador pase de 9999 el backend emite `AG-10000` y conserva
compatibilidad con 4-5 digitos. Antes de llegar a `AG-9000`, ampliar el formato
visual del frontend y cualquier plantilla manual a 5 digitos.

Precio inicial: `4.00 USDT` por proceso, configurable por operador desde
`PATCH /api/xiaomi-frp/operator/price`. El fee fijo por compra es `0.30 USDT`.
Las tasas locales se leen de la configuracion existente de exchange rates y se
congelan en el pedido durante 10 minutos.

## Xiaomi Reset + FRP SPA cliente

El frontend publico vive en `frontend/xiaomi-frp` y se compila con Vue 3 + Vite:

```bash
npm run frontend:build
```

Render ejecuta ese build antes de `npm start` y deja los assets en
`public/xiaomi-frp-spa`. El dominio publico `ariadgsm.com/` y las URLs
`/pedido/AG-NNNN?t=<token>` sirven esta SPA sin recargar la pagina; las APIs
siguen en `/api/xiaomi-frp/*`.

Regla de mantenimiento: ningun componente `.vue` debe pasar de 300 lineas.
`npm test` ejecuta `scripts/check-vue-component-lines.mjs` antes de la suite.

## Local

```bash
npm start
```

La app usa `PORT` si existe. En local abre `http://127.0.0.1:4173`.

## Produccion

Variables recomendadas:

```bash
NODE_ENV=production
ARIAD_DATA_DIR=/opt/render/project/src/storage
ARIAD_SETUP_TOKEN=<codigo privado para crear el primer admin>
ARIAD_ENABLE_SETUP_RESET=false
ARIAD_OWNER_RECOVERY_EMAIL=<correo del propietario, solo durante recuperacion>
ARIAD_PUBLIC_URL=https://ops.ariadgsm.com
ARIAD_MAIL_FROM="AriadGSM Soporte" <soporte@ariadgsm.com>
ARIAD_SMTP_HOST=<servidor smtp>
ARIAD_SMTP_PORT=587
ARIAD_SMTP_SECURE=false
ARIAD_SMTP_USER=<usuario smtp>
ARIAD_SMTP_PASS=<password o api key smtp>
ARIAD_CUSTOMER_MODULE_URL=<URL publica del Customer Module .exe; ej. una GitHub Release>
```

`ARIAD_CUSTOMER_MODULE_URL` alimenta el boton "Descargar Customer Module" del paso 4 del portal cliente. Si la variable esta vacia, el portal muestra "Pidelo por WhatsApp 3" en lugar del boton. El binario no se versiona en este repo: subelo como adjunto a un GitHub Release y pega esa URL en Render.

`ARIAD_TECHNICIAN_SWAP_MS` (opcional, default 10000) controla la duracion en milisegundos de la ventana de bloqueo cuando se cambia de tecnico activo. Solo bajalo a valores menores (>= 100) en entornos de test.

En Render, adjuntar un disco persistente en `/opt/render/project/src/storage`.

El reset por correo no funciona hasta configurar las variables `ARIAD_SMTP_*`.

El reset por codigo de instalacion queda deshabilitado por defecto. Solo debe activarse temporalmente con `ARIAD_ENABLE_SETUP_RESET=true` para una recuperacion extrema de administrador. Si el correo propietario no figura como administrador activo, configura temporalmente `ARIAD_OWNER_RECOVERY_EMAIL`.

No subir `data/users.json` a nube. Ese archivo contiene la base local de trabajo.
