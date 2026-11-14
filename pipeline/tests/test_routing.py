"""Small synthetic grids verify routing behavior, never exported as NASA data."""
import unittest
import numpy as np
from rasterio.io import MemoryFile
from rasterio.transform import from_origin
from mars_pipeline.coordinates import MOLA_EQUIRECTANGULAR_CRS, mars_lonlat_to_crs
from mars_pipeline.routing import astar, path_metrics, supported_grid


def grid():
    rows, cols = np.mgrid[0:5, 0:5]
    coordinates = np.stack((195 + cols * 0.01, 38 - rows * 0.01), axis=-1)
    return np.zeros((5, 5)), np.zeros((5, 5)), coordinates


class RouteChecks(unittest.TestCase):
    def test_count_coverage_controls_routing_support(self):
        x, y = mars_lonlat_to_crs(195, 38, MOLA_EQUIRECTANGULAR_CRS)
        profile = dict(driver="GTiff", width=3, height=3, count=1, dtype="int16",
                       crs=MOLA_EQUIRECTANGULAR_CRS, transform=from_origin(x-750, y+750, 500, 500))
        with MemoryFile() as a, MemoryFile() as b:
            with a.open(**profile) as top, b.open(**profile) as counts:
                top.write(np.full((3, 3), -3900, dtype=np.int16), 1)
                values = np.ones((3, 3), dtype=np.int16)
                counts.write(values, 1)
                self.assertTrue(np.isfinite(supported_grid(top, counts, 1)[1][1, 1]))
                values[0, 0] = 0
                counts.write(values, 1)
                self.assertFalse(np.any(np.isfinite(supported_grid(top, counts, 1)[1])))
                # Official product interpolation remains usable, with explicit downstream penalty.
                self.assertTrue(np.isfinite(supported_grid(top, counts, 1, True)[1][1, 1]))
                top.write(np.zeros((3, 3), dtype=np.int16), 1)
                self.assertFalse(np.any(np.isfinite(supported_grid(top, counts, 1, True)[1])))

    def test_uncertainty_penalty_prefers_observed_corridor(self):
        elevation, slopes, coordinates = grid()
        uncertainty = np.zeros((5, 5))
        uncertainty[2, 1:4] = 1
        direct, _ = astar(elevation, slopes, coordinates, (2, 0), (2, 4), 10, 0)
        penalized, _ = astar(elevation, slopes, coordinates, (2, 0), (2, 4), 10, 0, uncertainty, 2)
        self.assertTrue(any(uncertainty[cell] == 1 for cell in direct))
        self.assertTrue(all(uncertainty[cell] == 0 for cell in penalized))

    def test_penalty_prefers_flatter_route_and_is_deterministic(self):
        elevation, slopes, coordinates = grid()
        slopes[2, 1:4] = 9
        direct, _ = astar(elevation, slopes, coordinates, (2, 0), (2, 4), 10, 0)
        penalized, reason = astar(elevation, slopes, coordinates, (2, 0), (2, 4), 10, 10)
        self.assertIsNone(reason)
        self.assertTrue(any(slopes[cell] == 9 for cell in direct))
        self.assertTrue(all(slopes[cell] == 0 for cell in penalized))
        self.assertEqual(penalized, astar(elevation, slopes, coordinates, (2, 0), (2, 4), 10, 10)[0])
        self.assertEqual(path_metrics(penalized, elevation, slopes, coordinates)["elevationGainMeters"], 0)

    def test_unsupported_barrier_and_diagonal_corner_are_blocked(self):
        elevation, slopes, coordinates = grid()
        slopes[:, 2] = np.nan
        path, reason = astar(elevation, slopes, coordinates, (2, 0), (2, 4), 10, 10)
        self.assertIsNone(path)
        self.assertEqual(reason, "no_supported_path_in_bounded_window")
        slopes[:] = np.nan
        slopes[0, 0] = slopes[1, 1] = 0
        self.assertIsNone(astar(elevation, slopes, coordinates, (0, 0), (1, 1), 10, 10)[0])
        self.assertIsNone(astar(elevation, slopes, coordinates, (-1, 0), (1, 1), 10, 10)[0])

    def test_metrics_and_edge_grade_limit(self):
        elevation, slopes, coordinates = grid()
        elevation[0, 1], elevation[0, 2] = 10, 5
        path = [(0, 0), (0, 1), (0, 2)]
        metrics = path_metrics(path, elevation, slopes, coordinates)
        self.assertEqual(metrics["elevationGainMeters"], 10)
        self.assertGreater(metrics["distanceMeters"], 0)
        self.assertGreater(metrics["maximumSlopeDegrees"], 0)
        elevation[:, 2:] = 10000
        self.assertIsNone(astar(elevation, slopes, coordinates, (0, 0), (0, 4), 10, 10)[0])


if __name__ == "__main__":
    unittest.main()
