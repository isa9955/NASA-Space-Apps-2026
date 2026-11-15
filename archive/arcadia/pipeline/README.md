# Phase 2: NASA raster ingestion

## Independent Deuteronilus build / canonical artifacts

The teammate's offline project is preserved in `api/mars-blindspots/` and is
excluded from Functions publishing. Install its requirements in the Python
environment before running its tests. From repository root:

```powershell
pipeline/.venv/Scripts/python.exe -m pip install -r api/mars-blindspots/requirements.txt
pipeline/.venv/Scripts/python.exe pipeline/src/build_deuteronilus_analysis.py
# Optional small, bounded NASA source checks (~841 kB)
pipeline/.venv/Scripts/python.exe pipeline/src/build_deuteronilus_analysis.py --verify-source
npm --prefix api test
```

The build validates source-audited metadata/grid hashes, official projection
alignment and all nominal/robust RLE mask areas, then computes only the fixed
reference routes and geometric scouting/science candidates offline. It writes
`deuteronilus_analysis.json`; the API serves this compact artifact separately
from Arcadia. Full raw data regeneration remains unverified; see
`docs/INTEGRATION_ARCADIA_DEUTERONILUS.md` for exact scope and limitations.

**IMPORTANT:** `.gitattributes` and Python writers require LF JSON/GeoJSON.
Regenerate assessments before routes after any input/provenance update; strict
snapshot hashes must match on Windows and Linux. Do not manually change hashes.
This serialization correction does not alter Arcadia sites or route features.

## Phase 6.2: water-ice import and current blocker

**BLOCKER:** SWIM4IMIM and legacy catalogs still return HTTP 523; the NASA Mars
Water Maps URL cited by the 2025 paper returns 404. No water raster or new
water observations were recovered. Existing water values remain null.
See `docs/data-sources.md` for exact sources and validation limitations.

After obtaining and independently identifying the official numeric SWIM4IMIM
0–1 m GeoTIFF, use this command with the real file URL/hash (arguments below
are descriptive placeholders, not working product URLs or measurements):

```powershell
pipeline/.venv/Scripts/python.exe pipeline/src/integrate_swim.py `
  --raster path/to/official-product.tif `
  --source-url 'https://swim.psi.edu/ACTUAL-OFFICIAL-PRODUCT-PATH.tif' `
  --expected-sha256 ACTUAL_RECORDED_64_CHARACTER_SHA256
