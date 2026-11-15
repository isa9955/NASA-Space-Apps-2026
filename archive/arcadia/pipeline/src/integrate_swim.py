"""Import an independently verified SWIM4IMIM raster without rebuilding terrain/sites.

Obtain the official numeric 0-1 m GeoTIFF first. This command does not infer
product identity from an image or attempt an undocumented mirror/download URL.
"""
import argparse
from copy import deepcopy
import json
from pathlib import Path
import re
from urllib.parse import urlparse

import rasterio

from build_site_inputs import _observation, _swim_source, sha256_file, validate_export
from mars_pipeline.coordinates import mars_lonlat_to_crs
from mars_pipeline.swim import extract_consistency

ROOT = Path(__file__).resolve().parents[1]


def integrate(inputs, raster_path, source_url, expected_sha256):
    url = urlparse(source_url)
    if (url.scheme != "https" or url.hostname not in {"swim.psi.edu", "ammos.nasa.gov"}
            or url.username or url.password or url.port
            or not url.path.lower().endswith((".tif", ".tiff"))):
        raise ValueError("Record a verified official SWIM/JPL numeric GeoTIFF HTTPS URL")
    if not re.fullmatch(r"[a-fA-F0-9]{64}", expected_sha256):
        raise ValueError("Supply the independently recorded full raster SHA-256")
    if sha256_file(raster_path) != expected_sha256.lower():
        raise ValueError("SWIM raster SHA-256 mismatch; inputs remain unchanged")
    if inputs.get("schemaVersion") != "phase2-site-inputs/1.0.0":
        raise ValueError("Unsupported site input schema")
    result = deepcopy(inputs)
    source = _swim_source(raster_path, None)
    source.update(rasterUrl=source_url, expectedSha256=expected_sha256.lower(),
                  samplingMethod="Containing native SWIM cell; no interpolation, resampling or MOLA grid alignment assumed.",
                  interpretation="Dimensionless consistency with ice in the 0-1 m sensing range; not probability, depth, abundance or confirmed accessibility.")
    samples = []
    with rasterio.open(raster_path) as raster:
        for site in result["sites"]:
            lon, lat = site["location"]["coordinates"]
            value, reason = extract_consistency(raster_path, lon, lat)
            x, y = mars_lonlat_to_crs(lon, lat, raster.crs)
            row, col = raster.index(x, y)
            samples.append({"siteId": site["id"], "row": row, "column": col,
                            "insideRaster": 0 <= row < raster.height and 0 <= col < raster.width})
            site["observations"]["swimCombinedIceConsistency"] = _observation(
                value, "1 (dimensionless index)", "derived" if value is not None else "unavailable",
                source["id"], reason)
    source["samples"] = samples
    result["sources"]["swim"] = source
    result["dataAvailability"]["swim"] = "available"
    validate_export(result)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raster", type=Path, required=True)
    parser.add_argument("--source-url", required=True)
    parser.add_argument("--expected-sha256", required=True)
    parser.add_argument("--input", type=Path, default=ROOT / "site_inputs.json")
    parser.add_argument("--output", type=Path, default=ROOT / "site_inputs.json")
    args = parser.parse_args()
    inputs = json.loads(args.input.read_text(encoding="utf-8"))
    result = integrate(inputs, args.raster, args.source_url, args.expected_sha256)
    args.output.write_text(json.dumps(result, indent=2, allow_nan=False) + "\n", encoding="utf-8", newline="\n")
    for site in result["sites"]:
        print(site["id"], site["observations"]["swimCombinedIceConsistency"])


if __name__ == "__main__":
    main()
