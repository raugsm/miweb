import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer as createNetServer } from "node:net";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const SWAP_MS = 200;
const onePixelPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

test("phase 5: operator login throttles repeated failed attempts", { timeout: 30_000 }, async () => {
  const server = await startIsolatedServer({ swapMs: SWAP_MS });
  try {
    const jar = new CookieJar();
    const http = createHttpClient(server.baseUrl, jar);
    const email = `phase5-throttle-${Date.now()}@example.com`;
    const password = "Throttle12345!";

    let response = await http.request("POST", "/api/register", {
      name: "Throttle Admin",
      email,
      password,
      workChannel: "WhatsApp 3",
      setupToken: server.setupToken,
    });
    assert.equal(response.status, 201);

    for (let index = 0; index < 5; index += 1) {
      response = await http.request("POST", "/api/login", {
        email,
        password: `wrong-${index}`,
      });
      assert.equal(response.status, 401);
    }

    response = await http.request("POST", "/api/login", {
      email,
      password: "wrong-final",
    });
    assert.equal(response.status, 429);

    const db = JSON.parse(await readFile(path.join(server.dataDir, "users.json"), "utf8"));
    assert.ok(db.audit.some((event) => event.action === "LOGIN_RATE_LIMITED"));
  } finally {
    await server.stop();
  }
});

