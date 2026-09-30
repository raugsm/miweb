# Prompt para el agente — App "Ari-Tool panel admin": seguimiento de pagos (Yape + Binance)

> Copiá y pegá todo esto como brief para el agente que construye la app de seguimiento.
> El backend YA está construido y probado en Supabase; el agente NO lo reimplementa: lo consume.

---

## 1. Qué vas a construir

Una sección/app de **panel de administración (solo para el dueño)** que muestra y controla **todos los ingresos** de Ari-Tool: pagos por **Yape** (soles) y **Binance Pay** (USDT). El objetivo del dueño es *saber con certeza cuánta plata entró, cuánto se acreditó a cada técnico, y resolver a mano los pagos que quedaron trabados.*

El **motor de pagos y todo el backend de seguimiento YA existen** en Supabase (proyecto `sdarsjdwnuimjruthjwz` = "Ariad_SecurityPlugin"). Vos **solo construís la app que lo consume**. NO toques el motor de pagos.

## 2. Regla de oro (no romper nada)

- **NO modifiques** el esquema `pago` ni sus funciones de motor (`pago_ingerir`, `conciliar`, `vigia_correr`, `cobro_crear`, `cobro_crear_yape`, `yape_casar_pago`, `yape_casar_cobro`, `yape_declarar`, `cobro_acreditar`, `yape_acreditar_par`, `yape_barrer`, crons). Son plata en vivo y ya están blindados.
- Si te falta algún dato, **agregá una función/vista NUEVA y ADITIVA** (nunca alteres las existentes), respetando las 10 reglas del dueño: 100% escalable, 6FN, 100% español (sin plural/infinitivos/abuso de verbos en nombres), seguridad impenetrable, funciones claras, **nada se borra físicamente (se trabaja por estados)**, borrar solo tras análisis, buen uso de enums, arquitectura clara.
- **Todo el esquema `pago` es `service_role`-only** (RLS deny-all, sin grants a anon/authenticated). El navegador **no puede** leerlo directo.

## 3. Arquitectura OBLIGATORIA (seguridad)

```
Navegador (dueño logueado)  --JWT-->  Edge Function (auth dueño + service_role)  -->  RPC pago.*
```

- El cliente (browser) **NUNCA** lleva la `service_role key`. Solo lleva el JWT del dueño.
- Un **edge function** (o backend server) autentica al dueño y usa `service_role` para llamar las funciones `pago.*`.
- Hay una **implementación de referencia lista** que podés desplegar tal cual o adaptar:
  `miweb/supabase/functions/panel_ingresos/` (`index.ts` + `seguridad.ts`).

### Proyecto y credenciales
- **Project ref:** `sdarsjdwnuimjruthjwz`
- **URL:** `https://sdarsjdwnuimjruthjwz.supabase.co`
- **Publishable key (browser, solo para login/auth):** `sb_publishable_XVMUL7TMS7SjAtKV42Hn6g_Bpksm3Ux` (pública por diseño)
- **Env vars del edge/backend (secretas, NUNCA en el browser):**
  - `ARIAD_URL` = la URL de arriba
  - `ARIAD_SVC` = la **service_role key** del proyecto (Dashboard → Settings → API)
  - `ARIAD_ANON_KEY` = la anon/publishable key (para validar el JWT del llamante)

### Autenticación (patrón exacto, ya escrito en `seguridad.ts`)
- `llamante(req)` → valida el `Authorization: Bearer <jwt>` con `auth.getUser()`.
- `rolDe(correo)` → `seguridad.cuenta` → `negocio.usuario_taller` → `negocio.usuario_rol (estado='activo')` → `negocio.rol.nombre`.
- `exigirDueno(req)` → exige que el rol sea **`dueno`**; si no, lanza `rechazo_autorizacion` (→ 403).
- El edge debe tener `verify_jwt = false` (hace auth propia con `exigirDueno`).
- El dueño se loguea con su cuenta Supabase (la que tiene rol `dueno`) usando la publishable key.

## 4. Contrato de backend (esto es lo que consumís — YA existe)

Todo se llama con `service_role` así (supabase-js dentro del edge):
```ts
const db = admin(); // createClient(ARIAD_URL, ARIAD_SVC)
const { data, error } = await db.schema("pago").rpc("<funcion>", { ...params });
```

