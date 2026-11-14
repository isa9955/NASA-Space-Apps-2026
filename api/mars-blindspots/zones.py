"""Habitability zones for Mars Blindspots — implements the 'Zone math spec' in CLAUDE.md.

Each zone is a RULE-BASED suitability mask for one use. There is NO composite habitability score.
    zone = AND(criteria)  →  footprint test with a disk of radius r  →  connected components
Every threshold lives in ZONE_CONFIG and is shown in the UI as "assumed — editable".

Footprint test (decided 2026-11-14, replaces plain per-cell erosion): for a zone with radius r,
terrain criteria (slope, roughness, trav_worst) are tested on their MEAN over the disk centred on
each cell; all other criteria (distances, insolation) must pass on EVERY cell of the disk (erosion);
the disk must lie inside the grid. The zone mask is the UNION of passing footprints (where the
facility could sit); `centers` holds the passing footprint centres.
Slope θ and σθ are taken over the 10 m cell baseline (σθ ≈ 1.2°); at 1 m, σθ ≈ 12° and every
robust zone is empty. Roughness is still derived at 1 m.

Two variants per zone:
    nominal — uses slope θ and traversability T as mapped
    robust  — the same rules with worst-case slope θw = θ + k·σθ and Tw in place of θ / T
The robust/nominal area ratio is a SENSITIVITY UNDER STATED ASSUMPTIONS, not a probability.
Because zones depend on each other (landing keeps 1 km from habitat), a robust area can be
larger than its nominal area; the ratio is reported as-is.

Python 3.9 compatible.
"""
import math

import numpy as np
from scipy import ndimage

MARS_OBLIQUITY_DEG = 25.19

# ─── Config: every threshold in one place ────────────────────────────────────
# criterion = (grid key, operator, threshold, evidence level)
# Grid keys marked * swap to their worst-case version in the robust variant.
ZONE_CONFIG = {
    'k_sigma': 1.0,                 # θw = θ + k·σθ
    'scarp_slope_deg': 25.0,        # dist_scarp_m = EDT(θ > 25°) × cell
    'latitude_deg': 40.7,           # insolation latitude (Deuteronilus DTM centre, 40.74°N)
    'insolation_ls': [90, 180, 270],
    'insolation_hours': 96,         # hour-angle samples per sol
    'horizon_azimuths': 36,
    'zones': {
        'habitat': {
            'label': 'Habitat / base',
            'criteria': [
                ('slope', '<=', 5.0, 'computed from DTM'),
                ('roughness', '<=', 0.3, 'computed from DTM'),
                ('trav_worst', '>=', 0.8, 'modeled worst case'),
                ('dist_scarp_m', '>=', 200.0, 'computed from DTM'),
            ],
            'erode_r_m': 50.0,
        },
        'landing': {
            'label': 'Landing pad',
            'criteria': [
                ('slope', '<=', 5.0, 'computed from DTM'),
                ('roughness', '<=', 0.2, 'computed from DTM'),
                # measured from ONE chosen base, not from every habitat patch (decided 2026-11-14):
                # every flat patch here is within 1 km of some habitat patch, so that rule left landing empty
                ('dist_base_m', '>=', 1000.0, 'derived from chosen base (habitat component)'),
            ],
            'erode_r_m': 100.0,
        },
        'ice_access': {
            'label': 'Ice access',
            'criteria': [
                ('dist_ice_edge_m', '<=', 200.0, 'interpretation (ice mask)'),
                ('slope', '<=', 15.0, 'computed from DTM'),
            ],
            'depth_label': '1–10 m, unknown',
        },
        'greenhouse': {
            'label': 'Greenhouse / crops',
            'criteria': [
                ('slope', '<=', 5.0, 'computed from DTM'),
                ('S_winter', '>=', 0.9, 'terrain-only insolation model'),
                ('dist_habitat_m', '<=', 500.0, 'derived from habitat zone'),
                ('dist_ice_access_m', '<=', 2000.0, 'derived from ice-access zone'),
            ],
        },
        'datacenter': {
            'label': 'Data center / heavy infrastructure',
            'criteria': [
                ('slope', '<=', 5.0, 'computed from DTM'),
                ('dist_ice_m', '>=', 100.0, 'interpretation (ice mask); outside the mask and ≥100 m from it'),
                ('dist_scarp_m', '>=', 200.0, 'computed from DTM'),
            ],
            'erode_r_m': 30.0,
        },
        'solar': {
            'label': 'Solar array',
            'criteria': [
                ('slope', '<=', 10.0, 'computed from DTM'),
                # top quartile among cells that pass the earlier criteria (θ ≤ 10°): ranking all cells
                # picks steep equator-facing slopes (median 21° here) and leaves the zone empty
                ('S_annual', '>=', 'p75_of_passing', 'terrain-only insolation model; top quartile of ground with slope ≤ 10°'),
            ],
            # Spec says "min contiguous area" without a value. ASSUMED: 1 ha (≈100 × 100 m).
            'min_area_m2': 10000.0,
        },
    },
    'order': ['habitat', 'landing', 'ice_access', 'greenhouse', 'datacenter', 'solar'],
}

