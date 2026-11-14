"""Essential screening checks; synthetic mutations never enter exported science data."""
import json
import unittest
from copy import deepcopy
from pathlib import Path

from mars_pipeline.assessment import assess_document

ROOT = Path(__file__).resolve().parents[1]


class AssessmentChecks(unittest.TestCase):
    def setUp(self):
        self.inputs = json.loads((ROOT / "site_inputs.json").read_text())
        self.model = json.loads((ROOT / "config/assessment_model.json").read_text())

    def test_actual_samples_remain_partial_and_preserve_weights(self):
        result = assess_document(self.inputs, self.model)
        self.assertEqual(len(result["sites"]), 3)
        for site, original in zip(result["sites"], self.inputs["sites"]):
            self.assertEqual(site["location"], original["location"])
            suitability = site["suitability"]
            self.assertIsNone(suitability["score"])
            self.assertIsNone(suitability["modelScore"])
            self.assertEqual(suitability["availableWeight"], 0.5)
            self.assertAlmostEqual(suitability["factors"]["terrain"]["score"],
                                   100 - 10 * original["observations"]["molaRegionalSlope"]["value"])
            self.assertEqual(site["evidenceConfidence"]["factors"]["terrain"]["level"], "medium")
            self.assertEqual(site["evidenceConfidence"]["level"], "unknown")
            self.assertEqual(site["radiationReview"]["risk"], "unknown")

    def test_scoring_boundaries_and_future_swim_support(self):
        for value, expected in [(-1, 0), (0, None), (1, 100), (-30, None)]:
            inputs = deepcopy(self.inputs)
            inputs["sources"]["swim"].update(availability="available", inputSha256="synthetic-test-only")
            inputs["sites"][0]["observations"]["swimCombinedIceConsistency"].update(
                value=value, unit="1 (dimensionless index)", status="derived")
            site = assess_document(inputs, self.model)["sites"][0]
            self.assertEqual(site["suitability"]["factors"]["water"]["score"], expected)
            self.assertIsNone(site["suitability"]["score"])
        for value, expected in [(0, 100), (10, 0), (20, 0), (float("nan"), None)]:
            inputs = deepcopy(self.inputs)
            inputs["sites"][0]["observations"]["molaRegionalSlope"]["value"] = value
            site = assess_document(inputs, self.model)["sites"][0]
            self.assertEqual(site["suitability"]["factors"]["terrain"]["score"], expected)

    def test_confidence_independent_of_suitability_and_sensitive_to_quality(self):
        baseline = assess_document(self.inputs, self.model)["sites"][0]
        inputs = deepcopy(self.inputs)
        inputs["sites"][0]["observations"]["molaRegionalSlope"]["value"] = 20
        changed = assess_document(inputs, self.model)["sites"][0]
        self.assertEqual(baseline["evidenceConfidence"], changed["evidenceConfidence"])
        inputs["sites"][0]["observations"]["molaRegionalSlope"]["dataBasis"] = "contains_cells_without_direct_observations"
        changed = assess_document(inputs, self.model)["sites"][0]
        self.assertEqual(changed["evidenceConfidence"]["factors"]["terrain"]["level"], "low")
        inputs["sources"]["mola"]["availability"] = "not-retrieved"
        changed = assess_document(inputs, self.model)["sites"][0]
        self.assertIsNone(changed["suitability"]["factors"]["terrain"]["score"])
        self.assertEqual(changed["evidenceConfidence"]["factors"]["terrain"]["level"], "unknown")

    def test_invalid_model_is_rejected(self):
        self.model["weights"]["terrain"] = 1
        with self.assertRaises(ValueError):
            assess_document(self.inputs, self.model)


if __name__ == "__main__":
    unittest.main()
