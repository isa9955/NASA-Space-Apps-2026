import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type {
  SitesResponse,
  SiteResponse,
  CandidateSite,
} from "../../api/src/contracts/site";
import type { RouteResponse } from "../../api/src/contracts/route";
import type {
  StartsResponse,
  MissionContext,
} from "../../api/src/contracts/journey";
import { MarsMap } from "./MarsMap";
import { HabitatPreview } from "./HabitatPreview";
import { ScienceReview } from "./ScienceReview";
import { RouteReview } from "./RouteReview";
import { getJson, format } from "./api";
import "ol/ol.css";
import "./style.css";

const steps = ["Start", "Candidate", "Science", "Route", "Habitat"];
function App() {
  const [sites, setSites] = useState<SitesResponse["sites"]>([]);
  const [starts, setStarts] = useState<StartsResponse["starts"]>([]);
  const [siteError, setSiteError] = useState("");
  const [retry, setRetry] = useState(0);
  const [step, setStep] = useState(1);
  const [start, setStart] = useState("");
  const [destination, setDestination] = useState("");
  const [detail, setDetail] = useState<CandidateSite | null>(null);
  const [detailError, setDetailError] = useState("");
  const [route, setRoute] = useState<RouteResponse | null>(null);
  const [routeError, setRouteError] = useState("");
  const [loading, setLoading] = useState(false);
  const [context, setContext] = useState<MissionContext | null>(null);
  const [contextError, setContextError] = useState("");
  const [showFootprint, setShowFootprint] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setSiteError("");
    Promise.all([
      getJson<SitesResponse>("/api/sites", controller.signal),
      getJson<StartsResponse>("/api/starts", controller.signal),
    ])
      .then(([data, manifest]) => {
        if (!manifest.starts.length || !data.sites.length)
          throw new Error("No supported scouting starts are packaged.");
        setSites(data.sites);
        setStarts(manifest.starts);
        setStart(manifest.starts[0].id);
        setDestination(manifest.starts[0].destinations[0]?.siteId || "");
      })
      .catch((error) => {
        if (!controller.signal.aborted) setSiteError(error.message);
      });
    getJson<{ schemaVersion: string; context: MissionContext }>(
      "/api/mission-context",
      controller.signal,
    )
      .then((data) => {
        setContext(data.context);
        setContextError("");
      })
      .catch((error) => {
        if (!controller.signal.aborted) setContextError(error.message);
      });
    return () => controller.abort();
  }, [retry]);
  useEffect(() => {
    const controller = new AbortController();
    setDetail(null);
    setDetailError("");
    if (destination)
      getJson<SiteResponse>(
        `/api/sites/${encodeURIComponent(destination)}`,
        controller.signal,
      )
        .then((data) => setDetail(data.site))
        .catch((error) => {
          if (!controller.signal.aborted) setDetailError(error.message);
        });
    return () => controller.abort();
  }, [destination, retry]);
  useEffect(() => {
    const controller = new AbortController();
    setRoute(null);
    setRouteError("");
    if (!start || !destination) {
      setLoading(false);
      return () => controller.abort();
    }
    setLoading(true);
    getJson<RouteResponse>(
      `/api/routes?${new URLSearchParams({ startId: start, siteId: destination })}`,
      controller.signal,
    )
      .then(setRoute)
      .catch((error) => {
        if (!controller.signal.aborted) setRouteError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [start, destination, retry]);
  const supportedStart = starts.find((item) => item.id === start);
  const candidates = sites.filter((site) =>
    supportedStart?.destinations.some((pair) => pair.siteId === site.id),
  );
  const selected = candidates.find((site) => site.id === destination);
  const selectedDetail = detail?.id === destination ? detail : null;
  const activeRoute =
    route?.route.properties.startId === start &&
    route.route.properties.siteId === destination
      ? route
      : null;
  const chooseDestination = (id: string) => {
    if (candidates.some((site) => site.id === id)) setDestination(id);
  };
  const changeStart = (id: string) => {
    setStart(id);
    const record = starts.find((item) => item.id === id);
    if (!record?.destinations.some((pair) => pair.siteId === destination))
      setDestination(record?.destinations[0]?.siteId || "");
  };
  return (
    <main>
      <header>
        <div className="brand">
          MHF <span>/ MARS HABITAT FINDER</span>
        </div>
        <span className="badge">MARS GLOBAL SURVEYOR + MARS ODYSSEY</span>
      </header>
      <section className="intro">
        <p className="eyebrow">ARCADIA PLANITIA / EVIDENCE TO EXPLORATION</p>
        <h1>
          A place to explore.
          <br />
          <span>A reason to look closer.</span>
        </h1>
        <p>
          Follow real NASA terrain evidence from a scouting origin to a
          provisional path and an illustrative habitat concept.
        </p>
      </section>
      <nav className="journey" aria-label="Scouting journey">
        {steps.map((name, index) => (
          <button
            key={name}
            aria-current={step === index + 1 ? "step" : undefined}
            disabled={
              (index > 0 && !supportedStart) || (index > 1 && !selected)
            }
            onClick={() => setStep(index + 1)}
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
            {name}
          </button>
        ))}
      </nav>
      {siteError ? (
        <section role="alert" className="error">
          Could not load mission records: {siteError}{" "}
          <button onClick={() => setRetry((value) => value + 1)}>
            Retry API
          </button>
        </section>
      ) : !supportedStart ? (
        <p role="status">Loading scientific records and supported starts…</p>
      ) : (
        <>
          <section className="workspace guided-workspace">
            <aside className="panel">
              <p className="eyebrow">
                STEP {step} / 5 · {steps[step - 1].toUpperCase()}
              </p>
              {step === 1 && (
                <>
                  <h2>Choose a scouting origin</h2>
                  <p className="panel-copy">
                    Only terrain reference points with actual precomputed route
                    records appear here.
                  </p>
                  <label>
                    Starting location
                    <select
                      value={start}
                      onChange={(event) => changeStart(event.target.value)}
                    >
                      {starts.map((item) => (
                        <option value={item.id} key={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="hint">{supportedStart.validationScope}</p>
                  <div className="evidence-note">
                    <strong>One supported start</strong>
                    <p>
                      {supportedStart.destinations.length} recorded destination
                      pairs. Arbitrary map clicks do not create a new route or
                      move a site.
                    </p>
                  </div>
                </>
              )}
              {step === 2 && (
                <>
                  <h2>Choose a candidate</h2>
                  <p className="panel-copy">
                    Discovered from NASA MOLA regional slope and observation
                    quality. These are terrain candidates, not certified habitat
                    locations.
                  </p>
                  <div className="candidate-cards">
                    {candidates.map((site, index) => (
                      <button
                        key={site.id}
                        className={
                          destination === site.id
                            ? "candidate-card selected"
                            : "candidate-card"
                        }
                        aria-pressed={destination === site.id}
                        onClick={() => chooseDestination(site.id)}
                      >
                        <span className="eyebrow">CANDIDATE {index + 1}</span>
                        <strong>{site.name}</strong>
                        <span>
                          {format(
                            site.suitability.factors.terrain.observation.value,
                            3,
                          )}
                          ° regional slope
                        </span>
                        <span>
                          Overall confidence: {site.evidenceConfidence.level}
                        </span>
                      </button>
                    ))}
                  </div>
                  {!candidates.length && (
                    <p role="status">
                      No destination pairs have been computed for this start.
                    </p>
                  )}
                </>
              )}
              {step === 3 && (
                <>
                  <h2>Understand the evidence</h2>
                  <p className="panel-copy">
                    A favorable terrain score cannot answer whether humans can
                    live here.
                  </p>
                  <div className="evidence-note">
                    <strong>
                      Overall suitability: {format(selected?.suitability.score)}
                    </strong>
                    <p>
                      Overall evidence confidence:{" "}
                      {selected?.evidenceConfidence.level || "unknown"}
                    </p>
                    <p>Water, radiation and shielding remain unresolved.</p>
                  </div>
                  <p className="hint">
                    Compare the candidates and inspect individual observations
                    and sources below.
                  </p>
                </>
              )}
              {step === 4 && (
                <>
                  <h2>Review the scouting path</h2>
                  <p className="panel-copy">
                    Only the selected start/destination record is shown. All
                    scientific calculations were performed offline.
                  </p>
                  <RouteReview
                    response={activeRoute}
                    loading={loading}
                    error={routeError}
                  />
                </>
              )}
              {step === 5 && (
                <>
                  <h2>Imagine a habitat</h2>
                  <p className="panel-copy">
                    An illustration to communicate a possible research outpost,
                    linked to the selected site.
                  </p>
                  <div className="evidence-note">
                    <strong>Illustrative, not engineering-validated</strong>
                    <p>
                      No dimensions, shielding performance, crop yields or
                      life-support feasibility have been calculated.
                    </p>
                  </div>
                  <p className="hint">
                    {selected?.name}
                    <br />
                    {selected?.location.coordinates
                      .map((value) => value.toFixed(5))
                      .join("°, ")}
                    ° · Mars
                  </p>
                </>
              )}
              <div className="step-actions">
                <button
                  disabled={step === 1}
                  onClick={() => setStep((value) => value - 1)}
                >
                  Back
                </button>
                {step < 5 && (
                  <button
                    className="primary"
                    disabled={!selected && step >= 2}
                    onClick={() => setStep((value) => value + 1)}
                  >
                    {
                      [
                        "Choose a candidate",
                        "Understand the science",
                        "View scouting route",
                        "Preview habitat",
                      ][step - 1]
                    }{" "}
                    →
                  </button>
                )}
              </div>
            </aside>
            <div className="map-panel">
              {step === 3 ? (
                <ScienceReview
                  candidates={candidates}
                  selected={selectedDetail}
                  error={detailError}
                  context={context}
                  contextError={contextError}
                />
              ) : step === 5 && selected ? (
                <HabitatPreview site={selected} />
              ) : (
                <>
                  <div className="map-heading">
                    <span>ARCADIA / MARS COORDINATE MAP</span>
                    <span>{selected?.name || "SELECT A CANDIDATE"}</span>
                  </div>
                  <MarsMap
                    sites={sites}
                    route={step >= 4 ? activeRoute?.route || null : null}
                    startId={start}
                    destinationId={destination}
                    selectDestination={chooseDestination}
                    footprint={showFootprint ? context?.footprint || null : null}
                  />
                  <div className="legend">
                    <span className="start-dot">● Reference start</span>
                    <span className="site-dot">● Candidate</span>
                    <span className="line">━ Provisional path</span>
                  </div>
                  {context && (
                    <label className="footprint-toggle">
                      <input type="checkbox" checked={showFootprint}
                        onChange={(event) => setShowFootprint(event.target.checked)} />
                      THEMIS historical observation footprint · approximate coverage
                    </label>
                  )}
                  <p className="map-caption">
                    Pan, zoom or select a candidate marker. Mars spherical
                    equirectangular coordinate grid; no imagery basemap. The
                    site locations are fixed scientific records. Optional purple
                    shading is the official ODE footprint, not temperature imagery
                    or pixel-level geolocation.
                  </p>
                </>
              )}
            </div>
          </section>
          {step === 4 && (
            <section className="warnings">
              <p className="eyebrow">HUMAN REVIEW REQUIRED</p>
              <h2>A route is a hypothesis to investigate.</h2>
              <ul>
                {(
                  activeRoute?.route.properties.warnings || [
                    "No route record is currently displayed.",
                  ]
                ).map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
      <footer>
        NASA MOLA terrain evidence · THEMIS historical observation context
        <span>All sites remain unvalidated for human habitation.</span>
      </footer>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
