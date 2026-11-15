# Mars Habitat Finder API — Phase 6

## Architecture cleanup and production staging

All six existing routes and successful payloads are unchanged. Shared artifact
IO/schema validation/cache infrastructure is `src/artifacts.ts`; scientific
checks remain in the independent readers and offline pipelines. Old Phase 1
fixtures and stale compiled output are removed; builds now reset `dist/` first.
Stop/restart a local Functions host around rebuilds; per-worker caches are retained.

`npm --prefix api run package:azure` (from repository root) builds and validates
an ignored `api/.azure-package/` containing only host/package manifests,
compiled JS/schemas/scientific artifacts, and installed production dependencies.
The command runs a standalone package smoke test for all six handlers outside
the checkout; no TypeScript/tsx, Python, raw data, project tests/scripts, fixtures
or local settings are included. This command neither deploys nor provisions.
Use a fresh successful staged package for Phase 7; Azure/SWA runtime and live
production configuration still require verification. See
`../docs/BACKEND_ARCHITECTURE_REVIEW.md` for classification and retained debt.

## Independent regional analysis (additive)

`GET /api/regions/deuteronilus` returns `{schemaVersion: "2.0.0", analysis}`.
`analysis.schemaVersion` is `deuteronilus-analysis/1.0.0`; types and strict
schema are `src/contracts/region.ts` and `region.schema.json`. The fixed
reference pair has standard and uncertainty-aware provisional routes, geometric
scout/science candidates, assumed zone summaries, provenance and limitations.
Query parameters yield 400 `INVALID_ARGUMENT`; absent/invalid regional export
yields 503 `ASSESSMENTS_UNAVAILABLE`. No existing Arcadia response changes.
See `../docs/FRONTEND_HANDOFF.md` for field/coordinate semantics.

The build validates and copies `../pipeline/deuteronilus_analysis.json` if
present, binding it to processed metadata/grid/zones, source-audit and routing
code hashes. A stale supplied artifact fails the build. Runtime reads only
the compact packaged artifact; `mars-blindspots/` is excluded by `.funcignore`.
No Python, large regional grids, NASA reads, dynamic A* or zone recomputation
occur in an HTTP request. Original `safe` means uncertainty-aware cost only.

**IMPORTANT:** JSON/GeoJSON now use LF in Git and Python exports. This resolves
the cross-platform route/assessment snapshot mismatch without weakening exact
hash validation. Regenerate assessments, then routes, then build; never manually
edit a hash to bypass validation. See `../docs/INTEGRATION_ARCADIA_DEUTERONILUS.md`.

The temporary frontend has been removed; the teammate will implement it
independently. See [`../docs/FRONTEND_HANDOFF.md`](../docs/FRONTEND_HANDOFF.md)
for the complete integration guide. All five endpoints, shared TypeScript
contracts, schemas, scientific artifacts and backend tests remain unchanged.

Phase 6.2 preserves all endpoint/wire contracts. The offline confidence export
now uses `evidence-rules-1.1.0`; overall habitat confidence stays Unknown while
critical review evidence is absent, even if water is recovered later. SWIM
retrieval is still blocked and actual water observations remain null. See
`../docs/data-sources.md` and `../docs/FRONTEND_HANDOFF.md` for recovery/import
requirements and backward-compatible future water provenance. Rebuild and
restart the host after replacing scientific exports; handlers cache per worker.

## Guided-journey discovery and context

- `GET /api/starts` returns `{ schemaVersion: "2.0.0", starts: [{ id, name,
  location, validationScope, destinations: [{ siteId, status }] }] }`.
  Starts/pairs are derived only from the validated precomputed route artifact.
  The current response has one terrain reference and two destination records.
  `validationScope` explicitly excludes safe-landing/habitat certification.
- `GET /api/mission-context` returns `{ schemaVersion: "2.0.0", context }`,
  where context follows `mission-context/1.1.0` and
  `src/contracts/mission-context.schema.json`. It contains historical THEMIS
  product-label metadata, source URL/hash and whole-observation limitations.
  It is not a site-specific temperature observation or scoring input.
  `context.footprint` includes an ODE Polygon, Mars coordinate reference,
  source URL/hash and `siteCoverage[{siteId,insideApproximateFootprint}]`.
  Coordinates use `[east longitude 0–360, planetocentric latitude]` degrees.
  Coverage is approximate; it does not establish a valid temperature pixel.
- Both accept no query parameters (400 otherwise). Start-discovery failure
  returns 503 `ROUTES_UNAVAILABLE`. Missing optional mission context returns
  503 `MISSION_CONTEXT_UNAVAILABLE`; other endpoints still work.
