import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function waitForServer(baseUrl) {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error("server did not start");
}

test("public landing exposes campaign tracking and records ad events", async () => {
  const port = await freePort();
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "ariadgsm-public-campaign-"));
  const child = spawn(process.execPath, ["server.js"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      ARIAD_DATA_DIR: dataDir,
      ARIAD_STORAGE_DRIVER: "json",
      SUPABASE_ANON_KEY: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let exited = false;
  child.once("exit", () => {
    exited = true;
  });

  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    await waitForServer(baseUrl);

    const landing = await fetch(`${baseUrl}/?src=meta_xiaomi_app&utm_campaign=meta_xiaomi_app`);
    assert.equal(landing.status, 200);
    const html = await landing.text();
    assert.match(html, /AriadGSM Cliente para Windows/);
    assert.match(html, /campaign-tracking\.js/);
    assert.match(html, /data-track-event="download_click"/);
    assert.match(html, /data-track-event="manual_click"/);
    assert.match(html, /data-whatsapp-link/);

    const script = await fetch(`${baseUrl}/campaign-tracking.js`);
    assert.equal(script.status, 200);
    const scriptBody = await script.text();
    assert.match(scriptBody, /campaign-event|landing_view/i);
    assert.match(scriptBody, /hasCampaignContext/);
    assert.match(scriptBody, /decorateCampaignLinks/);
    assert.match(scriptBody, /motorola_f4_page/);

    const manual = await fetch(`${baseUrl}/manual?utm_campaign=meta_xiaomi_app`);
    assert.equal(manual.status, 200);
    const manualHtml = await manual.text();
    assert.match(manualHtml, /campaign-tracking\.js/);
    assert.match(manualHtml, /data-track-event="download_click"/);
    assert.match(manualHtml, /data-whatsapp-link/);

    const motorola = await fetch(`${baseUrl}/servicios/motorola-f4?utm_campaign=meta_motorola_f4`);
    assert.equal(motorola.status, 200);
    const motorolaHtml = await motorola.text();
    assert.match(motorolaHtml, /Motorola F4 modelos soportados/);
    assert.match(motorolaHtml, /campaign-tracking\.js/);
    assert.match(motorolaHtml, /data-track-event="whatsapp_click"/);
    assert.match(motorolaHtml, /51970748831/);
    assert.doesNotMatch(motorolaHtml, /data-whatsapp-link/);

    const version = await fetch(`${baseUrl}/api/public/latest-client-version`);
    assert.equal(version.status, 200);
    assert.equal((await version.json()).version, "0.5.0");

    const download = await fetch(`${baseUrl}/descargar`, { redirect: "manual" });
    assert.equal(download.status, 302);
    assert.equal(download.headers.get("location"), "/downloads/AriadGSM-Cliente-Setup-PerUser-v0.5.0.exe");

    const legacyDownload = await fetch(`${baseUrl}/downloads/AriadGSM-Cliente-Setup-PerUser-v0.5.1.exe`, { redirect: "manual" });
    assert.equal(legacyDownload.status, 302);
    assert.equal(legacyDownload.headers.get("location"), "/downloads/AriadGSM-Cliente-Setup-PerUser-v0.5.0.exe");

    const ignoredEvent = await fetch(`${baseUrl}/api/public/campaign-event`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Origin": baseUrl,
      },
      body: JSON.stringify({
        eventType: "landing_view",
        sessionId: "organic-test-session",
        component: "public_landing",
        url: "/",
        campaign: {},
      }),
    });
    assert.equal(ignoredEvent.status, 202);
    assert.deepEqual(await ignoredEvent.json(), { ok: true, ignored: true });

    const event = await fetch(`${baseUrl}/api/public/campaign-event`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Origin": baseUrl,
      },
      body: JSON.stringify({
        eventType: "download_click",
        sessionId: "campaign-test-session",
        component: "hero_download",
        destination: "/descargar",
        url: "/?src=meta_xiaomi_app&utm_campaign=meta_xiaomi_app",
        campaign: {
          src: "meta_xiaomi_app",
          utm_source: "meta",
          utm_medium: "paid",
          utm_campaign: "meta_xiaomi_app",
        },
      }),
    });
    assert.equal(event.status, 202);
    assert.deepEqual(await event.json(), { ok: true });

    const rawDb = await readFile(path.join(dataDir, "users.json"), "utf8");
    const db = JSON.parse(rawDb);
    const audits = db.audit.filter((entry) => entry.action === "PUBLIC_CAMPAIGN_EVENT");
    assert.equal(audits.length, 1, "only attributed public campaign events should be persisted");
    const audit = audits[0];
    assert.ok(audit, "public campaign event should be persisted to audit");
    assert.equal(audit.detail.eventType, "download_click");
    assert.equal(audit.detail.campaign.utm_campaign, "meta_xiaomi_app");
    assert.equal(audit.detail.component, "hero_download");
    assert.equal(typeof audit.detail.ipHash, "string");
  } finally {
    if (!exited) {
      child.kill();
      await new Promise((resolve) => child.once("exit", resolve));
    }
    await rm(dataDir, { recursive: true, force: true });
  }
});
