from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import rasterio

from mars_pipeline.mola import (
    MOLA_IMAGE_URL,
    MOLA_COUNTS_PRODUCT_ID,
    MOLA_COUNTS_URL,
    MOLA_LABEL_URL,
    MOLA_NODATA,
    MOLA_PIXEL_SIZE_M,
    MOLA_PRODUCT_ID,
    MOLA_SOURCE_URL,
    download_regional_window,
    elevation_and_slope,
    MolaWindow,
)
from mars_pipeline.swim import (
    SWIM_PRODUCT_ID,
    SWIM_PRODUCT_URL,
    SWIM_STUDY_URL,
    extract_consistency,
    validate_raster,
)

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CONFIG = REPOSITORY_ROOT / "pipeline/config/study_region.json"
DEFAULT_OUTPUT = REPOSITORY_ROOT / "pipeline/site_inputs.json"
DEFAULT_CACHE = REPOSITORY_ROOT / "pipeline/data/cache"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _mola_source(window, source_read_at: str) -> dict[str, Any]:
    return {
        "id": "mola-megdr-128ppd",
        "provider": "NASA Planetary Data System Geosciences Node",
        "productId": MOLA_PRODUCT_ID,
        "productUrl": MOLA_IMAGE_URL,
        "labelUrl": MOLA_LABEL_URL,
        "catalogUrl": MOLA_SOURCE_URL,
        "instrument": "Mars Orbiter Laser Altimeter (MOLA), Mars Global Surveyor",
        "productType": "MEGDR topography",
        "productVersion": "2.0 (PDS label: hb tile)",
        "observationsPeriod": "1999-02 through 2001-06",
        "coordinateReference": {
            "body": "Mars",
            "datum": "IAU2000 body-fixed rotating sphere",
            "latitudeType": "planetocentric",
            "longitudeDirection": "positive east",
            "longitudeRange": "0 to 360 degrees",
            "projection": "equirectangular, central meridian 180 degrees",
            "radiusMeters": 3396000
        },
        "valueUnit": "meter relative to MOLA areoid",
        "pixelSizeMeters": MOLA_PIXEL_SIZE_M,
        "nodata": {
            "headerIgnoreValue": MOLA_NODATA,
            "countsProductId": MOLA_COUNTS_PRODUCT_ID,
            "interpretation": "The PDS4 topography label describes interpolation where bins have no observations and does not declare a special constant. The supplied ENVI header marks zero as ignore; the companion count raster is used to distinguish zero-observation bins from observed zero elevation."
        },
        "availability": "available",
        "regionalBytesFetched": window.source_bytes,
        "regionalRasterSha256": sha256_file(window.path),
        "countsProduct": {
            "productId": MOLA_COUNTS_PRODUCT_ID,
            "productUrl": MOLA_COUNTS_URL,
            "valueUnit": "observations per grid cell",
            "dataType": "unsigned 8-bit integer",
            "zeroMeaning": "No MOLA observations in the bin; a topography value in this cell may be interpolated."
        },
        "retrievedAt": source_read_at
    }


def _mola_counts_source(window, source_read_at: str) -> dict[str, Any]:
    return {
        "id": "mola-megdr-128ppd-counts",
        "provider": "NASA Planetary Data System Geosciences Node",
        "productId": MOLA_COUNTS_PRODUCT_ID,
        "productUrl": MOLA_COUNTS_URL,
        "labelUrl": MOLA_COUNTS_URL.removesuffix(".img") + ".xml",
        "catalogUrl": MOLA_SOURCE_URL,
        "instrument": "Mars Orbiter Laser Altimeter (MOLA), Mars Global Surveyor",
        "productType": "MEGDR observation counts",
        "productVersion": "2.0 (PDS label: hb tile)",
        "valueUnit": "observations per grid cell",
        "dataType": "unsigned 8-bit integer",
        "zeroMeaning": "No observations in that pixel; zero is a valid count, not a missing count.",
        "availability": "available",
        "regionalRasterSha256": sha256_file(window.counts_path),
        "retrievedAt": source_read_at,
    }


