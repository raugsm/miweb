import assert from "node:assert/strict";
import test from "node:test";

import { destructiveRuntimeWriteDiff } from "../server/db/postgres-storage.js";

test("Postgres runtime guard allows empty planned data only when current data is empty", () => {
  assert.deepEqual(
    destructiveRuntimeWriteDiff(
      { operator_users: 0, customer_users: 0, customer_orders: 0 },
      { operator_users: 0, customer_users: 0, customer_orders: 0 },
    ),
    [],
  );
});

test("Postgres runtime guard blocks critical non-empty tables from being replaced with zero rows", () => {
  const diffs = destructiveRuntimeWriteDiff(
    {
      operator_users: 5,
      customer_users: 18,
      customer_orders: 13,
      frp_orders: 13,
      audit_events: 833,
    },
    {
      operator_users: 0,
      customer_users: 0,
      customer_orders: 0,
      frp_orders: 0,
      audit_events: 2,
    },
  );

  assert.deepEqual(
    diffs.map((entry) => entry.table),
    ["operator_users", "customer_users", "customer_orders", "frp_orders"],
  );
});

test("Postgres runtime guard allows volatile cleanup when critical data remains present", () => {
  assert.deepEqual(
    destructiveRuntimeWriteDiff(
      {
        operator_users: 5,
        customer_users: 18,
        customer_sessions: 23,
        portal_rate_limits: 2,
      },
      {
        operator_users: 5,
        customer_users: 18,
        customer_sessions: 0,
        portal_rate_limits: 0,
      },
    ),
    [],
  );
});
