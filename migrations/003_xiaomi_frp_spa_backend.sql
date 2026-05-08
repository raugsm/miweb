begin;

insert into service_pricing_rules
  (service_code, pricing_mode, base_cost_usdt, margin_usdt, auth_cost_usdt,
   critical_cost_usdt, tool_cost_usdt, server_cost_usdt,
   manual_adjustment_allowed, updated_at, updated_by, legacy_json)
values
  (
    'PORTAL-XIAOMI-FRP',
    'MANUAL',
    4.00,
    0,
    0,
    0,
    0,
    0,
    true,
    now(),
    null,
    jsonb_build_object(
      'serviceCode', 'PORTAL-XIAOMI-FRP',
      'pricingMode', 'MANUAL',
      'baseCostUsdt', 4.00,
      'manualAdjustmentAllowed', true,
      'serverStatus', 'ACTIVE',
      'maintenanceMessage', '',
      'note', 'Xiaomi Reset + FRP SPA fixed operator-configured price.'
    )
  )
on conflict (service_code) do nothing;

create index if not exists customer_orders_xiaomi_frp_status_idx
  on customer_orders(public_status, created_at desc)
  where service_code = 'PORTAL-XIAOMI-FRP';

create index if not exists customer_orders_xiaomi_frp_access_token_hash_idx
  on customer_orders((legacy_json->>'publicAccessTokenHash'))
  where service_code = 'PORTAL-XIAOMI-FRP'
    and legacy_json ? 'publicAccessTokenHash';

create index if not exists frp_jobs_xiaomi_frp_queue_idx
  on frp_jobs(status, created_at asc)
  where service_code = 'XIA-FRP-GOOGLE';

comment on index customer_orders_xiaomi_frp_access_token_hash_idx is
  'Lookup helper for AG-NNNN token-gated customer order URLs. Stores only token hash in legacy_json.';

commit;