test("phase 5: technician switch with swap window and auto-revert", { timeout: 30_000 }, async () => {
  const server = await startIsolatedServer({ swapMs: SWAP_MS });
  try {
    const jar = new CookieJar();
    const http = createHttpClient(server.baseUrl, jar);

    let response = await http.request("GET", "/api/health");
    assert.equal(response.status, 200);

    const adminEmail = `phase5-admin-${Date.now()}@example.com`;
    const adminPassword = "Admin12345!";
    response = await http.request("POST", "/api/register", {
      name: "Admin Phase 5",
      email: adminEmail,
      password: adminPassword,
      workChannel: "WhatsApp 3",
      setupToken: server.setupToken,
    });
    assert.equal(response.status, 201);

    response = await http.request("POST", "/api/login", {
      email: adminEmail,
      password: adminPassword,
      operatorPin: server.setupToken,
    });
    assert.equal(response.status, 200);
    const adminUser = response.data.user;

    response = await http.request("PATCH", `/api/users/${adminUser.id}`, {
      technicianRedirectorId: "1000 9983 5478",
    });
    assert.equal(response.status, 200);
    assert.equal(response.data.user.technicianRedirectorId, "1000 9983 5478");

    const jackEmail = `phase5-jack-${Date.now()}@example.com`;
    const jackPassword = "Jack12345!";
    response = await http.request("POST", "/api/register", {
      name: "Jack",
      email: jackEmail,
      password: jackPassword,
      workChannel: "WhatsApp 3",
    });
    assert.equal(response.status, 201);
    const jackId = response.data.user.id;

    response = await http.request("PATCH", `/api/users/${jackId}`, {
      role: "ATENCION_TECNICA",
      active: true,
      technicianRedirectorId: "1000 9983 5478",
    });
    assert.equal(response.status, 200);

    const angeloEmail = `phase5-angelo-${Date.now()}@example.com`;
    const angeloPassword = "Angelo12345!";
    response = await http.request("POST", "/api/register", {
      name: "Angelo",
      email: angeloEmail,
      password: angeloPassword,
      workChannel: "WhatsApp 3",
    });
    assert.equal(response.status, 201);
    const angeloId = response.data.user.id;

    response = await http.request("PATCH", `/api/users/${angeloId}`, {
      role: "ATENCION_TECNICA",
      active: true,
      technicianRedirectorId: "2000 4422 1188",
    });
    assert.equal(response.status, 200);

    const wrongChannelEmail = `phase5-wrong-channel-${Date.now()}@example.com`;
    response = await http.request("POST", "/api/register", {
      name: "Tecnico WhatsApp 1",
      email: wrongChannelEmail,
      password: "Wrong12345!",
      workChannel: "WhatsApp 1",
    });
    assert.equal(response.status, 201);
    const wrongChannelId = response.data.user.id;

    response = await http.request("PATCH", `/api/users/${wrongChannelId}`, {
      role: "ATENCION_TECNICA",
      active: true,
      technicianRedirectorId: "3000 5544 7788",
    });
    assert.equal(response.status, 200);

    response = await http.request("GET", "/api/portal/active-technician");
    assert.equal(response.status, 200);
    assert.equal(response.data.technician.swapInProgress, false);
    assert.equal(response.data.technician.redirectorId, "1000 9983 5478");

    response = await http.request("GET", "/api/operator/technician/status");
    assert.equal(response.status, 200);
    assert.equal(response.data.technician.active.userId, jackId);
    assert.equal(response.data.technician.eligible.length, 2);
    assert.equal(response.data.technician.eligible.some((candidate) => candidate.userId === adminUser.id), false);
    assert.equal(response.data.technician.eligible.some((candidate) => candidate.userId === wrongChannelId), false);
    assert.equal(response.data.technician.eligible.every((candidate) => candidate.role === "ATENCION_TECNICA" && candidate.workChannel === "WhatsApp 3"), true);

    response = await http.request("POST", "/api/operator/technician/switch", {
      targetUserId: angeloId,
    });
    assert.equal(response.status, 200);
    assert.equal(response.data.technician.swap.inProgress, true);

    response = await http.request("GET", "/api/portal/active-technician");
    assert.equal(response.status, 200);
    assert.equal(response.data.technician.swapInProgress, true);
    assert.equal(response.data.technician.redirectorId, null);

    await delay(SWAP_MS + 80);

    response = await http.request("GET", "/api/portal/active-technician");
    assert.equal(response.status, 200);
    assert.equal(response.data.technician.swapInProgress, false);
    assert.equal(response.data.technician.redirectorId, "2000 4422 1188");

    response = await http.request("GET", "/api/operator/technician/status");
    assert.equal(response.data.technician.active.userId, angeloId);

    const revertSeconds = 1.0;
    response = await http.request("POST", "/api/operator/technician/switch", {
      targetUserId: jackId,
      durationMinutes: revertSeconds / 60,
    });
    assert.equal(response.status, 200);
    assert.ok(response.data.technician.autoRevert);
    assert.equal(response.data.technician.autoRevert.toUserId, angeloId);

    await delay(SWAP_MS + 80);
    response = await http.request("GET", "/api/portal/active-technician");
    assert.equal(response.data.technician.redirectorId, "1000 9983 5478");

    await delay(revertSeconds * 1000 + 80);
    response = await http.request("GET", "/api/portal/active-technician");
    assert.equal(response.data.technician.swapInProgress, true);

    await delay(SWAP_MS + 80);
    response = await http.request("GET", "/api/portal/active-technician");
    assert.equal(response.data.technician.swapInProgress, false);
    assert.equal(response.data.technician.redirectorId, "2000 4422 1188");

    response = await http.request("POST", "/api/operator/technician/switch", {
      targetUserId: jackId,
    });
    assert.equal(response.status, 200);

    // Wait for the swap to commit so the next assertion observes a stable active=Jack
    await delay(SWAP_MS + 80);
    response = await http.request("GET", "/api/portal/active-technician");
    assert.equal(response.data.technician.swapInProgress, false);
    assert.equal(response.data.technician.redirectorId, "1000 9983 5478");

    await http.request("POST", "/api/logout");

    response = await http.request("POST", "/api/login", {
      email: angeloEmail,
      password: angeloPassword,
      operatorPin: server.setupToken,
    });
    assert.equal(response.status, 200);

    response = await http.request("POST", "/api/operator/technician/switch", {
      targetUserId: angeloId,
    });
    assert.equal(response.status, 403, "non-active eligible operator must be blocked");
  } finally {
    await server.stop();
  }
});

