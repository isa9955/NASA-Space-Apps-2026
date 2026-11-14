import { Play } from "lucide-react";
import type { RouteResponse, RouteVariant } from "../api/schema";
import { compareRoutes, fmtNum } from "../lib/format";
import type { RouteKind } from "../map/SiteMap";
import type { Loadable } from "./loadable";

interface Props {
  hasStart: boolean;
  hasEnd: boolean;
  placing: "start" | "end" | null;
  onPlace: (which: "start" | "end") => void;
  onClear: () => void;
  onDemo: (() => void) | null;
  state: Loadable<RouteResponse> | null;
  onFocus: (k: RouteKind | null) => void;
}

const COPY: Record<RouteKind, { title: string; badge: string; desc: string }> = {
  standard: {
    title: "Standard Route",
    badge: "Trusts the map",
    desc: "Shortest path on nominal traversability. Ignores measurement uncertainty."
  },
  safe: {
    title: "Safe Route",
    badge: "Avoids blindspots",
    desc: "Plans on worst-case traversability and penalises uncertain cells."
  }
};

const critClass = (v: number) => (v < 10 ? "good" : v < 25 ? "warn" : "bad");
const wcClass = (v: number) => (v >= 60 ? "good" : v >= 40 ? "warn" : "bad");

export function RoutePlanner({ hasStart, hasEnd, placing, onPlace, onClear, onDemo, state, onFocus }: Props) {
  const ready = state?.status === "ok" && state.data.status === "ok";
  const step = ready ? 3 : hasStart ? 2 : 1;

  let status: string;
  if (placing === "start") status = "Click the map to place the start.";
  else if (placing === "end") status = "Click the map to place the end.";
  else if (state?.status === "loading") status = "Planning both routes…";
  else if (ready) status = `Routes ready in ${fmtNum(state.data.computeMs)} ms · click the map to inspect the terrain`;
  else status = "Place a start and an end, or try the demo traverse.";

  return (
    <section className="section">
      <h2 className="section-title">Route planner</h2>
      <div className="steps">
        {["Start", "End", "Compare"].map((label, i) => {
          const n = i + 1;
          const done = n === 1 ? hasStart : n === 2 ? hasEnd : ready;
          return (
            <span key={label} className={`step${n === step ? " current" : ""}${done ? " done" : ""}`}>
              <span className="step-n">{n}</span> {label}
            </span>
          );
        })}
      </div>
      <div className="planner-buttons">
        <button className={`btn btn-start${placing === "start" ? " armed" : ""}`} onClick={() => onPlace("start")}>
          Place start
        </button>
        <button className={`btn btn-end${placing === "end" ? " armed" : ""}`} onClick={() => onPlace("end")}>
          Place end
        </button>
        <button className="btn btn-clear" onClick={onClear}>
          Clear
        </button>
      </div>
      {onDemo && (
        <button className="btn btn-demo" onClick={onDemo}>
          <Play size={12} fill="currentColor" /> Try a demo traverse
        </button>
      )}
      <p className="status" aria-live="polite">
        {status}
      </p>

      {state?.status === "error" && <p className="error">{state.message}</p>}
      {state?.status === "ok" && state.data.status === "unavailable" && (
        <p className="error">No route found. {state.data.reason}</p>
      )}
      {ready && state.data.standard && state.data.safe && (
        <>
          <RouteCard v={state.data.standard} onFocus={onFocus} />
          <RouteCard v={state.data.safe} onFocus={onFocus} />
          <p className="compare">{compareRoutes(state.data.standard, state.data.safe)}</p>
        </>
      )}
    </section>
  );
}

function RouteCard({ v, onFocus }: { v: RouteVariant; onFocus: (k: RouteKind | null) => void }) {
  const c = COPY[v.kind];
  return (
    <article
      className={`route-card ${v.kind}`}
      onMouseEnter={() => onFocus(v.kind)}
      onMouseLeave={() => onFocus(null)}
      onFocus={() => onFocus(v.kind)}
      onBlur={() => onFocus(null)}
      tabIndex={0}
    >
      <header className="rc-head">
        <span className={`rc-line ${v.kind}`} aria-hidden />
        <h3>{c.title}</h3>
        <span className={`rc-badge ${v.kind}`}>{c.badge}</span>
      </header>
      <p className="rc-desc">{c.desc}</p>
      <div className="rc-stats">
        <div>
          <strong>{fmtNum(v.distanceKm, 2)} km</strong>
          <span>Distance</span>
        </div>
        <div>
          <strong>{fmtNum(v.walkMin)} min</strong>
          <span>Est. walk</span>
        </div>
        <div>
          <strong className={critClass(v.criticalBlindspotPct)}>{fmtNum(v.criticalBlindspotPct)}%</strong>
          <span>Critical blindspots</span>
        </div>
        <div>
          <strong className={wcClass(v.worstCaseTravPct)}>{fmtNum(v.worstCaseTravPct)}%</strong>
          <span>Worst-case trav.</span>
        </div>
      </div>
      <div className="rc-bar" role="img" aria-label={`${fmtNum(v.criticalBlindspotPct)}% critical blindspots`}>
        <span style={{ width: `${Math.max(v.criticalBlindspotPct, v.criticalBlindspotPct > 0 ? 1.5 : 0)}%` }} />
      </div>
      <p className="rc-caption">Share of the path where traversability could drop by more than 50 pts</p>
    </article>
  );
}
