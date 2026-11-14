import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { assetUrl, getConditions, getRegion, getRoute } from "./api/client";
import type { ConditionsResponse, LonLat, RegionResponse, RouteResponse } from "./api/schema";
import { inBounds } from "./lib/geo";
import { fitAt, loadMask, pixelToLonLat, robustPatches, type DecodedMask } from "./lib/mask";
import { SiteMap, type RouteKind, type ZoneMarker } from "./map/SiteMap";
import { ConditionsCard, type ZoneFit } from "./panels/ConditionsCard";
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
  const [masks, setMasks] = useState<Record<string, DecodedMask>>({});
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
      loadMask(assetUrl(l.mask.url), l.color).then(
        (m) => !cancelled && setMasks((t) => ({ ...t, [l.id]: m })),
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
    () => (r ? r.layers.filter((l) => layersOn[l.id] && masks[l.id]).map((l) => ({ id: l.id, url: masks[l.id].url })) : []),
    [r, layersOn, masks]
  );

  // Symbols on the map: the two largest robust patches of each zone (computed once per mask).
  const patchMarkers = useMemo(() => {
    const out: Record<string, ZoneMarker[]> = {};
    if (!r) return out;
    const [kmW, kmH] = r.region.dataset.sizeKm;
    for (const l of r.layers) {
      const m = masks[l.id];
      if (!m) continue;
      const km2PerPx = (kmW * kmH) / (m.width * m.height);
      const minPx = Math.ceil(0.02 / km2PerPx); // ignore patches under 0.02 km²
      out[l.id] = robustPatches(m.values, m.width, m.height, minPx, 2).map((p, i) => ({
        key: `${l.id}-${i}`,
        layer: l,
        location: pixelToLonLat(p.x, p.y, m.width, m.height, r.region.bounds),
        areaKm2: p.pixels * km2PerPx,
        rank: i + 1
      }));
    }
    return out;
  }, [r, masks]);
  const zoneMarkers = useMemo(() => {
    if (!r) return [];
    const list = r.layers.filter((l) => layersOn[l.id]).flatMap((l) => patchMarkers[l.id] ?? []);
    // Zones overlap on flat ground, so pins often land together: group close pins and spread them in a row.
    const near = (r.region.bounds[2] - r.region.bounds[0]) * 0.06;
    const groups: ZoneMarker[][] = [];
    for (const m of list) {
      const g = groups.find((gr) => Math.hypot(gr[0].location[0] - m.location[0], gr[0].location[1] - m.location[1]) < near);
      if (g) g.push(m);
      else groups.push([m]);
    }
    return groups.flatMap((g) => g.map((m, i) => ({ ...m, location: g[0].location, slot: i - (g.length - 1) / 2 })));
  }, [r, layersOn, patchMarkers]);

  // Which zones the inspected point falls in (from the same masks as the map).
  const fits = useMemo<ZoneFit[] | null>(() => {
    if (!r || !inspect) return null;
    if (r.layers.some((l) => !masks[l.id] && !maskFailed[l.id])) return null; // still loading
    return r.layers.flatMap((l) => {
      const m = masks[l.id];
      const f = m ? fitAt(inspect, m, r.region.bounds) : null;
      return f ? [{ layer: l, fit: f }] : [];
    });
  }, [r, inspect, masks, maskFailed]);

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
              zoneMarkers={zoneMarkers}
              placing={placing}
              start={start}
              end={end}
              route={route?.status === "ok" ? route.data : null}
              focus={focus}
              inspect={inspect}
              onMapClick={onMapClick}
            />
            <MapLegend region={r} activeLayers={r.layers.filter((l) => layersOn[l.id])} />
            {inspect && conditions && <ConditionsCard point={inspect} state={conditions} fits={fits} onClose={closeConditions} />}
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
