// THE data contract between the UI and the backend (TECHNICAL_SPEC.md §7).
// Every API response is validated against these schemas before the UI uses it.
// `npm run contracts` exports them as JSON Schema to /contracts for the
// Python API to validate against.
import { z } from "zod";

/** GeoJSON order: [longitude (east, -180..180), latitude (planetocentric)]. */
export const LonLat = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
/** [west, south, east, north] in degrees. */
export const BBox = z.tuple([z.number(), z.number(), z.number(), z.number()]);
/** "regional" = coarse orbital data; "estimated" = modeled. null = measured at this resolution. */
export const Qualifier = z.enum(["regional", "estimated"]).nullable();
const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);
/** Absolute URL, or a path on the same origin (e.g. "/api/assets/basemap.png"). */
const Url = z.string().min(1);

export const Source = z.object({
  id: z.string(),
  provider: z.string(),
  product: z.string(),
  version: z.string().nullable(),
  url: z.string().nullable()
});

// ---- GET /api/region -------------------------------------------------------

export const ZoneLayer = z.object({
  id: z.string(),
  label: z.string(),
  color: HexColor,
  /** Symbol shown for this use on the map, toggles, legend and conditions card. */
  icon: z.enum(["habitat", "landing", "ice", "greenhouse", "datacenter", "solar"]),
  defaultOn: z.boolean(),
  /** One-line rule shown as a tooltip, e.g. "Slope < 6°, within 1.2 km of ice". */
  rule: z.string(),
  /** Area passing the rule with nominal slope. */
  nominalKm2: z.number().nonnegative(),
  /** Area still passing with worst-case slope (slope + uncertainty). */
  robustKm2: z.number().nonnegative(),
  /** robust / nominal × 100. */
  survivesPct: z.number().min(0).max(100),
  /**
   * Grayscale PNG covering region.bounds exactly (row 0 = north).
   * Pixel value: 0 = fails, 1–127 = passes nominally but lost to blindspots,
   * 128–255 = robust. Must be same-origin or served with CORS.
   */
  mask: z.object({ url: Url, width: z.number().int().positive(), height: z.number().int().positive() })
});

export const RegionResponse = z.object({
  schemaVersion: z.string(),
  region: z.object({
    id: z.string(),
    name: z.string(),
    subtitle: z.string(),
    bounds: BBox,
    dataset: z.object({
      label: z.string(),
      sizeKm: z.tuple([z.number().positive(), z.number().positive()]),
      resolutionM: z.number().positive(),
      reliefM: z.number().nonnegative()
    })
  }),
  dataBadge: z.object({ label: z.string(), kind: z.enum(["real", "mock"]) }),
  /** Shaded-relief image covering region.bounds exactly (row 0 = north). */
  basemap: z.object({ url: Url }),
  layers: z.array(ZoneLayer).min(1),
  /** Suggested A/B for the "Try a demo traverse" button. */
  demoTraverse: z.object({ from: LonLat, to: LonLat }).nullable(),
  algorithmVersion: z.string(),
  sources: z.array(Source)
});

// ---- GET /api/conditions?lon=&lat= ----------------------------------------

const NumValue = z.object({
  value: z.number().nullable(),
  unit: z.string(),
  qualifier: Qualifier,
  /** ± margin used for the worst case (same unit), if known. */
  uncertainty: z.number().nonnegative().nullable().optional()
});

export const ConditionsResponse = z.object({
  schemaVersion: z.string(),
  location: LonLat,
  elevation: NumValue,
  slope: NumValue,
  soil: z.object({ value: z.enum(["bedrock", "mixed", "loose-sand"]).nullable(), qualifier: Qualifier }),
  /**
   * kind "consistency": legacy mock representation; never an ice probability.
   * The real API uses "distance": metres to a draft interpreted landform,
   * with 0 indicating polygon membership, not confirmed ice.
   */
  ice: z.object({
    kind: z.enum(["consistency", "distance"]),
    value: z.number().nonnegative().nullable(),
    unit: z.string(),
    qualifier: Qualifier
  }),
  radiation: NumValue,
  temperature: NumValue,
  sources: z.array(Source)
});

// ---- GET /api/route?from=lon,lat&to=lon,lat --------------------------------

export const RouteVariant = z.object({
  kind: z.enum(["standard", "safe"]),
  geometry: z.object({ type: z.literal("LineString"), coordinates: z.array(LonLat).min(2) }),
  distanceKm: z.number().nonnegative(),
  walkMin: z.number().nonnegative(),
  /** % of the path (cells along it) where traversability could drop by more than 50 points. */
  criticalBlindspotPct: z.number().min(0).max(100),
  /** Cell-mean modeled worst-case traversability along the path (0–100), not safety probability. */
  worstCaseTravPct: z.number().min(0).max(100)
});

export const ScoutPoint = z.object({
  /** 1 = first along the standard route. */
  rank: z.number().int().positive(),
  location: LonLat,
  /** Distance from the start along the standard route. */
  alongM: z.number().nonnegative(),
  /** Traversability drop from nominal to worst case, in points. */
  blindspotPts: z.number(),
  slopeDeg: z.number(),
  slopeUncDeg: z.number().nonnegative(),
  worstCaseTravPct: z.number().min(0).max(100)
});

export const ScienceTarget = z.object({ id: z.string(), location: LonLat, label: z.string() });

export const RouteResponse = z
  .object({
    schemaVersion: z.string(),
    status: z.enum(["ok", "unavailable"]),
    reason: z.string().optional(),
    from: LonLat,
    to: LonLat,
    computeMs: z.number().nonnegative(),
    standard: RouteVariant.nullable(),
    safe: RouteVariant.nullable(),
    scoutPoints: z.array(ScoutPoint),
    scienceTargets: z.array(ScienceTarget),
    algorithmVersion: z.string(),
    sources: z.array(Source)
  })
  .refine((r) => r.status !== "ok" || (r.standard !== null && r.safe !== null), {
    message: "status 'ok' requires both standard and safe routes"
  });

// ---- Errors (any endpoint, HTTP 4xx/5xx) ------------------------------------

export const ErrorResponse = z.object({
  error: z.object({ code: z.string(), message: z.string() })
});

export type LonLat = z.infer<typeof LonLat>;
export type BBox = z.infer<typeof BBox>;
export type Qualifier = z.infer<typeof Qualifier>;
export type ZoneLayer = z.infer<typeof ZoneLayer>;
export type RegionResponse = z.infer<typeof RegionResponse>;
export type ConditionsResponse = z.infer<typeof ConditionsResponse>;
export type RouteVariant = z.infer<typeof RouteVariant>;
export type ScoutPoint = z.infer<typeof ScoutPoint>;
export type ScienceTarget = z.infer<typeof ScienceTarget>;
export type RouteResponse = z.infer<typeof RouteResponse>;
