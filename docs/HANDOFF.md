# HANDOFF — Ariad Web (unificacion miweb + 03_pagina_web)

> Documento de traspaso completo. Escrito el 22-sep-2026 para que cualquier agente
> nuevo pueda retomar sin re-investigar. Complementa a `CLAUDE.md` (guia de trabajo
> diario); este archivo cuenta EL POR QUE y EL ESTADO de la migracion.

---

## 1. Contexto: de donde venimos

Existian **dos proyectos separados** con la misma marca "Ariad":

### 1.1 `miweb` (C:\private_opencode\miweb) — AriadGSM
- Backend Node monoproceso SIN framework (raw `node:http`), `server.js` ~6.100 lineas
  + modulos `server/` (config, core, db, frp, portal, payments, operator, comprobante).
- Persistencia: JSON (`data/users.json`) con capa Postgres hibrida en fase
  "write-ready" (43 tablas, esquema `ariad`, driver `ARIAD_STORAGE_DRIVER`).
- Tres frontends vanilla servidos desde `public/`:
  - **Operador** (`index.html` + `app.js` 4.400 lineas + `styles.css` 3.100 lineas):
    auth con PIN/dispositivos, tickets kanban drag&drop, FRP Ops v2, clientes/VIP,
    master clients, pricing, cierre diario, usuarios, auditoria. Light theme azul
    `#2177f2` + glassmorphism, Plus Jakarta Sans.
  - **Portal clientes** (`portal.html` + `portal.js` + 23 modulos + 16 hojas CSS):
    flujo FRP Express (4 paneles), guest flow, SSE, comprobantes, PDF con QR.
    Light theme `#2f6df3` + cards oscuras `#2C2C2A` para montos.
  - **Landing publica** (`landing.html`, `manual.html`, `motorola-f4.html`,
    campaign-tracking, precios en vivo desde Supabase).
- 126 tests (`node:test`) que fijan el contrato API: `phase3a.contract`,
  `phase4.smoke`, y 17 archivos de dominio. **Intactos en el repo nuevo.**
- Dominios: `ariadgsm.com` (publico) + `ops.ariadgsm.com` (operador). Deploy Render.
- Supabase AriadGSM Cliente: `duvpkpfivcnftxelgqtt` (versiones del instalador,
  precios publicos, alquiler de herramientas).

### 1.2 `03_pagina_web` (C:\private_opencode\03_pagina_web) — AriadDesbloqueador
- Landing + area de cliente del producto de escritorio (desbloqueo MDM Transsion).
- **Ya en el stack objetivo**: React 19 + Vite 8 + TS + Tailwind v4 + shadcn/ui
  (style "radix-nova") + react-router-dom 7 + lucide + radix-ui.
- Paginas: `/` (Hero con mapa mundi de particulas, BentoGrid, Consola simulada,
  Capas, CTA descarga), `/guia`, `/soporte`, `/cuenta` (login/registro con OTP y
  Google), `/panel` (dashboard de creditos), 404.
- Diseño **dark cobalt** (`#0052d4` sobre `#0b0b0c`), Montserrat Variable + Geist
  Variable autoalojadas. El cliente pidio "no cambiar el diseño".
- Backend: Supabase `sdarsjdwnuimjruthjwz` (auth password+OTP+Google, Edge
  Functions `version_consultar`, `acceso_solicitar`, `acceso_verificado`,
  `acceso_confirmar`, `cuenta_completar`, `cliente_resumen`). Modelo de creditos:
  1 proceso = 5 creditos = $5.

---

## 2. Decisiones acordadas con el usuario

| Tema | Decision |
|---|---|
| Diseño | **Un solo sitio con modo dark Y modo light** (toggle en header, dark por defecto). |
| Portada | La de **AriadDesbloqueador** es la principal (`/`). AriadGSM es un item mas del menu (`/gsm`). |
| Estructura | **Un solo repo, un solo package** (no monorepo): SPA + API conviven. |
| Backend GSM | **Se queda como esta** (server.js intacto como API invisible). Supabase para GSM se evaluara mas adelante, por fases si acaso. |
| Operador | Todo bajo `ariadgsm.com/admin` (adiós subdominio; `ops.ariadgsm.com` hara redirect). |
| Gestor | pnpm (el proyecto arranco con npm en ambos orígenes). |

---

## 3. Que se hizo (cronologia)

### Fase 0 — Bootstrap (repo `C:\private_opencode\Ariad_Web`)
1. Copiado `03_pagina_web` completo (src, public, configs, docs, _fuentes) como base.
2. Copiado `miweb` completo (server.js, server/, test/, migrations/, scripts/,
   public legacy, docs, render.yaml).
3. `package.json` unificado: deps web + deps API (nodemailer, pg, pdfkit,
   libphonenumber-js, qrcode, pdfjs-dist) + `concurrently` para dev. `pnpm@11.20.0`.
