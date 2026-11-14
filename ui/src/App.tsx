import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { assetUrl, getConditions, getRegion, getRoute } from "./api/client";
import type { ConditionsResponse, LonLat, RegionResponse, RouteResponse } from "./api/schema";
import { inBounds } from "./lib/geo";
import { tintMask } from "./lib/mask";
import { SiteMap, type RouteKind } from "./map/SiteMap";
import { ConditionsCard } from "./panels/ConditionsCard";
import { Header } from "./panels/Header";
import type { Loadable } from "./panels/loadable";
import { MapLegend } from "./panels/MapLegend";
import { RoutePlanner } from "./panels/RoutePlanner";
import { ZonesPanel } from "./panels/ZonesPanel";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");

/** Runs an async load and ignores results from loads that were superseded. */
function useLatest<T>() {
  const [state, setState] = useState<Loadable<T> | null>(null);
  const seq = useRef(0);
  const run = useCallback((p: Promise<T>) => {
    const id = ++seq.current;
    setState({ status: "loading" });
    p.then(
      (data) => id === seq.current && setState({ status: "ok", data }),
      (e) => id === seq.current && setState({ status: "error", message: errMsg(e) })
    );
  }, []);
  const clear = useCallback(() => {
    seq.current++;
    setState(null);
  }, []);
  return [state, run, clear] as const;
}

export default function App() {
  const [region, loadRegion] = useLatest<RegionResponse>();
  const [layersOn, setLayersOn] = useState<Record<string, boolean>>({});
  const [tinted, setTinted] = useState<Record<string, string>>({});
  const [maskFailed, setMaskFailed] = useState<Record<string, boolean>>({});

  const [placing, setPlacing] = useState<"start" | "end" | null>(null);
  const [start, setStart] = useState<LonLat | null>(null);
  const [end, setEnd] = useState<LonLat | null>(null);
  const [route, runRoute, clearRoute] = useLatest<RouteResponse>();
  const [focus, setFocus] = useState<RouteKind | null>(null);

  const [inspect, setInspect] = useState<LonLat | null>(null);
  const [conditions, runConditions, clearConditions] = useLatest<ConditionsResponse>();
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => loadRegion(getRegion()), [loadRegion]);
  const r = region?.status === "ok" ? region.data : null;

  // Once the region arrives: default toggles + tint every zone mask.
  useEffect(() => {
    if (!r) return;
    setLayersOn(Object.fromEntries(r.layers.map((l) => [l.id, l.defaultOn])));
    let cancelled = false;
    for (const l of r.layers) {
      tintMask(assetUrl(l.mask.url), l.color).then(
        (url) => !cancelled && setTinted((t) => ({ ...t, [l.id]: url })),
        (e) => {
          console.error(`[zones] mask ${l.id} failed`, e);
          if (!cancelled) setMaskFailed((f) => ({ ...f, [l.id]: true }));
        }
      );
    }
    return () => {
      cancelled = true;
    };
  }, [r]);

  const zoneImages = useMemo(
    () => (r ? r.layers.filter((l) => layersOn[l.id] && tinted[l.id]).map((l) => ({ id: l.id, url: tinted[l.id] })) : []),
    [r, layersOn, tinted]
  );

  const plan = useCallback(
    (a: LonLat, b: LonLat) => {
      setFocus(null);
      runRoute(getRoute(a, b));
    },
    [runRoute]
  );

  const onMapClick = useCallback(
    (p: LonLat) => {
      if (!r) return;
      if (!inBounds(p, r.region.bounds)) {
        setNotice(`Outside the mapped site. Click inside ${r.region.name}.`);
        return;
      }
      setNotice(null);
      if (placing === "start") {
        setStart(p);
        clearRoute();
        if (end) {
          setPlacing(null);
          plan(p, end);
        } else setPlacing("end");
        return;
      }
      if (placing === "end") {
        setEnd(p);
        setPlacing(null);
        if (start) plan(start, p);
        return;
      }
      setInspect(p);
      runConditions(getConditions(p));
    },
    [r, placing, start, end, plan, clearRoute, runConditions]
  );

  const clearAll = () => {
    setStart(null);
    setEnd(null);
    setPlacing(null);
    setFocus(null);
    clearRoute();
  };

  const runDemo =
    r?.demoTraverse != null
      ? () => {
          const { from, to } = r.demoTraverse!;
          setStart(from);
          setEnd(to);
          setPlacing(null);
          plan(from, to);
        }
      : null;

  const closeConditions = useCallback(() => {
    setInspect(null);
    clearConditions();
  }, [clearConditions]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setPlacing(null);
      closeConditions();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeConditions]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  return (
    <div className="app">
      <Header region={r} />

      <main className="map-area">
        {region?.status === "error" && (
          <div className="map-message error">
            <strong>Could not load the site.</strong>
            <span>{region.message}</span>
            <button className="btn" onClick={() => loadRegion(getRegion())}>
              Retry
            </button>
          </div>
        )}
        {(!region || region.status === "loading") && <div className="map-message">Loading site…</div>}
        {r && (
          <>
            <SiteMap
              region={r}
              basemapUrl={assetUrl(r.basemap.url)}
              zoneImages={zoneImages}
              placing={placing}
              start={start}
              end={end}
              route={route?.status === "ok" ? route.data : null}
              focus={focus}
              inspect={inspect}
              onMapClick={onMapClick}
            />
            <MapLegend region={r} />
            {inspect && conditions && <ConditionsCard point={inspect} state={conditions} onClose={closeConditions} />}
            {notice && <div className="toast">{notice}</div>}
          </>
        )}
      </main>

      <aside className="side">
        {r && (
          <>
            <ZonesPanel
              layers={r.layers}
              on={layersOn}
              failed={maskFailed}
              onToggle={(id) => setLayersOn((s) => ({ ...s, [id]: !s[id] }))}
            />
            <RoutePlanner
              hasStart={!!start}
              hasEnd={!!end}
              placing={placing}
              onPlace={(w) => setPlacing((cur) => (cur === w ? null : w))}
              onClear={clearAll}
              onDemo={runDemo}
              state={route}
              onFocus={setFocus}
            />
          </>
        )}
      </aside>
    </div>
  );
}
