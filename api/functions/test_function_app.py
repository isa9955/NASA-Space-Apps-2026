"""Calls the Azure Functions entry point exactly as the Functions host would, from a
freshly built bundle, so packaging mistakes (missing module or data file) fail here.

    python -m pytest -q api/functions
"""
import importlib
import json
import sys

import pytest

func = pytest.importorskip("azure.functions")

from build import build  # noqa: E402  (api/functions/build.py)


@pytest.fixture(scope="module")
def handler(tmp_path_factory):
    bundle = build(tmp_path_factory.mktemp("bundle") / "dist")
    sys.path.insert(0, str(bundle))
    for name in ("function_app", "backend", "backend.api_service", "backend.routing"):
        sys.modules.pop(name, None)  # import from the bundle, not the source tree
    try:
        module = importlib.import_module("function_app")
        assert module.__file__.startswith(str(bundle))
        functions = module.app.get_functions()
        assert len(functions) == 1
        yield functions[0].get_user_function()
    finally:
        sys.path.remove(str(bundle))


def call(handler, path, query=""):
    url = f"https://example.azurestaticapps.net/api/{path}" + (f"?{query}" if query else "")
    req = func.HttpRequest(method="GET", url=url, body=b"", route_params={"path": path})
    return handler(req)


def test_region_from_bundle(handler):
    res = call(handler, "region")
    assert res.status_code == 200
    assert res.headers["Content-Type"] == "application/json"
    assert res.headers["Cache-Control"] == "no-store"
    body = json.loads(res.get_body())
    assert body["dataBadge"]["kind"] == "real"
    assert len(body["layers"]) == 6


def test_conditions_include_estimated_radiation_from_bundle(handler):
    res = call(handler, "conditions", "lon=30.16580&lat=40.80661")
    assert res.status_code == 200
    body = json.loads(res.get_body())
    assert body["radiation"] == {"value": 0.694, "unit": "mSv/day", "qualifier": "estimated"}
    assert body["elevation"]["value"] == -1388
    assert body["soil"]["value"] is None
    assert body["temperature"]["value"] is None
    assert any(s["id"] == "radiation-elevation-model" for s in body["sources"])


def test_assets_are_cacheable_pngs(handler):
    for path in ("assets/basemap.png", "assets/mask-habitat.png"):
        res = call(handler, path)
        assert res.status_code == 200
        assert res.headers["Content-Type"] == "image/png"
        assert res.headers["Cache-Control"].startswith("public")
        assert res.get_body()[:4] == b"\x89PNG"


def test_route_reference_values(handler):
    region = json.loads(call(handler, "region").get_body())
    a, b = region["demoTraverse"]["from"], region["demoTraverse"]["to"]
    res = call(handler, "route", f"from={a[0]},{a[1]}&to={b[0]},{b[1]}")
    body = json.loads(res.get_body())
    assert res.status_code == 200 and body["status"] == "ok"
    assert round(body["standard"]["distanceKm"] * 1000) == 5383
    assert round(body["safe"]["distanceKm"] * 1000) == 5634


@pytest.mark.parametrize(
    "path,query,status,code",
    [
        ("conditions", "lon=0&lat=0", 400, "OUT_OF_REGION"),
        ("region", "x=1", 400, "INVALID_ARGUMENT"),
        ("conditions", "lon=30.18&lon=30.19&lat=40.7", 400, "INVALID_ARGUMENT"),  # duplicate key survives the wrapper
        ("nope", "", 404, "NOT_FOUND"),
    ],
)
def test_errors_pass_through(handler, path, query, status, code):
    res = call(handler, path, query)
    assert res.status_code == status
    assert json.loads(res.get_body())["error"]["code"] == code
