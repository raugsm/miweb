# Sistema de pagos Ariad (Yape + Binance) — Estado final + Runbook

**Fecha de cierre:** 2026-09-30 (cont. 2026-10-01 UTC)
**Proyecto Supabase:** `sdarsjdwnuimjruthjwz` (Ariad_SecurityPlugin) · esquema `pago` (+ `negocio`)
**Repos:** `C:\private_opencode\miweb` (web + backend SQL/edges) · `C:\private_opencode\ariad-yape-lector` (APK lector, **sin git — ver §5**)

> Documento maestro. Para el detalle de diseño y la revisión adversarial ver
> [`PLAN_INGRESOS_Y_BLINDAJE.md`](PLAN_INGRESOS_Y_BLINDAJE.md); para el brief del agente del
> panel ver [`PROMPT_AGENTE_SEGUIMIENTO.md`](PROMPT_AGENTE_SEGUIMIENTO.md).

---

## 1. Qué se hizo (resumen)

1. **Revisión adversarial** de todo el motor de pagos (Yape + Binance) → 8 agujeros altos confirmados con evidencia en datos reales.
2. **Blindaje del motor** (10 lotes de migraciones aditivas, todas probadas con self-rollback): se corrigieron las fugas (el vigía mataba pagos Yape, dinero perdido como "duplicado", etc.), se agregó gracia a pagos tardíos, inmutabilidad de las tablas de dinero, endurecimiento de privilegios y clawback de reversos.
3. **Libro de ingresos** (vistas + funciones `pago.*`) como fuente única para seguimiento.
4. **Edge `panel_ingresos`** (solo-dueño) con 6 acciones, que consume la **app aparte "Ari-Tool panel admin"** (otro agente).
5. **APK lector de Yape actualizado a v2**: ahora captura el **nombre del pagador** de la notificación.
6. **Limpieza de datos de prueba** (archivado, sin borrado físico) para no mezclar plata real con pruebas.

Estado final verificado: motor en producción, teléfono lector activo (v2), web publicada, panel de seguimiento integrado.

---

## 2. Arquitectura end-to-end

**Yape (soles):** cliente paga por Yape al número de Ariad → el **APK lector** (teléfono A16) lee la notificación "Confirmación de Pago", extrae **monto + código de seguridad (3 díg) + nombre del pagador**, firma HMAC y la postea a la edge **`yape_notificar`** → **`pago.yape_ingerir`** guarda el pago (`pago_visto`, fuente `yape`) e intenta casar. El cliente declara su código de seguridad en la web (**`yape_confirmar` → `yape_declarar` → `yape_casar_cobro`**); al casar 1:1, **`yape_acreditar_par`** acredita (exactly-once).

**Binance (USDT):** el **vigía** (cron `pago_vigia`, cada minuto → edge `pago_conciliar` → `pago.vigia_correr` → **`pago.conciliar`**) lee los pagos de Binance Pay y casa por el código **ARI-XXXX** que el pagador pone en la nota; **`pago.cobro_acreditar`** acredita (exactly-once).

**Libro de ingresos:** todo queda en `pago.*` (anchor `pago_visto` + satélites + `acreditacion`/`reverso` + bitácora `evento` con hash encadenado). Las **vistas** (`v_ingreso`, `v_ingreso_diario`, `v_revision_pendiente`) y **funciones de panel** son la capa de lectura/control.

**Panel admin (otro agente, app WPF):** navegador/app → edge **`panel_ingresos`** (auth dueño + service_role) → RPC `pago.*`. La app NO accede a las tablas directo (RLS deny-all; todo por funciones service_role).

---

## 3. Cambios de backend (migraciones en `supabase/migrations/`)

Todas aditivas, en español, 6FN, service_role-only, probadas con self-rollback. (Los lotes 1–7 y su contexto están detallados en el PLAN.)

