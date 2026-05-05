# Sesion 19 - Arquitectura raiz: PostgreSQL + monolito modular

Fecha: 2026-05-05

Estado: propuesta de arquitectura para aprobacion antes de codigo.

## Decision principal

AriadGSM debe dejar de usar `users.json` como base de datos runtime.

La solucion raiz aprobable es:

- PostgreSQL como fuente de verdad transaccional.
- Monolito modular, no microservicios todavia.
- Modulos internos con tablas propias, contratos claros y pruebas por dominio.
- `users.json` queda solo como evidencia historica, backup o entrada de migracion.

## No objetivos

- No hacer otro parche sobre `writeDb()` como solucion final.
- No partir el producto en microservicios ahora.
- No cambiar UI por esta decision.
- No migrar a ciegas datos reales sin backup, conteos y validacion.
- No guardar tokens, passwords, connection strings ni secretos en logs.

## Hechos del sistema actual

- `server.js` contiene `readDb()` y `writeDb()` sobre un solo `users.json`.
- `server/portal/portal-routes.js` usa esa DB para catalogo, sesion, login, verificacion Gmail, ordenes y pagos.
- `server/frp/frp-routes.js` tambien usa la misma DB para flujo operador FRP.
- `render.yaml` monta un persistent disk en `/opt/render/project/src/storage`.
- Produccion ya esta en uso real y el incidente del 2026-05-05 afecto login y verificacion Gmail.
- El `HANDOFF.md` viejo todavia contiene una premisa desactualizada: "web local, sin clientes reales". Esa premisa ya no debe guiar decisiones de arquitectura.

## Criterios externos usados

- Martin Fowler recomienda monolito primero o monolito modular para descubrir limites antes de microservicios: https://martinfowler.com/bliki/MonolithFirst.html
- Martin Fowler define bounded context como forma de dividir modelos grandes en contextos explicitos: https://martinfowler.com/bliki/BoundedContext.html
- PostgreSQL provee transacciones: https://www.postgresql.org/docs/current/tutorial-transactions.html
- PostgreSQL permite constraints, primary keys, unique keys y foreign keys para integridad: https://www.postgresql.org/docs/current/ddl-constraints.html
- Render ofrece Postgres administrado, read replicas, alta disponibilidad y pooling: https://render.com/docs/postgresql
- Render ofrece backups y point-in-time recovery en planes pagos: https://render.com/docs/postgresql-backups
- OWASP recomienda no exponer detalles internos de errores al usuario: https://owasp.org/www-community/Improper_Error_Handling
- OWASP recomienda logging de seguridad y excluir tokens, passwords, connection strings y secretos de logs: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
- OWASP recomienda cuentas DB con permisos minimos y ambientes separados: https://cheatsheetseries.owasp.org/cheatsheets/Database_Security_Cheat_Sheet.html

## Hechos, inferencias, riesgos y supuestos

### Hechos

- AriadGSM ya mezcla clientes, usuarios, sesiones, dispositivos, tokens Gmail, ordenes, pagos, FRP, pricing y auditoria en un archivo JSON.
- Un solo archivo no da transacciones, constraints, bloqueo por fila, indices ni recovery fino.
- Los clientes reales ya dependen de login, pagos y validacion de correo.

### Inferencias

- La caida del login fue un sintoma de una falla de persistencia, no un bug aislado de UI.
- Si AriadGSM crece con multiples servicios y muchos clientes, el modelo JSON va a volver a fallar por concurrencia, volumen, recovery o integridad.
- Separar por modulos internos ahora reduce el re-trabajo futuro sin meter complejidad distribuida prematura.

### Riesgos

- Migrar todo de golpe sin fases puede dejar produccion inestable.
- Disenar una DB pobre solo mueve el problema desde JSON a SQL.
- Microservicios ahora multiplicarian fallos operativos antes de tener observabilidad madura.
- Si se permite que cualquier modulo escriba cualquier tabla, el monolito modular se convierte en monolito mezclado otra vez.
- Si se guardan comprobantes pesados como base64 dentro de tablas principales, la DB puede crecer mal y complicar backups.

### Supuestos debiles

- Aun no se ha inspeccionado el `users.json` real de produccion.
- No se ha definido el plan final de storage para PDFs, imagenes y comprobantes.
- No se conoce todavia el volumen real diario de clientes, ordenes, comprobantes y auditoria en produccion.
- No se ha confirmado el plan Render Postgres exacto a contratar.

