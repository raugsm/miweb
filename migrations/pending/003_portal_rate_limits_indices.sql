create index if not exists portal_rate_limits_bucket_ip_created_idx
  on ariad.portal_rate_limits(bucket, ip_hash, created_at desc);

create index if not exists portal_rate_limits_bucket_key_created_idx
  on ariad.portal_rate_limits(bucket, key_hash, created_at desc);