| Lote | Archivo | Qué hace |
|---|---|---|
| 1 | `..._pago_lote1_conciliar_solo_binance_y_gracia.sql` | `conciliar()` solo procesa fuente Binance (deja de matar Yape); gracia a cobros caducados; dinero nuevo vs cobro cerrado → `revision` no `duplicado`; `retenido` no se caduca |
| 2 | `..._pago_lote2_gracia_casacion_yape.sql` | Gracia de casación Yape contra cobros `caducado` (ventana `[creado-10m, creado+2h]`) |
| 3 | `..._pago_lote3_vistas_ingresos.sql` | Vistas `v_ingreso`, `v_ingreso_diario`, `v_revision_pendiente` |
| 4 | `..._pago_lote4_panel_ingresos_fn.sql` | `panel_ingresos_resumen(dias)`, `panel_ingreso_atribuir(txid,cobro)` |
| 5 | `..._pago_lote5_inmutabilidad_dinero.sql` | Append-only (trigger) en `acreditacion`, `reverso`, `pago_visto_estado`, `cobro_estado` |
| 6 | `..._pago_lote6_seguridad_revokes.sql` | REVOKE de anon/authenticated sobre `negocio.*` y USAGE de `pago` |
| 7 | `..._pago_lote7_reverso_clawback.sql` | `reverso_aplicar(txid)` correcto (clawback acotado; licencia a revisión manual) |
| 8 | `..._pago_lote8_panel_cobros_abiertos.sql` | `panel_cobros_abiertos(usuario?)` — candidatos para atribución manual |
| 9 | `..._pago_lote9_panel_movimientos.sql` | `panel_movimientos(metodo,dias?,estado?)` — pestaña "Todos" |
| 10a | `..._pago_lote10a_enum_archivado.sql` | Enum `estado_pago_visto += 'archivado'` |
| 10b | `..._pago_lote10b_archivar_yape_prueba.sql` | `v_ingreso` excluye `'archivado'` + archivado inicial de Yape de prueba |
| 11 (2026-10-01) | `..._pago_lote11_multiservicio_satelites.sql` | satélites `cobro_servicio(servicio, referencia_externa)` + `cobro_idem(idempotency_key)` + backfill (créditos/licencia/servicio) |
| 12 (2026-10-01) | `..._pago_lote12_multiservicio_crear.sql` | `cobro_crear_servicio` acepta servicio/referencia_externa/idempotency_key (idempotencia); `cobro_crear` y `cobro_crear_yape` auto-etiquetan servicio=creditos\|licencia |
| 13 (2026-10-01) | `..._pago_lote13_multiservicio_lecturas.sql` | servicio + referencia_externa en `v_ingreso` / `cobro_ver` / `panel_movimientos` / `panel_ingresos_resumen` (+ bloque `por_servicio`) |
| 14 (2026-10-01) | `..._pago_lote14_yape_servicio_pe.sql` | cobro de **servicio por Yape** (solo PE): `cobro_crear_servicio_yape` (PEN/céntimos, gating país=='PE' + yape_activo, idempotencia) + `yape_acreditar_par` consciente de servicio (sin recarga → solo confirma, sin crédito) |

**Garantías vigentes:** exactly-once (`acreditacion` PK `cobro_id` + UNIQUE `pago_txid`); RLS deny-all en las ~38 tablas de `pago`; funciones `service_role`-only; tablas de dinero append-only; nada se borra (se trabaja por estados).

---

## 4. Libro de ingresos / contrato de backend (lo que consume el panel)

**Edge `panel_ingresos`** (desplegada, `verify_jwt=false`, auth propia `exigirDueno` → rol `dueno`). Body `{accion, ...}` + JWT del dueño. 6 acciones:

| Acción | Params | Devuelve |
|---|---|---|
| `resumen` | `dias?` | `{totales, diario, pendientes, revisiones}` |
| `movimientos` | `metodo, dias?, estado?` | `{movimientos:[filas de v_ingreso]}` (pestaña "Todos") |
| `cobros_abiertos` | `usuario?` | `{cobros:[...]}` (para elegir en "Atribuir") |
| `atribuir` | `txid, cobro` | acredita a mano un pago no casado |
| `resolver` | `revision, cobro, txid` | resuelve ambigüedad Yape |
| `reverso` | `txid` | aplica devolución sobre un txid acreditado |

**Vistas (service_role):** `pago.v_ingreso` (un renglón por pago; `monto` ya normalizado USDT÷1e8 / PEN÷100; excluye `archivado`), `pago.v_ingreso_diario`, `pago.v_revision_pendiente`.
**Env del edge:** `ARIAD_URL`, `ARIAD_SVC` (service_role), `ARIAD_ANON_KEY`.
Detalle completo del contrato: [`PROMPT_AGENTE_SEGUIMIENTO.md`](PROMPT_AGENTE_SEGUIMIENTO.md).

