"""Essential spatial checks; no raw NASA downloads are required for tests."""
import json
from pathlib import Path
import unittest

from build_mission_context import footprint_ring, inside_footprint

ROOT = Path(__file__).resolve().parents[1]


class MissionContextChecks(unittest.TestCase):
    def test_kml_longitude_conversion_and_display_altitude_removal(self):
        # Small parser fixture, never exported as scientific data.
        kml = b'''<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
        <description>I03114002BTR MARS Planetocentric</description>
        <LinearRing><coordinates>-166,37,100 -165,37,100 -165,39,100 -166,37,100</coordinates></LinearRing>
        </Document></kml>'''
        ring = footprint_ring(kml)
        self.assertEqual(ring[0], [194, 37])
        self.assertEqual(ring[1], [195, 37])
        self.assertTrue(inside_footprint([194.8, 37.5], ring))
        self.assertFalse(inside_footprint([193, 38], ring))
        with self.assertRaises(ValueError):
            footprint_ring(kml.replace(b"Planetocentric", b"Planetographic"))

    def test_archived_footprint_alignment_with_all_actual_sites(self):
        context = json.loads((ROOT / "mission_context.json").read_text())
        sites = json.loads((ROOT / "site_assessments.json").read_text())
        footprint = context["footprint"]
        self.assertEqual(footprint["coordinateReference"], sites["region"]["coordinateReference"])
        ring = footprint["geometry"]["coordinates"][0]
        self.assertEqual(ring[0], ring[-1])
        self.assertEqual(ring[0], [193.586, 33.706])
        self.assertEqual({item["siteId"] for item in footprint["siteCoverage"]}, {site["id"] for site in sites["sites"]})
        for site, coverage in zip(sites["sites"], footprint["siteCoverage"]):
            self.assertEqual(site["id"], coverage["siteId"])
            self.assertTrue(inside_footprint(site["location"]["coordinates"], ring))
            self.assertTrue(coverage["insideApproximateFootprint"])
            self.assertIsNone(site["suitability"]["score"])
            self.assertEqual(site["evidenceConfidence"]["level"], "unknown")


if __name__ == "__main__":
    unittest.main()
