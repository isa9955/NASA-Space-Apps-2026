import { useEffect, useRef } from "react";
import L from "leaflet";
import { renderToStaticMarkup } from "react-dom/server";
import { Microscope } from "lucide-react";
import { CircleMarker, ImageOverlay, MapContainer, Marker, Pane, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import type { LonLat, RegionResponse, RouteResponse, RouteVariant } from "../api/schema";
import { toLeafletBounds } from "../lib/geo";

// NASA Mars Trek: 2x1 equirectangular tiles at zoom 0 = Leaflet's EPSG4326
// tiling object. Used only as dim context around the site.
const TREK_URL =
  "https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm/{z}/{y}/{x}.jpg";

export type RouteKind = "standard" | "safe";

interface Props {
  region: RegionResponse;
  basemapUrl: string;
  zoneImages: Array<{ id: string; url: string }>;
  placing: "start" | "end" | null;
  start: LonLat | null;
  end: LonLat | null;
  route: RouteResponse | null;
  focus: RouteKind | null;
  inspect: LonLat | null;
  onMapClick: (p: LonLat) => void;
}

const ll = ([lon, lat]: LonLat): [number, number] => [lat, lon];

function Clicks({ onClick }: { onClick: (p: LonLat) => void }) {
  const ref = useRef(onClick);
  ref.current = onClick;
  useMapEvents({ click: (e) => ref.current([e.latlng.lng, e.latlng.lat]) });
  return null;
}

function FitRegion({ bounds }: { bounds: RegionResponse["region"]["bounds"] }) {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    map.fitBounds(toLeafletBounds(bounds), { padding: [24, 24] });
  }, [map, bounds]);
  return null;
}

function endpointIcon(label: "START" | "END") {
  return L.divIcon({
    className: "",
    html: `<div class="ep"><span class="ep-label">${label}</span><span class="ep-dot ${label === "START" ? "ep-start" : "ep-end"}"></span></div>`,
    iconSize: [64, 44],
    iconAnchor: [32, 35]
  });
}
const START_ICON = endpointIcon("START");
const END_ICON = endpointIcon("END");

const scoutIcon = (n: number) =>
  L.divIcon({ className: "", html: `<div class="scout">${n}</div>`, iconSize: [24, 24], iconAnchor: [12, 12] });

const SCI_ICON = L.divIcon({
  className: "",
  html: `<div class="sci">${renderToStaticMarkup(<Microscope size={13} color="#fff" strokeWidth={2.2} />)}</div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12]
});

function RouteLine({ v, focus }: { v: RouteVariant; focus: RouteKind | null }) {
  const pos = v.geometry.coordinates.map(ll);
  const dim = focus !== null && focus !== v.kind;
  const strong = focus === v.kind;
  const safe = v.kind === "safe";
  return (
    <>
      <Polyline
        positions={pos}
        interactive={false}
        pathOptions={{ color: "#0b0e13", weight: strong ? 8 : 6, opacity: dim ? 0.1 : 0.35, lineCap: "round", lineJoin: "round" }}
      />
      <Polyline
        positions={pos}
        interactive={false}
        pathOptions={{
          color: safe ? "#3fb950" : "#4c9aff",
          weight: strong ? 5 : 3.5,
          opacity: dim ? 0.3 : 1,
          dashArray: safe ? "8 7" : undefined,
          lineCap: "round",
          lineJoin: "round"
        }}
      />
    </>
  );
}

export function SiteMap(p: Props) {
  const bounds = toLeafletBounds(p.region.region.bounds);
  const [[s, w], [n, e]] = bounds;
  const padLat = (n - s) * 1.5;
  const padLon = (e - w) * 1.5;
  const ok = p.route?.status === "ok" ? p.route : null;

  return (
    <MapContainer
      className={`map${p.placing ? " placing" : ""}`}
      crs={L.CRS.EPSG4326}
      bounds={bounds}
      maxBounds={[
        [s - padLat, w - padLon],
        [n + padLat, e + padLon]
      ]}
      maxBoundsViscosity={0.9}
      minZoom={8}
      maxZoom={17}
      zoomSnap={0.25}
      worldCopyJump={false}
    >
      <TileLayer
        url={TREK_URL}
        className="trek-bg"
        maxNativeZoom={7}
        noWrap
        attribution='Context: <a href="https://trek.nasa.gov/mars/" target="_blank" rel="noreferrer">NASA Mars Trek</a>'
      />
      <FitRegion bounds={p.region.region.bounds} />
      <Clicks onClick={p.onMapClick} />

      <Pane name="terrain" style={{ zIndex: 300 }}>
        <ImageOverlay url={p.basemapUrl} bounds={bounds} className="terrain-img" />
      </Pane>
      <Pane name="zones" style={{ zIndex: 350 }}>
        {[...p.zoneImages].reverse().map((z) => (
          <ImageOverlay key={z.id} url={z.url} bounds={bounds} className="zone-img" />
        ))}
      </Pane>
      <Pane name="routes" style={{ zIndex: 450 }}>
        {ok?.safe && <RouteLine v={ok.safe} focus={p.focus} />}
        {ok?.standard && <RouteLine v={ok.standard} focus={p.focus} />}
      </Pane>

      {ok?.scienceTargets.map((t) => (
        <Marker key={t.id} position={ll(t.location)} icon={SCI_ICON}>
          <Tooltip direction="top" offset={[0, -12]}>
            Science target · {t.label}
          </Tooltip>
        </Marker>
      ))}
      {ok?.scoutPoints.map((sp) => (
        <Marker key={sp.rank} position={ll(sp.location)} icon={scoutIcon(sp.rank)} zIndexOffset={200}>
          <Tooltip direction="top" offset={[0, -12]}>
            <strong>
              {sp.blindspotPts}-pt blindspot · {sp.alongM.toLocaleString("en-US")} m in
            </strong>
            <br />
            Slope {sp.slopeDeg}° ± {sp.slopeUncDeg}° · worst-case traversability {sp.worstCaseTravPct}%
          </Tooltip>
        </Marker>
      ))}
      {p.start && <Marker position={ll(p.start)} icon={START_ICON} interactive={false} zIndexOffset={400} />}
      {p.end && <Marker position={ll(p.end)} icon={END_ICON} interactive={false} zIndexOffset={400} />}
      {p.inspect && (
        <CircleMarker
          center={ll(p.inspect)}
          radius={6}
          interactive={false}
          pathOptions={{ color: "#0b0e13", weight: 2, fillColor: "#fff", fillOpacity: 1 }}
        />
      )}
    </MapContainer>
  );
}
