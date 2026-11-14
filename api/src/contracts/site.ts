export type AssessmentStatus = "placeholder" | "not-assessed" | "assessed";

export interface EnvironmentalFactor {
  status: AssessmentStatus;
  value: number | null;
  unit: string | null;
  summary: string;
}

export interface CandidateSite {
  id: string;
  name: string;
  dataStatus: "placeholder";
  location: {
    type: "Point";
    /** GeoJSON order: [longitude, latitude]. */
    coordinates: [number, number];
  };
  environmentalFactors: {
    water: EnvironmentalFactor;
    terrain: EnvironmentalFactor;
    solar: EnvironmentalFactor;
    thermal: EnvironmentalFactor;
    radiation: EnvironmentalFactor;
  };
  suitability: {
    status: AssessmentStatus;
    score: number | null;
    summary: string;
  };
  confidence: {
    status: AssessmentStatus;
    level: "low" | "medium" | "high" | null;
    summary: string;
  };
  sources: Array<{
    label: string;
    status: "placeholder" | "available";
    url: string | null;
  }>;
  route: {
    status: "placeholder" | "provisional" | "unavailable";
    summary: string;
    waypoints: Array<{
      label: string;
      coordinates: [number, number];
    }>;
  };
}

export interface SiteResponse {
  site: CandidateSite;
}

export interface ErrorResponse {
  error: {
    code: "SITE_NOT_FOUND";
    message: string;
  };
}