### 4.1 Lectura — Resumen para el tablero
`pago.panel_ingresos_resumen(p_dias int default 14)` → **jsonb**:
```jsonc
{
  "totales": [   // por método y moneda
    { "metodo":"binance", "moneda":"USDT", "acreditado":17.3, "pendiente":12.1073, "pagos_acreditados":10, "pagos_pendientes":7 },
    { "metodo":"yape",    "moneda":"PEN",  "acreditado":24.5, "pendiente":23.72,   "pagos_acreditados":7,  "pagos_pendientes":6 }
  ],
  "diario": [    // cuadre visto vs acreditado por día
    { "dia":"2026-09-30", "metodo":"yape", "moneda":"PEN", "pagos_vistos":3, "monto_visto":11.5,
      "pagos_acreditados":2, "monto_acreditado":7.0, "pagos_pendientes":1, "monto_pendiente":4.5 }
  ],
  "pendientes": [ // cola de pagos que necesitan acción
    { "txid":"...", "metodo":"yape", "moneda":"PEN", "monto":3.5, "nota":"211",
      "pagador":"", "ocurrido":"...", "visto_en":"...", "estado_final":"ignorado" }
  ],
  "revisiones": [ // ambigüedades Yape abiertas
    { "revision_id":"uuid", "creado_en":"...", "estado":"pendiente", "motivo":"pago_ambiguo",
      "monto_unidad":350, "monto_pen":3.5, "codigo":"211", "candidatos":["cobro-uuid",...], "pagos":["txid",...] }
  ]
}
```

### 4.2 Lectura — Vistas (si necesitás más detalle o filtros propios)
Leelas con `db.schema("pago").from("<vista>").select("*")...` (service_role):
- **`pago.v_ingreso`** — un renglón por pago. Columnas:
  `txid, fuente, metodo (yape|binance), moneda, monto_unidad, monto (YA normalizado a decimal), nota, pagador, tipo, ocurrido, visto_en, estado_final, estado_desde, cobro_id, usuario_id, usuario_nombre, cobro_codigo, acreditado (bool), creditos, aplicado_en, reversado (bool), necesita_accion (bool)`.
- **`pago.v_ingreso_diario`** — `dia, metodo, moneda, pagos_vistos, monto_visto, pagos_acreditados, monto_acreditado, pagos_pendientes, monto_pendiente`.
- **`pago.v_revision_pendiente`** — `revision_id, creado_en, estado, motivo, monto_unidad, monto_pen, codigo, candidatos (uuid[]), pagos (text[])`.

> **IMPORTANTE:** usá siempre la columna `monto` (ya viene dividida: USDT ÷1e8, PEN ÷100). **Nunca** sumes `monto_unidad` crudo entre monedas. Y agrupá/segmentá **por moneda** (nunca mezcles USDT con PEN en un total).

### 4.3 Acciones (control)
- **Resolver ambigüedad Yape:** `pago.yape_revision_resolver(p_revision uuid, p_cobro uuid, p_txid text)`
  El operador elige, dentro de una revisión de `v_revision_pendiente`, qué `cobro` (de `candidatos`) va con qué `pago` (de `pagos`). Acredita ese par y libera/re-casa los cobros de terceros.
  → `{ "ok":true, "resuelto":true, "acreditacion":{...} }` o `{ "ok":false, "motivo":"ya_resuelta|cobro_fuera_de_revision|txid_fuera_de_revision|revision_desconocida" }`.
- **Atribuir un pago no casado a un cobro:** `pago.panel_ingreso_atribuir(p_txid text, p_cobro uuid)`
  Para pagos `sin_codigo` / `monto_distinto` / `ignorado` / huérfanos: los acredita a mano al cobro correcto (exactly-once).
  → `{ "ok":true, "casado":true, "creditos":N, "saldo":N }` o `{ "ok":false, "motivo":"pago_ya_acreditado|cobro_desconocido|pago_desconocido|cobro_no_acreditable" }`.
- **Aplicar devolución / reverso:** `pago.reverso_aplicar(p_txid text)` (el `txid` ORIGINAL ya acreditado)
  Créditos: clawback acotado al saldo (registra deuda si ya gastó). Licencia: marca para revisión manual (no auto-revoca).
  → `{ "ok":true, "producto":"credito", "quitado":N, "deuda":N }` / `{ "ok":true, "producto":"licencia", "revision_manual":true }` / `{ "ok":false, "motivo":"no_acreditado|ya_revertido" }`.

