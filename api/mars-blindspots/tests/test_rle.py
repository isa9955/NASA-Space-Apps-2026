"""The active zone-outline consumer must decode the grid producer's masks exactly."""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from grid_mode import rle_encode
from backend.zones_to_geojson import decode_rle


def test_mask_codec_preserves_empty_uniform_and_mixed_masks():
    for mask in (np.zeros((0, 0), bool), np.zeros((3, 4), bool),
                 np.ones((3, 4), bool), np.array([[0, 1, 1], [0, 0, 1]], bool)):
        decoded = decode_rle(rle_encode(mask), mask.size).reshape(mask.shape)
        np.testing.assert_array_equal(decoded, mask)
