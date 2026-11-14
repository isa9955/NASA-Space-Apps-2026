# Mars Blindspots — Back-end (Deuteronilus Mensae)

Python code and processed data for: slope and slope uncertainty, traversability, standard vs safe A* routes, scout
points, science candidates, and habitability zones (habitat, landing pad, ice access, greenhouse, data center, solar).

Source repo: https://github.com/allison-mk/mars-blindspots (branch `deuteronilus`, which also has the Leaflet viewer).
This folder is a self-contained Python project. It is **not** part of the Azure Functions app (listed in
`api/.funcignore`), and run every command below **from `api/mars-blindspots/`**.

## Setup
    cd api/mars-blindspots
    pip3 install -r requirements.txt          # numpy, scipy, matplotlib, rasterio, pytest (Python ≥ 3.9)
    python3 -m pytest -q tests backend/tests  # all tests should pass

## Files
| File | What it does |
|---|---|
| `process_terrain.py` | Terrain math from a HiRISE DTM: slope, slope uncertainty, roughness, traversability, worst case; CRS → lat/lon |
| `grid_mode.py` | Used by `process_terrain.py --crop-window … --grid-step N`: builds everything in `data/deuteronilus/` |
| `zones.py` | Habitability zones (rules in `ZONE_CONFIG`), footprint test, distances, sunlight/shadow model |
| `backend/routing.py` | Standard + safe A* routes, route metrics, scout points, science candidates |
| `backend/zones_to_geojson.py` | Zone masks → smooth GeoJSON polygons for a front end |
| `data/deuteronilus/metadata.json` | Site bounds (lat/lon), grid (800 × 400, 10 m cells), the two slope scales, method notes |
| `data/deuteronilus/data_grid.json` | Per-cell grids (row 0 = north): slope, slope_uncertainty, traversability, trav_worst, elevation (walking scale) |
| `data/deuteronilus/zones.json` | Zone masks (run-length encoded), areas, criteria, chosen base, footprint-scale grids |
| `data/deuteronilus/zones_blobs.geojson` | Display-smoothed zone outlines (areas in properties are the exact mask areas) |
| `data/deuteronilus/*.png` | Map layers: hillshade, HiRISE imagery, slope, traversability, uncertainty (blindspots) |
| `data/RAW_DATA.md` | Raw inputs (not committed): source URLs, sizes, SHA-256 |
| `interpretation/deuteronilus_ice_landform.json` | DRAFT interpreted ice-rich lobe polygons (not a measurement) |
| `scripts/fetch_deuteronilus.sh` | Downloads the raw inputs into `data_raw/` (gitignored) |
| `docs/BACKEND_HANDOFF.md`, `docs/ARCHITECTURE.md` | Pipeline, equations, data contracts, reference values |

## Run
    python3 backend/routing.py data/deuteronilus 600,100 150,300     # start row,col → end row,col (grid cells)
    python3 backend/zones_to_geojson.py data/deuteronilus           # rewrites data/deuteronilus/zones_blobs.geojson
In code: `routing.plan("data/deuteronilus", (600,100), (150,300))` → dict with standard/safe routes + metrics, scouts, science.
Cell ↔ lat/lon: `routing.cell_to_latlon(meta, grid, r, c)` (linear in `metadata.bounds`, row 0 = north).

## Web API for the Mars Site Planner UI
`backend/api_service.py` serves this data to the UI in the shapes defined by `/contracts` (repo root):
`/api/region`, `/api/conditions?lon=&lat=`, `/api/route?from=lon,lat&to=lon,lat`, plus the basemap and zone-mask PNGs.
It reads `data/deuteronilus/` as-is (zones are never recomputed) and calls `backend/routing.py` for routes.

    python -m backend.dev_server        # http://localhost:7071/api/region  (then `npm run dev:live` in ui/)
    python -m pytest -q backend/tests/test_api_service.py

## Regenerate `data/deuteronilus/` (needs the raw data, see `data/RAW_DATA.md`)
    scripts/fetch_deuteronilus.sh
    python3 process_terrain.py --input data_raw/deut_041222_dtm.IMG \
      --crop-window 2500,10500,1500,5500 --grid-step 10 \
      --ice-mask interpretation/deuteronilus_ice_landform.json \
      --ortho data_raw/deut_041222_ortho.JP2 --output data/deuteronilus
    python3 backend/zones_to_geojson.py data/deuteronilus

## Key equations
- Slope θ = arctan‖∇z‖; uncertainty σθ = (√2·0.3 m / 2Δ)/(1+‖∇z‖²) (HiRISE σz = 0.3 m, Sutton et al. 2022); worst case θw = θ + σθ
- Two labelled scales: walking (Δ = 1 m, σθ ≈ ±11°) for blindspots and routes; footprint (Δ = 10 m, σθ ≈ ±1.2°) for zones
- Traversability T = logistic((20°−θ)/3°) · logistic((2 m − roughness)/0.5) · rock factor; Tw = T at θw; gap = T − Tw
- Standard route: A*, step cost = move/(T+0.01), walls where T < 0.05
- Safe route: same, on SAFE = max(0.01, Tw/(1+5·gap))
- Zones: all criteria must pass over a facility-sized footprint; "robust" version uses worst-case slope
- Sunlight: sun position at 40.7°N + terrain shadowing → fraction of full sun (winter and annual)

## Check your results against these (Deuteronilus)
Route (600,100)→(150,300): standard 5,383 m, 7.7% critical blindspots; safe 5,634 m, 3.0%.
Zone areas nominal→robust (km²): habitat 4.18→1.27, landing 1.98→0.39, ice 2.65→2.37, greenhouse 3.38→1.35,
data center 4.66→1.63, solar 2.43→1.85.

## Caveats (keep these in anything you show)
Uncertainty uses one published error value, treated as independent per pixel (likely an overestimate). Zone thresholds
are assumptions. Ice polygons are a draft interpretation; ice depth 1–10 m unknown. Decision support, not a NASA
safety assessment.

## Credits
HiRISE DTM and orthoimage: NASA/JPL/University of Arizona. Baker & Carter 2023 (Zenodo 10.5281/zenodo.7753745,
CC BY 4.0). Sutton et al. 2022 (doi:10.3390/rs14102403) for σz.
