from __future__ import annotations

from pathlib import Path

import numpy as np
import rasterio
from pyproj import CRS, Transformer

from .coordinates import MARS_GEOGRAPHIC_CRS

SWIM_PRODUCT_ID = "SWIM4IMIM Combined Ice Consistency Map (0-1 m)"
SWIM_PRODUCT_URL = "https://swim.psi.edu/SWIM4MIMProducts.php"
SWIM_STUDY_URL = "https://swim.psi.edu/"


def extract_consistency(
    raster_path: Path,
    longitude_east_deg: float,
    latitude_planetocentric_deg: float,
) -> tuple[float | None, str | None]:
    """Read the SWIM GeoTIFF's own CRS/transform; never infer georeferencing."""
    with rasterio.open(raster_path) as dataset:
        if dataset.count < 1:
            raise ValueError("SWIM raster has no bands")
        if dataset.crs is None:
            raise ValueError(
                "SWIM GeoTIFF has no CRS; use a GIS-ready GeoTIFF with its "
                "Mars projection metadata rather than assigning a guessed CRS"
            )

        transformer = Transformer.from_crs(
            MARS_GEOGRAPHIC_CRS,
            CRS.from_user_input(dataset.crs),
            always_xy=True,
            force_over=True,
        )
        x, y = transformer.transform(longitude_east_deg, latitude_planetocentric_deg)
        row, col = dataset.index(x, y)
        if not 0 <= row < dataset.height or not 0 <= col < dataset.width:
            return None, "outside_swim_coverage"

        value = float(dataset.read(1, window=((row, row + 1), (col, col + 1)))[0, 0])
        nodata_values = {float(-30)}
        if dataset.nodata is not None:
            nodata_values.add(float(dataset.nodata))
        if not np.isfinite(value) or value in nodata_values:
            return None, "swim_nodata"
        return value, None
