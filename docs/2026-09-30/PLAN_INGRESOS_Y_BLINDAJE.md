# Plan — Blindaje final del motor de pagos + Seguimiento de ingresos (Yape + Binance)

**Fecha:** 2026-09-30
**Proyecto Supabase:** `sdarsjdwnuimjruthjwz` (Ariad_SecurityPlugin), esquemas `pago` + `negocio`.
**Origen:** revisión adversarial multi-agente (5 dimensiones, 15 agentes, hallazgos verificados contra la base real).
**Regla dura del dueño:** nada se despliega/aplica sin su confirmación. Todo cambio de DB **aditivo**. No romper Binance (`pago_ingerir`/`conciliar`/`vigia`). No imprimir el access token.

---

> **Estado final + runbook operativo:** ver [`ESTADO_FINAL_Y_RUNBOOK.md`](ESTADO_FINAL_Y_RUNBOOK.md).
> Este documento es el registro de diseño y de la revisión adversarial.

## 0. Idea central

Lo que el dueño pide — *"seguimiento de todos los ingresos (Binance + Yape) para saber con certeza y tener mejor control"* — **no se puede lograr sobre el motor actual**, porque el motor pierde y oculta ingresos en silencio. Por eso este plan tiene dos partes que van juntas:

- **Parte A — Fixes de raíz (bloqueantes):** cerrar los agujeros por los que hoy se pierde/oscurece plata. Sin esto, cualquier "reporte de ingresos" mostraría cifras falsas.
- **Parte B — Capa de seguimiento:** el libro único de ingresos, las vistas/endpoints de lectura, la cola de conciliación y el panel del operador.

Regla de oro para el agente que implemente: **primero A, después B.** Y dentro de A, **A1 es el más urgente** (rompe Yape en la vía feliz).

Garantías que ya están sanas y NO hay que tocar (verificadas): exactly-once por `pago.acreditacion` (PK `cobro_id` + UNIQUE `pago_txid`); todas las funciones de plata son `service_role`-only; RLS deny-all en las 37 tablas de `pago`; casación con monto exacto; el vigía valida `x-vigia-clave` contra Vault y no filtra llaves; `yape_notificar` valida HMAC del cuerpo crudo con comparación constante-en-tiempo.

---

## PARTE A — Fixes de raíz (bloqueantes antes de desplegar)

### A1 — `conciliar()` invade el carril Yape y mata pagos reales `[CRÍTICO]`

**Objeto:** `pago.conciliar()` (cron `pago_vigia`, `* * * * *`) vs `pago.yape_casar_pago` / `pago.yape_casar_cobro`.

**Problema (confirmado 3× + evidencia en datos):** `conciliar()` recorre TODO `pago_visto` en estado `nuevo` **sin filtrar por fuente**. Su primera rama `if upper(moneda) <> 'USDT' then insert pago_visto_estado 'ignorado'` marca como `ignorado` a **todos** los pagos Yape (moneda `pen`). Como los casadores Yape excluyen `ignorado` y no hay transición que lo saque de ahí, un pago Yape real que aún no casó (vía feliz: el cliente paga y recién después teclea su código de 3 dígitos) queda huérfano permanente: plata recibida, crédito nunca entregado, y en el libro figura como `ignorado`.
Evidencia viva: **6 filas `pen` en `ignorado`**, todas sin acreditar, con transición `nuevo→ignorado` en **25–57 s** (la cadencia del cron, no las 24 h de `yape_barrer`) — prueba de que las mató `conciliar()`.

**Arreglo de raíz:** que `conciliar()` procese **solo** pagos de fuente Binance. En su cursor, unir `pago.pago_visto_fuente` y filtrar `pf.fuente = 'pay_c2c'` (o `pf.fuente <> 'yape'`). Los pagos `yape`/`pen` quedan intactos en `nuevo`, propiedad exclusiva del subsistema Yape (`yape_casar_pago`/`yape_casar_cobro`/`yape_barrer`).
Defensa en profundidad: que los casadores Yape no traten `ignorado` como estado terminal irrecuperable (o que `yape_barrer` reintente `yape_casar_pago` sobre pagos Yape pendientes).