- Existing sites/routes v2 response structures are preserved. See
  `src/contracts/journey.ts` for new response types. Builds validate and package
  `pipeline/mission_context.json` if present; no live NASA request is made.

## Phase 5 precomputed route endpoint

`GET /api/routes?startId=arcadia-sample-01&siteId=arcadia-mola-r793-c1903`
(or `siteId=arcadia-mola-r746-c1895`) returns:

Both existing candidate pairs now return `status: "provisional"` with a
nonempty GeoJSON-shaped LineString. The response envelope includes
`schemaVersion: "2.0.0"`, `routeSchemaVersion: "phase5-routes/1.1.0"`,
`planningVersion: "mola-astar-1.1.0"`, coordinate reference, provenance and
`route`. Route properties include distanceMeters, elevationGainMeters,
maximumSlopeDegrees, meanRegionalSlopeDegrees, evidenceCoverage and warnings.
The first and last geometry coordinates match the actual requested sites.

Candidate 1: 11620.799 m distance, 25 m gain, 0.552126 degrees maximum slope,
24 direct and 1 interpolated path cells. Candidate 2: 11155.337 m, 40 m gain,
0.866069 degrees, 24 direct and 0 interpolated path cells. Both still depend
partly on interpolated neighboring cells for slope estimates.

Full schema/types are `src/contracts/route.schema.json` and `route.ts`. No
safety claim is implied. Unavailable records still use null geometry/metrics;
check status before drawing. The independent frontend should consume these
endpoints through a local `/api` proxy and same-origin URLs in production.
Site assessments remain unchanged.

Provide exactly one `startId` and `siteId`, using valid site-ID syntax. Missing,
duplicate or unknown query keys yield 400 `INVALID_ARGUMENT`; unknown start/site
IDs yield 404 `START_NOT_FOUND`/`SITE_NOT_FOUND`; a known pair with no packaged
record yields 404 `ROUTE_NOT_FOUND`. Missing, stale or invalid route artifacts
yield 503 `ROUTES_UNAVAILABLE`. Errors use the existing v2 JSON envelope.

The API build now also validates/copies `pipeline/routes.geojson` into
`dist/data/`. It verifies assessment SHA-256 and endpoint/source consistency;
regenerate routes after changing the assessment artifact. Runtime loads only
packaged data and caches per worker. Restart after rebuilding. No A*, metric
calculation or NASA fetch occurs in TypeScript. Site v2 responses are unchanged.

Read-only TypeScript Azure Functions serving the existing Phase 3 scientific
artifact. Python remains the only scoring implementation. No NASA downloads
or scientific calculations occur in the API.

## Local setup

Requirements: Node.js 22, npm, Azure Functions Core Tools v4 (`func` on PATH).
From the repository root:

```powershell
cd api
npm ci
npm test
$env:FUNCTIONS_WORKER_RUNTIME = "node"
npm start
```

`npm start` builds before launching the host on port 7071. For a browser on
another local origin use `func start --cors http://localhost:5173` after
`npm run build`. A deployed frontend should use same-origin `/api` URLs.
No database or storage service is used by these HTTP handlers.

**IMPORTANT:** Core Tools 4.16.1 served the HTTP smoke requests successfully but
also logged an `AzureWebJobsStorage` health warning in this environment. Local
HTTP success does not verify Azure host storage configuration or deployment
health; resolve those settings for the eventual deployment mode.

## Frontend contract (API schemaVersion 2.0.0)

**Current IDs:** `arcadia-sample-01` is the preserved reference. Automatically
selected terrain candidates are `arcadia-mola-r793-c1903` and
`arcadia-mola-r746-c1895`. Former samples 02/03 return 404. Discover IDs from
`GET /api/sites`; never reuse retired IDs for new coordinates. Schema v2 and
endpoint paths are unchanged. Selection provenance is included in the MOLA
source metadata; all missing-evidence limitations still apply.

- `GET /api/sites`: `{ schemaVersion, assessmentSchemaVersion, scoringVersion,
  inputProvenance, sites: SiteSummary[] }`. Returns every available sample in
  artifact order, without ranking or pagination. A summary omits only top-level
  `observations`, `sources`, and `strengths` from the detail record; it retains
  suitability factor breakdowns, evidence confidence, radiation review,
  limitations, missing information and human-review warnings.