---

## 5. APK lector de Yape (`ariad-yape-lector`)

**App:** `com.ariad.yapelector` (.NET 10 Android / MAUI-less). Teléfono de producción: **Samsung A16**, `dispositivo=fbe581ec8e3b418cb2004bf2f0c7b2ef`, serie ADB `RFGL14GZJKR`. Destino Yape: **Liz Jimena Shahuano Taricuarima — 972799539**.

**v2 (2026-09-30):** captura el **nombre del pagador** de la notificación (`YapeParser.RxPagador`, p.ej. "Bryans Zun*") y lo manda en `p_pagador`; la huella/txid pasó a `monto|codigo|minuto|pagador`. Verificado end-to-end (pago real llegó con nombre, casó y acreditó).

**Cómo compilar e instalar (sideload sobre el A16):**
```
cd C:\private_opencode\ariad-yape-lector
dotnet build -c Debug -f net10.0-android -p:AndroidPackageFormat=apk -p:EmbedAssembliesIntoApk=true
adb -s RFGL14GZJKR install -r bin\Debug\net10.0-android\com.ariad.yapelector-Signed.apk
adb -s RFGL14GZJKR shell am start -n com.ariad.yapelector/crc643ae02f539a270687.MainActivity
```
- **GOTCHA crítico:** sin `-p:EmbedAssembliesIntoApk=true` el build Debug usa *Fast Deployment* (no embebe los assemblies .NET) y al hacer `adb install -r` la app **crashea al abrir** ("No assemblies found... Fast Deployment"). Siempre embeber.
- **Regla de seguridad:** usar solo `install -r` (actualiza en el lugar, conserva config/cola). **NUNCA desinstalar** (perdería la config del lector y lo dejaría caído). El APK es Debug-signed con el `debug.keystore` de la máquina → la firma coincide y `install -r` funciona.
- Verificar tras instalar: `adb shell dumpsys package com.ariad.yapelector | findstr versionCode` (debe subir), proceso vivo (`adb shell pidof`), `WatchdogService` foreground, permiso lector de notificaciones y Doze whitelist intactos, y el **latido** en `pago.yape_dispositivo.version_codigo`.

**Robustez del teléfono (ya configurado, replicable por ADB):** permiso `NotificationListenerService` habilitado; en whitelist de Doze (`dumpsys deviceidle whitelist`); `WatchdogService` foreground que mantiene el proceso vivo. (Ver memoria `yape-notificaciones-adb`.)

**Pendiente (follow-up):** `ariad-yape-lector` **no está bajo control de versiones**. Conviene `git init` + primer commit para versionar el APK (hoy el cambio v2 vive solo en disco).

---

## 6. Limpieza de datos de prueba (archivado)

**Principio (regla del dueño):** nada se borra físicamente. Se usa el estado terminal **`archivado`** (append en `pago_visto_estado`, respeta el append-only); **`v_ingreso` excluye `archivado`**, así que los pagos archivados desaparecen de TODO el panel (resumen, "Todos", "Necesita acción", revisiones) pero **quedan en la bitácora** (`pago_visto_estado` + `pago.evento`) y son reversibles.

**Qué se archivó (todo prueba, para no mezclar con plata real):**
- **Yape:** los 18 pagos de prueba (incluye el flujo exitoso 185 y los duplicados 618 de transición). Yape quedó en **0 visible**.
- **Binance:** los de pagadores de prueba `Petryx_27`, `ariadgsm` (17) y `prueba-app` (1).

**Quedó visible (real):** Binance → **KendySalazar** (1 pago, acreditado). Yape → 0.

**Cómo archivar más (patrón):**
```sql
insert into pago.pago_visto_estado(txid, estado)
select pv.txid, 'archivado'::public.estado_pago_visto
from pago.pago_visto pv
join pago.pago_visto_fuente pf on pf.txid=pv.txid and pf.fuente= :fuente   -- 'yape' | 'pay_c2c'
left join pago.pago_visto_pagador pa on pa.txid=pv.txid
where ( :pagador is null or pa.pagador = :pagador )
  and (select estado from pago.pago_visto_estado e where e.txid=pv.txid order by desde desc limit 1) <> 'archivado';
```
**Des-archivar** (si hiciera falta): insertar el estado previo correcto (p.ej. `'casado'` o `'nuevo'`) como nuevo renglón — también es append.

