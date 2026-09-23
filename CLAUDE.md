# CLAUDE.md — Ariad Web

Guía para agentes que trabajan en este repo. Proyecto: web unica de Ariad que unifica
**AriadDesbloqueador** (landing + area de cliente) y **AriadGSM** (portal FRP + panel
operador) en una sola SPA React + una API Node. Localizado en `C:\private_opencode\Ariad_Web`.

## Comandos

- `pnpm dev` — Vite (5173) + API Node (4173) juntos. Vite proxea `/api` y rutas legacy a 4173.
- `pnpm dev:web` / `pnpm dev:api` — por separado.
- `pnpm build` — `tsc -b && vite build` → `dist/` (lo sirve server.js en produccion).
- `pnpm start` — `node server.js` sirviendo `dist/` + API (produccion local).
- `pnpm test` — 126 tests de la API (node:test). Incluye el preloader
  `scripts/disable-env-file.mjs` que aísla los tests del `.env` local.
- `pnpm test:smoke` — solo `test/phase4.smoke.test.js`.
- `pnpm postgres:*` — utilidades de migracion/importacion a Postgres (heredadas de miweb).

Node >= 20 (dev en v24), pnpm 11. `packageManager: pnpm@11.20.0` en package.json.

## Arquitectura

Monolito de dos caras en un solo repo:

- **Frontend**: `src/` — SPA React 19 + Vite 8 + TS + Tailwind v4 + shadcn/ui
  (style "radix-nova") + react-router-dom 7. Páginas: portada Desbloqueador,
  `/guia`, `/soporte`, `/cuenta`, `/panel`, `/gsm` (React), 404. El resto de rutas
  son legacy servidas por la API (ver tabla de routing abajo).
- **Backend**: `server.js` (~6.1k lineas) + `server/` — API Node AriadGSM SIN CAMBIOS
  de negocio: auth operador/cliente, tickets, FRP orders/jobs, pricing, daily close,
  audit, SSE, PDFs. Persistencia JSON (`data/`) o Postgres (`ARIAD_STORAGE_DRIVER`).
- **Supabase x2**: desbloqueador `sdarsjdwnuimjruthjwz` (consumido directo desde
  `src/lib/supabase/`) y AriadGSM Cliente `duvpkpfivcnftxelgqtt` (solo backend).

### Routing (serveStatic en server.js)

| Ruta | Sirve | Estado |
|---|---|---|
| `/`, `/guia`, `/soporte`, `/cuenta`, `/panel`, `/gsm` | SPA (dist/) | migrado |
| `/gsm-legacy` | landing.html historica GSM (campaign tracking) | compat/tests |
| `/cliente`, `/pedido/:code`, `/portal` | portal.html legacy | pendiente migrar |
| `/admin` | index.html legacy operador | pendiente migrar |
| `/v/:orderCode`, `/manual`, `/servicios/*`, `/owner-recovery`, `/descargar`, `/instrucciones` | legacy | parcialmente quedara |
| `/api/*` | API Node | estable |

`webDistAvailable` = existe `dist/index.html`. Si no hay build, sirve todo legacy desde `public/`.

## Sistema de diseño / temas (IMPORTANTE)

- **Dos modos**: dark (default, clase `.dark` en `<html>`) y light. Toggle en
  `SiteHeader`/`MobileMenu` via `useTheme()` (`src/lib/theme.tsx`, persistencia
  `localStorage["ariad-theme"]`). El `<html>` del index.html nace con `class="dark"`
  para evitar flash.
- **Tokens** en `src/index.css`: `:root` = light, `.dark` = dark. Mapeados en
  `@theme inline` para Tailwind v4. Tokens semanticos: `background`, `foreground`,
  `card`, `border`, `line`, `cobalt`, `cyan`, `kicker`, `field`, `muted-foreground`, etc.
- **Reglas al tocar estilos**:
  1. NO usar colores crudos de tema: usar `text-foreground`, `bg-card`, `border-line`,
     `bg-field`, `text-kicker`, `text-cyan` (todo se adapta solo).
  2. `text-white` o `bg-[#...]` SOLO en superficies siempre-oscura o botones cobalt
     (`bg-cobalt text-white` es correcto en ambos modos).
  3. Si un elemento necesita verse distinto por modo: variantes `dark:` (light es la
     base). Ej: `bg-card dark:bg-[#0c0e14]`.
  4. Chips/badges semanticos de colores (alertas, estados) pueden quedar fijos: se
     ven bien en ambos fondos.