pipeline/.venv/Scripts/python.exe pipeline/src/build_site_assessments.py
pipeline/.venv/Scripts/python.exe pipeline/src/build_routes.py
npm --prefix api test
```

The import checks the pinned hash before modifying inputs and records raster
georeferencing/sampling metadata. It preserves all existing sites and MOLA
data. Do not use `build_site_inputs.py` with its old default manual sample
configuration to recover water for the selected candidate artifact. No local
gap filling or numerical extraction from color browse images is supported.
Raw files remain under ignored `pipeline/data/`. Route regeneration refreshes
the assessment provenance; it must not change preserved paths/metrics for a
water-only update. Check exact equality of route features before accepting it.
No TypeScript scientific calculations or API contract changes are required.

Phase 6 optional mission context: run
`pipeline/.venv/Scripts/python.exe pipeline/src/build_mission_context.py` to
reproduce `mission_context.json` from the official archived THEMIS image label
and ODE footprint KML, including approximate site coverage in Mars coordinates.
This approximately 1.1 MB observation is historical whole-frame context only;
it does not change site inputs, scoring, confidence or routes. See
`docs/data-sources.md` for provenance, units and limitations.

Phase 5 offline routing: run
`pipeline/.venv/Scripts/python.exe pipeline/src/build_routes.py` to write
`pipeline/routes.geojson`, then `npm --prefix api test` to validate/package it.
The preserved reference is the route start. Both current candidates have provisional routes using observed and
product-interpolated MOLA elevations with explicit uncertainty penalties. See `docs/methodology.md` for A* costs, assumptions, provenance
and reproduction; no safe route is implied.

For automatic terrain discovery, run
`pipeline/.venv/Scripts/python.exe pipeline/src/select_candidates.py`, then the
assessment command below and `npm --prefix api run build`. The selector
preserves `arcadia-sample-01`, replaces samples 02/03 with grid-cell IDs, and
writes `config/selected_sites.json` plus `candidate_selection.json`. The
original `config/study_region.json` remains the manual baseline; running the
ingestion command with that original config restores manual sampling inputs.
Use the selector command to reproduce the current automatically selected set.

Phase 3 now consumes this artifact offline. Run
`pipeline/.venv/Scripts/python.exe pipeline/src/build_site_assessments.py` from
the repository root to produce `pipeline/site_assessments.json`. See
[`docs/methodology.md`](../docs/methodology.md) for scoring assumptions,
confidence rules, limitations and essential checks. The ingestion described
below remains unchanged.

This offline pipeline extracts source observations only. It does not calculate
suitability or evidence confidence, and it does not calculate radiation, routes,
or pathfinding.

## Sources and study window

- **SWIM4IMIM Combined Ice Consistency Map (0–1 m)**, listed on the official
  [SWIM data products](https://swim.psi.edu/SWIM4MIMProducts.php) page (last
  updated 2025-08-04).
  Its published GIS guidance specifies simple cylindrical projection, spherical
  Mars, approximately 3,000 m pixels, east longitude 0–360°, latitude 60°S–60°N,
  and NoData `-30`. The Arcadia study region is within this coverage. The SWIM
  number is a dimensionless, derived consistency index, not a direct ice
  abundance or depth measurement. Use its official GeoTIFF; do not use a color
  browse image for extraction.
- **MOLA MEGDR topography** tile `MEGT44N180HB` and matching observations-count
  tile `MEGC44N180HB`, from the official [NASA PDS Geosciences Node MOLA
  archive](https://pds-geosciences.wustl.edu/missions/mgs/megdr.html). The tile
  covers 180–270°E and 0–44°N. The PDS4 labels specify planetocentric,
  positive-east, body-fixed coordinates on a 3,396,000 m Mars sphere; the
  topography values are signed 16-bit big-endian meters relative to the MOLA
  areoid, and the matching counts are unsigned 8-bit observation counts. The
  raster is 128 pixels/degree (about 463.058 projected m/pixel). Its PDS label
  describes interpolation where a bin has no observations. The supplied ENVI
  header marks `0` as an ignore value, so ingestion reads the count tile too:
  zero count means no direct altimeter observation; a zero topography with
  positive count remains a valid elevation.

The configured Arcadia sample window contains three MOLA count-supported grid
cell centers in the SWIM study coverage. These are extraction sample points,
not ranked habitat candidates. See `config/study_region.json` for exact
coordinates and conventions. MOLA slope is a 3x3 central-difference estimate;
east-west ground spacing is scaled by `cos(latitude)` for the spherical
equirectangular grid. The output labels slopes that touch interpolated cells.

## Setup and run

Requirements: Python 3.10+, `curl` (used to request bounded HTTP byte ranges
from PDS), and network access to the official PDS host.

From `archive/arcadia/` in PowerShell (commands below are relative to that archive):

```powershell
python -m venv pipeline/.venv
pipeline/.venv/Scripts/python.exe -m pip install -r pipeline/requirements.txt
$env:PYTHONPATH = "pipeline/src"
pipeline/.venv/Scripts/python.exe -m unittest discover -s pipeline/tests -v
pipeline/.venv/Scripts/python.exe pipeline/src/build_site_inputs.py `
  --swim-raster path/to/official-swim-arcadia-geotiff.tif `
  --output pipeline/site_inputs.json
```

The MOLA reader requests only selected rows and columns of the regional PDS
tiles using HTTP Range; it refuses to fall back to a full-tile download. The
small clipped working rasters are cached in ignored `pipeline/data/` and are
not committed. The exported `pipeline/site_inputs.json` records observation
values, units, coordinate reference, data availability, product provenance,
and limitations. It is a Phase 2 offline artifact and does not modify the API
contract.

If the official SWIM GeoTIFF cannot be retrieved, run without `--swim-raster`
and provide a reason with `--swim-retrieval-note`. The export will mark SWIM
unavailable and retain null SWIM values; it will never substitute image-read
or guessed values. Supplying a local official raster later requires rerunning
the command to populate SWIM observations.

## Current retrieval limitation

During the 2026-11-14 implementation, the SWIM project host returned HTTP 523
and later timed out. SWIM product format, coverage, units, and NoData were
verified from the official product page/search index, but no SWIM raster could
be downloaded in this environment. Therefore `site_inputs.json` contains
actual MOLA product values and count evidence, while all SWIM values are null
and marked `not-retrieved`. The SWIM extraction path is implemented and tested
against small synthetic GeoTIFFs; real SWIM extraction remains blocked until
the official GeoTIFF is available.