test("phase 5: specific FRP take rejects stale active technician after switch", { timeout: 30_000 }, async () => {
  const server = await startIsolatedServer({ swapMs: SWAP_MS });
  try {
    const adminHttp = createHttpClient(server.baseUrl, new CookieJar());
    const { jackId, jackEmail, jackPassword, angeloId, angeloEmail, angeloPassword } = await setupTwoFrpTechnicians(adminHttp, server.setupToken);

    let response = await adminHttp.request("GET", "/api/operator/technician/status");
    assert.equal(response.status, 200);
    assert.equal(response.data.technician.active.userId, jackId);

    const readyJob = await createReadyFrpJob(adminHttp);

    const jackHttp = createHttpClient(server.baseUrl, new CookieJar());
    response = await jackHttp.request("POST", "/api/login", {
      email: jackEmail,
      password: jackPassword,
      operatorPin: server.setupToken,
    });
    assert.equal(response.status, 200);

    response = await adminHttp.request("POST", "/api/operator/technician/switch", {
      targetUserId: angeloId,
    });
    assert.equal(response.status, 200);
    assert.equal(response.data.technician.swap.inProgress, true);

    await delay(SWAP_MS + 80);
    response = await adminHttp.request("GET", "/api/operator/technician/status");
    assert.equal(response.status, 200);
    assert.equal(response.data.technician.active.userId, angeloId);

    response = await jackHttp.request("POST", `/api/frp/jobs/${encodeURIComponent(readyJob.id)}/take`);
    assert.equal(response.status, 403);
    assert.match(response.data.error, /tecnico activo/);

    response = await adminHttp.request("GET", "/api/session");
    assert.equal(response.status, 200);
    const stillReady = response.data.frp.jobs.find((job) => job.id === readyJob.id);
    assert.equal(stillReady.status, "LISTO_PARA_TECNICO");
    assert.equal(stillReady.technicianId, "");

    const angeloHttp = createHttpClient(server.baseUrl, new CookieJar());
    response = await angeloHttp.request("POST", "/api/login", {
      email: angeloEmail,
      password: angeloPassword,
      operatorPin: server.setupToken,
    });
    assert.equal(response.status, 200);

    response = await angeloHttp.request("POST", `/api/frp/jobs/${encodeURIComponent(readyJob.id)}/take`);
    assert.equal(response.status, 200);
    assert.equal(response.data.job.status, "EN_PROCESO");
    assert.equal(response.data.job.technicianId, angeloId);
  } finally {
    await server.stop();
  }
});

test("phase 5: FRP owner can finalize after active technician changes", { timeout: 30_000 }, async () => {
  const server = await startIsolatedServer({ swapMs: SWAP_MS });
  try {
    const adminHttp = createHttpClient(server.baseUrl, new CookieJar());
    const { jackId, jackEmail, jackPassword, angeloId } = await setupTwoFrpTechnicians(adminHttp, server.setupToken);

    let response = await adminHttp.request("GET", "/api/operator/technician/status");
    assert.equal(response.status, 200);
    assert.equal(response.data.technician.active.userId, jackId);

    const readyJob = await createReadyFrpJob(adminHttp);

    const jackHttp = createHttpClient(server.baseUrl, new CookieJar());
    response = await jackHttp.request("POST", "/api/login", {
      email: jackEmail,
      password: jackPassword,
      operatorPin: server.setupToken,
    });
    assert.equal(response.status, 200);

    response = await jackHttp.request("POST", `/api/frp/jobs/${encodeURIComponent(readyJob.id)}/take`);
    assert.equal(response.status, 200);
    assert.equal(response.data.job.status, "EN_PROCESO");
    assert.equal(response.data.job.technicianId, jackId);

    response = await adminHttp.request("POST", "/api/operator/technician/switch", {
      targetUserId: angeloId,
    });
    assert.equal(response.status, 200);
    assert.equal(response.data.technician.swap.inProgress, true);

    await delay(SWAP_MS + 80);
    response = await adminHttp.request("GET", "/api/operator/technician/status");
    assert.equal(response.status, 200);
    assert.equal(response.data.technician.active.userId, angeloId);

    response = await jackHttp.request("PATCH", `/api/frp/jobs/${encodeURIComponent(readyJob.id)}/finalize`, {
      finalLog: "Owner finalized after active technician switch",
    });
    assert.equal(response.status, 200);
    assert.equal(response.data.job.status, "FINALIZADO");
    assert.equal(response.data.job.technicianId, jackId);
    assert.ok(response.data.job.doneAt);

    response = await adminHttp.request("GET", "/api/session");
    assert.equal(response.status, 200);
    const finalizedJob = response.data.frp.jobs.find((job) => job.id === readyJob.id);
    assert.equal(finalizedJob.status, "FINALIZADO");
    assert.equal(finalizedJob.technicianId, jackId);
  } finally {
    await server.stop();
  }
});

