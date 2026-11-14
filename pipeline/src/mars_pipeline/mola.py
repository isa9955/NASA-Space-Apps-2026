from __future__ import annotations

from dataclasses import dataclass
import math
from pathlib import Path
import re
import shutil
import subprocess

import numpy as np
import rasterio
from affine import Affine
from rasterio.crs import CRS as RasterCRS
from rasterio.transform import from_origin

from .coordinates import MOLA_EQUIRECTANGULAR_CRS, mars_lonlat_to_crs

MOLA_PRODUCT_ID = "MEGT44N180HB"
MOLA_IMAGE_URL = (
    "https://pds-geosciences.wustl.edu/mgs/"
    "urn-nasa-pds-mgs_mola_topography_derived/meg128/megt44n180hb.img"
)
MOLA_SOURCE_URL = "https://pds-geosciences.wustl.edu/missions/mgs/megdr.html"
MOLA_LABEL_URL = MOLA_IMAGE_URL.removesuffix(".img") + ".xml"
MOLA_COUNTS_PRODUCT_ID = "MEGC44N180HB"
MOLA_COUNTS_URL = MOLA_IMAGE_URL.replace("megt44n180hb.img", "megc44n180hb.img")

# Values are read from the product's PDS4 label and accompanying ENVI header.
MOLA_WIDTH = 11_520
MOLA_HEIGHT = 5_632
MOLA_PIXEL_SIZE_M = 463.0576672
MOLA_LEFT_X_M = 0.0
MOLA_TOP_Y_M = 2_607_940.782
MOLA_NODATA = 0
MOLA_DTYPE = np.dtype(">i2")
MOLA_COUNTS_DTYPE = np.dtype("u1")


@dataclass(frozen=True)
class MolaWindow:
    path: Path
    counts_path: Path
    transform: Affine
    width: int
    height: int
    row_offset: int
    col_offset: int
    source_bytes: int


def _tile_pixel(longitude_east_deg: float, latitude_deg: float) -> tuple[int, int]:
    x, y = mars_lonlat_to_crs(
        longitude_east_deg, latitude_deg, MOLA_EQUIRECTANGULAR_CRS
    )
    col = int(np.floor((x - MOLA_LEFT_X_M) / MOLA_PIXEL_SIZE_M))
    row = int(np.floor((MOLA_TOP_Y_M - y) / MOLA_PIXEL_SIZE_M))
    if not 0 <= row < MOLA_HEIGHT or not 0 <= col < MOLA_WIDTH:
        raise ValueError(
            f"Coordinate ({longitude_east_deg}, {latitude_deg}) is outside "
            "MOLA tile MEGT44N180HB (180–270E, 0–44N)"
        )
    return row, col