OPS = {'<=': np.less_equal, '>=': np.greater_equal}
# Criteria averaged over a footprint; everything else must pass on every cell of it.
FOOTPRINT_MEAN_KEYS = ('slope', 'slope_worst', 'roughness', 'trav_worst')


# ─── Geometry helpers ────────────────────────────────────────────────────────

def disk(radius_cells):
    """Boolean disk structuring element of the given radius (in cells)."""
    r = int(math.floor(radius_cells))
    y, x = np.mgrid[-r:r + 1, -r:r + 1]
    return (x * x + y * y) <= radius_cells * radius_cells


def dist_to(mask, cell_m):
    """Distance (m) from every cell to the nearest True cell of `mask` (0 inside). inf if mask is empty."""
    mask = np.asarray(mask, bool)
    if not mask.any():
        return np.full(mask.shape, np.inf)
    return ndimage.distance_transform_edt(~mask) * cell_m


def dist_to_edge(mask, cell_m):
    """Distance (m) to the edge of `mask`, measured on both sides (cell-centre EDT)."""
    mask = np.asarray(mask, bool)
    if not mask.any():
        return np.full(mask.shape, np.inf)
    if mask.all():
        return np.full(mask.shape, np.inf)
    inside = ndimage.distance_transform_edt(mask)
    outside = ndimage.distance_transform_edt(~mask)
    return np.where(mask, inside, outside) * cell_m


def erode(mask, radius_m, cell_m):
    """Cells where a disk footprint of radius_m fits entirely inside `mask` (outside the grid fails)."""
    if not radius_m:
        return mask.copy()
    return ndimage.binary_erosion(mask, structure=disk(radius_m / cell_m), border_value=0)


def footprint_mean(grid, radius_m, cell_m):
    """Mean of `grid` over a disk centred on each cell. NaN where the disk leaves the grid."""
    k = disk(radius_m / cell_m).astype(float)
    k /= k.sum()
    m = ndimage.correlate(np.nan_to_num(grid.astype(float), nan=0.0), k, mode='constant', cval=0.0)
    fits = erode(np.isfinite(grid), radius_m, cell_m)
    return np.where(fits, m, np.nan)


def footprint_union(centers, radius_m, cell_m):
    """All cells covered by a disk footprint centred on any True cell of `centers`."""
    if not radius_m or not centers.any():
        return centers.copy()
    return ndimage.binary_dilation(centers, structure=disk(radius_m / cell_m))


def components(mask, cell_m, min_area_m2=0.0):
    """Label 8-connected components, drop those below min_area_m2. Returns (mask, labels, areas_m2)."""
    labels, n = ndimage.label(mask, structure=np.ones((3, 3), bool))
    if n == 0:
        return mask & False, labels, []
    counts = np.bincount(labels.ravel())[1:]
    areas = counts * cell_m * cell_m
    keep = np.zeros(n + 1, bool)
    keep[1:] = areas >= min_area_m2
    labels = np.where(keep[labels], labels, 0)
    # relabel compactly
    labels, n = ndimage.label(labels > 0, structure=np.ones((3, 3), bool))
    areas = (np.bincount(labels.ravel())[1:] * cell_m * cell_m).tolist() if n else []
    return labels > 0, labels, areas


# ─── Per-cell inputs ─────────────────────────────────────────────────────────

def base_grids(slope, slope_unc, roughness, trav, trav_worst, cell_m, ice_mask=None,
               S_winter=None, S_annual=None, config=ZONE_CONFIG):
    """Assemble the per-cell grids the zone rules read. All arrays share one shape."""
    k = config['k_sigma']
    slope_worst = slope + k * slope_unc
    scarp = config['scarp_slope_deg']
    g = {
        'slope': slope, 'slope_unc': slope_unc, 'slope_worst': slope_worst,
        'roughness': roughness, 'trav': trav, 'trav_worst': trav_worst,
        'dist_scarp_m': dist_to(slope > scarp, cell_m),
        'dist_scarp_worst_m': dist_to(slope_worst > scarp, cell_m),
    }
    if ice_mask is not None:
        ice_mask = np.asarray(ice_mask, bool)
        g['ice_mask'] = ice_mask
        g['dist_ice_edge_m'] = dist_to_edge(ice_mask, cell_m)
        g['dist_ice_m'] = dist_to(ice_mask, cell_m)
    if S_winter is not None:
        g['S_winter'] = S_winter
    if S_annual is not None:
        g['S_annual'] = S_annual
    return g


