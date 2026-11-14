from __future__ import annotations

import math
import tempfile
import unittest
from pathlib import Path

import numpy as np
import rasterio
from rasterio.transform import from_origin

from mars_pipeline.coordinates import (
    MOLA_EQUIRECTANGULAR_CRS,
    mars_lonlat_to_crs,
)
from mars_pipeline.mola import MOLA_NODATA, elevation_and_slope
from mars_pipeline.swim import extract_consistency


class CoordinateTransformTests(unittest.TestCase):
    def test_mola_equirectangular_transform_uses_planetocentric_east_longitude(self):
        x, y = mars_lonlat_to_crs(195.0, 38.0, MOLA_EQUIRECTANGULAR_CRS)
        expected_x = 3_396_000 * math.radians(15)
        expected_y = 3_396_000 * math.radians(38)
        self.assertAlmostEqual(x, expected_x, places=5)
        self.assertAlmostEqual(y, expected_y, places=5)

    def test_longitude_and_latitude_out_of_range_are_rejected(self):
        with self.assertRaises(ValueError):
            mars_lonlat_to_crs(361, 0, MOLA_EQUIRECTANGULAR_CRS)
        with self.assertRaises(ValueError):
            mars_lonlat_to_crs(180, -91, MOLA_EQUIRECTANGULAR_CRS)