**Remediación de datos (aparte, con confirmación):** re-abrir a `nuevo` (o enrutar a revisión) los 6 `pen` hoy en `ignorado` para poder acreditar/rastrear. Nota: la fila de nota `826` tiene monto distinto (cobro 350 vs pago 450) → requiere revisión humana.

**Prueba:** self-rollback SQL — insertar un `pago_visto` `pen`/`nuevo`, correr `conciliar()`, verificar que sigue `nuevo` (no `ignorado`); insertar uno `USDT` sin código y verificar que sí va a `sin_codigo`.

---

### A2 — `duplicado` = dinero Binance real perdido; barredor método-ciego `[ALTO]`

**Objeto:** rama de estados terminales de `pago.conciliar()` (`confirmado`/`revertido`/`anulado`/`caducado` → `duplicado`) + `pago.yape_barrer()` que caduca cobros **sin filtrar método**.

**Problema (confirmado):** `yape_barrer` caduca a los 20 min todo cobro `creado`/`en_espera`/`retenido` sin mirar `cobro_metodo` → **también caduca cobros Binance**. Después `conciliar()` casa por código, ve el cobro terminal y marca el pago `duplicado` **sin chequear si el txid ya se acreditó**. Como `pago_ingerir` deduplica por `txid` (`on conflict do nothing`), un `duplicado` **nunca** es la misma transacción repetida: es **dinero nuevo y distinto** contra un cobro cerrado (pago tardío, doble pago, pago tras cancelar). Queda sin acreditar, sin revisión, sin alerta, y contamina el libro.
Blancos vivos hoy: 24 cobros Binance `caducado`, 8 `confirmado`, 3 `anulado`.

**Arreglo de raíz:** en `conciliar()`, antes de marcar `duplicado`, comprobar si el `txid` ya existe en `pago.acreditacion`. Si **no** existe y el cobro está terminal → marcar el pago `revision` y abrir una **revisión Binance** (equivalente a `yape_revision`) para acreditación/reembolso manual. Separar `duplicado_verdadero` (txid ya acreditado) de `dinero_nuevo_contra_cobro_cerrado`. Además: dar a Binance gracia de casación acorde a la latencia del vigía, o que `conciliar()` reactive/acredite un cobro `caducado` cuyo pago llega con monto exacto (ver A3).

**Prueba:** self-rollback — cobro Binance `caducado` + pago con código correcto → verificar que va a `revision` (no `duplicado`) y crea revisión.

---

### A3 — Caducidad dura de Yape sin gracia; la UI promete lo que el backend no cumple `[ALTO]`

**Objeto:** `pago.yape_barrer` (caduca a 20 min) + `pago.yape_casar_pago`/`yape_declarar` (excluyen `caducado`) + `RecargaPanel.tsx` pantalla `vencido`.

**Problema (confirmado por lógica):** la caducidad es dura (`vence_en` = +20 min) y la casación excluye cobros `caducado`. No hay gracia. Choca de frente con el **retraso conocido de las notificaciones de Yape** (Android posterga a Yape por Doze — es la razón de ser del lector por APK). Un pago legítimo cuya notif/declaración cruza el umbral de ~20 min se pierde de forma permanente e invisible. Peor: `RecargaPanel.tsx` (pantalla `vencido`) promete *"si ya pagaste con el monto y el código correctos, se acreditará igual"*, algo que el backend **no** cumple (`yape_declarar` → `cobro_caducado`).

**Arreglo de raíz:**
1. Dar **gracia de casación post-caducidad** para Yape: que `yape_casar_pago` (y un reintento en `yape_barrer`) pueda casar contra cobros `caducado` si hay match exacto (monto + código + ventana), pago no acreditado y candidato **único**, reviviendo la recarga. El exactly-once sigue impidiendo doble crédito. Ventana ~24–48 h alineada al retraso real de Yape.
2. Alinear la promesa de la UI con el backend (que el backend la honre con la gracia anterior, o que la pantalla deje de prometer acreditación automática).

