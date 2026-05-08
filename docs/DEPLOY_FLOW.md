# Deploy Flow

Este documento mantiene produccion separada del desarrollo local. No se debe
hacer deploy a Render hasta que el cambio este probado localmente y Bryams lo
apruebe.

## Desactivar Auto-Deploy en Render

Bryams lo hace manualmente desde Render Dashboard:

1. Abre Render Dashboard.
2. Entra al servicio `ariadgsm-ops`.
3. Ve a `Settings`.
4. Busca `Auto-Deploy`.
5. Cambia a `No` o `Off`.
6. Guarda.
7. Confirma en `Events` que el servicio no dispara deploy automaticamente por
   cada push.

No usar Render API para este paso.

## Antes de Manual Deploy

1. Verifica que el cambio esta en `raugsm/miweb`.
2. Confirma que produccion puede esperar. Si la web vigente atiende clientes,
   no desplegar durante trafico sensible.
3. En local, ejecuta:

   ```powershell
   npm.cmd run frontend:check
   npm.cmd test
   npm.cmd run frontend:build
   ```

4. Si el cambio requiere DB, corre la migracion primero en una base de prueba.
5. Para produccion, aplica migraciones desde Render Shell o el mecanismo
   aprobado para esa ventana. No copies `DATABASE_URL` a chats ni logs.
6. Revisa que `.env.example` no tenga secretos reales y que `.env.local` no
   este trackeado:

   ```powershell
   git status --short
   git check-ignore .env .env.local
   ```

## Manual Deploy en Render

1. Abre Render Dashboard.
2. Entra a `ariadgsm-ops`.
3. Ve a `Manual Deploy`.
4. Elige el commit exacto aprobado.
5. Lanza deploy.
6. Observa `Logs` hasta ver build y start completos.

## Verificacion despues del deploy

1. Health:

   ```powershell
   Invoke-RestMethod https://ops.ariadgsm.com/api/health
   ```

   Debe reportar el `releaseCommit` esperado.

2. Headers de seguridad:

   ```powershell
   curl.exe -I https://ariadgsm.com
   ```

   Verifica `strict-transport-security`, CSP, `x-content-type-options`,
   `referrer-policy` y ausencia de `unsafe-inline` en CSP.

3. Xiaomi FRP:

   ```powershell
   Invoke-WebRequest https://ariadgsm.com/api/xiaomi-frp/bootstrap -UseBasicParsing
   Invoke-WebRequest https://ariadgsm.com/xiaomi-frp -UseBasicParsing
   ```

4. Audit hardening:

   - No probar con claves en terminal.
   - Usar solo helpers que firman en memoria si hace falta validar
     `/api/operativa-v2/cloud/audit`.

## Rollback

Si produccion falla despues de desplegar:

1. En Render Dashboard, abre `ariadgsm-ops`.
2. Ve a `Deploys`.
3. Selecciona el ultimo deploy estable conocido.
4. Usa `Rollback` o `Manual Deploy` de ese commit.
5. Verifica de nuevo `/api/health`, headers y rutas criticas.
6. Si el fallo fue por DB, no borres datos. Documenta el error y decide una
   migracion correctiva o rollback de app que tolere el schema actual.

El commit live estable observado antes de pausar Etapa B era `0a1a0cde2d2e`.
No asumir que seguira siendo el ultimo estable; verificar en Render antes de
cada rollback.

## Diagnostico de Render auto-deploy

Si GitHub `main` avanza pero Render no refleja el nuevo commit:

### Auto-Deploy apagado

- Render Dashboard -> `ariadgsm-ops` -> `Settings` -> `Auto-Deploy`.
- Si esta en `No`, no hay bug: Render espera Manual Deploy.

### Rama incorrecta

- Render Dashboard -> `ariadgsm-ops` -> `Settings` -> `Branch`.
- Debe apuntar a la rama que Bryams quiere desplegar, normalmente `main`.

### Repo incorrecto

- Render Dashboard -> `ariadgsm-ops` -> `Settings` -> repositorio conectado.
- Debe ser `raugsm/miweb`, no `raugsm/miweb-2.0`.

### Build fallando

- Render Dashboard -> `ariadgsm-ops` -> `Events` y `Logs`.
- Buscar errores en `npm install`, `npm run frontend:build` o arranque
  `npm start`.
- Si falla build, no asumir deploy parcial; Render suele mantener el ultimo
  deploy bueno.

### `render.yaml` no aplicado

- Verificar si Render usa configuracion manual o Blueprint.
- Comparar build command esperado:

  ```text
  npm install && npm run frontend:build
  ```

  y start command:

  ```text
  npm start
  ```

### Variables faltantes

- Render Dashboard -> `Environment`.
- Verificar presencia de `DATABASE_URL`, `ARIAD_STORAGE_DRIVER`,
  `OPERATIVA_AGENT_KEY` y variables SMTP si el flujo las requiere.
- No imprimir valores. Solo confirmar presencia.
