from __future__ import annotations

from pathlib import Path

import numpy as np
import rasterio
from pyproj import CRS

from .coordinates import mars_lonlat_to_crs

SWIM_PRODUCT_ID = "SWIM4IMIM Combined Ice Consistency Map (0-1 m)"
SWIM_PRODUCT_URL = "https://swim.psi.edu/SWIM4MIMProducts.php"
SWIM_STUDY_URL = "https://swim.psi.edu/"


def validate_raster(dataset) -> None:
    """Reject browse images and incompatible grids; no guessed CRS or scaling."""
    if dataset.driver != "GTiff" or dataset.count != 1 or dataset.crs is None:
        raise ValueError("SWIM requires a single-band, georeferenced numeric GeoTIFF")
    crs = CRS.from_user_input(dataset.crs)
    ellipsoid = crs.ellipsoid
    operation = crs.coordinate_operation
    if (not crs.is_projected or operation is None
            or "equidistant cylindrical" not in operation.method_name.lower()
            or not 3_390_000 <= ellipsoid.semi_major_metre <= 3_400_000
            or abs(ellipsoid.semi_major_metre - ellipsoid.semi_minor_metre) > 0.01
            or any(axis.unit_conversion_factor != 1 for axis in crs.axis_info)):
        raise ValueError("SWIM requires spherical Mars simple cylindrical coordinates in meters")
    if (any(abs(abs(resolution) - 3000) > 150 for resolution in dataset.res)
            or dataset.transform.b != 0 or dataset.transform.d != 0
            or dataset.transform.a <= 0 or dataset.transform.e >= 0):
        raise ValueError("SWIM requires an unrotated, north-up approximately 3000 m grid")
    if dataset.scales != (1.0,) or dataset.offsets != (0.0,):
        raise ValueError("Unverified SWIM scale/offset; do not interpret raw pixels as consistency")
    if dataset.nodata != -30:
        raise ValueError("SWIM4IMIM requires documented NoData -30")
    if dataset.colorinterp[0].name == "palette":
        raise ValueError("A color browse raster is not a numerical SWIM product")


def extract_consistency(
    raster_path: Path,
    longitude_east_deg: float,
    latitude_planetocentric_deg: float,
) -> tuple[float | None, str | None]:
    """Read the SWIM GeoTIFF's own CRS/transform; never infer georeferencing."""
    with rasterio.open(raster_path) as dataset:
        validate_raster(dataset)
        x, y = mars_lonlat_to_crs(longitude_east_deg, latitude_planetocentric_deg, dataset.crs)
        row, col = dataset.index(x, y)
        if not 0 <= row < dataset.height or not 0 <= col < dataset.width:
            return None, "outside_swim_coverage"

        sample = dataset.read(1, window=((row, row + 1), (col, col + 1)), masked=True)[0, 0]
        if np.ma.is_masked(sample):
            return None, "swim_nodata"
        value = float(sample)
        nodata_values = {float(-30)}
        if dataset.nodata is not None:
            nodata_values.add(float(dataset.nodata))
        if not np.isfinite(value) or value in nodata_values:
            return None, "swim_nodata"
        if not -1 <= value <= 1:
            raise ValueError("SWIM consistency must be in [-1, 1]; refusing invalid or browse values")
        return value, None
