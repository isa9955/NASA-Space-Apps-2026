# Deuteronilus integration and verification

## Architecture and ownership

The current application is `ui/` (React, TypeScript, Vite, Leaflet) calling one
Python backend: `api/mars-blindspots/backend/api_service.py`. The existing UI
layout/design is retained. Terrain and zone derivation remain offline; the
existing Python A* computes interactive routes at request time. No additional
service or cache was introduced. The loopback development server is not a
production host.

| Boundary | Owner and contract |
|---|---|
| `/api/region` | Region, six zone layers, provenance, real-data badge, demo endpoints |
| `/api/conditions?lon=...&lat=...` | Derived terrain and explicitly unknown environmental measurements |
| `/api/route?from=lon,lat&to=lon,lat` | Standard and uncertainty-aware routes, scouts, geometric science targets |
| `/api/assets/basemap.png`, `/api/assets/mask-<zone>.png` | Real terrain hillshade and processed masks |
| `ui/src/api/schema.ts`, `contracts/*.schema.json` | Zod wire contract and generated JSON Schemas; shapes unchanged |
| `archive/arcadia/` | Independent MOLA/SWIM pipeline, precomputed routes, former TypeScript API and historical documents |

Keep the `safe` wire key for compatibility; the UI calls it **uncertainty-aware**.
JSON failures use `{ "error": { "code": "...", "message": "..." } }`:
invalid/duplicate/unknown parameters and out-of-region coordinates return 400;
unknown paths/assets return 404; unexpected internal failures return 500 without
client stack traces. A valid request with blocked terrain returns an unavailable
route and null variants, not an invented path.

Arcadia's archived API is independently buildable, but is not started alongside
the current app or included in its production boundary. Its historical reports
describe an older architecture. Arcadia and HiRISE slope, route-cost, resolution
and uncertainty assumptions differ intentionally; their scientific engines are
not interchangeable. The unused duplicate RLE decoder and obsolete archived
fixture were removed only after consumer checks and regression tests. The
archived artifact readers share validation/loading code. Remaining legacy CLI
code and hand-maintained type/schema drift risks are documented in the archived
architecture review; this is not a claim of a debt-free backend.

## Science preserved and limitations

