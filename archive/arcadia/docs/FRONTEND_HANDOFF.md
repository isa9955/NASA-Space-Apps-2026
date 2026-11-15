# Mars Habitat Finder — frontend handoff

Architecture cleanup keeps all six endpoint paths, API v2 envelopes and existing
successful response fields unchanged. See
[`BACKEND_ARCHITECTURE_REVIEW.md`](BACKEND_ARCHITECTURE_REVIEW.md) for the
authoritative route ownership and cross-region semantic mapping. Regional
provenance fields now have explicit TS/schema validation. Missing regional
water/radiation measurements are unavailable, never zero; neither model
uncertainty nor route-gap metrics are overall habitat confidence. There is no
general region-discovery endpoint: use the explicit Arcadia/Deuteronilus map
documented here. Source/build scripts remain separate from the Functions runtime.

## Additive Deuteronilus integration

The original five Arcadia endpoints and v2 contracts below are unchanged.
`GET /api/regions/deuteronilus` now returns
`{schemaVersion: "2.0.0", analysis: RegionalAnalysis}`. See
[`region.ts`](../api/src/contracts/region.ts) and
[`region.schema.json`](../api/src/contracts/region.schema.json).
The independent analysis version is `deuteronilus-analysis/1.0.0`, routing
version `blindspots-astar-1.1.0`. There are no query parameters: unsupported
parameters give 400 `INVALID_ARGUMENT`; missing/invalid regional data gives
503 `ASSESSMENTS_UNAVAILABLE` in the existing error envelope. No fallback or
runtime computation is performed. Unknown region URLs are host-generated 404s.

`analysis` includes `regionId`, `overallHabitability: "unknown"`, source CRS,
bounds/grid (row zero north), input hashes, `sourceVerification` (product URL,
credit, audit scope and sampled raw-byte evidence), model `assumptions`/`scales`,
two GeoJSON-shaped `routes`, `scoutPoints`, `scienceCandidates`, `zoneSummaries`
and mandatory warnings. Route `properties` contain `mode` (`standard` or
`uncertainty-aware`), `status`, `startCell`, `endCell`, native `cells` and
`metrics`: `distance_m`, `time_min`, `uncertain_pct`, `worst_min`, `worst_mean`,
`mean_gap`. An unavailable record has null geometry/metrics and no cells.
Point records include `[longitude,latitude]` `coordinates`, native `cell`,
and the original model-specific heuristic fields. Zone areas are square meters;
they are model footprint masks, not habitat approvals or confirmed ice access.

Only the fixed audited pair `[600,100]` → `[150,300]` is exported. Do not add it
to the Arcadia `/starts` selector or manufacture Arcadia site IDs. A future
multi-region UI should select region first and keep each region's transport
contract/scientific semantics separate. Geometry uses planetocentric/east-positive
Mars coordinates, but Deuteronilus's source projection has a different local
sphere radius (3,387,887.658234 m). Render its longitude/latitude with an explicit
Mars display transform, never Earth WGS84. Distances are **projected native-grid
path lengths**, not Arcadia's geodesic metric. Preserve the distinction in labels.

Display both paths as provisional; never call the uncertainty-aware path safe.
The original Python key `safe` is a compatibility alias only. Time assumes
50 m/min, critical-gap percentages are model sensitivity rather than hazard
probabilities, and sigma_z/rock abundance are assumptions. Ice polygons are
draft AI-assisted visual interpretations, not detected water resources; the
0–1 m SWIM field remains missing. The annual sunlight field is a three-season
terrain-only proxy, not measured annual energy. Preserve Unknown habitability
and all supplied warnings. Do not silently fill the Arcadia science panels with
these different-resolution model outputs. This endpoint does not serve full
grids, PNG overlays or smoothed zone polygons.

For local regeneration, install both projects' Python requirements and run
`pipeline/.venv/Scripts/python.exe pipeline/src/build_deuteronilus_analysis.py`,
then `npm --prefix api test` and restart Functions. The build validates source
hashes and packages only the compact export. See the
[integration record](INTEGRATION_ARCADIA_DEUTERONILUS.md) for verified results,
source limitations, tests and recovery checkpoint. No frontend files changed.

## Ownership and current state

