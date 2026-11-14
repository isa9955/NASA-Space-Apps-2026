"""Deterministic, regional terrain selection; no habitat scoring."""
from itertools import combinations
import math

import numpy as np
from pyproj import Geod, Transformer

from .coordinates import MARS_GEOGRAPHIC_CRS, MARS_RADIUS_M
from .mola import elevation_and_slope

GEOD = Geod(a=MARS_RADIUS_M, b=MARS_RADIUS_M)


def distance_m(a, b):
    return abs(GEOD.inv(a[0], a[1], b[0], b[1])[2])


def select_pair(candidates, reference_coordinates, minimum_separation):
    if not math.isfinite(minimum_separation) or minimum_separation <= 0:
        raise ValueError("Separation must be positive and finite")
    ordered = sorted(candidates, key=lambda c: (
        c["slopeDegrees"], -c["minimumNeighborhoodCount"],
        -c["observationCount"], c["tileRow"], c["tileColumn"]
    ))
    distant = [c for c in ordered if distance_m(c["coordinates"], reference_coordinates) >= minimum_separation]
    # First feasible pair in lexicographic rank order, without relaxing separation.
    for first, second in combinations(distant, 2):
        if distance_m(first["coordinates"], second["coordinates"]) >= minimum_separation:
            return [first, second]
    raise ValueError("No two count-supported candidates satisfy the configured separation")


def discover_candidates(topography, counts, window, bounds, minimum_count):
    if not isinstance(minimum_count, int) or not 1 <= minimum_count <= 255:
        raise ValueError("Minimum neighborhood count must be an integer in [1, 255]")
    if (topography.shape != counts.shape or topography.transform != counts.transform
            or topography.crs != counts.crs):
        raise ValueError("Topography and count grids must align")
    inverse = Transformer.from_crs(topography.crs, MARS_GEOGRAPHIC_CRS,
                                   always_xy=True, force_over=True)
    count_array = counts.read(1)
    candidates = []
    for row in range(1, topography.height - 1):
        for col in range(1, topography.width - 1):
            neighborhood = count_array[row-1:row+2, col-1:col+2]
            if np.any(neighborhood < minimum_count):
                continue
            lon, lat = inverse.transform(*topography.xy(row, col))
            lon %= 360
            if not (bounds["west"] <= lon <= bounds["east"] and bounds["south"] <= lat <= bounds["north"]):
                continue
            elevation, slope, count, reason, basis = elevation_and_slope(topography, lon, lat, counts)
            if reason or slope is None or not math.isfinite(slope) or basis != "all_3x3_cells_have_direct_observations":
                continue
            tile_row, tile_col = window.row_offset + row, window.col_offset + col
            candidates.append({
                "id": f"arcadia-mola-r{tile_row}-c{tile_col}",
                "coordinates": [lon, lat], "elevationMeters": elevation,
                "slopeDegrees": slope, "observationCount": count,
                "minimumNeighborhoodCount": int(neighborhood.min()),
                "tileRow": tile_row, "tileColumn": tile_col,
            })
    return candidates
