import type { ZoneLayer, RegionResponse } from "../api/schema";
import { fmtNum } from "../lib/format";
import { ZoneBadge } from "../lib/zoneIcons";

interface Props {
  layers: ZoneLayer[];
  sources: RegionResponse["sources"];
  on: Record<string, boolean>;
  failed: Record<string, boolean>;
  onToggle: (id: string) => void;
}

export function ZonesPanel({ layers, sources, on, failed, onToggle }: Props) {
  return (
    <section className="section">
      <h2 className="section-title">Buildable zones</h2>
      <p className="intro">
        Showing <strong>robust</strong> zones: ground that still passes with worst-case slope. Faint = lost to
        blindspots. Symbols on the map mark each zone&apos;s largest robust patches. Click the map to inspect
        conditions.
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
            <ZoneBadge layer={l} />
            <span className="zone-label" title={l.rule}>
              {l.label}
              {failed[l.id] && <span className="zone-error"> · overlay failed to load</span>}
            </span>
            <span className="zone-stats">
              <span className="zone-area">
                <strong>{fmtNum(l.nominalKm2, 2)}</strong> → <strong>{fmtNum(l.robustKm2, 2)}</strong> km²
              </span>
              <span className="zone-survive">{Math.round(l.survivesPct)}% {l.id === "solar" ? "area ratio · caveat below" : "under stated assumptions"}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="footnote">
        Areas: nominal → robust. The percentage is a sensitivity under the stated assumptions, <strong>not a probability</strong>.
        Hover a zone name for its rule.
        Solar caveat: its robust mask is not a subset of its nominal mask because the sunlight thresholds differ.
        The solar percentage is not a survival fraction. Draft ice landforms are not confirmed water resources.
        Overall habitability, radiation, shielding and resource access remain unknown.
      </p>
      <details className="footnote">
        <summary>NASA data and model sources</summary>
        <ul>{sources.map((source) => <li key={source.id}>
          {source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.provider}</a> : source.provider}
          {" · "}{source.product}
        </li>)}</ul>
      </details>
    </section>
  );
}
