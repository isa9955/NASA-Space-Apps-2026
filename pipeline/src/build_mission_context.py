"""Extract historical observation-level THEMIS label metadata, never site temperatures."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import math
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
URL = "https://static.mars.asu.edu/pds/ODTSDP_v1/data/odtib1_0003/i031xxbtr/I03114002BTR.IMG"
FOOTPRINT_URL = "https://ode.rsl.wustl.edu/mars/datafile/kmlfiles/ody-m-thm-3-irbtr-v1/odtsdp_v1/data/odtib1_0003/i031xxbtr/i03114002btr_img.kml"


def footprint_ring(data):
    """Read the official Mars ring; KML altitude is a display offset, not elevation."""
    root = ET.fromstring(data)
    ns = {"k": "http://www.opengis.net/kml/2.2"}
    description = root.findtext("k:Document/k:description", namespaces=ns) or ""
    if not all(text in description for text in ("I03114002BTR", "MARS", "Planetocentric")):
        raise ValueError("Unexpected ODE footprint identity or latitude convention")
    coordinates = root.findtext(".//k:LinearRing/k:coordinates", namespaces=ns)
    if not coordinates:
        raise ValueError("Missing ODE footprint ring")
    ring = []
    for coordinate in coordinates.split():
        lon, lat, *_ = map(float, coordinate.split(","))
        if not math.isfinite(lon) or not math.isfinite(lat) or not -180 <= lon <= 180 or not -90 <= lat <= 90:
            raise ValueError("Invalid footprint coordinate")
        ring.append([lon % 360, lat])
    if len(ring) < 4 or ring[0] != ring[-1]:
        raise ValueError("Footprint ring is not closed")
    if max(p[0] for p in ring) - min(p[0] for p in ring) >= 180:
        raise ValueError("This regional coverage check does not support longitude wrap")
    return ring


def inside_footprint(point, ring):
    """Planar point-in-polygon for this small, non-wrapping catalog footprint."""
    x, y = point
    inside = False
    for (ax, ay), (bx, by) in zip(ring, ring[1:]):
        if (ay > y) != (by > y) and x < ax + (y - ay) * (bx - ax) / (by - ay):
            inside = not inside
    return inside


def main():
    path = ROOT / "data/I03114002BTR.IMG"
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        subprocess.run(["curl", "--fail", "--location", "--max-time", "40", "--max-filesize", "2000000", URL, "--output", str(path)], check=True)
    data = path.read_bytes()
    if not 2000 < len(data) < 2_000_000:
        raise ValueError("Unexpected THEMIS product size")
    label = data[:2240].decode("ascii")
    def field(name):
        match = re.search(rf"(?m)^\s*{name}\s*=\s*([^\r\n]+)", label)
        if not match:
            raise ValueError(f"Missing THEMIS label field {name}")
        return match.group(1).strip().strip('"')
    if field("PRODUCT_ID") != "I03114002BTR" or field("DATA_SET_ID") != "ODY-M-THM-3-IRBTR-V1.0":
        raise ValueError("Unexpected NASA product")
    if len(data) != int(field("RECORD_BYTES")) * int(field("FILE_RECORDS")):
        raise ValueError("THEMIS image length differs from its attached PDS label")
    minimum, maximum = float(field("MINIMUM_BRIGHTNESS_TEMPERATURE")), float(field("MAXIMUM_BRIGHTNESS_TEMPERATURE"))
    if not 0 < minimum <= maximum < 1000:
        raise ValueError("Invalid product-label temperature bounds")
    footprint_path = ROOT / "data/I03114002BTR.kml"
    if not footprint_path.exists():
        subprocess.run(["curl", "--fail", "--location", "--max-time", "40", "--max-filesize", "100000", FOOTPRINT_URL, "--output", str(footprint_path)], check=True)
    footprint_data = footprint_path.read_bytes()
    ring = footprint_ring(footprint_data)
    assessments = json.loads((ROOT / "site_assessments.json").read_text(encoding="utf-8"))
    result = {
        "schemaVersion": "mission-context/1.1.0", "mission": "2001 Mars Odyssey", "instrument": "THEMIS",
        "productId": field("PRODUCT_ID"), "dataSetId": field("DATA_SET_ID"),
        "productVersion": field("PRODUCT_VERSION_ID"), "sourceUrl": URL,
        "discoveryUrl": "https://oderest.rsl.wustl.edu/live2/?query=product&target=mars&ihid=ody&iid=themis&pt=IRBTR&minlat=37.8&maxlat=38.2&westernlon=194.8&easternlon=195.2&results=fp&output=json&limit=2",
        "sourceSha256": hashlib.sha256(data).hexdigest(),
        "observationStartUtc": field("START_TIME") + "Z",
        "centerCoordinates": [float(field("CENTER_LONGITUDE")), float(field("CENTER_LATITUDE"))],
        "sampleResolutionMeters": round(float(field("SAMPLE_RESOLUTION").split()[0]) * 1000, 6),
        "lineResolutionMeters": round(float(field("LINE_RESOLUTION").split()[0]) * 1000, 6),
        "band": int(field("BAND_NUMBER")), "bandCenterMicrometers": float(field("BAND_CENTER").split()[0]),
        "labelBrightnessTemperatureRange": {"minimum": minimum, "maximum": maximum, "unit": "K", "scope": "whole observation, from product label"},
        "catalogUrl": "https://ode.rsl.wustl.edu/mars/indexproductpage.aspx?product_id=I03114002BTR",
        "unitsReference": "https://ode.rsl.wustl.edu/mars/pagehelp/Content/Missions_Instruments/Mars_Odyssey/THEMIS/ODTSDP/IR/IRBTR.htm",
        "footprint": {
            "sourceUrl": FOOTPRINT_URL,
            "sourceSha256": hashlib.sha256(footprint_data).hexdigest(),
            "coordinateReference": assessments["region"]["coordinateReference"],
            "geometry": {"type": "Polygon", "coordinates": [ring]},
            "coverageScope": "Approximate ODE catalog footprint, coordinates published to 0.001 degree; not pixel geolocation. KML display altitude discarded.",
            "siteCoverage": [
                {"siteId": site["id"], "insideApproximateFootprint": inside_footprint(site["location"]["coordinates"], ring)}
                for site in assessments["sites"]
            ],
        },
        "limitations": [
            "Historical whole-frame brightness temperature range, not a measurement at a candidate site or air temperature.",
            "Located using the official ODE Arcadia footprint search. Frame center is outside the small MOLA window; the image strip intersects the search region.",
            "Unprojected observation: no candidate pixel extraction or geolocation model is implemented.",
            "Brightness temperature assumes emissivity 1 and atmospheric opacity 0; do not infer current climate or greenhouse performance.",
            "Context only. Not used in suitability, confidence or routing; site-specific thermal evidence remains missing."
        ]
    }
    (ROOT / "mission_context.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(result["productId"], result["labelBrightnessTemperatureRange"], "context only")


if __name__ == "__main__":
    main()
