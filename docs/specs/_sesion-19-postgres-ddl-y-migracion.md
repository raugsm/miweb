# Sesion 19 - PostgreSQL DDL inicial y mapa de migracion

Fecha: 2026-05-05

Estado: propuesta tecnica antes de codigo.

Depende de:

- `docs/specs/_sesion-19-arquitectura-postgres-monolito-modular.md`
- `docs/specs/_sesion-19-incidente-produccion-login-verificacion.md`

## Decision

El primer DDL debe cubrir todo el runtime actual, no solo el bug de login.

Esto incluye:

- identidad operador;
- portal cliente;
- validacion Gmail;
- catalogo y pricing;
- ordenes cliente;
- pagos y comprobantes;
- FRP operador;
- tickets/servicios internos legacy;
- cierre diario;
- auditoria;
- counters;
- metadata de migracion.

## Criterios externos usados

- PostgreSQL transactions: https://www.postgresql.org/docs/current/tutorial-transactions.html
- PostgreSQL constraints: https://www.postgresql.org/docs/current/ddl-constraints.html
- PostgreSQL JSON/JSONB: https://www.postgresql.org/docs/current/datatype-json.html
- PostgreSQL indexes: https://www.postgresql.org/docs/current/indexes.html
- Render PostgreSQL: https://render.com/docs/postgresql
- Render PostgreSQL backups: https://render.com/docs/postgresql-backups
- OWASP Database Security: https://cheatsheetseries.owasp.org/cheatsheets/Database_Security_Cheat_Sheet.html
- OWASP Logging: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html

## Hechos del codigo real revisado

- `server.js:291` crea `users.json` con multiples colecciones.
- `server.js:336` lee todo el JSON con `JSON.parse`.
- `server.js:440` escribe todo el JSON completo.
- `server.js:2454` crea tokens Gmail en `customerEmailVerificationTokens`.
- `server/portal/portal-routes.js:189` valida Gmail leyendo y escribiendo la DB completa.
- `server/portal/portal-routes.js:229` crea cliente, usuario cliente, beneficio, sesion y token Gmail.
- `server/portal/portal-routes.js:544` crea orden cliente FRP, request, items, comprobantes y orden FRP vinculada.
- `server.js:3016` crea orden FRP interna a partir de una orden portal.
- `server/frp/frp-routes.js:480` crea orden FRP manual desde operador.
- `server/frp/frp-routes.js:650` valida/rechaza comprobante FRP.
- `server/core/audit.js` guarda auditoria como array limitado a 2000 eventos.

## Colecciones actuales y destino

| Coleccion JSON | Tabla destino | Modulo |
|---|---|---|
| `users` | `operator_users` | Identity |
| `sessions` | `operator_sessions` | Identity |
| `devices` | `operator_devices`, `operator_device_admin_users` | Identity |
| `deviceApprovals` | `operator_device_approvals` | Identity |
| `passwordResetTokens` | `password_reset_tokens` | Identity |
| `passwordResetRequests` | `password_reset_requests` | Identity |
| `customerClients` | `customer_clients` | Customer |
| `customerUsers` | `customer_users` | Customer |
| `customerSessions` | `customer_sessions` | Customer |
| `customerDevices` | `customer_devices`, `customer_device_authorizations` | Customer |
| `customerRequests` | `customer_requests` | Orders |
| `customerOrders` | `customer_orders` | Orders |
| `customerOrderItems` | `customer_order_items` | Orders |
| `customerBenefits` | `customer_benefits` | Customer |
| `customerEmailVerificationTokens` | `customer_email_verification_tokens` | EmailVerification |
| `customerCounters` | `sequence_counters` | Core |
| `masterClients` | `master_clients` | Customer |
| `clientLinks` | `client_links` | Customer |
| `clientLinkSuggestions` | `client_link_suggestions` | Customer |
| `clients` | `internal_clients` | InternalClients |
| `tickets` | `service_tickets` | ServiceTickets |
| `ticketCounters` | `sequence_counters` | Core |
| `frpOrders` | `frp_orders` | FrpOps |
| `frpJobs` | `frp_jobs` | FrpOps |
| `frpCounters` | `sequence_counters` | Core |
| `frpProviderCostHistory` | `frp_provider_cost_history` | CatalogPricing |
| `frpPendingCostChanges` | `frp_pending_cost_changes` | CatalogPricing |
| `pricingConfig.exchangeRates` | `exchange_rates` | CatalogPricing |
| `pricingConfig.serviceRules` | `service_pricing_rules` | CatalogPricing |
| `pricingConfig.frpPricing.policy` | `frp_pricing_policy` | CatalogPricing |
| `pricingConfig.frpPricing.providers` | `frp_pricing_providers` | CatalogPricing |
| `pricingConfig.paymentMethodOverrides` | `payment_method_overrides` | CatalogPricing |
| `paymentLedgerEntries` | `payment_ledger_entries` | Payments |
| `dailyCloses` | `daily_closes` | Payments |
| `dailyCloseLines` | `daily_close_lines` | Payments |
| `dailyAdjustments` | `daily_adjustments` | Payments |
| `portalRateLimits` | `portal_rate_limits` | Security |
| `audit` | `audit_events` | Audit |
| `activeTechnician` | `active_technician_state` | FrpOps |