Build a focused NASA Space Apps MVP for exploring Arcadia Planitia terrain
candidates, understanding the evidence, reviewing a provisional scouting route
and imagining a research habitat/greenhouse. This is an exploration aid, not
habitat certification or operational navigation.

The teammate owns the new frontend independently. No frontend or placeholder UI
is included in this checkout. The temporary Phase 6 React implementation is
preserved in commit `5c3e283` (`git show 5c3e283:web/src/main.tsx` for reference).
Do not restore it as a dependency of the backend.

Implemented and preserved:

- Python offline NASA ingestion, candidate selection, scientific assessments
  and deterministic terrain-aware A* routing under `pipeline/`.
- Five read-only TypeScript Azure Functions endpoints under `api/`.
- Actual MOLA assessments, two precomputed routes, and separate historical
  Mars Odyssey THEMIS context. No database, authentication or runtime NASA calls.
- Shared contracts/schemas and backend/scientific tests. Python remains the
  authoritative scoring/routing implementation; do not reimplement it in the UI.

Azure deployment and production verification remain pending Phase 7.

## Intended five-step experience

| Step | User action and required behavior |
|---|---|
| Start | Discover supported origins from `/api/starts`. Show the validation scope. Currently there is one reference origin; arbitrary map clicks cannot create routes. |
| Candidate | Offer that start's recorded destination IDs, joined to `/api/sites`. Show candidate markers and selection. These are terrain-selected samples, not ranked habitat recommendations. |
| Science | Fetch selected-site detail. Compare terrain factors, separate terrain/overall confidence, observations/units, missing evidence, sources, limitations and human-review warnings. |
| Route | Request the exact selected pair. Draw only its returned geometry and show status, metrics, interpolation coverage and hazards. Clear any stale path on selection change or failure. |
| Habitat | Preview a conceptual habitat and greenhouse associated with the selected site's actual name/coordinates. Label it illustrative, unscaled and not engineering-validated; no shielding, crop-yield or life-support claim. |

Provide visible progress, Back/Next navigation, keyboard-accessible selectors,
responsive layout, loading states, useful errors and explicit retry. Preserve
selection across steps. Cancel obsolete requests or reject responses whose IDs
do not match current selection. Optional THEMIS failure must not hide MOLA data.

## Authoritative contracts

Phase 6.2 compatibility note: API envelope/schema versions and endpoints are
unchanged. SWIM retrieval is still blocked; actual water values remain null.
Confidence explanations now use `evidence-rules-1.1.0`: even a future valid
water factor cannot raise overall habitat confidence while critical review
domains are missing. Render factor and overall confidence separately.
If water is recovered, the existing `swimCombinedIceConsistency` observation
and `suitability.factors.water` will carry it; no new endpoint is needed.
Extensible Source metadata may add `rasterUrl`, `expectedSha256`, WKT, affine
transform, raster shape/bounds/resolution and native sampled-cell references.
These additions are provenance, not new resolution, probability or safety
claims. A nonzero water factor can complete the terrain/water model while
overall suitability remains null and overall confidence Unknown. Consult
`docs/data-sources.md` before presenting recovered data.

Use the existing files directly; they are backend/shared assets and must remain:

- [`site.ts`](../api/src/contracts/site.ts): `CandidateSite`, `SiteSummary`,
  `Observation`, `Evidence`, `SitesResponse`, `SiteResponse`, `ErrorResponse`.
- [`site.schema.json`](../api/src/contracts/site.schema.json): JSON Schema
  2020-12 definitions for site list/detail/error and offline artifact validation.
- [`route.ts`](../api/src/contracts/route.ts) and
  [`route.schema.json`](../api/src/contracts/route.schema.json): route response,
  feature, coverage, provenance and offline artifact.
- [`journey.ts`](../api/src/contracts/journey.ts): `StartsResponse`,
  `MissionContext`; [`mission-context.schema.json`](../api/src/contracts/mission-context.schema.json)
  validates the context artifact. Starts and context envelopes are defined by
  their TypeScript types/handlers; there is no separate starts JSON Schema.

All successful API envelopes use `schemaVersion: "2.0.0"`. Check compatibility
explicitly; do not silently map unknown schemas to fixtures. These are separate
from assessment `phase3-site-assessments/1.0.0`, route
`phase5-routes/1.1.0` and mission-context `mission-context/1.1.0` versions.

