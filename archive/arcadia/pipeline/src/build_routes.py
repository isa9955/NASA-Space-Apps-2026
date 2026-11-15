"""Export precomputed provisional routes or explicit unavailable records."""
import argparse
import json
from pathlib import Path

import rasterio
import numpy as np

from build_site_inputs import sha256_file
from mars_pipeline.coordinates import mars_lonlat_to_crs
from mars_pipeline.mola import download_regional_window
from mars_pipeline.routing import astar, supported_grid, path_metrics
from mars_pipeline.selection import distance_m

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh-mola", action="store_true", help="Refetch only the bounded regional window")
    args = parser.parse_args()
    config = json.loads((ROOT / "config/routing.json").read_text())
    selection = json.loads((ROOT / "candidate_selection.json").read_text())
    assessments_path = ROOT / "site_assessments.json"
    assessments = json.loads(assessments_path.read_text())
    sites = {site["id"]: site for site in assessments["sites"]}
    start = sites[config["startId"]]
    goals = [sites[c["id"]] for c in selection["selected"]]
    cache = ROOT / "data/selection"
    top_path, count_path = cache / "mola_subset.tif", cache / "mola_arcadia_counts_subset.tif"
    if args.refresh_mola or not top_path.exists() or not count_path.exists():
        bounds = selection["configuration"]["boundsDegrees"]
        download_regional_window([(bounds["west"], bounds["south"]), (bounds["east"], bounds["north"])], top_path)
    for path, expected in ((top_path, selection["topographyRasterSha256"]), (count_path, selection["countsRasterSha256"])):
        if sha256_file(path) != expected:
            raise ValueError("MOLA cache differs from selected-candidate provenance; do not route on unverified terrain")
    warnings = [
        "PROVISIONAL: Regional terrain route only; not certified safe or operational navigation.",
        "MOLA resolution cannot resolve boulders, small craters, loose soil or vehicle-scale hazards.",
        "A positive observation count does not establish measurement accuracy or traversability.",
        "Routes may cross interpolated elevations supplied by the official MOLA product; no local gap filling is performed.",
        "Reported uncertainty coverage is a data-support description, not a probability of safety.",
        "Radiation, shielding, weather, water and resource access remain unresolved.",
        "A missing route means no supported connection in this bounded grid, not that travel is globally impossible."
    ]
    features = []
    with rasterio.open(top_path) as top, rasterio.open(count_path) as counts:
        elevation, slopes, coordinates = supported_grid(top, counts, config["minimumNeighborhoodCount"],
                                                       config["allowProductInterpolation"])
        count_values = counts.read(1)
        uncertainty = np.ones_like(slopes)
        for r in range(1, top.height-1):
            for c in range(1, top.width-1):
                uncertainty[r, c] = np.mean(count_values[r-1:r+2, c-1:c+2] == 0)
        def pixel(site):
            return top.index(*mars_lonlat_to_crs(*site["location"]["coordinates"], top.crs))
        start_pixel = pixel(start)
        for goal in goals:
            goal_pixel = pixel(goal)
            route_coordinates = coordinates.copy()
            for site, cell in ((start, start_pixel), (goal, goal_pixel)):
                if 0 <= cell[0] < top.height and 0 <= cell[1] < top.width:
                    route_coordinates[cell] = site["location"]["coordinates"]
            path, reason = astar(elevation, slopes, route_coordinates, start_pixel, goal_pixel,
                                 config["maximumSlopeDegrees"], config["slopePenalty"], uncertainty,
                                 config["interpolationPenalty"])
            properties = {
                "id": f"{start['id']}-to-{goal['id']}", "startId": start["id"], "siteId": goal["id"],
                "status": "provisional" if path else "unavailable", "unavailableReason": reason,
                "distanceMeters": None, "elevationGainMeters": None, "maximumSlopeDegrees": None,
                "meanRegionalSlopeDegrees": None, "evidenceCoverage": None,
                "requestedStart": start["location"]["coordinates"], "requestedDestination": goal["location"]["coordinates"],
                "warnings": warnings, "sources": [s for s in assessments["sources"] if s["id"].startswith("mola-")],
            }
            if path:
                properties.update(path_metrics(path, elevation, slopes, route_coordinates))
                interpolated_distance = sum(distance_m(route_coordinates[a], route_coordinates[b])
                    for a, b in zip(path, path[1:]) if count_values[a] == 0 or count_values[b] == 0)
                properties["meanRegionalSlopeDegrees"] = float(np.mean([slopes[p] for p in path]))
                properties["evidenceCoverage"] = {
                    "pathCellCount": len(path),
                    "directCellCount": sum(int(count_values[p] > 0) for p in path),
                    "interpolatedCellCount": sum(int(count_values[p] == 0) for p in path),
                    "interpolatedDistanceMeters": interpolated_distance,
                    "interpolatedDistanceFraction": interpolated_distance / properties["distanceMeters"],
                    "meanNeighborhoodInterpolationFraction": float(np.mean([uncertainty[p] for p in path])),
                }
            # Snap only to containing cells; never search for a more convenient supported endpoint.
            properties["endpointCells"] = {}
            for key, site, cell in (("start", start, start_pixel), ("destination", goal, goal_pixel)):
                inside = 0 <= cell[0] < top.height and 0 <= cell[1] < top.width
                center = coordinates[cell].tolist() if inside else None
                properties["endpointCells"][key] = {"coordinates": center,
                    "offsetMeters": distance_m(site["location"]["coordinates"], center) if inside else None}
            features.append({"type": "Feature", "geometry": {"type": "LineString", "coordinates": [route_coordinates[p].tolist() for p in path]} if path else None,
                             "properties": properties})
    output = {
        "type": "FeatureCollection", "schemaVersion": "phase5-routes/1.1.0",
        "planningVersion": config["version"], "configuration": config,
        "coordinateReference": start["location"]["coordinateReference"],
        "inputProvenance": {"assessmentSha256": sha256_file(assessments_path),
                            "topographyRasterSha256": sha256_file(top_path), "countsRasterSha256": sha256_file(count_path)},
        "starts": [{"id": start["id"], "location": start["location"]}],
        "coverage": {"boundsDegrees": selection["configuration"]["boundsDegrees"],
                     "gridCellCount": int(slopes.size), "supportedCellCount": int(np.isfinite(slopes).sum()),
                     "directCellCount": int((count_values > 0).sum()),
                     "interpolatedCellCount": int((count_values == 0).sum()),
                     "invalidElevationCellCount": int((~np.isfinite(elevation) | ((elevation == 0) & (count_values == 0))).sum())},
        "features": features,
    }
    (ROOT / "routes.geojson").write_text(json.dumps(output, indent=2, allow_nan=False) + "\n", encoding="utf-8", newline="\n")
    for feature in features:
        print(feature["properties"]["siteId"], feature["properties"]["status"], feature["properties"]["unavailableReason"])


if __name__ == "__main__":
    main()
