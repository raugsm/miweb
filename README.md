# AriadGSM Ops MVP

MVP interno para login, registro, roles, tickets y auditoria.

## Flujo actual

- Registro/login con roles y canal asignado.
- Creacion rapida de clientes desde texto libre, por ejemplo `Amilkar Arrieta Colombia`.
- Tickets con codigo `V-YYYYMMDD-001`.
- Tablero de seguimiento por arrastre: Nuevo, En cola, En proceso y Finalizado.
- Finalizar un ticket exige guardar el log final.

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
```

En Render, adjuntar un disco persistente en `/opt/render/project/src/storage`.

No subir `data/users.json` a nube. Ese archivo contiene la base local de trabajo.
