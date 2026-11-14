// The only place the UI talks to the backend. Every response is validated
// against the contract in schema.ts; a mismatch becomes a readable error
// instead of a broken screen.
import type { ZodType } from "zod";
import { ApiError } from "./errors";
import {
  ConditionsResponse,
  ErrorResponse,
  RegionResponse,
  RouteResponse,
  type LonLat
} from "./schema";

/** Base for API calls. Empty = same origin (/api). Override with VITE_API_BASE. */
const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");

export async function getJson<T>(path: string, schema: ZodType<T>, params: Record<string, string> = {}): Promise<T> {
  const qs = new URLSearchParams(params).toString();
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/${path}${qs ? `?${qs}` : ""}`);
  } catch {
    throw new ApiError("NETWORK_ERROR", "Could not reach the API. Is the backend running?");
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = ErrorResponse.safeParse(body);
    throw err.success
      ? new ApiError(err.data.error.code, err.data.error.message)
      : new ApiError("HTTP_ERROR", `The API returned ${res.status}.`);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    console.error(`[api] /api/${path} failed validation`, parsed.error.issues, body);
    throw new ApiError(
      "BAD_RESPONSE",
      `The API sent data in an unexpected shape (/api/${path}: ${first.path.join(".") || "root"} – ${first.message}).`
    );
  }
  return parsed.data;
}

const fmt = (p: LonLat) => `${p[0]},${p[1]}`;

export const getRegion = () => getJson("region", RegionResponse);

export const getConditions = (p: LonLat) =>
  getJson("conditions", ConditionsResponse, { lon: String(p[0]), lat: String(p[1]) });

export const getRoute = (from: LonLat, to: LonLat) => getJson("route", RouteResponse, { from: fmt(from), to: fmt(to) });

/** Resolves an asset URL from the API (absolute, or same-origin path). */
export function assetUrl(url: string): string {
  return /^(https?:|data:)/.test(url) ? url : `${API_BASE}${url}`;
}
