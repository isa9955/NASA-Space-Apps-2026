# Phase 3 assessment methodology

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

`evidence-rules-1.0.0` provides qualitative, configurable engineering rules.
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
- Overall evidence confidence is the weakest required terrain/water level.
  Missing water therefore yields Unknown even with Medium terrain evidence.

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
