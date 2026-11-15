"""Validate teammate grids and export a compact offline regional analysis.

--verify-source repeats three bounded NASA DTM range checks (~841 kB total).
Normal builds are offline. The raw DTM's reported full-file hash is not verified.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import sys
from urllib.request import Request, urlopen

import numpy as np
from pyproj import CRS, Transformer

ROOT = Path(__file__).resolve().parents[1]
BLINDSPOTS = ROOT.parents[2] / "api/mars-blindspots"
DATA = BLINDSPOTS / "data/deuteronilus"
sys.path.insert(0, str(BLINDSPOTS / "backend"))
import routing  # noqa: E402 — independent Deuteronilus algorithm, not Arcadia A*


def sha(path):
    raw = path.read_bytes()
    # Git normalizes source code; bind algorithm identity independently of OS.
    if path.suffix == ".py":
        raw = raw.replace(b"\r\n", b"\n")
    return hashlib.sha256(raw).hexdigest()


def verify_source_samples(audit, grid):
    for sample in audit["samples"]:
        first, last = sample["sourceByteRange"]
        request = Request(audit["sourceUrl"], headers={"Range": f"bytes={first}-{last}"})
        with urlopen(request, timeout=30) as response:
            if response.status != 206 or not response.headers["Content-Range"].startswith(f"bytes {first}-{last}/"):
                raise ValueError("NASA source did not honor the bounded range")
            data = response.read(last - first + 2)
        if len(data) != last - first + 1 or hashlib.sha256(data).hexdigest() != sample["bytesSha256"]:
            raise ValueError("NASA source sample differs from the audited bytes")
        row, col = sample["cell"]
        values = np.frombuffer(data, dtype="<f4").reshape(10, audit["shape"][1])[:, 1500 + col * 10:1510 + col * 10]
        if not np.isfinite(values).all() or np.any(values < -1e30):
            raise ValueError("NASA source sample contains NoData")
        if abs(float(values.astype(float).mean()) - grid["elevation"][row][col]) > 0.051:
            raise ValueError("Processed block mean disagrees with NASA source sample")


def build(verify_source=False):
    meta, grid = routing.load_site(str(DATA))
    audit_path = ROOT / "deuteronilus_source.json"
    audit = json.loads(audit_path.read_text(encoding="utf-8"))
    if (audit["processedGridSha256"] != sha(DATA / "data_grid.json")
            or audit["processedMetadataSha256"] != sha(DATA / "metadata.json")):
        raise ValueError("Processed data differ from the source-audited snapshot")
    g = routing.prepare_grids(meta, grid)
    rows, cols, cell = g["rows"], g["cols"], g["cell_m"]
    if meta["is_synthetic"] or [rows, cols] != [800, 400] or grid["scale"] != "walk":
        raise ValueError("Unexpected Deuteronilus grid or synthetic input")
    if not math.isclose(cell, meta["grid"]["cell_m"], abs_tol=1e-10):
        raise ValueError("Grid spacing disagrees with metadata")
    # Verify the published crop using the independently read official PDS label.
    crs = CRS.from_wkt(audit["crsWkt"])
    transform = Transformer.from_crs(crs, crs.geodetic_crs, always_xy=True)
    a, b, c, d, e, f = audit["transform"]
    if b or d or a <= 0 or e >= 0:
        raise ValueError("Unsupported raster orientation")
    crop = meta["crop_window"]
    west, north = transform.transform(c + crop["col0"] * a, f + crop["row0"] * e)
    east, south = transform.transform(c + crop["col1"] * a, f + crop["row1"] * e)
    for key, actual in dict(west=west, east=east, south=south, north=north).items():
        if not math.isclose(meta["bounds"][key], actual, abs_tol=1e-9):
            raise ValueError("Processed bounds disagree with the NASA projection/crop")
    if verify_source:
        verify_source_samples(audit, grid)
    zones = json.loads((DATA / "zones.json").read_text(encoding="utf-8"))
    summaries = []
    for name, zone in zones["zones"].items():
        for variant in ("nominal", "robust"):
            rle = zones["masks"][name][variant]
            if rle[0] not in (0, 1) or any(not isinstance(n, int) or n < 0 for n in rle[1:]) or sum(rle[1:]) != rows * cols:
                raise ValueError("Invalid authoritative zone mask")
            count = sum(n for i, n in enumerate(rle[1:]) if (rle[0] + i) % 2)
            if not math.isclose(count * cell * cell, zone[variant]["area_m2"], abs_tol=0.01):
                raise ValueError("Zone mask area differs from the exported summary")
        summaries.append({"id": name, "label": zone["label"],
                          "nominalAreaSquareMeters": zone["nominal"]["area_m2"],
                          "robustAreaSquareMeters": zone["robust"]["area_m2"],
                          "interpretation": "Model-dependent footprint mask; not validated habitat, ice access or engineering suitability."})
    start, end = (600, 100), (150, 300)
    features = []
    paths = []
    for mode, key in (("standard", "trav"), ("uncertainty-aware", "safe")):
        path = routing.astar(g, start, end, g[key])
        paths.append(path)
        if path:
            # Explicit topology validation independent of A* reconstruction.
            for p, q in zip(path, path[1:]):
                dr, dc = q[0] - p[0], q[1] - p[1]
                if max(abs(dr), abs(dc)) != 1 or g["trav"][q] < routing.IMPASSABLE_T:
                    raise ValueError("Invalid path adjacency/support")
                if dr and dc and min(g["trav"][p[0], q[1]], g["trav"][q[0], p[1]]) < routing.IMPASSABLE_T:
                    raise ValueError("Path crosses a blocked diagonal corner")
        geometry = {"type": "LineString", "coordinates": [list(reversed(routing.cell_to_latlon(meta, g, *p))) for p in path]} if path else None
        features.append({"type": "Feature", "geometry": geometry, "properties": {
            "mode": mode, "status": "provisional" if path else "unavailable",
            "startCell": list(start), "endCell": list(end),
            "cells": [list(p) for p in path] if path else [],
            "metrics": routing.route_metrics(g, path) if path else None}})
    scouts = routing.scout_points(g, paths[0], paths[1]) if paths[0] else []
    science = routing.science_candidates(g, [p for p in paths if p])
    for point in scouts + science:
        point["coordinates"] = list(reversed(routing.cell_to_latlon(meta, g, *point["cell"])))
    return {
        "schemaVersion": "deuteronilus-analysis/1.0.0", "regionId": "deuteronilus",
        "routingVersion": "blindspots-astar-1.1.0", "overallHabitability": "unknown",
        "coordinateReference": {"body": "Mars", "latitudeType": "planetocentric", "longitudeDirection": "positive east",
                                "longitudeRange": "0 to 360 degrees", "projectionRadiusMeters": crs.ellipsoid.semi_major_metre,
                                "crsWkt": audit["crsWkt"]},
        "bounds": meta["bounds"], "grid": {"rows": rows, "cols": cols, "cellMeters": cell, "rowZero": "north"},
        "inputProvenance": {"metadataSha256": sha(DATA / "metadata.json"), "gridSha256": sha(DATA / "data_grid.json"),
                            "zonesSha256": sha(DATA / "zones.json"), "routingSha256": sha(BLINDSPOTS / "backend/routing.py"),
                            "sourceAuditSha256": sha(audit_path)},
        "sourceVerification": audit, "assumptions": meta["method"], "scales": meta["scales"],
        "routes": features, "scoutPoints": scouts, "scienceCandidates": science, "zoneSummaries": summaries,
        "warnings": [
            "PROVISIONAL: Both route cost models are exploratory; neither establishes astronaut or vehicle safety.",
            "Distances are projected grid path lengths; time assumes a constant 50 m/min, not a verified EVA duration.",
            "Slope/uncertainty and traversability are derived/model-dependent; sigma_z=0.3 m and uniform rock abundance are assumptions, not site-calibrated measurements.",
            "The safe key in the original Python API means uncertainty-aware cost only. Gap/critical percentages are model sensitivity, not hazard probabilities.",
            "Draft ice polygons are AI-assisted visual interpretations, not confirmed subsurface ice detections; ice depth and accessibility remain unknown.",
            "Sunlight estimates are terrain-only and omit dust/atmosphere; annual sampling and facility thresholds are assumptions.",
            "Scouting/science targets are geometric heuristics, not verified outcrops or field observations.",
            "Only three elevation blocks were independently checked against NASA bytes; full raw hash and complete terrain/zone regeneration remain unverified.",
            "Radiation, shielding, resource accessibility and overall habitability remain unknown."
        ]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify-source", action="store_true")
    args = parser.parse_args()
    result = build(args.verify_source)
    (ROOT / "deuteronilus_analysis.json").write_text(json.dumps(result, indent=2, allow_nan=False) + "\n", encoding="utf-8", newline="\n")
    for route in result["routes"]:
        print(route["properties"]["mode"], route["properties"]["status"], route["properties"]["metrics"])


if __name__ == "__main__":
    main()
