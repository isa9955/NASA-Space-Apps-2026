import type { CandidateSite, Source } from "./site.js";

export interface RouteFeature {
  type: "Feature";
  geometry: { type: "LineString"; coordinates: [number, number][] } | null;
  properties: {
    id: string;
    startId: string;
    siteId: string;
    status: "provisional" | "unavailable";
    unavailableReason: string | null;
    distanceMeters: number | null;
    elevationGainMeters: number | null;
    maximumSlopeDegrees: number | null;
    meanRegionalSlopeDegrees: number | null;
    evidenceCoverage: {
      pathCellCount: number; directCellCount: number; interpolatedCellCount: number;
      interpolatedDistanceMeters: number; interpolatedDistanceFraction: number;
      meanNeighborhoodInterpolationFraction: number;
    } | null;
    requestedStart: [number, number];
    requestedDestination: [number, number];
    warnings: string[];
    sources: Source[];
    endpointCells: Record<"start" | "destination", { coordinates: [number, number] | null; offsetMeters: number | null }>;
  };
}
export interface RouteArtifact {
  type: "FeatureCollection";
  schemaVersion: "phase5-routes/1.1.0";
  planningVersion: string;
  configuration: { version: string; startId: string; maximumSlopeDegrees: number; slopePenalty: number; minimumNeighborhoodCount: number; allowProductInterpolation: boolean; interpolationPenalty: number };
  coordinateReference: CandidateSite["location"]["coordinateReference"];
  inputProvenance: { assessmentSha256: string; topographyRasterSha256: string; countsRasterSha256: string };
  starts: { id: string; location: CandidateSite["location"] }[];
  coverage: { boundsDegrees: Record<"west" | "east" | "south" | "north", number>; gridCellCount: number; supportedCellCount: number; directCellCount: number; interpolatedCellCount: number; invalidElevationCellCount: number };
  features: RouteFeature[];
}
export interface RouteResponse {
  schemaVersion: "2.0.0";
  routeSchemaVersion: RouteArtifact["schemaVersion"];
  planningVersion: string;
  coordinateReference: RouteArtifact["coordinateReference"];
  inputProvenance: RouteArtifact["inputProvenance"];
  route: RouteFeature;
}