## Principios DDL

- Mantener los UUID existentes durante migracion.
- Usar `uuid` para IDs.
- Usar `timestamptz` para fechas.
- Usar `numeric` para dinero, nunca `float`.
- Usar `text + CHECK` para estados iniciales. No usar `ENUM` todavia porque los estados siguen cambiando.
- Usar `jsonb` solo para snapshots, metadata y preservacion temporal de legacy, no como sustituto de tablas.
- Guardar tokens solo como hash.
- Separar archivos/comprobantes en metadata. El binario/base64 legacy queda marcado como puente temporal.
- Cada tabla critica tiene `created_at`, `updated_at` cuando aplica.
- Cada importacion guarda conteos y hash del archivo fuente.

## DDL v0 propuesto

Este DDL es inicial. Antes de implementarlo se debe convertir en migraciones versionadas.

```sql
create schema if not exists ariad;
set search_path = ariad, public;

create table if not exists migration_runs (
  id uuid primary key,
  source_name text not null,
  source_sha256 text not null,
  started_at timestamptz not null,
  finished_at timestamptz,
  status text not null check (status in ('STARTED', 'COMPLETED', 'FAILED')),
  collection_counts jsonb not null default '{}'::jsonb,
  notes text not null default ''
);

create table if not exists sequence_counters (
  scope text not null,
  bucket text not null,
  counter_key text not null,
  counter_value integer not null default 0,
  updated_at timestamptz,
  primary key (scope, bucket, counter_key)
);
```

### Identity

```sql
create table operator_users (
  id uuid primary key,
  name text not null,
  email text not null unique,
  password_hash text not null,
  role text not null check (role in ('ADMIN', 'COORDINADOR', 'ATENCION_TECNICA', 'PENDIENTE')),
  work_channel text not null default '',
  permissions jsonb not null default '{}'::jsonb,
  operator_pin_hash text,
  technician_redirector_id text not null default '',
  active boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  legacy_json jsonb not null default '{}'::jsonb
);

create table operator_devices (
  id uuid primary key,
  token_hash text not null unique,
  user_agent text not null default '',
  first_ip_hash text not null default '',
  trust_version integer,
  trusted_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null,
  legacy_json jsonb not null default '{}'::jsonb
);

create table operator_device_admin_users (
  device_id uuid not null references operator_devices(id) on delete cascade,
  user_id uuid not null references operator_users(id) on delete cascade,
  created_at timestamptz not null,
  primary key (device_id, user_id)
);

create table operator_device_approvals (
  id uuid primary key,
  admin_user_id uuid not null references operator_users(id) on delete cascade,
  device_id uuid not null references operator_devices(id) on delete cascade,
  user_agent text not null default '',
  ip_hash text not null default '',
  created_at timestamptz not null,
  expires_at timestamptz not null,
  approved_at timestamptz,
  legacy_json jsonb not null default '{}'::jsonb
);

create table operator_sessions (
  id uuid primary key,
  user_id uuid not null references operator_users(id) on delete cascade,
  token_hash text not null unique,
  device_id uuid references operator_devices(id) on delete set null,
  version integer not null,
  last_seen_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null,
  legacy_json jsonb not null default '{}'::jsonb
);

create index operator_sessions_user_id_idx on operator_sessions(user_id);
create index operator_sessions_expires_at_idx on operator_sessions(expires_at);

create table password_reset_tokens (
  id uuid primary key,
  user_id uuid not null references operator_users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  legacy_json jsonb not null default '{}'::jsonb
);

create table password_reset_requests (
  id uuid primary key,
  email_hash text not null default '',
  ip_hash text not null default '',
  created_at timestamptz not null,
  legacy_json jsonb not null default '{}'::jsonb
);
```

### Customer e Internal Clients

