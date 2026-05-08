# Xiaomi FRP SPA - Stage A Backend Closure Notes

Scope: backend only for Xiaomi Reset + FRP SPA on `raugsm/miweb`.
This note does not change the hardened Cloud Sync security layer.

## Migration 003 audit

File: `migrations/003_xiaomi_frp_spa_backend.sql`

Audit result:

- Transactional: the migration is wrapped in `begin` / `commit`.
- Schema safe: the migration sets `set local search_path = ariad, public`, matching migrations `001` and `002`.
- Compatibility with `001_initial_postgres.sql`:
  - `service_pricing_rules.service_code` already exists as the conflict target.
  - `customer_orders.public_status`, `customer_orders.created_at`, `customer_orders.service_code`, and `customer_orders.legacy_json` exist.
  - `frp_jobs.status`, `frp_jobs.created_at`, and `frp_jobs.service_code` exist.
- Compatibility with `002_preserve_client_link_suggestion_actor.sql`: no overlap with actor columns changed by 002.
- Foreign keys: no new FK is introduced. `updated_by` is inserted as `null`, so it does not depend on an operator user.
- Constraints:
  - The pricing rule insert uses `on conflict (service_code) do nothing`; it will not overwrite an existing manual configuration.
  - The partial indexes are additive and idempotent with `if not exists`.
- Indexes:
  - `customer_orders_xiaomi_frp_status_idx` supports operator queue/status lookups for `PORTAL-XIAOMI-FRP`.
  - `customer_orders_xiaomi_frp_access_token_hash_idx` supports token-gated public URLs without storing the raw token.
  - `frp_jobs_xiaomi_frp_queue_idx` supports technician queue scans for `XIA-FRP-GOOGLE`.

Potential risks:

- If `PORTAL-XIAOMI-FRP` was manually inserted before this migration, the seed row is skipped. That is intentional, but Bryams should verify the existing row has `pricing_mode='MANUAL'` and a sane `base_cost_usdt`.
- `frp_jobs_xiaomi_frp_queue_idx` is intentionally keyed to the internal service `XIA-FRP-GOOGLE`; it can include legacy FRP jobs for the same service. This is not a data risk, only a selectivity tradeoff.
- The token-hash index uses `legacy_json->>'publicAccessTokenHash'`. This is acceptable for the current legacy-runtime bridge, but a future normalized column would be cleaner if order volume grows substantially.

## Render migration procedure

Preferred path: run from Render Shell for service `ariadgsm-ops`, because `DATABASE_URL` is already injected by Render and does not need to be copied to a local terminal.

Steps:

1. Push and deploy the commit that contains `migrations/003_xiaomi_frp_spa_backend.sql`.
2. Open Render Dashboard > `ariadgsm-ops` > Shell.
3. Confirm the expected commit is running:

   ```bash
   node -e "console.log(process.env.RENDER_GIT_COMMIT || process.env.RENDER_COMMIT || '')"
   ```

4. Dry-run pending migrations:

   ```bash
   npm run postgres:migrate
   ```

   Expected: `003_xiaomi_frp_spa_backend.sql` appears as pending.

5. Apply migrations:

   ```bash
   npm run postgres:migrate:apply
   ```

6. Verify migration registry:

   ```bash
   node - <<'NODE'
   import { withPostgresClient } from './server/db/postgres.js';
   await withPostgresClient(async (client) => {
     const result = await client.query(`
       select version, applied_at
       from ariad.schema_migrations
       where version = '003_xiaomi_frp_spa_backend.sql'
     `);
     console.log(JSON.stringify(result.rows, null, 2));
   });
   NODE
   ```

7. Verify the seed rule and indexes:

   ```bash
   node - <<'NODE'
   import { withPostgresClient } from './server/db/postgres.js';
   await withPostgresClient(async (client) => {
     const rule = await client.query(`
       select service_code, pricing_mode, base_cost_usdt, manual_adjustment_allowed
       from ariad.service_pricing_rules
       where service_code = 'PORTAL-XIAOMI-FRP'
     `);
     const indexes = await client.query(`
       select indexname
       from pg_indexes
       where schemaname = 'ariad'
         and indexname in (
           'customer_orders_xiaomi_frp_status_idx',
           'customer_orders_xiaomi_frp_access_token_hash_idx',
           'frp_jobs_xiaomi_frp_queue_idx'
         )
       order by indexname
     `);
     console.log(JSON.stringify({ rule: rule.rows, indexes: indexes.rows }, null, 2));
   });
   NODE
   ```

Expected success:

- `schema_migrations` contains `003_xiaomi_frp_spa_backend.sql`.
- `service_pricing_rules` contains one row for `PORTAL-XIAOMI-FRP`.
- The three expected index names are present.

Rollback:

- If `npm run postgres:migrate:apply` fails before commit, PostgreSQL rolls back the transaction and no manual rollback should be needed.
- If the migration applied but must be reversed before live traffic:

  ```sql
  begin;
  set local search_path = ariad, public;

  drop index if exists frp_jobs_xiaomi_frp_queue_idx;
  drop index if exists customer_orders_xiaomi_frp_access_token_hash_idx;
  drop index if exists customer_orders_xiaomi_frp_status_idx;

  delete from service_pricing_rules
  where service_code = 'PORTAL-XIAOMI-FRP'
    and not exists (
      select 1
      from customer_orders
      where service_code = 'PORTAL-XIAOMI-FRP'
    );

  delete from schema_migrations
  where version = '003_xiaomi_frp_spa_backend.sql';

  commit;
  ```

- If there are already `PORTAL-XIAOMI-FRP` orders, do not delete the pricing rule without an explicit product decision. Dropping the indexes is safe; deleting live pricing config is not.

## Payment method QR storage

QR upload now uses this contract:

- Operator upload still uses `PATCH /api/xiaomi-frp/operator/payment-methods/:code`.
- Runtime response exposes only QR metadata:
  - `name`
  - `type`
  - `size`
  - `sha256`
  - `url`
  - `updatedAt`
- Public retrieval uses `GET /api/xiaomi-frp/payment-methods/:code/qr`.
- In Postgres legacy runtime, the QR payload is planned into `stored_files`:
  - `owner_type='PAYMENT_METHOD_QR'`
  - `purpose='payment_method_qr'`
  - `legacy_data_url=<inline image payload>`
- `payment_method_overrides.legacy_json` keeps only metadata and does not store `dataUrl`.

Privacy/security notes:

- The QR endpoint returns only the configured image bytes for an active non-PayPal method.
- It does not expose order data, tokens, cookies, HMAC signatures, or operator session details.
- The hardened Cloud Sync endpoints were not modified.
