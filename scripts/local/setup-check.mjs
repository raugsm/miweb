#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const root = process.cwd();

function parseMajor(version) {
  return Number(String(version || "").replace(/^v/, "").split(".")[0] || 0);
}

function parseEnvNames(filePath) {
  if (!existsSync(filePath)) return new Set();
  const text = readFileSync(filePath, "utf8");
  const names = new Set();
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (match) names.add(match[1]);
  }
  return names;
}

function gitignoreIncludes(pattern) {
  const filePath = join(root, ".gitignore");
  if (!existsSync(filePath)) return false;
  return readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .includes(pattern);
}

const packageJson = require(join(root, "package.json"));
const envLocalPath = join(root, ".env.local");
const envNames = parseEnvNames(envLocalPath);
const requiredEnv = ["ARIAD_STORAGE_DRIVER", "DATABASE_URL", "ARIAD_SETUP_TOKEN"];
const missingEnv = requiredEnv.filter((name) => !envNames.has(name));

const checks = [
  {
    name: "node >= 20",
    ok: parseMajor(process.version) >= 20,
    detail: process.version,
  },
  {
    name: "package name",
    ok: packageJson.name === "ariadgsm-ops-mvp",
    detail: packageJson.name,
  },
  {
    name: ".env.example exists",
    ok: existsSync(join(root, ".env.example")),
    detail: ".env.example",
  },
  {
    name: ".env.local exists",
    ok: existsSync(envLocalPath),
    detail: ".env.local",
  },
  {
    name: ".env.local required variable names",
    ok: missingEnv.length === 0,
    detail: missingEnv.length ? `missing: ${missingEnv.join(", ")}` : "present",
  },
  {
    name: "migrations directory",
    ok: existsSync(join(root, "migrations", "003_xiaomi_frp_spa_backend.sql")),
    detail: "migrations/003_xiaomi_frp_spa_backend.sql",
  },
  {
    name: ".gitignore protects .env",
    ok: gitignoreIncludes(".env"),
    detail: ".env",
  },
  {
    name: ".gitignore protects .env.local",
    ok: gitignoreIncludes(".env.*") || gitignoreIncludes(".env.local"),
    detail: ".env.local",
  },
  {
    name: ".gitignore protects *.local",
    ok: gitignoreIncludes("*.local"),
    detail: "*.local",
  },
];

const ok = checks.every((check) => check.ok);
console.log(JSON.stringify({ ok, checks }, null, 2));
if (!ok) process.exitCode = 1;