```sql
create table master_clients (
  id uuid primary key,
  display_name text not null default '',
  primary_whatsapp text not null default '',
  country text not null default '',
  primary_email text not null default '',
  status text not null check (status in ('ACTIVO', 'PENDIENTE_VERIFICACION', 'BLOQUEADO', 'MERGED')),
  source text not null default '',
  merged_into_master_client_id uuid references master_clients(id),
  merged_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  legacy_json jsonb not null default '{}'::jsonb
);

create table customer_clients (
  id uuid primary key,
  master_client_id uuid references master_clients(id) on delete set null,
  name text not null,
  whatsapp text not null default '',
  country text not null default '',
  whatsapp_country_iso text not null default '',
  whatsapp_detected_country text not null default '',
  status text not null check (status in ('REGISTRADO_NO_VERIFICADO', 'EMAIL_VERIFICADO', 'REGISTRADO', 'VERIFICADO', 'VIP', 'EMPRESA', 'BLOQUEADO')),
  primary_email text not null default '',
  email_verified_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  legacy_json jsonb not null default '{}'::jsonb
);

create index customer_clients_master_idx on customer_clients(master_client_id);
create index customer_clients_primary_email_idx on customer_clients(primary_email);

create table customer_users (
  id uuid primary key,
  client_id uuid not null references customer_clients(id) on delete cascade,
  name text not null,
  email text not null unique,
  password_hash text not null,
  role text not null default 'OWNER',
  active boolean not null default true,
  email_verified_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  legacy_json jsonb not null default '{}'::jsonb
);

create table internal_clients (
  id uuid primary key,
  master_client_id uuid references master_clients(id) on delete set null,
  name text not null,
  whatsapp text not null default '',
  country text not null default '',
  work_channel text not null default '',
  created_by uuid references operator_users(id) on delete set null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  legacy_json jsonb not null default '{}'::jsonb
);

create table client_links (
  id uuid primary key,
  master_client_id uuid not null references master_clients(id) on delete cascade,
  source_type text not null check (source_type in ('INTERNAL_CLIENT', 'PORTAL_CLIENT')),
  source_id uuid not null,
  confidence text not null default '',
  signals jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  unlinked_at timestamptz,
  unlinked_by uuid,
  created_by uuid,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  legacy_json jsonb not null default '{}'::jsonb
);

create index client_links_source_idx on client_links(source_type, source_id);
create index client_links_master_idx on client_links(master_client_id);

create table client_link_suggestions (
  id uuid primary key,
  source_type text not null check (source_type in ('INTERNAL_CLIENT', 'PORTAL_CLIENT')),
  source_id uuid not null,
  candidate_master_client_id uuid references master_clients(id) on delete cascade,
  status text not null check (status in ('PENDING', 'REJECTED', 'BLOCKED', 'LINKED')),
  reason text not null default '',
  signals jsonb not null default '{}'::jsonb,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_reason text not null default '',
  created_at timestamptz not null,
  updated_at timestamptz not null,
  legacy_json jsonb not null default '{}'::jsonb
);

create table customer_benefits (
  id uuid primary key,
  client_id uuid references customer_clients(id) on delete cascade,
  master_client_id uuid references master_clients(id) on delete cascade,
  quantity_discount_enabled boolean not null default true,
  monthly_discount_enabled boolean not null default true,
  goal_discount_enabled boolean not null default false,
  vip_unit_margin numeric(12,2) not null default 0,
  monthly_goal integer not null default 0,
  device_required boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  legacy_json jsonb not null default '{}'::jsonb,
  check (client_id is not null or master_client_id is not null)
);
```

### Customer Sessions, Devices y Gmail

```sql
create table customer_devices (
  id uuid primary key,
  token_hash text not null unique,
  user_agent text not null default '',
  first_ip_hash text not null default '',
  last_seen_at timestamptz,
  created_at timestamptz not null,
  legacy_json jsonb not null default '{}'::jsonb
);

create table customer_device_authorizations (
  device_id uuid not null references customer_devices(id) on delete cascade,
  client_id uuid not null references customer_clients(id) on delete cascade,
  authorized_at timestamptz not null,
  primary key (device_id, client_id)
);

create table customer_sessions (
  id uuid primary key,
  user_id uuid not null references customer_users(id) on delete cascade,
  client_id uuid not null references customer_clients(id) on delete cascade,
  token_hash text not null unique,
  device_id uuid references customer_devices(id) on delete set null,
  version integer not null,
  last_seen_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null,
  legacy_json jsonb not null default '{}'::jsonb
);

create index customer_sessions_client_idx on customer_sessions(client_id);
create index customer_sessions_expires_at_idx on customer_sessions(expires_at);

create table customer_email_verification_tokens (
  id uuid primary key,
  user_id uuid not null references customer_users(id) on delete cascade,
  client_id uuid not null references customer_clients(id) on delete cascade,
  email text not null,
  token_hash text not null unique,
  reason text not null default '',
  created_at timestamptz not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  legacy_json jsonb not null default '{}'::jsonb
);

create index customer_email_tokens_user_idx on customer_email_verification_tokens(user_id);
create index customer_email_tokens_expires_idx on customer_email_verification_tokens(expires_at);
```