def _key_for(key, variant):
    if variant == 'robust':
        if key == 'slope':
            return 'slope_worst'
        if key == 'dist_scarp_m':
            return 'dist_scarp_worst_m'
        # 'trav' would swap to trav_worst; habitat already uses trav_worst in both variants.
    return key


def _threshold(value_spec, grid, passing):
    """Numeric threshold, or a percentile: 'p75' over all cells, 'p75_of_passing' over cells passing so far."""
    if isinstance(value_spec, str) and value_spec.startswith('p'):
        pct, _, scope = value_spec[1:].partition('_of_')
        sel = np.isfinite(grid) & (passing if scope == 'passing' else True)
        v = grid[sel]
        return float(np.percentile(v, float(pct))) if v.size else float('inf')
    return float(value_spec)


# ─── Zone engine ─────────────────────────────────────────────────────────────

def choose_base(habitat_robust, habitat_nominal, cell_m):
    """Default base: the largest robust habitat component (robust ⊆ nominal, so it is valid in both
    variants); falls back to the largest nominal component. Returns (mask, info) or (None, info)."""
    for variant, m in (('robust', habitat_robust), ('nominal', habitat_nominal)):
        labels, n = ndimage.label(m, structure=np.ones((3, 3), bool))
        if n:
            k = int(np.argmax(np.bincount(labels.ravel())[1:])) + 1
            base = labels == k
            r, c = np.argwhere(base).mean(axis=0)
            return base, {'chosen_by': 'default: largest %s habitat component' % variant,
                          'area_m2': float(base.sum() * cell_m * cell_m),
                          'centroid_cell': [int(round(r)), int(round(c))]}
    return None, {'chosen_by': 'none: no habitat zone'}


def compute_zones(grids, cell_m, config=ZONE_CONFIG, base_mask=None):
    """Compute nominal and robust masks for every zone.

    base_mask: the chosen base (e.g. the habitat component a user clicked). None → choose_base().
    The SAME base is used in both variants so it doesn't move when blindspots are toggled.
    Returns {'zones': {name: {variant: {...}}}, 'derived': per-variant derived grids, 'base': info}.
    A zone whose inputs are missing (no ice mask, no insolation, no base) is reported as unavailable.
    """
    out = {}
    derived = {'nominal': {}, 'robust': {}}
    base_info = None
    for name in config['order']:
        zc = config['zones'][name]
        out[name] = {}
        for variant in ('nominal', 'robust'):
            g = dict(grids)
            g.update(derived[variant])
            r_m = zc.get('erode_r_m', 0.0)
            res = {'available': True, 'criteria': [], 'values': {}, 'erode_r_m': r_m}
            shape = grids['slope'].shape
            mean_ok = np.ones(shape, bool)     # footprint-mean criteria, tested at the centre
            cell_ok = np.ones(shape, bool)     # per-cell criteria (must hold on the whole footprint)
            for key, op, val, evidence in zc['criteria']:
                gk = _key_for(key, variant)
                if gk not in g:
                    res['available'] = False
                    res['missing'] = gk
                    break
                averaged = bool(r_m) and gk in FOOTPRINT_MEAN_KEYS
                vals = footprint_mean(g[gk], r_m, cell_m) if averaged else g[gk]
                thr = _threshold(val, vals, mean_ok & cell_ok)
                with np.errstate(invalid='ignore'):
                    ok = OPS[op](vals, thr)    # NaN (footprint off the grid) fails
                if averaged:
                    mean_ok &= ok
                else:
                    cell_ok &= ok
                res['values'][gk] = vals
                res['criteria'].append({'key': key, 'grid': gk, 'op': op, 'threshold': thr, 'evidence': evidence,
                                        'applies_to': ('mean over footprint' if averaged
                                                       else 'every cell of footprint' if r_m else 'cell')})
            if not res['available']:
                zmask = np.zeros(shape, bool)
                centers = zmask
                res.update(area_m2=0.0, n_components=0, component_areas_m2=[])
            else:
                centers = mean_ok & erode(cell_ok, r_m, cell_m)
                zmask = footprint_union(centers, r_m, cell_m)
                zmask, labels, areas = components(zmask, cell_m, zc.get('min_area_m2', 0.0))
                res.update(area_m2=float(zmask.sum() * cell_m * cell_m), n_components=len(areas),
                           component_areas_m2=[round(a, 1) for a in areas], labels=labels)
            res['mask'] = zmask
            res['centers'] = centers
            out[name][variant] = res
            # zones other rules depend on
            if name == 'habitat' and res['available']:
                derived[variant]['dist_habitat_m'] = dist_to(zmask, cell_m)
            if name == 'ice_access' and res['available']:
                derived[variant]['dist_ice_access_m'] = dist_to(zmask, cell_m)
        if name == 'habitat':
            if base_mask is not None:
                base = np.asarray(base_mask, bool)
                r, c = np.argwhere(base).mean(axis=0) if base.any() else (0, 0)
                base_info = {'chosen_by': 'user', 'area_m2': float(base.sum() * cell_m * cell_m),
                             'centroid_cell': [int(round(r)), int(round(c))]}
            else:
                base, base_info = choose_base(out['habitat']['robust']['mask'],
                                              out['habitat']['nominal']['mask'], cell_m)
            if base is not None and base.any():
                for v in derived:
                    derived[v]['dist_base_m'] = dist_to(base, cell_m)
                base_info['mask'] = base
    for name in out:
        nom, rob = out[name]['nominal'], out[name]['robust']
        ratio = None
        if nom['available'] and nom['area_m2'] > 0:
            ratio = rob['area_m2'] / nom['area_m2']
        out[name]['robust_over_nominal'] = ratio
        out[name]['label'] = config['zones'][name]['label']
        if 'depth_label' in config['zones'][name]:
            out[name]['depth_label'] = config['zones'][name]['depth_label']
    return {'zones': out, 'derived': derived, 'base': base_info}