> Nota: archivar oculta el PAGO del panel; **no revierte créditos** ya acreditados (esos viven en `acreditacion`/`negocio.credito`). Para quitar créditos de un pago, usar `reverso_aplicar`.

---

## 7. Runbook operativo

**Resolver un pago trabado (desde el panel / edge `panel_ingresos`):**
- *Pago sin casar* (`sin_codigo`/`monto_distinto`/huérfano): `atribuir {txid, cobro}` (elegí el cobro con `cobros_abiertos`).
- *Ambigüedad Yape* (`revision`): `resolver {revision, cobro, txid}` (elegí el par correcto; libera a los terceros).
- *Devolución*: `reverso {txid}` (sobre el txid original acreditado).

**Config (en `negocio.parametro`):** `yape_activo=true`, `yape_precio_credito_pen=3.50`, `yape_precio_licencia_pen=157.50`, `yape_destino`, `binance_pay_id`, `binance_pay_url`. (Editar solo con service_role.)

**Crons activos:** `pago_vigia` (**cada 15s** — conciliar Binance; bajado de 60s el 2026-10-01 para confirmar pagos en ~10–20s, pedido FRP; `cron.alter_job(2, '15 seconds')`, pg_cron 1.6.4), `yape_barrer` (cada 5 min — caduca cobros no pagados + barrido de huérfanos Yape a 24h).

**Latencia de confirmación Binance:** el vigía (`pago_conciliar`) es autosuficiente — lee Binance en vivo (`/sapi/v1/pay/transactions`, clave solo-lectura del Vault), ingesta y concilia TODO de una pasada. El cliente NO consulta Binance: hace poll de `pago_cobro_estado` (solo DB) cada ~5s y libera con `estado=='confirmado'`. Con el vigía a 15s → confirmación típica 10–15s, peor caso ~20s. La cadencia hacia Binance la gobierna SOLO el vigía (4 llamadas/min), nunca los polls del cliente. Si hiciera falta bajar más, evaluar un edge "nudge" throttled antes que acoplar Binance a `pago_cobro_estado`.

**Monitoreo del lector:** `select version_codigo, activo, ultimo_latido, pendientes from pago.yape_dispositivo where dispositivo='fbe581ec8e3b418cb2004bf2f0c7b2ef';` — `ultimo_latido` reciente = vivo; `pendientes>0` = tiene pagos sin enviar.

**No romper:** no tocar el motor (`pago_ingerir`/`conciliar`/`vigia`/`cobro_crear`/`yape_casar`/`cobro_acreditar`); cambios siempre aditivos; correr `pnpm test` tras tocar `server.js`; no desplegar web a Render sin OK del dueño.

---

## 8. Estado actual (al cierre)

- **Motor:** en producción, blindado y verificado.
- **Pasarela multi-servicio:** generalizada (Lotes 11–13) — ya no atada a créditos; cualquier servicio de la empresa cobra por la misma infra. Ver §9.
- **Lector A16:** v2 activo, latiendo, capturando el nombre del pagador.
- **Web:** publicada a `main` (Render).
- **Panel admin (otro agente):** integrado; pestaña por defecto "Todos"; muestra `pagador`, `tipo` ("Yape recibido"), "Sin asignar" para no casados; auto-refresh ~12s. Ahora recibe `servicio` + `referencia_externa` + `por_servicio` para distinguir créditos/licencia/FRP.
- **FRP (cliente de Erasmo):** primer consumidor externo de la pasarela; paga por Binance vía `pago_cobro_servicio_crear` (`servicio:"frp"`). Sus pedidos siguen en su backend (`ariadsoporte-prod`), enlazados por `referencia_externa`.
- **Datos:** panel limpio — Yape 0 visible, Binance 1 real (KendySalazar). Todo lo de prueba archivado (reversible, en bitácora).