### Endpoints and responses

All are anonymous `GET` requests. Use relative same-origin `/api/...` URLs.

| Request | Response structure and behavior |
|---|---|
| `GET /api/sites` | `{schemaVersion, assessmentSchemaVersion, scoringVersion, inputProvenance, sites: SiteSummary[]}`. All three records in artifact order; no ranking, pagination or filters. |
| `GET /api/sites/{id}` | `{schemaVersion, assessmentSchemaVersion, scoringVersion, inputProvenance, site: CandidateSite}`. Full unchanged precomputed record. |
| `GET /api/starts` | `{schemaVersion, starts: [{id, name, location, validationScope, destinations: [{siteId, status}]}]}`. Derived from packaged route records, not all known site IDs. |
| `GET /api/routes?startId=...&siteId=...` | `{schemaVersion, routeSchemaVersion, planningVersion, coordinateReference, inputProvenance, route: RouteFeature}`. Exactly one of each query key; no other parameters. |
| `GET /api/mission-context` | `{schemaVersion, context: MissionContext}`. Optional historical THEMIS metadata and footprint, separate from site observations. |

The other four endpoints accept no query parameters. Site IDs must match
`^[a-z0-9]+(?:-[a-z0-9]+)*$`, maximum 100 characters. Encode IDs in URLs.

`CandidateSite` contains `id`, `name`, `dataStatus`, `location`, `observations`,
`suitability`, `evidenceConfidence`, `radiationReview`, `strengths`, `limitations`,
`missingInformation`, `humanReviewWarnings`, and `sources`. A `SiteSummary`
omits only top-level `observations`, `sources` and `strengths`; fetch detail
for the complete provenance and raw evidence.

Observations carry `value`, `unit`, `status`, `sourceId`, and optional
`unavailableReason`, `method`, `dataBasis`. Factors carry `status`, `score`,
`weight`, `weightedContribution`, `observation`, `explanation`. Evidence contains
qualitative `level` and `rationale`; the full assessment also includes coverage,
versions and per-factor confidence. Sources include product URLs, availability
and extended provenance/hash metadata. Render these supplied explanations.

For sites, `inputProvenance` is `{file, sha256}` for the scientific input, not
the assessment file hash. For routes it contains `assessmentSha256`,
`topographyRasterSha256` and `countsRasterSha256`. Do not interchange them.

### Errors

Application errors use:

```json
{"schemaVersion":"2.0.0","error":{"code":"ROUTE_NOT_FOUND","message":"No precomputed record exists for this endpoint pair."}}
```

| HTTP | Code | Action |
|---|---|---|
| 400 | `INVALID_ARGUMENT` | Correct invalid IDs, duplicate/missing route parameters or unsupported query keys. |
| 404 | `SITE_NOT_FOUND` | Unknown/retired site ID; rediscover sites. |
| 404 | `START_NOT_FOUND` | Origin is not in the route-start manifest. |
| 404 | `ROUTE_NOT_FOUND` | Known destination has no packaged record for that origin; show unavailable, never draw a substitute. |
| 503 | `ASSESSMENTS_UNAVAILABLE` | Scientific artifact unavailable/invalid; show error and retry. |
| 503 | `ROUTES_UNAVAILABLE` | Route/start artifact unavailable, stale or invalid; preserve science view but remove route. |
| 503 | `MISSION_CONTEXT_UNAVAILABLE` | Optional context unavailable; keep site/routing experience usable. |

An existing unavailable route record returns **200** with
`route.properties.status: "unavailable"`, `unavailableReason`, null geometry
and null metrics. Distinguish it from a missing record (404). Current two
records are provisional. Responses are JSON with `Cache-Control: no-store`.
Unmatched paths, non-GET methods or proxy/host failures may produce non-JSON
responses; check HTTP status/content type and handle network failures. Do not
display synthetic fallback measurements or paths.

## Mars coordinates and map integration

- Coordinates are `[longitude, latitude]` degrees: **positive east 0–360**,
  **planetocentric** latitude, Mars IAU2000 body-fixed sphere radius
  **3,396,000 m**. Read each `coordinateReference`; these are not Earth WGS84.
