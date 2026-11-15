"""Mars Blindspots — routing, scout points and science candidates (Python reference port).

This is a faithful port of the in-browser logic in web/index.html (prepareGrids, astar, routeMetrics,
findScoutPoints, findScienceTargets) so the back end can compute routes without the browser.
Same constants, same costs, same heuristic. Python 3.9 compatible; needs only numpy (+ scipy optional).

Inputs: data/<site>/data_grid.json and metadata.json (see docs/ARCHITECTURE.md §4).
Grid convention: row 0 = north edge; flat index i = r * cols + c.

Usage:
    python3 backend/routing.py data/deuteronilus 600,100 150,300     # start r,c  end r,c (grid cells)
"""
import heapq
import json
import math
import os
import sys

import numpy as np

EVA_SPEED_M_PER_MIN = 50.0     # ~3 km/h suited EVA pace (Apollo-era average)
CORRIDOR_M = 200.0             # science-candidate search corridor around routes
IMPASSABLE_T = 0.05            # nominal traversability below this is a hard wall
SAFE_GAP_WEIGHT = 5.0          # SAFE = max(0.01, Tw / (1 + 5·gap))
CRITICAL_GAP = 0.5             # "critical blindspot" cut-off (same as UI inspector)
COST_EPS = 0.01                # step cost = move / (pass + 0.01)


# ─── Loading & derived grids ────────────────────────────────────────────────

def load_site(site_dir):
    with open(os.path.join(site_dir, 'metadata.json')) as f:
        meta = json.load(f)
    with open(os.path.join(site_dir, 'data_grid.json')) as f:
        grid = json.load(f)
    return meta, grid


def prepare_grids(meta, grid):
    """Port of JS prepareGrids(): returns dict of 2-D float arrays + cell size in metres."""
    T = np.asarray(grid['traversability'], float)
    Tw = np.asarray(grid['trav_worst'], float)
    if (T.ndim != 2 or not T.size or Tw.shape != T.shape
            or not np.isfinite(T).all() or not np.isfinite(Tw).all()
            or np.any((T < 0) | (T > 1)) or np.any((Tw < 0) | (Tw > 1))):
        raise ValueError('Invalid traversability grid; unsupported cells cannot become routes')
    rows, cols = T.shape
    step = grid.get('step_r') or (meta['size'][0] / rows)
    cell_m = step * (meta.get('resolution') or 1.0)
    if not math.isfinite(cell_m) or cell_m <= 0 or grid.get('step_c', step) != step:
        raise ValueError('Routing requires finite, positive square grid spacing')
    gap = np.maximum(0.0, T - Tw)
    safe = np.maximum(0.01, Tw / (1.0 + gap * SAFE_GAP_WEIGHT))
    g = {
        'trav': T, 'worst': Tw, 'gap': gap, 'safe': safe,
        'slope': np.asarray(grid['slope'], float),
        'unc': np.asarray(grid['slope_uncertainty'], float),
        'cell_m': float(cell_m), 'rows': rows, 'cols': cols,
    }
    elev = grid.get('elevation')
    g['elev'] = np.asarray(elev, float) if elev else None
    for key in ('slope', 'unc', 'elev'):
        if g[key] is not None and (g[key].shape != T.shape or not np.isfinite(g[key]).all()):
            raise ValueError('Invalid or unsupported terrain grid: ' + key)
    # Local relief (elevation minus 9×9 mean) and slope variability (5×5 std), edge windows clipped like the JS
    g['relief'] = g['elev'] - box_mean(g['elev'], 4) if g['elev'] is not None else None
    m = box_mean(g['slope'], 2)
    m2 = box_mean(g['slope'] ** 2, 2)
    g['slope_std'] = np.sqrt(np.maximum(0.0, m2 - m * m))
    return g


def box_mean(a, k):
    """Mean over a (2k+1)² window, clipped at edges (window shrinks, like the JS integral-image version)."""
    a = np.asarray(a, float)
    I = np.zeros((a.shape[0] + 1, a.shape[1] + 1))
    I[1:, 1:] = a.cumsum(0).cumsum(1)
    rows, cols = a.shape
    r = np.arange(rows); c = np.arange(cols)
    r0 = np.clip(r - k, 0, rows - 1); r1 = np.clip(r + k, 0, rows - 1)
    c0 = np.clip(c - k, 0, cols - 1); c1 = np.clip(c + k, 0, cols - 1)
    S = (I[(r1 + 1)[:, None], (c1 + 1)[None, :]] - I[r0[:, None], (c1 + 1)[None, :]]
         - I[(r1 + 1)[:, None], c0[None, :]] + I[r0[:, None], c0[None, :]])
    n = (r1 - r0 + 1)[:, None] * (c1 - c0 + 1)[None, :]
    return S / n


