from __future__ import annotations

from pyproj import CRS, Transformer

MARS_RADIUS_M = 3_396_000.0
MARS_GEOGRAPHIC_CRS = CRS.from_proj4(
    f"+proj=longlat +a={MARS_RADIUS_M} +b={MARS_RADIUS_M} +no_defs +type=crs"
)
MOLA_EQUIRECTANGULAR_CRS = CRS.from_proj4(
    f"+proj=eqc +lat_ts=0 +lat_0=0 +lon_0=180 +x_0=0 +y_0=0 "
    f"+a={MARS_RADIUS_M} +b={MARS_RADIUS_M} +units=m +no_defs +type=crs"
)


def mars_lonlat_to_crs(
    longitude_east_deg: float,
    latitude_planetocentric_deg: float,
    destination: CRS,
) -> tuple[float, float]:
    """Transform positive-east 0..360 planetocentric Mars coordinates."""
    if not 0.0 <= longitude_east_deg <= 360.0:
        raise ValueError("Mars east longitude must be in [0, 360] degrees")
    if not -90.0 <= latitude_planetocentric_deg <= 90.0:
        raise ValueError("Planetocentric latitude must be in [-90, 90] degrees")

    transformer = Transformer.from_crs(
        MARS_GEOGRAPHIC_CRS,
        destination,
        always_xy=True,
        force_over=True,
    )
    x, y = transformer.transform(longitude_east_deg, latitude_planetocentric_deg)
    return float(x), float(y)
