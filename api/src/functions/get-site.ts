import type { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { sites } from "../fixtures/sites.js";
import type { ErrorResponse, SiteResponse } from "../contracts/site.js";

export async function getSite(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  const id = request.params.id;
  const site = id ? sites[id] : undefined;

  if (!site) {
    const body: ErrorResponse = {
      error: {
        code: "SITE_NOT_FOUND",
        message: `No candidate site exists with id '${id ?? ""}'.`
      }
    };

    return { status: 404, jsonBody: body };
  }

  const body: SiteResponse = { site };
  return { status: 200, jsonBody: body };
}