def _swim_source(path: Path | None, retrieval_note: str | None) -> dict[str, Any]:
    base: dict[str, Any] = {
        "id": "swim4imim-combined-ci-0-1m",
        "provider": "NASA-supported Subsurface Water Ice Mapping (SWIM) project",
        "productId": SWIM_PRODUCT_ID,
        "productUrl": SWIM_PRODUCT_URL,
        "regionalStudyUrl": SWIM_STUDY_URL,
        "release": "SWIM4IMIM product page, last updated 2025-08-04",
        "variable": "combined ice-consistency index for the 0-1 m sensing-depth product",
        "valueUnit": "1 (dimensionless index; not water abundance or depth)",
        "publishedProjection": "simple cylindrical, spherical Mars",
        "publishedPixelSizeMeters": 3000,
        "publishedLongitude": "0 to 360 degrees east",
        "publishedLatitude": "60 degrees south to 60 degrees north",
        "publishedNoData": -30,
        "availability": "available" if path and path.is_file() else "not-retrieved"
    }
    if path and path.is_file():
        with rasterio.open(path) as dataset:
            validate_raster(dataset)
            base.update(
                {
                    "inputFile": path.name,
                    "inputSha256": sha256_file(path),
                    "rasterCrs": dataset.crs.to_wkt(),
                    "rasterBounds": list(dataset.bounds),
                    "rasterNodata": dataset.nodata,
                    "rasterTransform": list(dataset.transform)[:6],
                    "rasterShape": [dataset.height, dataset.width],
                    "pixelSizeMeters": list(dataset.res),
                }
            )
    elif retrieval_note:
        base["retrievalNote"] = retrieval_note
    else:
        base["retrievalNote"] = (
            "No SWIM GeoTIFF was supplied. The extraction script requires the "
            "official GIS-ready product; it will not infer data from a browse image."
        )
    return base


def _observation(
    value: float | None,
    unit: str,
    status: str,
    source_id: str,
    unavailable_reason: str | None = None,
) -> dict[str, Any]:
    result = {
        "value": value,
        "unit": unit if value is not None else None,
        "status": status,
        "sourceId": source_id,
    }
    if unavailable_reason:
        result["unavailableReason"] = unavailable_reason
    return result


def validate_export(document: dict[str, Any]) -> None:
    """Reject malformed coordinates or non-finite values before serialization."""
    if len(document.get("sites", [])) not in (2, 3):
        raise ValueError("Export must contain 2 or 3 site input locations")
    for site in document["sites"]:
        lon = site["location"]["coordinates"][0]
        lat = site["location"]["coordinates"][1]
        if not 0 <= lon <= 360 or not -90 <= lat <= 90:
            raise ValueError(f"Invalid Mars longitude/latitude in {site['id']}")
        for observation in site["observations"].values():
            value = observation["value"]
            if value is not None and not (value == value and abs(value) != float("inf")):
                raise ValueError(f"Non-finite value in {site['id']}")
            if value is not None and not observation["unit"]:
                raise ValueError(f"Measured value has no unit in {site['id']}")


