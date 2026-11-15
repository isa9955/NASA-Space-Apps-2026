# Mars Blindspots — Architecture & Front-end / Back-end Split Guide

> Current repository architecture supersedes the historical proposals below:
> Python `backend/api_service.py` serves `ui/`, computing both route modes per
> request from processed grids. Terrain/zones remain offline and unchanged.
> The former TypeScript API is archived, not a competing service. No new cache,
> browser A*, FastAPI or radiation model was added. See
> `../../../docs/DEUTERONILUS_INTEGRATION.md` and root `TECHNICAL_SPEC.md`.

> **Team-repo copy:** paths here describe the source repo (github.com/allison-mk/mars-blindspots). In
> `api/mars-blindspots/`, `web/sites/<site>/` is `data/<site>/`; the viewer (`web/index.html`) is not included.

Status as of 2026-11-14 (branch `deuteronilus`). Written so the team can later split the app into a
back end (Python computation, optionally behind an API) and a front end (map UI) without losing any
of the science. File/function references are exact; equations are what the code actually does.

---

## 1. Current architecture (static, no server)

```
data_raw/ (gitignored)                      Python, offline ("back end" today)                web/ (static site, GitHub Pages from main)
──────────────────────                      ───────────────────────────────────              ─────────────────────────────────────────
deut_041222_dtm.IMG  ──► process_terrain.py ──► slope, σθ, roughness, T, Tw, hillshade ──►  sites/<site>/metadata.json
deut_041222_ortho.JP2      (load, crop, CRS→lat/lon)                                         sites/<site>/data_grid.json   (per-cell grids)
interpretation/*.json ──► zones.py          ──► insolation S, distances, 6 zones ×2 ──────►  sites/<site>/*.png            (raster layers)
swim/*.tif, baker_carter/ ► (site conditions / radiation: planned) ───────────────────────►  (zones/site_conditions JSON: planned)
                                                                                                   │
                                                                                     index.html (Leaflet, vanilla JS) — runs IN BROWSER:
                                                                                     A* routing ×2, route metrics, scout points,
                                                                                     science candidates, inspector, toggles
```

Key fact for the split: **some computation already lives in the browser** (routing, scouts, science
candidates, safe-cost grid). Anything that moves to an API must move from `web/index.html`, not only from Python.

---

## 2. File map — what each file is and where it goes after the split

| File | Role today | After split |
|---|---|---|
| `process_terrain.py` | DTM load/crop/CRS, terrain metrics, PNG + JSON export; also legacy Python A*, scouts, Gale science targets | **Back end** `terrain/` module. Drop/merge legacy routing (see §5) |
| `grid_mode.py` | `process_terrain.py --crop-window … --grid-step N`: rectangular crop, two slope scales, full-strip insolation, zones, imagery; writes `web/sites/<site>/` | **Back end** `terrain/` build step |
| `zones.py` | Zone engine (ZONE_CONFIG, footprint test, EDT distances, components, nominal/robust), horizon + insolation | **Back end** `zones/` + `solar/` modules (pure functions — already API-ready) |
| `interpretation/deuteronilus_ice_landform.json` | DRAFT hand-digitized ice-rich lobe polygons (full-res pixel coords) | **Data** (versioned input). Needs team review before use |
| `tests/test_crop.py`, `tests/test_zones.py` | pytest: crop/bounds/CRS, zone math on synthetic terrain | **Back end** tests — keep passing through the refactor |
| `web/index.html` | Entire UI + in-browser A*, route metrics, scouts, science text, inspector | **Front end**. Routing/scouts may move to back end (§5) |
| `web/data/` | Gale outputs (preserved fallback) | Front end static data (Gale) |
| `web/sites/deuteronilus/` | Deuteronilus outputs (being built) | Front end static data or API cache |
| `scripts/fetch_deuteronilus.sh` | Raw data downloads | Back end / ops |
| `CLAUDE.md` | Rules, specs (zone math, radiation), build order | Shared project brief |
| `README.md` | Methodology + data provenance table | Shared |
| (planned) `radiation.py`, `site_conditions.py`, `sharad_overlap.py` | Site-card data, radiation model | **Back end** |

---

## 3. Equation catalog (the science — must survive any refactor unchanged)

