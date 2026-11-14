import assert from "node:assert/strict";
import test from "node:test";
import type { HttpRequest, InvocationContext } from "@azure/functions";
import { getSite } from "../src/functions/get-site.js";

const context = {} as InvocationContext;

test("GET site returns a clearly labeled placeholder or a not-found response", async () => {
  const found = await getSite(
    { params: { id: "placeholder-site-001" } } as HttpRequest,
    context
  );

  assert.equal(found.status, 200);
  assert.equal(found.jsonBody.site.dataStatus, "placeholder");
  assert.equal(found.jsonBody.site.suitability.score, null);
  assert.equal(found.jsonBody.site.confidence.level, null);

  const missing = await getSite({ params: { id: "missing" } } as HttpRequest, context);
  assert.equal(missing.status, 404);
  assert.equal(missing.jsonBody.error.code, "SITE_NOT_FOUND");
});
