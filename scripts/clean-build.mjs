import { rmSync } from "node:fs";

for (const directory of [
  ".output",
  ".nitro",
  ".vinxi",
  ".tanstack",
  "dist",
  "dist-ssr",
  "node_modules/.vite",
  "node_modules/.cache",
]) {
  rmSync(directory, { recursive: true, force: true });
}

console.log("[build] removed all previous build output");