"""Zone math checks on synthetic terrain (CLAUDE.md 'Zone math spec')."""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import zones as Z  # noqa: E402

CELL = 10.0


# ─── geometry ────────────────────────────────────────────────────────────────

def test_edt_distance_in_metres():
    m = np.zeros((50, 50), bool)
    m[25, 10] = True
    d = Z.dist_to(m, CELL)
    assert d[25, 10] == 0
    assert d[25, 30] == 200.0
    assert abs(d[28, 14] - 50.0) < 1e-9          # 3-4-5 triangle × 10 m


def test_edt_empty_mask_is_infinite():
    assert np.isinf(Z.dist_to(np.zeros((5, 5), bool), CELL)).all()


def test_dist_to_edge_both_sides():
    m = np.zeros((60, 60), bool)
    m[:, 30:] = True
    d = Z.dist_to_edge(m, CELL)
    assert d[10, 29] == 10.0 and d[10, 30] == 10.0   # nearest cell across the edge
    assert d[10, 9] == 210.0 and d[10, 50] == 210.0


def test_erosion_disk_footprint():
    m = np.zeros((100, 100), bool)
    m[20:80, 20:80] = True                          # 600 m square
    e = Z.erode(m, 50.0, CELL)                      # r = 5 cells
    assert e[50, 50] and e[25, 50] and not e[24, 50]
    assert e.sum() == 50 * 50                       # square shrinks by r on every side
    small = np.zeros((100, 100), bool)
    small[40:49, 40:49] = True                      # 90 m < 100 m diameter
    assert not Z.erode(small, 50.0, CELL).any()


def test_erosion_fails_at_grid_border():
    assert not Z.erode(np.ones((30, 30), bool), 50.0, CELL)[:5].any()


def test_components_min_area():
    m = np.zeros((40, 40), bool)
    m[2:4, 2:4] = True        # 4 cells = 400 m²
    m[20:35, 20:35] = True    # 225 cells = 22500 m²
    mask, labels, areas = Z.components(m, CELL, min_area_m2=10000)
    assert areas == [22500.0]
    assert not mask[2, 2] and mask[25, 25]


# ─── insolation ──────────────────────────────────────────────────────────────

def test_flat_plane_insolation_is_one():
    z = np.zeros((40, 40))
    for ls in (90, 180, 270):
        S = Z.insolation_fraction(z, CELL, 40.7, ls)
        assert np.allclose(S, 1.0)


def test_declination_and_noon_sun_south():
    alpha, az = Z.sun_positions(40.7, 270, n_hours=96)
    i = np.argmax(alpha)
    assert abs(np.degrees(az[i]) - 180) < 4         # noon sun due south at 40.7°N
    assert abs(np.degrees(alpha[i]) - (90 - 40.7 - 25.19)) < 0.5


def test_wall_shadows_its_north_side_in_winter():
    z = np.zeros((120, 60))
    z[58:62, :] = 200.0                             # E–W wall, 200 m tall
    S = Z.insolation_fraction(z, CELL, 40.7, 270)   # northern winter
    north, south = S[40, 30], S[80, 30]             # 180 m north / south of the wall
    assert north < 0.2 and south > 0.95


def test_slope_aspect_convention():
    z = np.tile(np.arange(20)[:, None] * -1.0, (1, 20))   # lower to the south → faces south
    _, aspect = Z.slope_aspect(z, CELL)
    assert abs(np.degrees(aspect[10, 10]) - 180) < 1e-6
    z = np.tile(np.arange(20)[None, :] * -1.0, (20, 1))   # lower to the east → faces east
    _, aspect = Z.slope_aspect(z, CELL)
    assert abs(np.degrees(aspect[10, 10]) - 90) < 1e-6


def test_south_facing_slope_gets_more_winter_sun():
    rows = np.arange(60)[:, None]
    south = np.tile(-rows * CELL * np.tan(np.radians(15)), (1, 30))
    north = np.tile(rows * CELL * np.tan(np.radians(15)), (1, 30))
    Ss = Z.insolation_fraction(south, CELL, 40.7, 270)[30, 15]
    Sn = Z.insolation_fraction(north, CELL, 40.7, 270)[30, 15]
    assert Ss > 1.0 > Sn


# ─── zone engine ─────────────────────────────────────────────────────────────

def _site(shape=(200, 200)):
    slope = np.full(shape, 2.0)
    unc = np.full(shape, 1.0)
    rough = np.full(shape, 0.1)
    trav = np.full(shape, 0.95)
    tw = np.full(shape, 0.9)
    return slope, unc, rough, trav, tw


def test_habitat_and_landing_separation():
    slope, unc, rough, trav, tw = _site((200, 300))
    slope[:, 60] = 30.0                              # scarp
    tw[:, 120:] = 0.7                                # east: fine for landing, fails habitat Tw ≥ 0.8
    g = Z.base_grids(slope, unc, rough, trav, tw, CELL)
    res = Z.compute_zones(g, CELL)
    hab = res['zones']['habitat']['nominal']['mask']
    land = res['zones']['landing']['nominal']['mask']
    assert hab.any() and land.any()
    assert not hab[:, 41:80].any()                   # ≥200 m setback from the scarp (col 60)
    base = res['base']['mask']
    assert res['base']['chosen_by'].startswith('default: largest robust')
    assert Z.dist_to(base, CELL)[land].min() >= 1000.0


