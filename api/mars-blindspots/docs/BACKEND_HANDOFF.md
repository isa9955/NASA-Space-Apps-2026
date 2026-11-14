# Mars Blindspots — Back-End Handoff (for Team 1)

Everything needed to reproduce slope, uncertainty, traversability, routes, scouts, science candidates and
habitability zones in your own model. Read in this order:

1. **This file** — what to run, what each step does, and reference numbers to validate against.
2. `docs/ARCHITECTURE.md` — full equation catalog (§3), data contracts (§4), split plan (§5), open issues (§6).
3. `CLAUDE.md` in the source repo (github.com/allison-mk/mars-blindspots, branch `deuteronilus`) — project rules,
   Zone math spec, Radiation model spec.

> **In the team repo** this lives at `api/mars-blindspots/`; run every command below from that folder.
> Processed site data is in `data/deuteronilus/` (the source repo calls it `web/sites/deuteronilus/`).

## 0. Setup
```bash
cd api/mars-blindspots
pip3 install -r requirements.txt                         # Python 3.9-compatible code
scripts/fetch_deuteronilus.sh                            # only if you need the raw inputs (see data/RAW_DATA.md)
```
You do NOT need the raw DTM to work on routing/zones: the processed grids are committed in `data/deuteronilus/`.

## 1. Pipeline at a glance
| Step | Code | Input → Output |
|---|---|---|
| 1. Load + crop + georeference | `process_terrain.py: load_real_dtm, crop_bounds, projected_bounds_to_latlon` | HiRISE `.IMG` → elevation array (1 m) + lat/lon bounds |
| 2. Terrain metrics (1 m) | `compute_slope, compute_slope_uncertainty, compute_roughness, compute_traversability` | elevation → θ, σθ, R, T, Tw |
| 3. Grid export (10 m cells) | `process_terrain.py main` (grid mode `--crop-window --grid-step`) | → `data_grid.json`, PNG layers, `metadata.json` |
| 4. Sunlight | `zones.py: horizon_angles, sun_positions, insolation_fraction, seasonal_insolation` | 10 m DEM → S_winter, S_annual |
| 5. Zones | `zones.py: base_grids, compute_zones, choose_base, cell_checklist, summary` | grids + ice mask → `zones.json` |
| 6. Routes / scouts / science | `backend/routing.py` (Python port of the browser JS) | `data_grid.json` → routes, metrics, scouts, candidates |

Regenerate Deuteronilus (≈ several minutes):
```bash
python3 process_terrain.py --input data_raw/deut_041222_dtm.IMG \
  --crop-window 2500,10500,1500,5500 --grid-step 10 \
  --ice-mask interpretation/deuteronilus_ice_landform.json \
  --ortho data_raw/deut_041222_ortho.JP2 --output data/deuteronilus
```
(check `python3 process_terrain.py --help` for the exact grid-mode flags on the current commit)

## 2. The core equations (summary — details in ARCHITECTURE.md §3)
- Slope θ = arctan‖∇z‖ (central differences).
- Slope uncertainty σθ = (√2·σz / 2Δ) / (1 + ‖∇z‖²), σz = 0.3 m (Sutton et al. 2022). Two baselines:
  **walk scale Δ = 1 m** (σθ ≈ ±11°, used by blindspots/routes) and **footprint scale Δ = 10 m** (σθ ≈ ±1.2°, used by zones).
- Worst-case slope θw = θ + k·σθ (k = 1).
- Traversability T = logistic((20° − θ)/3°) · logistic((2.0 m − R)/0.5) · rock factor (Golombek k = 0.06); Tw = T at θw.
- Uncertainty gap = max(0, T − Tw); critical if > 0.5.
- **Standard route:** A* (8-connected), step cost = move/(T + 0.01), walls where T < 0.05.
- **Safe route:** same A* on SAFE = max(0.01, Tw/(1 + 5·gap)).
- Heuristic: octile distance × 1/1.01 (admissible). Walking speed 50 m/min.
- Scouts: largest-gap cells (gap > 0.1) on the standard route, 3–5, spaced along it; reports bypass distance to safe route.
- Science candidates within 200 m: slope local maxima ≥ 28° (outcrop), relief ≥ ±2.5 m vs 9×9 mean (knob/low),
  slope-std ≥ 6° in 5×5 (rough); ≤ 2 per type, ≥ 90 m apart, ≤ 6 total. Geometric candidates, not mapped units.
- Zones: AND of criteria → footprint test (terrain criteria on disk-mean, distance/sunlight criteria on every disk cell)
  → union of passing footprints → connected components. Robust variant swaps θ→θw. Thresholds in `zones.ZONE_CONFIG`.
- Sunlight: δ = asin(sin25.19°·sinLs); sinα = sinφ sinδ + cosφ cosδ cos h; horizon H(az) by ray-marching;
  cos i = cosθ sinα + sinθ cosα cos(az☉ − aspect); S = Σ lit·max(0,cos i)/Σ max(0, sinα).

## 3. Reference values to validate your implementation (Deuteronilus, commit 71189c9)
Grid: 800 rows × 400 cols, cell 10.017 m, bounds lat 40.678–40.814°N, lon 30.140–30.229°E (`metadata.json`).

Route from cell (600,100) → (150,300) via `python3 backend/routing.py data/deuteronilus 600,100 150,300`:
| Route | Distance | Time | Critical-blindspot cells | Mean Tw |
|---|---|---|---|---|
| Standard | 5,383 m | 107.7 min | 7.7 % | 0.460 |
| Safe | 5,634 m | 112.7 min | 3.0 % | 0.489 |
5 scout points; science candidates: knob, low, outcrop, knob, outcrop, rough.

Zone areas (`zones.json`, default base = largest robust habitat component):
| Zone | Nominal km² | Robust km² |
|---|---|---|
| Habitat | 4.18 | 1.27 |
| Landing pad | 1.98 | 0.39 |
| Ice access | 2.65 | 2.37 |
| Greenhouse | 3.38 | 1.35 |
| Data center | 4.66 | 1.63 |
| Solar | 2.43 | 1.85 |
(Areas may shift slightly while the front end is being finished — regenerate and compare.)

## 4. Tests
```bash
python3 -m pytest -q tests/ backend/tests/
```
`tests/test_zones.py` (zone math, insolation on synthetic terrain), `tests/test_crop.py` (crop/CRS),
`backend/tests/test_routing.py` (A*, walls, safe-route behaviour, safe-cost formula).

## 5. Your tasks (suggested)
1. `backend/radiation.py` + `backend/site_conditions.py` per CLAUDE.md "Radiation model spec" → `data/deuteronilus/site_conditions.json`
   (every value carries `source` and `evidence`).
2. Optional: wrap `routing.plan()` and `zones.compute_zones()` in FastAPI (`docs/ARCHITECTURE.md` §5) — keep the static build working.
3. Work on branch `deut-backend`; put NEW code under `backend/`; don't move existing files; never push to `main`.

## 6. Integrity rules (non-negotiable)
- σθ is a modeled bound (constant σz, independent errors — likely an overestimate). Label it.
- Ice polygons (`interpretation/deuteronilus_ice_landform.json`) are a DRAFT interpretation. Ice depth 1–10 m unknown.
- No invented numbers: every displayed value traces to a dataset, a computation, or a citation.
- Not a NASA-certified safety assessment; it's decision support.