## 5. Pantallas / rutas a construir

Adaptá los paths a tu stack; sugeridas (todas detrás de login del dueño):

| Ruta | Qué muestra | Acciones |
|---|---|---|
| `/ingresos` | Tablero: tarjetas de `totales` (acreditado vs pendiente por método/moneda) + gráfico `diario` (visto vs acreditado) + últimos pagos | — |
| `/ingresos/pendientes` | Cola de conciliación: `pendientes` (pagos `sin_codigo`/`monto_distinto`/`ignorado`/huérfanos) con monto, nota, pagador, fecha, método | **Atribuir** (`panel_ingreso_atribuir`) → elegir cobro/usuario |
| `/ingresos/revisiones` | `revisiones` Yape ambiguas, con sus `candidatos` (cobros) y `pagos` (txids) | **Resolver** (`yape_revision_resolver`) → elegir el par correcto |
| `/ingresos/reversos` | Buscar un pago acreditado para devolver | **Aplicar reverso** (`reverso_aplicar`) |
| `/ingresos/pago/:txid` | Detalle de un pago (todo lo de `v_ingreso` para ese txid) | atribuir / reverso según estado |

- Todas las llamadas van a **un edge** (p. ej. `panel_ingresos`) con `{ accion: "resumen"|"resolver"|"atribuir"|"reverso", ...params }` + JWT del dueño. La impl de referencia ya trae `resumen`/`resolver`/`atribuir`; agregale `reverso` si lo querés en la UI (llama `pago.reverso_aplicar`).

## 6. Modelo de datos (para la UI)

- **Métodos:** `yape` (moneda `PEN`), `binance` (moneda `USDT`).
- **Estados de un pago** (`estado_final`): `nuevo`, `casado` (acreditado ✓), `sin_codigo`, `monto_distinto`, `duplicado`, `reverso`, `ignorado`, `revision`.
- **`necesita_accion = true`** marca los pagos a atender (sin_codigo / monto_distinto / revision / ignorado / nuevo viejo, no acreditados). Usalo para la cola.
- **Ambigüedad Yape:** cuando 2+ cobros comparten monto + código de 3 dígitos → se abre una `revision` (`motivo: pago_ambiguo` o `cobro_ambiguo`) y se congela; se resuelve eligiendo el par.
- **Montos:** `monto` normalizado a decimal; `monto_pen`/`monto_unidad` son crudos (evitar).

## 7. Gaps conocidos (podés cubrirlos ADITIVAMENTE)

- **Atribuir** necesita que el operador elija un `cobro_id`. Hoy no hay una función que liste "cobros candidatos" para un pago huérfano. Si tu UI lo necesita, agregá una función NUEVA de solo lectura (service_role) tipo `pago.panel_cobros_abiertos(p_usuario uuid default null)` que liste cobros no confirmados con usuario/monto/código — SIN tocar nada existente.
- Alertas/notificaciones cuando entra una `revision` o un `retenido`: opcional, lo podés sondear con `panel_ingresos_resumen`.

## 8. Criterios de aceptación

1. El dueño se loguea y ve, en un solo lugar, **cuánto entró y cuánto se acreditó** por Yape y Binance, por día y total, sin mezclar monedas.
2. Puede ver la **cola de pagos trabados** y **resolverlos** (atribuir / resolver ambigüedad / reverso) desde la UI, y el cambio se refleja al recargar.
3. La `service_role key` **nunca** viaja al browser; todo pasa por el edge con `exigirDueno`.
4. No se modificó ninguna función/tabla del motor de pagos; cualquier agregado es aditivo y en español.

## 9. Referencias en el repo `miweb`
- `docs/2026-09-30/PLAN_INGRESOS_Y_BLINDAJE.md` — plan completo + "contrato de backend".
- `supabase/functions/panel_ingresos/` — edge de referencia (auth dueño + las 3 acciones).
- `supabase/migrations/20260930191000_pago_lote3_vistas_ingresos.sql` y `..._lote4_panel_ingresos_fn.sql` — definición exacta de vistas y funciones.
