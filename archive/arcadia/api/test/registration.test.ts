import assert from "node:assert/strict";
import test from "node:test";
import { HttpRequest, InvocationContext } from "@azure/functions";
const { app } = require("@azure/functions");

test("all six registered API routes are unique, read-only and invoke working handlers", async () => {
  const registered: { route: string; methods: string[]; authLevel: string; handler: Function }[] = [];
  const original = app.http;
  app.http = (_name: string, options: any) => registered.push(options);
  try { require("../dist/src/index.js"); } finally { app.http = original; }
  const paths = registered.map((route) => route.route).sort();
  assert.deepEqual(paths, ["mission-context", "regions/deuteronilus", "routes", "sites", "sites/{id}", "starts"]);
  assert.equal(new Set(paths).size, registered.length);
  const context = new InvocationContext({ functionName: "registration-smoke" });
  for (const route of registered) {
    assert.deepEqual(route.methods, ["GET"]);
    assert.equal(route.authLevel, "anonymous");
    const query = route.route === "routes" ? "?startId=arcadia-sample-01&siteId=arcadia-mola-r793-c1903" : "";
    const path = route.route.replace("{id}", "arcadia-sample-01");
    const request = new HttpRequest({ method: "GET", url: `http://localhost/api/${path}${query}`, params: { id: "arcadia-sample-01" } });
    const response = await route.handler(request, context);
    assert.equal(response.status, 200, route.route);
    assert.equal(response.jsonBody.schemaVersion, "2.0.0");
    const invalid = new HttpRequest({ method: "GET", url: `http://localhost/api/${path}?unsupported=1`, params: { id: "arcadia-sample-01" } });
    assert.equal((await route.handler(invalid, context)).status, 400, route.route);
  }
});