**Prueba:** self-rollback — cobro Yape `caducado` + pago exacto declarado dentro de la ventana de gracia → acredita.

---

### A4 — `retenido` de Binance se auto-caduca y queda sin resolver `[ALTO]`

**Objeto:** rama de retención de `pago.conciliar()` (recarga con créditos > umbral_hold=200 → cobro `retenido` + pago `revision`) en conflicto con `pago.yape_barrer` (loop 1 caduca `retenido`).

**Problema (confirmado):** `conciliar` retiene compras grandes (201–5000 créditos) poniendo el cobro en `retenido` y el pago en `revision`, **pero no crea fila en `yape_revision`** y **no extiende `vence_en`**. `yape_barrer` incluye `retenido` en la caducidad → a los 20 min el cobro pasa a `caducado`. `conciliar` solo procesa `nuevo`, así que nunca vuelve a mirar el pago `revision`. No existe resolver para `retenido` (`yape_revision_resolver` exige filas `yape_revision`). Resultado: USDT grande recibido, cobro `caducado`, pago congelado en `revision`, sin acreditar y sin herramienta. Es la misma semántica que `en_revision` (Yape) tratada de forma inconsistente: `en_revision` está excluido del barredor y tiene resolver; `retenido` no.

**Arreglo de raíz:** unificar la retención de Binance con la maquinaria de revisión. En `conciliar`, al retener, crear la fila de revisión (`yape_revision` + candidato + pago con el txid) y usar `en_revision`/un estado no-caducable, para que (a) `yape_barrer` no lo caduque y (b) sea resoluble por el resolver. Regla dura: **una revisión de "plata ya recibida" jamás debe compartir el reloj de vencimiento del pago.** Sumar guard de estado en `cobro_acreditar` para no acreditar sobre `anulado`/`revertido`.

---

### A5 — Resolver de revisiones/holds sin cablear + congelamiento de terceros `[ALTO]`

**Objeto:** `pago.yape_revision_resolver` (no lo invoca ningún edge/cron) + ausencia de panel + `yape_casar_pago` congela cobros de terceros.

**Problema (confirmado):** `yape_revision_resolver` existe (`service_role`-only) pero **ningún edge ni cron lo llama** — la única resolución es SQL manual. Las revisiones/holds quedan colgados indefinidamente. Peor: cuando hay ambigüedad (`v_n>=2`), `yape_casar_pago` pone en `en_revision` **todos** los cobros candidatos, **incluidos los de otros usuarios**. Un usuario arrastrado no puede cancelar (`cobro_cancelar` rechaza `en_revision`), ni recasar (los casadores excluyen `en_revision`), ni crear otro cobro (el guard de "un activo" incluye `en_revision`) → 100 % trabado. Esto es un vector de **griefing/DoS dirigido** (un atacante crea un cobro S/3.50 con un código de 3 dígitos elegido para arrastrar a un tercero).

**Arreglo de raíz:**
1. **Cablear** `yape_revision_resolver` desde un edge autenticado de operador (parte de `panel_ingresos`, ver B5).
2. **Desacoplar el congelamiento:** al abrir revisión por ambigüedad, retener **solo el pago ambiguo**, no congelar cobros inocentes de terceros.
3. Ampliar la identidad de casación (ver A6) para que la ambigüedad sea rara.

---

### A6 — Baja entropía de casación Yape (colisión + griefing) `[MEDIO, sube a ALTO con volumen]`

**Objeto:** clave de casación Yape = código de seguridad de 3 dígitos (0–999) + monto exacto + ventana.

**Problema:** como casi todo es 1 crédito = S/3.50 (monto idéntico), la identidad efectiva es ~1000 valores. Con concurrencia modesta hay colisión por cumpleaños → `yape_revision` → ambos cobros a `en_revision` (ver A5). Y es forzable por un atacante.

**Arreglo de raíz:** aumentar la entropía de casación incorporando el **número de operación** del comprobante y/o el nombre/celular del pagador (`pago_visto_pagador`) como discriminante, o hacer que el cliente teclee el `ARI-XXXX` único del cobro junto al código de seguridad → casación 1:1, ambigüedad rara. (Depende de resolver A1 antes, para que los pagos que caen a `nuevo` no se envenenen.)

