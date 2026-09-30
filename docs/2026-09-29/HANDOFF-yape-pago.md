# HANDOFF — Cobro Yape / esquema `pago` (2026-09-29)

Base: **Ariad_SecurityPlugin** (`sdarsjdwnuimjruthjwz`, org `oqwchtfpfwfgpolpfaww`). Es el backend del
desbloqueador + TODO el cobro Yape. NO aparece en `list_projects` (otra org) pero es la correcta:
verificar con `get_project(sdarsjdwnuimjruthjwz)`.

## Estado al cierre de hoy

- **Backend (DB + edges + cron): EN VIVO.** Todo aplicado y verificado contra prod (self-rollback + advisors + end-to-end con el teléfono real).
- **Web (`src/components/RecargaYape.tsx`, `src/lib/cuenta.ts`, `DashboardPage.tsx`): solo LOCAL, sin push a Render.** La UI Yape sigue fuera del sitio público (revert previo). `tsc -b` limpio.
- **APK (`C:\private_opencode\ariad-yape-lector`): compilada 0 errores, NO instalada en el Samsung A16 de producción.** Esperando OK del dueño para instalar.
- Teléfono producción: Samsung A16, `dispositivo = fbe581ec8e3b418cb2004bf2f0c7b2ef`, activo. Yape de Liz (972799539).

## Hecho hoy (migraciones aplicadas, en orden)

1. `yape_antifraude_ratelimit_usuario` + `..._solo_fallidos` — capa 2 (rate-limit 12 declaraciones/h por usuario sobre cobros no confirmados → `bloqueo_temporal`) y capa 3 (máx 4 cobros yape abiertos → `demasiados_cobros_abiertos`).
2. `yape_saturacion_1_casacion_11_y_revision` — casación **1:1**; si hay ambigüedad (mismo monto+código) RETIENE y crea revisión (nunca mis-rutea) + advisory locks anti-ráfaga.
3. `yape_saturacion_2_barredor_cron` — `pago.yape_barrer()` (caduca cobros vencidos, marca pagos huérfanos) en **pg_cron** cada 5 min (job `yape_barrer`).
4. `pago_endurecimiento_regla4_least_privilege` — REVOKE EXECUTE de anon/authenticated en `yape_revision_resolver`, `yape_barrer`, `cobro_confirmar_servicio`, `cobro_crear_servicio`; RLS on en `yape_revision`. **Cerró un hueco real: esas funciones de dinero eran ejecutables por anon vía /rest/v1/rpc (advisors 0028/0029 → ahora limpios).**
5. `pago_regla1_indices_escalabilidad` — índices en cobro_yape_codigo(codigo), cobro_monto(monto_unidad), cobro_vencimiento(vence_en), pago_visto_ocurrido(ocurrido).
6. `pago_yape_revision_6fn_enums_y_casar` + `..._estado_clock_timestamp` — `yape_revision` a **6FN** (ancla+satélites+puentes+estado/enum+resolución); enums `motivo_revision`/`estado_revision`; **`yape_match_*`→`yape_casar_*`**.
7. `pago_regla3_device_a_dispositivo` — columnas `device`→`dispositivo`, `version_code`→`version_codigo`; params `p_device`→`p_dispositivo`. **Edges yape_notificar/heartbeat/version → v2** (mandan `p_dispositivo`). APK sin cambios (su contrato HTTP usa `device` en body + header, independiente de la base).

## Auditoría 10 reglas (ver memoria `reglas-base-datos`): veredicto tras arreglos

1 escalable ✅ · 2 6FN ✅ (núcleo + yape_revision arreglada) · 3 español ✅ (match/device corregidos) ·
4 seguridad ✅ (hueco cerrado) · 5 sin plural ✅ (arrays fuera) · 6 claridad ✅ · 7 estados ✅ ·
8 borrado ✅ · 9 enums ⚠️ (falta pago_visto_*) · 10 arquitectura ✅.

## PENDIENTE para mañana (prioridad)

1. **Enums `pago_visto_moneda/tipo/fuente`** (regla 9). Son `text` con datos sucios: `moneda` tiene `'USDT'` (14) vs enum `'usdt'`; `tipo` `'C2C'/'PAY'/'yape_recibido'`; `fuente` `'yape'/'pay_c2c'`. **CUIDADO: toca `pago.pago_ingerir` y `pago.conciliar` = ruta de Binance.** Plan: crear enums, normalizar datos ('USDT'→'usdt', etc.), migrar columnas, actualizar funciones, quitar `coalesce(...,'')`. Reusar `public.moneda` para moneda. Probar Binance con self-rollback ANTES de tocar.
2. **`cobro_confirmar_servicio`**: endurecer el cuerpo (validar pago real/dueño/monto; hoy inserta acreditación con txid arbitrario delta 0). Ya no es anon-callable.
3. **Menores**: FK `cobro_yape_codigo_cobro_id_fkey` sin ON DELETE RESTRICT; constraints `_pkey`/`_fkey` default → renombrar a `_pk`/`_fk`; `secreto_leer` con allowlist; regex pagador en `YapeParser.cs` `env[ií][oó]` (cosmético).
4. **Instalar APK v2 en el Samsung A16** (cuando el dueño dé OK): `dotnet build -c Debug -t:Install -p:AdbTarget="-s <SERIAL>"`. Incluye backpressure (drenado por lotes, purga diaria de enviados).
5. **Prueba real end-to-end**: pagar a 972799539 → captura → declarar código → acredita.

## Reglas de trabajo (NO romper)

- NO push web a Render sin OK explícito del dueño (las pruebas son locales).
- NO instalar APK en el teléfono de producción sin OK.
- Todo cambio de DB ADITIVO; no romper Binance (pago_ingerir/conciliar/vigia).
- Verificar cada DDL con `get_advisors(security)`. Tests con patrón self-rollback (DO block que hace `raise` al final).
- Nunca acreditar sin pago confirmado. HMAC en Vault `yape_hmac_secreto`.

## Cómo testear rápido (patrón self-rollback)

```sql
do $$ declare ... begin
  -- crear cobros / declarar / ingerir / resolver ...
  raise exception 'TEST>> %', resultado;  -- revierte todo, ves el resultado en el error
end $$;
```
Device activo para probar `yape_ingerir`: `fbe581ec8e3b418cb2004bf2f0c7b2ef`.
