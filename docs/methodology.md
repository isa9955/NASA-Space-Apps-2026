# Phase 3 assessment methodology

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
