"""Assess the existing Phase 2 artifact without network access."""
import argparse
import hashlib
import json
from pathlib import Path

from mars_pipeline.assessment import assess_document

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=ROOT / "site_inputs.json")
    parser.add_argument("--config", type=Path, default=ROOT / "config/assessment_model.json")
    parser.add_argument("--output", type=Path, default=ROOT / "site_assessments.json")
    args = parser.parse_args()
    data = args.input.read_bytes()
    result = assess_document(json.loads(data), json.loads(args.config.read_text(encoding="utf-8")))
    result["inputProvenance"] = {"file": args.input.name, "sha256": hashlib.sha256(data).hexdigest()}
    args.output.write_text(json.dumps(result, indent=2, allow_nan=False) + "\n", encoding="utf-8", newline="\n")
    print(f"Exported {len(result['sites'])} assessments to {args.output}")


if __name__ == "__main__":
    main()
