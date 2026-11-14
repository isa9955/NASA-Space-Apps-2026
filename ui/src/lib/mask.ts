// Zone masks (contract: grayscale PNG, 0 = fails, 1–127 = lost to blindspots,
// 128–255 = robust): tinting for display, patch finding for map symbols, and
// point lookup for the conditions card.
import type { BBox, LonLat } from "../api/schema";

export const ROBUST_ALPHA = 190;
export const FAINT_ALPHA = 56;

export type Fit = "robust" | "nominal" | null;

export interface DecodedMask {
  /** Tinted, transparent PNG data URL for the map overlay. */
  url: string;
  /** Raw mask values, row-major, row 0 = north. */
  values: Uint8Array;
  width: number;
  height: number;
}

/** Copies the red channel (mask value) out, then recolors in place. */
export function tintPixels(rgba: Uint8ClampedArray, hex: string): Uint8Array {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const values = new Uint8Array(rgba.length / 4);
  for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {
    const v = rgba[i];
    values[p] = v;
    rgba[i] = r;
    rgba[i + 1] = g;
    rgba[i + 2] = b;
    rgba[i + 3] = v >= 128 ? ROBUST_ALPHA : v > 0 ? FAINT_ALPHA : 0;
  }
  return values;
}

export async function loadMask(url: string, hex: string): Promise<DecodedMask> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is not available.");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const values = tintPixels(data.data, hex);
  ctx.putImageData(data, 0, 0);
  return { url: canvas.toDataURL("image/png"), values, width: canvas.width, height: canvas.height };
}

export interface Patch {
  /** Pixel inside the patch nearest its centroid (always on the patch). */
  x: number;
  y: number;
  pixels: number;
}

/** Largest 4-connected robust patches (value ≥ 128), biggest first. */
export function robustPatches(values: Uint8Array, w: number, h: number, minPixels: number, max: number): Patch[] {
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  const members = new Int32Array(w * h);
  const out: Patch[] = [];
  for (let start = 0; start < w * h; start++) {
    if (seen[start] || values[start] < 128) continue;
    let top = 0;
    let n = 0;
    let sx = 0;
    let sy = 0;
    stack[top++] = start;
    seen[start] = 1;
    while (top) {
      const k = stack[--top];
      members[n++] = k;
      const x = k % w;
      const y = (k - x) / w;
      sx += x;
      sy += y;
      const nb = [x > 0 ? k - 1 : -1, x < w - 1 ? k + 1 : -1, y > 0 ? k - w : -1, y < h - 1 ? k + w : -1];
      for (const q of nb) {
        if (q >= 0 && !seen[q] && values[q] >= 128) {
          seen[q] = 1;
          stack[top++] = q;
        }
      }
    }
    if (n < minPixels) continue;
    const cx = sx / n;
    const cy = sy / n;
    let best = members[0];
    let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      const k = members[i];
      const x = k % w;
      const d = (x - cx) ** 2 + ((k - x) / w - cy) ** 2;
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    out.push({ x: best % w, y: Math.floor(best / w), pixels: n });
  }
  return out.sort((a, b) => b.pixels - a.pixels).slice(0, max);
}

export function pixelToLonLat(x: number, y: number, w: number, h: number, [west, south, east, north]: BBox): LonLat {
  return [west + ((x + 0.5) / w) * (east - west), north - ((y + 0.5) / h) * (north - south)];
}

export function fitAt([lon, lat]: LonLat, m: Pick<DecodedMask, "values" | "width" | "height">, [west, south, east, north]: BBox): Fit {
  const x = Math.floor(((lon - west) / (east - west)) * m.width);
  const y = Math.floor(((north - lat) / (north - south)) * m.height);
  if (x < 0 || y < 0 || x >= m.width || y >= m.height) return null;
  const v = m.values[y * m.width + x];
  return v >= 128 ? "robust" : v > 0 ? "nominal" : null;
}
