import type { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getRoutes } from "../routes.js";
import { getAssessments } from "../assessments.js";
import { error, json } from "../http.js";
import type { RouteResponse } from "../contracts/route.js";

export async function getRoute(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const startIds = request.query.getAll("startId");
  const siteIds = request.query.getAll("siteId");
  const [startId] = startIds;
  const [siteId] = siteIds;
  if (startIds.length !== 1 || siteIds.length !== 1 ||
      [...request.query.keys()].some((key) => key !== "startId" && key !== "siteId") ||
      [startId, siteId].some((id) => !id || id.length > 100 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))) {
    return error(400, "INVALID_ARGUMENT", "Provide exactly one valid startId and siteId; no other query parameters are supported.");
  }
  try {
    const artifact = getRoutes();
    if (!artifact.starts.some((start) => start.id === startId)) return error(404, "START_NOT_FOUND", "Unknown route start ID.");
    if (!getAssessments().sites.some((site) => site.id === siteId)) return error(404, "SITE_NOT_FOUND", "Unknown site ID.");
    const route = artifact.features.find((feature) => feature.properties.startId === startId && feature.properties.siteId === siteId);
    if (!route) return error(404, "ROUTE_NOT_FOUND", "No precomputed record exists for this endpoint pair.");
    const body: RouteResponse = { schemaVersion: "2.0.0", routeSchemaVersion: artifact.schemaVersion,
      planningVersion: artifact.planningVersion, coordinateReference: artifact.coordinateReference,
      inputProvenance: artifact.inputProvenance, route };
    return json(200, body);
  } catch (cause) {
    context.error("Precomputed routes could not be loaded", cause);
    return error(503, "ROUTES_UNAVAILABLE", "Precomputed route records are temporarily unavailable.");
  }
}
