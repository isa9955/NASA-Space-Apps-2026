# Desktop 3D explorer integration

Branch: feature/mars-3d-ui. Isolated worktree: D:\Hackathon\NasaSpaceApps_2026\mars-3d-ui.
Base: origin/main 88d55435efb1fed092d2994a89c89c830f76e662, fetched before integration.
Original Editorial checkout and its five modified/untracked paths were preserved. No backend, scientific algorithm, contract, dataset, main-branch, intro-page, deployment, merge or push changes.

## Run locally (two PowerShell terminals)

Backend:
```powershell
cd D:\Hackathon\NasaSpaceApps_2026\mars-3d-ui\api\mars-blindspots
python -m backend.dev_server 7072
```
Frontend:
```powershell
cd D:\Hackathon\NasaSpaceApps_2026\mars-3d-ui\ui
$env:API_PROXY_TARGET='http://127.0.0.1:7072'
npm run dev:live -- --host 127.0.0.1 --port 5181 --strictPort
```
Open http://127.0.0.1:5181/. Both services were left running for review. Dependencies are installed in this worktree; npm ci restores them. An ignored ui/.env.local also selects the isolated backend port. Existing services on 7071/5173/5180 were not stopped.

## Inspection and feature mapping

| Approved feature | Integration |
|---|---|
| Region, sources, six zone rules/areas | Existing getRegion + RegionResponse Zod validation |
| Standard / uncertainty-aware routes, demo and custom endpoints | Existing getRoute + RouteResponse; backend A*, no simulated paths |
| Elevation, slope uncertainty, draft-landform distance | Existing getConditions + ConditionsResponse; units and qualifiers retained |
| Scout / science markers and navigation | Actual route response candidates; explicitly provisional |
| Robust patch symbols and zone fit | Actual API masks; reuses existing robustPatches, pixelToLonLat and fitAt helpers |
| 3D elevation surface | Generated display asset from committed data_grid.json; 20 m sampling, natural vertical scale |
| Globe | Illustrative Solar System Scope 2K texture, CC BY 4.0, attribution and gap/color caveat visible |
| Error / blocked route | Actual API errors and unavailable status; prototype scenario selector removed |

The backend has no mesh endpoint. ui/scripts/generate-terrain.py samples only elevation from the committed grid and embeds its SHA-256 and region ID in ui/public/terrain/deuteronilus.json. Regenerate with `python scripts/generate-terrain.py` in ui/ whenever the source dataset changes. Point measurements never use the display mesh. Coordinates align to the dataset footprint; display interpolation/downsampling is not a replacement for native scientific sampling.

Unknown soil, radiation, temperature and overall habitability remain Unknown. Draft landforms are not confirmed ice. Science targets are geometric candidates, not discoveries. Traversability is a model value, not safety probability. No scientific simulation generator or recorded route fixture is shipped in the integrated view. Explicit mock API mode is rejected by this view rather than rendering synthetic values as real.

Globe-to-site navigation uses separate views, not seamless global terrain streaming. The marker is approximate and enlarged. Returning from the globe resets the regional session. No global scientific coverage or habitability score is supplied. Mobile redesign is excluded.

## Changes and performance

- ui/src/App.tsx: desktop explorer entry and optional lazy globe; previous app retained byte-for-byte as LegacyApp.tsx.
- ui/src/main.tsx: loads explorer styles instead of previous map-wide stylesheet; no welcome page imported.
- ui/src/explorer/: approved panels, globe, terrain renderer, API adapter, typed ConditionValues and two regression tests.
- ui/public/terrain/deuteronilus.json and ui/scripts/generate-terrain.py: reproducible display geometry.
- ui/public/mars-2k.jpg: attributed illustrative globe texture.
- ui/package.json, lockfile: Three.js, its types, Geist. No new routing/state framework.
- ui/tsconfig.json: allow imported JavaScript prototype modules; existing TypeScript remains strict. JavaScript modules do not receive full static type checking; API responses remain validated by the unchanged typed client.

Existing API/HTTP cache behavior stays unchanged. Region/mesh requests and image loads are deduplicated for the session; failed loads are evicted for retry. Mask images load sequentially to avoid bursts against the local server. Render only on camera, scene or marker changes; no permanent animation loop or per-frame React state. Pixel ratio capped, one terrain mesh, paths and zones composed into its texture so routes cannot float. Geometry and textures are disposed on unmount. No quantitative GPU/FPS benchmark was performed.

## Validation

- Typecheck and production build passed.
- Frontend: 18 tests passed, including loading/error/unknown/qualifier regression coverage.
- Backend: 53 passed, 1 expected failure; existing Pillow/pytest deprecation warnings.
- Live HTTP test passed through isolated frontend/backend: real region, six masks, expected 5.383/5.634 km routes, five scouts, six science targets, conditions, solar caveat, blocked destination, and validation errors.
- Browser at desktop size: startup/loading; real demo and custom-coordinate routes; route focus; inspection (-2211 m estimated, slope 8.1 ±11.8°, draft-landform distance 454 m); scouts/next; zone controls/overlay; 2D/3D. Globe navigation and final console checked during final review.
- Initial inspection loading exception and image-load failure were found and fixed. Regression tests protect asynchronous point-value rendering.
- No lint script/config exists. Build reports existing Zod annotation notices and a large Three.js bundle warning; these are non-blocking. Further code splitting and cross-device performance benchmarking are deferred.

Review manually: Try demo, highlight each route, toggle zones/rules/patches, inspect terrain and science/scout candidates, Clear and place endpoints, compare a custom route, test 2D/3D/reset, Sources, Mars overview and return. Unsupported measurements must continue to show Unknown.

## Final three-page integration

On `test/mars-ui-integration`, native URLs now expose `/` (Editorial welcome),
`/overview` (this whole-Mars globe), and `/explorer` (the Deuteronilus 3D
Habitat Finder). The globe's site pin and primary action link to `/explorer`;
the Habitat Finder links back to `/overview`. The original Leaflet app remains
preserved as `ui/src/LegacyApp.tsx`. Routing changes do not modify APIs,
scientific calculations, datasets, or caching. Current validation and local
launch commands are recorded in [`MARS_UI_INTEGRATION.md`](MARS_UI_INTEGRATION.md).