**Relacionado (BAJO):** `yape_notificar`/`yape_ingerir` deberían validar que la huella traiga un `opId` no vacío (hoy la huella `monto|codigo|opId|` es única gracias al nº de operación; si el APK dejara `opId` vacío, dos pagos distintos colisionarían y el segundo se descartaría como duplicado). Componer el `txid` del lado servidor con campos verificados.

---

### A7 — Endurecimientos de seguridad (defensa en profundidad) `[MEDIO/BAJO]`

Ningún agujero explotable hoy, pero footguns a cerrar antes de abrir tráfico real:

1. **`[MEDIO]`** `REVOKE ALL ON ALL TABLES IN SCHEMA negocio FROM anon, authenticated` + `ALTER DEFAULT PRIVILEGES ... REVOKE`. Hoy `negocio.parametro` (guarda `binance_pay_id`, `yape_destino`, precios PEN = ruteo de dinero) y 11 tablas más tienen GRANT DML a anon/authenticated. No alcanzable hoy (sin USAGE + RLS deny-all), pero el `_shared/seguridad.ts` **instruye** exponer `negocio` en PostgREST — una sola falla futura desviaría todos los ingresos.
2. **`[MEDIO]`** `REVOKE USAGE ON SCHEMA pago FROM anon, authenticated` + `ALTER DEFAULT PRIVILEGES IN SCHEMA pago REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC`. Hoy `pago` tiene USAGE para anon/authenticated; una función futura sin el `REVOKE` explícito quedaría invocable por cualquiera vía `/rest/v1/rpc`.
3. **`[BAJO]`** `REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA net FROM anon, authenticated, PUBLIC` + reubicar `pg_net` fuera de `public` (footgun SSRF).
4. **`[BAJO]`** usar comparación constante-en-tiempo para `x-vigia-clave` en el edge `pago_conciliar` (hoy usa `!==`; `yape_notificar` ya usa `igual()`).

---

## PARTE B — Seguimiento de ingresos (la feature)

### B1 — Libro único canónico de ingresos `[ALTO]`

**Problema (confirmado):** hoy hay **dos libros que no reconcilian**. Binance/Yape acreditan en `pago.*` (con hash-chain). Pero **MixPay** (`recarga_webhook`, edge **ACTIVE**) acredita solo en `negocio.credito_movimiento`, fuera de `pago.*`. Igual el **panel manual** (`credito_mover_panel`, ACTIVE): 8 movimientos, +194 créditos, invisibles al libro `pago`. Y las **licencias** (`licencia_otorgar`) no dejan movimiento de crédito. Ningún query devuelve "todo lo que entró por todos los métodos". MixPay entra en producción apenas el jefe cargue el `payeeId` → riesgo estructural e inminente.

**Arreglo de raíz:** definir `pago.*` como **libro canónico único**. Encaminar MixPay/manual/licencias a acreditar por el mismo motor: crear `pago.cobro` + `pago.pago_visto` (fuente `mixpay`/`manual`) y una función `pago.acreditar_externo(...)` que inserte `pago.acreditacion` + `pago.evento` con la misma garantía exactly-once por `pago_txid`. Prohibir `credito_mover` directo para ingresos (dejarlo solo para ajustes internos con `tipo` distinto de `recarga`). Registrar licencias y cobros de servicio en el libro.

### B2 — Normalización monetaria `[MEDIO]`

**Problema:** `pago_visto_monto.monto_unidad` (bigint) mezcla escalas: USDT ×1e8 vs PEN ×100. `SUM(monto_unidad)` cross-método da basura de órdenes de magnitud.

**Arreglo de raíz:** registrar la escala/decimales por moneda (tabla `moneda` con factor, o columna `escala`), y que la capa de reporte consuma siempre el monto normalizado a `numeric`, nunca el bigint crudo.

### B3 — Vistas canónicas de ingresos `[ALTO]`

Crear (todo en `pago`, `security definer`/service_role, respetando 6FN y RLS):