# ─── A* (8-connected) ───────────────────────────────────────────────────────

_DIRS = [(-1, 0, 1.0), (1, 0, 1.0), (0, -1, 1.0), (0, 1, 1.0),
         (-1, -1, math.sqrt(2)), (-1, 1, math.sqrt(2)), (1, -1, math.sqrt(2)), (1, 1, math.sqrt(2))]


def astar(g, start, end, pass_grid):
    """Port of JS astar(). start/end = (row, col). pass_grid = g['trav'] (standard) or g['safe'] (safe).

    Step cost = move / (pass + 0.01), move ∈ {1, √2}. Cells with NOMINAL T < 0.05 are walls, including endpoints;
    the safe planner treats worst-case-impassable cells as very expensive, not forbidden.
    Heuristic: octile distance × (1/1.01) — admissible because pass ≤ 1 ⇒ min step cost = 1/1.01.
    Returns list of (row, col) or None.
    """
    rows, cols = g['rows'], g['cols']
    T = g['trav']
    if (pass_grid.shape != T.shape or not np.isfinite(pass_grid).all()
            or np.any((pass_grid < 0) | (pass_grid > 1))):
        raise ValueError('Invalid routing cost grid')
    for point in (start, end):
        if (len(point) != 2 or any(not isinstance(v, (int, np.integer)) for v in point)
                or not 0 <= point[0] < rows or not 0 <= point[1] < cols
                or T[tuple(point)] < IMPASSABLE_T):
            return None
    er, ec = end
    min_step = 1.0 / 1.01

    def h(r, c):
        dr, dc = abs(r - er), abs(c - ec)
        return min_step * (dr + dc + (math.sqrt(2) - 2) * min(dr, dc))

    best = np.full((rows, cols), np.inf)
    came = {}
    closed = np.zeros((rows, cols), bool)
    best[start] = 0.0
    heap = [(h(*start), start)]
    while heap:
        _, cur = heapq.heappop(heap)
        if cur == tuple(end):
            path = [cur]
            while path[-1] in came:
                path.append(came[path[-1]])
            return path[::-1]
        if closed[cur]:
            continue
        closed[cur] = True
        r, c = cur
        for dr, dc, mv in _DIRS:
            nr, nc = r + dr, c + dc
            if nr < 0 or nr >= rows or nc < 0 or nc >= cols or closed[nr, nc]:
                continue
            if T[nr, nc] < IMPASSABLE_T:
                continue
            if dr and dc and (T[r, nc] < IMPASSABLE_T or T[nr, c] < IMPASSABLE_T):
                continue
            ng = best[r, c] + mv / (pass_grid[nr, nc] + COST_EPS)
            if ng < best[nr, nc]:
                best[nr, nc] = ng
                came[(nr, nc)] = cur
                heapq.heappush(heap, (ng + h(nr, nc), (nr, nc)))
    return None


def route_metrics(g, path):
    """Port of JS routeMetrics(): distance, walking time, % critical-blindspot cells, worst-case traversability."""
    dist = 0.0
    for a, b in zip(path, path[1:]):
        dist += math.hypot(a[0] - b[0], a[1] - b[1]) * g['cell_m']
    idx = tuple(np.array(path).T)
    gap, Tw = g['gap'][idx], g['worst'][idx]
    return {
        'distance_m': dist,
        'time_min': dist / EVA_SPEED_M_PER_MIN,
        'uncertain_pct': float((gap > CRITICAL_GAP).mean() * 100),
        'worst_min': float(Tw.min()),
        'worst_mean': float(Tw.mean()),
        'mean_gap': float(gap.mean()),
    }


# ─── Scout points ───────────────────────────────────────────────────────────

