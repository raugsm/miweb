const versionBadge = document.querySelector("[data-client-version]");

function cleanVersionLabel(version) {
  const value = String(version || "").trim().replace(/^v/i, "");
  return value ? `Versi\u00f3n v${value}` : "";
}

async function loadClientVersion() {
  if (!versionBadge) return;
  try {
    const response = await fetch("/api/public/latest-client-version", {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const label = cleanVersionLabel(payload?.version);
    if (!label) return;
    versionBadge.textContent = label;
    versionBadge.hidden = false;
  } catch {
    versionBadge.hidden = true;
  }
}

loadClientVersion();
