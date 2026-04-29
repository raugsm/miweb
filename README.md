# AriadGSM Ops MVP

MVP interno para login, registro, roles, tickets y auditoria.

## Flujo actual

- Registro/login con roles y canal asignado.
- Creacion rapida de clientes desde texto libre, por ejemplo `Amilkar Arrieta Colombia`.
- Tickets con codigo `V-YYYYMMDD-001`.
- Tablero de seguimiento por arrastre: Nuevo, En cola, En proceso y Finalizado.
- Finalizar un ticket exige guardar el log final.
- Recuperacion de contrasena por enlace temporal enviado desde `soporte@ariadgsm.com`.

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
```

En Render, adjuntar un disco persistente en `/opt/render/project/src/storage`.

El reset por correo no funciona hasta configurar las variables `ARIAD_SMTP_*`.

El reset por codigo de instalacion queda deshabilitado por defecto. Solo debe activarse temporalmente con `ARIAD_ENABLE_SETUP_RESET=true` para una recuperacion extrema de administrador. Si el correo propietario no figura como administrador activo, configura temporalmente `ARIAD_OWNER_RECOVERY_EMAIL`.

No subir `data/users.json` a nube. Ese archivo contiene la base local de trabajo.
