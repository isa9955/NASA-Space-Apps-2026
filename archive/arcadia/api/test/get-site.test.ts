import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { HttpRequest, InvocationContext } from "@azure/functions";
import { Ajv2020 } from "ajv/dist/2020.js";
import schema from "../src/contracts/site.schema.json";
const { getSite } = require("../dist/src/functions/get-site.js");
const { getSites } = require("../dist/src/functions/get-sites.js");
const { readAssessments } = require("../dist/src/assessments.js");
const context = new InvocationContext({ functionName: "smoke" });
const ajv = new Ajv2020();
const validResponse = ajv.compile(schema);
const request = (id?: string, query = "") => new HttpRequest({ method: "GET", url: `http://localhost/api/sites${id ? `/${id}` : ""}${query}`, params: id ? { id } : {} });

test("compiled endpoints preserve all scientific detail and missing evidence", async () => {
  const originalBytes = readFileSync(join(__dirname, "../../pipeline/site_assessments.json"));
  assert.deepEqual(readFileSync(join(__dirname, "../dist/data/site_assessments.json")), originalBytes);
  const original = JSON.parse(originalBytes.toString());
  const list = await getSites(request(), context);
  assert.equal(list.status, 200);
  assert.ok(validResponse(list.jsonBody), ajv.errorsText(validResponse.errors));
  assert.equal(list.jsonBody.sites.length, 3);
  for (const source of original.sites) {
    const response = await getSite(request(source.id), context);
    assert.equal(response.status, 200);
    assert.ok(validResponse(response.jsonBody), ajv.errorsText(validResponse.errors));
    assert.deepEqual(response.jsonBody.site, source);
    const summary = list.jsonBody.sites.find((site: { id: string }) => site.id === source.id);
    assert.equal(summary.suitability.score, null);
    assert.equal(summary.evidenceConfidence.level, "unknown");
    assert.equal(summary.radiationReview.dose, null);
    assert.equal(response.jsonBody.site.observations.swimCombinedIceConsistency.value, null);
  }
  for (const [req, handler, status] of [
    [request("missing"), getSite, 404],
    [request("arcadia-sample-02"), getSite, 404],
    [request("arcadia-sample-03"), getSite, 404],
    [request("BAD_ID"), getSite, 400],
    [request(undefined, "?limit=1"), getSites, 400]
  ] as const) {
    const response = await handler(req, context);
    assert.equal(response.status, status);
    assert.ok(validResponse(response.jsonBody));
  }
});

test("missing or malformed artifacts fail instead of returning fixtures", () => {
  const directory = mkdtempSync(join(tmpdir(), "mars-api-"));
  try {
    assert.throws(() => readAssessments(join(directory, "missing.json")));
    const path = join(directory, "bad.json");
    writeFileSync(path, JSON.stringify({ sites: [] }));
    assert.throws(() => readAssessments(path), /Invalid assessment artifact/);
  } finally { rmSync(directory, { recursive: true }); }
});

test("v2 accepts future water evidence while overall habitat evidence remains unknown", () => {
  // Synthetic compatibility fixture only; never written to scientific artifacts.
  const artifact = JSON.parse(readFileSync(join(__dirname, "../../pipeline/site_assessments.json"), "utf8"));
  const site = structuredClone(artifact.sites[0]);
  const observation = { value: 0.25, unit: "1 (dimensionless index)", status: "derived", sourceId: "swim4imim-combined-ci-0-1m" };
  site.observations.swimCombinedIceConsistency = observation;
  const water = site.suitability.factors.water;
  Object.assign(water, { observation, status: "assessed", score: 62.5, weightedContribution: water.weight * 62.5 });
  site.suitability.modelStatus = "complete";
  site.suitability.availableWeight = 1;
  site.suitability.modelScore = site.suitability.factors.terrain.weightedContribution + water.weightedContribution;
  site.evidenceConfidence.factors.water = { level: "low", rationale: ["Synthetic compatibility fixture; not a verified observation."] };
  site.evidenceConfidence.coverage = { supportedFactors: ["terrain", "water"], requiredFactors: ["terrain", "water"], missingFactors: [] };
  site.missingInformation = site.missingInformation.filter((item: string) => item !== "water");
  Object.assign(site.sources.find((source: { id: string }) => source.id === observation.sourceId),
    { availability: "available", inputSha256: "0".repeat(64), rasterUrl: "https://swim.psi.edu/synthetic-test-only.tif" });
  const { schemaVersion, scoringVersion, inputProvenance } = { ...artifact, schemaVersion: "2.0.0" };
  const body = { schemaVersion, scoringVersion, inputProvenance, assessmentSchemaVersion: artifact.schemaVersion, site };
  assert.ok(validResponse(body), ajv.errorsText(validResponse.errors));
  assert.equal(site.suitability.score, null);
  assert.equal(site.evidenceConfidence.level, "unknown");
  assert.equal(site.radiationReview.dose, null);
});
