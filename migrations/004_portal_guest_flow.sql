-- Paso 2.C.1 - Guest portal support.
-- Adds a first-class account type discriminator and guest order tokens.

begin;

set search_path = ariad, public;

alter table customer_clients
  add column if not exists account_type text not null default 'registered';

do $$
begin
  alter table customer_clients
    add constraint customer_clients_account_type_chk
    check (account_type in ('registered', 'guest'))
    not valid;
exception
  when duplicate_object then null;
end $$;

alter table customer_clients
  validate constraint customer_clients_account_type_chk;

create index if not exists customer_clients_account_type_whatsapp_idx
  on customer_clients(account_type, whatsapp);

create table if not exists guest_session_tokens (
  id uuid primary key,
  order_id uuid not null references customer_orders(id) on delete cascade,
  client_id uuid not null references customer_clients(id) on delete cascade,
  token_hash text not null unique,
  token_hint text not null default '',
  scope text not null default 'order',
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null,
  legacy_json jsonb not null default '{}'::jsonb,
  check (scope in ('order'))
);

create index if not exists guest_session_tokens_order_idx
  on guest_session_tokens(order_id);

create index if not exists guest_session_tokens_client_idx
  on guest_session_tokens(client_id);

create index if not exists guest_session_tokens_active_expiry_idx
  on guest_session_tokens(expires_at)
  where revoked_at is null;

commit;
