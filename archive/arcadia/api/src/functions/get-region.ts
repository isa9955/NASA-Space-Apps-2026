import type { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getRegionalAnalysis } from "../regional-analysis.js";
import { error, json } from "../http.js";
import type { RegionResponse } from "../contracts/region.js";

export async function getRegion(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (request.query.size)
    return error(400, "INVALID_ARGUMENT", "Regional analysis accepts no query parameters.");
  try {
    const body: RegionResponse = { schemaVersion: "2.0.0", analysis: getRegionalAnalysis() };
    return json(200, body);
  } catch (cause) {
    context.error("Deuteronilus analysis unavailable", cause);
    return error(503, "ASSESSMENTS_UNAVAILABLE", "Precomputed Deuteronilus analysis is unavailable; no fallback is provided.");
  }
}
