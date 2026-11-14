import type { RouteResponse } from "../../api/src/contracts/route";
import { format } from "./api";
export function RouteReview({
  response,
  loading,
  error,
}: {
  response: RouteResponse | null;
  loading: boolean;
  error: string;
}) {
  const route = response?.route.properties;
  const coverage = route?.evidenceCoverage;
  return (
    <div aria-live="polite">
      {loading && <p role="status">Loading precomputed route…</p>}
      {error && (
        <p role="alert" className="error">
          Route unavailable: {error}
        </p>
      )}
      {route && (
        <>
          <p className="route-status">
            {route.status === "provisional"
              ? "PROVISIONAL ROUTE"
              : "ROUTE UNAVAILABLE"}
          </p>
          {route.status === "unavailable" ? (
            <p role="alert">{route.unavailableReason?.replaceAll("_", " ")}</p>
          ) : (
            <>
              <dl className="metrics">
                <div>
                  <dt>Surface distance</dt>
                  <dd>
                    {format(
                      route.distanceMeters === null
                        ? null
                        : route.distanceMeters / 1000,
                      2,
                    )}{" "}
                    <small>km</small>
                  </dd>
                </div>
                <div>
                  <dt>Elevation gain</dt>
                  <dd>
                    {format(route.elevationGainMeters, 0)} <small>m</small>
                  </dd>
                </div>
                <div>
                  <dt>Maximum slope</dt>
                  <dd>{format(route.maximumSlopeDegrees, 2)}°</dd>
                </div>
                <div>
                  <dt>Mean regional slope</dt>
                  <dd>{format(route.meanRegionalSlopeDegrees, 2)}°</dd>
                </div>
              </dl>
              {coverage && (
                <div className="coverage">
                  <strong>Evidence along this path</strong>
                  <p>
                    {coverage.directCellCount} directly observed /{" "}
                    {coverage.interpolatedCellCount} interpolated cells
                  </p>
                  <p>
                    {format(coverage.interpolatedDistanceFraction * 100)}% of
                    distance touches an interpolated cell.
                  </p>
                  <p>
                    {format(
                      coverage.meanNeighborhoodInterpolationFraction * 100,
                    )}
                    % mean interpolation in slope neighborhoods.
                  </p>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
