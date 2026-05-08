#!/usr/bin/env node

import { spawn } from "node:child_process";

const nodeCommand = process.execPath;

const children = [
  {
    name: "server",
    command: nodeCommand,
    args: ["server.js"],
  },
  {
    name: "vite",
    command: nodeCommand,
    args: ["node_modules/vite/bin/vite.js", "--config", "frontend/xiaomi-frp/vite.config.js", "--host", "127.0.0.1", "--port", "5173"],
  },
];

function start(child) {
  const processRef = spawn(child.command, child.args, {
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });
  processRef.stdout.on("data", (chunk) => {
    process.stdout.write(`[${child.name}] ${chunk}`);
  });
  processRef.stderr.on("data", (chunk) => {
    process.stderr.write(`[${child.name}] ${chunk}`);
  });
  processRef.on("exit", (code, signal) => {
    if (shuttingDown) return;
    console.error(`[dev:full] ${child.name} exited`, { code, signal });
    shutdown(code || 1);
  });
  return processRef;
}

let shuttingDown = false;
const running = children.map(start);

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of running) {
    if (!child.killed) child.kill("SIGTERM");
  }
  setTimeout(() => process.exit(code), 250).unref();
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
