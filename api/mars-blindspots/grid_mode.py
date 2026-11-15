"""Grid mode for process_terrain.py: rectangular crop → ~10 m analysis grid → layers, grids, zones.

    python3 process_terrain.py --input data_raw/deut_041222_dtm.IMG \
        --crop-window 2500,10500,1500,5500 --grid-step 10 \
        --ice-mask interpretation/deuteronilus_ice_landform.json \
        --ortho data_raw/deut_041222_ortho.JP2 --output data/deuteronilus

Per CLAUDE.md "Zone math spec" + decisions:
- TWO labelled slope scales from the same DTM + error model (only the slope baseline differs):
    walking   (per step, 1 m): θ, σθ, T, Tw at full res, averaged per cell → data_grid.json, overlays, routes
    footprint (grid cell):     θ, σθ from the block-mean DTM → zones (averaged over each facility disk)
  roughness is derived at 1 m and block-averaged for both
- insolation from horizons cast on the FULL DTM strip at the grid step (terrain outside the crop casts shadows)
- zones from zones.py; masks run-length encoded in zones.json

The Gale centre-crop path in process_terrain.py is untouched. Python 3.9 compatible.
"""
import base64
import json
import os
import sys
import time
import warnings
from pathlib import Path

import numpy as np

import zones as Z
from process_terrain import (ROCK_ABUNDANCE_K, compute_hillshade, compute_rock_abundance, compute_roughness,
                             compute_slope, compute_slope_uncertainty, compute_traversability, crop_bounds,
                             projected_bounds_to_latlon, save_hillshade_png, save_rgba_png,
                             save_uncertainty_overlay_fast, shrink_pngs)

DATA_GRID_MAX_MB = 15.0


# ─── helpers (tested in tests/test_grid_mode.py) ─────────────────────────────

def parse_window(text, step, shape):
    """'ROW0,ROW1,COL0,COL1' → (r0, r1, c0, c1); must be inside the DTM and aligned to `step`."""
    try:
        r0, r1, c0, c1 = [int(v) for v in text.split(',')]
    except ValueError:
        raise ValueError('--crop-window needs four integers ROW0,ROW1,COL0,COL1')
    rows, cols = shape
    if not (0 <= r0 < r1 <= rows and 0 <= c0 < c1 <= cols):
        raise ValueError('--crop-window %s is outside the %dx%d DTM' % (text, rows, cols))
    if any(v % step for v in (r0, r1, c0, c1)):
        raise ValueError('--crop-window edges must be multiples of --grid-step %d (so grid cells line up '
                         'with the full-strip insolation grid)' % step)
    return r0, r1, c0, c1


