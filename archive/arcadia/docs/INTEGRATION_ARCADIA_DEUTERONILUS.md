# Arcadia / Deuteronilus integration record

> Historical record before the latest frontend/Python API handoff. Paths and
> Git/deployment status below describe that earlier checkpoint. Current status:
> `../../../docs/DEUTERONILUS_INTEGRATION.md`. This TypeScript service is archived.

## Preservation and branch

Integration branch: `codex/integrate-arcadia-deuteronilus`, based on remote
merge `45db14fc239935f43ff586a558467a1fd255c047`.
All original Phase 6.2 tracked and untracked work was checkpointed in the
retained stash `55feb7f5d985c0c782a298b73439219f8fa1df84`, named
`phase6.2-arcadia-before-deuteronilus-integration`. It was applied, not popped.
No textual conflicts occurred. Local `main` was not merged, reset or rewritten;
no new ordinary commit, push or deployment was performed. Do not apply the
checkpoint again on top of the integrated working tree.

## Architecture decisions

- Preserve `pipeline/` as Arcadia's authoritative offline science, including
  the Phase 6.2 water-only import and Unknown overall confidence policy.
- Preserve `api/mars-blindspots/` as the teammate's independent offline Python
  project. Its native data, model thresholds, draft interpretations and tests
  are retained. `api/.funcignore` excludes the entire directory from Functions
  publishing; no Python imports, raw processing, full grids or PNGs are needed
  by the runtime. Its placement under `api/` is historical, not runtime ownership.
- Keep the A* implementations separate. Arcadia uses coarser MOLA/count support,
  slope penalties, interpolation costs and Mars geodesic distances. Deuteronilus
  uses fine HiRISE-derived grids, a modelled traversability field, and a second
  uncertainty-sensitive cost. Their scores, distance bases and confidence models
  are not interchangeable. No common scoring abstraction was forced onto them.
- `pipeline/src/build_deuteronilus_analysis.py` validates and exports a compact
  `pipeline/deuteronilus_analysis.json`, independently versioned. Functions only
  validates/packages/serves it; source hash checking happens at build time.
- Existing five Arcadia endpoint contracts remain unchanged. The additive
  `GET /api/regions/deuteronilus` serves the fixed, audited regional analysis;
  it does not enable runtime route calculation or arbitrary new starts.
- Upstream architecture suggestions for browser A*, FastAPI, dynamic zone
  thresholds and radiation models are historical proposals, not this repository's
  runtime architecture. No frontend implementation was introduced.

## Snapshot failure: exact root cause and fix

`origin/main` binds routes to assessment SHA-256
`2408c811262927ee6189a0591b2bbd97646e25eba09d06ffa85fe793cb6fa57b`.
That is the hash of the old assessment serialized with **CRLF**. Git's stored
LF bytes hash to
`4933dd04ac467f098bdbbd0023520b6ca4c5b9238f9f162e3250abbb563d3160`.
The original validation error was reproduced using the remote commit's LF
files in an isolated ignored directory. The validator correctly rejected the
bytes; the issue is cross-platform serialization, not a reason to bypass hashes.
Phase 6.2 regeneration made the local Windows pair consistent but still encoded
CRLF-dependent hashes.

`.gitattributes` now fixes JSON/GeoJSON to LF. Pipeline JSON writers explicitly
use `newline="\n"`. Scientific input text is normalized without changing its
JSON content, and assessments/routes are regenerated with consistent input and
assessment hashes. Exact-byte source/route checks remain strict; stale artifacts
are still rejected. A regression test asserts LF scientific files and matching
hashes. Python algorithm-source provenance hashes use normalized LF on both
the offline exporter and API build, since source code checkouts can vary.

## Arcadia verification and preservation

Against the retained Phase 6.2 checkpoint, all site objects (including IDs,
coordinates, observations, suitability and confidence), all route features,
metrics, warnings, MOLA provenance, planner parameters and coverage are preserved.
Only outer input/assessment hash bindings change for canonical serialization.
SWIM remains unavailable/null at all three sites. The import validation and
confidence rule `evidence-rules-1.1.0` survive integration. THEMIS remains separate
historical context and is not a local temperature or scoring input.

