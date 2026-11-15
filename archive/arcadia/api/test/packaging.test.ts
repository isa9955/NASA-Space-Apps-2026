import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, existsSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("build cleanup removes stale generated files while preserving source and refusing arbitrary paths", () => {
  const dir = mkdtempSync(join(tmpdir(), "build-clean-check-"));
  try {
    mkdirSync(join(dir, "scripts"));
    copyFileSync(join(__dirname, "../scripts/build-paths.cjs"), join(dir, "scripts/build-paths.cjs"));
    mkdirSync(join(dir, "dist"));
    writeFileSync(join(dir, "dist/stale-fixture.js"), "obsolete");
    writeFileSync(join(dir, "source.py"), "preserve");
    const { resetGeneratedDirectory } = require(join(dir, "scripts/build-paths.cjs"));
    assert.throws(() => resetGeneratedDirectory(".."), /approved generated directory/);
    resetGeneratedDirectory("dist");
    assert.deepEqual(readdirSync(join(dir, "dist")), []);
    assert.equal(existsSync(join(dir, "source.py")), true);
  } finally { rmSync(dir, { recursive: true }); }
});

test("compiled output contains no obsolete fixture, tests, Python or raw science assets", () => {
  const api = join(__dirname, "..");
  assert.equal(existsSync(join(api, "src/fixtures/sites.ts")), false);
  assert.equal(existsSync(join(api, "dist/src/fixtures/sites.js")), false);
  const files = readdirSync(join(api, "dist"), { recursive: true, withFileTypes: true });
  assert(files.filter((entry) => entry.isFile()).every((entry) => /\.(js|json|geojson)$/.test(entry.name)));
  assert.equal(existsSync(join(api, "dist/test")), false);
  assert.equal(existsSync(join(api, "dist/mars-blindspots")), false);
});