def block_mean(a, step, nan_aware=False):
    """Mean over step×step blocks (trailing partial blocks dropped)."""
    r, c = a.shape[0] // step * step, a.shape[1] // step * step
    b = a[:r, :c].reshape(r // step, step, c // step, step)
    if nan_aware:
        with warnings.catch_warnings():
            warnings.simplefilter('ignore', RuntimeWarning)   # all-NaN blocks → NaN
            return np.nanmean(b, axis=(1, 3))
    return b.mean(axis=(1, 3))


def rasterize_polygons(polygons, window, step):
    """Boolean grid: cell centres (full-res px) inside any polygon [[row, col], ...]."""
    from matplotlib.path import Path as MPath
    r0, r1, c0, c1 = window
    rows, cols = (r1 - r0) // step, (c1 - c0) // step
    rr, cc = np.mgrid[0:rows, 0:cols]
    pts = np.c_[r0 + rr.ravel() * step + step / 2.0, c0 + cc.ravel() * step + step / 2.0]
    m = np.zeros(rows * cols, bool)
    for poly in polygons:
        m |= MPath(np.asarray(poly, float)).contains_points(pts)
    return m.reshape(rows, cols)


def rle_encode(mask):
    """Row-major run lengths: [first_value, run1, run2, ...] (runs alternate value)."""
    flat = np.asarray(mask, bool).ravel()
    if flat.size == 0:
        return [0]
    change = np.flatnonzero(flat[1:] != flat[:-1]) + 1
    bounds = np.concatenate(([0], change, [flat.size]))
    return [int(flat[0])] + np.diff(bounds).astype(int).tolist()


def quantize_u16(a, lo, hi):
    """Encode a float grid as base64 little-endian uint16 with value = lo + q·(hi−lo)/65535."""
    if not np.all(np.isfinite(a)):
        raise ValueError('quantize_u16: grid contains NaN/inf')
    q = np.round((np.clip(a, lo, hi) - lo) / (hi - lo) * 65535).astype('<u2')
    return {'encoding': 'base64 uint16 LE, row-major', 'lo': lo, 'hi': hi,
            'b64': base64.b64encode(q.tobytes()).decode('ascii')}


def walking_scale(z, res, step, sigma_z, k, rock_factor):
    """WALKING scale (per footstep, ~1 m): θ, σθ, R, T, Tw at full resolution, then averaged per grid cell.

    T_cell = mean of 1 m T = expected traversability of a random footstep in the cell (same for Tw).
    Used for the blindspot overlay, routes, scouts and the inspector.
    """
    th = compute_slope(z, res)
    sg = compute_slope_uncertainty(z, res, sigma_z=sigma_z)
    rough = compute_roughness(z)
    t = compute_traversability(th, rough, rock_factor)
    tw = compute_traversability(th + k * sg, rough, rock_factor)
    return {'slope': block_mean(th, step), 'slope_unc': block_mean(sg, step), 'roughness': block_mean(rough, step),
            'trav': block_mean(t, step), 'trav_worst': block_mean(tw, step)}


def footprint_scale(z, res, step, sigma_z, k, rock_factor, roughness):
    """FOOTPRINT scale (~grid cell): θ, σθ over the cell baseline from the block-mean DTM; roughness from 1 m.

    Used for habitability zones (then averaged over each facility's disk in zones.py).
    """
    zc = block_mean(z, step)
    cell = res * step
    th = compute_slope(zc, cell)
    sg = compute_slope_uncertainty(zc, cell, sigma_z=sigma_z)
    return {'elevation': zc, 'slope': th, 'slope_unc': sg, 'roughness': roughness,
            'trav': compute_traversability(th, roughness, rock_factor),
            'trav_worst': compute_traversability(th + k * sg, roughness, rock_factor)}


def _rounded(a, nd):
    return [[round(float(v), nd) for v in row] for row in a]


def _require_finite(name, a):
    if not np.all(np.isfinite(a)):
        raise ValueError('%s has %d non-finite cells' % (name, int((~np.isfinite(a)).sum())))


# ─── pipeline ────────────────────────────────────────────────────────────────

def run(args):
    import rasterio
    from rasterio.windows import Window

    t0 = time.time()
    step = args.grid_step
    out = Path(args.output)
    out.mkdir(parents=True, exist_ok=True)
    print('\n═══ MARS BLINDSPOTS — grid mode ═══\n')

    with rasterio.open(args.input) as src:
        full = src.read(1).astype(np.float64)
        nodata, bounds, res, crs, shape = src.nodata, src.bounds, abs(src.res[0]), src.crs, (src.height, src.width)
    if nodata is not None:
        full[full == nodata] = np.nan
    full[full < -1e30] = np.nan
    window = parse_window(args.crop_window, step, shape)
    r0, r1, c0, c1 = window
    z = full[r0:r1, c0:c1]
    if not np.isfinite(z).all():
        raise ValueError('crop window contains %d NoData pixels; pick a fully valid window'
                         % int((~np.isfinite(z)).sum()))
    cell = res * step
    print('  window rows %d:%d cols %d:%d (%.1f × %.1f km), grid step %d → %.2f m cells'
          % (r0, r1, c0, c1, (c1 - c0) * res / 1e3, (r1 - r0) * res / 1e3, step, cell))

    # Insolation on the full strip (NaN outside data never blocks the sun)
    print('  insolation: horizons on full strip...')
    zfull = block_mean(full, step, nan_aware=True)
    del full
    S_w_full, S_a_full, _ = Z.seasonal_insolation(zfull, cell)
    gr0, gr1, gc0, gc1 = r0 // step, r1 // step, c0 // step, c1 // step
    S_winter, S_annual = S_w_full[gr0:gr1, gc0:gc1], S_a_full[gr0:gr1, gc0:gc1]
    _require_finite('S_winter', S_winter)
    print('    done (%.0fs)' % (time.time() - t0))

    # Terrain grids at TWO labelled scales from the same DTM and error model (CLAUDE.md "Slope scales")
    rock_factor = 1.0 - compute_rock_abundance()[0]
    k = args.worst_sigma
    walk = walking_scale(z, res, step, args.sigma_z, k, rock_factor)
    foot = footprint_scale(z, res, step, args.sigma_z, k, rock_factor, walk['roughness'])
    for scale, d in (('walk', walk), ('footprint', foot)):
        for name, a in d.items():
            _require_finite('%s.%s' % (scale, name), a)
    zc = foot['elevation']
    gap = np.clip(walk['trav'] - walk['trav_worst'], 0, 1)            # walking-scale blindspots
    gap_fp = np.clip(foot['trav'] - foot['trav_worst'], 0, 1)
    print('  walking scale:   σθ median %.1f°, gap > 0.1 in %.0f%% of cells'
          % (np.median(walk['slope_unc']), np.mean(gap > 0.1) * 100))
    print('  footprint scale: σθ median %.2f°, gap > 0.1 in %.0f%% of cells'
          % (np.median(foot['slope_unc']), np.mean(gap_fp > 0.1) * 100))

    # Ice mask (interpretation)
    ice, ice_meta = None, None
    if args.ice_mask:
        ice_meta = json.load(open(args.ice_mask))
        ice = rasterize_polygons(list(ice_meta['polygons'].values()), window, step)
        print('  ice mask: %.2f km² (%s)' % (ice.sum() * cell * cell / 1e6, ice_meta.get('status', '')))

    # Zones
    cfg = Z.ZONE_CONFIG
    if abs(cfg['k_sigma'] - args.worst_sigma) > 1e-9:
        raise ValueError('--worst-sigma must equal ZONE_CONFIG k_sigma (%g)' % cfg['k_sigma'])
    grids = Z.base_grids(foot['slope'], foot['slope_unc'], foot['roughness'], foot['trav'], foot['trav_worst'],
                         cell, ice_mask=ice, S_winter=S_winter, S_annual=S_annual)
    result = Z.compute_zones(grids, cell)
    summary = Z.summary(result)
    for name in cfg['order']:
        s = summary[name]
        if s['nominal']['available']:
            print('  zone %-11s nominal %.2f km²  robust %.2f km²' % (name, s['nominal']['area_m2'] / 1e6,
                                                                      s['robust']['area_m2'] / 1e6))
        else:
            print('  zone %-11s unavailable (missing %s)' % (name, s['nominal'].get('missing')))

    # Layers
    print('  layers...')
    save_hillshade_png(out / 'hillshade.png', compute_hillshade(z, res))
    del z
    # walking-scale layers; absolute colour scale: gap 1.0 = full red
    save_rgba_png(out / 'slope.png', walk['slope'], 'YlOrRd', 0, 35)
    save_uncertainty_overlay_fast(out / 'uncertainty.png', walk['slope_unc'], gap, gap_scale=1.0)
    save_rgba_png(out / 'traversability.png', walk['trav'], 'RdYlGn', 0, 1)
    layers = ['hillshade.png', 'slope.png', 'uncertainty.png', 'traversability.png']
    if args.ortho:
        with rasterio.open(args.ortho) as o:
            if (o.height, o.width) != shape:
                raise ValueError('ortho grid %s differs from DTM %s' % ((o.height, o.width), shape))
            img = o.read(1, window=Window(c0, r0, c1 - c0, r1 - r0)).astype(float)
        lo, hi = np.percentile(img[img > 0], [1, 99])
        import matplotlib.pyplot as plt
        plt.imsave(str(out / 'imagery.png'), np.clip((img - lo) / (hi - lo), 0, 1), cmap='gray')
        layers.append('imagery.png')
    if args.png_size:
        shrink_pngs(out, layers, args.png_size)

    # data_grid.json — the viewer's existing format, WALKING scale, at full grid resolution
    rows, cols = zc.shape
    grid = {'grid_rows': rows, 'grid_cols': cols, 'step_r': step, 'step_c': step, 'scale': 'walk',
            'slope': _rounded(walk['slope'], 2), 'slope_uncertainty': _rounded(walk['slope_unc'], 2),
            'traversability': _rounded(walk['trav'], 3), 'trav_worst': _rounded(walk['trav_worst'], 3),
            'elevation': _rounded(zc, 1)}
    with open(out / 'data_grid.json', 'w') as f:
        json.dump(grid, f, separators=(',', ':'), allow_nan=False)
    mb = (out / 'data_grid.json').stat().st_size / 1e6
    print('    data_grid.json %.1f MB' % mb)
    if mb > DATA_GRID_MAX_MB:
        raise ValueError('data_grid.json is %.1f MB (> %g MB): switch to a compact encoding' % (mb, DATA_GRID_MAX_MB))

    # zones.json — summary, thresholds, base, RLE masks, extra per-cell grids
    zones_out = {
        'about': 'Rule-based suitability masks, one per use. NO composite habitability score. Thresholds are '
                 'assumed — editable (zones.py ZONE_CONFIG). robust = same rules with worst-case slope θ+kσθ. '
                 'robust/nominal ratio = sensitivity under stated assumptions, not a probability.',
        'grid': {'rows': rows, 'cols': cols, 'cell_m': cell, 'mask_encoding':
                 'run lengths over the row-major grid: [first_value, run1, run2, ...], runs alternate value',
                 'authority': 'masks are authoritative; grids are uint16-quantized for popup values only. '
                              'Recomputing zones from them flips <0.2% of boundary cells — never do that.'},
        'config': {k: cfg[k] for k in ('k_sigma', 'scarp_slope_deg', 'latitude_deg', 'insolation_ls',
                                       'insolation_hours', 'horizon_azimuths')},
        'order': cfg['order'],
        'zones': summary,
        'masks': {name: {v: rle_encode(result['zones'][name][v]['mask']) for v in ('nominal', 'robust')}
                  for name in cfg['order']},
        'scale': 'footprint',
        'grids': {
            # FOOTPRINT-scale inputs the zone rules read (per-cell; zones.py averages them over each disk)
            'slope_10m': quantize_u16(foot['slope'], 0.0, 90.0),
            'slope_unc_10m': quantize_u16(foot['slope_unc'], 0.0, 10.0),
            'trav_worst_10m': quantize_u16(foot['trav_worst'], 0.0, 1.0),
            'roughness_m': quantize_u16(foot['roughness'], 0.0, 10.0),
            'S_winter': quantize_u16(S_winter, 0.0, 4.0),
            'S_annual': quantize_u16(S_annual, 0.0, 4.0),
        },
    }
    if result['base'] and result['base'].get('mask') is not None:
        zones_out['base_mask'] = rle_encode(result['base']['mask'])
    if ice is not None:
        zones_out['ice_mask'] = rle_encode(ice)
        zones_out['ice_interpretation'] = {k: ice_meta[k] for k in ('label', 'status', 'digitized_by', 'basis',
                                                                    'excluded', 'depth_to_ice') if k in ice_meta}
    with open(out / 'zones.json', 'w') as f:
        json.dump(zones_out, f, separators=(',', ':'), allow_nan=False)
    print('    zones.json %.1f MB' % ((out / 'zones.json').stat().st_size / 1e6))

    # metadata.json
    s, n, w, e = projected_bounds_to_latlon(crop_bounds(bounds, shape, window), crs)
    uncertain_pct = float(np.mean(gap > 0.1) * 100)
    critical_pct = float(np.mean(gap > 0.3) * 100)
    meta = {
        'resolution': float(res),
        'size': [r1 - r0, c1 - c0],
        'grid': {'step': step, 'cell_m': cell, 'rows': rows, 'cols': cols},
        'crop_window': {'row0': r0, 'row1': r1, 'col0': c0, 'col1': c1},
        'bounds': {'south': s, 'north': n, 'west': w, 'east': e},
        'center': {'lat': (s + n) / 2, 'lon': (w + e) / 2},
        'source': os.path.basename(args.input) + ' — HiRISE DTM (NASA/JPL/University of Arizona)',
        'is_synthetic': False,
        'scales': {
            'note': 'Same DTM, sigma_z and error model at both scales; only the slope baseline differs, '
                    'and sigma_theta scales as 1/baseline.',
            'walk': {
                'label': 'per step · %.0f m' % res,
                'baseline_m': res,
                'used_by': ['data_grid.json', 'slope.png', 'uncertainty.png', 'traversability.png',
                            'routes', 'scout points', 'point inspector'],
                'method': 'theta, sigma_theta, T, Tw at full resolution, averaged over each %.0f m cell '
                          '(T = expected traversability of a random footstep)' % cell,
                'sigma_theta_median_deg': round(float(np.median(walk['slope_unc'])), 2),
                'uncertain_pct': round(float(np.mean(gap > 0.1) * 100), 1),
            },
            'footprint': {
                'label': 'over footprint · %.0f m' % cell,
                'baseline_m': cell,
                'used_by': ['zones.json'],
                'method': 'theta, sigma_theta from the %.0f m block-mean DTM; then averaged over each '
                          'facility disk in zones.py' % cell,
                'sigma_theta_median_deg': round(float(np.median(foot['slope_unc'])), 2),
                'uncertain_pct': round(float(np.mean(gap_fp > 0.1) * 100), 1),
            },
            'ui_sentence': 'A pad site can be confidently flat at %.0f m even where individual footsteps are '
                           'uncertain: ±%.0f° per step vs ±%.1f° over %.0f m.'
                           % (cell, np.median(walk['slope_unc']), np.median(foot['slope_unc']), cell),
        },
        'method': {
            'slope_basis': 'two scales, see "scales"',
            'roughness': 'std. dev. of elevation in a 5 px window at full resolution, block-averaged',
            'sigma_z_m': args.sigma_z, 'sigma_z_source': 'Sutton et al. 2022, doi:10.3390/rs14102403',
            'error_model': 'independent per-pixel errors (likely an overestimate; real DTM error is correlated)',
            'rock_abundance_k': ROCK_ABUNDANCE_K, 'rock_abundance_note': 'uniform, not measured at this site',
            'worst_sigma_k': args.worst_sigma,
            'insolation': 'terrain-only (no dust/atmosphere): 36-azimuth horizons on the full DTM strip',
        },
        'stats': {   # WALKING scale (what the header, overlay and routes show)
            'scale': 'walk',
            'total_cells': int(rows * cols),
            'uncertain_pct': round(uncertain_pct, 1), 'critical_pct': round(critical_pct, 1),
            'slope_min': round(float(walk['slope'].min()), 1), 'slope_max': round(float(walk['slope'].max()), 1),
            'slope_mean': round(float(walk['slope'].mean()), 1),
            'slope_unc_mean': round(float(walk['slope_unc'].mean()), 2),
            'slope_unc_max': round(float(walk['slope_unc'].max()), 2),
            'sigma_z_used': args.sigma_z, 'elevation_range': round(float(np.ptp(zc)), 1),
        },
        'layers': {
            'hillshade': {'file': 'hillshade.png', 'description': 'Terrain shading (full resolution)'},
            'slope': {'file': 'slope.png', 'description': 'Surface slope (degrees)', 'range': [0, 35]},
            'uncertainty': {'file': 'uncertainty.png', 'description': 'Slope measurement uncertainty'},
            'traversability': {'file': 'traversability.png', 'description': 'EVA traversability (0-1)'},
        },
        'zones_file': 'zones.json',
    }
    if args.ortho:
        meta['layers']['imagery'] = {'file': 'imagery.png', 'description': 'HiRISE orthoimage (%s)'
                                     % os.path.basename(args.ortho)}
    with open(out / 'metadata.json', 'w') as f:
        json.dump(meta, f, indent=2, allow_nan=False)
    print('\n  done in %.0fs → %s/' % (time.time() - t0, out))
    print('  routes.json not written in grid mode (the viewer plans routes in the browser).')