def _fetch_range(
    curl: str,
    url: str,
    first: int,
    last: int,
    total_bytes: int,
    temporary_path: Path,
) -> bytes:
    result = subprocess.run(
        [
            curl,
            "--silent",
            "--show-error",
            "--fail",
            "--location",
            "--max-time",
            "45",
            "--range",
            f"{first}-{last}",
            "--dump-header",
            "-",
            "--output",
            str(temporary_path),
            url,
        ],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        temporary_path.unlink(missing_ok=True)
        raise RuntimeError(
            f"Could not retrieve MOLA regional byte range: "
            f"{result.stderr.strip() or result.returncode}"
        )
    headers = re.findall(r"(?im)^Content-Range:\s*([^\r\n]+)", result.stdout)
    expected_range = f"bytes {first}-{last}/{total_bytes}"
    if not headers or headers[-1].strip() != expected_range:
        temporary_path.unlink(missing_ok=True)
        raise RuntimeError(
            "PDS server did not return the exact requested byte range; "
            "refusing to download the full MOLA tile"
        )
    payload = temporary_path.read_bytes()
    temporary_path.unlink(missing_ok=True)
    if len(payload) != last - first + 1:
        raise RuntimeError(
            f"MOLA range returned {len(payload)} bytes; expected {last - first + 1}"
        )
    return payload


def download_regional_window(
    locations: list[tuple[float, float]],
    destination: Path,
    margin_pixels: int = 1,
) -> MolaWindow:
    """Fetch only the required MOLA byte ranges and materialize a tiny GeoTIFF."""
    if not locations:
        raise ValueError("At least one location is required")
    if margin_pixels < 1:
        raise ValueError("At least one pixel of margin is required for slope")

    pixels = [_tile_pixel(lon, lat) for lon, lat in locations]
    row_offset = max(0, min(row for row, _ in pixels) - margin_pixels)
    col_offset = max(0, min(col for _, col in pixels) - margin_pixels)
    row_end = min(MOLA_HEIGHT, max(row for row, _ in pixels) + margin_pixels + 1)
    col_end = min(MOLA_WIDTH, max(col for _, col in pixels) + margin_pixels + 1)
    height, width = row_end - row_offset, col_end - col_offset

    destination.parent.mkdir(parents=True, exist_ok=True)
    rows = np.empty((height, width), dtype=np.int16)
    counts = np.empty((height, width), dtype=np.uint8)
    bytes_read = 0
    curl = shutil.which("curl")
    if curl is None:
        raise RuntimeError("curl is required to fetch small PDS HTTP byte ranges")
    for local_row, source_row in enumerate(range(row_offset, row_end)):
        first = (source_row * MOLA_WIDTH + col_offset) * MOLA_DTYPE.itemsize
        last = (source_row * MOLA_WIDTH + col_end) * MOLA_DTYPE.itemsize - 1
        topo_payload = _fetch_range(
            curl,
            MOLA_IMAGE_URL,
            first,
            last,
            MOLA_WIDTH * MOLA_HEIGHT * MOLA_DTYPE.itemsize,
            destination.with_name(f".mola-topo-row-{source_row}.tmp"),
        )
        expected = width * MOLA_DTYPE.itemsize
        if len(topo_payload) != expected:
            raise RuntimeError(f"MOLA range returned {len(topo_payload)} bytes; expected {expected}")
        rows[local_row] = np.frombuffer(topo_payload, dtype=MOLA_DTYPE).astype(np.int16)
        bytes_read += len(topo_payload)

        count_first = source_row * MOLA_WIDTH + col_offset
        count_last = source_row * MOLA_WIDTH + col_end - 1
        count_payload = _fetch_range(
            curl,
            MOLA_COUNTS_URL,
            count_first,
            count_last,
            MOLA_WIDTH * MOLA_HEIGHT,
            destination.with_name(f".mola-counts-row-{source_row}.tmp"),
        )
        counts[local_row] = np.frombuffer(count_payload, dtype=MOLA_COUNTS_DTYPE)
        bytes_read += len(count_payload)

    transform = (
        from_origin(MOLA_LEFT_X_M, MOLA_TOP_Y_M, MOLA_PIXEL_SIZE_M, MOLA_PIXEL_SIZE_M)
        * Affine.translation(col_offset, row_offset)
    )
    profile = {
        "driver": "GTiff",
        "width": width,
        "height": height,
        "count": 1,
        "dtype": "int16",
        "crs": RasterCRS.from_wkt(MOLA_EQUIRECTANGULAR_CRS.to_wkt()),
        "transform": transform,
        "nodata": MOLA_NODATA,
        "compress": "deflate",
    }
    with rasterio.open(destination, "w", **profile) as dataset:
        dataset.write(rows, 1)
    counts_path = destination.with_name("mola_arcadia_counts_subset.tif")
    count_profile = {**profile, "dtype": "uint8", "nodata": None}
    with rasterio.open(counts_path, "w", **count_profile) as dataset:
        dataset.write(counts, 1)

    return MolaWindow(
        path=destination,
        counts_path=counts_path,
        transform=transform,
        width=width,
        height=height,
        row_offset=row_offset,
        col_offset=col_offset,
        source_bytes=bytes_read,
    )


def elevation_and_slope(
    dataset: rasterio.io.DatasetReader,
    longitude_east_deg: float,
    latitude_planetocentric_deg: float,
    counts_dataset: rasterio.io.DatasetReader,
) -> tuple[float | None, float | None, int | None, str | None, str | None]:
    """Return nearest-cell MOLA topography and 3x3 central-difference slope."""
    if dataset.crs is None:
        raise ValueError("MOLA subset has no CRS")
    x, y = mars_lonlat_to_crs(
        longitude_east_deg, latitude_planetocentric_deg, dataset.crs
    )
    row, col = dataset.index(x, y)
    if row < 1 or col < 1 or row >= dataset.height - 1 or col >= dataset.width - 1:
        return None, None, None, "outside_slope_window", None

    values = dataset.read(1, masked=False)
    count_values = counts_dataset.read(1, masked=False)
    center = int(values[row, col])
    center_count = int(count_values[row, col])
    if center == MOLA_NODATA and center_count == 0:
        return None, None, center_count, "zero_value_without_mola_observations", None

    neighborhood = values[row - 1 : row + 2, col - 1 : col + 2]
    neighborhood_counts = count_values[row - 1 : row + 2, col - 1 : col + 2]
    invalid = (neighborhood == MOLA_NODATA) & (neighborhood_counts == 0)
    if np.any(invalid):
        slope_reason = "mola_slope_neighborhood_contains_nodata"
        slope = None
        slope_basis = None
    else:
        projected_x_spacing = float(np.hypot(dataset.transform.a, dataset.transform.d))
        x_spacing = projected_x_spacing * math.cos(math.radians(latitude_planetocentric_deg))
        y_spacing = float(np.hypot(dataset.transform.b, dataset.transform.e))
        dz_dx = (float(values[row, col + 1]) - float(values[row, col - 1])) / (2 * x_spacing)
        dz_dy = (float(values[row + 1, col]) - float(values[row - 1, col])) / (2 * y_spacing)
        slope = float(np.degrees(np.arctan(np.hypot(dz_dx, dz_dy))))
        slope_reason = None
        slope_basis = (
            "contains_cells_without_direct_observations"
            if np.any(neighborhood_counts == 0)
            else "all_3x3_cells_have_direct_observations"
        )

    return float(center), slope, center_count, slope_reason, slope_basis