- `GET /api/sites/arcadia-sample-01`: `{ schemaVersion,
  assessmentSchemaVersion, scoringVersion, inputProvenance, site: CandidateSite }`.
  `site` is the unchanged precomputed scientific record, including raw
  observations, source references and all reasoning.
- Both responses use `schemaVersion: "2.0.0"`,
  `assessmentSchemaVersion: "phase3-site-assessments/1.0.0"`,
  `scoringVersion: "screening-1.0.0"` for the current artifact. The input filename
  and SHA-256 are copied from the Python export; this is the Phase 2 input hash,
  not the assessment file hash.
- `src/contracts/site.schema.json` is the JSON Schema 2020-12 wire contract;
  `$defs` defines detail, list, error and offline artifact shapes.
  `src/contracts/site.ts` provides matching frontend-facing TypeScript types.
- Geometry uses `[longitude, latitude]` in degrees, positive east 0–360,
  planetocentric Mars on the stated IAU2000 3,396,000 m sphere. Do not interpret
  these as Earth WGS84. Read `location.coordinateReference`.
- `suitability.score` is null, `suitability.overallStatus` is `unknown`,
  `suitability.status` is `partial`, and `evidenceConfidence.level` is `unknown`.
  Terrain factor scores and Medium terrain evidence confidence are separate.
  Never use `|| 0` or treat `availableWeight` as confidence.
- SWIM observation values are null/unavailable. Radiation dose is null,
  risk unknown and shielding requirements unresolved. Show the exported
  limitations/warnings alongside terrain scores. Samples are not ranked
  habitat recommendations. Unknown is a string level, not a probability.

Example consumer:

```typescript
const response = await fetch('/api/sites/arcadia-sample-01');
if (!response.ok) throw new Error(`Site request failed: ${response.status}`);
const { site } = await response.json();
const overallLabel = site.suitability.score === null
  ? 'Unknown — incomplete evidence'
  : String(site.suitability.score);
```

Requests accept no query parameters. IDs must match lowercase letters,
numbers and single separating hyphens, up to 100 characters.

| HTTP | Error code | Meaning |
|---|---|---|
| 400 | `INVALID_ARGUMENT` | Invalid ID or unsupported query parameters |
| 404 | `SITE_NOT_FOUND` | Validly formed but unknown site ID |
| 503 | `ASSESSMENTS_UNAVAILABLE` | Missing, unreadable, incompatible or invalid packaged scientific artifact |

Errors have `{ "schemaVersion": "2.0.0", "error": { "code": "...",
"message": "..." } }`. Responses set JSON content type and `Cache-Control:
no-store`. Internal failures are logged; filesystem paths/stacks are not sent
to clients. Unmatched URLs and non-GET methods are handled by the Functions
host and may use host-generated responses.

## Breaking changes from Phase 1

The `{ site }` detail envelope and `/api/sites/{id}` path remain. Placeholder ID
`placeholder-site-001` now returns 404. `dataStatus` is scientific/partial;
`environmentalFactors` becomes the `observations` map and
`suitability.factors`. `confidence` becomes `evidenceConfidence` with an explicit
`unknown` level. Sources carry full product provenance. A fabricated placeholder
route is no longer part of the scientific site record. Phase 5 adds the separate
precomputed route endpoint documented above.
Consumers must adopt v2 and must not label a terrain score as overall suitability.

## Build and eventual Azure packaging

`npm run build` compiles TypeScript, validates the existing
`../pipeline/site_assessments.json` using Ajv against the artifact schema, checks
unique IDs, and copies the JSON byte-for-byte to `dist/data/site_assessments.json`.
It fails if the export is absent or invalid and removes the previous packaged
copy before validation. It does not run the Python pipeline. At runtime the
loader reads only this packaged path relative to the compiled module and
validates/caches it per worker; no repository-relative fallback or fixtures.
Rebuild and restart after replacing the artifact.

For eventual deployment, run the build with both repository directories present
and package the API root including `host.json`, `package.json`, lockfile,
`dist/src/`, `dist/data/`, and installed production dependencies. Never deploy
`dist/` alone. `.funcignore` omits source, tests, scripts, local settings and local
tooling while retaining the compiled schema/data. SWA build workflow and live
Azure verification remain future work; nothing has been deployed.

## Essential verification

`npm test` builds and runs fifteen checks against compiled handlers/infrastructure: schema
validation, unchanged detail records and packaging bytes, null/unknown science
states, 400/404 behavior, and rejection of missing/malformed artifacts.
Local HTTP checks were also run through Core Tools for both endpoints, all three
sites and 400/404 responses. Phase 2/3 inputs and scientific outputs are preserved.