def cell_checklist(result, name, variant, r, c):
    """Per-criterion pass/fail at one cell: value vs threshold + evidence level (for the popup).

    For footprint zones, values are for the footprint centred on this cell.
    """
    z = result['zones'][name][variant]
    rows = []
    for crit in z['criteria']:
        v = float(z['values'][crit['grid']][r, c])
        rows.append({'criterion': crit['key'], 'value': v, 'op': crit['op'], 'threshold': crit['threshold'],
                     'applies_to': crit['applies_to'],
                     'pass': bool(OPS[crit['op']](v, crit['threshold'])), 'evidence': crit['evidence']})
    if z.get('erode_r_m'):
        rows.append({'criterion': 'footprint centred here passes (disk r = %g m)' % z['erode_r_m'],
                     'pass': bool(z['centers'][r, c]), 'evidence': 'derived'})
        rows.append({'criterion': 'inside some passing footprint',
                     'pass': bool(z['mask'][r, c]), 'evidence': 'derived'})
    return rows


def summary(result):
    """JSON-safe per-zone summary: nominal area, robust area, ratio, thresholds."""
    s = {}
    for name, z in result['zones'].items():
        zc = ZONE_CONFIG['zones'].get(name, {})
        s[name] = {'label': z['label'], 'robust_over_nominal': z['robust_over_nominal'],
                   'ratio_meaning': 'sensitivity under stated assumptions, not a probability',
                   'erode_r_m': z['nominal'].get('erode_r_m', 0.0), 'min_area_m2': zc.get('min_area_m2', 0.0)}
        if 'depth_label' in z:
            s[name]['depth_label'] = z['depth_label']
        for variant in ('nominal', 'robust'):
            v = z[variant]
            s[name][variant] = {k: v[k] for k in ('available', 'area_m2', 'n_components', 'component_areas_m2')}
            if not v['available']:
                s[name][variant]['missing'] = v.get('missing')
            s[name][variant]['criteria'] = [{k: c[k] for k in ('key', 'grid', 'op', 'threshold', 'evidence', 'applies_to')}
                                            for c in v['criteria']]
    if 'landing' in s and result.get('base'):
        s['landing']['base'] = {k: v for k, v in result['base'].items() if k != 'mask'}
    return s


# ─── Insolation (terrain-only: no dust, no atmosphere) ───────────────────────

