"""Mars Site Planner API: serves the processed Deuteronilus data in the UI contract.

Endpoints (contract: /contracts/*.schema.json, source of truth ui/src/api/schema.ts):
    GET /api/region                         site, basemap, six zone layers, demo traverse
    GET /api/conditions?lon=&lat=           values at one point
    GET /api/route?from=lon,lat&to=lon,lat  standard + safe routes, scouts, science candidates
    GET /api/assets/basemap.png             elevation-tinted hillshade (row 0 = north)
    GET /api/assets/mask-<zone>.png         zone mask: 0 fails, 100 nominal only, 255 robust

Framework-free: `handle(path, query)` returns (status, content_type, body_bytes). It is used by
backend/dev_server.py locally and can be wrapped by Azure Functions or FastAPI later.
Everything is read from data/deuteronilus/ (no recomputation of zones); routes use routing.py.
"""
import io
import json
import math
import os
import threading
import time
from urllib.parse import parse_qs

import numpy as np
from PIL import Image
from scipy import ndimage

from . import routing

SCHEMA_VERSION = "1.0.0"
SITE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "deuteronilus")

# Contract colors, default toggles and symbols per zone, in zones.json "order".
ZONE_STYLE = {
    "habitat": ("#f7d046", True, "habitat"),
    "landing": ("#f472b6", True, "landing"),
    "ice_access": ("#38d1f0", True, "ice"),
    "greenhouse": ("#6fe08a", False, "greenhouse"),
    "datacenter": ("#c4a7ff", False, "datacenter"),
    "solar": ("#ff9f4a", False, "solar"),
}

# Criterion keys in zones.json -> readable text (value, op) for the zone tooltip.
CRITERIA_TEXT = {
    "slope": lambda op, v: f"slope {op} {v:g}°",
    "roughness": lambda op, v: f"roughness {op} {v:g} m",
    "trav_worst": lambda op, v: f"worst-case traversability {op} {v:g}",
    "dist_scarp_m": lambda op, v: f"{v:g} m or more from scarps",
    "dist_base_m": lambda op, v: f"{v:g} m or more from the chosen base",
    "dist_ice_edge_m": lambda op, v: f"within {v:g} m of ice-rich ground (draft)",
    "dist_ice_m": lambda op, v: f"{v:g} m or more from ice-rich ground",
    "dist_habitat_m": lambda op, v: f"within {v:g} m of habitat",
    "dist_ice_access_m": lambda op, v: f"within {v:g} m of ice access",
    "S_winter": lambda op, v: f"winter sunlight {op} {v:.0%} of full sun",
    "S_annual": lambda op, v: f"annual sunlight {op} {v:.2f} (relative)",
}

SCIENCE_LABEL = {
    "outcrop": lambda v: f"Steep outcrop ({v:.0f}° slope)",
    "knob": lambda v: f"Knob (+{v:.1f} m local relief)",
    "low": lambda v: f"Depression (−{v:.1f} m local relief)",
    "rough": lambda v: f"Rough patch (slope varies ±{v:.0f}°)",
}

SOURCES = [
    {
        "id": "hirise-dtm",
        "provider": "NASA/JPL/University of Arizona",
        "product": "HiRISE DTM DTEEC_041222_2210_040787_2210_A01",
        "version": "A01",
        "url": "https://hirise.lpl.arizona.edu/dtm/ESP_041222_2210",
    },
    {
        "id": "sigma-z",
        "provider": "Sutton et al. 2022",
        "product": "HiRISE DTM vertical precision (σz = 0.3 m) used for slope uncertainty",
        "version": None,
        "url": "https://doi.org/10.3390/rs14102403",
    },
    {
        "id": "ice-interpretation",
        "provider": "Mars Blindspots team",
        "product": "Ice-rich flow lobes: DRAFT interpretation, pending team review (not a measurement)",
        "version": None,
        "url": None,
    },
    {
        "id": "baker-carter-2023",
        "provider": "Baker & Carter 2023 (CC BY 4.0)",
        "product": "Buried glaciers in Deuteronilus Mensae: regional context only",
        "version": None,
        "url": "https://doi.org/10.5281/zenodo.7753745",
    },
]


class ApiError(Exception):
    def __init__(self, status, code, message):
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