class RasterExtractionTests(unittest.TestCase):
    def test_mola_reads_elevation_and_calculates_local_slope(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "mola.tif"
            count_path = Path(directory) / "counts.tif"
            rows, cols = np.mgrid[0:5, 0:5]
            values = (100 + 2 * rows + 3 * cols).astype(np.int16)
            with rasterio.open(
                path,
                "w",
                driver="GTiff",
                width=5,
                height=5,
                count=1,
                dtype="int16",
                crs=MOLA_EQUIRECTANGULAR_CRS,
                transform=from_origin(-2.5, 2.5, 1, 1),
                nodata=MOLA_NODATA,
            ) as dataset:
                dataset.write(values, 1)
            with rasterio.open(
                count_path,
                "w",
                driver="GTiff",
                width=5,
                height=5,
                count=1,
                dtype="uint8",
                crs=MOLA_EQUIRECTANGULAR_CRS,
                transform=from_origin(-2.5, 2.5, 1, 1),
            ) as dataset:
                dataset.write(np.ones((5, 5), dtype=np.uint8), 1)

            with rasterio.open(path) as dataset, rasterio.open(count_path) as counts:
                elevation, slope, count, reason, basis = elevation_and_slope(
                    dataset, 180, 0, counts
                )

            self.assertEqual(elevation, 110.0)
            self.assertEqual(count, 1)
            self.assertIsNone(reason)
            self.assertEqual(basis, "all_3x3_cells_have_direct_observations")
            self.assertAlmostEqual(
                slope,
                math.degrees(math.atan(math.hypot(3, 2))),
                places=6,
            )

    def test_mola_slope_uses_ground_distance_at_site_latitude(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "mola-latitude.tif"
            count_path = Path(directory) / "counts-latitude.tif"
            x, y = mars_lonlat_to_crs(195, 38, MOLA_EQUIRECTANGULAR_CRS)
            transform = from_origin(x - 2.5, y + 2.5, 1, 1)
            rows, cols = np.mgrid[0:5, 0:5]
            values = (100 + 2 * rows + 3 * cols).astype(np.int16)
            with rasterio.open(
                path,
                "w",
                driver="GTiff",
                width=5,
                height=5,
                count=1,
                dtype="int16",
                crs=MOLA_EQUIRECTANGULAR_CRS,
                transform=transform,
            ) as dataset:
                dataset.write(values, 1)
            with rasterio.open(
                count_path,
                "w",
                driver="GTiff",
                width=5,
                height=5,
                count=1,
                dtype="uint8",
                crs=MOLA_EQUIRECTANGULAR_CRS,
                transform=transform,
            ) as dataset:
                dataset.write(np.ones((5, 5), dtype=np.uint8), 1)

            with rasterio.open(path) as dataset, rasterio.open(count_path) as counts:
                _, slope, _, reason, _ = elevation_and_slope(
                    dataset, 195, 38, counts
                )

            expected = math.degrees(
                math.atan(math.hypot(3 / math.cos(math.radians(38)), 2))
            )
            self.assertIsNone(reason)
            self.assertAlmostEqual(slope, expected, places=6)

    def test_mola_nodata_is_never_exported_as_elevation_or_slope(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "mola-nodata.tif"
            count_path = Path(directory) / "counts-nodata.tif"
            values = np.full((5, 5), 250, dtype=np.int16)
            values[2, 2] = MOLA_NODATA
            with rasterio.open(
                path,
                "w",
                driver="GTiff",
                width=5,
                height=5,
                count=1,
                dtype="int16",
                crs=MOLA_EQUIRECTANGULAR_CRS,
                transform=from_origin(-2.5, 2.5, 1, 1),
                nodata=MOLA_NODATA,
            ) as dataset:
                dataset.write(values, 1)
            counts = np.ones((5, 5), dtype=np.uint8)
            counts[2, 2] = 0
            with rasterio.open(
                count_path,
                "w",
                driver="GTiff",
                width=5,
                height=5,
                count=1,
                dtype="uint8",
                crs=MOLA_EQUIRECTANGULAR_CRS,
                transform=from_origin(-2.5, 2.5, 1, 1),
            ) as dataset:
                dataset.write(counts, 1)

            with rasterio.open(path) as dataset, rasterio.open(count_path) as count_dataset:
                elevation, slope, count, reason, basis = elevation_and_slope(
                    dataset, 180, 0, count_dataset
                )

            self.assertIsNone(elevation)
            self.assertIsNone(slope)
            self.assertEqual(count, 0)
            self.assertEqual(reason, "zero_value_without_mola_observations")

    def test_zero_elevation_with_mola_observations_is_valid(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "mola-zero.tif"
            count_path = Path(directory) / "counts-zero.tif"
            values = np.full((5, 5), 100, dtype=np.int16)
            values[2, 2] = 0
            counts = np.ones((5, 5), dtype=np.uint8)
            for raster_path, array, dtype in (
                (path, values, "int16"),
                (count_path, counts, "uint8"),
            ):
                with rasterio.open(
                    raster_path,
                    "w",
                    driver="GTiff",
                    width=5,
                    height=5,
                    count=1,
                    dtype=dtype,
                    crs=MOLA_EQUIRECTANGULAR_CRS,
                    transform=from_origin(-2.5, 2.5, 1, 1),
                ) as dataset:
                    dataset.write(array, 1)

            with rasterio.open(path) as dataset, rasterio.open(count_path) as count_dataset:
                elevation, slope, count, reason, _ = elevation_and_slope(
                    dataset, 180, 0, count_dataset
                )

            self.assertEqual(elevation, 0.0)
            self.assertIsNotNone(slope)
            self.assertEqual(count, 1)
            self.assertIsNone(reason)

    def test_swim_reads_georeferenced_consistency_and_honors_minus_30_nodata(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "swim.tif"
            x, y = mars_lonlat_to_crs(195, 38, MOLA_EQUIRECTANGULAR_CRS)
            transform = from_origin(x - 1500, y + 1500, 3000, 3000)
            values = np.array([[0.4]], dtype=np.float32)
            with rasterio.open(
                path,
                "w",
                driver="GTiff",
                width=1,
                height=1,
                count=1,
                dtype="float32",
                crs=MOLA_EQUIRECTANGULAR_CRS,
                transform=transform,
                nodata=-30,
            ) as dataset:
                dataset.write(values, 1)

            value, reason = extract_consistency(path, 195, 38)
            self.assertAlmostEqual(value, 0.4, places=6)
            self.assertIsNone(reason)

            with rasterio.open(path, "r+") as dataset:
                dataset.write(np.array([[-30]], dtype=np.float32), 1)
            self.assertEqual(extract_consistency(path, 195, 38), (None, "swim_nodata"))


if __name__ == "__main__":
    unittest.main()
