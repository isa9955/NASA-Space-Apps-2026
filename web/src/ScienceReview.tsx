import type { CandidateSite, SiteSummary } from "../../api/src/contracts/site";
import type { MissionContext } from "../../api/src/contracts/journey";
import { format } from "./api";

export function ScienceReview({
  candidates,
  selected,
  error,
  context,
  contextError,
}: {
  candidates: SiteSummary[];
  selected: CandidateSite | null;
  error: string;
  context: MissionContext | null;
  contextError: string;
}) {
  return (
    <section className="science-review">
      <p className="eyebrow">03 / SCIENTIFIC EVIDENCE</p>
      <h2>Compare what the evidence can support.</h2>
      <p className="section-copy">
        The terrain screen is a project heuristic. Evidence confidence describes
        support for the observations. Neither is a probability of habitability
        or survival.
      </p>
      <div className="comparison-scroll">
        <table>
          <caption>Candidate comparison · no overall habitat ranking</caption>
          <thead>
            <tr>
              <th scope="col">Evidence</th>
              {candidates.map((site) => (
                <th scope="col" key={site.id}>
                  {site.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Regional slope</th>
              {candidates.map((site) => (
                <td key={site.id}>
                  {format(
                    site.suitability.factors.terrain.observation.value,
                    3,
                  )}
                  °
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row">
                Terrain screen / 100 <small>Project assumptions</small>
              </th>
              {candidates.map((site) => (
                <td key={site.id}>
                  {format(site.suitability.factors.terrain.score, 2)}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row">Terrain evidence confidence</th>
              {candidates.map((site) => (
                <td key={site.id}>
                  {site.evidenceConfidence.factors.terrain.level}
                </td>
              ))}
            </tr>
            <tr className="critical-row">
              <th scope="row">Overall habitat suitability</th>
              {candidates.map((site) => (
                <td key={site.id}>{format(site.suitability.score)}</td>
              ))}
            </tr>
            <tr className="critical-row">
              <th scope="row">Overall evidence confidence</th>
              {candidates.map((site) => (
                <td key={site.id}>{site.evidenceConfidence.level}</td>
              ))}
            </tr>
            <tr>
              <th scope="row">SWIM water-ice evidence</th>
              {candidates.map((site) => (
                <td key={site.id}>{site.suitability.factors.water.status}</td>
              ))}
            </tr>
            <tr>
              <th scope="row">Radiation / shielding</th>
              {candidates.map((site) => (
                <td key={site.id}>
                  {site.radiationReview.risk} /{" "}
                  {site.radiationReview.shieldingRequirements}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      {error ? (
        <p role="alert" className="error">
          Scientific details unavailable: {error}
        </p>
      ) : !selected ? (
        <p role="status">Loading selected site observations and provenance…</p>
      ) : (
        <div className="science-columns">
          <article>
            <h3>{selected.name}: available observations</h3>
            <dl className="observation-list">
              {Object.entries(selected.observations).map(
                ([key, observation]) => (
                  <div key={key}>
                    <dt>
                      {(
                        {
                          molaTopography: "MOLA elevation",
                          molaObservationCount: "MOLA center-cell observations",
                          molaRegionalSlope: "Regional slope",
                          swimCombinedIceConsistency: "SWIM ice consistency",
                        } as Record<string, string>
                      )[key] || key}
                    </dt>
                    <dd>
                      {observation.value === null
                        ? "Unavailable"
                        : `${format(observation.value, 3)} ${observation.unit || ""}`}
                      <small>
                        {observation.status.replaceAll("_", " ")} ·{" "}
                        {observation.sourceId}
                      </small>
                    </dd>
                  </div>
                ),
              )}
            </dl>
            <h3>Why this is a partial assessment</h3>
            <ul>
              {selected.suitability.explanation.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
            <p className="hint">
              Scoring version: {selected.suitability.algorithmVersion}. Factor
              weights are not redistributed when data is missing.
            </p>
            <h3>Missing information</h3>
            <div className="missing-tags">
              {selected.missingInformation.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </article>
          <article>
            <h3>Confidence explained</h3>
            <p>
              Overall evidence confidence:{" "}
              <strong>{selected.evidenceConfidence.level}</strong>
            </p>
            <ul>
              {selected.evidenceConfidence.rationale.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
            <details>
              <summary>
                Terrain confidence:{" "}
                {selected.evidenceConfidence.factors.terrain.level}
              </summary>
              <ul>
                {selected.evidenceConfidence.factors.terrain.rationale.map(
                  (reason) => (
                    <li key={reason}>{reason}</li>
                  ),
                )}
              </ul>
            </details>
            <details>
              <summary>
                Water confidence:{" "}
                {selected.evidenceConfidence.factors.water.level}
              </summary>
              <ul>
                {selected.evidenceConfidence.factors.water.rationale.map(
                  (reason) => (
                    <li key={reason}>{reason}</li>
                  ),
                )}
              </ul>
            </details>
            <h3>Review limitations</h3>
            <ul>
              {[...selected.limitations, ...selected.humanReviewWarnings].map(
                (reason) => (
                  <li key={reason}>{reason}</li>
                ),
              )}
            </ul>
          </article>
        </div>
      )}
      {selected && (
        <section className="provenance">
          <h3>Trace the NASA evidence</h3>
          {selected.sources.map((source) => (
            <details key={source.id}>
              <summary>
                {source.productId} · {source.availability}
              </summary>
              <p>{source.provider}</p>
              <p>
                <a href={source.productUrl}>Official product / product page</a>
              </p>
              {typeof source.productVersion === "string" && (
                <p>Product version: {source.productVersion}</p>
              )}
              {typeof source.observationsPeriod === "string" && (
                <p>Observation period: {source.observationsPeriod}</p>
              )}
              {typeof source.retrievalNote === "string" && (
                <p>{source.retrievalNote}</p>
              )}
              {typeof source.regionalRasterSha256 === "string" && (
                <p className="hash">
                  Regional raster SHA-256: {source.regionalRasterSha256}
                </p>
              )}
            </details>
          ))}
        </section>
      )}
      <section className="mission-context">
        <p className="eyebrow">SECOND MISSION / HISTORICAL CONTEXT ONLY</p>
        <h3>Mars Odyssey · THEMIS</h3>
        {context ? (
          <>
            <p>
              <strong>{context.productId}</strong> · Observed{" "}
              {context.observationStartUtc}
            </p>
            <p>
              Whole-observation label range:{" "}
              <strong>
                {format(context.labelBrightnessTemperatureRange.minimum, 2)}–
                {format(context.labelBrightnessTemperatureRange.maximum, 2)} K
              </strong>{" "}
              brightness temperature.
            </p>
            <p>
              Band {context.band} · {context.bandCenterMicrometers} µm ·
              approximately {format(context.sampleResolutionMeters, 1)} ×{" "}
              {format(context.lineResolutionMeters, 1)} m per pixel at the
              observation center.
            </p>
            <p>
              Selected site: {context.footprint.siteCoverage.find((site) => site.siteId === selected?.id)?.insideApproximateFootprint
                ? "inside the approximate ODE observation footprint"
                : "coverage not established"}. This is a catalog coverage check,
              not an extracted local temperature. The map overlay uses the same
              east-positive, planetocentric Mars coordinates as MOLA.
            </p>
            <ul>
              {context.limitations.map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ul>
            <details>
              <summary>THEMIS provenance</summary>
              <p>
                Dataset {context.dataSetId} · product version{" "}
                {context.productVersion}
              </p>
              <a href={context.sourceUrl}>
                Official archived image and attached label
              </a>
              <p className="hash">Product SHA-256: {context.sourceSha256}</p>
              <p><a href={context.footprint.sourceUrl}>Official ODE footprint KML</a></p>
              <p>{context.footprint.coverageScope}</p>
              <p className="hash">Footprint SHA-256: {context.footprint.sourceSha256}</p>
              <a href={context.unitsReference}>
                NASA PDS brightness-temperature units
              </a>
            </details>
          </>
        ) : (
          <p role="status">
            {contextError || "Loading optional historical observation context…"}{" "}
            MOLA site analysis and routing remain available.
          </p>
        )}
      </section>
    </section>
  );
}
