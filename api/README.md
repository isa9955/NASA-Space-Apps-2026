# Mars Habitat Finder API (Phase 1)

This is a minimal Azure Functions Node.js v4 API scaffold. The only endpoint is
`GET /api/sites/{id}`. It returns a clearly labeled fixture for
`placeholder-site-001`; all scientific values are unset. This endpoint does
not perform NASA data ingestion, scientific assessment, or route planning.

## Local setup

Requirements: Node.js 22 or newer, npm, and Azure Functions Core Tools v4.

From the repository root:

```powershell
cd api
npm install
npm test
npm run build
npm start
```

With the Functions host running, request
`http://localhost:7071/api/sites/placeholder-site-001`. Unknown IDs return
HTTP 404 with a `SITE_NOT_FOUND` error. The API smoke test and TypeScript build
can run without Core Tools; `npm start` requires it.

## Frontend integration

- Request `GET {API_BASE_URL}/api/sites/{id}`; for local development the base
  URL is `http://localhost:7071`.
- A successful response has the shape `{ "site": CandidateSite }`. The
  machine-readable contract is `src/contracts/site.schema.json`; matching
  TypeScript definitions are in `src/contracts/site.ts`.
- Coordinates use GeoJSON order `[longitude, latitude]`.
- Check `site.dataStatus`, each factor's `status`, and assessment `status`
  before presenting values. Fixture values use null scores/levels and must not
  be interpreted as scientific results.
- A route is only a placeholder with `route.status: "placeholder"`; do not
  present it as navigable or validated.
- Handle unknown IDs as HTTP 404. No CORS policy is configured in this
  scaffold; configure one when the frontend and API origins are known.

## Contract summary

`CandidateSite` includes a GeoJSON point, water/terrain/solar/thermal/radiation
factor records, suitability, confidence, source references, and route status
with waypoints. Scores, confidence levels, measurements, and route geometry
remain unassessed placeholders in Phase 1. The JSON Schema is the wire format
source of truth.