- Tipografias autoalojadas: Montserrat Variable (`font-display`, uppercase con
  tracking amplio) + Geist Variable (`font-sans`). Ambas en `public/fonts/`.
- El paquete `cn` (dependencia) hace clsx + tailwind-merge: los overrides por
  `className` posterior ganan (usado para `Panel` con bg custom).

## Gotchas de este repo (aprendidas en el camino)

1. **`.env` local gana sobre las variables globales de la maquina**: `server.js`
   tiene un loader propio al inicio. Windows de este dev tiene `SUPABASE_URL`
   global apuntando a OTRO proyecto (`whdbqfzdrclkqvmgazqy`) — sin el `.env` todo
   da 404. Los tests usan `ARIAD_SKIP_ENV_FILE=1` (via preloader) para ignorarlo.
   NO quitar ese mecanismo.
2. **CSP** en `server.js` (`baseCsp`): `connect-src 'self'` + los dos Supabase.
   Si la SPA necesita otro origen (storage, realtime) hay que agregarlo ahi.
3. **server.js es un monstruo (6.1k lineas)** con logica de negocio probada:
   cualquier cambio de endpoints rompe frontends y tests. Los tests de contrato
   (`phase3a`, `phase4`) son la red de seguridad. No refactorizar sin correr
   `pnpm test` completo.
4. **Tests leen archivos de `public/`** (landing.html, portal.html): no borrar los
   HTML legacy aunque no se sirvan en rutas principales.
5. **Puertos**: API 4173, Vite 5173. En dev las rutas legacy van proxeadas a 4173
   (ver `vite.config.ts`). Si un proceso zombie ocupa 4173, el API muere con
   EADDRINUSE y `concurrently -k` tumba todo: matar procesos node antes de reiniciar.
6. **Vite 8 escucha en `localhost` (IPv6 ::1)**: para probar con scripts usar
   `http://localhost:5173`, no `127.0.0.1`.
7. **PowerShell 5.1**: si se hacen reemplazos masivos con Get/Set-Content usar
   `-Encoding UTF8` y no alarmarse por el BOM que agrega (Vite/tsc lo toleran).
   `$home` es variable reservada.
8. **Tipografia/fechas**: convencion de strings en espanol sin tildes en el backend
   (heredado); el frontend nuevo SI usa tildes y rioplatense ("Descargá", "Entrá").
   Fechas de negocio en zona Lima (server/core/dates.js) — no tocar.
9. **Dos proyectos Supabase distintos**: no confundir claves. La de
   AriadDesbloqueador vive hardcodeada en `src/lib/supabase.ts` + `src/lib/release.tsx`
   (publica por diseno). La de AriadGSM Cliente va en `.env` / envVars de Render.

## Convenciones de codigo

- React: componentes en `src/components/` (layout/, sections/, ui/ shadcn),
  paginas en `src/pages/` (gsm/ para la seccion AriadGSM), datos estaticos en
  `src/data/`, helpers en `src/lib/`, estado global futuro en `src/stores/`.
- Lazy-load de paginas secundarias en `App.tsx` (patron existente).
- shadcn: agregar componentes con `pnpm dlx shadcn@latest add <x>` respetando
  `components.json` (style radix-nova, lucide, prefix vacio).
- El backend se mantiene intacto salvo necesidad explicita; cuando se toque,
  auditarlo con `audit()` y correr `pnpm test`.

## Estado y pendientes (resumen)

Hecho: bootstrap del repo, SPA Desbloqueador migrada 1:1, menu unificado con
"AriadGSM", `/gsm` en React con precios en vivo, cableado Supabase corregido
(`.env` + loader), sistema dark/light completo con toggle.

Pendiente (ver `docs/HANDOFF.md` para detalle):
1. Migrar portal FRP (`/cliente`, `/pedido/:code`) a React.
2. Migrar panel operador (`/admin`) a React.
3. Redirigir `ops.ariadgsm.com` → `/admin` y cutover de dominio.
4. Landing GSM: mover campaign-tracking a la pagina React cuando se retire `/gsm-legacy`.