### CatalogPricing

```sql
create table exchange_rates (
  rate_key text primary key,
  country text not null,
  currency text not null,
  rate_per_usdt numeric(18,6) not null default 0,
  updated_at timestamptz,
  updated_by uuid references operator_users(id) on delete set null,
  legacy_json jsonb not null default '{}'::jsonb
);

create table service_pricing_rules (
  service_code text primary key,
  pricing_mode text not null,
  base_cost_usdt numeric(12,2) not null default 0,
  margin_usdt numeric(12,2) not null default 0,
  auth_cost_usdt numeric(12,2) not null default 0,
  critical_cost_usdt numeric(12,2) not null default 0,
  tool_cost_usdt numeric(12,2) not null default 0,
  server_cost_usdt numeric(12,2) not null default 0,
  manual_adjustment_allowed boolean not null default false,
  updated_at timestamptz,
  updated_by uuid references operator_users(id) on delete set null,
  legacy_json jsonb not null default '{}'::jsonb
);

create table payment_method_overrides (
  code text primary key,
  active boolean not null default true,
  custom_message text not null default '',
  updated_at timestamptz,
  updated_by uuid references operator_users(id) on delete set null,
  legacy_json jsonb not null default '{}'::jsonb
);

create table frp_pricing_policy (
  id text primary key default 'current',
  target_margin_usdt numeric(12,2) not null default 1,
  max_worker_cost_change_pct numeric(7,2) not null default 30,
  min_margin_usdt numeric(12,2) not null default 0,
  min_sell_price_usdt numeric(12,2) not null default 0,
  updated_at timestamptz,
  updated_by uuid references operator_users(id) on delete set null,
  check (id = 'current')
);

create table frp_pricing_providers (
  id text primary key,
  name text not null,
  status text not null check (status in ('ACTIVE', 'BACKUP', 'OFF', 'ARCHIVED')),
  cost_mode text not null check (cost_mode in ('FIXED_USDT', 'CREDITS')),
  fixed_cost_usdt numeric(12,2) not null default 0,
  credits_per_process numeric(12,2) not null default 0,
  credit_unit_cost_usdt numeric(12,2) not null default 0,
  priority integer not null default 99,
  reason text not null default '',
  updated_at timestamptz,
  updated_by uuid references operator_users(id) on delete set null,
  legacy_json jsonb not null default '{}'::jsonb
);

create table frp_provider_cost_history (
  id uuid primary key,
  provider_id text not null references frp_pricing_providers(id),
  cost_usdt numeric(12,2) not null,
  recorded_at timestamptz not null,
  recorded_by uuid references operator_users(id) on delete set null,
  reason text not null default '',
  legacy_json jsonb not null default '{}'::jsonb
);

create table frp_pending_cost_changes (
  id uuid primary key,
  provider_id text not null references frp_pricing_providers(id),
  from_cost_usdt numeric(12,2) not null,
  to_cost_usdt numeric(12,2) not null,
  level integer not null,
  reason text not null default '',
  status text not null check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  created_by uuid references operator_users(id) on delete set null,
  created_at timestamptz not null,
  reviewed_by uuid references operator_users(id) on delete set null,
  reviewed_at timestamptz,
  legacy_json jsonb not null default '{}'::jsonb
);
```

### Orders, ServiceTickets, Payments y Storage

