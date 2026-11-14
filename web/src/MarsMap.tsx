import { useEffect, useRef } from "react";
import Map from "ol/Map.js";
import View from "ol/View.js";
import Feature from "ol/Feature.js";
import Point from "ol/geom/Point.js";
import LineString from "ol/geom/LineString.js";
import Polygon from "ol/geom/Polygon.js";
import VectorSource from "ol/source/Vector.js";
import VectorLayer from "ol/layer/Vector.js";
import Projection from "ol/proj/Projection.js";
import { Style, Stroke, Fill, Circle as CircleStyle, Text } from "ol/style.js";
import type { SiteSummary } from "../../api/src/contracts/site";
import type { RouteFeature } from "../../api/src/contracts/route";
import type { MissionContext } from "../../api/src/contracts/journey";

const radius = 3396000;
// Display-only transformation, matching the MOLA spherical equirectangular CRS.
export const project = ([lon, lat]: number[]) => [
  (radius * (lon - 180) * Math.PI) / 180,
  (radius * lat * Math.PI) / 180,
];
const projection = new Projection({
  code: "MARS:MOLA-EQC",
  units: "m",
  extent: [...project([180, 0]), ...project([270, 44])],
  metersPerUnit: 1,
});

export function MarsMap({
  sites,
  route,
  startId,
  destinationId,
  selectDestination,
  footprint,
}: {
  sites: SiteSummary[];
  route: RouteFeature | null;
  startId: string;
  destinationId: string;
  selectDestination: (id: string) => void;
  footprint: MissionContext["footprint"] | null;
}) {
  const target = useRef<HTMLDivElement>(null);
  const map = useRef<Map | null>(null);
  const source = useRef(new VectorSource());
  const contextSource = useRef(new VectorSource());
  const choose = useRef(selectDestination);
  choose.current = selectDestination;
  useEffect(() => {
    if (!target.current) return;
    const grid = new VectorSource();
    for (let lon = 194.7; lon <= 195.3; lon += 0.1)
      grid.addFeature(
        new Feature(
          new LineString([project([lon, 37.7]), project([lon, 38.3])]),
        ),
      );
    for (let lat = 37.7; lat <= 38.3; lat += 0.1)
      grid.addFeature(
        new Feature(
          new LineString([project([194.7, lat]), project([195.3, lat])]),
        ),
      );
    const instance = new Map({
      target: target.current,
      layers: [
        new VectorLayer({
          source: grid,
          style: new Style({
            stroke: new Stroke({ color: "#52626855", width: 1 }),
          }),
        }),
        new VectorLayer({
          source: contextSource.current,
          style: new Style({
            fill: new Fill({ color: "#baabed20" }),
            stroke: new Stroke({ color: "#baabed", width: 2, lineDash: [8, 5] }),
          }),
        }),
        new VectorLayer({ source: source.current }),
      ],
      view: new View({
        projection,
        center: project([195, 38]),
        resolution: 70,
        minResolution: 1,
        maxResolution: 1000,
      }),
    });
    instance.on("singleclick", (event) =>
      instance.forEachFeatureAtPixel(event.pixel, (feature) => {
        const id: unknown = feature.get("siteId");
        if (typeof id === "string") {
          choose.current(id);
          return true;
        }
      }),
    );
    target.current
      .querySelector(".ol-zoom-in")
      ?.setAttribute("aria-label", "Zoom in");
    target.current
      .querySelector(".ol-zoom-out")
      ?.setAttribute("aria-label", "Zoom out");
    map.current = instance;
    return () => {
      instance.setTarget(undefined);
      map.current = null;
    };
  }, []);
  useEffect(() => {
    contextSource.current.clear();
    if (footprint)
      contextSource.current.addFeature(new Feature(new Polygon(
        footprint.geometry.coordinates.map((ring) => ring.map(project)),
      )));
    // Keep the camera fitted to sites/routes, never the much larger image strip.
  }, [footprint]);
  useEffect(() => {
    const layer = source.current;
    layer.clear();
    if (route?.geometry) {
      const feature = new Feature(
        new LineString(route.geometry.coordinates.map(project)),
      );
      feature.setStyle(
        new Style({ stroke: new Stroke({ color: "#78d6c7", width: 4 }) }),
      );
      layer.addFeature(feature);
    }
    for (const [index, site] of sites.entries()) {
      const isStart = site.id === startId;
      const selected = site.id === destinationId;
      const feature = new Feature({
        geometry: new Point(project(site.location.coordinates)),
        siteId: site.id,
      });
      feature.setStyle(
        new Style({
          image: new CircleStyle({
            radius: selected ? 9 : 7,
            fill: new Fill({ color: isStart ? "#f9ce91" : "#d37b56" }),
            stroke: new Stroke({ color: "#fff3df", width: 2 }),
          }),
          text: new Text({
            text: isStart ? "START" : `SITE ${index}`,
            offsetY: -22,
            font: "bold 12px sans-serif",
            fill: new Fill({ color: "#fff3df" }),
            stroke: new Stroke({ color: "#142127", width: 4 }),
          }),
        }),
      );
      layer.addFeature(feature);
    }
    const extent = layer.getExtent();
    if (sites.length && map.current && extent)
      map.current
        .getView()
        .fit(extent, { padding: [70, 70, 70, 70], maxZoom: 15, duration: 200 });
  }, [sites, route, startId, destinationId]);
  return (
    <div
      className="map"
      ref={target}
      tabIndex={0}
      role="region"
      aria-label="Interactive Arcadia Planitia Mars map. Pan and zoom, or use the labeled site selectors."
    />
  );
}