- Primary data: HiRISE Deuteronilus DTM, A01 product, attached PDS label version 1;
  source image [ESP_041222_2210](https://hirise.lpl.arizona.edu/ESP_041222_2210).
  NASA/JPL/University of Arizona attribution is displayed in the UI.
- Source pixels are 1.0017330185711 m; routing uses 800 rows × 400 columns at
  10.017330185711 m spacing. Coordinates are `[longitude east, latitude]` on
  Mars, not Earth Web Mercator distances. The local projection uses radius
  3,387,887.658234 m, standard latitude 40°, central longitude 30.18°; row zero
  is north. Grid distances are projected approximations. Requested endpoints
  replace first/last display vertices; metrics use the native grid path.
- Zone masks, thresholds, stored areas and terrain numbers were not recomputed
  or changed. A* now rejects blocked/invalid endpoints and blocked diagonal corner
  crossings; the established reference routes retain their original metrics.
- **IMPORTANT — solar inconsistency:** 4,324 robust solar cells lie outside the
  nominal mask because the sunlight variants use different quartiles (about
  1.098 versus 1.106). The strict expected-failure test remains. UI/API warnings
  explain that the area ratio is not a survival fraction. Do not silently repair
  thresholds without scientific review and regeneration.
- Ice polygons are AI-assisted draft landform interpretations, not confirmed
  water, ice probability, abundance or accessibility. Distance is to those
  interpreted polygons. Slope uncertainty assumes a literature elevation error
  and independent errors; it is not a site-calibrated probability.
- Soil, radiation and temperature stay null. Overall habitability, radiation
  shielding and resource accessibility are unknown. Routes are provisional;
  time assumes 50 m/min. Blindspot shares measure model sensitivity, not injury
  probability. Science targets are geometric candidates.
- The preserved source audit verifies the PDS label and three bounded raw DTM
  windows. A recorded full-raster hash is not an independent full-file download
  verification. No raw raster is added by this integration. Arcadia SWIM remains
  unavailable/null; no water measurement was recovered or substituted.

## Reproduce and validate

Start the API and UI as in the root README. Normal dev/live/preview proxy to
`127.0.0.1:7071`; only explicit `npm --prefix ui run dev:mock` uses synthetic
fixtures. Missing API access fails visibly; there is no fallback to mock data.

```powershell
python -m pytest api/mars-blindspots -q
npm --prefix ui test
npm --prefix ui run build
# With Python API and normal Vite server running:
npm --prefix ui run test:live
# Arcadia requires its own scientific dependencies and source path:
$env:PYTHONPATH = (Resolve-Path archive/arcadia/pipeline/src).Path
python -m unittest discover -s archive/arcadia/pipeline/tests -q
npm --prefix archive/arcadia/api test
```

Verified locally on 2026-11-14 using Python 3.13.1:

| Check | Result |
|---|---|
| Primary Python suite | 53 passed, 1 strict expected failure (solar); 6 Pillow deprecation warnings |
| Frontend unit/contract tests | 16 passed; these isolated tests intentionally use mocks |
| Frontend TypeScript + production Vite build | Passed |
| Actual HTTP through Vite + Zod schemas | Passed: real badge, terrain, all six PNG masks, conditions, both routes, scouts, science, errors and blocked destination |
| Archived Arcadia scientific unit tests | 23 passed with the documented PYTHONPATH |
| Archived TypeScript API build + tests | 15 passed, including packaged hashes, routes, missing evidence, schema and fixture exclusion |
| Arcadia relocation reproducibility | Assessment, route and regional-analysis regeneration produced byte-identical exports using existing local caches |

The real reference traverse, cells `(600,100)` → `(150,300)`, returns standard
5,382.591932409745 m (API 5.383 km) and uncertainty-aware 5,634.154123858325 m
(API 5.634 km). Model-critical shares are about 7.726% and 2.985%, respectively.
Five scouts and six science targets are returned. The start elevation is
-2,211 m after API rounding of the derived cell mean.

Browser checks used the real API: demo and manually placed endpoints, rendered
route lines/cards, terrain conditions, sources and zone controls, desktop and
390-pixel mobile layouts. Stopping the API produced an explicit load failure;
restarting and Retry recovered real data. No synthetic dataset was used for
these HTTP/browser checks. Browser checks were interactive automation, not a
new committed browser regression suite. An initial archive test invocation
without PYTHONPATH failed imports; the documented invocation above passes.

## Git preservation and deployment blockers

Integration starts from remote main `bcb1754d0d070259d1bfc6460c1a0c23d049e011`.
Checkpoint stash `8f6151b5fdb502cb27eeefd1660f71a288d613fd` preserves all initial
tracked/untracked backend changes; older stash
`55feb7f5d985c0c782a298b73439219f8fa1df84` is retained. Frontend and primary
Python API take precedence at the root; older README/spec snapshots and scientific
work are preserved under `archive/arcadia/`. No stash was dropped or shared
history rewritten.

**BLOCKER — Azure configuration:** no Python Functions wrapper/bindings for
`handle`, selected supported Python runtime, SWA build/deployment workflow,
same-origin asset/API routing, SPA fallback or deployment secrets are configured
by this integration. Choose the Python hosting boundary and verify NumPy/SciPy
wheels, package contents, cold-start memory, HTTP time limits and concurrent
CPU-bound route capacity before deployment. Publish `ui/dist` with only the
primary runtime, processed data and required dependencies; exclude archived
services, raw rasters, development tools and virtual environments. Production
smoke tests must repeat the real HTTP and browser checks against Azure. No Azure
resources were provisioned or deployed here.

**BLOCKER — dependency security:** after the compatible fflate patch update,
`npm audit --omit=dev` still reports one high advisory in Zod. The full UI audit
reports eight advisories (3 moderate, 3 high, 2 critical), including development
tooling. Major Zod/Vite/Vitest upgrades were deferred to avoid unrelated breaking
changes; review advisories and upgrade/test before exposing deployment tooling
or publishing. The archived API audit reported zero advisories at installation.
These are audit snapshots, not an exhaustive security assessment.
