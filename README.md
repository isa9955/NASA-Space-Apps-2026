# Mars Site Planner (NASA Space Apps 2026)

Where can we build on Mars, and how do we get there, when the terrain map has
blindspots? A 2D web app for one walking-scale site, **Deuteronilus Mensae**,
built from a real HiRISE terrain model (1 m/px).

- **Buildable zones:** six uses (habitat, landing pad, ice access, greenhouse,
  data center, solar), each shown as nominal ground and the part that survives
  worst-case slope uncertainty.
- **Routes:** a standard route and an uncertainty-aware route that penalizes modeled blindspots,
  compared side by side, with scout points and science candidates.
- **Conditions:** click the terrain for elevation, slope ± uncertainty and
  distance to draft interpreted landforms (not confirmed ice).

## Run it

```powershell
# Terminal 1: API on http://localhost:7071
cd api/mars-blindspots
pip install -r requirements.txt
python -m backend.dev_server

# Terminal 2: UI on http://localhost:5173
cd ui
npm ci
npm run dev
```

Normal development and preview use the real Python API. Synthetic fixtures require
`npm --prefix ui run dev:mock` explicitly and are not real-data validation.

## Where things are

| Path | What |
|---|---|
| [`TECHNICAL_SPEC.md`](TECHNICAL_SPEC.md) | Design, data, equations, API contract, open questions |
| [`ui/`](ui/) | React + Vite + Leaflet frontend |
| [`api/mars-blindspots/`](api/mars-blindspots/) | Terrain processing, zones, routing and the API (`backend/api_service.py`) |
| [`contracts/`](contracts/) | JSON Schema + examples for the three endpoints |
| [`archive/arcadia/`](archive/arcadia/) | Preserved Arcadia Phase 6.2 science and tests; not used by the app |

Decision support only: slope uncertainty is a modeled bound, ice-rich ground is
a draft interpretation, and nothing here is a NASA safety assessment. HiRISE
data: NASA/JPL/University of Arizona.

## Integrated verification

See [docs/DEUTERONILUS_INTEGRATION.md](docs/DEUTERONILUS_INTEGRATION.md) for
checkpoint preservation, contract ownership, exact checks and remaining blockers.
The existing React/Leaflet design is retained. No competing TypeScript service
is used by the current app. Real HTTP checks: `npm --prefix ui run test:live`
after starting the Python API and Vite. Unit tests: `npm --prefix ui test`;
production frontend: `npm --prefix ui run build`.

**IMPORTANT:** The solar robust mask has 4,324 cells outside the nominal mask
because its variants used different sunlight thresholds. This is visibly flagged;
stored masks/areas were preserved and the solar percentage is not a survival
fraction. All routes are provisional, uncertainty is model-dependent and overall
habitability remains Unknown. Radiation, soil and temperature values remain null.

**Deployment:** one Azure Static Web App (Free plan) serves `ui/` and runs the
Python API as managed Azure Functions (`api/functions/`, Python 3.11). GitHub
Actions tests and deploys on every push to `main`. One-time Azure setup and the
post-deploy smoke test: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Not yet
deployed: the Azure resource and its deployment token still need to be created.