test("phase 5: FRP owner can request review after active technician changes", { timeout: 30_000 }, async () => {
  const server = await startIsolatedServer({ swapMs: SWAP_MS });
  try {
    const adminHttp = createHttpClient(server.baseUrl, new CookieJar());
    const { readyJob, jackId, jackHttp, angeloHttp } = await setupJackTakenJobThenSwitchToAngelo(server, adminHttp);

    let response = await angeloHttp.request("PATCH", `/api/frp/jobs/${encodeURIComponent(readyJob.id)}/review`, {
      reason: "Angelo should not inherit this job",
    });
    assert.equal(response.status, 403);
    assert.match(response.data.error, /otro tecnico/);

    response = await jackHttp.request("PATCH", `/api/frp/jobs/${encodeURIComponent(readyJob.id)}/review`, {
      reason: "Owner review after active technician switch",
    });
    assert.equal(response.status, 200);
    assert.equal(response.data.job.status, "REQUIERE_REVISION");
    assert.equal(response.data.job.technicianId, jackId);
    assert.equal(response.data.job.reviewReason, "Owner review after active technician switch");

    response = await adminHttp.request("GET", "/api/session");
    assert.equal(response.status, 200);
    const reviewJob = response.data.frp.jobs.find((job) => job.id === readyJob.id);
    assert.equal(reviewJob.status, "REQUIERE_REVISION");
    assert.equal(reviewJob.technicianId, jackId);
  } finally {
    await server.stop();
  }
});

test("phase 5: FRP review resolver follows owner, not active technician", { timeout: 30_000 }, async () => {
  const server = await startIsolatedServer({ swapMs: SWAP_MS });
  try {
    const adminHttp = createHttpClient(server.baseUrl, new CookieJar());
    const { readyJob, jackId, jackHttp, angeloHttp } = await setupJackTakenJobThenSwitchToAngelo(server, adminHttp);

    let response = await jackHttp.request("PATCH", `/api/frp/jobs/${encodeURIComponent(readyJob.id)}/review`, {
      reason: "Owner review before resolver permission test",
    });
    assert.equal(response.status, 200);
    assert.equal(response.data.job.status, "REQUIERE_REVISION");
    assert.equal(response.data.job.technicianId, jackId);

    response = await angeloHttp.request("PATCH", `/api/frp/jobs/${encodeURIComponent(readyJob.id)}/ready`);
    assert.equal(response.status, 403);
    assert.match(response.data.error, /reporto el caso/);

    response = await jackHttp.request("PATCH", `/api/frp/jobs/${encodeURIComponent(readyJob.id)}/ready`);
    assert.equal(response.status, 200);
    assert.equal(response.data.job.status, "LISTO_PARA_TECNICO");
    assert.equal(response.data.job.technicianId, "");
    assert.equal(response.data.job.takenAt, "");

    response = await adminHttp.request("GET", "/api/session");
    assert.equal(response.status, 200);
    const readyAgainJob = response.data.frp.jobs.find((job) => job.id === readyJob.id);
    assert.equal(readyAgainJob.status, "LISTO_PARA_TECNICO");
    assert.equal(readyAgainJob.technicianId, "");
  } finally {
    await server.stop();
  }
});

