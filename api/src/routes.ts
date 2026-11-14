import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import siteSchema from "./contracts/site.schema.json";
import routeSchema from "./contracts/route.schema.json";
import type { RouteArtifact } from "./contracts/route.js";
import { readAssessments } from "./assessments.js";

const ajv = new Ajv2020({ allErrors: true });
ajv.addSchema(siteSchema, "sites");
ajv.addSchema(routeSchema, "routes");
const validate = ajv.compile<RouteArtifact>({ $ref: "routes#/$defs/artifact" });

export function readRoutes(path: string, assessmentPath: string): RouteArtifact {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!validate(parsed)) throw new Error(`Invalid routes artifact: ${ajv.errorsText(validate.errors)}`);
  const bytes = readFileSync(assessmentPath);
  if (createHash("sha256").update(bytes).digest("hex") !== parsed.inputProvenance.assessmentSha256) {
    throw new Error("Routes refer to a different assessment snapshot; regenerate offline");
  }
  const assessments = readAssessments(assessmentPath);
  const sites = new Map(assessments.sites.map((site) => [site.id, site]));
  const starts = new Map(parsed.starts.map((start) => [start.id, start]));
  if (starts.size !== parsed.starts.length || parsed.configuration.version !== parsed.planningVersion) {
    throw new Error("Invalid route metadata");
  }
  for (const start of parsed.starts) {
    if (JSON.stringify(sites.get(start.id)?.location) !== JSON.stringify(start.location) ||
        JSON.stringify(start.location.coordinateReference) !== JSON.stringify(parsed.coordinateReference)) {
      throw new Error("Route start or coordinate reference differs from assessment snapshot");
    }
  }
  const pairs = new Set<string>();
  for (const route of parsed.features) {
    const { startId, siteId, requestedStart, requestedDestination } = route.properties;
    const start = starts.get(startId);
    const site = sites.get(siteId);
    const pair = `${startId}/${siteId}`;
    if (!start || !site || pairs.has(pair)) throw new Error("Invalid or duplicate route endpoint pair");
    if (JSON.stringify(start.location.coordinates) !== JSON.stringify(requestedStart) ||
        JSON.stringify(site.location.coordinates) !== JSON.stringify(requestedDestination)) {
      throw new Error("Route endpoints differ from the assessment snapshot");
    }
    for (const source of route.properties.sources) {
      const original = assessments.sources.find((candidate) => candidate.id === source.id);
      if (JSON.stringify(original) !== JSON.stringify(source)) throw new Error("Route source provenance differs from assessment snapshot");
    }
    pairs.add(pair);
    if (route.geometry) {
      const points = route.geometry.coordinates;
      if (JSON.stringify(points[0]) !== JSON.stringify(requestedStart) ||
          JSON.stringify(points[points.length-1]) !== JSON.stringify(requestedDestination)) {
        throw new Error("Route geometry does not match requested site coordinates");
      }
    }
  }
  return parsed;
}

let cached: RouteArtifact | undefined;
export function getRoutes(): RouteArtifact {
  cached ??= readRoutes(join(__dirname, "../data/routes.geojson"), join(__dirname, "../data/site_assessments.json"));
  return cached;
}