**Pendientes / follow-ups:**
1. Versionar `ariad-yape-lector` con git (§5).
2. Pasar el `.exe` nuevo del panel a producción cuando el dueño cierre/reabra (lo maneja el otro agente).
3. Opcional: mostrar en el panel el código Binance normalizado cuando la nota trae texto extra.
4. Prueba real final de demo (Yape + Binance en vivo) antes del video.
5. Opcional: tarjetas KPI `por_servicio` en el panel (lo decide el agente del panel).
6. Futuro: camino Yape multi-servicio (hoy el service-cobro es solo Binance).
7. Futuro: convergencia de las 2 bases a 1 (apoyada en `referencia_externa`).

---

## 9. Pasarela multi-servicio (2026-10-01)

La pasarela dejó de estar atada a "créditos": ahora es **la pasarela de pago de la empresa** y cualquier servicio (Ari-Tool créditos/licencia, FRP, y futuros) cuelga de la misma infra (mismo teléfono/número, misma casación, mismo exactly-once y anti-fraude). El **primer consumidor real externo** es la Herramienta FRP (cliente de Erasmo) pagando por Binance.

**Qué se agregó (aditivo, Lotes 11–13):**
- **`pago.cobro_servicio(cobro_id pk, servicio text, referencia_externa text)`** — etiqueta cada cobro con su `servicio` (slug en texto, NO enum, para no acoplar) + una `referencia_externa` (id del servicio dueño). Valores de `servicio`: `creditos`, `licencia`, `frp`, y futuros (`cuenta_mi`, `consultar`, …) — se agrega un servicio nuevo con solo un slug nuevo, sin migración.
- **`pago.cobro_idem(idempotency_key pk, cobro_id)`** — idempotencia de creación: misma key → devuelve el cobro existente (anti cobro-doble por reintento). Advisory lock por key.
- **Auto-etiqueta:** `cobro_crear`/`cobro_crear_yape` etiquetan `creditos`/`licencia` solos; `cobro_crear_servicio` toma el `servicio` del parámetro. Backfill de todos los cobros previos.
- **Expuesto** en `v_ingreso`, `cobro_ver`, `panel_movimientos`, `panel_ingresos_resumen` (+ bloque `por_servicio`).

**Contrato de integración (lo que usa un servicio — hoy Binance; service-cobro):**
- Crear: edge **`pago_cobro_servicio_crear`** (v2) `POST { monto, servicio, referencia_externa?, idempotency_key?, motivo? } + JWT` → `{ cobro_id, codigo, monto, producto:"servicio", servicio, referencia_externa, idempotente, vence_en, destino, pago_url }`. Confirmación automática por el vigía (Binance, código ARI único → casación 1:1). FRP manda `servicio:"frp"`, `referencia_externa:<lote_id (LOCAL) | DeviceId/pedido_ref (GLOBAL)>`, `idempotency_key:<GUID por intento>`.
- Estado: edge **`pago_cobro_estado`** (v2) `POST { cobro_id } + JWT` → `{ estado, pagado, codigo, monto_unidad, vence_en, servicio, referencia_externa }`. El servicio consumidor **libera su entrega SOLO con `estado=='confirmado'`** (no por reloj local); hay gracia server-side en `caducado`; re-verificar al retomar.
- Panel: `panel_ingresos` acción `movimientos` y `resumen.pendientes[]` traen `servicio` + `referencia_externa`; `resumen.por_servicio[]` = `{servicio, moneda, acreditado, pagos_acreditados}`. El panel mapea `servicio`→ "Tipo" (Créditos / Licencia / Servicio FRP; null → "—/sin asignar" en pagos no casados).

**Cómo sumar un servicio nuevo:** crear el cobro con `pago_cobro_servicio_crear` pasando `servicio:"<slug>"` + su `referencia_externa`; consultar estado con `pago_cobro_estado`; liberar con `confirmado`. No hace falta tocar el motor. (El service-cobro NO tiene "un solo activo por usuario" → un técnico puede tener varios cobros-servicio abiertos, uno por pedido. No hay hold por monto en servicio.)