def scout_points(g, path, safe_path=None):
    """Port of JS findScoutPoints(): 3–5 largest-gap cells on the standard route (gap > 0.1), spaced along it."""
    gap = g['gap']
    cands = sorted([(gap[p], i, p) for i, p in enumerate(path) if gap[p] > 0.1], key=lambda t: -t[0])
    picked = []
    for sep in (max(8, len(path) // 6), max(4, len(path) // 12)):
        for gv, i, p in cands:
            if len(picked) >= 5:
                break
            if all(abs(q[1] - i) >= sep for q in picked):
                picked.append((gv, i, p))
        if len(picked) >= 3:
            break
    picked.sort(key=lambda t: t[1])
    along = [0.0]
    for a, b in zip(path, path[1:]):
        along.append(along[-1] + math.hypot(a[0] - b[0], a[1] - b[1]) * g['cell_m'])
    out = []
    for n, (gv, i, p) in enumerate(picked, 1):
        bypass = None
        if safe_path:
            bypass = min(math.hypot(p[0] - q[0], p[1] - q[1]) for q in safe_path) * g['cell_m']
        out.append({'n': n, 'cell': list(p), 'gap': float(gv), 'along_m': along[i], 'bypass_m': bypass,
                    'slope': float(g['slope'][p]), 'slope_unc': float(g['unc'][p]),
                    'trav': float(g['trav'][p]), 'trav_worst': float(g['worst'][p])})
    return out


# ─── Science candidates (geometric, not mapped units) ───────────────────────

def science_candidates(g, paths):
    """Port of JS findScienceTargets(): up to 6 candidates within 200 m of any route.

    Categories (min score): outcrop = steep local slope max (≥28°, 5×5), knob = relief max (≥2.5 m, 7×7),
    low = relief min (≤−2.5 m, 7×7), rough = slope-std max (≥6°, 5×5). Max 2 per category, ≥90 m apart.
    """
    rows, cols, cm = g['rows'], g['cols'], g['cell_m']
    R = int(math.ceil(CORRIDOR_M / cm))
    dist2 = np.full((rows, cols), np.inf)
    for path in paths:
        for (r0, c0) in path[::2]:
            for dr in range(-R, R + 1):
                r = r0 + dr
                if r < 0 or r >= rows:
                    continue
                for dc in range(-R, R + 1):
                    c = c0 + dc
                    d2 = dr * dr + dc * dc
                    if c < 0 or c >= cols or d2 > R * R:
                        continue
                    if d2 < dist2[r, c]:
                        dist2[r, c] = d2
    corridor = np.argwhere(np.isfinite(dist2) & (dist2 >= 4))

    def is_local_max(arr, r, c, k, sign=1):
        v = arr[r, c] * sign
        win = arr[max(0, r - k):r + k + 1, max(0, c - k):c + k + 1] * sign
        return not (win > v).any()

    cats = [('outcrop', lambda r, c: g['slope'][r, c], 28.0, lambda r, c: is_local_max(g['slope'], r, c, 2))]
    if g['relief'] is not None:
        cats += [('knob', lambda r, c: g['relief'][r, c], 2.5, lambda r, c: is_local_max(g['relief'], r, c, 3)),
                 ('low', lambda r, c: -g['relief'][r, c], 2.5, lambda r, c: is_local_max(g['relief'], r, c, 3, -1))]
    cats += [('rough', lambda r, c: g['slope_std'][r, c], 6.0, lambda r, c: is_local_max(g['slope_std'], r, c, 2))]

    picked = []
    sep = math.ceil(90.0 / cm)
    for name, score, mn, ok in cats:
        cand = sorted(((score(r, c), r, c) for r, c in corridor if score(r, c) >= mn), key=lambda t: -t[0])
        n = 0
        for s, r, c in cand:
            if n >= 2 or len(picked) >= 7:
                break
            if not ok(r, c):
                continue
            if any(math.hypot(p['cell'][0] - r, p['cell'][1] - c) < sep for p in picked):
                continue
            picked.append({'type': name, 'cell': [int(r), int(c)], 'value': float(s),
                           'dist_m': float(math.sqrt(dist2[r, c]) * cm)})
            n += 1
    return sorted(picked, key=lambda p: p['dist_m'])[:6]


# ─── Helpers ────────────────────────────────────────────────────────────────

def cell_to_latlon(meta, g, r, c):
    """Cell centre → (lat, lon), linear in the site bounds (row 0 = north)."""
    b = meta['bounds']
    lat = b['north'] - (r + 0.5) / g['rows'] * (b['north'] - b['south'])
    lon = b['west'] + (c + 0.5) / g['cols'] * (b['east'] - b['west'])
    return lat, lon


def plan(site_dir, start, end):
    meta, grid = load_site(site_dir)
    g = prepare_grids(meta, grid)
    std = astar(g, start, end, g['trav'])
    safe = astar(g, start, end, g['safe'])
    out = {'standard': None, 'safe': None}
    if std:
        out['standard'] = {'metrics': route_metrics(g, std), 'cells': [list(p) for p in std]}
        out['scouts'] = scout_points(g, std, safe)
    if safe:
        out['safe'] = {'metrics': route_metrics(g, safe), 'cells': [list(p) for p in safe]}
    out['science'] = science_candidates(g, [p for p in (std, safe) if p])
    return out


if __name__ == '__main__':
    site = sys.argv[1] if len(sys.argv) > 1 else 'data/deuteronilus'
    s = tuple(int(v) for v in (sys.argv[2] if len(sys.argv) > 2 else '600,100').split(','))
    e = tuple(int(v) for v in (sys.argv[3] if len(sys.argv) > 3 else '150,300').split(','))
    res = plan(site, s, e)
    for k in ('standard', 'safe'):
        print(k, json.dumps(res[k]['metrics'] if res[k] else None))
    print('scouts', len(res.get('scouts', [])), 'science', [p['type'] for p in res['science']])
