# Phase 3 assessment methodology

## Multi-region integration

See [integration methodology and verification](INTEGRATION_ARCADIA_DEUTERONILUS.md)
for the independently preserved HiRISE Deuteronilus model, its source sampling,
grid orientation, mask validation and routing boundary fixes. Its modelled
uncertainty, draft ice polygons and assumed zone/sunlight thresholds are not
Arcadia measurements or habitability evidence. No shared scientific scoring
model was introduced. Arcadia site objects and route features match the Phase
6.2 checkpoint; outer hashes were regenerated with deterministic LF bytes.
Earlier file hashes below describe earlier snapshots, not current artifacts.

## Phase 6.2 water integration status

**BLOCKER:** Official SWIM raster retrieval remains blocked (catalog/legacy
catalog HTTP 523; the 2025 paper's NASA Mars Water Maps URL HTTP 404). No real
water observation was added. See `docs/data-sources.md` for the investigation,
unverified raster properties and required recovery checks. The three site IDs,
coordinates, MOLA observations, terrain scores and factor confidence are
unchanged; SWIM observations remain null.

The existing extractor now validates the numeric raster and samples only the
containing native SWIM cell using its embedded Mars CRS. Masks, -30, nonfinite
values and out-of-coverage points remain unavailable; out-of-range numeric
values and incompatible georeferencing fail rather than becoming evidence.
`integrate_swim.py` updates only water observations/provenance in an existing
input artifact, preserving the selected sites and MOLA measurements. It does
not rerun the old manual sampling configuration or perform candidate selection.
The available import path has synthetic validation only pending real retrieval.

**IMPORTANT:** `evidence-rules-1.1.0` fixes an overall-confidence gap in 1.0.0:
the weakest terrain/water factor alone could become Low when both were present,
despite unresolved critical habitat evidence. Overall habitat evidence now stays
Unknown while site-specific radiation, shielding, thermal, geotechnical and
local resource validation are absent. Terrain confidence rules, the Low cap on
usable water evidence, scoring version/weights/normalization and null overall
suitability are unchanged. Coverage arrays describe terrain/water screening
inputs; they do not describe coverage of all habitat safety requirements.

Assessment exports were regenerated for that confidence version/explanation.
The route artifact's assessment SHA-256 was refreshed by the unchanged offline
router. Every route feature, vertex, metric, source, coverage record and planning
parameter matches the preceding commit. Two successive assessment/route builds
produced identical local file hashes. Current assessment SHA-256:
`15fa0b39160f6056a5406cc1b0c80fbf9a59c35e01b8177806cda0b85051c36d`;
route SHA-256:
`994a7215edc89d9fd9af5952776db46b0bb3da3f2b8ff637ef721a901c0f355a`.
Verification passed: 22 Python tests, seven API tests including a synthetic v2
water-payload compatibility check, TypeScript build, schema validation and
byte-for-byte API packaging. No synthetic values enter the real exports.

## Frontend handoff status

The temporary `web/` implementation has been removed for independent frontend
development. The original UI is preserved in Git commit `5c3e283`.
`docs/FRONTEND_HANDOFF.md` now owns integration/setup and UI acceptance criteria.
The scientific methods, source products, pipeline code, exported artifacts,
API behavior and tests are unchanged. UI descriptions and browser/build
results in the Phase 5.1/6 sections below describe the former implementation;
they are historical evidence, not a currently available frontend.

## Phase 6: complete guided exploration journey

The UI now follows Start → Candidate → Science → Route → Habitat. Supported
starts and their recorded destination pairs are discovered from `GET /api/starts`,
which reads the existing validated route artifact. Only those starts and
destinations are offered; no arbitrary map position can manufacture a route.
There is currently one supported origin and two candidate pairs. "Supported"
means a terrain reference with precomputed records, not a safe landing point.

The science step compares regional slope, project terrain screen, terrain
evidence confidence, overall suitability/confidence, missing water evidence,
and unresolved radiation/shielding. Selected-site observations, provenance,
source versions/hashes and limitations are read from `GET /api/sites/{id}`.
Medium terrain support is never displayed as overall habitability confidence.
Changing a candidate cancels previous requests and checks response IDs before
showing route geometry or selected-site details.

The habitat/greenhouse preview is original vector concept art annotated with
the selected site's real name/coordinates. It is the same illustrative concept
for either site, not a reconstructed terrain model or site-engineered design.
No dimensions, shielding effectiveness, temperature control, crop yield,
structural integrity or life-support capability is asserted. The UI labels
the art as illustrative and not engineering-validated beside the preview.

Historical Mars Odyssey THEMIS product-label context was added separately:
`I03114002BTR`, observed in 2002, has a whole-frame label range of
235.900–242.383 K. See `docs/data-sources.md` for verification and reproduction.
This is not a local candidate temperature and does not fill the missing thermal
factor, change scores, alter confidence or modify routes.

THEMIS spatial integration uses the official ODE product footprint, normalized
from signed east longitudes to 0–360 and registered to the same Mars map
projection. All three existing sites are within the approximate polygon.
Only catalog coverage is established: its 0.001-degree vertices, unknown
boundary accuracy and absence of pixel geolocation prevent local-temperature
claims. An optional purple map overlay is separate from route/site geometry.
See `docs/data-sources.md` for coordinate handling and exact source links.

The API packages this optional context independently. If it is absent, the
context panel reports unavailability while MOLA site analysis and routing remain
usable. API responses and the UI retain the existing scientific caveats.
No Phase 5.1 route, assessment, input, site ID or coordinate was regenerated.

Phase 6 verification: 20 Python tests and six API checks passed; frontend
TypeScript/Vite production build and API build passed. Browser interaction
verified the complete five-step path for both original candidates, source
details, the supported-only start selector, preserved 11.62 km / 11.16 km
routes, and site-specific illustration labels. At 390 px viewport width the
page did not overflow; comparison content scrolled within its table panel.
Live requests through the Vite proxy verified start discovery, both site/route
records and historical THEMIS context. Existing input/assessment/route artifacts
have no changes relative to the preserved staged Phase 5.1 work.

The final spatial-integration check exercised the THEMIS checkbox, the official
footprint provenance, both candidate journeys, keyboard activation of the next
step, and mobile preview/comparison reflow. No console errors were captured in
that browser run. Live HTTP checks through Vite verified both response geometries
against the offline artifact and rejected an unsupported origin with 404.
Re-running `build_routes.py` against the existing verified raster cache reproduced
`routes.geojson` byte-for-byte (SHA-256
`8cbe7f9cf022115def811af7fcfb2ad19c54c060bced566c34d51a57e095ac28`).

Remaining engineering limitations: the map is a Mars coordinate grid without
imagery, there is one supported start, and the browser app is a local MVP.
Vite reports a bundle-size advisory (about 525 kB before compression), and the
existing local Functions storage-health warning persists. No Azure deployment
or production performance verification was performed.

## Phase 5.1: connected routes and interactive map

**Root cause of Phase 5 unavailability:** the 54x54 regional MOLA grid has
2,916 finite topography values, 893 cells with direct observations and 2,023
zero-count cells. Requiring direct shots in every 3x3 slope neighborhood left
only 45 isolated cells. This was a restrictive evidence mask, not a lack of
usable gridded elevations or an A* connectivity defect. The official PDS4
[label](https://pds-geosciences.wustl.edu/mgs/urn-nasa-pds-mgs_mola_topography_derived/meg128/megt44n180hb.xml)
specifies that interpolated values are supplied where no shots lie in a bin.
This pipeline uses those supplied values; it does not invent local gap fills.

The exact NASA products remain MEGT44N180HB (meters relative to the MOLA
areoid) and MEGC44N180HB (observation counts). Their regional raster SHA-256s
are checked against the candidate-selection provenance before routing. No
site coordinates, candidates, scientific scores or confidence levels changed.
The start is still `arcadia-sample-01`, at 194.83984375 E, 37.98828125 N;
it is an illustrative scouting origin, not a verified landing location.

### Terrain rules and deterministic A*

`mola-astar-1.1.0` uses the configuration in `pipeline/config/routing.json`:

- Use finite MOLA values inside the product's documented global elevation
  range [-8208, 21249] m. Respect declared nonzero NoData. Zero elevation with
  a zero observation count remains ambiguous under the supplied ENVI ignore
  convention and is excluded; an observed zero remains valid. No ambiguous
  zero elevations occur in the actual window (range -3987 to -3942 m).
- Allow directly observed and product-interpolated elevations, but keep their
  count metadata separate. Compute central-difference regional slope over
  complete valid 3x3 neighborhoods, with cosine correction for east-west
  spacing. Exclude the 212 outer cells lacking complete neighborhoods;
  2,704 interior cells now have usable slopes. No extent expansion was needed.
- The uncertainty descriptor at a cell is the fraction of its 3x3 neighbors
  with zero direct observations. It describes data support, not a probability
  or calibrated measurement uncertainty.
- Eight-neighbor edge cost is `distance * (1 + 10*(steepness/10)^2 + 2*u)`.
  `u` is the mean of both endpoint neighborhood interpolation fractions.
  Steepness is the maximum of both regional slopes and the inter-cell grade.
  Exclude slopes/grades above 10 degrees; prohibit diagonal corner cutting
  across invalid/excluded cells. Both penalty coefficients and the slope
  limit are explicit project screening assumptions, not certified safety limits.
- Distances and the admissible A* heuristic use PyProj geodesics on the same
  3,396,000 m Mars sphere. Nonnegative penalties keep the direct-distance
  heuristic a lower bound. Fixed neighbor order and heap cost/row/column
  tie-breaking produce deterministic output. No randomness is used.
- Start/destination are mapped to their containing MOLA cells without searching
  for a more convenient endpoint. Geometry uses exact requested site
  coordinates for the first/last vertex and cell centers in between. Endpoint
  elevations remain the containing-cell samples; offsets to cell centers are
  recorded. The current endpoints are at cell centers to sub-millimeter precision.

Distance is the sum of surface geodesic segment lengths. Elevation gain sums
positive gridded elevation changes. Maximum slope includes regional slope and
edge grade; mean regional slope is the unweighted mean over visited cells.
Evidence coverage records direct/interpolated visited cells, distance with at
least one interpolated endpoint, and mean slope-neighborhood interpolation.
A route with zero interpolated vertices may still depend on interpolated
neighbors for slope estimation; these two coverage measures are deliberately
reported separately.

### Actual results

| Original destination | Distance | Elevation gain | Maximum slope | Direct/interpolated cells | Distance touching interpolation |
|---|---:|---:|---:|---:|---:|
| arcadia-mola-r793-c1903 | 11620.799 m | 25 m | 0.552126 degrees | 24 / 1 | 9.0617% |
| arcadia-mola-r746-c1895 | 11155.337 m | 40 m | 0.866069 degrees | 24 / 0 | 0% |

Mean neighborhood interpolation is 13.3333% and 6.9444%, respectively. Both
routes are **provisional**. These values come from the actual hash-verified
MOLA regional rasters, not synthetic grids or hardcoded demonstration paths.
The same bounded area, start and original two candidates were retained.

**IMPORTANT:** Coarse orbital topography cannot resolve boulders, small
craters, soil bearing capacity or vehicle-scale hazards. Interpolation can
smooth hazards and has no provided local error bounds. Routes are not safe,
certified or operational navigation paths. SWIM, radiation, shielding and
other environmental evidence remain unresolved. Overall habitat suitability
and confidence remain Unknown. Unavailable results still use null geometry
and metrics if valid terrain cannot connect a requested pair.

### Contracts, frontend and reproduction

The route artifact schema is now `phase5-routes/1.1.0`, adding evidence coverage
and mean slope, and planner parameters for product interpolation. The API
v2 envelope and existing site responses remain unchanged. Build packaging
validates the route schema, assessment SHA-256, endpoint geometry and source
provenance, then copies the artifact byte-for-byte. TypeScript serves records;
it does not run A*, scientific scoring or NASA downloads.

The former minimal React/TypeScript/Vite/OpenLayers frontend lived in `web/`.
It uses the actual `/api/sites` and `/api/routes` responses, with request
cancellation, loading/error states, known-site start/destination selectors,
clickable candidate markers, route lines, metrics, evidence coverage and hazard
warnings. Other starting pairs have no precomputed route; the UI reports the
API error and clears the previous path. Map coordinates use the same Mars
spherical equirectangular display projection as MOLA. It is a coordinate grid,
not an Earth map or an imagery basemap. No site is moved to make a path work.

```powershell
pipeline/.venv/Scripts/python.exe pipeline/src/build_routes.py
$env:PYTHONPATH = "pipeline/src"
pipeline/.venv/Scripts/python.exe -m unittest discover -s pipeline/tests -v
npm --prefix api test
```

If caches are absent, the routing command retrieves only the original small
PDS byte ranges; `--refresh-mola` explicitly refreshes them. Source hashes must
still match. Run Functions on port 7071. The independent frontend should proxy
`/api` to that host; see `docs/FRONTEND_HANDOFF.md` for current setup.

Verification includes Python routing/count/NoData/penalty tests, actual route
geometry and metric integrity, API schema/packaging checks, frontend TypeScript
and production build, and browser interaction with both routes, marker
selection and unavailable pairs. Synthetic grids are used only in unit tests.
The existing Core Tools AzureWebJobsStorage health warning persists despite
successful HTTP requests; deployed Azure health remains unverified. Nothing
was deployed, committed or pushed.

Phase 5.1 verification evidence: all 18 Python tests and four API checks passed.
Independent haversine segment sums agree with exported geodesic distances
within 0.00001 m; raw raster elevation gains, observation counts, cell adjacency
and exact geometry endpoints were checked for both routes. Re-running the
offline command produced the identical route artifact SHA-256
`8cbe7f9cf022115def811af7fcfb2ad19c54c060bced566c34d51a57e095ac28`.
The frontend TypeScript/Vite production build passed. Live requests through
the Vite proxy matched the packaged features byte-for-data, and browser checks
displayed both polylines/metrics, candidate selection, zoom and unavailable
starting pairs on desktop/mobile layouts without console errors. Existing
Phase 3 input/assessment files remain unchanged. The frontend bundle is about
506 kB before gzip (153 kB compressed); Vite emits a size advisory, not a build
failure. No deployment or production performance claim is made.

## Automatic terrain candidate selection

**IMPORTANT:** Selection version `mola-selection-1.0.0` replaces two manual
sampling points with terrain-selected candidates. It preserves predefined
`arcadia-sample-01` and its original coordinates. Selection is a regional
terrain exploration step; it does not establish habitability. The existing
`screening-1.0.0` and `evidence-rules-1.0.0` models remain unchanged.

1. Read `pipeline/config/candidate_selection.json`. Search bounds are
   194.8–195.2°E, 37.8–38.2°N in the same Mars coordinate convention as Phase 2.
   Fetch only regional byte ranges of official MOLA topography
   `MEGT44N180HB` and matching counts `MEGC44N180HB`, plus a one-cell slope
   margin. No new instrument/dataset, SWIM recovery or global download occurs.
2. Enumerate interior pixel centers inside the bounds. Require at least one
   direct observation in **every** cell of the 3x3 neighborhood. Reject missing
   or non-finite slopes. Use the existing latitude-corrected MOLA slope routine
   without changing scientific normalization. Valid observed zero elevations
   remain valid. Margin cells may lie just outside the search bounds.
3. Order eligible cells by ascending slope, descending minimum neighborhood
   count, descending center count, then ascending absolute tile row/column.
   Counts break ties, rather than creating a new weighted quality score.
4. Exclude cells within 3,000 m of the reference. Take the first feasible pair
   in lexicographic rank order whose members are at least 3,000 m apart. Use
   PyProj spherical geodesic distance on the same 3,396,000 m Mars sphere.
   This deterministic pair search does not claim a globally optimal slope sum.
   Fail explicitly if no pair exists; never relax quality or distance rules.
5. Extract all three sites through the existing Phase 2 reader, run the existing
   Phase 3 assessment CLI, and rebuild the API artifact. No live API calculation.

The 3 km spacing and one-count eligibility threshold are project sampling
choices, not NASA safety criteria. A 0.4-degree search is spatially limited and
biased toward lower slopes with available orbital coverage. Small differences
in regional slopes do not demonstrate better local habitat conditions. The
selected centers have one and two observations; observed neighborhoods still
lack measurement uncertainties and habitat-scale validation. SWIM remains
unavailable and radiation risk/shielding remain unresolved.

`pipeline/candidate_selection.json` records the actual eligible count, selected
cells, slope/count evidence, separations, product IDs, parameters and regional
raster hashes. This report is also carried in the MOLA source provenance of
the input/assessment artifacts, so API details expose the discovery method
using existing source metadata fields.

Reproduce from the repository root:

```powershell
pipeline/.venv/Scripts/python.exe pipeline/src/select_candidates.py
pipeline/.venv/Scripts/python.exe pipeline/src/build_site_assessments.py
npm --prefix api test
```

The selection command needs access to the official PDS host and writes
`pipeline/config/selected_sites.json`, `pipeline/candidate_selection.json`,
and `pipeline/site_inputs.json`. Raw regional rasters remain ignored under
`pipeline/data/selection/`. Repeated selection on identical rasters/configuration
returns the same grid-cell IDs; retrieval timestamps can differ. The original
manual config remains available in `pipeline/config/study_region.json`.

**IMPORTANT — API coordination:** v2 schema and routes are unchanged. New
site IDs encode tile row and column: `arcadia-mola-r793-c1903` and
`arcadia-mola-r746-c1895` for this run. Old `arcadia-sample-02` and
`arcadia-sample-03` are retired and return 404; no alias silently assigns their
IDs to different coordinates. Consumers must discover current IDs through
`GET /api/sites`. The reference remains `arcadia-sample-01`. Restart an existing
Functions worker after rebuilding, because it caches the artifact.

Verified run: 45 eligible cells from 8,748 source bytes. Selected cells are
21,958.69 m apart and 11,209.09 m / 10,749.66 m from the reference. Their slopes
are 0.12373338° / 0.16910413°; the reference remains 0.15699468°. All three have
Medium terrain evidence support under the unchanged confidence rules, and
Unknown overall evidence confidence and null overall suitability. Essential
checks passed: neighborhood rejection, deterministic ordering/separation,
actual-data re-selection with reversed enumeration, unchanged reference
inputs, Phase 3 sanity checks, and API build/record-integrity checks.

## Evidence and scope

**IMPORTANT:** Results are reproducible screens of three Arcadia sampling
points, not ranked habitat recommendations. The engine reads only the existing
`pipeline/site_inputs.json`; no network, ingestion, raster processing, API
changes or deployment occurs in this phase. NASA product references and raster
hashes are copied into the export. Trust is inherited from the Phase 2 artifact;
the assessment does not independently authenticate the original raster bytes.

MOLA products `MEGT44N180HB` and `MEGC44N180HB` provide topography, counts and
regional slope evidence. The slope is derived at about 463 m projected pixel
spacing from a 3x3 neighborhood, with cosine correction for east-west ground
spacing. Altimeter counts describe sampling, not accuracy or confidence
probability. Elevation is retained as context, without an invented altitude
preference. Source metadata and orbital data cannot establish local bearing
capacity, roughness, boulder hazards or construction feasibility.

**BLOCKER:** SWIM4IMIM 0–1 m ice-consistency data was not retrieved in Phase 2.
Water scores and overall suitability remain null. Radiation, shielding, solar,
thermal and geotechnical evidence are also missing. Radiation review is always
`insufficient-evidence`, risk `unknown`, shielding `unresolved`, and dose null.
The engine does not infer safety or calculate radiation transport.

## Configurable screening model

`pipeline/config/assessment_model.json` records `screening-1.0.0`. Weights are
terrain 0.5 and water 0.5 and must be positive and sum to 1. These weights and
the 10-degree normalization anchor are **project assumptions**, not NASA
standards or scientifically established habitat safety limits. Change the
version whenever their meaning or parameters change.

- Terrain score = `100 * max(0, 1 - regionalSlopeDegrees / 10)`.
  Valid input is a finite 0–90 degree derived MOLA slope with available source,
  product reference, raster hash and matching units. Zero slope scores 100;
  slopes at/above the configurable 10-degree anchor score zero. This is an
  exploratory preference for less regional relief; it cannot certify safety.
- Water score = `50 * (Ci + 1)` for nonzero, finite SWIM indices in [-1, 1],
  with available source, raster hash, reference and matching dimensionless
  units. This is a monotonic screening transformation, not ice quantity or
  probability. Zero remains unscored because SWIM documents it as inconclusive
  or absent evidence. NoData -30, null and invalid inputs remain unscored.
  Product semantics: [SWIM explanation](https://swim.psi.edu/about.php?section=overview)
  and [current product listing](https://swim.psi.edu/SWIM4MIMProducts.php).
- Factor contribution = `weight * factorScore`. Missing contributions are
  null; **weights are never redistributed**. `availableWeight` is model input
  completeness only, never confidence. A weighted `modelScore` is emitted only
  if both factors are supported. Even then this limited two-factor model is
  not complete habitat suitability: `suitability.score` remains null and
  `overallStatus` unknown while critical environmental review is absent.

## Evidence confidence (independent of suitability)

`evidence-rules-1.1.0` provides qualitative, configurable engineering rules.
They are not a calibrated uncertainty model. Lowercase wire levels correspond
to High/Medium/Low/Unknown. No confidence probability is produced.

- Unknown: usable observation, units or provenance missing; for terrain also
  missing resolution or valid count evidence.
- High terrain support: all 3x3 cells directly observed, center count at least
  10, projected pixels at most 100 m. The current MOLA product cannot meet this
  resolution threshold. High is relative evidence support only.
- Medium terrain support: all 3x3 cells directly observed, positive center
  count, projected pixels at most 1,000 m, with product/count provenance.
- Low terrain support: usable evidence with coarser resolution or interpolated/
  unknown neighborhood support. Missing uncertainty and independent local
  validation are reported for every level.
- Water support: Unknown if missing/zero/inconclusive; capped at Low for a
  valid nonzero SWIM composite until constituent coverage, quality and local
  validation are available. A composite value alone cannot demonstrate these.
- Overall habitat evidence stays Unknown while critical safety/environmental
  inputs are unresolved. Terrain/water factor confidence and screening coverage
  cannot establish complete habitat evidence, even when both are available.

## Reproduction and integration

From the repository root, using the existing Python environment:

```powershell
pipeline/.venv/Scripts/python.exe pipeline/src/build_site_assessments.py
$env:PYTHONPATH = "pipeline/src"
pipeline/.venv/Scripts/python.exe -m unittest discover -s pipeline/tests -p test_assessment.py -v
```

No dependencies beyond the existing pipeline environment are needed. CLI
`--input`, `--config`, `--output` override the default paths. Export includes the
input SHA-256, full configuration, scoring/confidence versions, unchanged
IDs/coordinates/observations, factor explanations and source records.

**IMPORTANT:** `phase3-site-assessments/1.0.0` follows the planned API scientific
record names (`location`, `suitability`, `evidenceConfidence`, `radiationReview`,
`sources`). It is not accepted by the current placeholder-only API schema.
Future integration must coordinate version/status and observation-map changes
with the frontend; do not relabel scientific data as placeholders to satisfy
the old schema. No API implementation or contract is changed here.

Essential checks cover real sample missing-water behavior, normalization
boundaries, no weight redistribution, synthetic future SWIM inputs, quality
degradation, confidence independence and invalid configuration. Synthetic test
mutations are never written to the scientific output.
