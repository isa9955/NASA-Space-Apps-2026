import { Droplet, Layers, Mountain, Radiation, Thermometer, TrendingUp, X, type LucideIcon } from "lucide-react";
import type { ConditionsResponse, LonLat, Qualifier } from "../api/schema";
import { fmtLonLat, fmtNum } from "../lib/format";
import type { Loadable } from "./loadable";

interface Props {
  point: LonLat;
  state: Loadable<ConditionsResponse>;
  onClose: () => void;
}

const SOIL = { bedrock: "Bedrock", mixed: "Mixed", "loose-sand": "Loose sand" } as const;

export function ConditionsCard({ point, state, onClose }: Props) {
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
      <Tile icon={Droplet} value={c.ice.value === null ? "Unknown" : `${fmtNum(c.ice.value)}%`} label="Ice" q={c.ice.qualifier} />
      <Tile icon={Radiation} value={fmtNum(c.radiation.value, 2)} label={c.radiation.unit} q={c.radiation.qualifier} />
      <Tile icon={Thermometer} value={withUnit(c.temperature.value, 0, " °C")} label="Mean temp" q={c.temperature.qualifier} />
    </div>
  );
}

const withUnit = (v: number | null, d: number, unit: string) => (v === null ? "—" : `${fmtNum(v, d)}${unit}`);

const Q_TEXT: Record<NonNullable<Qualifier>, { short: string; title: string }> = {
  regional: { short: "reg.", title: "Regional: coarse orbital data, not measured at this spot." },
  estimated: { short: "est.", title: "Estimated: modeled, not measured." }
};

function Tile({ icon: Icon, value, label, q }: { icon: LucideIcon; value: React.ReactNode; label: string; q: Qualifier }) {
  return (
    <div className="tile" title={q ? Q_TEXT[q].title : undefined}>
      <Icon size={18} className="tile-icon" strokeWidth={1.8} />
      <div className="tile-value">{value}</div>
      <div className="tile-label">
        {label}
        {q && <span className="q"> {Q_TEXT[q].short}</span>}
      </div>
    </div>
  );
}