## Arquitectura objetivo

Un solo deploy Node.js por ahora.

Dentro del repo, separar el dominio en modulos:

| Modulo | Responsabilidad | No debe hacer |
|---|---|---|
| Identity | usuarios operador, roles, login, sesiones operador | manejar pedidos o pagos |
| Customer | clientes, usuarios cliente, estado comercial, dispositivos | validar pagos directamente |
| EmailVerification | tokens Gmail, reenvios, vencimiento, un solo uso | depender de carga de sesion para validar token |
| CatalogPricing | servicios, metodos de pago, tasas, pricing FRP | escribir ordenes |
| Orders | ordenes cliente, items, estados, transiciones | guardar archivos binarios pesados |
| Payments | comprobantes, revision, deuda, recibos | cambiar identidad de cliente |
| FrpOps | trabajos FRP, tecnico activo, toma/cancelacion/finalizacion | autenticar usuarios |
| Audit | eventos append-only de seguridad y negocio | guardar secretos o tokens crudos |
| Storage | metadata de archivos y adapter futuro a R2/S3 | ser fuente de verdad del estado de una orden |

Regla: cada modulo expone funciones de caso de uso. Las rutas HTTP no deberian mutar tablas directamente.

## Modelo inicial de tablas

Esta lista es conceptual. El DDL exacto se define en la siguiente etapa.

### Identity

- `operator_users`
- `operator_sessions`
- `operator_devices`
- `operator_device_approvals`
- `password_reset_tokens`
- `password_reset_requests`

### Customer

- `customer_clients`
- `customer_users`
- `customer_sessions`
- `customer_devices`
- `customer_device_authorizations`
- `master_clients`
- `client_links`
- `client_link_suggestions`

### EmailVerification

- `customer_email_verification_tokens`

Reglas:

- guardar solo `token_hash`;
- `used_at` nullable;
- `expires_at` obligatorio;
- indice por `token_hash`;
- transaccion: buscar token valido, marcar usado, marcar email verificado y escribir audit en una sola operacion.

### CatalogPricing

- `payment_methods`
- `payment_method_accounts`
- `exchange_rates`
- `frp_pricing_config`
- `frp_provider_cost_history`
- `frp_pending_cost_changes`
- `customer_benefits`

### Orders

- `customer_orders`
- `customer_order_items`
- `order_status_events`
- `order_counters`

### Payments

- `payment_proofs`
- `payment_reviews`
- `payment_ledger_entries`
- `daily_closes`
- `daily_close_lines`
- `daily_adjustments`

### FrpOps

- `frp_jobs`
- `frp_job_logs`
- `frp_counters`
- `active_technician_state`

### Audit

- `audit_events`

Reglas:

- append-only desde la aplicacion;
- `actor_type`, `actor_id`, `action`, `target_type`, `target_id`, `metadata_json`, `created_at`;
- no tokens crudos, no passwords, no connection strings, no datos completos de pago.

### Storage

- `stored_files`

Reglas:

- metadata en Postgres;
- archivo real en object storage cuando se active R2/S3;
- durante migracion se puede usar `storage_kind='legacy_inline'` solo como puente temporal, no como destino permanente.

## Decisiones de modelado

- IDs: `uuid`.
- Fechas: `timestamptz`.
- Dinero: `numeric(12,2)` o precision especifica por moneda, no `float`.
- Estados: `text` con `CHECK` constraints al inicio. Evita friccion de migraciones con `ENUM` mientras el dominio todavia cambia.
- Emails: normalizados a minuscula y con indice unique donde aplique.
- Tokens: siempre hash, nunca valor crudo.
- Passwords: solo hash existente o migrado; nunca texto plano.
- Archivos: no meter base64 en tablas centrales.
- Auditoria: no se borra como parte de flujos normales.

## Contratos internos obligatorios

Cada modulo debe tener:

- repositorio de datos propio;
- funciones de caso de uso;
- errores tipados;
- tests de transaccion;
- eventos de auditoria;
- no acceso directo desde otro modulo a sus tablas salvo por contrato.

Ejemplos:

- `EmailVerification.verifyCustomerEmail(token, context)`
- `Payments.reviewProof(orderId, action, reviewerId, reason)`
- `Orders.createFrpOrderFromPaymentDraft(input, context)`
- `FrpOps.notifyConnected(orderId, customerId, deviceId)`

