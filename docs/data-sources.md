# Verified NASA sources

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
