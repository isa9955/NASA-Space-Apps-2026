"""Check exported Deuteronilus geometry against its native cells, not Arcadia CRS."""
import json
import math
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


class RegionalGeometryChecks(unittest.TestCase):
    def test_actual_route_cells_geometry_metrics_and_blocked_corners_agree(self):
        artifact = json.loads((ROOT / "deuteronilus_analysis.json").read_text(encoding="utf-8"))
        grid = json.loads((ROOT.parents[2] / "api/mars-blindspots/data/deuteronilus/data_grid.json").read_text(encoding="utf-8"))
        bounds, shape = artifact["bounds"], artifact["grid"]
        for feature in artifact["routes"]:
            properties = feature["properties"]
            cells = properties["cells"]
            self.assertEqual(cells[0], properties["startCell"])
            self.assertEqual(cells[-1], properties["endCell"])
            self.assertEqual(len(cells), len(feature["geometry"]["coordinates"]))
            distance = 0
            for (row, col), (lon, lat) in zip(cells, feature["geometry"]["coordinates"]):
                self.assertGreaterEqual(grid["traversability"][row][col], 0.05)
                self.assertAlmostEqual(lon, bounds["west"] + (col + 0.5) / shape["cols"] * (bounds["east"] - bounds["west"]))
                self.assertAlmostEqual(lat, bounds["north"] - (row + 0.5) / shape["rows"] * (bounds["north"] - bounds["south"]))
            for (r, c), (nr, nc) in zip(cells, cells[1:]):
                self.assertEqual(max(abs(nr-r), abs(nc-c)), 1)
                if r != nr and c != nc:
                    self.assertGreaterEqual(min(grid["traversability"][r][nc], grid["traversability"][nr][c]), 0.05)
                distance += math.hypot(nr-r, nc-c) * shape["cellMeters"]
            self.assertAlmostEqual(distance, properties["metrics"]["distance_m"], places=7)
