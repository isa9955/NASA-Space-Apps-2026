export const API_SCHEMA_VERSION = "2.0.0" as const;
export type ConfidenceLevel = "high" | "medium" | "low" | "unknown";
export interface Observation {
  value: number | null;
  unit: string | null;
  status: string;
  sourceId: string;
  unavailableReason?: string;
  method?: string;
  dataBasis?: string | null;
}
export interface Source {
  id: string;
  provider: string;
  productId: string;
  productUrl: string;
  availability: "available" | "not-retrieved";
  [key: string]: unknown;
}
export interface Factor {
  status: "assessed" | "insufficient-evidence";
  score: number | null;
  weight: number;
  weightedContribution: number | null;
  observation: Observation;
  explanation: string;
}
export interface Evidence {
  level: ConfidenceLevel;
  rationale: string[];
  pixelSizeMeters?: number;
  observationCount?: number;
  countsSourceId?: string;
}
export interface CandidateSite {
  id: string;
  name: string;
  dataStatus: "nasa-derived-partial-assessment";
  location: {
    type: "Point";
    coordinates: [number, number];
    coordinateReference: {
      body: "Mars";
      latitudeType: "planetocentric";
      longitudeDirection: "positive east";
      longitudeRange: string;
      datum: string;
    };
  };
  observations: Record<string, Observation>;
  suitability: {
    status: "partial" | "not-assessed";
    overallStatus: "unknown";
    score: null;
    scale: "0-100";
    algorithmVersion: string;
    factors: { terrain: Factor; water: Factor };
    modelStatus: "complete" | "incomplete";
    modelScore: number | null;
    availableWeight: number;
    explanation: string[];
  };
  evidenceConfidence: {
    status: "insufficient-evidence" | "assessed";
    level: ConfidenceLevel;
    probability: null;
    algorithmVersion: string;
    coverage: { supportedFactors: string[]; requiredFactors: string[]; missingFactors: string[] };
    factors: { terrain: Evidence; water: Evidence };
    rationale: string[];
  };
  radiationReview: {
    status: "insufficient-evidence";
    risk: "unknown";
    shieldingRequirements: "unresolved";
    dose: null;
    observationIds: string[];
    summary: string;
  };
  strengths: string[];
  limitations: string[];
  missingInformation: string[];
  humanReviewWarnings: string[];
  sources: Source[];
}
export type SiteSummary = Omit<CandidateSite, "observations" | "sources" | "strengths">;
export interface AssessmentArtifact {
  schemaVersion: "phase3-site-assessments/1.0.0";
  scoringVersion: string;
  inputProvenance: { file: string; sha256: string };
  model: Record<string, unknown>;
  region: Record<string, unknown>;
  sources: Source[];
  sites: CandidateSite[];
}
export interface ResponseMetadata {
  schemaVersion: typeof API_SCHEMA_VERSION;
  assessmentSchemaVersion: AssessmentArtifact["schemaVersion"];
  scoringVersion: string;
  inputProvenance: AssessmentArtifact["inputProvenance"];
}
export interface SiteResponse extends ResponseMetadata { site: CandidateSite }
export interface SitesResponse extends ResponseMetadata { sites: SiteSummary[] }
export interface ErrorResponse {
  schemaVersion: typeof API_SCHEMA_VERSION;
  error: {
    code: "INVALID_ARGUMENT" | "SITE_NOT_FOUND" | "ASSESSMENTS_UNAVAILABLE";
    message: string;
  };
}