def horizon_angles(z, cell_m, n_az=36, max_dist_m=None, n_samples=160):
    """Horizon elevation angle (rad) per azimuth: H(az) = max_d atan((z(p + d·û) − z(p)) / d).

    Azimuths are clockwise from north (0 = N, 90° = E); row index increases southward.
    NaN cells (no data) never block the sun. Distances are sampled geometrically from 1 cell to max_dist_m.
    Returns array (n_az, rows, cols), float32.
    """
    rows, cols = z.shape
    if max_dist_m is None:
        max_dist_m = math.hypot(rows, cols) * cell_m
    dists = np.unique(np.round(np.geomspace(1.0, max_dist_m / cell_m, n_samples), 3))
    H = np.full((n_az, rows, cols), -np.pi / 2, np.float32)
    for k in range(n_az):
        az = 2 * np.pi * k / n_az
        dr, dc = -math.cos(az), math.sin(az)
        seen = set()
        for d in dists:
            oi, oj = int(round(dr * d)), int(round(dc * d))
            if (oi, oj) in seen or (oi == 0 and oj == 0):
                continue
            seen.add((oi, oj))
            if abs(oi) >= rows or abs(oj) >= cols:
                continue
            dd = math.hypot(oi, oj) * cell_m
            # z at p + offset, aligned to p
            src = z[max(oi, 0):rows + min(oi, 0), max(oj, 0):cols + min(oj, 0)]
            base = z[max(-oi, 0):rows + min(-oi, 0), max(-oj, 0):cols + min(-oj, 0)]
            ang = np.arctan((src - base) / dd).astype(np.float32)
            tgt = H[k, max(-oi, 0):rows + min(-oi, 0), max(-oj, 0):cols + min(-oj, 0)]
            np.fmax(tgt, ang, out=tgt)   # fmax ignores NaN
    return H


def slope_aspect(z, cell_m):
    """Slope (rad) and aspect = downslope azimuth clockwise from north (rad)."""
    dzdr, dzdc = np.gradient(z, cell_m)          # row increases southward
    slope = np.arctan(np.hypot(dzdr, dzdc))
    east, north = -dzdc, dzdr                    # downslope direction components
    aspect = np.mod(np.arctan2(east, north), 2 * np.pi)
    return slope, aspect


def sun_positions(lat_deg, ls_deg, n_hours=96):
    """Sun elevation α and azimuth (clockwise from N) over one sol, for samples with α > 0."""
    phi = math.radians(lat_deg)
    dec = math.asin(math.sin(math.radians(MARS_OBLIQUITY_DEG)) * math.sin(math.radians(ls_deg)))
    h = (np.arange(n_hours) + 0.5) / n_hours * 2 * np.pi - np.pi
    sin_a = math.sin(phi) * math.sin(dec) + math.cos(phi) * math.cos(dec) * np.cos(h)
    alpha = np.arcsin(np.clip(sin_a, -1, 1))
    az = np.mod(np.arctan2(-math.cos(dec) * np.sin(h),
                           math.sin(dec) * math.cos(phi) - math.cos(dec) * math.sin(phi) * np.cos(h)), 2 * np.pi)
    up = sin_a > 0
    return alpha[up], az[up]


def insolation_fraction(z, cell_m, lat_deg, ls_deg, H=None, n_hours=96):
    """S = Σ lit·max(0, cos i) / Σ max(0, sin α)  over one sol. Flat, unobstructed ground → 1."""
    if H is None:
        H = horizon_angles(z, cell_m)
    n_az = H.shape[0]
    slope, aspect = slope_aspect(z, cell_m)
    alpha, az = sun_positions(lat_deg, ls_deg, n_hours)
    num = np.zeros(z.shape)
    den = 0.0
    for a, s_az in zip(alpha, az):
        x = s_az / (2 * np.pi) * n_az            # interpolate horizon between azimuth bins
        k0 = int(math.floor(x)) % n_az
        k1 = (k0 + 1) % n_az
        w = x - math.floor(x)
        h_sun = (1 - w) * H[k0] + w * H[k1]
        lit = a > h_sun
        cos_i = np.cos(slope) * math.sin(a) + np.sin(slope) * math.cos(a) * np.cos(s_az - aspect)
        num += lit * np.maximum(0.0, cos_i)
        den += max(0.0, math.sin(a))
    S = num / den if den > 0 else np.zeros(z.shape)
    S[np.isnan(z)] = np.nan
    return S


def seasonal_insolation(z, cell_m, config=ZONE_CONFIG):
    """S for each configured Ls on one horizon field. Returns (S_winter, S_annual, per_ls dict)."""
    H = horizon_angles(z, cell_m, n_az=config['horizon_azimuths'])
    per_ls = {}
    for ls in config['insolation_ls']:
        per_ls[ls] = insolation_fraction(z, cell_m, config['latitude_deg'], ls, H=H,
                                         n_hours=config['insolation_hours'])
    S_annual = np.mean([per_ls[ls] for ls in config['insolation_ls']], axis=0)
    return per_ls[270], S_annual, per_ls
