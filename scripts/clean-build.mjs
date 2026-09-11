import { rmSync } from "node:fs";

for (const directory of [".output", ".nitro", ".vinxi", ".tanstack", "dist", "dist-ssr"]) {
  rmSync(directory, { recursive: true, force: true });
}

console.log("[build] removed all previous build output");