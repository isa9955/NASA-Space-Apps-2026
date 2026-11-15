# Verified NASA sources

## Deuteronilus HiRISE source audit

The official [DTM product](https://hirise.lpl.arizona.edu/PDS/DTM/ESP/ORB_041200_041299/ESP_041222_2210_ESP_040787_2210/DTEEC_041222_2210_040787_2210_A01.IMG)
label and three small numeric source ranges were independently checked. See
`pipeline/deuteronilus_source.json` for exact CRS, NoData, byte ranges, hashes
and sample means, and [the integration report](INTEGRATION_ARCADIA_DEUTERONILUS.md)
for crop/grid alignment and verification limits. Credit: NASA/JPL/UArizona;
the source image is [ESP_041222_2210](https://hirise.lpl.arizona.edu/ESP_041222_2210)
and stereo partner ESP_040787_2210. The full raw SHA in the teammate's
`api/mars-blindspots/data/RAW_DATA.md` is retained as reported, not independently
verified. No full DTM/ortho download or regeneration was performed here.

**IMPORTANT:** Baker & Carter regional context retains its original attribution
and CC BY 4.0 notice in RAW_DATA.md; it is not promoted to local ice detections.
The draft ice polygons are AI-assisted interpretations, not measurements.
Uncertainty and zone/illumination outputs depend on stated model assumptions.

## Phase 6.2 SWIM retrieval investigation — BLOCKER

On 2026-11-14, direct HTTPS requests from this environment returned:

| Official source | Result |
|---|---|
| [SWIM4IMIM product catalog](https://swim.psi.edu/SWIM4MIMProducts.php) | HTTP 523; curl exit 22. Response header date: 2026-11-14 22:46:20 UTC. |
| [Legacy SWIM 2.0 catalog](https://swim.psi.edu/SWIM2Products.php) | HTTP 523; not a substitute release. |
| [NASA Mars Water Maps](https://ammos.nasa.gov/marswatermaps/?mission=MWR), linked in the 2025 paper | HTTP 404. |

The official catalog's search-index copy identifies the preferred Combined Ice
Consistency Map (0–1 m), updated 2025-08-04, and documents simple cylindrical
spherical Mars, approximately 3,000 m pixels, 0–360 east longitude, 60 S–60 N,
and NoData -30. This is **catalog metadata**, not validation of a retrieved
raster. [Morgan et al. 2025](https://doi.org/10.3847/PSJ/ad9b24), also listed by
[USGS](https://www.usgs.gov/publications/refined-mapping-subsurface-water-ice-mars-support-future-missions),
identifies the SWIM website and JPL MMGIS as data access points. No verified
working numeric raster mirror was identified during this investigation.
NASA Photojournal SWIM TIFF/JPEG figures are browse graphics and were not used
for numerical extraction. No origin bypass, third-party raster or guessed
download URL was substituted.

**BLOCKER:** No SWIM raster was retrieved. Its file SHA-256, embedded Mars CRS,
actual bounds/alignment, pixel values, scales, masks and NoData cannot be
verified yet. All three existing Arcadia water observations remain null;
the input artifact remains unchanged. No new water measurement or ice-resource
claim was produced. Failed-request headers are cached locally under ignored
`pipeline/data/`; a failed HTML response is never hashed as a science raster.

The new `pipeline/src/integrate_swim.py` is an offline import path for a future
**independently verified official SWIM4IMIM 0–1 m GeoTIFF**. Record the actual
official file URL and its independently recorded SHA-256. A hash pins bytes
for reproduction; it is not proof of scientific identity or a publisher
checksum unless the publisher supplies one. The import validates single-band
numeric georeferencing, spherical Mars simple cylindrical CRS in meters,
approximately 3 km north-up cells, unscaled values, NoData -30, coverage and
sampled values in [-1,1]. It records WKT, affine transform, shape, resolution,
bounds, file hash and each site's containing native raster cell. It does not
require SWIM to align to MOLA pixels or resample one grid onto the other.
The radius gate (3,390–3,400 km, spherical) is a wrong-body check, not validation
of the exact publisher datum; inspect the exported WKT against the actual
product documentation before accepting a recovered raster. The current import
has only been tested with synthetic rasters, never a real retrieved SWIM file.

**IMPORTANT:** Ice consistency is a dimensionless derived agreement index.
The 0–1 m label is a sensing-depth interval, not a measured ice-table depth.
The index is neither ice probability nor abundance, thickness, purity, confirmed
accessibility or habitability. A zero is retained as an observation but is
unscored/inconclusive; missing/masked/-30 data remain null.

## Mars Global Surveyor / MOLA (existing science and routes)

The existing `MEGT44N180HB` topography and `MEGC44N180HB` observation-count
artifacts remain unchanged in Phase 6. See `docs/methodology.md` and the
assessment/route JSON provenance for units, coordinate conventions, regional
raster hashes, interpolation treatment and limitations. No new MOLA sampling,
site relocation, scoring or route calculation was performed in this phase.

## Mars Odyssey / THEMIS (Phase 6 historical context)

The official PDS Orbital Data Explorer query for 194.8–195.2 degrees east,
37.8–38.2 degrees north found product `I03114002BTR`. Its image strip intersects
the search region; the frame center is outside the small MOLA window. The
footprint was checked in ODE's product KML. No claim is made that an extracted
pixel measures a candidate location.

The exported `mission-context/1.1.0` also includes that official KML's polygon
and SHA-256. Its signed longitudes are converted with `longitude % 360`;
planetocentric latitudes are retained. KML altitude 100 is a display offset
and is discarded, never interpreted as elevation. The polygon is displayed
in the same Mars spherical equirectangular projection as MOLA (radius 3,396 km,
central meridian 180 degrees). This is a display registration of catalog
coordinates, not orthorectification of the unprojected THEMIS image.

All three current sites fall inside the approximate polygon. The coverage
check uses point-in-polygon on this small non-wrapping region; it does not
establish pixel validity, local measurement quality or thermal suitability.
ODE publishes these footprint vertices to 0.001 degree, so boundary precision
is limited to roughly tens of meters, in addition to unquantified footprint
accuracy. The optional purple map overlay shows catalog coverage only; it
does not display temperature imagery or affect map fitting or route geometry.

- Dataset: `ODY-M-THM-3-IRBTR-V1.0`.
- Authoritative attached-label product version: **1.5**. The live search index
  can report a different version; the archived image label is used here.
- Observation start: **2002-08-27T23:03:45.626Z**.
- Band 9, center wavelength 12.57 micrometers.
- Center: 194.409 degrees east, 36.6823 degrees planetocentric latitude.
- Label pixel resolution at the observation center: 105.106 by 99.151 m.
- Whole-observation label brightness-temperature range: **235.900–242.383 K**.
- Product: [official archived image and attached PDS label](https://static.mars.asu.edu/pds/ODTSDP_v1/data/odtib1_0003/i031xxbtr/I03114002BTR.IMG).
- [Official ODE IRBTR description and Kelvin units](https://ode.rsl.wustl.edu/mars/pagehelp/Content/Missions_Instruments/Mars_Odyssey/THEMIS/ODTSDP/IR/IRBTR.htm).
- [THEMIS brightness-temperature algorithm](https://pds.nasa.gov/data/ody-m-THEMIS/document/BrightnessTempRecord.pdf).
- [Official ODE product footprint](https://ode.rsl.wustl.edu/mars/datafile/kmlfiles/ody-m-thm-3-irbtr-v1/odtsdp_v1/data/odtib1_0003/i031xxbtr/i03114002btr_img.kml).

`pipeline/src/build_mission_context.py` reads the attached label, checks product
identity/file length and reasonable label-range ordering, and exports
`pipeline/mission_context.json` with a SHA-256 of the full source product and
the exact discovery query URL. It downloads only this approximately 1.1 MB
product and approximately 3 KB KML if absent; both stay under ignored
`pipeline/data/`. Reproduce:

```powershell
pipeline/.venv/Scripts/python.exe pipeline/src/build_mission_context.py
npm --prefix api run build
```

**IMPORTANT:** These are historical, whole-observation label statistics, not
candidate-site temperature measurements, air temperatures, current climate,
thermal inertia, or greenhouse inputs. The BTR algorithm assumes emissivity
1 and atmospheric opacity 0. No geolocated pixel extraction or site-specific
thermal analysis was implemented. Context is shown separately and is not used
in suitability, confidence or route calculations. Site-specific thermal
evidence remains missing.

**BLOCKER:** SWIM remains unavailable, and no verified radiation/shielding
dataset has been integrated. Overall habitat suitability and evidence
confidence remain Unknown. No habitat, route or greenhouse performance is
certified by these data.
