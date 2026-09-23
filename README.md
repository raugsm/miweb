# Ariad Web

Web unica de **Ariad**: AriadDesbloqueador (landing + area de cliente) y AriadGSM
(portal FRP + panel operador) en una sola SPA **React 19 + TypeScript + Vite + Tailwind v4 + shadcn**,
servida por la API Node de AriadGSM (sin cambios en sus endpoints).

## Comandos

```bash
pnpm install     # instala dependencias (web + api)
pnpm dev         # Vite (5173, proxy /api -> 4173) + API Node (4173) juntos
pnpm dev:web     # solo el frontend
pnpm dev:api     # solo la API
pnpm build       # tsc + vite build -> dist/
pnpm start       # node server.js sirviendo dist/ (produccion)
pnpm test        # 126 tests de contrato/smoke de la API (intactos de miweb)
```

## Estructura

| Carpeta | Contenido |
|---|---|
| `src/` | SPA React-TS (paginas, componentes, stores, lib, data) |
| `public/` | Assets (fonts, logos, imagenes) + HTML legacy de AriadGSM |
| `server.js` + `server/` | API Node AriadGSM intacta (auth, tickets, FRP, portal, pricing, daily close, SSE) |
| `test/` | 19 archivos de test de contrato/smoke |
| `migrations/` | SQL Postgres |
| `scripts/` | Utilidades postgres/migracion |
| `docs/` | Especificaciones y decisiones de ambos proyectos |
| `dist/` | Build de produccion (no versionar) |

## Routing (servido por server.js)

| Ruta | Sirve | Estado |
|---|---|---|
| `/`, `/guia`, `/soporte`, `/cuenta`, `/panel`, `/gsm` | SPA React (dist/) | migrado |
| `/gsm-legacy` | landing.html historica de AriadGSM (campaign tracking) | compat/tests |
| `/cliente`, `/pedido/:code`, `/portal` | portal.html legacy | legacy (migrar Fase 2) |
| `/admin` | index.html legacy (operador) | legacy (migrar Fase 3) |
| `/v/:orderCode`, `/manual`, `/servicios/*`, `/owner-recovery`, `/descargar` | paginas legacy | legacy |
| `/api/*` | API Node | sin cambios |

## Datos

- **Supabase AriadDesbloqueador** (`sdarsjdwnuimjruthjwz`): consumido directo desde React (`src/lib/supabase/`).
- **API AriadGSM** (`/api/*`): cookies de sesion propias; JSON (`data/`) o Postgres segun `ARIAD_STORAGE_DRIVER`.
- **Supabase AriadGSM Cliente** (`duvpkpfivcnftxelgqtt`): version del instalador y precios publicos (solo backend).

### .env local (Supabase)

`server.js` carga `.env` si existe y sus valores ganan sobre las variables globales
de la maquina (clave publica anon, no es secreta). Si no hay `.env`, usa
`SUPABASE_URL` / `SUPABASE_ANON_KEY` del entorno (Render).

```
SUPABASE_URL=https://duvpkpfivcnftxelgqtt.supabase.co
SUPABASE_ANON_KEY=<clave anon del proyecto duvpkpfivcnftxelgqtt>
```

Los tests ignoran el `.env` (preloader `scripts/disable-env-file.mjs`) para
mantener sus mocks aislados.

## Produccion

`render.yaml` es la fuente de verdad: `pnpm install && pnpm build` + `pnpm start`.
CSP en `server.js` ya permite `connect-src` a los dos proyectos Supabase.
