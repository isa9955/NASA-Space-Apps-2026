"""Essential selection checks; all fixtures are synthetic test coordinates."""
import unittest
from pathlib import Path
import numpy as np
from rasterio.io import MemoryFile
from rasterio.transform import from_origin
from mars_pipeline.coordinates import MOLA_EQUIRECTANGULAR_CRS, mars_lonlat_to_crs
from mars_pipeline.mola import MolaWindow
from mars_pipeline.selection import select_pair, distance_m, discover_candidates


def candidate(row, lon, slope, count=1):
    return {"id": str(row), "coordinates": [lon, 38], "slopeDegrees": slope,
            "minimumNeighborhoodCount": count, "observationCount": count,
            "tileRow": row, "tileColumn": 1}


class SelectionChecks(unittest.TestCase):
    def test_discovery_rejects_interpolated_neighborhoods(self):
        x, y = mars_lonlat_to_crs(195, 38, MOLA_EQUIRECTANGULAR_CRS)
        transform = from_origin(x - 1250, y + 1250, 500, 500)
        profile = dict(driver="GTiff", width=5, height=5, count=1,
                       dtype="int16", crs=MOLA_EQUIRECTANGULAR_CRS, transform=transform)
        window = MolaWindow(Path("unused"), Path("unused-counts"), transform, 5, 5, 0, 0, 0)
        bounds = dict(west=194.9, east=195.1, south=37.9, north=38.1)
        with MemoryFile() as top_file, MemoryFile() as count_file:
            with top_file.open(**profile) as top, count_file.open(**profile) as counts:
                top.write(np.full((5, 5), 100, dtype=np.int16), 1)
                count_values = np.ones((5, 5), dtype=np.int16)
                counts.write(count_values, 1)
                eligible = discover_candidates(top, counts, window, bounds, 1)
                self.assertEqual(len(eligible), 9)
                count_values[2, 2] = 0
                counts.write(count_values, 1)
                self.assertEqual(discover_candidates(top, counts, window, bounds, 1), [])

    def test_ordering_separation_and_no_silent_relaxation(self):
        points = [candidate(1, 195.1, 0.1), candidate(2, 195.11, 0.2),
                  candidate(3, 195.2, 0.3)]
        selected = select_pair(points, [195, 38], 3000)
        self.assertEqual([c["id"] for c in selected], ["1", "3"])
        self.assertEqual(selected, select_pair(list(reversed(points)), [195, 38], 3000))
        self.assertGreaterEqual(distance_m(selected[0]["coordinates"], selected[1]["coordinates"]), 3000)
        with self.assertRaises(ValueError):
            select_pair(points[:2], [195, 38], 3000)
        ties = [candidate(2, 195.1, 0.1), candidate(1, 195.2, 0.1, count=2)]
        self.assertEqual(select_pair(ties, [195, 38], 3000)[0]["id"], "1")


if __name__ == "__main__":
    unittest.main()
