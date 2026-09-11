import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const entry = resolve(process.cwd(), ".output/server/index.mjs");
const publicDirectory = resolve(process.cwd(), ".output/public");

if (!existsSync(entry)) {
  console.error(`[build] missing Node server entry: ${entry}`);
  process.exit(1);
}

function listJavaScriptFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((item) => {
    const path = resolve(directory, item.name);
    return item.isDirectory()
      ? listJavaScriptFiles(path)
      : item.isFile() && item.name.endsWith(".js")
        ? [path]
        : [];
  });
}

const forbiddenClientCode = [
  /products\/\$\{Date\.now\(\)\}[^`"']*\.name/,
  /\.from\([`"']products[`"']\)\.(insert|update|delete)/,
];

for (const file of listJavaScriptFiles(publicDirectory)) {
  const source = readFileSync(file, "utf8");
  if (forbiddenClientCode.some((pattern) => pattern.test(source))) {
    console.error(`[build] obsolete client-side product code found in: ${file}`);
    process.exit(1);
  }
}

console.log(`[build] verified Node server entry: ${entry}`);
console.log("[build] verified that obsolete product code is absent from client assets");