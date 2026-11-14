import type { CandidateSite } from "../contracts/site.js";

const placeholderFactor = {
  status: "not-assessed" as const,
  value: null,
  unit: null,
  summary: "No scientific assessment is available in this Phase 1 fixture."
};

export const sites: Record<string, CandidateSite> = {
  "placeholder-site-001": {
    id: "placeholder-site-001",
    name: "Placeholder Candidate Site",
    dataStatus: "placeholder",
    location: {
      type: "Point",
      coordinates: [0, 0]
    },
    environmentalFactors: {
      water: placeholderFactor,
      terrain: placeholderFactor,
      solar: placeholderFactor,
      thermal: placeholderFactor,
      radiation: placeholderFactor
    },
    suitability: {
      status: "not-assessed",
      score: null,
      summary: "Suitability has not been calculated. This is fixture data only."
    },
    confidence: {
      status: "not-assessed",
      level: null,
      summary: "Confidence has not been calculated. This is fixture data only."
    },
    sources: [
      {
        label: "NASA source placeholder",
        status: "placeholder",
        url: null
      }
    ],
    route: {
      status: "placeholder",
      summary: "Illustrative only; no route was planned or validated.",
      waypoints: [
        { label: "Start placeholder", coordinates: [0, 0] },
        { label: "Candidate placeholder", coordinates: [0, 0] }
      ]
    }
  }
};