test("phase 5: elevated roles can resolve another technician review", { timeout: 30_000 }, async () => {
  const server = await startIsolatedServer({ swapMs: SWAP_MS });
  try {
    const adminHttp = createHttpClient(server.baseUrl, new CookieJar());
    const { jackId, jackEmail, jackPassword } = await setupTwoFrpTechnicians(adminHttp, server.setupToken);

    const coordinatorEmail = `phase5-review-coordinator-${Date.now()}@example.com`;
    const coordinatorPassword = "Coord12345!";
    let response = await adminHttp.request("POST", "/api/register", {
      name: "Coordinador Revision",
      email: coordinatorEmail,
      password: coordinatorPassword,
      workChannel: "WhatsApp 3",
    });
    assert.equal(response.status, 201);
    const coordinatorId = response.data.user.id;

    response = await adminHttp.request("PATCH", `/api/users/${coordinatorId}`, {
      role: "COORDINADOR",
      active: true,
      workChannel: "WhatsApp 3",
    });
    assert.equal(response.status, 200);
    assert.equal(response.data.user.role, "COORDINADOR");

    const jackHttp = createHttpClient(server.baseUrl, new CookieJar());
    response = await jackHttp.request("POST", "/api/login", {
      email: jackEmail,
      password: jackPassword,
      operatorPin: server.setupToken,
    });
    assert.equal(response.status, 200);

    const coordinatorHttp = createHttpClient(server.baseUrl, new CookieJar());
    response = await coordinatorHttp.request("POST", "/api/login", {
      email: coordinatorEmail,
      password: coordinatorPassword,
      operatorPin: server.setupToken,
    });
    assert.equal(response.status, 200);

    const coordinatorReviewJob = await createReviewedJobOwnedByJack({ adminHttp, jackHttp, jackId, reason: "Coordinator resolver test" });
    response = await coordinatorHttp.request("PATCH", `/api/frp/jobs/${encodeURIComponent(coordinatorReviewJob.id)}/ready`);
    assert.equal(response.status, 200);
    assert.equal(response.data.job.status, "LISTO_PARA_TECNICO");
    assert.equal(response.data.job.technicianId, "");

    const adminReviewJob = await createReviewedJobOwnedByJack({ adminHttp, jackHttp, jackId, reason: "Admin resolver test" });
    response = await adminHttp.request("PATCH", `/api/frp/jobs/${encodeURIComponent(adminReviewJob.id)}/ready`);
    assert.equal(response.status, 200);
    assert.equal(response.data.job.status, "LISTO_PARA_TECNICO");
    assert.equal(response.data.job.technicianId, "");
  } finally {
    await server.stop();
  }
});

test("phase 5: FRP owner can cancel after active technician changes", { timeout: 30_000 }, async () => {
  const server = await startIsolatedServer({ swapMs: SWAP_MS });
  try {
    const adminHttp = createHttpClient(server.baseUrl, new CookieJar());
    const { readyJob, jackHttp, angeloHttp } = await setupJackTakenJobThenSwitchToAngelo(server, adminHttp);

    let response = await angeloHttp.request("PATCH", `/api/frp/jobs/${encodeURIComponent(readyJob.id)}/cancel`, {
      reason: "timeout",
      note: "Angelo should not inherit this job",
    });
    assert.equal(response.status, 403);
    assert.match(response.data.error, /otro tecnico/);

    response = await jackHttp.request("PATCH", `/api/frp/jobs/${encodeURIComponent(readyJob.id)}/cancel`, {
      reason: "timeout",
      note: "Owner canceled after active technician switch",
    });
    assert.equal(response.status, 200);
    assert.equal(response.data.job.status, "LISTO_PARA_TECNICO");
    assert.equal(response.data.job.technicianId, "");
    assert.equal(response.data.job.cancelReason, "timeout");

    response = await adminHttp.request("GET", "/api/session");
    assert.equal(response.status, 200);
    const canceledJob = response.data.frp.jobs.find((job) => job.id === readyJob.id);
    assert.equal(canceledJob.status, "LISTO_PARA_TECNICO");
    assert.equal(canceledJob.technicianId, "");
    assert.equal(canceledJob.cancelReason, "timeout");
  } finally {
    await server.stop();
  }
});

async function startIsolatedServer({ swapMs }) {
  const dataDir = await mkdtemp(path.join(tmpdir(), "ariadgsm-phase5-"));
  const port = await getAvailablePort();
  const setupToken = `phase5-${Date.now()}`;
  const logs = [];
  const child = spawn(process.execPath, ["server.js"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      ARIAD_DATA_DIR: dataDir,
      ARIAD_SETUP_TOKEN: setupToken,
      ARIAD_TECHNICIAN_SWAP_MS: String(swapMs),
      PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => logs.push(String(chunk)));
  child.stderr.on("data", (chunk) => logs.push(String(chunk)));
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await waitForHealth(baseUrl, child, logs);
  } catch (error) {
    if (!child.killed && child.exitCode === null) child.kill();
    await Promise.race([onceExit(child), delay(2_000)]);
    await rm(dataDir, { recursive: true, force: true });
    throw error;
  }
  return {
    baseUrl,
    dataDir,
    setupToken,
    async stop() {
      if (!child.killed && child.exitCode === null) child.kill();
      await onceExit(child);
      await rm(dataDir, { recursive: true, force: true });
    },
  };
}