```sql
create table customer_requests (
  id uuid primary key,
  client_id uuid not null references customer_clients(id) on delete cascade,
  master_client_id uuid references master_clients(id) on delete set null,
  user_id uuid references customer_users(id) on delete set null,
  service_code text not null,
  service_name text not null,
  channel text not null default '',
  status text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  legacy_json jsonb not null default '{}'::jsonb
);

create table customer_orders (
  id uuid primary key,
  code text not null unique,
  request_id uuid references customer_requests(id) on delete set null,
  client_id uuid not null references customer_clients(id) on delete cascade,
  master_client_id uuid references master_clients(id) on delete set null,
  user_id uuid references customer_users(id) on delete set null,
  service_code text not null,
  internal_service_code text not null default '',
  service_name text not null,
  work_channel text not null default '',
  quantity integer not null default 1,
  unit_price_usdt numeric(12,2) not null default 0,
  total_price_usdt numeric(12,2) not null default 0,
  price_formatted text not null default '',
  pricing_snapshot jsonb not null default '{}'::jsonb,
  payment_method text not null default '',
  payment_label text not null default '',
  public_status text not null,
  compatibility_review_required boolean not null default false,
  frp_order_id uuid,
  internal_client_id uuid references internal_clients(id) on delete set null,
  customer_connection_ready_at timestamptz,
  debt_amount_usdt numeric(12,2) not null default 0,
  debt_cleared_at timestamptz,
  note text not null default '',
  created_at timestamptz not null,
  updated_at timestamptz not null,
  legacy_json jsonb not null default '{}'::jsonb
);

create index customer_orders_client_idx on customer_orders(client_id, created_at desc);
create index customer_orders_status_idx on customer_orders(public_status);

create table customer_order_items (
  id uuid primary key,
  request_id uuid references customer_requests(id) on delete set null,
  order_id uuid not null references customer_orders(id) on delete cascade,
  client_id uuid not null references customer_clients(id) on delete cascade,
  master_client_id uuid references master_clients(id) on delete set null,
  sequence integer not null,
  original_text text not null default '',
  model text not null default '',
  imei text not null default '',
  status text not null,
  eligibility_status text not null default '',
  eligibility_detected_match text not null default '',
  eligibility_matched_alias text not null default '',
  eligibility_internal_reason text not null default '',
  eligibility_public_message text not null default '',
  frp_order_id uuid,
  frp_job_id uuid,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  legacy_json jsonb not null default '{}'::jsonb
);

create table service_tickets (
  id uuid primary key,
  code text not null unique,
  client_id uuid references internal_clients(id) on delete set null,
  master_client_id uuid references master_clients(id) on delete set null,
  client_name text not null default '',
  country text not null default '',
  service_code text not null,
  service_name text not null,
  work_channel text not null default '',
  price_usdt numeric(12,2) not null default 0,
  payment_method text not null default '',
  payment_status text not null default '',
  operational_status text not null default '',
  created_by uuid references operator_users(id) on delete set null,
  last_handled_by uuid references operator_users(id) on delete set null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  legacy_json jsonb not null default '{}'::jsonb
);

create table stored_files (
  id uuid primary key,
  owner_type text not null,
  owner_id uuid not null,
  purpose text not null,
  name text not null default '',
  content_type text not null default '',
  size_bytes integer not null default 0,
  sha256 text not null,
  storage_kind text not null check (storage_kind in ('legacy_inline', 'local_disk', 'object_storage')),
  storage_key text not null default '',
  legacy_data_url text,
  created_at timestamptz not null,
  legacy_json jsonb not null default '{}'::jsonb
);

create unique index stored_files_sha256_idx on stored_files(sha256);

create table payment_proofs (
  id uuid primary key,
  source_type text not null check (source_type in ('CUSTOMER_ORDER', 'FRP_ORDER', 'SERVICE_TICKET')),
  source_id uuid not null,
  stored_file_id uuid references stored_files(id) on delete set null,
  review_status text not null default 'PENDIENTE',
  uploaded_by uuid,
  uploaded_at timestamptz,
  reviewed_by uuid,
  reviewed_at timestamptz,
  rejected_reason text not null default '',
  legacy_json jsonb not null default '{}'::jsonb
);

create index payment_proofs_source_idx on payment_proofs(source_type, source_id);
```

### FrpOps