- Site Points, route LineStrings and THEMIS Polygon are GeoJSON-shaped Mars
  geometry. Do not pass them through an automatic EPSG:4326 → Earth Mercator
  conversion. Do not use Earth tiles, geodesic scale bars or Earth H3 cells.
- Suggested OpenLayers display: custom spherical equirectangular projection
  matching MOLA, central meridian 180 degrees, standard parallel 0 degrees:
  `x = 3396000 * (lon - 180) * PI/180`,
  `y = 3396000 * lat * PI/180`. Transform every geometry consistently.
  Projected distances differ from ground distances at this latitude; display
  **API route metrics**, not planar line lengths or Earth-map measurements.
- Fit the camera to selected sites/routes. Keep the much larger THEMIS
  footprint in an independent optional layer whose extent does not change fit.
  A coordinate grid is acceptable until a verified Mars basemap and matching
  projection are agreed; imagery is not currently served by the API.
- Hexagon aggregation is not implemented. Any future visual grid must not
  imply new measurements, resolution or scientific scoring.

### Current reproducible origin and destinations

| Role | ID | Coordinates (east longitude, latitude) | Route distance / gain / maximum slope |
|---|---|---|---|
| Reference start | `arcadia-sample-01` | `[194.83984375, 37.98828125]` | — |
| Candidate 1 | `arcadia-mola-r793-c1903` | `[194.87109375097162, 37.800781258030625]` | 11620.798893575855 m / 25 m / 0.5521256992675262° |
| Candidate 2 | `arcadia-mola-r746-c1895` | `[194.80859375096753, 38.16796875805461]` | 11155.336699065258 m / 40 m / 0.8660690410570843° |

These are integration references, not values to hardcode as runtime responses.
Discover IDs and use returned coordinates. Retired samples 02/03 are not
aliases. Never silently relocate an existing ID or create paths on map click.

## Route and scientific evidence presentation

`route.geometry` is a LineString or null. Draw returned vertices without
substituting straight lines or generating a new path. The endpoints exactly
match the selected recorded coordinates. Preserve source geometry; screen
styling must not imply improved terrain resolution or certified navigation.

Show `distanceMeters`, `elevationGainMeters`, `maximumSlopeDegrees`,
`meanRegionalSlopeDegrees`, `evidenceCoverage`, warnings and source links.
Coverage includes direct/interpolated path-cell counts, interpolated distance
and fraction, and mean neighborhood interpolation fraction. Fractions are
0–1; multiply by 100 only for display. Candidate 1 has 24 direct/1 interpolated
path cells; candidate 2 has 24 direct/0 interpolated. Both slope estimates
still involve some interpolated neighboring cells. No vehicle-scale obstacle,
soil, radiation or operational safety assessment is provided.

**IMPORTANT:** Overall `suitability.score` is null, status partial/overall
unknown; `evidenceConfidence.level` is `unknown` and probability null. Terrain
factor scores and `medium` terrain confidence are separate. SWIM remains
unavailable; radiation dose is null, risk unknown and shielding unresolved.
Render null as Unknown/Unavailable, never zero. Do not redistribute weights,
convert confidence levels into percentages, rank habitat safety, or treat
`availableWeight` as confidence. Display units and missing-data reasons.
Include limitations and human-review warnings alongside favorable terrain.

## THEMIS context and footprint

The optional context identifies Mars Odyssey THEMIS product `I03114002BTR`,
dataset `ODY-M-THM-3-IRBTR-V1.0`, attached-label version 1.5, observation start
`2002-08-27T23:03:45.626Z`. It carries product/discovery URLs, source hash,
center coordinates, band/wavelength, center pixel resolution, whole-frame
brightness-temperature label range, limitations and unit reference.

`context.footprint` contains `sourceUrl`, `sourceSha256`, `coordinateReference`,
`geometry: {type: "Polygon", coordinates: [...]}`, `coverageScope`, and
`siteCoverage: [{siteId, insideApproximateFootprint}]`. Longitude normalization
and removal of decorative KML altitude have already happened offline. All
three sites lie inside the approximate official ODE footprint. Do not draw
the product center as a candidate or interpret KML display altitude as terrain.