- **`pago.v_ingreso`** — un renglón por `txid`: fuente/método, moneda, monto crudo **+ monto normalizado**, estado final derivado de `pago_visto_estado`, `cobro_id`/usuario/código si casó (vía `acreditacion`), `aplicado_en`, y bandera **`necesita_accion`** (huérfano / `sin_codigo` / `monto_distinto` / `revision` / `retenido`). Debe incluir explícitamente los `pago_visto` **sin** acreditación (los huérfanos son justo lo que hay que ver).
- **`pago.v_ingreso_diario`** — total visto vs total acreditado por método/moneda/día, para detectar discrepancias.
- Función `pago.ingresos_reporte(desde, hasta)` que haga los LEFT JOIN `pago_visto ⟕ 8 satélites ⟕ acreditacion ⟕ cobro/...`.

### B4 — Cola de conciliación (huérfanos y no-casados) `[ALTO]`

Unificar en una sola cola visible: `yape_revision` pendientes + cobros `en_revision`/`retenido` + pagos `revision`/`monto_distinto`/`sin_codigo`/huérfanos Yape. Introducir un estado explícito `huerfano` (o `recibido_sin_casar`) distinto de `ignorado`, con evento, para que `yape_barrer` **mueva a la cola, nunca oculte**. (Nota honesta: hoy `yape_barrer`→`ignorado` **no borra nada** — `pago_visto_estado` es append-only y todo es rastreable por SQL y recuperable con `yape_acreditar_par`; el falso positivo del review lo confirmó. El problema real no es pérdida de datos sino **falta de superficie**: por eso esto es feature, no bug de motor. Aun así conviene separar `huerfano` de `ignorado` para el reporte.)

### B5 — Edge `panel_ingresos` (operador) + resolver cableado `[ALTO]`

Edge function `service_role`, autenticada como operador, que:
- Lee `pago.v_ingreso` / `v_ingreso_diario` / la cola de conciliación.
- **Cablea `yape_revision_resolver`** (resolver ambigüedades) y una vía equivalente para `retenido`/revisiones Binance (acreditar al cobro correcto o marcar devolución).
- Permite **atribución manual** de un pago `sin_codigo`/`monto_distinto`/huérfano a un cobro/usuario, acreditando exactly-once vía `acreditacion`.
- Todo cambio de plata deja evento en el hash-chain.

### B6 — Sección "Ingresos / Conciliación" en el panel operador `[MEDIO]`

Frontend (React): nueva sección en el panel del operador que consuma `panel_ingresos`: tablero de ingresos por método/día, cola de pendientes con acciones (resolver/atribuir/devolver), y filtro por estado. (Depende de que el panel operador ya esté en React o de agregarlo al legacy — ver `docs/HANDOFF.md`.)

### B7 — Inmutabilidad + hash del lado `pago_visto`/`acreditacion` `[MEDIO]`

**Problema:** el trigger `evitar_cambio` solo protege `pago.evento`/`evento_hash`. `pago_visto_estado`, `acreditacion`, `reverso`, `cobro_estado` admiten UPDATE/DELETE y **no** entran en el hash → `cadena_integra()` no detectaría una alteración de `acreditacion.delta`.

**Arreglo de raíz:** registrar evento también en el lado del pago visto (ingesta + cada transición de `conciliar`/`barrer`, soportando `p_cobro NULL`); proteger como append-only `pago_visto_estado`, `acreditacion`, `reverso`, `cobro_estado`; e incluir la evidencia de `acreditacion`/`reverso` en el hash-chain (o en un verificador de reconciliación) para que `cadena_integra` detecte descuadres entre bitácora y plata aplicada.

### B8 — Clawback de reversos funcional `[MEDIO]`

**Problema:** `conciliar` detecta refunds pero solo marca `reverso` (no descuenta). `reverso_aplicar` (a) no la llama nadie, (b) busca `acreditacion` por el txid del refund (distinto del original) → devolvería false, (c) para licencia hace `credito_mover(-0)` y no revoca la licencia.

