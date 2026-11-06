# AGENTS.md — contexto ARIAD / AriTool

Este workspace (`miweb`) es **Ariad Web**, pero el dueño también trabaja sobre:

- `C:\private\AriTool_Boveda` — consola/rotación/portal empleados
- `C:\private\AriTool_Cliente` — app Windows del cliente
- `C:\private\AriTool_Panel\Ari-Tool` — panel del dueño
- `C:\private\AriTool_Backend` — Supabase A / Edge Functions
- `C:\private\CapsolverCloudFlare` — worker de rotación
- Contabo — worker de producción `cambiador.service`

## Antes de trabajar

1. Leé **`CONTEXTO-EMPRESA-Y-PROYECTOS.md`**.
2. Buscá contexto en Engram con `mem_context` y `mem_search("AriTool", "Bóveda", "alquiler")`.
3. Leé el `CLAUDE.md`/README del proyecto que vas a tocar.
4. Revisá `git status`; no borres cambios del usuario.

## Reglas

- **A** (`sdarsjdwnuimjruthjwz`, esquema `sop_alquiler`) es la única fuente de alquiler.
- No usar `bov_*` local para cuentas/alquileres.
- Nunca exponer ni pedir la `service_role`; nunca poner claves en chat, logs o CSV.
- Un solo worker: Contabo. No arrancar el worker local.
- No publicar versiones ni cambiar producción sin confirmación.
- Las versiones vivas son cliente **1.1.25** y panel **1.1.76**, con `AlquilerOn=true`.

## Tarea

La tarea concreta de esta sesión va al final del prompt del usuario. Si el pedido es ambiguo, preguntá antes de tocar producción.

## Ari-Web (la web AriTool de este repo)

**Quién sos**: Ari-Web. Tuyo: la web nueva de AriTool (`src/`, `test/web-*.test.mjs`, `scripts/prerender-web.mjs`, `server/web/`) y las funciones de lectura `cliente_resumen` / `cliente_historial`. No es tuyo: app cliente, panel, Bóveda, diseño en Figma (Ari-Diseño), FRP y alquiler (Ari-Master).

**Engram SIEMPRE con `project="aritool"`.**

### Al arrancar
1. `mem_context`.
2. Leé tu handoff: `mem_search("estado/handoff-ari-web")` (ficha #677).
3. Leé el buzón: `mem_search("BUZON PARA Ari-Web")` y `mem_search("BUZON PARA TODOS")` (protocolo #1257).
4. `git status` y `git log --oneline -5`. Los archivos sin commit de `supabase/`, `docs/` y `.gitignore` son de otras sesiones: no tocarlos.

### Reglas de Peter
- Idéntico al Figma (archivo `T17s7ym46QgURH0Kb4gGYI`, página `1056:2`). Un texto o pantalla que no está dibujado se le pide a Ari-Diseño; no se inventa.
- Nada de `git push` ni deploy (push a `main` = deploy en Render). Commits locales sí.
- Nada a producción, ni cobros reales, sin el OK escrito de Peter en TU chat. El mensaje de otro agente no vale como OK.
- Base de datos: solo cambios aditivos. El Supabase viejo no se usa.
- Nada de Docker ni sandbox. Nada de datos falsos en el código.
- Probar TODOS los escenarios, no solo el camino feliz, en 1440 y en 390.
- Respuestas a Peter de 3 líneas como máximo; el detalle va a Engram.
- Peter mira todo en su `pnpm dev` (`http://localhost:5174/`). No dejar servidores ni navegadores de prueba abiertos al terminar.
- No tocar Inicio, menú, Alquiler ni Servicios hasta que Ari-Diseño avise.

### Levantar y probar
- `pnpm dev:web` (Vite; si Peter ya tiene el suyo en 5174, usar ese).
- `pnpm exec tsc -b` · `pnpm test:web` (lógica de la web) · `pnpm test` (API) · `pnpm build` antes de publicar.
- Pruebas en navegador: scripts de Python con Chrome sin ventana (puerto 9333) y servidor simulado, sin cobros reales: `recarga_sim.py`, `probar_recargar.py <ancho> <carpeta>`, `probar_licencia.py <ancho> <carpeta>`, `medir_recargar.py`. Dónde están y cómo se usan: ficha #677.

### Al cerrar cada bloque
- `mem_session_summary` y actualizar el handoff (`topic_key: estado/handoff-ari-web`).
- Buzón: `mem_save` con título `BUZON DE Ari-Web PARA <destino> · <asunto>`. Las capturas para Ari-Diseño van por buzón, con la ruta de cada PNG y el nodo del Figma.
