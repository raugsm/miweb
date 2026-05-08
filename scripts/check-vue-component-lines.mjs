import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("frontend/xiaomi-frp/src");
const maxLines = 300;

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(fullPath));
    else if (entry.isFile() && entry.name.endsWith(".vue")) files.push(fullPath);
  }
  return files;
}

const files = await walk(root);
const failures = [];

for (const file of files) {
  const text = await readFile(file, "utf8");
  const lines = text.split(/\r?\n/).length;
  if (lines > maxLines) {
    failures.push(`${path.relative(process.cwd(), file)}: ${lines} lines`);
  }
}

if (failures.length) {
  console.error(`Vue component line limit exceeded (${maxLines}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Vue component line check passed: ${files.length} components <= ${maxLines} lines.`);