**Arreglo de raíz:** al detectar reverso, resolver el txid **original** y llamar `reverso_aplicar` sobre él; manejar licencia revocando/acortando `fecha_fin`; definir política cuando el saldo ya se gastó (deuda/saldo negativo controlado, no rollback silencioso). Si Binance C2C no admite refunds en la práctica, dejar el `reverso` en revisión manual explícita.

---

## Orden de ejecución y dependencias

1. **A1** (crítico, desbloquea todo Yape) → **A2**, **A4** (ambos tocan `conciliar`/barredor, hacerlos juntos) → **A3** (gracia Yape) → **A6** (entropía) → **A5** (resolver/panel backend).
2. **A7** (seguridad) en paralelo, aislado.
3. **B1 + B2** (libro canónico + escala) antes de las vistas.
4. **B3 + B4** (vistas + cola) → **B5** (edge) → **B6** (frontend).
5. **B7 + B8** (inmutabilidad + clawback) al final, no bloquean el lanzamiento pero cierran la auditoría.
6. **Remediación de datos** de las filas ya atascadas (6 `pen` `ignorado`, 7 `sin_codigo`, 36 recargas fantasma, cobros `retenido` si aparecen) — **solo con confirmación explícita**, una por una.

## Restricciones que el agente DEBE respetar

- Todo cambio de DB **aditivo** y con migración escrita al repo (`supabase/migrations/`), no solo aplicada por MCP. Cada función nueva/modificada: `REVOKE EXECUTE FROM public, anon, authenticated` + `GRANT ... service_role`.
- Probar cada cambio con el patrón **self-rollback** (bloque `DO` que hace RAISE al final para revertir, embebiendo resultados) antes de aplicar de verdad.
- Correr `pnpm test` (126 tests de contrato) tras tocar cualquier cosa del backend.
- Cumplir las **10 reglas** del dueño (100 % escalable, 6FN, 100 % español, seguridad impenetrable, sin plural/infinitivos, funciones claras, nada se borra físicamente/estados, borrado solo tras análisis, buen uso de enums, arquitectura clara).
- **No romper Binance**: `pago_ingerir`/`conciliar`/`vigia` deben seguir acreditando USDT igual (los cambios a `conciliar` son acotar su alcance y mejorar terminales, no cambiar su vía feliz).
- **No desplegar/aplicar nada sin confirmación del dueño.**

## Referencia rápida (evidencia en datos, 2026-09-30)

- 6 `pago_visto` `pen` en `ignorado` sin acreditar (matados por `conciliar` en 25–57 s).
- 7 `pago_visto` USDT en `sin_codigo` (~12.11 USDT) sin resolver.
- 36 `negocio.recarga` en `pendiente` fantasma (100 % de cobros `caducado`) vs 12 `pagado`.
- 24 cobros Binance `caducado` + 8 `confirmado` + 3 `anulado` = blancos vivos para `duplicado`.
- 8 movimientos `recarga panel` (+194 créditos) invisibles al libro `pago`.
- 0 vistas y 0 funciones de reporte en `pago`/`negocio`.
- `recarga_webhook` (MixPay) ACTIVE, a la espera del `payeeId` → divergencia inminente.

---

## ESTADO DE IMPLEMENTACIÓN (actualizado 2026-09-30)

Aplicado a la base `sdarsjdwnuimjruthjwz` (todas las migraciones en `supabase/migrations/`, cada una probada con self-rollback; ninguna rompe la vía feliz de Binance/Yape ni la seguridad):

