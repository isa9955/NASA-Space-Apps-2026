"""Checks for crop-window selection and projected→lat/lon conversion."""
import os
import sys

import pytest

rasterio = pytest.importorskip('rasterio')
from rasterio.coords import BoundingBox
from rasterio.crs import CRS

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from process_terrain import crop_bounds, crop_window, projected_bounds_to_latlon  # noqa: E402

DEUT_CRS = CRS.from_proj4('+proj=eqc +lat_ts=40 +lat_0=0 +lon_0=30.18 +x_0=0 +y_0=0 '
                          '+R=3387887.658234 +units=m +no_defs')
DEUT_BOUNDS = BoundingBox(-3307.722427321872, 2401917.366075178, 3709.4173677686836, 2415821.420372945)
DEUT_SHAPE = (13880, 7005)


def test_center_default():
    assert crop_window((100, 80), 20) == (40, 60, 30, 50)


def test_window_shifted_inside_image():
    assert crop_window((100, 80), 20, center=(2, 79)) == (0, 20, 60, 80)


def test_crop_bounds_row0_is_north():
    b = BoundingBox(0, 0, 80, 100)  # 1 m pixels
    top = crop_bounds(b, (100, 80), (0, 10, 0, 10))
    assert (top.bottom, top.top) == (90, 100)
    bottom = crop_bounds(b, (100, 80), (90, 100, 70, 80))
    assert (bottom.left, bottom.bottom, bottom.right, bottom.top) == (70, 0, 80, 10)


def test_deuteronilus_latlon_uses_crs_radius():
    s, n, w, e = projected_bounds_to_latlon(DEUT_BOUNDS, DEUT_CRS)
    # HiRISE lists this DTM at 40.74°N, 30.18°E
    assert abs((s + n) / 2 - 40.74) < 0.01
    assert abs((w + e) / 2 - 30.18) < 0.01
    assert s < n and w < e


def test_crop_latlon_inside_full():
    full = projected_bounds_to_latlon(DEUT_BOUNDS, DEUT_CRS)
    win = crop_window(DEUT_SHAPE, 2000, center=(3000, 3500))
    sub = projected_bounds_to_latlon(crop_bounds(DEUT_BOUNDS, DEUT_SHAPE, win), DEUT_CRS)
    assert full[0] < sub[0] < sub[1] < full[1]
    assert full[2] < sub[2] < sub[3] < full[3]
    # row 3000 of 13880 is in the northern part of the strip
    assert sub[0] > (full[0] + full[1]) / 2
