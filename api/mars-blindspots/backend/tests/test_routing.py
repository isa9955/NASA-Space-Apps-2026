import math, os, sys
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import routing as R


def make(T, Tw=None, slope=None, cell_m=10.0):
    T = np.asarray(T, float); Tw = T.copy() if Tw is None else np.asarray(Tw, float)
    rows, cols = T.shape
    meta = {'size': [rows, cols], 'resolution': cell_m}
    grid = {'traversability': T.tolist(), 'trav_worst': Tw.tolist(),
            'slope': (np.zeros_like(T) if slope is None else slope).tolist(),
            'slope_uncertainty': np.zeros_like(T).tolist(), 'elevation': np.zeros_like(T).tolist(), 'step_r': 1}
    return R.prepare_grids(meta, grid)


def test_straight_line_on_flat():
    g = make(np.ones((5, 10)))
    p = R.astar(g, (2, 0), (2, 9), g['trav'])
    assert p[0] == (2, 0) and p[-1] == (2, 9) and len(p) == 10
    assert math.isclose(R.route_metrics(g, p)['distance_m'], 90.0)


def test_wall_forces_detour():
    T = np.ones((7, 7)); T[0:6, 3] = 0.0           # wall with a gap at the bottom row
    g = make(T)
    p = R.astar(g, (0, 0), (0, 6), g['trav'])
    assert all(T[c] >= R.IMPASSABLE_T for c in p)
    assert any(r == 6 for r, _ in p)


def test_safe_route_avoids_uncertain_band():
    T = np.ones((9, 9)); Tw = np.ones((9, 9)); Tw[1:8, 4] = 0.2   # nominally fine, worst-case poor
    g = make(T, Tw)
    std = R.astar(g, (4, 0), (4, 8), g['trav'])
    safe = R.astar(g, (4, 0), (4, 8), g['safe'])
    assert R.route_metrics(g, safe)['mean_gap'] < R.route_metrics(g, std)['mean_gap']


def test_safe_cost_formula():
    g = make([[1.0, 0.5]], [[0.5, 0.5]])
    assert np.allclose(g['gap'], [[0.5, 0.0]])
    assert np.allclose(g['safe'], [[0.5 / 3.5, 0.5]])
