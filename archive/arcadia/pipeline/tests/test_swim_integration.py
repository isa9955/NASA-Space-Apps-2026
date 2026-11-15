"""Synthetic raster checks only; no synthetic water evidence enters real exports."""
from copy import deepcopy
import json
from pathlib import Path
import tempfile
import unittest

import numpy as np
import rasterio
from rasterio.transform import from_origin

from build_site_inputs import sha256_file
from integrate_swim import integrate
from mars_pipeline.coordinates import MOLA_EQUIRECTANGULAR_CRS, mars_lonlat_to_crs
from mars_pipeline.swim import extract_consistency

ROOT = Path(__file__).resolve().parents[1]
TEST_URL = "https://swim.psi.edu/synthetic-test-only.tif"


class SwimIntegrationChecks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "synthetic.tif"
        self.inputs = json.loads((ROOT / "site_inputs.json").read_text())
        x, y = mars_lonlat_to_crs(195, 38, MOLA_EQUIRECTANGULAR_CRS)
        with rasterio.open(self.path, "w", driver="GTiff", width=32, height=32,
                           count=1, dtype="float32", crs=MOLA_EQUIRECTANGULAR_CRS,
                           transform=from_origin(x - 48000, y + 48000, 3000, 3000), nodata=-30) as raster:
            raster.write(np.full((32, 32), 0.25, dtype="float32"), 1)

    def test_import_changes_only_water_and_preserves_actual_terrain(self):
        original = deepcopy(self.inputs)
        result = integrate(self.inputs, self.path, TEST_URL, sha256_file(self.path))
        self.assertEqual(original, self.inputs)
        self.assertEqual(result["region"], original["region"])
        self.assertEqual(result["sources"]["mola"], original["sources"]["mola"])
        self.assertEqual(result["sources"]["molaCounts"], original["sources"]["molaCounts"])
        for site, before in zip(result["sites"], original["sites"]):
            self.assertEqual(site["id"], before["id"])
            self.assertEqual(site["location"], before["location"])
            self.assertEqual(site["observations"]["swimCombinedIceConsistency"]["value"], 0.25)
            for key in before["observations"]:
                if key != "swimCombinedIceConsistency":
                    self.assertEqual(site["observations"][key], before["observations"][key])

    def test_bad_hash_crs_range_nodata_and_coverage_fail_honestly(self):
        with self.assertRaisesRegex(ValueError, "SHA-256 mismatch"):
            integrate(self.inputs, self.path, TEST_URL, "0" * 64)
        with self.assertRaisesRegex(ValueError, "official"):
            integrate(self.inputs, self.path, "https://example.com/browse.tif", sha256_file(self.path))
        self.assertEqual(extract_consistency(self.path, 0, 0), (None, "outside_swim_coverage"))
        for value in (-30, 0, 2):
            with rasterio.open(self.path, "r+") as raster:
                raster.write(np.full((32, 32), value, dtype="float32"), 1)
            if value == 2:
                with self.assertRaisesRegex(ValueError, "consistency"):
                    extract_consistency(self.path, 195, 38)
            else:
                self.assertEqual(extract_consistency(self.path, 195, 38),
                                 (None, "swim_nodata") if value == -30 else (0.0, None))
        with rasterio.open(self.path, "r+") as raster:
            raster.crs = "EPSG:3857"
        with self.assertRaisesRegex(ValueError, "Mars"):
            extract_consistency(self.path, 195, 38)


if __name__ == "__main__":
    unittest.main()
