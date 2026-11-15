"""The API must return exactly what the UI contract (/contracts/*.schema.json) describes,
and must reproduce the backend handoff reference values."""
import io
import json
import os
import sys

import pytest
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", ".."))  # api/mars-blindspots

from backend import api_service  # noqa: E402

jsonschema = pytest.importorskip("jsonschema")
CONTRACTS = os.path.join(HERE, "..", "..", "..", "..", "contracts")


def validate(body, name):
    """Validate against the exported contract (draft-07, as written by `npm run contracts`)."""
    with open(os.path.join(CONTRACTS, f"{name}.schema.json"), encoding="utf-8") as f:
        jsonschema.Draft7Validator(json.load(f)).validate(body)


def get(path, query=""):
    status, ctype, body = api_service.handle(path, query)
    return status, ctype, (json.loads(body) if ctype == "application/json" else body)


@pytest.fixture(scope="module")
def region():
    status, _, body = get("/api/region")
    assert status == 200
    validate(body, "region")
    return body


def test_region_matches_handoff_zone_areas(region):
    areas = {l["id"]: (l["nominalKm2"], l["robustKm2"]) for l in region["layers"]}
    assert areas == {
        "habitat": (4.18, 1.27),
        "landing": (1.98, 0.39),
        "ice_access": (2.65, 2.37),
        "greenhouse": (3.38, 1.35),
        "datacenter": (4.66, 1.63),
        "solar": (2.43, 1.85),
    }
    assert region["dataBadge"]["kind"] == "real"


def test_assets_are_pngs_of_the_declared_size(region):
    for layer in region["layers"]:
        status, ctype, body = get(layer["mask"]["url"])
        assert (status, ctype) == (200, "image/png")
        img = Image.open(io.BytesIO(body))
        assert img.size == (layer["mask"]["width"], layer["mask"]["height"])
        assert set(img.getdata()) <= {0, 100, 255}
    status, ctype, body = get(region["basemap"]["url"])
    assert status == 200 and Image.open(io.BytesIO(body)).mode == "RGB"


@pytest.mark.parametrize(
    "zid",
    [
        "habitat",
        "landing",
        "ice_access",
        "greenhouse",
        "datacenter",
        pytest.param(
            "solar",
            marks=pytest.mark.xfail(
                strict=True,
                reason="zones.json: robust solar re-derives its S_annual quartile threshold on worst-case ground "
                "(1.098 vs 1.106), so 4,324 robust cells are not nominal. Needs a fix in zones.py.",
            ),
        ),
    ],
)
def test_robust_mask_is_inside_nominal(zid):
    m = api_service.get_site().masks[zid]
    assert not (m["robust"] & ~m["nominal"]).any()


def test_conditions_validate_and_cell_lookup_roundtrips(region):
    site = api_service.get_site()
    lon, lat = site.lonlat_of(600, 100)
    assert site.cell_of(lon, lat) == (600, 100)
    status, _, body = get("/api/conditions", f"lon={lon}&lat={lat}")
    assert status == 200
    validate(body, "conditions")
    assert body["slope"]["uncertainty"] > 0


def test_demo_route_reproduces_handoff_reference(region):
    a, b = region["demoTraverse"]["from"], region["demoTraverse"]["to"]
    status, _, body = get("/api/route", f"from={a[0]},{a[1]}&to={b[0]},{b[1]}")
    assert status == 200
    validate(body, "route")
    assert body["status"] == "ok"
    assert round(body["standard"]["distanceKm"] * 1000) == 5383
    assert round(body["safe"]["distanceKm"] * 1000) == 5634
    assert body["standard"]["criticalBlindspotPct"] == pytest.approx(7.7, abs=0.05)
    assert body["safe"]["criticalBlindspotPct"] == pytest.approx(3.0, abs=0.05)
    assert body["standard"]["geometry"]["coordinates"][0] == a
    assert len(body["scoutPoints"]) == 5


@pytest.mark.parametrize(
    "path,query,code",
    [
        ("/api/conditions", "lon=0&lat=0", "OUT_OF_REGION"),
        ("/api/conditions", "lon=abc", "INVALID_ARGUMENT"),
        ("/api/route", "from=1,2", "INVALID_ARGUMENT"),
        ("/api/route", "from=0,0&to=1,1", "OUT_OF_REGION"),
        ("/api/assets/mask-nope.png", "", "NOT_FOUND"),
        ("/api/nope", "", "NOT_FOUND"),
        ("/api/region", "extra=1", "INVALID_ARGUMENT"),
        ("/api/conditions", "lon=30&lon=31&lat=40", "INVALID_ARGUMENT"),
        ("/api/conditions", "lon=nan&lat=40", "INVALID_ARGUMENT"),
        ("/api/route", "from=1,2&to=3,4&extra=1", "INVALID_ARGUMENT"),
    ],
)
def test_errors_use_the_envelope(path, query, code):
    status, _, body = get(path, query)
    assert 400 <= status < 500
    validate(body, "error")
    assert body["error"]["code"] == code


def test_real_evidence_is_qualified_and_solar_inconsistency_is_visible(region):
    site = api_service.get_site()
    point = region["demoTraverse"]["from"]
    conditions = site.conditions(*point)
    assert conditions["slope"]["qualifier"] == "estimated"
    for key in ("soil", "radiation", "temperature"):
        assert conditions[key]["value"] is None
        assert conditions[key]["qualifier"] is None
    solar = next(layer for layer in region["layers"] if layer["id"] == "solar")
    assert "4,324 robust cells" in solar["rule"]
    assert "not a survival fraction" in solar["rule"]
    assert "DRAFT" in next(source for source in region["sources"] if source["id"] == "ice-interpretation")["product"]


def test_real_api_rejects_synthetic_metadata(tmp_path, region):
    metadata = dict(api_service.get_site().meta, is_synthetic=True)
    (tmp_path / "metadata.json").write_text(json.dumps(metadata), encoding="utf-8")
    with pytest.raises(ValueError, match="nonsynthetic"):
        api_service.Site(str(tmp_path))


def test_real_blocked_destination_returns_no_invented_route(region):
    site = api_service.get_site()
    rows, cols = (site.g["trav"] < api_service.routing.IMPASSABLE_T).nonzero()
    goal = site.lonlat_of(int(rows[0]), int(cols[0]))
    start = region["demoTraverse"]["from"]
    status, _, body = get("/api/route", f"from={start[0]},{start[1]}&to={goal[0]},{goal[1]}")
    assert status == 200
    validate(body, "route")
    assert body["status"] == "unavailable"
    assert body["standard"] is None and body["safe"] is None
    assert body["scoutPoints"] == [] and body["scienceTargets"] == []
