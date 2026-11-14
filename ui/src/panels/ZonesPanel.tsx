import type { ZoneLayer } from "../api/schema";
import { fmtNum } from "../lib/format";

interface Props {
  layers: ZoneLayer[];
  on: Record<string, boolean>;
  failed: Record<string, boolean>;
  onToggle: (id: string) => void;
}

export function ZonesPanel({ layers, on, failed, onToggle }: Props) {
  return (
    <section className="section">
      <h2 className="section-title">Buildable zones</h2>
      <p className="intro">
        Showing <strong>robust</strong> zones: ground that still passes with worst-case slope. Faint = lost to
        blindspots. Click the map to inspect conditions.
      </p>
      <ul className="zones">
        {layers.map((l) => (
          <li key={l.id}>
            <button
              role="switch"
              aria-checked={!!on[l.id]}
              aria-label={`Show ${l.label}`}
              className={`switch${on[l.id] ? " on" : ""}`}
              onClick={() => onToggle(l.id)}
            >
              <span />
            </button>
            <span className="swatch" style={{ background: l.color }} />
            <span className="zone-label" title={l.rule}>
              {l.label}
              {failed[l.id] && <span className="zone-error"> · overlay failed to load</span>}
            </span>
            <span className="zone-stats">
              <span className="zone-area">
                <strong>{fmtNum(l.nominalKm2, 2)}</strong> → <strong>{fmtNum(l.robustKm2, 2)}</strong> km²
              </span>
              <span className="zone-survive">{Math.round(l.survivesPct)}% survives blindspots</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="footnote">
        Areas: nominal → robust. The percentage is a sensitivity under the stated assumptions, <strong>not a probability</strong>.
        Hover a zone name for its rule.
      </p>
    </section>
  );
}