4. `vite.config.ts`: proxy `/api` → 4173 y rutas legacy → 4173 (en dev).
5. **Patch minimo a `server.js`** (unico cambio de negocio permitido hasta ahora):
   - `webDistDir`/`webDistAvailable`: si existe `dist/index.html`, sirve la SPA.
   - CSP: `connect-src` + los dos Supabase.
   - `serveStatic`: `/` → SPA si hay build; `/gsm-legacy` → landing historica;
     archivos estaticos prefieren `dist/`; fallback SPA `sendWebIndex()`.
   - Loader de `.env` al inicio (ver gotcha abajo).
6. Test `public-campaign-tracking` apunta a `/gsm-legacy` (antes `/`).
7. README.md + render.yaml actualizados (build con pnpm).

### Fase 1a — Menu unificado + AriadGSM en React
- `AriadGSM` agregado al menu (`headerLinks`/`footerLinks` en `src/data/product.ts`).
- Creada `src/pages/gsm/GsmLandingPage.tsx`: hero, precios en vivo
  (`/api/public/frp-prices`, poll 15s + visibilitychange), pasos, vista previa de
  la app, Motorola F4, banner descarga. Mismo layout que el resto (header/footer
  compartidos).
- `src/data/gsm.ts`: contenidos estaticos de la seccion GSM.
- `/gsm` es ruta React; la landing legacy vive en `/gsm-legacy` (tests +
  compatibilidad). Eliminada la regla de proxy `/gsm` en vite.config.ts.

### Fase 1b — Cableado Supabase (bug de 404s)
- **Causa raiz**: la maquina del dev tiene variables GLOBALES `SUPABASE_URL`/
  `SUPABASE_ANON_KEY` apuntando a OTRO proyecto (`whdbqfzdrclkqvmgazqy`). Las
  tablas reales viven en `duvpkpfivcnftxelgqtt` (verificado via MCP supabase-prod:
  `client_settings`, `country_exchange_rates`, `payment_methods`,
  `tools_available`, RPC `get_latest_client_version` → v0.6.36).
- **Fix**: `.env` local (no versionado) con el proyecto correcto + clave anon.
  Loader propio en `server.js`: si `.env` existe, SUS valores ganan (solo local;
  en Render manda envVars porque el .env no se despliega).
- **Aislamiento de tests**: preloader `scripts/disable-env-file.mjs`
  (`ARIAD_SKIP_ENV_FILE=1`) inyectado en los scripts `test`/`test:smoke` con
  `node --import`. NO quitar.

### Fase 1c — Modo claro/oscuro global
- `src/lib/theme.tsx`: ThemeProvider + `useTheme()`; toggle en `SiteHeader` y
  `MobileMenu`; persistencia `localStorage["ariad-theme"]`; actualiza
  `<meta name="theme-color">`.
- `src/index.css` reestructurado: `:root` = light (fondo `#f7f7f8`, cards blancas,
  cobalt `#0052d4`), `.dark` = el dark original (intacto). Tokens nuevos: `kicker`,
  `field`. `@custom-variant dark` ya existia.
- Reemplazo mecanico en 16 archivos: `text-white*` → `text-foreground*`,
  `border-white/[x]` → `border-line`, `bg-white/[x]` → `bg-foreground/[x]`,
  `bg-[#0E0F12]` → `bg-field`, `text-[#9dc1ff]` → `text-kicker`.
- Ajustes manuales para superficies que debian QUEDARSE oscuras primero y luego
  se tematizaron con `dark:` variants: card de saldo del panel (gradiente azul
  claro en light), banner CTA, banner descarga GSM, consola simulada, bloques de
  codigo, chip SHA, bento grid.
- Lo que queda fijo a proposito: chips/badges semanticos de colores y botones
  cobalt (funcionan en ambos modos).
- `index.html`: `<html class="dark">` (evita flash) + `color-scheme: dark light`.

---

## 4. Estado actual (que funciona hoy)

- `pnpm dev` arranca SPA (5173) + API (4173) con todo proxeado a 5173.
- Portada Desbloqueador completa con toggle dark/light.
- `/gsm` (React) con precios reales en vivo (requiere `.env` con la clave de
  `duvpkpfivcnftxelgqtt`; sin clave degrada a "Cargando/Consultar por WhatsApp").
- Legacy intacto: `/cliente` (portal FRP), `/admin` (operador), `/manual`,
  `/servicios/motorola-f4`, `/v/:code`, `/owner-recovery`, `/descargar`.
- `pnpm test`: 126/126. `pnpm build`: OK.

---

## 5. Mapa de archivos clave (repo nuevo)

