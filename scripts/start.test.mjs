import { test } from "vitest";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

test("production startup refuses a missing Node artifact instead of invoking a build", () => {
  const dir = mkdtempSync(join(tmpdir(), "mgpro-missing-"));
  try {
    const result = spawnSync(process.execPath, [resolve("scripts/start.mjs")], { cwd: dir, env: { ...process.env, NODE_ENV: "production" }, encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Missing .output\/server\/index.mjs/);
    assert.doesNotMatch(result.stdout, /building it now/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("Node launcher loads an artifact path containing spaces and forwards bind settings", () => {
  const dir = mkdtempSync(join(tmpdir(), "mgpro path space-"));
  try {
    mkdirSync(join(dir, ".output/server"), { recursive: true });
    // Fixture module only: this does NOT build or boot the application production artifact.
    writeFileSync(join(dir, ".output/server/index.mjs"), 'console.log(JSON.stringify({port:process.env.NITRO_PORT,host:process.env.NITRO_HOST}));');
    const result = spawnSync(process.execPath, [resolve("scripts/start.mjs")], { cwd: dir, env: { ...process.env, NODE_ENV: "production", PORT: "3456", HOST: "127.0.0.1" }, encoding: "utf8" });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /"port":"3456","host":"127.0.0.1"/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("VPS build never copies runtime secrets into a Docker build stage", () => {
  const dockerfile = readFileSync("selfhost/Dockerfile", "utf8");
  assert.doesNotMatch(dockerfile, /^COPY\s+selfhost\/\.env\s/m);
  assert.match(dockerfile, /NITRO_PRESET=node-server/);
});