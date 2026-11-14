# Mars Habitat Finder API — Phase 4

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
route is no longer part of the scientific record. No routing endpoint is added.
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

`npm test` builds and runs two smoke checks against compiled handlers: schema
validation, unchanged detail records and packaging bytes, null/unknown science
states, 400/404 behavior, and rejection of missing/malformed artifacts.
Local HTTP checks were also run through Core Tools for both endpoints, all three
sites and 400/404 responses. Phase 2/3 inputs and scientific outputs are preserved.