def decode_rle(rle, n):
    """zones.json mask encoding: [first_value, run1, run2, ...], runs alternate value."""
    out = np.zeros(n, dtype=bool)
    value, pos = bool(rle[0]), 0
    for run in rle[1:]:
        if value:
            out[pos:pos + run] = True
        pos += run
        value = not value
    if pos != n:
        raise ValueError(f"mask runs cover {pos} cells, expected {n}")
    return out


def _png(img):
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


# Elevation ramp for the tinted hillshade (low = tan, high = grey-green), as in the design.
_RAMP = np.array([[0, 214, 158, 110], [0.3, 222, 182, 140], [0.55, 196, 190, 160], [0.8, 170, 182, 165], [1, 214, 220, 210]])


class Site:
    """All site data, loaded once."""

    def __init__(self, site_dir=SITE_DIR):
        with open(os.path.join(site_dir, "metadata.json"), encoding="utf-8") as f:
            self.meta = json.load(f)
        with open(os.path.join(site_dir, "data_grid.json"), encoding="utf-8") as f:
            grid = json.load(f)
        with open(os.path.join(site_dir, "zones.json"), encoding="utf-8") as f:
            self.zones = json.load(f)
        self.g = routing.prepare_grids(self.meta, grid)
        self.rows, self.cols = self.g["rows"], self.g["cols"]
        b = self.meta["bounds"]
        self.bounds = [b["west"], b["south"], b["east"], b["north"]]  # [w, s, e, n]
        n = self.rows * self.cols
        self.masks = {
            zid: {k: decode_rle(self.zones["masks"][zid][k], n).reshape(self.rows, self.cols) for k in ("nominal", "robust")}
            for zid in self.zones["order"]
        }
        ice = decode_rle(self.zones["ice_mask"], n).reshape(self.rows, self.cols)
        self.ice = ice
        # Distance (m) from each cell to the nearest mapped ice-rich cell; 0 on the ice.
        self.dist_ice_m = ndimage.distance_transform_edt(~ice) * self.g["cell_m"]
        hill = Image.open(os.path.join(site_dir, "hillshade.png")).convert("L")
        self.basemap_png = self._tinted_hillshade(hill)
        self.mask_pngs = {zid: self._mask_png(zid) for zid in self.masks}
        self.lock = threading.Lock()  # routing allocates large arrays; one at a time keeps memory flat

    # ---- coordinates ------------------------------------------------------------------------
    def cell_of(self, lon, lat):
        w, s, e, n = self.bounds
        r = int((n - lat) / (n - s) * self.rows)
        c = int((lon - w) / (e - w) * self.cols)
        return min(self.rows - 1, max(0, r)), min(self.cols - 1, max(0, c))

    def lonlat_of(self, r, c):
        lat, lon = routing.cell_to_latlon(self.meta, self.g, r, c)
        return [lon, lat]

    def contains(self, lon, lat):
        w, s, e, n = self.bounds
        return w <= lon <= e and s <= lat <= n

    # ---- images -----------------------------------------------------------------------------
    def _tinted_hillshade(self, hill):
        elev = self.g["elev"]
        lo, hi = float(elev.min()), float(elev.max())
        t = Image.fromarray(((elev - lo) / (hi - lo)).astype(np.float32), mode="F").resize(hill.size, Image.BILINEAR)
        t = np.clip(np.asarray(t), 0, 1)
        rgb = np.stack([np.interp(t, _RAMP[:, 0], _RAMP[:, i]) for i in (1, 2, 3)], axis=-1)
        shade = np.asarray(hill, dtype=np.float32)[..., None] / 255.0
        out = np.clip(rgb * (0.2 + 0.88 * shade), 0, 255).astype(np.uint8)
        return _png(Image.fromarray(out, mode="RGB"))

    def _mask_png(self, zid):
        m = self.masks[zid]
        v = np.where(m["robust"], 255, np.where(m["nominal"], 100, 0)).astype(np.uint8)
        return _png(Image.fromarray(v, mode="L"))

    # ---- endpoints --------------------------------------------------------------------------
    def region(self):
        elev = self.g["elev"]
        res = float(self.meta["resolution"])
        layers = []
        for zid in self.zones["order"]:
            z = self.zones["zones"][zid]
            color, on, icon = ZONE_STYLE.get(zid, ("#cccccc", False, "habitat"))
            nom = z["nominal"]["area_m2"] / 1e6 if z["nominal"].get("available", True) else 0.0
            rob = z["robust"]["area_m2"] / 1e6 if z["robust"].get("available", True) else 0.0
            rule = ", ".join(
                CRITERIA_TEXT.get(c["key"], lambda op, v, k=c["key"]: f"{k} {op} {v:g}")(c["op"], float(c["threshold"]))
                for c in z["nominal"]["criteria"]
            )
            layers.append({
                "id": zid,
                "label": z["label"],
                "color": color,
                "icon": icon,
                "defaultOn": on,
                "rule": f"{rule[0].upper()}{rule[1:]}. 10 m footprint scale; thresholds are assumptions.",
                "nominalKm2": round(nom, 2),
                "robustKm2": round(rob, 2),
                "survivesPct": round(100 * rob / nom, 1) if nom > 0 else 0.0,
                "mask": {"url": f"/api/assets/mask-{zid}.png", "width": self.cols, "height": self.rows},
            })
        return {
            "schemaVersion": SCHEMA_VERSION,
            "region": {
                "id": "deuteronilus-mensae",
                "name": "Deuteronilus Mensae",
                "subtitle": "Uncertainty-aware exploration zone",
                "bounds": self.bounds,
                "dataset": {
                    "label": "HiRISE DTM · Deuteronilus Mensae",
                    "sizeKm": [round(self.meta["size"][1] * res / 1000, 2), round(self.meta["size"][0] * res / 1000, 2)],
                    "resolutionM": round(res, 2),
                    "reliefM": round(float(elev.max() - elev.min())),
                },
            },
            "dataBadge": {"label": "Real HiRISE data", "kind": "real"},
            "basemap": {"url": "/api/assets/basemap.png"},
            "layers": layers,
            # Reference traverse from the backend handoff: cell (600,100) -> (150,300).
            "demoTraverse": {"from": self.lonlat_of(600, 100), "to": self.lonlat_of(150, 300)},
            "algorithmVersion": "mars-blindspots/zones k_sigma=%g" % self.zones["config"].get("k_sigma", 1),
            "sources": SOURCES,
        }

    def conditions(self, lon, lat):
        r, c = self.cell_of(lon, lat)
        g = self.g
        return {
            "schemaVersion": SCHEMA_VERSION,
            "location": [lon, lat],
            "elevation": {"value": round(float(g["elev"][r, c])), "unit": "m", "qualifier": None},
            # Walking scale (1 m baseline), averaged over the 10 m cell; ± is σθ (worst case uses k = 1).
            "slope": {
                "value": round(float(g["slope"][r, c]), 1),
                "unit": "°",
                "qualifier": None,
                "uncertainty": round(float(g["unc"][r, c]), 1),
            },
            "soil": {"value": None, "qualifier": "regional"},
            "ice": {"kind": "distance", "value": round(float(self.dist_ice_m[r, c])), "unit": "m", "qualifier": "estimated"},
            "radiation": {"value": None, "unit": "mSv/day", "qualifier": "estimated"},
            "temperature": {"value": None, "unit": "°C", "qualifier": "estimated"},
            "sources": SOURCES,
        }

    def route(self, a, b):
        t0 = time.perf_counter()
        s, e = self.cell_of(*a), self.cell_of(*b)
        g = self.g
        with self.lock:
            std = routing.astar(g, s, e, g["trav"])
            safe = routing.astar(g, s, e, g["safe"])
            base = {
                "schemaVersion": SCHEMA_VERSION,
                "from": a,
                "to": b,
                "algorithmVersion": "mars-blindspots/routing (A* on T and SAFE = Tw/(1+5·gap))",
                "sources": SOURCES,
            }
            if not std or not safe:
                return {
                    **base,
                    "status": "unavailable",
                    "reason": "No passable path between these points (cells with traversability below 0.05 are walls).",
                    "computeMs": round((time.perf_counter() - t0) * 1000),
                    "standard": None,
                    "safe": None,
                    "scoutPoints": [],
                    "scienceTargets": [],
                }
            scouts = routing.scout_points(g, std, safe)
            science = routing.science_candidates(g, [std, safe])

        def variant(kind, path):
            m = routing.route_metrics(g, path)
            coords = [self.lonlat_of(r, c) for r, c in path]
            coords[0], coords[-1] = list(a), list(b)
            if len(coords) == 1:
                coords.append(list(b))
            return {
                "kind": kind,
                "geometry": {"type": "LineString", "coordinates": coords},
                "distanceKm": round(m["distance_m"] / 1000, 3),
                "walkMin": round(m["time_min"], 1),
                "criticalBlindspotPct": round(m["uncertain_pct"], 1),
                "worstCaseTravPct": round(m["worst_mean"] * 100, 1),
            }

        return {
            **base,
            "status": "ok",
            "computeMs": round((time.perf_counter() - t0) * 1000),
            "standard": variant("standard", std),
            "safe": variant("safe", safe),
            "scoutPoints": [
                {
                    "rank": p["n"],
                    "location": self.lonlat_of(*p["cell"]),
                    "alongM": round(p["along_m"]),
                    "blindspotPts": round(p["gap"] * 100),
                    "slopeDeg": round(p["slope"]),
                    "slopeUncDeg": round(p["slope_unc"]),
                    "worstCaseTravPct": round(p["trav_worst"] * 100),
                }
                for p in scouts
            ],
            "scienceTargets": [
                {
                    "id": f"sci-{i + 1}",
                    "location": self.lonlat_of(*p["cell"]),
                    "label": f"{SCIENCE_LABEL.get(p['type'], lambda v: p['type'])(p['value'])}: geometric candidate",
                }
                for i, p in enumerate(science)
            ],
        }


