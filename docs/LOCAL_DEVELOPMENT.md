# Local Development

Este flujo es para probar Xiaomi FRP localmente antes de cualquier deploy a Render.
La ruta inicial recomendada usa Neon.tech como Postgres de prueba, porque Bryams no
necesita instalar Postgres ni Docker en Windows.

## Requisitos

- Node.js 20.19 o superior.
- Git.
- Cuenta en Neon.tech para una base Postgres de prueba.
- Acceso al repo `raugsm/miweb`.
- PowerShell en Windows. Usa `npm.cmd` si `npm` falla por politica de scripts.

Postgres local y Docker quedan como alternativas opcionales al final de este
documento. El camino principal es Neon.

## Primera configuracion con Neon

1. Clona el repo y entra a la carpeta:

   ```powershell
   git clone https://github.com/raugsm/miweb.git
   cd miweb
   ```

2. Instala dependencias:

   ```powershell
   npm.cmd ci
   ```

3. En Neon.tech crea un proyecto de prueba. Copia el connection string de la
   base de desarrollo. Debe verse como `postgresql://...?...sslmode=require`.

4. Crea tu entorno local:

   ```powershell
   Copy-Item .env.example .env.local
   notepad .env.local
   ```

5. En `.env.local`, cambia solo los placeholders necesarios:

   - `DATABASE_URL`: connection string de Neon de prueba.
   - `ARIAD_STORAGE_DRIVER=postgres`.
   - `ARIAD_SETUP_TOKEN`: token local inventado para setup.
   - `OPERATIVA_AGENT_KEY`: solo una clave local de prueba si vas a probar
     `/api/operativa-v2/cloud/*`. No copies la clave de produccion.

6. Valida el entorno sin imprimir secretos:

   ```powershell
   npm.cmd run local:setup
   npm.cmd run postgres:check:local
   ```

7. Revisa migraciones pendientes:

   ```powershell
   npm.cmd run postgres:migrate:local
   ```

8. Aplica migraciones en la base Neon de prueba:

   ```powershell
   npm.cmd run postgres:migrate:local:apply
   ```

9. Levanta backend y frontend Vite juntos:

   ```powershell
   npm.cmd run dev:full
   ```

10. Abre el navegador:

   - SPA cliente Vite: `http://127.0.0.1:5173/`
   - Backend directo: `http://127.0.0.1:4173/api/health`
   - Bootstrap Xiaomi FRP: `http://127.0.0.1:4173/api/xiaomi-frp/bootstrap`

El frontend Vite hace proxy de `/api`, `/downloads` e `/images` al backend en
`127.0.0.1:4173`.

## Probar el flujo cliente sin pagos reales

1. Usa la SPA en `http://127.0.0.1:5173/`.
2. Selecciona pais, cantidad y metodo de pago.
3. Usa un numero WhatsApp de prueba que no sea de un cliente real.
4. Para comprobante, sube una imagen local de prueba. Puede ser una captura o
   imagen dummy con texto visible como `TEST PAYMENT PROOF`.
5. No uses comprobantes reales, telefonos reales ni datos de clientes.
6. Deja la pestana abierta para verificar que el SSE no corta la sesion.

La validacion humana del pago y acciones del operario pertenecen al panel de
operario. Si ese panel aun no esta listo, prueba los endpoints con tests y no
marques pedidos reales como cobrados.

## Flujo local antes de push

1. Crea una rama corta:

   ```powershell
   git checkout -b nombre-corto-del-cambio
   ```

2. Haz el cambio.
3. Ejecuta checks:

   ```powershell
   npm.cmd run frontend:check
   npm.cmd test
   npm.cmd run frontend:build
   ```

4. Prueba manualmente en `npm.cmd run dev:full`.
5. Revisa diff:

   ```powershell
   git status --short
   git diff --stat
   git diff
   ```

6. Solo despues de validar local, decide si hacer commit y push.

## Alternativas opcionales

### Postgres local nativo

Instala PostgreSQL, crea una base local, pon su URL en `.env.local` y usa los
mismos comandos `postgres:*:local`.

### Postgres en Docker

Si Docker Desktop esta instalado:

```powershell
docker run --name ariadgsm-postgres -e POSTGRES_PASSWORD=localpass -e POSTGRES_DB=ariadgsm_dev -p 5432:5432 -d postgres:16
```

Luego usa:

```text
DATABASE_URL=postgresql://postgres:localpass@127.0.0.1:5432/ariadgsm_dev
DATABASE_SSL=false
```

Neon sigue siendo el camino inicial porque evita instalar servicios locales.
