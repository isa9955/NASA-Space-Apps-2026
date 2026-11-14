"""Deterministic A* on count-supported MOLA terrain; no safety certification."""
import heapq
import math

import numpy as np
from pyproj import Transformer

from .coordinates import MARS_GEOGRAPHIC_CRS
from .mola import elevation_and_slope
from .selection import distance_m


def supported_grid(topography, counts, minimum_count, allow_interpolated=False):
    if topography.shape != counts.shape or topography.transform != counts.transform or topography.crs != counts.crs:
        raise ValueError("MOLA elevation and count grids must align")
    if topography.crs is None or topography.crs.to_wkt() == "":
        raise ValueError("MOLA CRS is required")
    if not isinstance(minimum_count, int) or not 1 <= minimum_count <= 255:
        raise ValueError("Minimum count must be an integer in [1, 255]")
    inverse = Transformer.from_crs(topography.crs, MARS_GEOGRAPHIC_CRS, always_xy=True, force_over=True)
    count_values = counts.read(1)
    elevation = topography.read(1).astype(float)
    valid_elevation = np.isfinite(elevation) & (elevation >= -8208) & (elevation <= 21249)
    if topography.nodata is not None and topography.nodata != 0:
        valid_elevation &= elevation != topography.nodata
    valid_elevation &= ~((elevation == 0) & (count_values == 0))
    slopes = np.full(topography.shape, np.nan)
    coordinates = np.empty((*topography.shape, 2))
    for row in range(topography.height):
        for col in range(topography.width):
            lon, lat = inverse.transform(*topography.xy(row, col))
            coordinates[row, col] = [lon % 360, lat]
            if row == 0 or col == 0 or row == topography.height - 1 or col == topography.width - 1:
                continue
            neighborhood_counts = count_values[row-1:row+2, col-1:col+2]
            if not allow_interpolated and np.any(neighborhood_counts < minimum_count):
                continue
            if not np.all(valid_elevation[row-1:row+2, col-1:col+2]):
                continue
            neighborhood = elevation[row-1:row+2, col-1:col+2]
            if np.any((neighborhood == 0) & (neighborhood_counts == 0)):
                continue  # Header ignore value without direct observations is ambiguous.
            _, slope, _, reason, basis = elevation_and_slope(topography, lon % 360, lat, counts)
            if reason is None and (allow_interpolated or basis == "all_3x3_cells_have_direct_observations"):
                slopes[row, col] = slope
    return elevation, slopes, coordinates


def astar(elevation, slopes, coordinates, start, goal, max_slope, penalty,
          uncertainty=None, uncertainty_penalty=0):
    """Eight-neighbor A*, geodesic lower-bound heuristic, fixed row/col tie order."""
    if not math.isfinite(max_slope) or not 0 < max_slope < 90 or not math.isfinite(penalty) or penalty < 0:
        raise ValueError("Routing requires slope limit in (0, 90) and nonnegative penalty")
    if slopes.shape != elevation.shape or coordinates.shape != (*elevation.shape, 2):
        raise ValueError("Routing arrays must align")
    allowed = np.isfinite(elevation) & np.isfinite(slopes) & (slopes >= 0) & (slopes <= max_slope)
    if not math.isfinite(uncertainty_penalty) or uncertainty_penalty < 0:
        raise ValueError("Uncertainty penalty must be nonnegative and finite")
    if uncertainty is None:
        uncertainty = np.zeros_like(slopes)
    if uncertainty.shape != slopes.shape or not np.all(np.isfinite(uncertainty)) or np.any((uncertainty < 0) | (uncertainty > 1)):
        raise ValueError("Uncertainty grid must align and contain finite fractions in [0,1]")
    def valid(cell):
        return 0 <= cell[0] < allowed.shape[0] and 0 <= cell[1] < allowed.shape[1] and allowed[cell]
    if not valid(start) or not valid(goal):
        return None, "endpoint_unsupported_or_exceeds_slope_limit"
    if start == goal:
        return None, "endpoints_share_one_grid_cell"
    def heuristic(cell):
        return distance_m(coordinates[cell], coordinates[goal])
    best, parents = {start: 0.0}, {}
    queue = [(heuristic(start), 0.0, start)]
    while queue:
        _, cost, cell = heapq.heappop(queue)
        if cost != best[cell]:
            continue
        if cell == goal:
            path = [cell]
            while cell in parents:
                cell = parents[cell]
                path.append(cell)
            return list(reversed(path)), None
        r, c = cell
        for dr, dc in ((-1,-1),(-1,0),(-1,1),(0,-1),(0,1),(1,-1),(1,0),(1,1)):
            neighbor = (r + dr, c + dc)
            if not valid(neighbor):
                continue
            if dr and dc and (not valid((r+dr, c)) or not valid((r, c+dc))):
                continue  # Never cut diagonally across unsupported or excluded terrain.
            distance = distance_m(coordinates[cell], coordinates[neighbor])
            if distance <= 0 or not math.isfinite(distance):
                raise ValueError("Invalid route grid coordinates")
            grade = math.degrees(math.atan2(abs(elevation[neighbor] - elevation[cell]), distance))
            steepness = max(float(slopes[cell]), float(slopes[neighbor]), grade)
            if steepness > max_slope:
                continue
            uncertain = (float(uncertainty[cell]) + float(uncertainty[neighbor])) / 2
            next_cost = cost + distance * (1 + penalty * (steepness / max_slope) ** 2 + uncertainty_penalty * uncertain)
            if next_cost < best.get(neighbor, math.inf):
                best[neighbor], parents[neighbor] = next_cost, cell
                heapq.heappush(queue, (next_cost + heuristic(neighbor), next_cost, neighbor))
    return None, "no_supported_path_in_bounded_window"


def path_metrics(path, elevation, slopes, coordinates):
    distance = gain = 0.0
    maximum = max(float(slopes[cell]) for cell in path)
    for a, b in zip(path, path[1:]):
        step = distance_m(coordinates[a], coordinates[b])
        delta = float(elevation[b] - elevation[a])
        distance += step
        gain += max(0, delta)
        maximum = max(maximum, math.degrees(math.atan2(abs(delta), step)))
    return {"distanceMeters": distance, "elevationGainMeters": gain, "maximumSlopeDegrees": maximum}
