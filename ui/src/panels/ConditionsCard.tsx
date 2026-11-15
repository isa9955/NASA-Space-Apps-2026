import { Droplet, Layers, Mountain, Radiation, Thermometer, TrendingUp, X, type LucideIcon } from "lucide-react";
import type { ConditionsResponse, LonLat, Qualifier, ZoneLayer } from "../api/schema";
import type { Fit } from "../lib/mask";
import { ZoneBadge } from "../lib/zoneIcons";
import { fmtLonLat, fmtNum } from "../lib/format";
import type { Loadable } from "./loadable";

export interface ZoneFit {
  layer: ZoneLayer;
  fit: NonNullable<Fit>;
}

interface Props {
  point: LonLat;
  state: Loadable<ConditionsResponse>;
  /** Zones at this point; null while masks are loading. */
  fits: ZoneFit[] | null;
  onClose: () => void;
}

const SOIL = { bedrock: "Bedrock", mixed: "Mixed", "loose-sand": "Loose sand" } as const;

export function ConditionsCard({ point, state, fits, onClose }: Props) {
  return (
    <aside className="conditions" aria-label="Conditions at the selected point">
      <header className="cond-head">
        <div>
          <h2 className="section-title">Conditions</h2>
          <div className="cond-coords">{fmtLonLat(point)}</div>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close conditions">
          <X size={16} />
        </button>
      </header>
      {state.status === "loading" && <p className="muted">Loading…</p>}
      {state.status === "error" && <p className="error">{state.message}</p>}
      {state.status === "ok" && <Grid c={state.data} />}
      {fits && <Fits fits={fits} />}
    </aside>
  );
}

function Grid({ c }: { c: ConditionsResponse }) {
  const slopeUnc = c.slope.uncertainty;
  return (
    <div className="cond-grid">
      <Tile icon={Mountain} value={withUnit(c.elevation.value, 0, " m")} label="Elevation" q={c.elevation.qualifier} />
      <Tile
        icon={TrendingUp}
        value={
          <>
            {withUnit(c.slope.value, 0, "°")}
            {slopeUnc != null && c.slope.value !== null && <small> ± {fmtNum(slopeUnc)}</small>}
          </>
        }
        label="Slope"
        q={c.slope.qualifier}
      />
      <Tile icon={Layers} value={c.soil.value ? SOIL[c.soil.value] : "—"} label="Soil" q={c.soil.qualifier} />
      <IceTile ice={c.ice} />
      <Tile icon={Radiation} value={withUnit(c.radiation.value, 2, ` ${c.radiation.unit}`)} label="Radiation" q={c.radiation.qualifier} />
      <Tile icon={Thermometer} value={withUnit(c.temperature.value, 0, " °C")} label="Mean temp" q={c.temperature.qualifier} />
    </div>
  );
}

function Fits({ fits }: { fits: ZoneFit[] }) {
  return (
    <div className="fits">
      <div className="fits-title">Passes modeled zone rules</div>
      {fits.length === 0 ? (
        <p className="muted fits-none">No modeled zone at this spot.</p>
      ) : (
        <ul>
          {fits.map(({ layer, fit }) => (
            <li
              key={layer.id}
              className={`fit-chip ${fit}`}
              title={fit === "robust" ? "Passes even with worst-case slope." : "Passes only with nominal slope: lost to blindspots."}
            >
              <ZoneBadge layer={layer} size={18} />
              <span>{layer.label}</span>
              {fit === "nominal" && <em>blindspot</em>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const withUnit = (v: number | null, d: number, unit: string) => (v === null ? "—" : `${fmtNum(v, d)}${unit}`);

function IceTile({ ice }: { ice: ConditionsResponse["ice"] }) {
  if (ice.kind === "consistency") {
    return <Tile icon={Droplet} value={ice.value === null ? "Unknown" : fmtNum(ice.value)} label="Ice index · not probability" q={ice.qualifier} />;
  }
  if (ice.value === null) return <Tile icon={Droplet} value="Unknown" label="Ice" q={ice.qualifier} />;
  return ice.value === 0 ? (
    <Tile icon={Droplet} value="Draft lobe" label="Not confirmed ice" q={ice.qualifier} />
  ) : (
    <Tile icon={Droplet} value={`${fmtNum(ice.value)} m`} label="To draft landform" q={ice.qualifier} />
  );
}

const Q_TEXT: Record<NonNullable<Qualifier>, { short: string; title: string }> = {
  regional: { short: "reg.", title: "Regional: coarse orbital data, not measured at this spot." },
  estimated: { short: "est.", title: "Estimated: modeled, not measured." }
};

function Tile({ icon: Icon, value, label, q }: { icon: LucideIcon; value: React.ReactNode; label: string; q: Qualifier }) {
  const missing = value === "—";
  return (
    <div className={`tile${missing ? " tile-missing" : ""}`} title={missing ? "Not available for this site yet." : q ? Q_TEXT[q].title : undefined}>
      <Icon size={18} className="tile-icon" strokeWidth={1.8} />
      <div className="tile-value">{value}</div>
      <div className="tile-label">
        {label}
        {q && <span className="q"> {Q_TEXT[q].short}</span>}
      </div>
    </div>
  );
}
