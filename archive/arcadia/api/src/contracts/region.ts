export interface RegionalRoute {
  type: "Feature";
  geometry: { type: "LineString"; coordinates: [number, number][] } | null;
  properties: {
    mode: "standard" | "uncertainty-aware";
    status: "provisional" | "unavailable";
    startCell: [number, number];
    endCell: [number, number];
    cells: [number, number][];
    metrics: {
      distance_m: number; time_min: number; uncertain_pct: number;
      worst_min: number; worst_mean: number; mean_gap: number;
    } | null;
  };
}

export interface RegionalSourceVerification {
  sourceUrl: string; productId: string; datasetId: string; credit: string;
  valueUnit: string; pixelEncoding: string; latitudeType: "planetocentric";
  longitudeDirection: "positive east"; missingConstantHex: string;
  rawSha256Status: string; reportedRawSha256: string; verificationScope: string;
  crsWkt: string; transform: number[]; shape: [number, number]; nodata: number;
  pixelSizeMeters: [number, number]; sourceLabelPrefixSha256: string;
  processedGridSha256: string; processedMetadataSha256: string;
  samples: { cell: [number, number]; sourceByteRange: [number, number]; bytesSha256: string;
    rawBlockMeanElevationMeters: number; exportedRoundedElevationMeters: number }[];
}

/** Independent HiRISE analysis; never a CandidateSite or overall habitat score. */
export interface RegionalAnalysis {
  schemaVersion: "deuteronilus-analysis/1.0.0";
  regionId: "deuteronilus";
  routingVersion: "blindspots-astar-1.1.0";
  overallHabitability: "unknown";
  coordinateReference: {
    body: "Mars"; latitudeType: "planetocentric"; longitudeDirection: "positive east";
    longitudeRange: "0 to 360 degrees"; projectionRadiusMeters: number; crsWkt: string;
  };
  bounds: { west: number; east: number; south: number; north: number };
  grid: { rows: number; cols: number; cellMeters: number; rowZero: "north" };
  inputProvenance: {
    metadataSha256: string; gridSha256: string; zonesSha256: string;
    routingSha256: string; sourceAuditSha256: string;
  };
  sourceVerification: RegionalSourceVerification;
  assumptions: Record<string, unknown>;
  scales: Record<string, unknown>;
  routes: RegionalRoute[];
  scoutPoints: Record<string, unknown>[];
  scienceCandidates: Record<string, unknown>[];
  zoneSummaries: { id: string; label: string; nominalAreaSquareMeters: number; robustAreaSquareMeters: number; interpretation: string }[];
  warnings: string[];
}

export interface RegionResponse { schemaVersion: "2.0.0"; analysis: RegionalAnalysis }