### Terrain (process_terrain.py)
| Quantity | Equation | Function |
|---|---|---|
| Slope θ | θ = arctan √(∂z/∂x² + ∂z/∂y²), central differences (`np.gradient`) | `compute_slope` |
| Slope uncertainty σθ | σθ = (√2·σz / (2Δ)) / (1 + ‖∇z‖²), σz = 0.3 m (Sutton et al. 2022), Δ = cell size | `compute_slope_uncertainty` |
| Worst-case slope | θw = θ + k·σθ, k = 1 (`--worst-sigma`) | `main` / `zones.base_grids` |
| Roughness R | std of elevation in 5×5 window: √(E[z²] − E[z]²) | `compute_roughness` |
| Rock hazard | Golombek: F_k(D) = k·e^(−q·D), q = 1.79 + 0.152/k, k = 0.06 (uniform) | `compute_rock_abundance` |
| Traversability T | T = σ((20° − θ)/3°) · σ((2.0 − R)/0.5) · rock_factor, σ = logistic | `compute_traversability` |
| Worst-case Tw | T evaluated at θw | `main` |
| Uncertainty gap | gap = max(0, T − Tw); "critical" if gap > 0.5 (inspector/routes) — header stats use > 0.1 / > 0.3 | JS `prepareGrids`, `routeMetrics`; `grid_mode.run` stats |
| Two scales (grid mode) | walking: 1 m θ, σθ, T, Tw → cell mean; footprint: θ, σθ on the block-mean DTM (Δ = cell) | `grid_mode.walking_scale`, `grid_mode.footprint_scale` |
| Projection | lat = y/R, lon = lon₀ + x/(R·cos lat_ts); R from CRS `+R` (Deuteronilus 3,387,887.66 m) | `projected_bounds_to_latlon` |

### Routing (web/index.html, in browser)
| Quantity | Equation | Function |
|---|---|---|
| Standard step cost | move / (T + 0.01); move = 1 or √2; impassable if T < 0.05 | JS `astar(…, TRAV)` |
| Safe step cost | move / (SAFE + 0.01), SAFE = max(0.01, Tw / (1 + 5·gap)) | JS `prepareGrids`, `astar(…, SAFE)` |
| Heuristic | octile distance × (1/1.01) (admissible) | JS `astar` |
| Route metrics | distance, time = dist / 50 m·min⁻¹, % critical cells, min/mean Tw, mean gap | JS `routeMetrics` |
| Scout points | 3–5 largest-gap cells on standard route, spaced | JS `findScoutPoints` |
| Science candidates | local maxima of slope (outcrops), relief ±2.5 m (knobs/lows), slope-std (rough) within 200 m | JS `findScienceTargets`, text in `scienceText` |

### Zones & sunlight (zones.py)
| Quantity | Equation | Function |
|---|---|---|
| Distances | Euclidean distance transform × cell size (scarp: θ > 25°; ice mask; ice edge) | `dist_to`, `dist_to_edge` |
| Footprint test | terrain criteria on disk-MEAN (radius r); distance/insolation criteria on EVERY disk cell (erosion); zone = union of passing footprints | `footprint_mean`, `erode`, `footprint_union` |
| Zones | components = 8-connected labels with areas | `components`, `compute_zones` |
| Robust variant | same rules with θw (and dist_scarp from θw) | `_key_for` |
| Default base | largest robust habitat component (fallback nominal) | `choose_base` |
| Solar declination | δ = asin(sin 25.19° · sin Ls) | `sun_positions` |
| Sun elevation | sin α = sin φ sin δ + cos φ cos δ cos h, φ = 40.7° | `sun_positions` |
| Horizon | H(az) = max_d atan((z(p+d·û) − z(p))/d), 36 azimuths | `horizon_angles` |
| Incidence | cos i = cos θ sin α + sin θ cos α cos(az☉ − aspect) | `insolation_fraction` |
| Sunlit fraction | S = Σ lit·max(0, cos i) / Σ max(0, sin α); S_winter = Ls 270, S_annual = mean(Ls 90,180,270) | `insolation_fraction`, `seasonal_insolation` |

Zone thresholds: single source of truth = `zones.ZONE_CONFIG` (shown in UI as "assumed — editable").

### Radiation (planned — spec in CLAUDE.md)
P(z) = P0·e^(−z/H) (P0 ≈ 610 Pa, H ≈ 11.1 km); column = P/g; anchor RAD 0.64 ± 0.12 mSv/day at Gale (Hassler 2014);
SVF = (1/2π)∫cos²H(az) daz (qualitative); P(≥1 SPE in t) = 1 − e^(−λt) (λ cited or labeled scenario).

---

## 4. Data contracts (the interface between back end and front end)

Keep these stable and the two halves can be rebuilt independently.