## Plan de migracion

### Fase 0 - Evidencia y backup

- Congelar deploys.
- Respaldar `users.json` real.
- Validar si el JSON parsea.
- Registrar conteos por coleccion.
- No imprimir secretos ni tokens.

### Fase 1 - Provisionar Postgres

- Crear Render Postgres.
- Definir `DATABASE_URL` como secreto.
- Crear usuario app con permisos minimos.
- Crear usuario migracion separado.
- Configurar backups/recovery segun plan disponible.

### Fase 2 - Schema y migracion dry-run

- Crear migraciones SQL.
- Crear script `users.json -> Postgres`.
- Ejecutar contra DB local o staging.
- Comparar conteos.
- Validar constraints.
- Validar muestras de clientes, ordenes, pagos y auditoria.

### Fase 3 - Capa DB en codigo

- Crear adapter Postgres.
- Cambiar rutas por modulos, no por accesos directos.
- Mantener `users.json` solo como fallback de lectura en desarrollo si se aprueba explicitamente.
- Prohibir nuevas escrituras runtime a `users.json`.

### Fase 4 - Cutover produccion

- Ventana corta de mantenimiento o modo solo lectura.
- Backup final de `users.json`.
- Migracion final.
- Deploy con Postgres activo.
- Smoke test login, Gmail, catalogo, orden, pago, operador.
- Monitorear errores y auditoria.

### Fase 5 - Desactivar JSON

- Quitar rutas runtime dependientes de `readDb()`/`writeDb()`.
- Conservar backup versionado.
- Documentar estado final.

## Rollback

Antes de aceptar escrituras nuevas en Postgres:

- se puede volver al `users.json` respaldado.

Despues de aceptar escrituras nuevas en Postgres:

- el rollback principal es Postgres recovery/backup;
- no se debe volver a JSON sin exportar/reconciliar datos nuevos;
- si falla el deploy, se corrige codigo sobre Postgres o se restaura DB a punto anterior.

## Seguridad minima integrada

- Errores internos: respuesta generica al cliente, detalle solo en logs internos.
- Logs: sin tokens, passwords, connection strings, secretos ni comprobantes completos.
- DB users: app con permisos minimos; migracion/admin separados.
- Ambientes: produccion y staging separados.
- Backups: recovery probado antes de depender de produccion.
- Tokens Gmail: hash, vencimiento, un solo uso, auditoria.
- Sesiones: hash de token, expiracion, versionado.
- Archivos: metadata separada; object storage para binarios cuando se active.
- Rate limits: persistidos en DB o storage dedicado, no memoria volatil si afectan seguridad.

## Pruebas de aceptacion

- `npm.cmd test`
- `node --check server.js`
- `node --check public/app.js`
- `node --check public/portal.js`
- tests de migracion:
  - conteos JSON vs Postgres;
  - emails unicos;
  - tokens sin valor crudo;
  - ordenes con items;
  - pagos con comprobantes;
  - auditoria preservada.
- tests de concurrencia:
  - logins paralelos;
  - validaciones Gmail paralelas;
  - subida/revision de comprobantes paralela;
  - tecnico activo y notify-connected.
- tests de seguridad:
  - error DB no expone stack ni mensaje interno al cliente;
  - logs no contienen tokens ni passwords;
  - usuario app no puede ejecutar operaciones fuera de su rol.
- smoke visual:
  - cliente login;
  - link Gmail;
  - crear orden;
  - subir comprobante;
  - operador valida;
  - cliente ve estado.

## Archivos que probablemente se tocaran cuando se apruebe implementar

- `package.json`
- `package-lock.json`
- `server.js`
- `server/portal/portal-routes.js`
- `server/frp/frp-routes.js`
- `server/config/*`
- `server/core/*`
- nueva carpeta `server/db/`
- nueva carpeta `server/modules/`
- nueva carpeta `migrations/`
- nueva carpeta `scripts/migration/`
- `test/*`
- `render.yaml` o documentacion de env vars Render
- docs de sesion y handoff

## Decision recomendada

Aceptar PostgreSQL + monolito modular como raiz.

No implementar microservicios ahora.

No volver a invertir tiempo en hacer robusto el JSON salvo como rescate temporal de datos.

El siguiente paso despues de aprobar esta spec es escribir el DDL inicial y el mapa de migracion `users.json -> tablas`, sin tocar todavia las rutas de produccion.
