import type { CandidateSite } from "./site.js";
import type { RouteFeature } from "./route.js";

export interface StartsResponse {
  schemaVersion: "2.0.0";
  starts: {
    id: string;
    name: string;
    location: CandidateSite["location"];
    validationScope: string;
    destinations: {
      siteId: string;
      status: RouteFeature["properties"]["status"];
    }[];
  }[];
}
export interface MissionContext {
  schemaVersion: "mission-context/1.1.0";
  mission: string;
  instrument: string;
  productId: string;
  dataSetId: string;
  productVersion: string;
  sourceUrl: string;
  discoveryUrl: string;
  sourceSha256: string;
  observationStartUtc: string;
  centerCoordinates: [number, number];
  sampleResolutionMeters: number;
  lineResolutionMeters: number;
  band: number;
  bandCenterMicrometers: number;
  labelBrightnessTemperatureRange: {
    minimum: number;
    maximum: number;
    unit: "K";
    scope: string;
  };
  catalogUrl: string;
  unitsReference: string;
  footprint: {
    sourceUrl: string;
    sourceSha256: string;
    coordinateReference: {
      body: "Mars";
      latitudeType: "planetocentric";
      longitudeDirection: "positive east";
      longitudeRange: string;
      datum: string;
    };
    geometry: { type: "Polygon"; coordinates: [number, number][][] };
    coverageScope: string;
    siteCoverage: { siteId: string; insideApproximateFootprint: boolean }[];
  };
  limitations: string[];
}