**IMPORTANT:** The footprint vertices are published to 0.001 degree and have
unquantified boundary accuracy. Catalog coverage is not pixel geolocation.
The unprojected image has no implemented candidate-pixel extraction. The
235.900–242.383 K range describes the **whole historical observation**, not
candidate/air/current temperatures, thermal inertia or greenhouse performance.
Brightness temperature assumes emissivity 1 and atmospheric opacity 0. Context
does not change scores, confidence, site thermal missingness or routing.
An optional labeled footprint overlay is appropriate; a fabricated temperature
heatmap is not. Link [verified sources](data-sources.md) and preserve attribution.

## Suggested frontend architecture and local integration

React + TypeScript + Vite + OpenLayers remain the proposed stack. Agree the
new app directory with the backend developer before Phase 7 build settings.
Keep one API client, shared contract types, journey selection state, map
layers, science/comparison panels, route panel and conceptual preview separate.
Use type-only imports from `api/src/contracts/` in a shared checkout; for a
separate repository, agree a versioned copy/distribution process for these
types and schemas. Do not import Functions runtime modules into the browser.

From repository root, with Node.js 22/npm and Functions Core Tools v4:

```powershell
npm --prefix api ci
npm --prefix api test
Set-Location api
$env:FUNCTIONS_WORKER_RUNTIME = "node"
npm start
```

The API builds then listens on `http://localhost:7071/api`. The build validates
and packages existing science artifacts; running Python or downloading rasters
is unnecessary for frontend work. Restart the host after rebuilding artifacts.
An existing local `AzureWebJobsStorage` health warning has been observed despite
working HTTP requests; this does not establish production deployment health.

In the independently created Vite app, configure `server.proxy['/api']` to
`http://127.0.0.1:7071` and use `fetch('/api/sites')`. Vite preview requires its
own proxy if used locally; the development proxy is not production routing.
Alternatively start the built Functions host with
`func start --cors http://localhost:5173` for direct cross-origin development,
using the exact frontend origin (including hostname). Do not add wildcard CORS
or hardcode a localhost API URL into a production bundle. Azure Static Web Apps
same-origin API routing, SPA fallback and CI remain Phase 7 work.

Example backend smoke request (no frontend needed):

```powershell
Invoke-RestMethod http://localhost:7071/api/starts
Invoke-RestMethod 'http://localhost:7071/api/routes?startId=arcadia-sample-01&siteId=arcadia-mola-r793-c1903'
```

Check `response.ok` before consuming JSON; display server error messages safely
as text. Fetch `/sites` and `/starts` for discovery, selected detail and exact
route pair on selection changes, and `/mission-context` independently.

## Acceptance and coordination checklist

- Complete all five steps for both original candidates with back/forward
  navigation, keyboard operation and a usable narrow-screen layout.
- Offer only discovered supported starts/pairs. Both current routes show the
  reference metrics above and geometry matching the actual site coordinates.
- Selection changes, unavailable records, 400/404/503 and network failures
  remove stale geometry and give honest errors/loading/retry states.
- Compare candidates without implying overall habitat ranking; distinguish
  terrain confidence from Unknown overall confidence and preserve nulls/units.
- Show verified source links, provenance, interpolation and human-review
  warnings. THEMIS footprint aligns with sites and is context only.
- Clearly label the habitat/greenhouse as illustrative and unvalidated.
- Frontend production build and real browser/API journey tests must pass when
  the teammate's implementation exists. Previous UI tests do not verify it.
- Preserve backend/scientific checks: `npm --prefix api test` and
  `$env:PYTHONPATH='pipeline/src'` followed by
  `pipeline/.venv/Scripts/python.exe -m unittest discover -s pipeline/tests -v`.
- Before Phase 7, agree app directory, shared-contract versioning, local origin,
  any verified basemap, build/proxy settings and Azure deployment ownership.
  No credentials belong in frontend source or committed configuration.

See [API setup](../api/README.md), [scientific methodology](methodology.md),
[source provenance](data-sources.md), and [technical specification](../TECHNICAL_SPEC.md).

Handoff verification: all 20 Python tests and six API tests passed after
frontend removal; the API TypeScript build and artifact validation/packaging
passed. Backend source/contracts/tests and every tracked pipeline file match
the Phase 6 commit. No new frontend exists to build or browser-test yet.