| Arcadia destination | Distance | Gain | Maximum slope |
|---|---:|---:|---:|
| `arcadia-mola-r793-c1903` | 11620.798893575855 m | 25 m | 0.5521256992675262° |
| `arcadia-mola-r746-c1895` | 11155.336699065258 m | 40 m | 0.8660690410570843° |

## Deuteronilus source and numerical checks

The official NASA/UArizona product label was read via a bounded 65,536-byte
HTTP range. Its identity is `DTEEC_041222_2210_040787_2210_A01`, dataset
`MRO-M-HIRISE-5-DTM-V1.0`, source images `ESP_041222_2210` and `ESP_040787_2210`.
It specifies planetocentric/east-positive equirectangular coordinates,
standard parallel 40°, central meridian 30.18°, local sphere radius
3,387,887.658234 m, and 1.0017330185711 m pixels. Elevation is little-endian
float32 meters above the Mars 2000 equipotential datum, unscaled/zero offset;
missing constant `16#FF7FFFFB#` (~-3.402822655e38). The processing rejects
NoData within the selected crop rather than treating it as traversable terrain.

The metadata crop (rows 2500:10500, columns 1500:5500) matches the official
projection/bounds to 1e-9 degree. The 800×400 grid has 10.017330185711 m cells,
row zero north. Routing slope/uncertainty are 1 m calculations averaged over
each cell; zones use a separate footprint baseline. All loaded routing arrays
are finite and correctly shaped. All 12 nominal/robust zone mask areas agree
with their authoritative RLE masks; display-smoothed outlines are not authority.

Three additional bounded source reads (280,200 bytes each) independently
validate 10×10 block means, within exported 0.1 m rounding:

| Native grid cell | NASA block mean | Processed grid |
|---|---:|---:|
| [600,100] | -2210.783837890625 m | -2210.8 m |
| [150,300] | -1455.6675769042968 m | -1455.7 m |
| [400,200] | -1997.0173034667969 m | -1997.0 m |

`pipeline/deuteronilus_source.json` records source URL, projection, actual range
hashes and sample results. The teammate's reported full-raster SHA is preserved
as **reported**, not independently verified. Full DTM/ortho regeneration was
not performed; only the label and these samples were fetched. This audit does
not prove every slope, pixel or model value in the committed grids.

## Routing findings and fixes

The original Deuteronilus A* allowed entry into blocked goals and diagonal
movement through blocked corners. A new regression test demonstrated the
blocked-goal failure before the fix. It now validates endpoint support/bounds,
rejects invalid grid shapes/nonfinite values/cost ranges and blocks corner cuts.
Both original costs and the admissible heuristic are retained. The `safe`
Python key is retained for compatibility; the exported mode is named
`uncertainty-aware`. Neither implies astronaut safety.

Reference cells [600,100] → [150,300] still produce the original path metrics:

| Mode | Projected distance | Model-critical cell fraction |
|---|---:|---:|
| Standard | 5382.591932409745 m | 7.72626931567329% |
| Uncertainty-aware | 5634.154123858325 m | 2.9850746268656714% |

Those percentages measure a threshold on the model's traversability gap, not
hazard likelihood. Distance is projected grid path length; time assumes constant
50 m/min and is not verified EVA timing. Every exported route vertex matches
its cell center and the native projection; adjacency/support/corner constraints
and independent distance sums are checked. Both routes remain provisional.

## Scientific limits and unresolved blockers

**IMPORTANT:** sigma_z=0.3 m is a literature-based assumption, not a local error
calibration. Independent-pixel error propagation ignores spatial correlation.
Uniform rock abundance is modelled, not measured at the site. Traversability
thresholds, facility sizes, footprint means and worst-case multipliers are
engineering assumptions. Geometric science/scout candidates are hypotheses,
not mapped outcrop identifications or observations.

