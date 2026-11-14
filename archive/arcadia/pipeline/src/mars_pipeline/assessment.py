"""Offline, evidence-limited screening. No ingestion or safety certification."""
from __future__ import annotations

import math
from copy import deepcopy


def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def validate_model(model):
    weights = model["weights"]
    if set(weights) != {"terrain", "water"} or any(
        not finite(w) or w <= 0 for w in weights.values()
    ) or not math.isclose(sum(weights.values()), 1):
        raise ValueError("Terrain and water weights must be positive and sum to 1")
    if not finite(model["terrainZeroScoreSlopeDeg"]) or not 0 < model["terrainZeroScoreSlopeDeg"] <= 90:
        raise ValueError("Slope normalization limit must be in (0, 90]")
    rules = model["confidence"]
    if not all(finite(v) and v > 0 for v in rules.values()):
        raise ValueError("Confidence thresholds must be positive finite numbers")
    if rules["highResolutionMaximumMeters"] > rules["mediumResolutionMaximumMeters"]:
        raise ValueError("High confidence resolution must be finer than Medium")
    if not model["version"] or not model["confidenceVersion"]:
        raise ValueError("Model versions are required")


def supported(observation, sources, unit, statuses, low, high):
    source = sources.get(observation.get("sourceId"), {})
    return (
        finite(observation.get("value"))
        and low <= observation["value"] <= high
        and observation.get("unit") == unit
        and observation.get("status") in statuses
        and source.get("availability") == "available"
        and bool(source.get("productUrl") and source.get("productId"))
        and bool(source.get("regionalRasterSha256") or source.get("inputSha256"))
    )


def terrain_confidence(observations, sources, usable, model):
    slope = observations.get("molaRegionalSlope", {})
    count = observations.get("molaObservationCount", {})
    source = sources.get(slope.get("sourceId"), {})
    count_source = sources.get(count.get("sourceId"), {})
    resolution = source.get("pixelSizeMeters")
    count_valid = supported(count, sources, "observations per 128 ppd cell", {"observed"}, 0, 255)
    reasons = ["Confidence describes support for regional terrain evidence only."]
    if not usable:
        return {"level": "unknown", "rationale": reasons + ["No usable slope observation with units and raster provenance."]}
    if not finite(resolution) or resolution <= 0 or not count_valid:
        return {"level": "unknown", "rationale": reasons + ["Resolution or companion observation-count provenance is missing."]}
    direct = slope.get("dataBasis") == "all_3x3_cells_have_direct_observations"
    reasons += [f"Projected pixel size: {resolution:g} m; center-cell count: {count['value']:g}.",
                f"Neighborhood basis: {slope.get('dataBasis', 'unknown')}.",
                "Product and count raster references and hashes are recorded.",
                f"Source observation period: {source.get('observationsPeriod', 'unknown')}; current surface conditions are unverified.",
                "Measurement uncertainty, fine-scale hazards and independent local validation are unavailable."]
    rules = model["confidence"]
    if direct and count["value"] >= rules["highCountMinimum"] and resolution <= rules["highResolutionMaximumMeters"]:
        level = "high"
    elif direct and count["value"] > 0 and resolution <= rules["mediumResolutionMaximumMeters"]:
        level = "medium"
    else:
        level = "low"
    return {"level": level, "rationale": reasons, "pixelSizeMeters": resolution,
            "observationCount": count["value"], "countsSourceId": count_source["id"]}