```sql
create table frp_orders (
  id uuid primary key,
  code text not null unique,
  client_id uuid references internal_clients(id) on delete set null,
  master_client_id uuid references master_clients(id) on delete set null,
  client_name text not null default '',
  client_whatsapp text not null default '',
  country text not null default '',
  service_code text not null,
  service_name text not null,
  work_channel text not null default '',
  quantity integer not null default 1,
  unit_price_usdt numeric(12,2) not null default 0,
  total_price_usdt numeric(12,2) not null default 0,
  price_formatted text not null default '',
  pricing_snapshot jsonb not null default '{}'::jsonb,
  payment_method text not null default '',
  payment_label text not null default '',
  payment_status text not null default '',
  order_status text not null default '',
  checklist jsonb not null default '{}'::jsonb,
  payment_reviewed_by uuid references operator_users(id) on delete set null,
  payment_reviewed_at timestamptz,
  payment_rejected_reason text not null default '',
  created_by text not null default '',
  portal_order_id uuid,
  compatibility_review_required boolean not null default false,
  source text not null default '',
  created_at timestamptz not null,
  updated_at timestamptz not null,
  legacy_json jsonb not null default '{}'::jsonb
);

alter table customer_orders
  add constraint customer_orders_frp_order_fk
  foreign key (frp_order_id) references frp_orders(id) on delete set null;

create table frp_jobs (
  id uuid primary key,
  code text not null unique,
  order_id uuid not null references frp_orders(id) on delete cascade,
  sequence integer not null,
  total_jobs integer not null default 1,
  work_channel text not null default '',
  service_code text not null,
  service_name text not null,
  client_name text not null default '',
  country text not null default '',
  model text not null default '',
  imei text not null default '',
  original_text text not null default '',
  eligibility_status text not null default '',
  eligibility_detected_match text not null default '',
  eligibility_matched_alias text not null default '',
  eligibility_internal_reason text not null default '',
  eligibility_public_message text not null default '',
  status text not null,
  checklist jsonb not null default '{}'::jsonb,
  technician_id uuid references operator_users(id) on delete set null,
  portal_order_item_id uuid,
  final_log text not null default '',
  ard_code text not null default '',
  review_reason text not null default '',
  done_at timestamptz,
  canceled_at timestamptz,
  canceled_by uuid references operator_users(id) on delete set null,
  cancel_reason text not null default '',
  created_at timestamptz not null,
  updated_at timestamptz not null,
  legacy_json jsonb not null default '{}'::jsonb
);

alter table customer_order_items
  add constraint customer_order_items_frp_order_fk
  foreign key (frp_order_id) references frp_orders(id) on delete set null;

alter table customer_order_items
  add constraint customer_order_items_frp_job_fk
  foreign key (frp_job_id) references frp_jobs(id) on delete set null;

create table frp_job_files (
  job_id uuid not null references frp_jobs(id) on delete cascade,
  stored_file_id uuid not null references stored_files(id) on delete cascade,
  purpose text not null default 'final_image',
  created_at timestamptz not null,
  primary key (job_id, stored_file_id)
);

create table active_technician_state (
  id text primary key default 'current',
  user_id uuid references operator_users(id) on delete set null,
  swap_in_progress boolean not null default false,
  swap_from_user_id uuid references operator_users(id) on delete set null,
  swap_to_user_id uuid references operator_users(id) on delete set null,
  swap_started_at timestamptz,
  swap_commits_at timestamptz,
  auto_revert_to_user_id uuid references operator_users(id) on delete set null,
  auto_revert_at timestamptz,
  updated_at timestamptz,
  legacy_json jsonb not null default '{}'::jsonb,
  check (id = 'current')
);
```

### Payments, cierre diario y auditoria

