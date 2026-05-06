import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

export function createJsonStorage({ dataDir, defaultDb, fileName = "users.json" } = {}) {
  if (!dataDir) throw new Error("JSON storage requiere dataDir.");
  if (typeof defaultDb !== "function") throw new Error("JSON storage requiere defaultDb.");

  const dbPath = path.join(dataDir, fileName);
  const dbLastGoodPath = path.join(dataDir, `${fileName}.last-good.bak`);
  let dbWriteQueue = Promise.resolve();

  async function backupLastGoodDb() {
    try {
      const current = await fs.readFile(dbPath, "utf8");
      JSON.parse(current);
      await fs.copyFile(dbPath, dbLastGoodPath);
    } catch {
      // No sobrescribimos last-good si el archivo activo ya esta corrupto.
    }
  }

  async function replaceDbAtomically(db) {
    await fs.mkdir(dataDir, { recursive: true });
    const payload = `${JSON.stringify(db, null, 2)}\n`;
    JSON.parse(payload);
    const tempPath = `${dbPath}.${process.pid}.${Date.now()}.${crypto.randomUUID()}.tmp`;
    try {
      const handle = await fs.open(tempPath, "w");
      try {
        await handle.writeFile(payload, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      await backupLastGoodDb();
      await fs.rename(tempPath, dbPath);
    } catch (error) {
      await fs.rm(tempPath, { force: true }).catch(() => {});
      throw error;
    }
  }

  async function writeDb(db) {
    const write = dbWriteQueue.then(() => replaceDbAtomically(db));
    dbWriteQueue = write.catch(() => {});
    return write;
  }

  async function ensureDb() {
    await fs.mkdir(dataDir, { recursive: true });
    try {
      await fs.access(dbPath);
    } catch {
      await writeDb(defaultDb());
    }
  }

  async function readDb() {
    await ensureDb();
    const raw = await fs.readFile(dbPath, "utf8");
    return JSON.parse(raw);
  }

  async function health() {
    return {
      driver: "json",
      runtimeImplemented: true,
      dbFile: fileName,
    };
  }

  return {
    driver: "json",
    runtimeImplemented: true,
    ensureDb,
    readDb,
    writeDb,
    health,
  };
}
