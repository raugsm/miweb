# Handoff: Venta de LICENCIA + CREDITOS desde la web (Ariad)

- **DE:** agente Web/Supabase (backend Ariad_SecurityPlugin, ref `sdarsjdwnuimjruthjwz`)
- **PARA:** agente de AriTool (app de escritorio)
- **REGLA DE ORO compartida:** todo cambio es **ADITIVO**. No borrar/renombrar columnas. Los clientes en version vieja deben seguir funcionando.

## Objetivo
Habilitar desde la web la compra de:
- **Licencia anual:** USD 25, dura 1 ano, se ata a la cuenta y luego a 1 sola PC (lo hace la app).
- **Creditos:** USD 1 = 1 credito; cada proceso completo consume 1 credito SOLO cuando NO hay licencia activa en esa PC.

## Estado real de la base (verificado; misma fuente de verdad para ambos)

Tablas (`negocio.*`):
- `credito_cuenta(usuario_ref uuid, saldo int default 0, actualizado timestamptz)`
- `credito_movimiento(codigo, usuario_ref, tipo text, cantidad int, saldo_despues int, motivo text, referencia text, actor_ref uuid, fecha_registro)`
- `recarga(codigo, usuario_ref, creditos int, monto_usd numeric, coingate_order_id text, token text NOT NULL, estado text default 'pendiente', creado, pagado_en)` -> HOY NO tiene columna para distinguir credito vs licencia.
- `licencia(codigo, folio text NOT NULL, suscripcion_ref uuid NOT NULL, fecha_inicio date, fecha_fin date, estado estado_licencia default 'vigente', fecha_registro)`
- `suscripcion(codigo, usuario_ref uuid, plan_ref uuid NOT NULL, fecha_inicio, fecha_fin, estado estado_registro default 'activo')` -> la licencia cuelga del usuario via aca.
- `licencia_pc(codigo, licencia_ref, pc_ref, fecha_vinculo, fecha_desvinculo, motivo text default 'alta', estado estado_registro default 'activo')`
- `plan`: existe UNA fila -> tipo `taller_ano`, nombre `taller_ano_base`, codigo = `aee727bf-052a-4f43-a56f-691549baf272` (usar ESTE plan_ref para la licencia anual).

Enums:
- `estado_licencia` = { vigente, vencida, suspendida, bloqueada }
- `estado_registro` = { activo, inactivo, archivado, pendiente_baja }

Funcion de creditos (LA que hay que usar para mover saldo):
- `negocio.credito_mover(p_usuario uuid, p_delta int, p_tipo text, p_motivo text, p_referencia text, p_actor uuid) returns int` (suma/resta saldo en credito_cuenta y registra en credito_movimiento en una sola operacion).

Otros:
- Folio observado en licencias reales: formato `ARIAD-{ano_de_fecha_fin}-{6 digitos}`.
- Parametro `credito_por_tramite = 1`.
- Edge functions ya desplegadas y relacionadas: `recarga_crear`, `recarga_webhook`, `pago_cobro_crear`, `pago_cobro_estado`, `pago_conciliar`, `panel_creditos`, `licencia_estado`, `licencia_activar`.

## Diagnostico
- **CREDITOS (Flujo A): YA FUNCIONA.** `credito_mover` acredita idempotente; el pago se confirma por webhook y suma saldo. (Nota: el informe menciona CoinGate, pero el cobro real hoy es MixPay + Binance directo; CoinGate quedo sin uso.)
- **LICENCIA (Flujo B): NO EXISTE todavia.** No hay funcion que cree/renueve licencia, ni forma de marcar una compra como "licencia". Es lo unico que falta construir.

## Lo que va a hacer el agente Web/DB (todo ADITIVO, se prueba antes de dejarlo)
1. **Migracion:** agregar columna `negocio.recarga.producto text` (opcional; filas viejas = credito implicito). Para una licencia: `producto='licencia'`, `creditos=0`.
2. **Funcion nueva `negocio.licencia_otorgar(usuario, meses=12, referencia, actor)`:**
   - Si el usuario YA tiene licencia vigente -> extiende `fecha_fin += 12 meses` (renueva, no duplica).
   - Si no -> crea `suscripcion` (plan taller_ano) + `licencia` (folio `ARIAD-...`, hoy -> hoy+1ano, `vigente`).
   - NO toca `licencia_pc` (eso lo engancha la app).
3. **Funcion nueva `negocio.recarga_acreditar(recarga, actor)`** idempotente (reclama la fila pendiente->pagado; si ya estaba pagada no hace nada): segun `producto` llama a `credito_mover` (credito) o a `licencia_otorgar` (licencia). Un solo punto que el webhook del gateway invoca al confirmar el pago. Idempotencia por order_id.

## Lo que necesito que me confirmes (contrato app <-> DB)
1. **Identidad de la PC:** de donde sale el `pc_ref` que la app pone en `licencia_pc`? hay una tabla `negocio.pc_taller` que la app crea/consulta? el pc_ref se deriva de un hardware id? Pasame el mecanismo exacto.
2. **Enganche `licencia_pc`:** confirmame los valores exactos con los que la app inserta la fila en el 1er uso (motivo='alta', estado='activo', licencia_ref, pc_ref) y si valida algo contra el server o es 100% local.
3. **Validez en esta PC:** con que regla decide la app "esta PC tiene licencia activa"? (para que la web muestre lo mismo). Confirmame que te sirve: `licencia.estado='vigente'` AND `licencia.fecha_fin >= hoy` AND existe `licencia_pc` (estado='activo', sin fecha_desvinculo) para esta `pc_ref`, ligada via `suscripcion.usuario_ref`.
4. **Consumo de credito:** como descuenta la app 1 credito por proceso? llama a `negocio.credito_mover` (con que p_tipo y p_motivo), o pasa por un edge? Quiero que el libro mayor quede consistente con lo que registra la web.
5. **Que lee la app hoy:** que edge functions/tablas usa para licencia y creditos (`licencia_estado`, `licencia_activar`, `panel_creditos`, lectura directa de tablas)? No les voy a cambiar el contrato; decime cuales NO debo tocar.
6. **Renovacion:** la app esta OK con que renovar EXTIENDA `fecha_fin += 12 meses` sobre la MISMA licencia (mismo folio/suscripcion), en vez de crear una licencia nueva?
7. **Limite 1 PC:** el "1 sola PC por licencia" lo fuerza solo la app, o queres que la DB tambien lo garantice (ej. impedir 2 `licencia_pc` 'activo' a la vez para la misma licencia)?
8. **Necesitas que la web/DB exponga algo** (ej. un edge de "estado de licencia y saldo por cuenta") para que la app lo consuma? Si si, decime el shape exacto que esperas.

Con eso cierro el diseno del lado web/DB sin romper nada de la app.
