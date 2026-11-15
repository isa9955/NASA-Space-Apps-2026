import { assetUrl, getRegion } from "../api/client";
export { getRoute, getConditions } from "../api/client";
export const fmt = (n, digits = 0) =>
  Number(n).toLocaleString("en-US", { maximumFractionDigits: digits });
export const coords = (p) => `${p[0].toFixed(5)}° E · ${p[1].toFixed(5)}° N`;
export const shortNames = {
  habitat: "Habitat / base",
  landing: "Landing pad",
  ice_access: "Ice access",
  greenhouse: "Greenhouse",
  datacenter: "Data center",
  solar: "Solar array",
};
export const uvFor = (p, b) => [
  (p[0] - b[0]) / (b[2] - b[0]),
  (b[3] - p[1]) / (b[3] - b[1]),
];
export const pointFor = (u, v, b) => [
  b[0] + u * (b[2] - b[0]),
  b[3] - v * (b[3] - b[1]),
];
let pending;
export function loadData() {
  if (!pending)
    pending = Promise.all([
      getRegion(),
      fetch("/terrain/deuteronilus.json").then((r) => {
        if (!r.ok) throw Error("Display terrain unavailable");
        return r.json();
      }),
    ])
      .then(([region, terrain]) => {
        if (
          region.dataBadge.kind !== "real" ||
          region.region.id !== terrain.regionId
        )
          throw Error("This 3D view requires the real Deuteronilus dataset.");
        return {
          region,
          terrain,
          demo: region.demoTraverse,
          baseUrl: assetUrl(region.basemap.url),
          maskUrls: region.layers.map((l) => assetUrl(l.mask.url)),
        };
      })
      .catch((e) => {
        pending = null;
        throw e;
      });
  return pending;
}