```sql
create table payment_ledger_entries (
  id uuid primary key,
  entry_type text not null,
  source_type text not null,
  source_id uuid not null,
  source_code text not null default '',
  client_id uuid,
  master_client_id uuid references master_clients(id) on delete set null,
  client_name text not null default '',
  country text not null default '',
  service_code text not null default '',
  service_name text not null default '',
  work_channel text not null default '',
  quantity integer not null default 1,
  amount numeric(12,2) not null default 0,
  currency text not null default 'USDT',
  payment_method text not null default '',
  payment_label text not null default '',
  exchange_rate_to_usdt numeric(18,6) not null default 1,
  exchange_rate_date text not null default '',
  amount_usdt_estimate numeric(12,2) not null default 0,
  status text not null check (status in ('VALIDATED', 'VOIDED')),
  validated_by uuid references operator_users(id) on delete set null,
  validated_at timestamptz,
  proof_count integer not null default 0,
  voided_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  legacy_json jsonb not null default '{}'::jsonb,
  unique (source_type, source_id, entry_type)
);

create table daily_closes (
  id uuid primary key,
  date_stamp text not null unique,
  status text not null check (status in ('ABIERTO', 'CERRADO')),
  opened_at timestamptz,
  closed_at timestamptz,
  closed_by uuid references operator_users(id) on delete set null,
  reopened_at timestamptz,
  reopened_by uuid references operator_users(id) on delete set null,
  reopen_reason text not null default '',
  notes text not null default '',
  totals jsonb not null default '{}'::jsonb,
  created_at timestamptz not null,
  updated_at timestamptz,
  legacy_json jsonb not null default '{}'::jsonb
);

create table daily_close_lines (
  id uuid primary key,
  daily_close_id uuid not null references daily_closes(id) on delete cascade,
  date_stamp text not null,
  type text not null,
  currency text not null default '',
  payment_method text not null default '',
  work_channel text not null default '',
  service_code text not null default '',
  gross_amount numeric(12,2) not null default 0,
  refund_amount numeric(12,2) not null default 0,
  adjustment_amount numeric(12,2) not null default 0,
  net_amount numeric(12,2) not null default 0,
  payment_count integer not null default 0,
  equipment_count integer not null default 0,
  created_at timestamptz not null,
  legacy_json jsonb not null default '{}'::jsonb
);

create table daily_adjustments (
  id uuid primary key,
  date_stamp text not null,
  type text not null,
  status text not null default 'ACTIVE',
  amount numeric(12,2) not null default 0,
  currency text not null default '',
  payment_method text not null default '',
  work_channel text not null default '',
  service_code text not null default '',
  reason text not null default '',
  created_by uuid references operator_users(id) on delete set null,
  approved_by uuid references operator_users(id) on delete set null,
  created_at timestamptz not null,
  updated_at timestamptz,
  legacy_json jsonb not null default '{}'::jsonb
);

create table portal_rate_limits (
  id uuid primary key,
  bucket text not null,
  ip_hash text not null default '',
  key_hash text not null default '',
  created_at timestamptz not null,
  legacy_json jsonb not null default '{}'::jsonb
);

create index portal_rate_limits_bucket_created_idx on portal_rate_limits(bucket, created_at);
create index portal_rate_limits_key_idx on portal_rate_limits(key_hash);
create index portal_rate_limits_ip_idx on portal_rate_limits(ip_hash);

create table audit_events (
  id uuid primary key,
  actor_id uuid,
  action text not null,
  target_id text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null,
  legacy_json jsonb not null default '{}'::jsonb
);

create index audit_events_created_idx on audit_events(created_at desc);
create index audit_events_action_idx on audit_events(action);
create index audit_events_target_idx on audit_events(target_id);
```

## Mapa de migracion

### Reglas generales

- Si una fecha viene como `""`, migrar a `NULL`.
- Si una fecha viene como epoch ms (`expiresAt`, `createdAtMs`), convertir con `to_timestamp(ms / 1000.0)`.
- Mantener el ID original si existe.
- Si falta ID en una entrada legacy, crear UUID nuevo y guardar el objeto completo en `legacy_json`.
- Guardar cada objeto original completo en `legacy_json` durante la primera migracion.
- No migrar tokens crudos porque el JSON actual guarda hashes.
- No imprimir `passwordHash`, `operatorPinHash`, `tokenHash`, `email`, `whatsapp` ni comprobantes completos en reportes.

### Orden de importacion

1. `migration_runs`.
2. `operator_users`.
3. `operator_devices` y `operator_device_admin_users`.
4. `operator_sessions`, `operator_device_approvals`, `password_reset_tokens`, `password_reset_requests`.
5. `master_clients`.
6. `customer_clients`, `customer_users`, `internal_clients`.
7. `client_links`, `client_link_suggestions`, `customer_benefits`.
8. `customer_devices`, `customer_device_authorizations`, `customer_sessions`.
9. `customer_email_verification_tokens`.
10. `exchange_rates`, `service_pricing_rules`, `payment_method_overrides`, `frp_pricing_policy`, `frp_pricing_providers`.
11. `frp_provider_cost_history`, `frp_pending_cost_changes`.
12. `customer_requests`.
13. `customer_orders`.
14. `frp_orders`.
15. `customer_order_items`.
16. `frp_jobs`.
17. `stored_files` y `payment_proofs`.
18. `service_tickets`.
19. `payment_ledger_entries`.
20. `daily_closes`, `daily_close_lines`, `daily_adjustments`.
21. `portal_rate_limits`.
22. `active_technician_state`.
23. `sequence_counters`.
24. `audit_events`.

### Puntos delicados

- `customer_orders.frp_order_id` y `frp_orders.portal_order_id` se referencian entre si. Se inserta primero `customer_orders` con `frp_order_id` null, luego `frp_orders`, luego se actualiza FK.
- `customer_order_items.frp_job_id` se actualiza despues de insertar `frp_jobs`.
- `paymentProofs` existe embebido en `customerOrders`, `frpOrders` y `tickets`. Debe convertirse a `stored_files` + `payment_proofs`.
- `finalImages` de `frpJobs` debe convertirse a `stored_files` + `frp_job_files`.
- `devices.adminUserIds` y `customerDevices.authorizedClientIds` son arrays. Deben convertirse a tablas puente.
- `audit` hoy tiene limite de 2000 eventos. En Postgres no se debe truncar como regla normal.
- `pricingConfig` mezcla defaults de codigo con overrides persistidos. La migracion debe importar lo persistido y dejar que el codigo siga aplicando defaults donde falten filas.