```
C:\private_opencode\Ariad_Web\
├── CLAUDE.md                  ← guia para agentes (leer primero)
├── docs/HANDOFF.md            ← este archivo
├── package.json               ← unico package (web + api)
├── .env                       ← local, NO versionado (Supabase GSM)
├── vite.config.ts             ← proxy /api + legacy → 4173
├── index.html                 ← shell SPA, class="dark"
├── server.js                  ← API AriadGSM (patch de SPA/.env/CSP + serveStatic)
├── server/                    ← backend intacto (config, core, db, frp, portal…)
├── test/                      ← 126 tests (contrato + smoke + dominio)
├── migrations/  scripts/      ← Postgres + utilidades (intactos)
├── public/                    ← fonts, logos, imagenes + HTML/JS legacy GSM
├── render.yaml                ← deploy Render (pnpm build)
├── docs/                      ← historial miweb + specs + 03_pagina_web
├── _fuentes/                  ← materiales de diseno originales (no runtime)
└── src/
    ├── main.tsx               ← ThemeProvider + App
    ├── App.tsx                ← rutas (lazy): /, /guia, /soporte, /cuenta, /gsm, /panel, *
    ├── index.css              ← tokens :root (light) + .dark + @theme
    ├── lib/
    │   ├── theme.tsx          ← dark/light (toggle, persistencia)
    │   ├── supabase.ts        ← Supabase desbloqueador (sdarsjd…)
    │   ├── cuenta.ts          ← Edge Functions del cliente
    │   ├── release.tsx        ← version_consultar + WhatsApp soporte
    │   ├── utils.ts           ← re-export del paquete `cn` (twMerge)
    │   └── hooks/
    ├── components/
    │   ├── layout/            ← RootLayout, SiteHeader, SiteFooter, MobileMenu, SiteBackground, ScrollManager
    │   ├── sections/          ← Hero, BentoGridSection, ConsoleSection, LayersSection, CtaBannerSection
    │   ├── ui/                ← shadcn (button, card, badge, dialog, sheet, accordion, separator)
    │   └── (Container, Panel, Kicker, GridPattern, SectionHeading, VersionPill, DownloadButton, HashCopy, Icon)
    ├── data/                  ← product.ts (desbloqueador), gsm.ts, guide.ts, support.ts
    └── pages/
        ├── HomePage, GuidePage, SupportPage, AccountPage, DashboardPage, NotFoundPage
        └── gsm/GsmLandingPage.tsx
```

---

## 6. Pendientes (plan acordado)

1. **Portal FRP a React** (`/cliente`, `/cliente/*`, `/pedido/:code`):
   - Recrear los 4 paneles (metodo de pago, solicitud, datos de pago, conexion),
     dropzone de comprobantes, SSE de ordenes (`/api/portal/orders/events`),
     guest flow, price-decision, recibo PDF. API ya existe y esta probada.
   - Referencias: `public/portal.html` + `public/portal-modules/` + docs/specs/cliente/*.
   - Al migrar, cambiar `requestUsesCustomerPortal` en server.js para que esas
     rutas sirvan la SPA (y actualizar vite proxy + test campaign si aplica).
2. **Panel operador a React** (`/admin/*`): auth con PIN/dispositivos, kanban
   tickets (dnd-kit), FRP Ops v2 (SSE `/api/operator/frp/events`), clientes/VIP,
   master clients, pricing, cierre diario, usuarios, auditoria. Referencia:
   `public/app.js` (4.400 lineas) + docs/specs/operador/*.
3. **Cutover de dominio**: redirect `ops.ariadgsm.com` → `ariadgsm.com/admin`
   (hoy `requestShouldRedirectToCustomerPortal` solo maneja /cliente en ops).
   Revisar `allowedApiHosts` (sigue incluyendo ops).
4. **Campaign tracking en React**: cuando `/gsm-legacy` se retire, portar
   `campaign-tracking.js` a la pagina React (eventos `landing_view`,
   `download_click`, `manual_click`, `whatsapp_click`, UTM) o mantener la landing
   legacy solo para eso.
5. **Extra**: `/v/:orderCode` podria ser pagina React; SEO/sitemap; quitar
   `/gsm-legacy` cuando ya no haga falta.

---

## 7. Entorno del desarrollador

- SO: Windows (PowerShell 5.1 como shell por defecto de las herramientas).
- Node v24.19.0, pnpm 11.20.0.
- Puertos: Vite 5173 (localhost, IPv6 ::1), API 4173.
- La maquina tiene variables de entorno globales de Supabase de OTRO proyecto:
  el `.env` del repo las pisa (ver CLAUDE.md gotcha #1). Si algo de Supabase da
  404 de nuevo, revisar primero `.env` vs variables globales.
- Carpetas fuente originales INTACTAS como referencia:
  `C:\private_opencode\miweb` y `C:\private_opencode\03_pagina_web`.
  No se borraron; el repo nuevo es una copia evolucionada.
- Git: el repo nuevo aun no tiene repo git propio ni commits (si se desea
  versionar, `git init` y commit inicial; `data/`, `dist/` y `.env` ya estan
  en .gitignore).