def build_site_inputs(
    config_path: Path,
    output_path: Path,
    cache_dir: Path,
    swim_path: Path | None = None,
    swim_retrieval_note: str | None = None,
    mola_window: MolaWindow | None = None,
) -> dict[str, Any]:
    config = json.loads(config_path.read_text(encoding="utf-8"))
    sites = config["sites"]
    locations = [
        (float(site["longitudeEastDeg"]), float(site["latitudePlanetocentricDeg"]))
        for site in sites
    ]

    read_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    mola_window = mola_window or download_regional_window(
        locations,
        cache_dir / "mola_arcadia_subset.tif",
    )
    swim_source = _swim_source(swim_path, swim_retrieval_note)

    site_records: list[dict[str, Any]] = []
    with rasterio.open(mola_window.path) as mola_raster, rasterio.open(
        mola_window.counts_path
    ) as mola_counts:
        for site in sites:
            longitude = float(site["longitudeEastDeg"])
            latitude = float(site["latitudePlanetocentricDeg"])
            elevation, slope, mola_count, reason, slope_basis = elevation_and_slope(
                mola_raster, longitude, latitude, mola_counts
            )
            swim_value: float | None = None
            swim_reason: str | None = "swim_raster_not_retrieved"
            if swim_path and swim_path.is_file():
                swim_value, swim_reason = extract_consistency(
                    swim_path, longitude, latitude
                )

            site_records.append(
                {
                    "id": site["id"],
                    "name": site["name"],
                    "location": {
                        "type": "Point",
                        "coordinates": [longitude, latitude],
                        "coordinateReference": config["region"]["coordinateReference"],
                    },
                    "observations": {
                        "swimCombinedIceConsistency": _observation(
                            swim_value,
                            "1 (dimensionless index)",
                            "derived" if swim_value is not None else "unavailable",
                            "swim4imim-combined-ci-0-1m",
                            swim_reason,
                        ),
                        "molaTopography": _observation(
                            elevation,
                            "meter relative to MOLA areoid",
                            (
                                "sampled_product_value"
                                if mola_count and mola_count > 0
                                else "interpolated_product_value"
                                if elevation is not None
                                else "unavailable"
                            ),
                            "mola-megdr-128ppd",
                            reason if elevation is None else None,
                        ),
                        "molaObservationCount": _observation(
                            float(mola_count) if mola_count is not None else None,
                            "observations per 128 ppd cell",
                            "observed" if mola_count is not None else "unavailable",
                            "mola-megdr-128ppd-counts",
                        ),
                        "molaRegionalSlope": {
                            **_observation(
                                slope,
                                "degree",
                                (
                                    "derived_from_interpolated_cells"
                                    if slope_basis == "contains_cells_without_direct_observations"
                                    else "derived"
                                ) if slope is not None else "unavailable",
                                "mola-megdr-128ppd",
                                reason if slope is None else None,
                            ),
                            "method": "3x3-neighborhood central differences on the MOLA 128 ppd grid",
                            "dataBasis": slope_basis,
                        },
                    },
                }
            )

    document: dict[str, Any] = {
        "schemaVersion": "phase2-site-inputs/1.0.0",
        "generatedAt": read_at,
        "region": config["region"],
        "sources": {
            "swim": swim_source,
            "mola": _mola_source(mola_window, read_at),
            "molaCounts": _mola_counts_source(mola_window, read_at),
        },
        "dataAvailability": {
            "swim": swim_source["availability"],
            "mola": "available",
            "molaCounts": "available",
        },
        "sites": site_records,
        "limitations": [
            "The chosen coordinates are sample locations for ingestion, not scientifically ranked candidate sites.",
            "The SWIM combined ice-consistency index is a derived proxy and is not a direct measurement of ice abundance, depth, or accessibility.",
            "MOLA topography is a regional-scale orbital product; derived slope is a local 3x3-grid estimate and is not a landing-safety assessment.",
            "No suitability score, evidence-confidence score, radiation calculation, route, or safety conclusion is produced.",
        ],
    }
    validate_export(document)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(document, indent=2, allow_nan=False) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    return document


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--cache-dir", type=Path, default=DEFAULT_CACHE)
    parser.add_argument(
        "--swim-raster",
        type=Path,
        help="Official SWIM GIS-ready GeoTIFF. If omitted, SWIM observations are explicitly unavailable.",
    )
    parser.add_argument(
        "--swim-retrieval-note",
        help="Optional reason the SWIM product could not be retrieved in this run.",
    )
    args = parser.parse_args()
    document = build_site_inputs(
        args.config,
        args.output,
        args.cache_dir,
        args.swim_raster,
        args.swim_retrieval_note,
    )
    print(
        f"Wrote {args.output}: {len(document['sites'])} sample locations; "
        f"SWIM={document['dataAvailability']['swim']}, "
        f"MOLA={document['dataAvailability']['mola']}"
    )


if __name__ == "__main__":
    main()
