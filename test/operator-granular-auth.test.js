import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const serverSource = readFileSync(new URL("../server.js", import.meta.url), "utf8");

function sliceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `missing start marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

test("operator getCurrentUser uses granular lookup before legacy readDb when flag is enabled", () => {
  const block = sliceBetween(serverSource, "async function getCurrentUser(req)", "async function getCurrentCustomerContext(req)");
  const granularIndex = block.indexOf("useGranularOperatorAuth()");
  const lookupIndex = block.indexOf("operatorSessionLookup");
  const legacyReadIndex = block.indexOf("const db = await readDb()");

  assert.ok(granularIndex > 0);
  assert.ok(lookupIndex > granularIndex);
  assert.ok(legacyReadIndex > lookupIndex);
});

test("operator granular login branch does not call legacy readDb or writeDb", () => {
  const routeBlock = sliceBetween(
    serverSource,
    'if (req.method === "POST" && pathname === "/api/login")',
    'if (req.method === "POST" && pathname === "/api/password-reset/request")',
  );
  const granularBranch = sliceBetween(routeBlock, "if (useGranularOperatorAuth())", "const db = await readDb();");

  assert.match(granularBranch, /operatorLoginAttempt/);
  assert.doesNotMatch(granularBranch, /writeDb\s*\(/);
  assert.doesNotMatch(granularBranch, /readDb\s*\(/);
});

test("operator granular logout deletes session directly and avoids legacy writeDb", () => {
  const block = sliceBetween(
    serverSource,
    'if (req.method === "POST" && pathname === "/api/logout")',
    "const db = await readDb();",
  );

  assert.match(block, /useGranularOperatorAuth\(\)/);
  assert.match(block, /operatorSessionDelete/);
  assert.doesNotMatch(block, /writeDb\s*\(/);
});
