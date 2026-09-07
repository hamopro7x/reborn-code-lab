import { existsSync } from "node:fs";
import { resolve } from "node:path";

const entry = resolve(process.cwd(), ".output/server/index.mjs");

if (!existsSync(entry)) {
  console.error(`[build] missing Node server entry: ${entry}`);
  process.exit(1);
}

console.log(`[build] verified Node server entry: ${entry}`);