**Notas / límites:**
- `servicio` en `v_ingreso`/movimientos sale del cobro casado (vía acreditacion) → en pagos NO casados queda null (aún no se sabe de qué servicio es). `pago_cobro_estado` sí lo trae directo (por cobro).
- Idempotencia: misma `idempotency_key` devuelve el cobro con sus datos ORIGINALES (ignora cambios de monto/referencia del reintento) — correcto para un reintento.
- Hoy el service-cobro es **Binance**; para un Yape multi-servicio habría que agregar un camino análogo (no hecho aún).
- Dos bases hoy (pasarela `sdarsjdwnuimjruthjwz` + backend FRP de Erasmo `duvpkpfivcnftxelgqtt`/`ariadsoporte-prod`); la convergencia futura a una base se apoya en `referencia_externa` (pago↔pedido ya enlazados).

**Contrato para el agente del panel/servicios:** ver también `GUIA_COBRO_YAPE.md` (método Yape) y los Lotes 11–13 en `supabase/migrations/`.

### Servicio por Yape (solo Perú) — Lote 14 (2026-10-01)

La pasarela multi-servicio ahora también cobra por **Yape** (antes solo Binance). Primer consumidor: FRP para técnicos de Perú. Diferencia de fondo con Binance: **Yape NO es sin-tipeo**. En Binance el pagador escribe el código ARI único en la nota (la API lo devuelve → casación 1:1 sola). En Yape lo único que el lector capta es MONTO + código de seguridad de 3 díg, y ese código lo genera Yape al pagar (el pagador no lo elige). Por eso el técnico **declara** el código de 3 díg de su comprobante → se auto-verifica 1:1 contra lo que leyó el lector (sin comprobante/foto, sin humano). Es el **Modelo A** (elegido por el dueño); el Modelo B (sin tipeo vía monto con céntimos únicos) quedó descartado por ahora (precio FRP variable → el motor tendría que asignar céntimos únicos).

**Contrato (lo que usa el servicio):**
- Crear: edge **`pago_cobro_servicio_yape_crear`** (NO es el de Binance). `POST { monto, servicio?, referencia_externa?, idempotency_key?, motivo? } + JWT` → `{ cobro_id, codigo, monto (texto PEN), moneda:"PEN", producto:"servicio", servicio, referencia_externa, idempotente, vence_en, destino (nº/nombre Yape a pagar) }`. FRP manda `servicio:"frp"` + `referencia_externa` + `idempotency_key`. Gating **país=='PE'** + `yape_activo` lo hace la función SQL (`pago.cobro_crear_servicio_yape`): un no-PE recibe `pais_no_habilitado` (403).
- Confirmar: edge EXISTENTE **`yape_confirmar`** `POST { cobro_id, codigo } + JWT` (codigo = 3 díg del comprobante) → `yape_declarar` → `yape_casar_cobro` → `yape_acreditar_par` (ahora consciente de servicio: sin recarga → solo confirma, sin crédito). Devuelve `{ ok, casado?|ya?|motivo }` (`esperando` = aún no llegó el pago; `en_revision` = ambiguo; `casado` = confirmado).
- Estado: edge EXISTENTE **`pago_cobro_estado`** (sirve igual para Yape). Poll ~5s, liberar SOLO con `estado=='confirmado'`.

**Latencia:** el lector A16 (v2) ya intenta casar al ingerir (`yape_ingerir → yape_casar_pago`). Técnico declara el código → casa al instante si el pago ya llegó, o apenas el lector postea la notif (segundos). Típico ~10–15s. Depende de que el teléfono reciba+postee la notif (ya endurecido Doze/foreground).

**Garantías:** reusa el motor Yape probado (casación 1:1, cola de revisión para ambiguos, exactly-once por `acreditacion`). `yape_acreditar_par` distingue servicio por ausencia de `cobro_recarga` → un cobro de servicio jamás acredita créditos/licencia. Unidades: Yape en céntimos de sol (no se cruza con Binance USD×1e8 porque la casación es por fuente). Validado con prueba self-rollback (gating PE, idempotencia, casación servicio → confirmado delta=0 sin crédito).

## 10. Índice de documentación (`docs/2026-09-30/`)

- **`ESTADO_FINAL_Y_RUNBOOK.md`** (este) — estado final, arquitectura, APK, limpiezas y runbook operativo.
- **`PLAN_INGRESOS_Y_BLINDAJE.md`** — plan + hallazgos de la revisión adversarial + estado de implementación por lote.
- **`PROMPT_AGENTE_SEGUIMIENTO.md`** — brief/contrato de backend para el agente que construye la app de seguimiento.
