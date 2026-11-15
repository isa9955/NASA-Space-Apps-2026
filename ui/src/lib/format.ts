import type { LonLat, RouteVariant } from "../api/schema";

export function fmtLonLat([lon, lat]: LonLat): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(4)}°${ns}, ${Math.abs(lon).toFixed(4)}°${ew}`;
}

export function fmtNum(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return v.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

/** The one-line comparison under the two route cards. */
export function compareRoutes(standard: RouteVariant, safe: RouteVariant): string {
  const dM = Math.round((safe.distanceKm - standard.distanceKm) * 1000);
  const dPct = standard.distanceKm > 0 ? Math.round((100 * dM) / (standard.distanceKm * 1000)) : 0;
  const length =
    Math.abs(dM) < 10
      ? "The uncertainty-aware route is about the same length."
      : dM > 0
        ? `The uncertainty-aware route is +${dM.toLocaleString("en-US")} m (+${dPct}%) longer.`
        : `The uncertainty-aware route is ${Math.abs(dM).toLocaleString("en-US")} m (${Math.abs(dPct)}%) shorter.`;
  const a = Math.round(standard.criticalBlindspotPct);
  const b = Math.round(safe.criticalBlindspotPct);
  const c = Math.round(standard.worstCaseTravPct);
  const d = Math.round(safe.worstCaseTravPct);
  const exposure =
    b < a
      ? `It cuts critical-blindspot exposure from ${a}% to ${b}% of the path`
      : `Critical-blindspot exposure is ${b}% of the path (standard: ${a}%)`;
  const trav =
    d > c
      ? ` and raises worst-case traversability from ${c}% to ${d}%.`
      : d < c
        ? `, but worst-case traversability drops from ${c}% to ${d}%.`
        : ` with the same worst-case traversability (${d}%).`;
  return `${length} ${exposure}${trav}`;
}
