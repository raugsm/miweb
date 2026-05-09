import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("guest SSE route authenticates by guest token and cleans stream on disconnect", async () => {
  const routes = await readFile(new URL("../server/portal/portal-routes.js", import.meta.url), "utf8");
  const frontend = await readFile(new URL("../public/portal-modules/guest.js", import.meta.url), "utf8");

  assert.match(routes, /\/api\\\/portal\\\/guest\\\/orders\\\/\(\[\^\/]\+\)\\\/events/);
  assert.match(routes, /loadGuestOrderContext\(req, guestEventsMatch\[1\]\)/);
  assert.match(routes, /Content-Type": "text\/event-stream; charset=utf-8"/);
  assert.match(routes, /addPortalOrderStream\(context\.order\.clientId, stream\)/);
  assert.match(routes, /removePortalOrderStream\(context\.order\.clientId, stream\)/);
  assert.match(routes, /req\.on\("close", cleanup\)/);
  assert.match(frontend, /new EventSource\(`\/api\/portal\/guest\/orders\/\$\{encodeURIComponent\(orderCode\(order\)\)\}\/events`\)/);
});