- ✅ **Lote 1** (`..._pago_lote1_conciliar_solo_binance_y_gracia.sql`) — A1: `conciliar()` solo procesa fuente `pay_c2c` (nunca más marca `ignorado` a pagos Yape). A2: dinero nuevo contra cobro cerrado → `revision` (no `duplicado`); cobro `caducado` con pago correcto se acredita (gracia). A4: `yape_barrer` ya no caduca `retenido`.
- ✅ **Lote 2** (`..._pago_lote2_gracia_casacion_yape.sql`) — A3: gracia de casación Yape contra cobros `caducado`, acotada a `[creado−10min, creado+2h]` (no revive cobros viejos con códigos de 3 dígitos reusados).
- ✅ **Lote 3** (`..._pago_lote3_vistas_ingresos.sql`) — B3: vistas `pago.v_ingreso`, `pago.v_ingreso_diario`, `pago.v_revision_pendiente` (montos normalizados; solo `service_role`).
- ✅ **Lote 4a** (`..._pago_lote4_panel_ingresos_fn.sql`) — B5+A5: `pago.panel_ingresos_resumen(dias)`, `pago.panel_ingreso_atribuir(txid, cobro)`; resolver `pago.yape_revision_resolver` verificado y listo para cablear.
- ✅ **Lote 5** (`..._pago_lote5_inmutabilidad_dinero.sql`) — B7: `acreditacion`, `reverso`, `pago_visto_estado`, `cobro_estado` ahora append-only (rechazan UPDATE/DELETE).
- ✅ **Lote 6** (`..._pago_lote6_seguridad_revokes.sql`) — A7: sin DML de anon/authenticated sobre `negocio.*`; sin USAGE de `pago` para anon/authenticated; sin EXECUTE por defecto a PUBLIC. `service_role` conserva todo.
- ✅ **Lote 7** (`..._pago_lote7_reverso_clawback.sql`) — B8: `pago.reverso_aplicar(txid_original)` correcto: créditos con clawback acotado al saldo (registra deuda, sin rollback); licencia → marca para revisión manual; exactly-once.
- ✅ **Limpieza de datos** — 36 recargas fantasma `pendiente`→`caducado`; 1 recarga sobre cobro anulado `pagado`→`revertido`.

Diferido / de otro dueño:
- **B1** (libro único: rutear MixPay/panel manual/licencias por `pago.*`) — hacer cuando se active MixPay (aún sin `payeeId`).
- **A6** (más entropía en casación Yape) — mejora; la ambigüedad ya es segura y resoluble.
- **A7 extra** (`pg_net` fuera de `public`, comparación constante-en-tiempo de `x-vigia-clave`) — footguns menores, opcionales.

---

## CONTRATO DE BACKEND PARA LA APP DE SEGUIMIENTO (Ari-Tool panel admin — otro agente)

El **seguimiento de ingresos NO se implementa en `miweb`**: lo construye otro agente en la app separada "Ari-Tool panel admin". Ese backend YA está listo en Supabase para que esa app lo consuma. Todo es `service_role`-only (RLS deny-all), así que la app debe hablar por un edge con service_role tras autenticar al dueño.

**Lectura (el libro de ingresos):**
- `pago.panel_ingresos_resumen(p_dias int default 14)` → jsonb `{ totales, diario, pendientes, revisiones }`. Es el resumen listo para pintar el tablero.
- Vistas directas si se necesita más detalle: `pago.v_ingreso` (un renglón por pago, con `necesita_accion`), `pago.v_ingreso_diario` (cuadre visto vs acreditado por método/moneda/día), `pago.v_revision_pendiente` (cola de ambigüedades Yape).

**Acciones (control):**
- `pago.yape_revision_resolver(p_revision uuid, p_cobro uuid, p_txid text)` → resuelve una ambigüedad Yape eligiendo el par cobro↔pago; libera y re-casa los cobros de terceros.
- `pago.panel_ingreso_atribuir(p_txid text, p_cobro uuid)` → atribuye manualmente un pago no casado (sin_codigo / monto_distinto / huérfano) a un cobro, acreditando exactly-once.
- `pago.reverso_aplicar(p_txid_original text)` → aplica una devolución sobre un txid ya acreditado (clawback de créditos acotado; licencia a revisión manual).

**Autenticación:** patrón `exigirDueno` (JWT → rol `dueno`) + cliente `service_role`. Hay una **implementación de referencia lista** (no desplegada) en `miweb/supabase/functions/panel_ingresos/` (`index.ts` + `seguridad.ts`) con las 3 acciones `resumen` / `resolver` / `atribuir`; el otro agente puede desplegarla tal cual o adaptarla a su app. Variables de entorno: `ARIAD_URL`, `ARIAD_SVC`, `ARIAD_ANON_KEY`.
