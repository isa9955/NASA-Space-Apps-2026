import { ConditionValues } from "./ConditionValues";
import React, { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Compass,
  Crosshair,
  Database,
  Diamond,
  Home,
  Info,
  Layers,
  Leaf,
  LoaderCircle,
  Mountain,
  Play,
  Plus,
  Minus,
  RotateCcw,
  Route,
  Search,
  Server,
  Sun,
  Target,
  TriangleAlert,
  Waves,
  X,
} from "lucide-react";
import { createTerrain } from "./terrain";
import {
  coords,
  fmt,
  loadData,
  shortNames,
  getRoute,
  getConditions,
} from "./model";
import "@fontsource/geist/400.css";
import "@fontsource/geist/500.css";
import "@fontsource/geist/600.css";
import "./explorer.css";
const ICONS = {
  habitat: Home,
  landing: Target,
  ice_access: Waves,
  greenhouse: Leaf,
  datacenter: Server,
  solar: Sun,
};
const Button = ({ icon: Icon, children, ...props }) => (
  <button {...props}>
    {Icon && <Icon size={16} />} {children}
  </button>
);
const Line = ({ kind }) => <span className={`line ${kind}`} />;
export function Explorer() {
  const [data, setData] = useState(null),
    [error, setError] = useState(null),
    [attempt, setAttempt] = useState(0),
    [ready, setReady] = useState(false);
  const [tab, setTab] = useState("routes"),
    [placing, setPlacing] = useState(null),
    [a, setA] = useState(null),
    [b, setB] = useState(null);
  const [route, setRoute] = useState(null),
    [status, setStatus] = useState("idle"),
    [focus, setFocus] = useState(null),
    [layers, setLayers] = useState({});
  const [point, setPoint] = useState(null),
    [scout, setScout] = useState(null),
    [science, setScience] = useState(null),
    [showScouts, setShowScouts] = useState(true),
    [showScience, setShowScience] = useState(true);
  const [conditions, setConditions] = useState(null),
    conditionJob = useRef(0);
  const [mode, setMode] = useState("3d"),
    [notice, setNotice] = useState("");
  const host = useRef(null),
    engine = useRef(null),
    pick = useRef(null),
    job = useRef(0);
  useEffect(() => {
    let live = true;
    loadData()
      .then((d) => {
        if (live) {
          setData(d);
          setA(d.demo?.from || null);
          setB(d.demo?.to || null);
          setStatus("idle");
          setError(null);
        }
      })
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [attempt]);
  useEffect(() => {
    if (!data) return;
    let live = true;
    setReady(false);
    createTerrain(host.current, data, (p) => pick.current?.(p))
      .then((e) => {
        if (!live) {
          e.destroy();
          return;
        }
        engine.current = e;
        setReady(true);
      })
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
      engine.current?.destroy();
      engine.current = null;
    };
  }, [data, attempt]);
  useEffect(() => {
    if (ready)
      engine.current?.update({
        route: status === "ok" ? route : null,
        focus,
        layers,
      });
  }, [ready, route, status, focus, layers]);
  useEffect(() => {
    const f = (e) => {
      if (e.key === "Escape") {
        setPlacing(null);
        setPoint(null);
        setScout(null);
        setScience(null);
      }
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(id);
  }, [notice]);
  useEffect(
    () => () => {
      job.current++;
    },
    [],
  );
  useEffect(() => {
    if (ready) engine.current?.refresh();
  }, [ready, a, b, point, scout, science, showScouts, showScience, tab]);
  function invalidate() {
    job.current++;
    setStatus("idle");
    setRoute(null);
    setFocus(null);
    setScout(null);
    setScience(null);
  }
  function place(which) {
    setPlacing(placing === which ? null : which);
    setTab("routes");
  }
  pick.current = (p) => {
    if (placing) {
      invalidate();
      if (placing === "start") {
        setA(p);
        setPlacing(b ? null : "end");
      } else {
        setB(p);
        setPlacing(null);
      }
      return;
    }
    setPoint(p);
    setScout(null);
    setScience(null);
    setTab("inspect");
  };
  function clear() {
    invalidate();
    setA(null);
    setB(null);
    setPlacing(null);
    setPoint(null);
    setTab("routes");
  }
  async function calculate(from = a, to = b) {
    if (!from || !to) return;
    const id = ++job.current;
    setStatus("loading");
    setRoute(null);
    setPlacing(null);
    setTab("routes");
    setScout(null);
    setScience(null);
    try {
      const next = await getRoute(from, to);
      if (id !== job.current) return;
      setRoute(next);
      setStatus(next.status);
    } catch (e) {
      if (id === job.current) {
        setStatus("error");
        setNotice(e.message);
      }
    }
  }
  function demo() {
    setA(data.demo.from);
    setB(data.demo.to);
    setPoint(null);
    calculate(data.demo.from, data.demo.to);
    engine.current?.reset(mode);
  }
  function endpoint(p, which) {
    invalidate();
    if (which === "start") setA(p);
    else setB(p);
    setPlacing(null);
    setTab("routes");
  }
  function inspectScout(s) {
    setScout(s);
    setScience(null);
    setPoint(s.location);
    setTab("inspect");
  }
  function inspectScience(s) {
    setScience(s);
    setScout(null);
    setPoint(s.location);
    setTab("inspect");
  }
  useEffect(() => {
    const id = ++conditionJob.current;
    if (!point) {
      setConditions(null);
      return;
    }
    setConditions({ status: "loading" });
    getConditions(point).then(
      (data) => {
        if (id === conditionJob.current) setConditions({ status: "ok", data });
      },
      (e) => {
        if (id === conditionJob.current)
          setConditions({ status: "error", message: e.message });
      },
    );
    return () => {
      conditionJob.current++;
    };
  }, [point]);
  const valid = status === "ok" && route,
    fits = point && ready ? engine.current.zoneFits(point) : [];
  const setView = (v) => {
    setMode(v);
    engine.current?.reset(v);
  };
  const heading = (title) => (
    <div className="panel-head">
      <h2>{title}</h2>
      <Button
        aria-label="Close panel"
        className="icon-button"
        icon={X}
        onClick={() => setTab(null)}
      />
    </div>
  );
  const sources = (
    <div className="source-list">
      {data?.region.sources.map((s) => (
        <div key={s.id}>
          <strong>{s.provider}</strong>
          <p>{s.product}</p>
          {s.url && (
            <a href={s.url} target="_blank" rel="noreferrer">
              Open source <ArrowRight size={13} />
            </a>
          )}
        </div>
      ))}
    </div>
  );
  return (
    <main className="app">
      <a className="return-globe" href="/overview">
        ← Mars overview
      </a>
      <header className="masthead">
        <Mountain size={23} className="brand-mark" />
        <h1>
          MARS <span>SITE PLANNER</span>
        </h1>
        <span className="divider" />
        <span className="site-title">Deuteronilus Mensae</span>
        <span className="badge">HiRISE terrain</span>
        <span className="prototype-badge">3D EXPLORER</span>
      </header>
      <nav className="toolbar" aria-label="Explorer controls">
        <Button
          className={placing === "start" ? "active" : ""}
          onClick={() => place("start")}
          disabled={!ready}
        >
          <span className="letter">A</span>Place start
        </Button>
        <Button
          className={placing === "end" ? "active" : ""}
          onClick={() => place("end")}
          disabled={!ready}
        >
          <span className="letter">B</span>Place end
        </Button>
        <Button
          className="primary"
          onClick={() => calculate()}
          disabled={!ready || !a || !b || status === "loading"}
          icon={status === "loading" ? LoaderCircle : Route}
        >
          {status === "loading" ? "Calculating…" : "Compare routes"}
        </Button>
        <Button onClick={clear} disabled={!ready}>
          Clear
        </Button>
        <Button icon={Play} onClick={demo} disabled={!ready || !data?.demo}>
          Try demo
        </Button>
        <span className="toolbar-spacer" />
        {[
          ["routes", Route, "Routes"],
          ["zones", Layers, "Zones"],
          ["inspect", Search, "Inspect"],
          ["sources", Database, "Sources"],
        ].map(([key, Icon, label]) => (
          <Button
            key={key}
            icon={Icon}
            className={tab === key ? "active" : ""}
            aria-pressed={tab === key}
            onClick={() => {
              setTab(tab === key ? null : key);
              setPlacing(null);
            }}
          >
            {label}
          </Button>
        ))}
        <span className="divider" />
        <div className="view-toggle">
          <Button
            className={mode === "2d" ? "selected" : ""}
            onClick={() => setView("2d")}
          >
            2D
          </Button>
          <Button
            className={mode === "3d" ? "selected" : ""}
            onClick={() => setView("3d")}
          >
            3D
          </Button>
        </div>
      </nav>
      <section
        className={`viewport ${placing ? "placing" : ""}`}
        aria-label="Mars explorer"
      >
        <div className="terrain-host" ref={host} />
        {(!ready || error) && (
          <div className="loading-cover">
            <Mountain size={32} />
            <h2>
              {error ? "Could not load the explorer" : "Loading Mars terrain…"}
            </h2>
            <p>{error || "Preparing the local HiRISE data snapshot"}</p>
            {error && (
              <Button
                className="primary"
                onClick={() => {
                  setError(null);
                  setAttempt((n) => n + 1);
                }}
              >
                Retry
              </Button>
            )}
          </div>
        )}
        <div className="dataset-tag">
          HiRISE DTM <span>4.0 × 8.0 km · 1 m source · 20 m display mesh</span>
        </div>
        <div className="map-hint">
          {placing
            ? `Click terrain to place ${placing === "start" ? "A" : "B"} · Esc to cancel`
            : "Drag to orbit · Right-drag to pan · Scroll to zoom · Click to inspect"}
        </div>
        {notice && (
          <div role="status" className="toast">
            {notice}
          </div>
        )}
        <div className="markers">
          {a && (
            <span className="endpoint" data-map-point={JSON.stringify(a)}>
              A
            </span>
          )}
          {b && (
            <span className="endpoint" data-map-point={JSON.stringify(b)}>
              B
            </span>
          )}
          {point && (
            <span className="inspected" data-map-point={JSON.stringify(point)}>
              <Crosshair size={22} />
            </span>
          )}
          {ready &&
            engine.current?.patches
              ?.filter((p) => layers[p.layer.id])
              .map((p) => {
                const Icon = ICONS[p.layer.id];
                return (
                  <button
                    key={`${p.layer.id}-${p.rank}`}
                    className="patch-marker"
                    style={{ color: p.layer.color }}
                    title={`${shortNames[p.layer.id]} · ${p.rank === 1 ? "Largest" : "Second-largest"} robust patch · ${p.area.toFixed(2)} km²`}
                    data-map-point={JSON.stringify(p.location)}
                    onClick={() => {
                      setPoint(p.location);
                      setScout(null);
                      setScience(null);
                      setTab("inspect");
                      setNotice(
                        `${shortNames[p.layer.id]} · ${p.rank === 1 ? "Largest" : "Second-largest"} robust patch · ${p.area.toFixed(2)} km²`,
                      );
                    }}
                  >
                    <Icon size={16} />
                  </button>
                );
              })}
          {valid &&
            showScouts &&
            route.scoutPoints?.map((s) => (
              <button
                key={`s${s.rank}`}
                title={`Inspect scout ${s.rank}`}
                className={`scout-marker ${scout?.rank === s.rank ? "picked" : ""}`}
                data-map-point={JSON.stringify(s.location)}
                onClick={() => inspectScout(s)}
              >
                {s.rank}
              </button>
            ))}
          {valid &&
            showScience &&
            route.scienceTargets?.map((s) => (
              <button
                key={s.id}
                title={s.label}
                className="science-marker"
                data-map-point={JSON.stringify(s.location)}
                onClick={() => inspectScience(s)}
              >
                <Diamond size={15} />
              </button>
            ))}
        </div>
        <div className="map-buttons">
          <Button
            aria-label="Zoom in"
            icon={Plus}
            onClick={() => engine.current?.zoom(0.82)}
          />
          <Button
            aria-label="Zoom out"
            icon={Minus}
            onClick={() => engine.current?.zoom(1.2)}
          />
        </div>
        <div className={`map-bottom ${tab === "inspect" ? "shifted" : ""}`}>
          <Button
            title="Reset north-facing view"
            icon={Compass}
            onClick={() => engine.current?.reset(mode)}
          >
            North
          </Button>
          <Button icon={RotateCcw} onClick={() => engine.current?.reset(mode)}>
            Reset view
          </Button>
        </div>
        {tab === "routes" && (
          <aside className="panel route-panel" aria-label="Route planner">
            {heading(
              placing
                ? placing === "start"
                  ? "Choose your start"
                  : "Choose your destination"
                : status === "ok"
                  ? "Compare traverses"
                  : "Plan a traverse",
            )}
            <div className="steps">
              <span className={a ? "done" : ""}>
                {a ? <Check size={14} /> : "1"} Start
              </span>
              <ArrowRight size={13} />
              <span className={b ? "done" : ""}>
                {b ? <Check size={14} /> : "2"} End
              </span>
              <ArrowRight size={13} />
              <span className={status === "ok" ? "done" : ""}>3 Compare</span>
            </div>
            {placing && (
              <div className="message">
                <p>
                  Click inside the terrain to place{" "}
                  {placing === "start" ? "A" : "B"}. Dragging still moves the
                  camera.
                </p>
                <Button onClick={() => setPlacing(null)}>
                  Cancel placement
                </Button>
              </div>
            )}
            {status === "idle" && !placing && (
              <div className="message">
                <p>
                  {!a
                    ? "Choose a start point on the terrain."
                    : !b
                      ? "Choose your destination."
                      : "Endpoints ready. Compare the two traverses."}
                </p>
                <Button
                  className="primary"
                  onClick={() =>
                    !a ? place("start") : !b ? place("end") : calculate()
                  }
                >
                  {!a
                    ? "Place start"
                    : !b
                      ? "Place destination"
                      : "Compare routes"}
                </Button>
                <Button onClick={demo} icon={Play}>
                  Try the demo
                </Button>
              </div>
            )}
            {status === "loading" && (
              <div className="message" role="status">
                <LoaderCircle className="spin" />
                <h3>Planning both routes…</h3>
                <p>The terrain remains available while results load.</p>
                <Button onClick={invalidate}>Cancel calculation</Button>
              </div>
            )}
            {status === "error" && (
              <div className="message" role="alert">
                <TriangleAlert className="amber" />
                <h3>Could not calculate routes</h3>
                <p>
                  The API request failed. Your endpoints are still selected.
                </p>
                <Button
                  className="primary"
                  onClick={() => {
                    calculate(a, b);
                  }}
                >
                  Retry routes
                </Button>
                <Button onClick={() => place("end")}>Edit endpoint</Button>
              </div>
            )}
            {status === "unavailable" && (
              <div className="message" role="status">
                <TriangleAlert className="amber" />
                <h3>No route available</h3>
                <p>{route?.reason}</p>
                <Button
                  className="primary"
                  onClick={() => {
                    place("end");
                  }}
                >
                  Move destination
                </Button>
                <Button
                  onClick={() => {
                    setPoint(b);
                    setTab("inspect");
                  }}
                >
                  Inspect destination
                </Button>
              </div>
            )}
            {valid && (
              <>
                <div className="evidence">LIVE API · MODELED RESULTS</div>
                <div className="route-choices">
                  {["standard", "safe"].map((k) => (
                    <button
                      key={k}
                      className={focus === k ? "chosen" : ""}
                      aria-pressed={focus === k}
                      onClick={() => setFocus(focus === k ? null : k)}
                    >
                      <Line kind={k} />
                      {k === "standard" ? "Standard" : "Uncertainty-aware"}
                    </button>
                  ))}
                </div>
                <table className="metrics">
                  <thead>
                    <tr>
                      <th>Metric</th>
                      <th>Standard</th>
                      <th>Aware</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["Grid distance", "distanceKm", " km", 2],
                      ["Estimated walk", "walkMin", " min", 0],
                      ["Critical blindspots", "criticalBlindspotPct", "%", 0],
                      ["Worst-case traversability", "worstCaseTravPct", "%", 0],
                    ].map(([label, key, unit, digits]) => (
                      <tr key={key}>
                        <td>{label}</td>
                        {["standard", "safe"].map((k) => (
                          <td key={k}>
                            {route[k][key] === null
                              ? "Not modeled"
                              : fmt(route[k][key], digits) + unit}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="comparison">
                  {fmt(
                    (route.safe.distanceKm - route.standard.distanceKm) * 1000,
                  )}{" "}
                  m difference ·{" "}
                  {fmt(
                    route.standard.criticalBlindspotPct -
                      route.safe.criticalBlindspotPct,
                    1,
                  )}{" "}
                  percentage points less modeled blindspot exposure
                </p>
                <p className="muted small">
                  Walking assumes 50 m/min. Both routes are provisional;
                  percentages describe model sensitivity, not hazard
                  probability.
                </p>
                <div className="marker-toggles">
                  <label>
                    <input
                      type="checkbox"
                      checked={showScouts}
                      onChange={(e) => setShowScouts(e.target.checked)}
                    />{" "}
                    Scouts · {route.scoutPoints?.length || 0}
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={showScience}
                      onChange={(e) => setShowScience(e.target.checked)}
                    />{" "}
                    Science · {route.scienceTargets?.length || 0}
                  </label>
                </div>
                <details>
                  <summary>Scout & science details</summary>
                  <div className="target-list">
                    {route.scoutPoints?.map((s) => (
                      <button key={s.rank} onClick={() => inspectScout(s)}>
                        Scout {s.rank}
                        <span>
                          {fmt(s.alongM)} m in <ChevronRight size={13} />
                        </span>
                      </button>
                    ))}
                    {route.scienceTargets?.map((s) => (
                      <button key={s.id} onClick={() => inspectScience(s)}>
                        <Diamond size={13} />
                        {s.label}
                      </button>
                    ))}
                  </div>
                </details>
              </>
            )}
            <details>
              <summary>Enter coordinates</summary>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget),
                    p = [Number(f.get("lon")), Number(f.get("lat"))];
                  const [w, s, east, n] = data.region.region.bounds;
                  if (p[0] < w || p[0] > east || p[1] < s || p[1] > n) {
                    setNotice(
                      "Outside mapped coverage. Choose coordinates within this site.",
                    );
                    return;
                  }
                  endpoint(p, f.get("which"));
                }}
              >
                <div className="form-row">
                  <label>
                    Longitude E
                    <input
                      name="lon"
                      type="number"
                      step="any"
                      defaultValue={a?.[0] || 30.16237}
                      required
                    />
                  </label>
                  <label>
                    Latitude N
                    <input
                      name="lat"
                      type="number"
                      step="any"
                      defaultValue={a?.[1] || 40.71216}
                      required
                    />
                  </label>
                </div>
                <select name="which" aria-label="Endpoint">
                  <option value="start">Start A</option>
                  <option value="end">Destination B</option>
                </select>
                <Button type="submit">Set point</Button>
              </form>
            </details>
          </aside>
        )}
        {tab === "zones" && (
          <aside className="panel zones-panel" aria-label="Buildable zones">
            {heading("Buildable zones")}
            <p className="muted">
              Ground that passes nominal rules, and what remains under
              worst-case slope.
            </p>
            <div className="zone-head">
              Layer <span>Nominal → robust · km²</span>
            </div>
            {data?.region.layers.map((l) => {
              const Icon = ICONS[l.id];
              return (
                <div className="zone" key={l.id}>
                  <div className="zone-row">
                    <button
                      role="switch"
                      aria-label={`Show ${shortNames[l.id]}`}
                      aria-checked={!!layers[l.id]}
                      className={`switch ${layers[l.id] ? "on" : ""}`}
                      onClick={() =>
                        setLayers((s) => ({ ...s, [l.id]: !s[l.id] }))
                      }
                    >
                      <span />
                    </button>
                    <Icon size={17} style={{ color: l.color }} />
                    <strong>{shortNames[l.id]}</strong>
                    <span className="area">
                      {l.nominalKm2.toFixed(2)} → {l.robustKm2.toFixed(2)}
                      <small>
                        {Math.round(l.survivesPct)}%{" "}
                        {l.id === "solar" ? "area ratio" : "under assumptions"}
                      </small>
                    </span>
                  </div>
                  <details>
                    <summary>Rule & layer details</summary>
                    <p>{l.rule}</p>
                    <p>
                      Areas describe the entire layer. Click terrain to check a
                      location.
                    </p>
                  </details>
                </div>
              );
            })}
            <div className="zone-key">
              <span>Solid: robust</span>
              <span>Hatched: nominal only</span>
            </div>
            <p className="small muted">
              Percentages describe model sensitivity, not probability.
            </p>
            <div className="caveat">
              <Info size={17} />
              <span>
                Solar uses different sunlight thresholds. Its robust mask
                extends beyond nominal; the ratio is not survival.
              </span>
            </div>
            <p className="small muted">
              Draft ice landforms are not confirmed water.
            </p>
          </aside>
        )}
        {tab === "inspect" && (
          <aside
            className="panel inspect-panel"
            aria-label="Terrain conditions"
          >
            {heading(
              scout
                ? `Scout point ${scout.rank}`
                : science
                  ? "Science candidate"
                  : "Terrain conditions",
            )}
            {!point ? (
              <div className="message">
                <Crosshair size={26} />
                <h3>Choose a point on the terrain</h3>
                <p>
                  Inspect elevation, slope uncertainty, zone fit and draft
                  landform distance.
                </p>
                <Button
                  disabled={!a && !data.demo}
                  onClick={() => setPoint(a || data.demo.from)}
                >
                  Inspect start point
                </Button>
              </div>
            ) : (
              <>
                <div className="coordinates">{coords(point)}</div>
                {scout ? (
                  <>
                    <p className="muted">
                      Backend candidate along the standard route
                    </p>
                    <dl className="facts">
                      <dt>Distance from start</dt>
                      <dd>{fmt(scout.alongM)} m</dd>
                      <dt>Blindspot magnitude</dt>
                      <dd>{scout.blindspotPts} points</dd>
                      <dt>Slope ± uncertainty</dt>
                      <dd>
                        {scout.slopeDeg}° ± {scout.slopeUncDeg}°
                      </dd>
                      <dt>Worst-case traversability</dt>
                      <dd>{scout.worstCaseTravPct}%</dd>
                    </dl>
                    <p className="small muted">
                      A modeled scouting candidate, not a confirmed hazard.
                    </p>
                    <div className="actions">
                      <Button
                        icon={ChevronLeft}
                        disabled={scout.rank === 1}
                        onClick={() =>
                          inspectScout(route.scoutPoints[scout.rank - 2])
                        }
                      >
                        Previous
                      </Button>
                      <span>
                        {scout.rank} of {route.scoutPoints.length}
                      </span>
                      <Button
                        icon={ChevronRight}
                        disabled={scout.rank === route.scoutPoints.length}
                        onClick={() =>
                          inspectScout(route.scoutPoints[scout.rank])
                        }
                      >
                        Next
                      </Button>
                    </div>
                  </>
                ) : science ? (
                  <>
                    <h3>{science.label}</h3>
                    <p className="muted">
                      Geometric candidate, not a confirmed discovery.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="muted small">
                      Point values from the backend dataset; est. = modeled
                    </p>
                    <ConditionValues state={conditions} />
                    <p className="small muted">
                      Landform distance is approximate. Draft interpretation,
                      not confirmed ice.
                    </p>
                  </>
                )}
                <Button
                  className="wide"
                  icon={Crosshair}
                  onClick={() => engine.current?.center(point)}
                >
                  Center on point
                </Button>
                <div className="actions">
                  <Button onClick={() => endpoint(point, "start")}>
                    Use as start
                  </Button>
                  <Button onClick={() => endpoint(point, "end")}>
                    Use as destination
                  </Button>
                </div>
                <details open>
                  <summary>Zone fit at this point</summary>
                  {fits.length ? (
                    <div className="fits">
                      {fits.map((l) => (
                        <span key={l.id} style={{ borderColor: l.color }}>
                          {shortNames[l.id]} <small>{l.fit}</small>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="muted small">
                      No modeled zone at this location.
                    </p>
                  )}
                </details>
                <details>
                  <summary>Data & assumptions</summary>
                  {sources}
                </details>
                <p className="small muted">
                  Overall habitability and resource accessibility remain
                  Unknown.
                </p>
              </>
            )}
          </aside>
        )}
        {tab === "sources" && (
          <aside
            className="panel sources-panel"
            aria-label="Sources and limitations"
          >
            {heading("Data & assumptions")}
            <div className="evidence">LIVE API · HIRISE-DERIVED DATA</div>
            <p>
              Zone masks, point conditions and route results come from the
              existing API. Display elevation is generated from the committed
              HiRISE-derived grid. The 3D mesh is downsampled to about 20 m for
              desktop review, with natural vertical scale.
            </p>
            <p>
              Both demo and custom endpoints use the backend routing engine.
              Routes and science candidates remain provisional model outputs,
              not verified safety assessments or discoveries.
            </p>
            {sources}
            <div className="caveat">
              <Info size={17} />
              <span>
                Not a NASA safety assessment. Radiation, soil, temperature and
                overall habitability are unknown.
              </span>
            </div>
          </aside>
        )}
        <div className="map-footer">
          <span>HiRISE-derived terrain · live backend · 3D explorer</span>
          <span>NASA/JPL/University of Arizona</span>
        </div>
      </section>
    </main>
  );
}
