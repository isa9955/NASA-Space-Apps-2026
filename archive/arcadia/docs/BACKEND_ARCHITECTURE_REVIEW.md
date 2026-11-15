# Backend architecture review and cleanup

> Historical review of the former TypeScript integration. The current app uses
> the Deuteronilus Python API; this archived service is not its runtime.
> See `../../../docs/DEUTERONILUS_INTEGRATION.md` for current ownership and checks.

Scope: integrated Arcadia Phase 6.2 and Deuteronilus backend. This is an
evidence-based local review, not a claim that every legacy scientific path or
Azure deployment has been validated. No scientific model, route result,
measurement, frontend file, public endpoint or successful response was changed
by this cleanup.

## Findings, classification and decisions

| Overlap / finding | Classification | Decision and evidence |
|---|---|---|
| Arcadia MOLA A* vs Deuteronilus dual-cost A* | Intentional scientific specialization | Retain both: different resolution, source support, cost models, uncertainty assumptions and distance bases. Their test suites and outputs remain independent. |
| MOLA local slope vs HiRISE walking/footprint slope | Intentional scientific specialization | Do not merge: ground-distance handling, sample windows and source uncertainty differ. |
| Python scientific validation vs API JSON/hash validation | Intentional specialization of ownership | Python owns derivations; API owns wire shape, references and snapshot integrity. No TypeScript scoring/pathfinding. |
| Duplicate JSON parse/schema-validation and packaged-path/cache code in four API readers | Reusable shared functionality | Consolidated in `api/src/artifacts.ts`. Each reader retains its domain-specific checks. Only successful loads are cached; errors do not select fixtures. Tests cover null/zero distinction, missing/malformed/invalid JSON and retry-after-failure. |
| HTTP response/version/error formatting | Reusable shared functionality, already shared | All six handlers use `http.ts`; keep that boundary rather than introducing a second response framework. |
| Build-output reset used by compilation and production staging | Reusable shared functionality | Shared guarded helper in `api/scripts/build-paths.cjs`; only `dist` and `.azure-package` are approved generated children. Linked output roots and arbitrary paths are rejected. Test proves source files survive cleanup. |
| Phase 1 `api/src/fixtures/sites.ts` | Unnecessary duplication / obsolete code | No imports or active repository consumers; incompatible with v2 and previously excluded from TypeScript. Removed it and its obsolete exclusion. Existing API tests prove scientific artifacts remain the only responses. |
| Stale `dist/src/fixtures/sites.js` | Unnecessary stale build product | It was present despite the source exclusion. `prebuild` now resets generated output before compiling, preventing this code from entering packaging. Regression checks assert its absence. |
| `grid_mode.rle_decode` vs active `backend/zones_to_geojson.decode_rle` | Unnecessary duplication | Removed only the unused decoder after repository reference checks. The active encoder/consumer round-trip is tested with empty, uniform and mixed masks. No active caller was redirected or changed. |
| RLE mask-area validator vs outline decoder | Intentional independent validation | Keep area checking independent of display decoding/smoothing; mask areas remain authoritative. |
| Raw-byte hashes vs normalized Python-source hashes | Intentional provenance specialization | Scientific bytes remain exact; Python-source identity normalizes Git line endings. Do not apply source normalization to raw raster bytes. |
| Legacy `process_terrain.py` routing/scouts/Gale targets/synthetic demo | Retained legacy compatibility, not shared current science | These functions still have CLI callers. Their cost/target behavior is not equivalent to the supported Deuteronilus exporter; no blind consolidation or deletion. They are excluded from production and remain technical debt. |
| Shared NumPy/Rasterio declarations across standalone Python requirements | Intentional installation overlap | Each scientific project remains independently installable; Node runtime needs neither. No extra Node dependency was added. |
| Hand-maintained TypeScript and JSON Schema definitions | Remaining drift risk | Current contracts validate against real exports; regional source verification is now explicitly typed/validated. Generation of all TS types from schemas is deferred, not claimed complete. |

## One API boundary, independent scientific ownership

There is one read-only Azure Functions application, one API schema version
`2.0.0`, one JSON/error helper, and one packaged artifact loading/cache layer.
All six registered paths are covered by a registration-and-handler smoke test:

| Path | Ownership / purpose |
|---|---|
| `/api/sites` | Arcadia site summaries; existing compatibility contract. |
| `/api/sites/{id}` | Arcadia scientific detail and source records. |
| `/api/starts` | Arcadia supported origins and recorded pairs. |
| `/api/routes?startId=...&siteId=...` | Arcadia precomputed route only. |
| `/api/mission-context` | Historical THEMIS observation/footprint context. |
| `/api/regions/deuteronilus` | Independently versioned HiRISE analysis with fixed precomputed reference routes. |

Arcadia's region-implicit paths are intentional compatibility aliases in the
architectural sense, not duplicate route implementations. They are the sole
implemented Arcadia paths. There is no general region-discovery endpoint and
no second API server, browser scientific engine, database or Python HTTP runtime.
An independent frontend uses the explicit route map in `FRONTEND_HANDOFF.md`.
A future region-discovery API is a possible evolution, not an implemented feature.

