import type {
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { getRoutes } from "../routes.js";
import { getAssessments } from "../assessments.js";
import { error, json } from "../http.js";
import type { StartsResponse } from "../contracts/journey.js";

export async function getStarts(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  if (request.query.size)
    return error(
      400,
      "INVALID_ARGUMENT",
      "Starting-point discovery accepts no query parameters.",
    );
  try {
    const routes = getRoutes();
    const sites = getAssessments().sites;
    const body: StartsResponse = {
      schemaVersion: "2.0.0",
      starts: routes.starts.map((start) => ({
        ...start,
        name: sites.find((site) => site.id === start.id)!.name,
        validationScope:
          "Verified terrain reference with precomputed route records; not a certified landing or safe habitat site.",
        destinations: routes.features
          .filter((feature) => feature.properties.startId === start.id)
          .map((feature) => ({
            siteId: feature.properties.siteId,
            status: feature.properties.status,
          })),
      })),
    };
    return json(200, body);
  } catch (cause) {
    context.error("Starting-point discovery failed", cause);
    return error(
      503,
      "ROUTES_UNAVAILABLE",
      "Precomputed starting points are unavailable.",
    );
  }
}
