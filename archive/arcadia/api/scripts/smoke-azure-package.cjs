// Run against a standalone package copy so development dependencies cannot mask omissions.
const assert = require("node:assert/strict");
const { readdirSync, existsSync, readFileSync } = require("node:fs");
const { resolve, join } = require("node:path");
const root = resolve(process.argv[2]);
assert.deepEqual(readdirSync(root).sort(), ["dist", "host.json", "node_modules", "package-lock.json", "package.json"]);
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
assert.equal(manifest.devDependencies, undefined);
assert.equal(manifest.scripts, undefined);
for (const name of ["typescript", "tsx"]) assert.equal(existsSync(join(root, "node_modules", name)), false);
assert.equal(existsSync(join(root, "dist/src/fixtures")), false);
assert.equal(existsSync(join(root, "dist/mars-blindspots")), false);
const { HttpRequest, InvocationContext } = require(join(root, "node_modules/@azure/functions"));
const context = new InvocationContext({ functionName: "production-package-smoke" });
const assessments = JSON.parse(readFileSync(join(root, "dist/data/site_assessments.json"), "utf8"));
const cases = [
  ["get-sites", "getSites", "sites"],
  ["get-site", "getSite", "sites/arcadia-sample-01"],
  ["get-starts", "getStarts", "starts"],
  ["get-route", "getRoute", "routes?startId=arcadia-sample-01&siteId=arcadia-mola-r793-c1903"],
  ["get-mission-context", "getMissionContextResponse", "mission-context"],
  ["get-region", "getRegion", "regions/deuteronilus"],
];
(async () => {
  for (const [module, handler, path] of cases) {
    const request = new HttpRequest({ method: "GET", url: `http://localhost/api/${path}`, params: { id: "arcadia-sample-01" } });
    const response = await require(join(root, "dist/src/functions", module + ".js"))[handler](request, context);
    assert.equal(response.status, 200, path);
    assert.equal(response.jsonBody.schemaVersion, "2.0.0");
    if (response.jsonBody.site) {
      assert.deepEqual(response.jsonBody.site, assessments.sites.find((site) => site.id === "arcadia-sample-01"));
    }
    if (response.jsonBody.analysis) assert.equal(response.jsonBody.analysis.overallHabitability, "unknown");
  }
  console.log("Standalone production package: all six API handlers passed without development dependencies.");
})().catch((cause) => { console.error(cause); process.exitCode = 1; });
