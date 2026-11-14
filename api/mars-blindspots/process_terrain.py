#!/usr/bin/env python3 -I
"""
MARS BLINDSPOTS — Terrain Processing Pipeline

Computes slope, uncertainty, traversability, and routes from Mars DTM data.
Outputs PNG layers + JSON data for the web viewer.

Usage:
    python process_terrain.py --synthetic              # Demo with generated terrain
    python process_terrain.py --input gale_dtm.tif     # Real HiRISE DTM
    python process_terrain.py --input gale_dtm.tif --crop 2000  # Crop to 2000x2000
"""

import argparse
import json
import re
import os
import sys
import heapq
import numpy as np
from pathlib import Path

# Optional imports
try:
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    import matplotlib.colors as mcolors
    from matplotlib.colors import LightSource
    HAS_MATPLOTLIB = True
except ImportError:
    HAS_MATPLOTLIB = False
    print("WARNING: matplotlib not installed. Install with: pip install matplotlib")
    sys.exit(1)

try:
    from scipy.ndimage import uniform_filter
    HAS_SCIPY = True
except ImportError:
    HAS_SCIPY = False
    print("WARNING: scipy not installed. Using numpy fallback for roughness.")


# ─── Configuration ───────────────────────────────────────────────────────────

# HiRISE DTM vertical precision (meters) — from Sutton et al. 2022
# (doi:10.3390/rs14102403). Conservative mid-range estimate.
SIGMA_Z = 0.3

# EVA traversability thresholds (degrees) — from Apollo experience
# and Curiosity rover operations
SLOPE_THRESHOLD = 20.0    # Suited astronaut practical limit
SLOPE_SHARPNESS = 3.0     # Sigmoid transition width

# Roughness threshold (meters std dev within 5m window)
ROUGHNESS_THRESHOLD = 2.0
ROUGHNESS_SHARPNESS = 0.5

# Rock abundance parameters — Golombek exponential model
# Default k for moderate rock abundance in Gale Crater region
ROCK_ABUNDANCE_K = 0.06

# Route planning parameters
ROUTE_WEIGHT_PROFILES = {
    'standard': {
        'name': 'Standard Route',
        'description': 'Shortest path using terrain data at face value — ignores measurement uncertainty',
        'color': '#4a9eff',
        'cost_fn': lambda trav, trav_worst, gap, sci: (1.0 - trav) + 0.01
    },
    'safety': {
        'name': 'Uncertainty-Aware Route',
        'description': 'Avoids areas where terrain data is uncertain — uses worst-case slope estimates',
        'color': '#3fb950',
        'cost_fn': lambda trav, trav_worst, gap, sci: (1.0 - trav_worst) + 0.5 * gap + 0.01
    },
}

# Synthetic terrain: science targets (plausible for Gale Crater context)
SCIENCE_TARGETS = [
    {
        'id': 'target_1',
        'name': 'Boxwork Outcrop',
        'description': 'Potential calcium sulfate vein network — similar structures found by Curiosity indicate past groundwater circulation.',
        'information_value': 0.9,
        'marker_offset': (0.25, 0.35),  # fraction of grid for synthetic mode
        'source': 'Analogous to Rapin et al. 2019, Curiosity observations'
    },
    {
        'id': 'target_2',
        'name': 'Layered Sediment Exposure',
        'description': 'Exposed cross-section of fine-grained sedimentary layers at crater wall — may preserve depositional history.',
        'information_value': 0.85,
        'marker_offset': (0.7, 0.25),
        'source': 'Analogous to Murray formation exposures (Grotzinger et al. 2015)'
    },
    {
        'id': 'target_3',
        'name': 'Olivine-Rich Patch',
        'description': 'Spectrally distinct dark surface — possible unweathered ignite material indicating recent exposure.',
        'information_value': 0.75,
        'marker_offset': (0.6, 0.65),
        'source': 'Analogous to CRISM olivine detections in Nili Fossae'
    },
    {
        'id': 'target_4',
        'name': 'Ridge Contact Zone',
        'description': 'Geological boundary between two distinct units — contacts reveal relative timing and formation processes.',
        'information_value': 0.8,
        'marker_offset': (0.45, 0.75),
        'source': 'Analogous to Bradbury/Murray contact (Curiosity traverse)'
    },
    {
        'id': 'target_5',
        'name': 'Smooth Basin Floor',
        'description': 'Anomalously flat terrain in local depression — possible fine sediment accumulation from ancient standing water.',
        'information_value': 0.7,
        'marker_offset': (0.35, 0.55),
        'source': 'Analogous to Yellowknife Bay mudstones (Vaniman et al. 2014)'
    },
]

OUTPUT_DIR = Path('web/data')


# ─── Terrain Generation & Loading ────────────────────────────────────────────

