"""Export habitability zones as smooth "blob" polygons (GeoJSON) for any map UI.

Reads data/<site>/zones.json (authoritative run-length masks) + metadata.json bounds and writes
data/<site>/zones_blobs.geojson: one MultiPolygon-ish set of Polygon features per zone × variant
(nominal, robust), with holes, smoothed for display.

Display-only smoothing: mask → Gaussian blur (σ = SMOOTH_CELLS) → contour at 0.5 → drop tiny rings
→ lat/lon. Areas in the properties are the EXACT mask areas from zones.json, not the smoothed polygons.
Python 3.9; needs numpy, scipy, contourpy (ships with matplotlib).

    python3 backend/zones_to_geojson.py data/deuteronilus
"""
import json
import os
import sys

import contourpy
import numpy as np
from scipy import ndimage

SMOOTH_CELLS = 1.5        # Gaussian σ in grid cells (~15 m at 10 m cells)
MIN_RING_CELLS = 12       # drop rings enclosing fewer than this many cells (speckle)
COLORS = {'habitat': '#ffd33d', 'landing': '#f778ba', 'ice_access': '#39d3f2',
          'greenhouse': '#7ee787', 'datacenter': '#d2a8ff', 'solar': '#ffa657'}


def decode_rle(rle, n):
    vals, v = [], bool(rle[0])
    for run in rle[1:]:
        vals.append(np.full(run, v, bool)); v = not v
    out = np.concatenate(vals) if vals else np.zeros(0, bool)
    assert out.size == n, (out.size, n)
    return out


def ring_area(xy):
    x, y = xy[:, 0], xy[:, 1]
    return 0.5 * (np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1)))


def mask_to_polygons(mask):
    """Return list of polygons; each = [outer_ring, hole1, ...] in (row, col) float coords."""
    f = ndimage.gaussian_filter(np.pad(mask.astype(float), 2), SMOOTH_CELLS)
    gen = contourpy.contour_generator(z=f, line_type=contourpy.LineType.Separate)
    rings = [r - 2.0 for r in gen.lines(0.5) if len(r) >= 4]      # r[:,0]=x=col, r[:,1]=y=row
    rings = [np.column_stack([r[:, 1], r[:, 0]]) for r in rings if abs(ring_area(r)) >= MIN_RING_CELLS]
    outers = [r for r in rings if ring_area(r[:, ::-1]) > 0]
    holes = [r for r in rings if ring_area(r[:, ::-1]) <= 0]
    if not outers:                       # orientation convention differs → flip
        outers, holes = holes, outers
    from matplotlib.path import Path
    polys = [[o] for o in outers]
    for h in holes:
        for p in polys:
            if Path(p[0]).contains_point(h[0]):
                p.append(h); break
    return polys


def to_lonlat(ring, meta, rows, cols):
    b = meta['bounds']
    lat = b['north'] - ring[:, 0] / rows * (b['north'] - b['south'])
    lon = b['west'] + ring[:, 1] / cols * (b['east'] - b['west'])
    pts = np.round(np.column_stack([lon, lat]), 7).tolist()
    if pts[0] != pts[-1]:
        pts.append(pts[0])
    return pts


def main(site_dir):
    meta = json.load(open(os.path.join(site_dir, 'metadata.json')))
    z = json.load(open(os.path.join(site_dir, 'zones.json')))
    rows, cols = z['grid']['rows'], z['grid']['cols']
    feats = []
    for name, variants in z['masks'].items():
        info = z['zones'][name]
        for variant in ('nominal', 'robust'):
            if variant not in variants:
                continue
            m = decode_rle(variants[variant], rows * cols).reshape(rows, cols)
            for k, poly in enumerate(mask_to_polygons(m)):
                feats.append({'type': 'Feature',
                              'geometry': {'type': 'Polygon',
                                           'coordinates': [to_lonlat(r, meta, rows, cols) for r in poly]},
                              'properties': {'zone': name, 'label': info.get('label', name), 'variant': variant,
                                             'color': COLORS.get(name), 'part': k,
                                             'zone_area_m2_exact': info.get(variant, {}).get('area_m2'),
                                             'robust_over_nominal': info.get('robust_over_nominal'),
                                             'note': 'display-smoothed outline; exact masks in zones.json'}})
    out = {'type': 'FeatureCollection',
           'properties': {'site': os.path.basename(site_dir.rstrip('/')), 'smoothing_sigma_cells': SMOOTH_CELLS,
                          'cell_m': z['grid']['cell_m'],
                          'caveat': 'Preliminary rule-based suitability; thresholds assumed; ice polygons are a draft interpretation.'},
           'features': feats}
    path = os.path.join(site_dir, 'zones_blobs.geojson')
    json.dump(out, open(path, 'w'), separators=(',', ':'))
    print(path, len(feats), 'features', os.path.getsize(path) // 1024, 'KB')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'data/deuteronilus')
