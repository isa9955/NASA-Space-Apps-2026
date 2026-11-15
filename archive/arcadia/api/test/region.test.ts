import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { HttpRequest, InvocationContext } from "@azure/functions";
const { getRegion } = require("../dist/src/functions/get-region.js");
const { readRegionalAnalysis } = require("../dist/src/regional-analysis.js");

test("regional endpoint serves only the packaged provisional Deuteronilus analysis", async () => {
  const source = readFileSync(join(__dirname, "../../pipeline/deuteronilus_analysis.json"));
  assert.deepEqual(readFileSync(join(__dirname, "../dist/data/deuteronilus_analysis.json")), source);
  const context = new InvocationContext({ functionName: "region-smoke" });
  const result = await getRegion(new HttpRequest({ method: "GET", url: "http://localhost/api/regions/deuteronilus" }), context);
  assert.equal(result.status, 200);
  assert.equal(result.jsonBody.schemaVersion, "2.0.0");
  const analysis = result.jsonBody.analysis;
  assert.deepEqual(analysis, JSON.parse(source.toString()));
  assert.equal(analysis.overallHabitability, "unknown");
  assert.deepEqual(analysis.routes.map((route: any) => route.properties.mode), ["standard", "uncertainty-aware"]);
  for (const route of analysis.routes) {
    assert.equal(route.properties.status, "provisional");
    assert(route.geometry.coordinates.length > 2);
  }
  assert.match(analysis.warnings.join(" "), /not confirmed subsurface ice/);
  assert(readFileSync(join(__dirname, "../.funcignore"), "utf8").split(/\r?\n/).includes("mars-blindspots/"));
  assert.equal((await getRegion(new HttpRequest({ method: "GET", url: "http://localhost/api/regions/deuteronilus?start=1" }), context)).status, 400);
});

test("regional loader rejects missing artifacts and unsupported safety claims", () => {
  const dir = mkdtempSync(join(tmpdir(), "region-check-"));
  try {
    assert.throws(() => readRegionalAnalysis(join(dir, "missing.json")));
    const data = JSON.parse(readFileSync(join(__dirname, "../../pipeline/deuteronilus_analysis.json"), "utf8"));
    data.overallHabitability = "safe";
    const path = join(dir, "invalid.json");
    writeFileSync(path, JSON.stringify(data));
    assert.throws(() => readRegionalAnalysis(path), /Invalid regional analysis/);
    data.overallHabitability = "unknown";
    delete data.sourceVerification.verificationScope;
    writeFileSync(path, JSON.stringify(data));
    assert.throws(() => readRegionalAnalysis(path), /Invalid regional analysis/);
  } finally { rmSync(dir, { recursive: true }); }
});