def generate_synthetic_terrain(size=800):
    """Generate a synthetic Mars-like terrain for demonstration."""
    print(f"  Generating {size}x{size} synthetic terrain...")
    resolution = 2.0  # meters per pixel

    x = np.linspace(0, 1, size)
    y = np.linspace(0, 1, size)
    X, Y = np.meshgrid(x, y)

    # Base elevation: gentle regional slope (typical Gale Crater floor)
    # ~100m over 1600m ≈ 3.6° average — realistic for Mars plains
    elevation = -4500.0 + 100.0 * X + 40.0 * Y

    # Large crater — wider and shallower for realistic slope angles
    # Real Mars craters at this scale: depth/diameter ~ 0.1–0.2
    cx, cy, r = 0.35, 0.45, 0.15
    dist = np.sqrt((X - cx)**2 + (Y - cy)**2)
    crater_depth = 30.0  # ~30m deep, 480m wide → walls ~7-14°
    crater = np.where(dist < r, crater_depth * ((dist / r)**2 - 1), 0.0)
    rim = np.where(
        (dist >= r) & (dist < r * 1.4),
        crater_depth * 0.2 * np.exp(-(dist - r) / (r * 0.15)),
        0.0
    )
    elevation += crater + rim

    # Medium crater
    cx2, cy2, r2 = 0.72, 0.3, 0.09
    dist2 = np.sqrt((X - cx2)**2 + (Y - cy2)**2)
    crater2 = np.where(dist2 < r2, 18.0 * ((dist2 / r2)**2 - 1), 0.0)
    rim2 = np.where(
        (dist2 >= r2) & (dist2 < r2 * 1.3),
        18.0 * 0.15 * np.exp(-(dist2 - r2) / (r2 * 0.12)),
        0.0
    )
    elevation += crater2 + rim2

    # Small crater — steeper walls create a local hazard zone
    cx3, cy3, r3 = 0.55, 0.72, 0.04
    dist3 = np.sqrt((X - cx3)**2 + (Y - cy3)**2)
    elevation += np.where(dist3 < r3, 12.0 * ((dist3 / r3)**2 - 1), 0.0)

    # Ridge system — moderate, creates interesting traversability boundary
    elevation += 12.0 * np.sin(3.0 * np.pi * X) * np.exp(-((Y - 0.55) / 0.3)**2)

    # Gentle undulations — long wavelength, low amplitude
    elevation += 4.0 * np.sin(5.0 * np.pi * (X + 0.3 * Y))
    elevation += 3.0 * np.cos(4.0 * np.pi * (0.5 * X + Y))

    # Terrain roughness — small random noise (sub-meter features)
    np.random.seed(42)
    elevation += np.random.normal(0, 0.3, (size, size))

    # Medium-scale undulation — fractal-like terrain texture
    # Produces realistic multi-scale roughness without extreme slopes
    from numpy.fft import fft2, ifft2, fftfreq
    noise = np.random.normal(0, 1, (size, size))
    kx = fftfreq(size)
    ky = fftfreq(size)
    KX, KY = np.meshgrid(kx, ky)
    K = np.sqrt(KX**2 + KY**2)
    K[0, 0] = 1  # avoid division by zero
    # Power spectrum ~ k^(-2) gives realistic terrain
    power_filter = 1.0 / (K**1.5 + 0.01)
    power_filter[0, 0] = 0
    filtered = np.real(ifft2(fft2(noise) * power_filter))
    # Normalize to unit std, then scale to desired amplitude
    # Target: ±3m undulations — adds ~1-2° local slope variation
    filtered = filtered / max(filtered.std(), 1e-6) * 1.0
    elevation += filtered

    # Demo area coordinates — near Curiosity landing site, Gale Crater
    extent_m = size * resolution  # total extent in meters
    # Convert meters to approximate degrees at Mars equator
    # Mars circumference ~21344 km, so 1 degree ≈ 59.3 km
    meters_per_degree = 59300.0
    extent_deg = extent_m / meters_per_degree

    center_lat = -4.5896
    center_lon = 137.4417

    metadata = {
        'resolution': resolution,
        'size': [size, size],
        'bounds': {
            'south': center_lat - extent_deg / 2,
            'north': center_lat + extent_deg / 2,
            'west': center_lon - extent_deg / 2,
            'east': center_lon + extent_deg / 2,
        },
        'center': {'lat': center_lat, 'lon': center_lon},
        'source': 'Synthetic terrain for demonstration — not real Mars data',
        'is_synthetic': True,
    }

    return elevation, metadata


def projected_bounds_to_latlon(bounds, crs):
    """Convert projected Mars CRS bounds to lat/lon degrees.

    Most HiRISE DTMs use an equirectangular projection where:
        x = lon_rad * R * cos(lat_ts)
        y = lat_rad * R
    We invert that to get geographic coordinates.
    """
    MARS_RADIUS = 3396190.0  # IAU Mars equatorial radius (meters) — fallback only

    # HiRISE DTMs use a LOCAL sphere radius (+R=...) in the CRS. Using the wrong radius
    # shifts latitude by ~0.1° at 40°N (Deuteronilus: R=3387887.66). Prefer the CRS value.
    try:
        r = crs.to_dict().get('R')
        if r:
            MARS_RADIUS = float(r)
    except Exception:
        pass

    # Try to extract latitude of true scale from CRS
    lat_ts = 0.0
    try:
        crs_dict = crs.to_dict()
        lat_ts = float(crs_dict.get('lat_ts', crs_dict.get('latitude_of_origin', 0)))
    except Exception:
        pass

    # Also try WKT parsing for the standard parameter name
    if lat_ts == 0.0:
        try:
            wkt = crs.to_wkt()
            # Look for standard_parallel_1 or latitude_of_true_scale
            m = re.search(r'(?:standard_parallel_1|latitude_of_true_scale|Latitude of 1st standard parallel)["\s,\]]*[,\s]*(-?[\d.]+)', wkt, re.IGNORECASE)
            if m:
                lat_ts = float(m.group(1))
        except Exception:
            pass

    cos_lat_ts = np.cos(np.radians(lat_ts)) if lat_ts != 0 else 1.0

    # Central meridian offset (e.g. Gale DTM uses central_meridian = 137.21)
    lon_0 = 0.0
    try:
        m = re.search(r'central_meridian["\s]*,\s*(-?[\d.]+)', crs.to_wkt(), re.IGNORECASE)
        if m:
            lon_0 = float(m.group(1))
        else:
            crs_dict = crs.to_dict()
            lon_0 = float(crs_dict.get('lon_0', 0))
    except Exception:
        pass

    lat_south = np.degrees(bounds.bottom / MARS_RADIUS)
    lat_north = np.degrees(bounds.top / MARS_RADIUS)
    lon_west = lon_0 + np.degrees(bounds.left / (MARS_RADIUS * cos_lat_ts))
    lon_east = lon_0 + np.degrees(bounds.right / (MARS_RADIUS * cos_lat_ts))

    return lat_south, lat_north, lon_west, lon_east