| Artifact | Producer | Shape |
|---|---|---|
| `metadata.json` | terrain | `{resolution, size:[r,c], bounds:{south,north,west,east}, center, source, is_synthetic, stats:{scale:'walk',…}, layers:{name:{file,description,range?}}}`; grid mode adds `grid:{step,cell_m,rows,cols}`, `crop_window`, `method`, `zones_file`, and `scales:{walk:{label,baseline_m,used_by,method,sigma_theta_median_deg,uncertain_pct}, footprint:{…}, note, ui_sentence}` |
| `data_grid.json` | terrain | `{grid_rows, grid_cols, step_r, step_c, scale, slope[][], slope_uncertainty[][], traversability[][], trav_worst[][], elevation[][]}` (row 0 = north). Grid mode: `scale:'walk'` — 1 m values averaged per cell |
| `*.png` | terrain | RGBA overlays aligned to `metadata.bounds` |
| `zones.json` | zones (`grid_mode.py`) | `{about, scale:'footprint', grid:{rows,cols,cell_m,mask_encoding,authority}, config, order, zones:{name:{label, robust_over_nominal, depth_label?, nominal:{available, area_m2, n_components, component_areas_m2, criteria:[{key,grid,op,threshold,evidence,applies_to}]}, robust:{…}}}, landing.base:{chosen_by, area_m2, centroid_cell}, masks:{name:{nominal:rle, robust:rle}}, base_mask:rle, ice_mask:rle, ice_interpretation, grids:{slope_10m, slope_unc_10m, trav_worst_10m, roughness_m, S_winter, S_annual: base64 uint16 {lo,hi,b64}}}`. RLE = `[first_value, run1, run2, …]` row-major. **Masks are authoritative**; never recompute zones from the quantized grids |
| `site_conditions.json` (planned) | site/radiation | `{lat, lon, elev_range_m, swim:{band:{value,px_km:3,source}}, climate:{…, source}, radiation:{column_gcm2, dose_text, source, label:"MODEL"}}` — every value carries `source` + `evidence` |
| Ice polygons | interpretation | `interpretation/*.json`, full-res pixel coords + provenance fields |

Rule: every number the UI displays must carry (or be traceable to) a `source`/`evidence` field.

---

## 5. Recommended split (when the demo is stable)

**Back end** — Python package, two ways to serve it:
1. *Build step (recommended default):* `python -m blindspots build --site deuteronilus` → writes the §4 artifacts. Front end stays static (GitHub Pages works, zero runtime risk).
2. *API (only for dynamic features):* FastAPI wrapping the same functions:
   - `GET /sites/{site}/metadata`, `/grid`, `/layers/{name}.png`
   - `GET /sites/{site}/zones?base=r,c&overrides=…` (re-run `compute_zones` with a chosen base / edited thresholds)
   - `POST /sites/{site}/route {start,end,mode}` (only if routing moves server-side)
   - `GET /sites/{site}/site-conditions`

**Front end** — Leaflet UI consuming either static files or the API through ONE data-access module
(`loadMetadata()`, `loadGrid()`, `getZones(base)`, `route(start,end,mode)`), so switching static↔API is one file.

**Duplicated logic to consolidate during the split (pick one home each):**
- A*: Python `plan_route_astar` (legacy, unused by viewer) vs JS `astar` (live). Keep JS for instant interaction, or move both standard/safe to the API — not both.
- Safe-cost grid `SAFE` and `gap`: computed in JS `prepareGrids`; move to back end and ship as a grid if routing moves.
- Scouts: Python `select_scout_points` (legacy) vs JS `findScoutPoints` (live).
- Science candidates: Python `SCIENCE_TARGETS` (Gale-specific legacy) vs JS `findScienceTargets` + `scienceText` (live; needs Deuteronilus text).
- Relief and slope-std are computed in JS (`subtractLocalMean`, `localStd`) — move to back end if science detection moves.

---

## 6. Open issues to resolve before/while splitting
1. ~~**σθ baseline mismatch**~~ — **resolved 2026-11-14: two labelled scales**, same DTM / σz / k / error model, only the slope baseline differs (σθ ∝ 1/baseline).
   - *Walking scale* ("per step · 1 m", σθ ≈ 11°): θ, σθ, T, Tw at full res, averaged per 10 m cell → `data_grid.json`, blindspot overlay, routes, scouts, inspector, header stats (99% of cells gap > 0.1 on the P1 window).
   - *Footprint scale* ("over footprint · 10 m", σθ ≈ 1.2°): θ, σθ from the 10 m block-mean DTM → `zones.json` only (gap > 0.1 in 0% of cells; zones still shrink because their 5° limits are tight).
   - UI MUST tag every slope/σθ number with its scale and show `metadata.scales.ui_sentence` in the assumptions panel. Proper single-scale fix (correlated-error model) is out of scope; state it as a limit.
   - Single-scale alternatives rejected: 10 m everywhere → blindspots vanish (max gap 0.086); 1 m everywhere → every robust zone empty.
2. Ice polygons are a DRAFT interpretation — team review required; ice-access, data-center and greenhouse zones depend on them.
3. Landing zone now measured from one chosen base (default largest robust habitat); verify it's non-empty on the final crop.
4. SWIM GeoTIFFs not yet downloaded (`data_raw/swim/` empty). No SHARAD track crosses this DTM (per ice-mask provenance) — ice evidence is regional.
5. Python 3.9 compatibility required on the team Mac.
6. GitHub Pages deploys `web/` from `main` — never merge an unfinished split into `main`.