## Validaciones del script de migracion

El script debe producir un reporte sin secretos:

```json
{
  "sourceSha256": "...",
  "collections": {
    "users": 0,
    "customerClients": 0,
    "customerUsers": 0,
    "customerOrders": 0,
    "customerOrderItems": 0,
    "frpOrders": 0,
    "frpJobs": 0,
    "tickets": 0,
    "audit": 0
  },
  "tables": {
    "operator_users": 0,
    "customer_clients": 0,
    "customer_users": 0,
    "customer_orders": 0,
    "customer_order_items": 0,
    "frp_orders": 0,
    "frp_jobs": 0,
    "service_tickets": 0,
    "audit_events": 0
  },
  "warnings": []
}
```

Validaciones obligatorias:

- `customerUsers.length == customer_users`.
- `customerClients.length == customer_clients`.
- `customerOrders.length == customer_orders`.
- `customerOrderItems.length == customer_order_items`.
- `frpOrders.length == frp_orders`.
- `frpJobs.length == frp_jobs`.
- `tickets.length == service_tickets`.
- No hay emails duplicados en `customer_users`.
- No hay emails duplicados en `operator_users`.
- Todo `customer_order_items.order_id` existe.
- Todo `frp_jobs.order_id` existe.
- Todo token Gmail migrado conserva `used_at` y `expires_at`.
- Todo comprobante con `hash` conserva `sha256`.
- El reporte no contiene tokens ni passwords.

## Pruebas de aceptacion de esta etapa

Esta etapa se considera lista para implementacion solo si:

- Bryam aprueba este mapa.
- Se crea un archivo de migracion SQL versionado.
- Se crea un script dry-run que no toca produccion.
- El dry-run corre contra una copia local o staging de `users.json`.
- El reporte de dry-run no expone secretos.
- Se documenta rollback antes del primer cutover.

## Avance ejecutado 2026-05-05

Archivos creados:

- `migrations/001_initial_postgres.sql`
- `scripts/migration/users-json-to-postgres.mjs`
- `docs/specs/_sesion-19-migracion-postgres-dry-run.md`

Correccion aplicada al pasar de spec a SQL:

- `createdBy` no siempre es UUID en el codigo actual. Puede ser `"portal"` o `"system"`.
- Para no perder origen ni romper migracion, el SQL agrega campos actor texto donde aplica:
  - `internal_clients.created_by_actor`
  - `client_links.created_by_actor`
  - `client_links.unlinked_by_actor`

Validacion local:

- `node --check scripts\migration\users-json-to-postgres.mjs` OK.
- Dry-run contra `data/users.json` OK.
- Dry-run estricto OK.
- Reporte sanitizado sin `passwordHash`, `operatorPinHash`, `tokenHash`, `dataUrl`, `base64` ni `legacy_data_url`.
- Resultado detallado en `docs/specs/_sesion-19-migracion-postgres-dry-run.md`.

## Siguiente paso recomendado

Crear los archivos reales de migracion y script dry-run:

- `migrations/001_initial_postgres.sql`
- `scripts/migration/users-json-to-postgres.mjs`
- `docs/specs/_sesion-19-migracion-postgres-dry-run.md`

Completado localmente. El siguiente paso ahora es ejecutar el dry-run contra una copia respaldada del `users.json` real de Render.

No tocar todavia `server.js`, rutas HTTP ni frontend.

## Ajuste 2026-05-06: actores legacy en enlaces

Hecho detectado en Render:

- `client_links.created_by`, `client_links.unlinked_by` y `client_link_suggestions.reviewed_by` pueden contener IDs de operadores que ya no existen en `operator_users`.
- El importador inicial bloqueaba esos casos como `droppedMissingReference`.

Decision:

- No relajar FK.
- No crear operadores falsos.
- Preservar el actor legacy en columnas texto cuando no haya fila de operador.

DDL agregado:

- `migrations/002_preserve_client_link_suggestion_actor.sql`

Campo agregado:

- `client_link_suggestions.reviewed_by_actor text not null default ''`

Importador:

- si el actor existe en `operator_users`, se guarda FK;
- si no existe, se guarda `null` en FK y el valor original en `*_actor`;
- el dry-run debe volver a `warnings: []` antes de aplicar import.