def test_landing_measured_from_chosen_base_not_every_patch():
    slope, unc, rough, trav, tw = _site((100, 400))
    slope[:, 130:140] = 30.0                         # scarps split the site into patches
    slope[:, 260:270] = 30.0
    g = Z.base_grids(slope, unc, rough, trav, tw, CELL)
    res = Z.compute_zones(g, CELL)
    hab = res['zones']['habitat']['nominal']['mask']
    land = res['zones']['landing']['nominal']['mask']
    assert res['zones']['habitat']['nominal']['n_components'] == 3
    assert land.any()                                # empty if measured from every habitat patch
    assert Z.dist_to(hab, CELL)[land].min() < 1000.0
    # user-chosen base: the west patch → landing only on the far east
    west = np.zeros(slope.shape, bool)
    west[:, :100] = hab[:, :100]
    res2 = Z.compute_zones(g, CELL, base_mask=west)
    land2 = res2['zones']['landing']['nominal']['mask']
    assert res2['base']['chosen_by'] == 'user'
    assert land2.any() and Z.dist_to(west, CELL)[land2].min() >= 1000.0
    # same base in both variants
    assert Z.summary(res2)['landing']['base']['chosen_by'] == 'user'


def test_landing_unavailable_without_habitat():
    slope, unc, rough, trav, tw = _site((60, 60))
    slope[:] = 8.0
    res = Z.compute_zones(Z.base_grids(slope, unc, rough, trav, tw, CELL), CELL)
    assert not res['zones']['landing']['nominal']['available']
    assert res['base']['chosen_by'].startswith('none')


def test_robust_uses_worst_slope():
    slope, unc, rough, trav, tw = _site()
    unc[:] = 4.0                                     # 2° + 4° = 6° > 5°
    res = Z.compute_zones(Z.base_grids(slope, unc, rough, trav, tw, CELL), CELL)
    h = res['zones']['habitat']
    assert h['nominal']['area_m2'] > 0 and h['robust']['area_m2'] == 0
    assert h['robust_over_nominal'] == 0.0


def test_footprint_mean_tolerates_speckle_but_not_bad_ground():
    slope, unc, rough, trav, tw = _site()
    slope[::4, ::4] = 8.0                            # isolated 8° cells: per-cell AND would fragment habitat
    slope[:, 150:] = 7.0                             # uniformly too steep on the east
    res = Z.compute_zones(Z.base_grids(slope, unc, rough, trav, tw, CELL), CELL)
    h = res['zones']['habitat']['nominal']
    assert h['mask'][100, 60] and h['n_components'] >= 1
    assert not h['mask'][:, 160:].any()
    c = h['criteria'][0]
    assert c['key'] == 'slope' and c['applies_to'] == 'mean over footprint'
    assert h['criteria'][3]['applies_to'] == 'every cell of footprint'   # dist_scarp
    rows = Z.cell_checklist(res, 'habitat', 'nominal', 100, 60)
    assert rows[0]['value'] < 5.0 and rows[-1]['pass']


def test_footprint_mean_nan_off_grid():
    m = Z.footprint_mean(np.ones((30, 30)), 50.0, CELL)
    assert np.isnan(m[0, 0]) and np.isclose(m[15, 15], 1.0)


def test_solar_quartile_among_flat_cells():
    slope, unc, rough, trav, tw = _site((100, 100))
    slope[:, :50] = 20.0                             # steep half gets the most sun
    S = np.ones(slope.shape)
    S[:, :50] = 1.8
    S[:, 50:] = np.linspace(0.8, 1.2, 50)[None, :]
    ice = np.zeros(slope.shape, bool)
    g = Z.base_grids(slope, unc, rough, trav, tw, CELL, ice_mask=ice, S_winter=S, S_annual=S)
    sol = Z.compute_zones(g, CELL)['zones']['solar']['nominal']
    assert sol['area_m2'] > 0
    assert abs(sol['criteria'][1]['threshold'] - np.percentile(S[:, 50:], 75)) < 1e-9
    assert not sol['mask'][:, :87].any() and sol['mask'][:, 87:].all()


def test_ice_zones_unavailable_without_mask():
    res = Z.compute_zones(Z.base_grids(*_site(), cell_m=CELL), CELL)
    for name in ('ice_access', 'greenhouse', 'datacenter', 'solar'):
        assert not res['zones'][name]['nominal']['available']


def test_full_site_with_ice_and_sun():
    slope, unc, rough, trav, tw = _site()
    ice = np.zeros(slope.shape, bool)
    ice[:, 150:] = True
    S = np.ones(slope.shape)
    S[:100] = 0.8
    g = Z.base_grids(slope, unc, rough, trav, tw, CELL, ice_mask=ice, S_winter=S, S_annual=S)
    res = Z.compute_zones(g, CELL)
    zs = res['zones']
    ia = zs['ice_access']['nominal']['mask']
    assert ia[:, 130:170].all() and not ia[:, :125].any() and not ia[:, 175:].any()
    dc = zs['datacenter']['nominal']['mask']
    assert not dc[:, 141:].any()                     # off ice and ≥100 m from it (ice from col 150)
    gh = zs['greenhouse']['nominal']['mask']
    assert not gh[:100].any()                        # S_winter < 0.9 there
    assert Z.dist_to(zs['habitat']['nominal']['mask'], CELL)[gh].max() <= 500.0
    sol = zs['solar']['nominal']
    assert sol['available'] and all(a >= 10000 for a in sol['component_areas_m2'])
    rows = Z.cell_checklist(res, 'greenhouse', 'nominal', 150, 50)
    assert [r['criterion'] for r in rows] == ['slope', 'S_winter', 'dist_habitat_m', 'dist_ice_access_m']
    s = Z.summary(res)
    assert s['ice_access']['depth_label'] == '1–10 m, unknown'