async function setupTwoFrpTechnicians(http, setupToken) {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const adminEmail = `phase5-race-admin-${suffix}@example.com`;
  const adminPassword = "Admin12345!";
  let response = await http.request("POST", "/api/register", {
    name: "Admin Race",
    email: adminEmail,
    password: adminPassword,
    workChannel: "WhatsApp 3",
    setupToken,
  });
  assert.equal(response.status, 201);

  response = await http.request("POST", "/api/login", {
    email: adminEmail,
    password: adminPassword,
    operatorPin: setupToken,
  });
  assert.equal(response.status, 200);

  const jackEmail = `phase5-race-jack-${suffix}@example.com`;
  const jackPassword = "Jack12345!";
  response = await http.request("POST", "/api/register", {
    name: "Jack",
    email: jackEmail,
    password: jackPassword,
    workChannel: "WhatsApp 3",
  });
  assert.equal(response.status, 201);
  const jackId = response.data.user.id;

  response = await http.request("PATCH", `/api/users/${jackId}`, {
    role: "ATENCION_TECNICA",
    active: true,
    technicianRedirectorId: "1000 9983 5478",
  });
  assert.equal(response.status, 200);

  const angeloEmail = `phase5-race-angelo-${suffix}@example.com`;
  const angeloPassword = "Angelo12345!";
  response = await http.request("POST", "/api/register", {
    name: "Angelo",
    email: angeloEmail,
    password: angeloPassword,
    workChannel: "WhatsApp 3",
  });
  assert.equal(response.status, 201);
  const angeloId = response.data.user.id;

  response = await http.request("PATCH", `/api/users/${angeloId}`, {
    role: "ATENCION_TECNICA",
    active: true,
    technicianRedirectorId: "2000 4422 1188",
  });
  assert.equal(response.status, 200);

  return { jackId, jackEmail, jackPassword, angeloId, angeloEmail, angeloPassword };
}

async function setupJackTakenJobThenSwitchToAngelo(server, adminHttp) {
  const { jackId, jackEmail, jackPassword, angeloId, angeloEmail, angeloPassword } = await setupTwoFrpTechnicians(adminHttp, server.setupToken);

  let response = await adminHttp.request("GET", "/api/operator/technician/status");
  assert.equal(response.status, 200);
  assert.equal(response.data.technician.active.userId, jackId);

  const readyJob = await createReadyFrpJob(adminHttp);

  const jackHttp = createHttpClient(server.baseUrl, new CookieJar());
  response = await jackHttp.request("POST", "/api/login", {
    email: jackEmail,
    password: jackPassword,
    operatorPin: server.setupToken,
  });
  assert.equal(response.status, 200);

  response = await jackHttp.request("POST", `/api/frp/jobs/${encodeURIComponent(readyJob.id)}/take`);
  assert.equal(response.status, 200);
  assert.equal(response.data.job.status, "EN_PROCESO");
  assert.equal(response.data.job.technicianId, jackId);

  response = await adminHttp.request("POST", "/api/operator/technician/switch", {
    targetUserId: angeloId,
  });
  assert.equal(response.status, 200);
  assert.equal(response.data.technician.swap.inProgress, true);

  await delay(SWAP_MS + 80);
  response = await adminHttp.request("GET", "/api/operator/technician/status");
  assert.equal(response.status, 200);
  assert.equal(response.data.technician.active.userId, angeloId);

  const angeloHttp = createHttpClient(server.baseUrl, new CookieJar());
  response = await angeloHttp.request("POST", "/api/login", {
    email: angeloEmail,
    password: angeloPassword,
    operatorPin: server.setupToken,
  });
  assert.equal(response.status, 200);

  return { readyJob, jackId, jackHttp, angeloHttp };
}

