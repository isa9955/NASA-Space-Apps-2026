"""Fetch a small official MOLA window, select two terrain candidates and export inputs."""
import argparse
from copy import deepcopy
import json
from pathlib import Path

import rasterio

from build_site_inputs import build_site_inputs, sha256_file
from mars_pipeline.mola import download_regional_window, MOLA_PRODUCT_ID, MOLA_COUNTS_PRODUCT_ID
from mars_pipeline.selection import discover_candidates, select_pair, distance_m

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=ROOT / "config/candidate_selection.json")
    args = parser.parse_args()
    config = json.loads(args.config.read_text(encoding="utf-8"))
    original = json.loads((ROOT / "config/study_region.json").read_text(encoding="utf-8"))
    reference = next(s for s in original["sites"] if s["id"] == config["referenceSiteId"])
    reference_coordinates = [reference["longitudeEastDeg"], reference["latitudePlanetocentricDeg"]]
    bounds = config["boundsDegrees"]
    if not (180 <= bounds["west"] < bounds["east"] <= 270 and 0 <= bounds["south"] < bounds["north"] <= 44):
        raise ValueError("Selection bounds must be inside tile MEGT44N180HB")
    if not (bounds["west"] <= reference_coordinates[0] <= bounds["east"] and bounds["south"] <= reference_coordinates[1] <= bounds["north"]):
        raise ValueError("Reference must lie within selection bounds")
    # Guard against accidental large source transfers in this hackathon tool.
    if bounds["east"] - bounds["west"] > 1 or bounds["north"] - bounds["south"] > 1:
        raise ValueError("Selection window must be at most one degree per axis")
    window = download_regional_window(
        [(bounds["west"], bounds["south"]), (bounds["east"], bounds["north"])],
        ROOT / "data/selection/mola_subset.tif"
    )
    with rasterio.open(window.path) as terrain, rasterio.open(window.counts_path) as counts:
        candidates = discover_candidates(terrain, counts, window, bounds, config["minimumNeighborhoodCount"])
    selected = select_pair(candidates, reference_coordinates, config["minimumSeparationMeters"])
    selected_config = {"region": deepcopy(original["region"]), "sites": [reference] + [
        {"id": c["id"], "name": f"Arcadia terrain candidate {i}",
         "longitudeEastDeg": c["coordinates"][0], "latitudePlanetocentricDeg": c["coordinates"][1]}
        for i, c in enumerate(selected, 1)
    ]}
    selected_config["region"]["description"] = "One predefined reference and two automatically selected regional MOLA terrain candidates; habitat suitability remains unknown."
    report = {
        "configuration": config, "eligibleCellCount": len(candidates),
        "topographyProductId": MOLA_PRODUCT_ID, "countsProductId": MOLA_COUNTS_PRODUCT_ID,
        "topographyRasterSha256": sha256_file(window.path),
        "countsRasterSha256": sha256_file(window.counts_path),
        "regionalBytesFetched": window.source_bytes,
        "reference": reference, "selected": selected,
        "pairSeparationMeters": distance_m(selected[0]["coordinates"], selected[1]["coordinates"]),
        "referenceSeparationMeters": {c["id"]: distance_m(c["coordinates"], reference_coordinates) for c in selected},
        "ordering": "ascending slope; descending minimum 3x3 count; descending center count; ascending tile row and column; first feasible pair",
        "limitation": "Terrain-only discovery with regional MOLA data, not evidence of habitability or site safety."
    }
    config_path = ROOT / "config/selected_sites.json"
    config_path.write_text(json.dumps(selected_config, indent=2) + "\n", encoding="utf-8")
    # Reuse the downloaded, aligned window; do not re-fetch or alter slope/scoring logic.
    document = build_site_inputs(config_path, ROOT / "site_inputs.json", ROOT / "data/selection",
                                swim_retrieval_note="SWIM remains unavailable; candidate discovery uses MOLA terrain only.",
                                mola_window=window)
    document["sources"]["mola"]["candidateSelection"] = report
    (ROOT / "site_inputs.json").write_text(json.dumps(document, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    (ROOT / "candidate_selection.json").write_text(json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(f"Selected two of {len(candidates)} eligible cells; reference preserved; {window.source_bytes} source bytes fetched.")


if __name__ == "__main__":
    main()