def assess_site(site, sources, model):
    observations = site["observations"]
    slope = observations.get("molaRegionalSlope", {})
    water = observations.get("swimCombinedIceConsistency", {})
    terrain_ok = supported(slope, sources, "degree", {"derived", "derived_from_interpolated_cells"}, 0, 90)
    water_ok = supported(water, sources, "1 (dimensionless index)", {"derived"}, -1, 1)
    # A zero SWIM index conflates inconclusive and absent evidence; never award a neutral score.
    water_ok = water_ok and water["value"] != 0
    terrain_score = max(0, 100 * (1 - slope["value"] / model["terrainZeroScoreSlopeDeg"])) if terrain_ok else None
    water_score = 50 * (water["value"] + 1) if water_ok else None
    factors = {}
    for key, observation, score, explanation in (
        ("terrain", slope, terrain_score, "Regional slope screen: 100 * max(0, 1 - slope / configured limit)."),
        ("water", water, water_score, "Nonzero SWIM consistency mapped from [-1, 1] to [0, 100]; no abundance or accessibility inference."),
    ):
        factors[key] = {"status": "assessed" if score is not None else "insufficient-evidence",
                        "score": score, "weight": model["weights"][key],
                        "weightedContribution": score * model["weights"][key] if score is not None else None,
                        "observation": deepcopy(observation), "explanation": explanation}
    complete = all(f["score"] is not None for f in factors.values())
    terrain_evidence = terrain_confidence(observations, sources, terrain_ok, model)
    water_evidence = {"level": "low" if water_ok else "unknown", "rationale": [
        "SWIM composite alone lacks constituent quality/coverage and local validation; confidence capped at Low."
        if water_ok else "SWIM is missing, invalid, or zero/inconclusive; water evidence support is Unknown."]}
    levels = [terrain_evidence["level"], water_evidence["level"]]
    rank = {"unknown": 0, "low": 1, "medium": 2, "high": 3}
    overall_level = min(levels, key=rank.get)
    warnings = ["IMPORTANT: Sampling points are not ranked habitat recommendations.",
                "IMPORTANT: Regional slope cannot resolve rocks, small craters, soil bearing capacity or construction hazards.",
                "BLOCKER: Radiation risk and shielding requirements are unresolved; no site is certified safe."]
    missing = [key for key, factor in factors.items() if factor["score"] is None]
    return {
        "id": site["id"], "name": site["name"], "location": deepcopy(site["location"]),
        "dataStatus": "nasa-derived-partial-assessment",
        "observations": deepcopy(observations),
        "suitability": {"status": "partial" if any(f["score"] is not None for f in factors.values()) else "not-assessed",
                        "overallStatus": "unknown", "score": None, "scale": "0-100",
                        "algorithmVersion": model["version"], "factors": factors,
                        "modelStatus": "complete" if complete else "incomplete",
                        "modelScore": sum(f["weightedContribution"] for f in factors.values()) if complete else None,
                        "availableWeight": sum(f["weight"] for f in factors.values() if f["score"] is not None),
                        "explanation": ["Missing weights are never redistributed. A factor score is not an overall suitability score.",
                                        "Even a complete terrain/water screening model excludes critical safety and environmental domains."]},
        "evidenceConfidence": {"status": "insufficient-evidence" if overall_level == "unknown" else "assessed",
                               "level": overall_level, "probability": None,
                               "algorithmVersion": model["confidenceVersion"],
                               "coverage": {"supportedFactors": [key for key, factor in factors.items() if factor["score"] is not None],
                                            "requiredFactors": ["terrain", "water"], "missingFactors": missing},
                               "factors": {"terrain": terrain_evidence, "water": water_evidence},
                               "rationale": ["Overall evidence support is the weakest required factor; independent of factor scores."]},
        "radiationReview": {"status": "insufficient-evidence", "risk": "unknown",
                            "shieldingRequirements": "unresolved", "dose": None, "observationIds": [],
                            "summary": "No site-specific radiation or shielding evidence exists in the Phase 2 input; specialist review required."},
        "strengths": ([f"Regional slope measured as {slope['value']:.4f} degrees supports an explicit terrain screen."] if terrain_ok else []),
        "limitations": ["Screening thresholds and weights are project assumptions, not NASA habitat standards.",
                        "Orbital grid evidence does not resolve habitat-scale conditions or seasonal resource access."],
        "missingInformation": missing + ["solar", "thermal", "radiation", "shielding", "geotechnical properties", "local validation"],
        "humanReviewWarnings": warnings, "sources": list(deepcopy(sources).values()),
    }


def assess_document(inputs, model):
    validate_model(model)
    if inputs.get("schemaVersion") != "phase2-site-inputs/1.0.0":
        raise ValueError("Unsupported input schema version")
    sources = {source["id"]: source for source in inputs["sources"].values()}
    return {"schemaVersion": "phase3-site-assessments/1.0.0", "scoringVersion": model["version"],
            "model": deepcopy(model), "region": deepcopy(inputs["region"]),
            "sources": list(deepcopy(sources).values()),
            "sites": [assess_site(site, sources, model) for site in inputs["sites"]]}
