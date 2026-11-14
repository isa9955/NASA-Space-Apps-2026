import type { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getAssessments } from "../assessments.js";
import { API_SCHEMA_VERSION, type SitesResponse } from "../contracts/site.js";
import { error, json } from "../http.js";

export async function getSites(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (request.query.size) return error(400, "INVALID_ARGUMENT", "Query parameters are unsupported; this endpoint returns all available site summaries.");
  try {
    const artifact = getAssessments();
    const body: SitesResponse = {
      schemaVersion: API_SCHEMA_VERSION, assessmentSchemaVersion: artifact.schemaVersion,
      scoringVersion: artifact.scoringVersion, inputProvenance: artifact.inputProvenance,
      sites: artifact.sites.map(({ observations, sources, strengths, ...summary }) => summary)
    };
    return json(200, body);
  } catch (cause) {
    context.error("Assessment artifact could not be loaded", cause);
    return error(503, "ASSESSMENTS_UNAVAILABLE", "Scientific assessments are temporarily unavailable.");
  }
}