`pipeline/` owns Arcadia science and the narrow Deuteronilus export adapter.
`api/mars-blindspots/` owns the independent HiRISE terrain/zone/native routing
implementation. `api/src/` owns transport, artifact validation and error handling.
`api/scripts/` owns build/staging operations only. `docs/` owns source limitations
and integration instructions. Shared code does not make the scientific models
interchangeable.

## Consistent semantics without misleading DTO normalization

| Meaning | Arcadia representation | Deuteronilus representation |
|---|---|---|
| Provenance | `sources`, `inputProvenance`, source IDs and hashes | Typed `sourceVerification`, `inputProvenance`, model assumptions and explicit audit scope |
| Missing water | Null/unavailable SWIM observation; source not retrieved | No numerical water measurement exists; warnings identify draft visual polygons, not water detections |
| Overall habitat evidence | Null suitability, Unknown overall confidence, null probability | `overallHabitability: "unknown"`; model uncertainty is not an overall confidence score |
| Radiation/shielding | Explicit unresolved review/null dose | Warnings explicitly retain Unknown status; absence of a dose field is unavailable evidence, not zero |
| Route availability | `status` provisional/unavailable, null geometry/metrics for unavailable | Same status/null geometry/metrics rule in the regional contract |
| Distance | `distanceMeters`, Mars geodesic | `metrics.distance_m`, projected native-grid length |
| Uncertainty | Qualitative evidence confidence and MOLA interpolation support | Assumed vertical-error propagation and traversability-gap sensitivity; never probabilities |

Do not force these fields into a common habitability score, invent absent
measurements, map null to zero, infer confirmation from draft polygons or call
the uncertainty-aware route safe. Regional source verification requires product,
credit, units, coordinate convention, hashes and verification scope; tightening
validation adds no fields and changes no successful payload. Scientific
extensions require offline regeneration and an explicit compatibility review.

## Lean production packaging

```powershell
npm --prefix api test
npm --prefix api run package:azure
```

The second command builds and validates artifacts, stages a production-only
Functions app at ignored `api/.azure-package/`, installs from the existing lock
with `npm ci --omit=dev --ignore-scripts`, and validates the installed dependency
tree. It then copies the package into a fresh OS temporary directory and runs
all six handlers there, with no development dependency resolution fallback.
This is **local staging only**, not deployment or Azure provisioning.

Top-level package allowlist: `host.json`, `package.json`, `package-lock.json`,
`dist/`, `node_modules/`. Production manifest has no development dependencies
or build scripts. Direct production dependencies remain `@azure/functions`
and `ajv`; installation currently produces eight packages including transitives.
Vendor package contents are retained intact rather than deleting vendor files
based on extension. No project Python, raw rasters, source tree, fixtures,
tests, tooling, README, local settings or credentials are copied. `dist/`
contains compiled JS, schemas and the four compact served scientific artifacts.
The standalone smoke test asserts the package layout and absence of TypeScript,
tsx and stale fixtures.

`api/.funcignore` still excludes raw processing/source/test/build tooling and
now excludes the staging folder itself, preventing recursive packaging if a
developer later publishes from the API root. Prefer the validated staging
directory for eventual publication. Do not publish after a failed packaging
command; review a fresh successful build and perform Phase 7 Azure configuration
and live checks separately. Restart local Functions after rebuilding artifacts;
the supported runtime cache is per worker, not a hot-reload data service.

## Verification and remaining debt

Executed after cleanup: 23 pipeline unittest checks, 31 Deuteronilus pytest
checks, 15 API tests, TypeScript production build, production dependency
installation/tree validation, standalone six-handler package smoke, scientific
byte-preserving packaging and `git diff --check`. Both offline exporters were
rerun; all six existing scientific artifacts retained exactly the same hashes.
No scientific behavior or route geometry changed in this review.

Remaining debt / limits, explicitly not resolved:

1. Legacy terrain CLI and Gale/demo utilities are active code paths but not
   authoritative for the supported two-region API. Deleting or rewriting them
   needs a separate scope decision and stronger legacy tests. Full raw HiRISE
   regeneration and calibration remain unverified; current validation includes
   the previous label/three-block audit and deterministic processed-grid routing.
2. Python scientific requirements remain unpinned, and some image/contour imports
   rely on Matplotlib transitives. Environment locking and explicit dependency
   declaration deserve a separate reproducibility pass; Node production is locked.
3. Type/schema generation, common region discovery, some permissive legacy source
   metadata fields and generic heuristic target dictionaries remain deferred.
   They are documented boundaries, not evidence of a fully normalized API model.
4. SWIM is unavailable, critical habitat evidence is missing, and uncertainty,
   ice-landform interpretation, sunlight and facility thresholds retain their
   scientific limitations. No package/test result establishes habitability.
5. Azure runtime/configuration, SWA/CI deployment, production health, monitoring
   and the previously observed local storage-health warning remain Phase 7 work.
   The staged handlers are verified; deployed Azure readiness is not certified.

No known conflicting current production scientific implementations remain.
This is a scoped cleanup with explicit retained debt, not a claim that the
entire repository is free of duplication or fully production-validated.