_site = None
_site_lock = threading.Lock()


def get_site():
    global _site
    with _site_lock:
        if _site is None:
            _site = Site()
    return _site


def _point(text, name):
    try:
        lon, lat = (float(v) for v in (text or "").split(","))
    except ValueError:
        raise ApiError(400, "INVALID_ARGUMENT", f"{name} must be 'lon,lat'.")
    if not (math.isfinite(lon) and math.isfinite(lat)):
        raise ApiError(400, "INVALID_ARGUMENT", f"{name} must be finite numbers.")
    return [lon, lat]


def _json(status, body):
    return status, "application/json", json.dumps(body, ensure_ascii=False).encode("utf-8")


def handle(path, query=""):
    """Route one GET request. `path` starts with /api. Returns (status, content_type, body)."""
    try:
        site = get_site()
        q = {k: v[0] for k, v in parse_qs(query).items()}
        p = path.rstrip("/")
        if p == "/api/region":
            return _json(200, site.region())
        if p == "/api/assets/basemap.png":
            return 200, "image/png", site.basemap_png
        if p.startswith("/api/assets/mask-") and p.endswith(".png"):
            zid = p[len("/api/assets/mask-"):-len(".png")]
            if zid not in site.mask_pngs:
                raise ApiError(404, "NOT_FOUND", f"Unknown zone '{zid}'.")
            return 200, "image/png", site.mask_pngs[zid]
        if p == "/api/conditions":
            try:
                lon, lat = float(q["lon"]), float(q["lat"])
            except (KeyError, ValueError):
                raise ApiError(400, "INVALID_ARGUMENT", "lon and lat are required numbers.")
            if not site.contains(lon, lat):
                raise ApiError(400, "OUT_OF_REGION", "No data here. Click inside Deuteronilus Mensae.")
            return _json(200, site.conditions(lon, lat))
        if p == "/api/route":
            a, b = _point(q.get("from"), "from"), _point(q.get("to"), "to")
            if not site.contains(*a) or not site.contains(*b):
                raise ApiError(400, "OUT_OF_REGION", "Place both points inside Deuteronilus Mensae.")
            if site.cell_of(*a) == site.cell_of(*b):
                raise ApiError(400, "INVALID_ARGUMENT", "Start and end are in the same 10 m cell.")
            return _json(200, site.route(a, b))
        raise ApiError(404, "NOT_FOUND", f"No endpoint {path}.")
    except ApiError as e:
        return _json(e.status, {"error": {"code": e.code, "message": e.message}})
    except Exception:  # noqa: BLE001 - never leak a stack trace to the client
        import traceback

        traceback.print_exc()
        return _json(500, {"error": {"code": "INTERNAL", "message": "Unexpected server error."}})
