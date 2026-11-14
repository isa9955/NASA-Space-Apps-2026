// Writes the API contract as JSON Schema + example responses to /contracts,
// so the Python backend can validate its output in its own tests.
// Run: npm run contracts
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { zodToJsonSchema } from "zod-to-json-schema";
import { ConditionsResponse, ErrorResponse, RegionResponse, RouteResponse } from "../src/api/schema";
import { handleMockRequest } from "../src/mocks/server";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "contracts");
mkdirSync(join(root, "examples"), { recursive: true });

const schemas = {
  region: RegionResponse,
  conditions: ConditionsResponse,
  route: RouteResponse,
  error: ErrorResponse
};
for (const [name, schema] of Object.entries(schemas)) {
  const json = zodToJsonSchema(schema, { name, $refStrategy: "none" });
  writeFileSync(join(root, `${name}.schema.json`), JSON.stringify(json, null, 2) + "\n");
}

const region = JSON.parse(handleMockRequest("/api/region").body as string);
const [w, s, e, n] = region.region.bounds;
const { from, to } = region.demoTraverse;
const examples: Record<string, string> = {
  region: "/api/region",
  conditions: `/api/conditions?lon=${(w + e) / 2}&lat=${(s + n) / 2}`,
  route: `/api/route?from=${from.join(",")}&to=${to.join(",")}`,
  error: "/api/conditions?lon=0&lat=0"
};
for (const [name, url] of Object.entries(examples)) {
  const body = JSON.parse(handleMockRequest(url).body as string);
  writeFileSync(join(root, "examples", `${name}.json`), JSON.stringify(body, null, 2) + "\n");
}
console.log(`Wrote ${Object.keys(schemas).length} schemas and examples to ${root}`);
