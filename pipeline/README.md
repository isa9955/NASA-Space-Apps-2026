# Phase 2: NASA raster ingestion

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

From the repository root in PowerShell:

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
