import { Microscope } from "lucide-react";
import type { RegionResponse } from "../api/schema";
import { fmtNum } from "../lib/format";

export function MapLegend({ region }: { region: RegionResponse }) {
  const d = region.region.dataset;
  return (
    <div className="legend">
      <div className="legend-title">{d.label}</div>
      <div className="legend-meta">
        {fmtNum(d.sizeKm[0], 1)} × {fmtNum(d.sizeKm[1], 1)} km · {fmtNum(d.resolutionM, d.resolutionM < 10 ? 2 : 0)} m/px ·{" "}
        {fmtNum(d.reliefM)} m relief
      </div>
      <div className="legend-zones">
        <span className="lz solid" /> Robust <span className="lz faint" /> Lost to blindspots
      </div>
      <ul>
        <li>
          <span className="ll standard" /> Standard route
        </li>
        <li>
          <span className="ll safe" /> Safe route
        </li>
        <li>
          <span className="ld scout" /> Scout point
        </li>
        <li>
          <span className="ld sci">
            <Microscope size={9} color="#fff" />
          </span>{" "}
          Science target
        </li>
      </ul>
    </div>
  );
}
