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