def crop_window(shape, crop_size, center=None):
    """Return (r0, r1, c0, c1) for a crop_size×crop_size window.

    center = (row, col) in full-resolution pixels; None → image center.
    The window is shifted (not shrunk) to stay inside the image.
    """
    rows, cols = shape
    cy, cx = center if center is not None else (rows // 2, cols // 2)
    h = min(crop_size, rows)
    w = min(crop_size, cols)
    r0 = int(min(max(cy - h // 2, 0), rows - h))
    c0 = int(min(max(cx - w // 2, 0), cols - w))
    return r0, r0 + h, c0, c0 + w


def crop_bounds(bounds, shape, window):
    """Projected bounds of a pixel window. Row 0 is the NORTH (top) edge."""
    from rasterio.coords import BoundingBox
    rows, cols = shape
    r0, r1, c0, c1 = window
    py = (bounds.top - bounds.bottom) / rows
    px = (bounds.right - bounds.left) / cols
    return BoundingBox(bounds.left + c0 * px, bounds.top - r1 * py,
                       bounds.left + c1 * px, bounds.top - r0 * py)


def load_real_dtm(filepath, crop_size=None, crop_center=None):
    """Load a real HiRISE DTM (GeoTIFF or PDS .IMG)."""
    try:
        import rasterio
    except ImportError:
        print("ERROR: rasterio is required for real DTM files.")
        print("Install with: pip install rasterio")
        print("You may also need GDAL: brew install gdal")
        sys.exit(1)

    print(f"  Loading DTM from {filepath}...")
    with rasterio.open(filepath) as src:
        elevation = src.read(1).astype(np.float64)
        bounds = src.bounds
        resolution = abs(src.res[0])  # meters/pixel
        crs = src.crs

        # Handle NoData
        nodata = src.nodata
        if nodata is not None:
            mask = elevation == nodata
            elevation[mask] = np.nan
            print(f"  Masked {mask.sum()} NoData pixels")

    print(f"  DTM shape: {elevation.shape}, resolution: {resolution:.2f} m/pixel")
    if crs:
        print(f"  CRS: {crs}")

    # Save original shape before cropping (needed for bounds adjustment)
    orig_rows, orig_cols = elevation.shape

    # Crop if requested
    if crop_size and (orig_rows > crop_size or orig_cols > crop_size):
        window = crop_window((orig_rows, orig_cols), crop_size, crop_center)
        r0, r1, c0, c1 = window
        elevation = elevation[r0:r1, c0:c1]
        bounds = crop_bounds(bounds, (orig_rows, orig_cols), window)
        nan_frac = float(np.mean(np.isnan(elevation)))
        print(f"  Cropped to {elevation.shape}: rows {r0}:{r1}, cols {c0}:{c1} "
              f"({nan_frac*100:.2f}% NoData in window)")
        if crop_center is not None and nan_frac > 0:
            print("  WARNING: crop window contains NoData; pick a fully valid window.")

    # Convert projected coordinates to lat/lon for Leaflet
    if crs and not crs.is_geographic:
        print("  Converting projected CRS to lat/lon...")
        lat_south, lat_north, lon_west, lon_east = projected_bounds_to_latlon(bounds, crs)
        print(f"  Geographic bounds: lat [{lat_south:.4f}, {lat_north:.4f}], lon [{lon_west:.4f}, {lon_east:.4f}]")
    else:
        # Already in geographic coordinates (unlikely for Mars, but handle it)
        lat_south, lat_north = bounds.bottom, bounds.top
        lon_west, lon_east = bounds.left, bounds.right

    # Fill NaN with local mean for processing (edges of DTM coverage)
    if np.any(np.isnan(elevation)):
        mask = np.isnan(elevation)
        elevation[mask] = np.nanmean(elevation)
        print(f"  Filled {mask.sum()} NaN pixels with mean elevation")

    metadata = {
        'resolution': float(resolution),
        'size': list(elevation.shape),
        'bounds': {
            'south': float(lat_south),
            'north': float(lat_north),
            'west': float(lon_west),
            'east': float(lon_east),
        },
        'center': {
            'lat': float((lat_south + lat_north) / 2),
            'lon': float((lon_west + lon_east) / 2),
        },
        'source': os.path.basename(filepath) + ' — HiRISE DTM (NASA/JPL/University of Arizona)',
        'is_synthetic': False,
    }

    return elevation, metadata


# ─── Terrain Computations ────────────────────────────────────────────────────

def compute_slope(elevation, resolution):
    """Compute slope in degrees from elevation grid."""
    print("  Computing slope...")
    dy, dx = np.gradient(elevation, resolution)
    slope_rad = np.arctan(np.sqrt(dx**2 + dy**2))
    return np.degrees(slope_rad)


def compute_slope_uncertainty(elevation, resolution, sigma_z=SIGMA_Z):
    """
    Propagate vertical measurement uncertainty through slope computation.

    The slope at each cell is arctan(dz/dr) where dz is the elevation
    difference between adjacent cells and dr is the cell spacing.
    If each elevation has uncertainty σ_z, the difference has uncertainty
    √2·σ_z, and the slope uncertainty follows from error propagation.

    Reference: Sutton et al. 2022 (doi:10.3390/rs14102403) for HiRISE
    DTM precision characteristics.
    """
    print(f"  Computing slope uncertainty (σ_z = {sigma_z} m)...")
    dy, dx = np.gradient(elevation, resolution)
    gradient_mag_sq = dx**2 + dy**2

    # Error propagation: σ_slope = (√2 · σ_z / d) / (1 + |grad|²)
    # np.gradient uses central differences, so the baseline d between the two
    # differenced samples is 2 × resolution (not 1 ×).
    sigma_dz = np.sqrt(2) * sigma_z
    baseline = 2.0 * resolution
    sigma_slope_rad = sigma_dz / (baseline * (1.0 + gradient_mag_sq))
    sigma_slope_deg = np.degrees(sigma_slope_rad)

    return sigma_slope_deg


def compute_roughness(elevation, window_size=5):
    """Compute terrain roughness as local standard deviation of elevation."""
    print(f"  Computing roughness (window={window_size})...")
    if HAS_SCIPY:
        local_mean = uniform_filter(elevation, size=window_size)
        local_sq_mean = uniform_filter(elevation**2, size=window_size)
        variance = np.maximum(local_sq_mean - local_mean**2, 0)
        return np.sqrt(variance)
    else:
        # NumPy fallback — slower but works
        from numpy.lib.stride_tricks import sliding_window_view
        pad = window_size // 2
        padded = np.pad(elevation, pad, mode='reflect')
        windows = sliding_window_view(padded, (window_size, window_size))
        roughness = np.std(windows, axis=(2, 3))
        return roughness[:elevation.shape[0], :elevation.shape[1]]


def compute_rock_abundance(k=ROCK_ABUNDANCE_K):
    """
    Golombek exponential rock model.
    Fk(D) = k * exp(-q(k) * D)
    q(k) = 1.79 + 0.152/k

    Returns fractional area covered by rocks >= various diameters.
    """
    q = 1.79 + 0.152 / k
    ankle_hazard = k * np.exp(-q * 0.3)   # rocks >= 30cm
    knee_hazard = k * np.exp(-q * 0.5)    # rocks >= 50cm
    return ankle_hazard, knee_hazard


def compute_traversability(slope_deg, roughness, rock_factor=1.0):
    """
    Combine slope, roughness, and rock abundance into 0–1 traversability score.
    Uses sigmoid functions for smooth transitions.
    """
    # Clip exponent arguments to avoid overflow
    exp_slope = np.clip((slope_deg - SLOPE_THRESHOLD) / SLOPE_SHARPNESS, -50, 50)
    exp_rough = np.clip((roughness - ROUGHNESS_THRESHOLD) / ROUGHNESS_SHARPNESS, -50, 50)
    trav_slope = 1.0 / (1.0 + np.exp(exp_slope))
    trav_rough = 1.0 / (1.0 + np.exp(exp_rough))
    return trav_slope * trav_rough * rock_factor


def compute_hillshade(elevation, resolution, azimuth=315, altitude=45):
    """Generate a hillshade visualization from elevation data."""
    print("  Computing hillshade...")
    ls = LightSource(azdeg=azimuth, altdeg=altitude)
    hillshade = ls.hillshade(elevation, dx=resolution, dy=resolution)
    return hillshade


# ─── Route Planning ──────────────────────────────────────────────────────────

def plan_route_astar(cost_grid, start, end):
    """
    A* pathfinding on a 2D grid.
    Returns list of (row, col) coordinates from start to end.
    """
    rows, cols = cost_grid.shape
    dist = np.full((rows, cols), np.inf)
    dist[start[0], start[1]] = 0.0
    prev = {}
    pq = [(0.0, start)]
    visited = set()

    # 8-connected neighbors
    neighbors = [(-1, 0), (1, 0), (0, -1), (0, 1),
                 (-1, -1), (-1, 1), (1, -1), (1, 1)]
    diag_cost = np.sqrt(2.0)

    while pq:
        d, (r, c) = heapq.heappop(pq)
        if (r, c) in visited:
            continue
        visited.add((r, c))

        if (r, c) == end:
            break

        for dr, dc in neighbors:
            nr, nc = r + dr, c + dc
            if 0 <= nr < rows and 0 <= nc < cols and (nr, nc) not in visited:
                step_len = diag_cost if (dr != 0 and dc != 0) else 1.0
                step_cost = cost_grid[nr, nc] * step_len
                nd = d + step_cost
                if nd < dist[nr, nc]:
                    dist[nr, nc] = nd
                    prev[(nr, nc)] = (r, c)
                    # Heuristic: Euclidean distance to goal
                    h = np.sqrt((nr - end[0])**2 + (nc - end[1])**2) * 0.5
                    heapq.heappush(pq, (nd + h, (nr, nc)))

    # Reconstruct path
    path = []
    node = end
    while node in prev:
        path.append(node)
        node = prev[node]
    path.append(start)
    return path[::-1]


def compute_route_metrics(path, slope, slope_unc, traversability, trav_worst, resolution):
    """Compute summary metrics for a route."""
    coords = np.array(path)
    rows, cols = coords[:, 0], coords[:, 1]

    # Distance
    diffs = np.diff(coords, axis=0)
    segment_lengths = np.sqrt(diffs[:, 0]**2 + diffs[:, 1]**2) * resolution
    distance_m = float(np.sum(segment_lengths))

    # Estimated EVA time (~2 km/hr walking speed on Mars surface)
    estimated_time_min = float(distance_m / (2000.0 / 60.0))

    # Slope stats along route
    route_slopes = slope[rows, cols]
    route_unc = slope_unc[rows, cols]

    # Count uncertain segments (>5° uncertainty)
    uncertain_mask = route_unc > 5.0
    uncertain_segments = int(np.sum(np.diff(uncertain_mask.astype(int)) == 1))
    uncertain_pct = float(np.mean(uncertain_mask) * 100)

    # Max slope and its uncertainty
    max_slope_idx = np.argmax(route_slopes)
    max_slope = float(route_slopes[max_slope_idx])
    max_slope_unc = float(route_unc[max_slope_idx])

    # Traversability
    route_trav = traversability[rows, cols]
    route_trav_worst = trav_worst[rows, cols]

    return {
        'distance_m': round(distance_m, 1),
        'estimated_time_min': round(estimated_time_min, 1),
        'uncertain_segments': uncertain_segments,
        'uncertain_pct': round(uncertain_pct, 1),
        'max_slope_deg': round(max_slope, 1),
        'max_slope_uncertainty_deg': round(max_slope_unc, 1),
        'mean_traversability': round(float(np.mean(route_trav)), 3),
        'worst_case_traversability': round(float(np.mean(route_trav_worst)), 3),
        'n_waypoints': len(path),
    }


def path_to_coordinates(path, metadata, downsample=5):
    """Convert pixel path to lat/lon coordinates."""
    bounds = metadata['bounds']
    size = metadata['size']

    # Downsample path for reasonable GeoJSON size
    if len(path) > 200:
        indices = list(range(0, len(path), downsample))
        if indices[-1] != len(path) - 1:
            indices.append(len(path) - 1)
        path = [path[i] for i in indices]

    coords = []
    for r, c in path:
        lat = bounds['north'] - (r / size[0]) * (bounds['north'] - bounds['south'])
        lon = bounds['west'] + (c / size[1]) * (bounds['east'] - bounds['west'])
        coords.append([round(lon, 6), round(lat, 6)])

    return coords


def plan_all_routes(traversability, trav_worst, uncertainty_gap, slope, slope_unc, metadata, resolution):
    """Plan routes with different weight profiles."""
    print("  Planning routes...")
    rows, cols = traversability.shape

    # Pick start and end points on opposite sides
    # Start: left side, ~40% down
    # End: right side, ~60% down
    margin = int(rows * 0.05)
    start = (int(rows * 0.4), margin)
    end = (int(rows * 0.6), cols - margin)

    # Ensure start/end are traversable
    for attempt_offset in range(0, 50, 5):
        sr, sc = start
        if traversability[sr, sc + attempt_offset] > 0.3:
            start = (sr, sc + attempt_offset)
            break
    for attempt_offset in range(0, 50, 5):
        er, ec = end
        if traversability[er, ec - attempt_offset] > 0.3:
            end = (er, ec - attempt_offset)
            break

    routes = {}
    sci_grid = np.zeros_like(traversability)  # placeholder

    for profile_id, profile in ROUTE_WEIGHT_PROFILES.items():
        cost = profile['cost_fn'](traversability, trav_worst, uncertainty_gap, sci_grid)
        cost = np.clip(cost, 0.01, 100.0)

        # Make impassable terrain very expensive
        cost[traversability < 0.05] = 1000.0

        print(f"    Route '{profile_id}'...")
        path = plan_route_astar(cost, start, end)

        metrics = compute_route_metrics(
            path, slope, slope_unc, traversability, trav_worst, resolution
        )
        coordinates = path_to_coordinates(path, metadata)

        routes[profile_id] = {
            'id': profile_id,
            'name': profile['name'],
            'description': profile['description'],
            'color': profile['color'],
            'geometry': {
                'type': 'LineString',
                'coordinates': coordinates,
            },
            'metrics': metrics,
        }

    return routes


# ─── Scout Point Selection ───────────────────────────────────────────────────

def select_scout_points(routes, slope_unc, uncertainty_gap, metadata, n_points=5):
    """Find locations where scouting would most reduce route uncertainty."""
    print("  Selecting scout points...")
    size = metadata['size']
    bounds = metadata['bounds']

    # Combine all route paths into a mask
    combined_mask = np.zeros((size[0], size[1]), dtype=bool)
    for route_data in routes.values():
        for lon, lat in route_data['geometry']['coordinates']:
            r = int((bounds['north'] - lat) / (bounds['north'] - bounds['south']) * size[0])
            c = int((lon - bounds['west']) / (bounds['east'] - bounds['west']) * size[1])
            r = np.clip(r, 0, size[0] - 1)
            c = np.clip(c, 0, size[1] - 1)
            # Buffer of 30 pixels around route
            r_lo, r_hi = max(0, r - 30), min(size[0], r + 30)
            c_lo, c_hi = max(0, c - 30), min(size[1], c + 30)
            combined_mask[r_lo:r_hi, c_lo:c_hi] = True

    # Score: high uncertainty AND near routes
    score = uncertainty_gap * combined_mask
    score[~combined_mask] = 0

    # Find top-N peaks (with minimum spacing)
    points = []
    score_copy = score.copy()
    min_spacing = 40  # pixels

    for _ in range(n_points):
        idx = np.unravel_index(np.argmax(score_copy), score_copy.shape)
        if score_copy[idx] <= 0:
            break

        r, c = idx
        lat = bounds['north'] - (r / size[0]) * (bounds['north'] - bounds['south'])
        lon = bounds['west'] + (c / size[1]) * (bounds['east'] - bounds['west'])

        unc_val = float(slope_unc[r, c])
        gap_val = float(uncertainty_gap[r, c])

        points.append({
            'id': len(points) + 1,
            'coordinates': [round(lon, 6), round(lat, 6)],
            'slope_uncertainty_deg': round(unc_val, 1),
            'uncertainty_gap': round(gap_val, 3),
            'description': f'Slope uncertainty: ±{unc_val:.0f}°. Scouting here would resolve whether this terrain is safe for EVA.',
        })

        # Suppress nearby cells
        r_lo = max(0, r - min_spacing)
        r_hi = min(size[0], r + min_spacing)
        c_lo = max(0, c - min_spacing)
        c_hi = min(size[1], c + min_spacing)
        score_copy[r_lo:r_hi, c_lo:c_hi] = 0

    return points


# ─── Output Generation ───────────────────────────────────────────────────────

def save_rgba_png(filepath, data, cmap_name, vmin, vmax, alpha_data=None, alpha_range=(0.0, 0.85)):
    """Save a data array as an RGBA PNG with colormap applied."""
    cmap = plt.colormaps[cmap_name]
    norm = plt.Normalize(vmin=vmin, vmax=vmax)
    colored = cmap(norm(np.clip(data, vmin, vmax)))  # RGBA float array

    if alpha_data is not None:
        # Alpha proportional to data magnitude
        alpha_norm = np.clip((alpha_data - alpha_range[0]) / (alpha_range[1] - alpha_range[0]), 0, 1)
        colored[:, :, 3] = alpha_norm * 0.85  # max 85% opacity
    else:
        colored[:, :, 3] = 0.75  # uniform semi-transparency

    plt.imsave(str(filepath), colored, origin='upper')
    print(f"    Saved {filepath} ({data.shape[1]}x{data.shape[0]})")


def save_hillshade_png(filepath, hillshade):
    """Save hillshade as a greyscale PNG."""
    plt.imsave(str(filepath), hillshade, cmap='gray', origin='upper')
    print(f"    Saved {filepath}")


def save_uncertainty_overlay(filepath, slope_unc, uncertainty_gap):
    """
    Custom uncertainty overlay — the key visualization.
    Green where data is reliable, red where it isn't.
    Transparency proportional to how concerning the uncertainty is.
    """
    rows, cols = slope_unc.shape
    rgba = np.zeros((rows, cols, 4))

    # Normalize uncertainty gap to 0-1
    gap_norm = np.clip(uncertainty_gap / np.percentile(uncertainty_gap[uncertainty_gap > 0], 95), 0, 1)

    # Color: green → yellow → orange → red based on uncertainty
    # Using a custom colormap
    for i in range(rows):
        for j in range(cols):
            g = gap_norm[i, j]
            if g < 0.25:
                # Green — low uncertainty
                rgba[i, j, :3] = [0.2, 0.8, 0.3]
            elif g < 0.5:
                # Yellow — moderate
                t = (g - 0.25) / 0.25
                rgba[i, j, :3] = [0.2 + 0.8 * t, 0.8 - 0.1 * t, 0.3 - 0.2 * t]
            elif g < 0.75:
                # Orange — high
                t = (g - 0.5) / 0.25
                rgba[i, j, :3] = [1.0, 0.7 - 0.3 * t, 0.1 - 0.05 * t]
            else:
                # Red — critical
                rgba[i, j, :3] = [1.0, 0.2, 0.05]

    # Alpha: transparent where uncertainty is low, opaque where high
    rgba[:, :, 3] = np.clip(gap_norm * 0.9, 0.0, 0.85)

    # Minimum alpha so people can see green "safe" areas too
    rgba[:, :, 3] = np.where(gap_norm > 0.05, np.maximum(rgba[:, :, 3], 0.15), 0.0)

    plt.imsave(str(filepath), rgba.astype(np.float32), origin='upper')
    print(f"    Saved {filepath}")


def save_uncertainty_overlay_fast(filepath, slope_unc, uncertainty_gap, gap_scale=None):
    """Vectorized version of uncertainty overlay — much faster.

    gap_scale=None (legacy Gale behaviour): colours relative to this site's 95th-percentile gap.
    gap_scale=float: ABSOLUTE colours, gap/gap_scale — so a small gap never paints as critical red.
    """
    rows, cols = slope_unc.shape
    rgba = np.zeros((rows, cols, 4), dtype=np.float32)

    # Normalize
    if gap_scale is None:
        pct95 = np.percentile(uncertainty_gap[uncertainty_gap > 0], 95) if np.any(uncertainty_gap > 0) else 1.0
    else:
        pct95 = gap_scale
    gap_norm = np.clip(uncertainty_gap / max(pct95, 0.001), 0, 1)

    # Green zone (gap < 0.25)
    m1 = gap_norm < 0.25
    rgba[m1, 0] = 0.2
    rgba[m1, 1] = 0.8
    rgba[m1, 2] = 0.3

    # Yellow zone (0.25 <= gap < 0.5)
    m2 = (gap_norm >= 0.25) & (gap_norm < 0.5)
    t2 = (gap_norm[m2] - 0.25) / 0.25
    rgba[m2, 0] = 0.2 + 0.8 * t2
    rgba[m2, 1] = 0.8 - 0.1 * t2
    rgba[m2, 2] = 0.3 - 0.2 * t2

    # Orange zone (0.5 <= gap < 0.75)
    m3 = (gap_norm >= 0.5) & (gap_norm < 0.75)
    t3 = (gap_norm[m3] - 0.5) / 0.25
    rgba[m3, 0] = 1.0
    rgba[m3, 1] = 0.7 - 0.3 * t3
    rgba[m3, 2] = 0.1 - 0.05 * t3

    # Red zone (gap >= 0.75)
    m4 = gap_norm >= 0.75
    rgba[m4, 0] = 1.0
    rgba[m4, 1] = 0.2
    rgba[m4, 2] = 0.05

    # Alpha
    rgba[:, :, 3] = np.clip(gap_norm * 0.9, 0.0, 0.85)
    rgba[:, :, 3] = np.where(gap_norm > 0.05, np.maximum(rgba[:, :, 3], 0.15), 0.0)

    plt.imsave(str(filepath), rgba, origin='upper')
    print(f"    Saved {filepath}")


def shrink_pngs(output_dir, names, max_px):
    """Downscale web PNG layers so the page loads fast (full-res analysis is unaffected)."""
    from PIL import Image
    for name in names:
        path = Path(output_dir) / name
        img = Image.open(path)
        if max(img.size) > max_px:
            scale = max_px / max(img.size)
            img = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
        img.save(path, optimize=True)
        print(f"    Optimized {name}: {img.size[0]}x{img.size[1]}, {path.stat().st_size / 1e6:.1f} MB")


def save_data_grid(filepath, slope, slope_unc, traversability, trav_worst, target_size=300, elevation=None):
    """Save downsampled data grid for click-to-inspect in the web app."""
    print("  Saving data grid for click-to-inspect...")
    rows, cols = slope.shape
    step_r = max(1, rows // target_size)
    step_c = max(1, cols // target_size)

    grid = {
        'grid_rows': len(range(0, rows, step_r)),
        'grid_cols': len(range(0, cols, step_c)),
        'step_r': step_r,
        'step_c': step_c,
        'slope': [],
        'slope_uncertainty': [],
        'traversability': [],
        'trav_worst': [],
        'elevation': [],
    }

    for r in range(0, rows, step_r):
        grid['slope'].append([round(float(slope[r, c]), 1) for c in range(0, cols, step_c)])
        grid['slope_uncertainty'].append([round(float(slope_unc[r, c]), 1) for c in range(0, cols, step_c)])
        grid['traversability'].append([round(float(traversability[r, c]), 3) for c in range(0, cols, step_c)])
        grid['trav_worst'].append([round(float(trav_worst[r, c]), 3) for c in range(0, cols, step_c)])
        if elevation is not None:
            grid['elevation'].append([round(float(elevation[r, c]), 1) for c in range(0, cols, step_c)])

    with open(filepath, 'w') as f:
        json.dump(grid, f)
    print(f"    Saved {filepath}")


def generate_science_targets(metadata):
    """Generate science target coordinates from metadata."""
    bounds = metadata['bounds']
    targets = []
    for t in SCIENCE_TARGETS:
        frac_x, frac_y = t['marker_offset']
        lon = bounds['west'] + frac_x * (bounds['east'] - bounds['west'])
        lat = bounds['north'] - frac_y * (bounds['north'] - bounds['south'])
        targets.append({
            'id': t['id'],
            'name': t['name'],
            'description': t['description'],
            'information_value': t['information_value'],
            'coordinates': [round(lon, 6), round(lat, 6)],
            'source': t['source'],
        })
    return targets


# ─── Main Pipeline ───────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='MARS BLINDSPOTS — Terrain Processing')
    parser.add_argument('--synthetic', action='store_true', help='Use synthetic terrain')
    parser.add_argument('--input', type=str, help='Path to real HiRISE DTM GeoTIFF')
    parser.add_argument('--crop', type=int, help='Crop DTM to NxN pixels')
    parser.add_argument('--crop-center', type=str, default=None, metavar='ROW,COL',
                        help='Center of the --crop window in full-res pixels (default: image center)')
    parser.add_argument('--crop-window', type=str, default=None, metavar='ROW0,ROW1,COL0,COL1',
                        help='Rectangular crop in full-res px → grid mode (see grid_mode.py)')
    parser.add_argument('--grid-step', type=int, default=None,
                        help='Grid mode: analysis cell = N full-res px (e.g. 10 → ~10 m)')
    parser.add_argument('--ice-mask', type=str, default=None,
                        help='Grid mode: JSON of interpreted ice polygons in full-res px [row, col]')
    parser.add_argument('--ortho', type=str, default=None,
                        help='Grid mode: orthoimage on the same pixel grid as the DTM → imagery.png')
    parser.add_argument('--output', type=str, default='web/data', help='Output directory')
    parser.add_argument('--sigma-z', type=float, default=SIGMA_Z,
                        help=f'Vertical precision in meters (default: {SIGMA_Z})')
    parser.add_argument('--worst-sigma', type=float, default=1.0,
                        help='Worst-case slope = slope + k·σ_slope (default 1.0)')
    parser.add_argument('--png-size', type=int, default=1200,
                        help='Max pixel size of web PNG layers (0 = keep full resolution)')
    parser.add_argument('--skip-routes', action='store_true', help='Skip route computation')
    args = parser.parse_args()

    if not args.synthetic and not args.input:
        print("ERROR: Specify --synthetic or --input <dtm_file>")
        sys.exit(1)

    if args.crop_window or args.grid_step:
        if not (args.crop_window and args.grid_step and args.input):
            print("ERROR: grid mode needs --input, --crop-window and --grid-step together")
            sys.exit(1)
        if args.crop or args.crop_center:
            print("ERROR: --crop/--crop-center can't be combined with --crop-window")
            sys.exit(1)
        if os.path.abspath(args.output) == os.path.abspath('web/data'):
            print("ERROR: grid mode must not write to web/data (Gale outputs); use --output web/sites/<site>")
            sys.exit(1)
        import grid_mode
        grid_mode.run(args)
        return

    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    # ── Step 1: Load or generate terrain ──
    print("\n═══ MARS BLINDSPOTS Processing Pipeline ═══\n")
    print("Step 1: Loading terrain data...")
    if args.synthetic:
        elevation, metadata = generate_synthetic_terrain()
    else:
        crop_center = None
        if args.crop_center:
            if not args.crop:
                print("ERROR: --crop-center requires --crop N")
                sys.exit(1)
            crop_center = tuple(int(v) for v in args.crop_center.split(','))
        elevation, metadata = load_real_dtm(args.input, crop_size=args.crop, crop_center=crop_center)

    resolution = metadata['resolution']
    print(f"  Grid: {elevation.shape[0]}x{elevation.shape[1]}, "
          f"resolution: {resolution} m/px, "
          f"extent: {elevation.shape[1]*resolution:.0f}m × {elevation.shape[0]*resolution:.0f}m")

    # ── Step 2: Compute terrain metrics ──
    print("\nStep 2: Computing terrain metrics...")
    slope = compute_slope(elevation, resolution)
    slope_unc = compute_slope_uncertainty(elevation, resolution, sigma_z=args.sigma_z)
    roughness = compute_roughness(elevation)
    hillshade = compute_hillshade(elevation, resolution)

    # Rock abundance (uniform estimate — we don't have per-cell thermal inertia)
    ankle_rock, knee_rock = compute_rock_abundance()
    rock_factor = 1.0 - ankle_rock  # constant across grid without thermal data
    print(f"  Rock abundance (k={ROCK_ABUNDANCE_K}): "
          f"{ankle_rock*100:.1f}% ankle hazard, {knee_rock*100:.1f}% knee hazard")

    # ── Step 3: Compute traversability ──
    print("\nStep 3: Computing traversability...")
    traversability = compute_traversability(slope, roughness, rock_factor)

    # Worst-case: slope + k·σ (k=1 → ~84th percentile, k=2 → ~97.5th)
    slope_worst = slope + args.worst_sigma * slope_unc
    trav_worst = compute_traversability(slope_worst, roughness, rock_factor)

    # The uncertainty gap — how much traversability could change
    uncertainty_gap = traversability - trav_worst
    uncertainty_gap = np.clip(uncertainty_gap, 0, 1)

    # Stats
    uncertain_pct = float(np.mean(uncertainty_gap > 0.1) * 100)
    critical_pct = float(np.mean(uncertainty_gap > 0.3) * 100)
    print(f"  {uncertain_pct:.1f}% of terrain has meaningful uncertainty")
    print(f"  {critical_pct:.1f}% of terrain has critical uncertainty")

    # ── Step 4: Generate output images ──
    print("\nStep 4: Generating output layers...")
    save_hillshade_png(output_dir / 'hillshade.png', hillshade)

    save_rgba_png(
        output_dir / 'slope.png', slope, 'YlOrRd', 0, 35,
    )

    save_uncertainty_overlay_fast(output_dir / 'uncertainty.png', slope_unc, uncertainty_gap)

    save_rgba_png(
        output_dir / 'traversability.png', traversability, 'RdYlGn', 0, 1,
    )

    if args.png_size:
        shrink_pngs(output_dir, ['hillshade.png', 'slope.png', 'uncertainty.png', 'traversability.png'], args.png_size)

    # ── Step 5: Plan routes ──
    routes = {}
    scout_points = []
    if not args.skip_routes:
        print("\nStep 5: Planning routes...")
        routes = plan_all_routes(
            traversability, trav_worst, uncertainty_gap,
            slope, slope_unc, metadata, resolution
        )
        scout_points = select_scout_points(routes, slope_unc, uncertainty_gap, metadata)
        print(f"  Found {len(scout_points)} recommended scout points")

    # ── Step 6: Save JSON data ──
    print("\nStep 6: Saving JSON data...")

    # Data grid for click-to-inspect
    save_data_grid(output_dir / 'data_grid.json', slope, slope_unc, traversability, trav_worst, elevation=elevation)

    # Routes
    routes_output = {
        'routes': list(routes.values()),
        'scout_points': scout_points,
        'science_targets': generate_science_targets(metadata),
    }
    with open(output_dir / 'routes.json', 'w') as f:
        json.dump(routes_output, f, indent=2)
    print(f"    Saved routes.json ({len(routes)} routes, {len(scout_points)} scout points)")

    # Metadata
    metadata['stats'] = {
        'total_cells': int(elevation.shape[0] * elevation.shape[1]),
        'uncertain_pct': round(uncertain_pct, 1),
        'critical_pct': round(critical_pct, 1),
        'slope_min': round(float(np.min(slope)), 1),
        'slope_max': round(float(np.max(slope)), 1),
        'slope_mean': round(float(np.mean(slope)), 1),
        'slope_unc_mean': round(float(np.mean(slope_unc)), 1),
        'slope_unc_max': round(float(np.max(slope_unc)), 1),
        'sigma_z_used': args.sigma_z,
        'elevation_range': round(float(np.ptp(elevation)), 1),
    }
    metadata['layers'] = {
        'hillshade': {'file': 'hillshade.png', 'description': 'Terrain shading'},
        'slope': {'file': 'slope.png', 'description': 'Surface slope (degrees)', 'range': [0, 35]},
        'uncertainty': {'file': 'uncertainty.png', 'description': 'Slope measurement uncertainty'},
        'traversability': {'file': 'traversability.png', 'description': 'EVA traversability (0-1)'},
    }
    with open(output_dir / 'metadata.json', 'w') as f:
        json.dump(metadata, f, indent=2)
    print(f"    Saved metadata.json")

    # ── Summary ──
    print(f"\n═══ Processing Complete ═══")
    print(f"  Output: {output_dir}/")
    print(f"  Files: {len(list(output_dir.iterdir()))}")
    print(f"  Key finding: {uncertain_pct:.0f}% of this terrain has uncertain slope data")
    print(f"  at HiRISE resolution ({resolution}m). {critical_pct:.0f}% is critically uncertain.")
    if metadata.get('is_synthetic'):
        print(f"\n  ⚠ Using SYNTHETIC data for demonstration.")
        print(f"  For real data, download a HiRISE DTM and run:")
        print(f"    python process_terrain.py --input your_dtm.tif")
    print(f"\n  To view: cd web && python -m http.server 8000")
    print(f"  Then open http://localhost:8000")


if __name__ == '__main__':
    main()
