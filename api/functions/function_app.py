"""Azure Functions (Python v2 model) entry point for the Mars Site Planner API.

One anonymous GET trigger catches every /api/* request and passes the path and raw
query string to backend.api_service.handle(), the same function the local dev server
uses. All validation, error envelopes and content types come from handle().

This file runs from the bundle produced by build.py (see api/functions/README.md),
where `backend/` and `data/deuteronilus/` sit next to it.
"""
from urllib.parse import urlsplit

import azure.functions as func

from backend import api_service

app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)

# The processed site data only changes when a new build is deployed.
_ASSET_CACHE = "public, max-age=3600"


@app.route(route="{*path}", methods=["GET"])
def api(req: func.HttpRequest) -> func.HttpResponse:
    path = "/api/" + (req.route_params.get("path") or "")
    # Use the raw query so duplicate parameters reach handle() and are rejected there.
    query = urlsplit(req.url).query
    status, content_type, body = api_service.handle(path, query)
    cache = _ASSET_CACHE if content_type == "image/png" and status == 200 else "no-store"
    return func.HttpResponse(
        body=body,
        status_code=status,
        headers={"Content-Type": content_type, "Cache-Control": cache, "X-Content-Type-Options": "nosniff"},
    )