async function createReviewedJobOwnedByJack({ adminHttp, jackHttp, jackId, reason }) {
  const readyJob = await createReadyFrpJob(adminHttp);
  let response = await jackHttp.request("POST", `/api/frp/jobs/${encodeURIComponent(readyJob.id)}/take`);
  assert.equal(response.status, 200);
  assert.equal(response.data.job.status, "EN_PROCESO");
  assert.equal(response.data.job.technicianId, jackId);

  response = await jackHttp.request("PATCH", `/api/frp/jobs/${encodeURIComponent(readyJob.id)}/review`, {
    reason,
  });
  assert.equal(response.status, 200);
  assert.equal(response.data.job.status, "REQUIERE_REVISION");
  assert.equal(response.data.job.technicianId, jackId);
  return response.data.job;
}

async function createReadyFrpJob(http) {
  let response = await http.request("POST", "/api/frp/orders", {
    clientText: `Cliente Race ${Date.now()} Peru`,
    quantity: 1,
    paymentMethod: "PE_YAPE_BRYAMS",
  });
  assert.equal(response.status, 201);
  const order = response.data.order;
  const job = order.jobs[0];

  for (const key of ["priceSent", "connectionDataSent", "authorizationConfirmed"]) {
    response = await http.request("PATCH", `/api/frp/orders/${encodeURIComponent(order.id)}/checklist`, { key, value: true });
    assert.equal(response.status, 200);
  }

  response = await http.request("PATCH", `/api/frp/orders/${encodeURIComponent(order.id)}/payment-proof`, {
    paymentProofs: [proofImage("phase5-race-proof.png", uniqueProofPayload())],
  });
  assert.equal(response.status, 200);

  response = await http.request("PATCH", `/api/frp/orders/${encodeURIComponent(order.id)}/payment-review`, { action: "approve" });
  assert.equal(response.status, 200);

  for (const key of ["clientConnected", "requiredStateConfirmed", "modelSupported"]) {
    response = await http.request("PATCH", `/api/frp/jobs/${encodeURIComponent(job.id)}/checklist`, { key, value: true });
    assert.equal(response.status, 200);
  }

  response = await http.request("PATCH", `/api/frp/jobs/${encodeURIComponent(job.id)}/ready`);
  assert.equal(response.status, 200);
  assert.equal(response.data.job.status, "LISTO_PARA_TECNICO");
  return response.data.job;
}

function proofImage(name, data) {
  return {
    name,
    type: "image/png",
    size: Buffer.from(data, "base64").length,
    dataUrl: `data:image/png;base64,${data}`,
  };
}

function uniqueProofPayload() {
  return Buffer.from(`phase5-proof-${Date.now()}-${Math.random()}`).toString("base64") || onePixelPng;
}

function createHttpClient(baseUrl, jar) {
  return {
    async request(method, pathname, body) {
      const headers = { origin: baseUrl };
      if (body !== undefined) headers["content-type"] = "application/json";
      const cookie = jar.header();
      if (cookie) headers.cookie = cookie;
      const res = await fetch(`${baseUrl}${pathname}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      jar.store(res.headers);
      const ct = res.headers.get("content-type") || "";
      const data = ct.includes("application/json") ? await res.json() : await res.text();
      return { status: res.status, headers: res.headers, data };
    },
  };
}

class CookieJar {
  constructor() {
    this.cookies = new Map();
  }
  store(headers) {
    const setCookies = headers.getSetCookie ? headers.getSetCookie() : headers.raw?.()?.["set-cookie"] || [];
    for (const cookie of setCookies) {
      const [pair] = cookie.split(";");
      const [name, ...rest] = pair.split("=");
      const value = rest.join("=");
      if (name) this.cookies.set(name.trim(), value);
    }
  }
  header() {
    return Array.from(this.cookies.entries()).map(([name, value]) => `${name}=${value}`).join("; ");
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function onceExit(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null) return resolve();
    child.once("exit", () => resolve());
  });
}

function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForHealth(baseUrl, child, logs) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`server exited early: ${logs.join("")}`);
    }
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) return;
    } catch {}
    await delay(100);
  }
  throw new Error("server health timeout");
}
