# Mars UI integration validation

Branch: `test/mars-ui-integration`
Base: `origin/main` at `88d55435efb1fed092d2994a89c89c830f76e662`
Integrated UI commits: `feature/mars-intro` (`98855ce`) and
`feature/mars-3d-ui` (`514debf`).

## Browser flow

| URL | Page | Navigation |
|---|---|---|
| `/` | Editorial “Conquering Mars” welcome, rotating Mars and starfield | “Enter the Explorer” → `/overview` |
| `/overview` | Rotatable whole-Mars globe and Deuteronilus Mensae marker | Site pin or primary action → `/explorer` |
| `/explorer` | 3D Deuteronilus Habitat Finder backed by the real API | “Mars overview” → `/overview` |

Native links and pathname dispatch support direct loads, refresh, browser back,
and browser forward. Azure Static Web Apps already rewrites application paths
to `index.html`; no hosting configuration changed.

The whole-Mars texture and the welcome-page imagery are illustrative, with
attribution in the UI. The Habitat Finder requires a real API region response
and rejects mock region data. Conditions, six zone masks, standard and
uncertainty-aware routes, scouts, and science candidates use the existing API
contracts and scientific datasets. The display terrain mesh is a visualization
asset derived from the committed HiRISE grid; it is not used for scientific
point calculations.

## Local launch

From the repository root, use two PowerShell terminals. The API is expected at
`127.0.0.1:7071`; normal UI mode proxies `/api/*` there and does not fall back to
synthetic data.

```powershell
# Terminal 1
cd api/mars-blindspots
python -m backend.dev_server
```

```powershell
# Terminal 2
cd ui
npm ci
npm run build
npm run preview -- --host 127.0.0.1 --port 4175 --strictPort
```

Open <http://127.0.0.1:4175/>. In this validation run, port 4173 was already
occupied, so the preview used 4175 without stopping or changing the other
service.

## Validation performed

- Frontend unit and contract tests: `npm test` — **20 passed**.
- TypeScript: `npm run typecheck` — **passed**.
- Production frontend: `npm run build` — **passed**.
- Production dependency audit: `npm audit --omit=dev` — **0 vulnerabilities**. `npm ci` reported six advisories in the full dependency tree.
- Python backend and Functions tests: `python -m pytest -q api/mars-blindspots api/functions -ra` — **53 passed, 1 skipped, 1 expected failure**.
- Azure Functions package: `python api/functions/build.py` — **passed**, produced the isolated 10-file, 16.2 MB package in the ignored `api/functions/dist/` folder.
- Live API through production preview: `LIVE_BASE_URL=http://127.0.0.1:4175 npm run test:live` — **passed** for real region identity, six layers and masks, conditions, both route modes, five scouts, six science candidates, solar caveat, blocked destination, validation errors, and PNG assets.
- Desktop browser at 1280×720 and 1600×900: followed the welcome → overview → Habitat Finder links; loaded and refreshed each URL directly; verified browser back and forward across all three pages.
- Whole-Mars rendering: WebGL canvas rendered at 922×583 in the 1280×720 browser and 1152×763 at 1600×900. Its site actions linked to `/explorer`.
- Habitat Finder: real terrain loaded; the 5.38 km standard and 5.63 km uncertainty-aware routes rendered; all six zones appeared; scout and science candidate counts were 5 and 6; terrain inspection showed backend-derived elevation and slope values while unknown measurements remained Unknown.
- Loading/error states: delayed API response exposed the loading cover; stopping the local API exposed “Could not load the explorer” and Retry; restoring the API and retrying returned to the real-data explorer.
- Resilience and motion: blocking the overview texture showed its status while leaving navigation available; disabling WebGL showed an attributed static Mars fallback and accessible `/explorer` action with no console errors; reduced-motion emulation removed welcome animations while preserving the `/overview` link. With normal motion, the welcome page rendered both globe and starfield canvases and the starfield made shooting-star stroke calls.
- Normal-flow browser console: **0 errors, 0 warnings** on the real overview and Habitat Finder path.

## Remaining issues and limits

- The Functions-host test module is skipped because `azure.functions` is not installed in this Python environment. The primary Python API suite, local live HTTP checks, and Functions package build passed; no Azure deployment was performed.
- One existing expected failure remains for the solar robust-mask threshold mismatch; its four-thousand-plus cells outside the nominal mask remain explicitly documented and were not changed.
- Vite reports existing Zod annotation notices and a 531 kB Three.js chunk (133 kB gzip). The Three.js code is route-split and loaded only on the globe/explorer views. No GPU/FPS benchmark was run.
- Backend test output includes existing pytest/Pillow deprecation warnings.

No backend, API contract, cache implementation, scientific calculation, or dataset
was changed. No push, merge into `main`, or deployment was performed.
