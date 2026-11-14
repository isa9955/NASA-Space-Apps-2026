# Mars routing map

## Phase 6 guided user journey

1. **Start:** choose only a terrain reference advertised by `/api/starts`.
   Currently there is one supported origin, with two recorded destination pairs.
2. **Candidate:** choose a discovered candidate card or its map marker.
3. **Science:** compare both candidates, inspect selected-site observations,
   source references/hashes, missing data and confidence explanations. Terrain
   support is distinct from overall habitat evidence confidence.
4. **Route:** inspect the existing provisional line and distance/elevation/
   interpolation metrics, with hazard warnings. No new line is calculated.
5. **Habitat:** view a selected-site research habitat/greenhouse illustration.
   It has no scale or engineering, shielding, climate or agricultural validation.

The science step also shows separately packaged historical THEMIS observation
context. It is a whole-frame label range from 2002, not a candidate temperature.
The optional panel can fail independently of core MOLA analysis/routing.
The step navigation and Back/Next controls preserve the chosen site.

Minimal React + TypeScript + Vite + OpenLayers client. No route geometry or
scientific metrics are hardcoded in the UI: sites and precomputed paths come
from the Azure Functions API. Shared types are imported from `api/src/contracts/`.

## Run locally

Requirements: Node.js 22.12+ and Azure Functions Core Tools v4 on PATH.
From the repository root, start the API in terminal 1:

```powershell
npm --prefix api ci
$env:FUNCTIONS_WORKER_RUNTIME = "node"
npm --prefix api start
```

Start the frontend in terminal 2:

```powershell
npm --prefix web ci
npm --prefix web run dev
```

Open `http://127.0.0.1:5173`. The Vite proxy sends `/api` requests to the local
Functions host at `http://127.0.0.1:7071`. There is no mock API or fallback path.
For a production build, run `npm --prefix web run build`; no deployment is
configured. `npm --prefix web run preview` also proxies to the local API.

## Demo / essential end-to-end checks

1. Leave the supported start at Arcadia sample 01, choose candidate 1, review
   Science and advance to Route: 11.62 km, 25 m gain and 24 direct / 1
   interpolated path cells.
2. Return to Candidate and choose candidate 2: 11.16 km, 40 m gain,
   24 direct / 0 interpolated path cells in the Route step.
   Its slope neighborhoods still contain interpolation; read the separate
   neighborhood coverage field.
3. Click a candidate marker to change the destination; pan and zoom the map.
   Keyboard users can use the labeled selects and zoom controls.
4. Verify that the Starting location selector offers only Arcadia sample 01.
   Other origins are not supported and cannot be selected in the UI. Direct
   unsupported API requests still return the existing 404 errors.
5. Advance to Habitat: verify the selected site and coordinates, habitat and
   greenhouse artwork, and illustrative/not-engineering-validated labels.

Requests are canceled when selections change; aborted responses cannot replace
newer selections. Site loading failures offer Retry. Missing/unsupported route
pairs show an error, and unavailable route features show their reason.

The map uses Mars spherical equirectangular display coordinates (radius
3,396,000 m, central meridian 180 degrees), not Earth web Mercator. It shows a
coordinate grid with real API points/lines, not an imagery basemap. Display
distances come from Python geodesic results, not the distorted map projection.
All routes remain provisional. SWIM/radiation/shielding and fine-scale hazards
are unresolved. Never interpret the map as certified operational navigation.
