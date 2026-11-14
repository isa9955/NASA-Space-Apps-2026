import { distance, point } from "@turf/turf";
import type { BBox, LonLat } from "../api/schema";

/** IAU 2000 Mars sphere. Turf assumes Earth, so always convert via radians. */
export const MARS_RADIUS_KM = 3389.5;
export const KM_PER_DEG = (2 * Math.PI * MARS_RADIUS_KM) / 360;

export function marsDistanceKm(a: LonLat, b: LonLat): number {
  return distance(point(a), point(b), { units: "radians" }) * MARS_RADIUS_KM;
}

export function inBounds([lon, lat]: LonLat, [w, s, e, n]: BBox): boolean {
  return lon >= w && lon <= e && lat >= s && lat <= n;
}

/** Leaflet wants [[south, west], [north, east]] as [lat, lng]. */
export function toLeafletBounds([w, s, e, n]: BBox): [[number, number], [number, number]] {
  return [
    [s, w],
    [n, e]
  ];
}
