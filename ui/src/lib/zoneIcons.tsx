import { Droplet, House, Rocket, Server, Sprout, Sun, type LucideIcon } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ZoneLayer } from "../api/schema";

export type ZoneIconKey = ZoneLayer["icon"];

/** One symbol per use, shared by the map, toggles, legend and conditions card. */
export const ZONE_ICON: Record<ZoneIconKey, LucideIcon> = {
  habitat: House,
  landing: Rocket,
  ice: Droplet,
  greenhouse: Sprout,
  datacenter: Server,
  solar: Sun
};

/** Dark glyph on the light zone colors. */
export const ICON_INK = "#0b0f15";

export function ZoneBadge({ layer, size = 22 }: { layer: Pick<ZoneLayer, "icon" | "color" | "label">; size?: number }) {
  const Icon = ZONE_ICON[layer.icon];
  return (
    <span className="zone-badge" style={{ background: layer.color, width: size, height: size }} aria-hidden>
      <Icon size={Math.round(size * 0.6)} color={ICON_INK} strokeWidth={2.3} />
    </span>
  );
}

const svgCache = new Map<string, string>();
/** SVG markup for Leaflet divIcons (map markers live outside React). */
export function zoneIconSvg(key: ZoneIconKey, size: number): string {
  const k = `${key}-${size}`;
  let s = svgCache.get(k);
  if (!s) {
    const Icon = ZONE_ICON[key];
    s = renderToStaticMarkup(<Icon size={size} color={ICON_INK} strokeWidth={2.4} />);
    svgCache.set(k, s);
  }
  return s;
}
