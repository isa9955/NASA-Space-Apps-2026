import type { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getAssessments } from "../assessments.js";
import { API_SCHEMA_VERSION, type SiteResponse } from "../contracts/site.js";
import { error, json } from "../http.js";

export async function getSite(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const id = request.params.id;
  if (!id || id.length > 100 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || request.query.size) {
    return error(400, "INVALID_ARGUMENT", "Provide a site ID of lowercase letters, numbers and hyphens (maximum 100 characters); query parameters are unsupported.");
  }
  try {
    const artifact = getAssessments();
    const site = artifact.sites.find((candidate) => candidate.id === id);
    if (!site) return error(404, "SITE_NOT_FOUND", `No site exists with id '${id}'.`);
    const body: SiteResponse = {
      schemaVersion: API_SCHEMA_VERSION, assessmentSchemaVersion: artifact.schemaVersion,
      scoringVersion: artifact.scoringVersion, inputProvenance: artifact.inputProvenance, site
    };
    return json(200, body);
  } catch (cause) {
    context.error("Assessment artifact could not be loaded", cause);
    return error(503, "ASSESSMENTS_UNAVAILABLE", "Scientific assessments are temporarily unavailable.");
  }
}
