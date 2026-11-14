// Turns a grayscale zone mask PNG (contract: 0 = fails, 1–127 = lost to
// blindspots, 128–255 = robust) into a tinted, transparent overlay image.

export const ROBUST_ALPHA = 190;
export const FAINT_ALPHA = 56;

/** Pure pixel recolor, separated out so it can be unit-tested. */
export function tintPixels(rgba: Uint8ClampedArray, hex: string): void {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  for (let i = 0; i < rgba.length; i += 4) {
    const v = rgba[i];
    rgba[i] = r;
    rgba[i + 1] = g;
    rgba[i + 2] = b;
    rgba[i + 3] = v >= 128 ? ROBUST_ALPHA : v > 0 ? FAINT_ALPHA : 0;
  }
}

export async function tintMask(url: string, hex: string): Promise<string> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is not available.");
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  tintPixels(data.data, hex);
  ctx.putImageData(data, 0, 0);
  return canvas.toDataURL("image/png");
}
