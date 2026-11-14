import type {
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { getMissionContext } from "../mission-context.js";
import { error, json } from "../http.js";

export async function getMissionContextResponse(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  if (request.query.size)
    return error(
      400,
      "INVALID_ARGUMENT",
      "Mission context accepts no query parameters.",
    );
  try {
    return json(200, { schemaVersion: "2.0.0", context: getMissionContext() });
  } catch (cause) {
    context.error("Optional mission context unavailable", cause);
    return error(
      503,
      "MISSION_CONTEXT_UNAVAILABLE",
      "Historical THEMIS context is unavailable; existing MOLA evidence remains accessible.",
    );
  }
}