**IMPORTANT:** ice polygons are draft AI-assisted visual landform interpretations,
not confirmed subsurface ice; the "1–10 m" draft label is not measured depth.
Neither regional glacier context nor proximity to a polygon proves local
resources. Sunlight is a terrain-only model: the "annual" field averages three
sampled solar longitudes, omits atmosphere/dust, and is not an annual energy or
greenhouse-performance measurement. Robust/nominal zone ratios describe model
sensitivity, not confidence probabilities or certification.

**BLOCKER:** SWIM is still unavailable. Radiation/shielding, resource access and
overall habitability remain Unknown for both regions. Full independent raw-data
hash verification and DTM/zone regeneration, calibrated uncertainty and field
validation remain outstanding. Existing standalone Python requirements are
unpinned; record environment versions when regenerating. Azure deployment and
its storage-health configuration have not been verified.

## Reproduce and test

Changed-file responsibilities (in addition to the retained Phase 6.2 work):

| Files | Change |
|---|---|
| `.gitattributes`; `pipeline/src/build_site_inputs.py`, `build_site_assessments.py`, `build_routes.py`, `build_mission_context.py`, `select_candidates.py`, `integrate_swim.py` | Cross-platform LF artifact serialization; no Arcadia routing/scoring changes beyond the already checkpointed Phase 6.2 policy. |
| `api/mars-blindspots/backend/routing.py`, `backend/tests/test_routing.py` | Endpoint/corner/grid validation and regression. |
| `pipeline/src/build_deuteronilus_analysis.py`, `pipeline/deuteronilus_source.json`, `pipeline/deuteronilus_analysis.json` | Native-model validation, source audit and compact precomputed export. |
| `api/src/contracts/region.ts`, `region.schema.json`, `api/src/regional-analysis.ts`, `functions/get-region.ts`, `api/src/index.ts` | Independent versioned contract, validated loader and additive read-only endpoint. |
| `api/scripts/package-assessments.cjs`, `api/test/region.test.ts`, `api/test/routes.test.ts`, `pipeline/tests/test_regional_analysis.py` | Source binding, byte-preserving packaging, LF/API/geography tests. |
| `pipeline/site_assessments.json`, `pipeline/routes.geojson` | Consistent provenance hashes; original site objects/route features retained. |
| Root/API/pipeline READMEs, `TECHNICAL_SPEC.md`, `docs/FRONTEND_HANDOFF.md`, `docs/methodology.md`, `docs/data-sources.md`, this report and teammate README/architecture notes | Ownership, integration contract, source limits and verification instructions. |

Tracked JSON files may appear in working-tree status because their checkout
line endings were normalized; upstream scientific JSON content and binary
assets were checked against the remote commit and are unchanged.

From repository root, using the existing pipeline environment:

```powershell
pipeline/.venv/Scripts/python.exe -m pip install -r pipeline/requirements.txt -r api/mars-blindspots/requirements.txt
pipeline/.venv/Scripts/python.exe pipeline/src/build_site_assessments.py
pipeline/.venv/Scripts/python.exe pipeline/src/build_routes.py
pipeline/.venv/Scripts/python.exe pipeline/src/build_deuteronilus_analysis.py
# Optional: independently repeat the three small NASA source ranges
pipeline/.venv/Scripts/python.exe pipeline/src/build_deuteronilus_analysis.py --verify-source
$env:PYTHONPATH = 'pipeline/src'
pipeline/.venv/Scripts/python.exe -m unittest discover -s pipeline/tests -v
Push-Location api/mars-blindspots
../../pipeline/.venv/Scripts/python.exe -m pytest -q tests backend/tests
Pop-Location
npm --prefix api test
git diff --check
```

Executed results: 23 pipeline unittest checks, 30 Deuteronilus pytest checks,
10 API tests and the TypeScript production build passed. AJV validates both
regional and Arcadia artifacts; packaging copies exports byte-for-byte and
checks source snapshot hashes. Live Functions HTTP checks on isolated port
7072 exercised all six endpoints, both Arcadia routes, both regional modes,
THEMIS and a regional 400 response. The pre-existing storage-health warning
still appears despite successful HTTP handling. The temporary verification
host was stopped after checks. No production or frontend test is claimed.
