# Mars Site Planner (NASA Space Apps 2026)

Where can we build on Mars, and how do we get there, when the terrain map has
blindspots? A 2D web app for one walking-scale site, **Deuteronilus Mensae**,
built from a real HiRISE terrain model (1 m/px).

- **Buildable zones:** six uses (habitat, landing pad, ice access, greenhouse,
  data center, solar), each shown as nominal ground and the part that survives
  worst-case slope uncertainty.
- **Routes:** a standard route and a safe route that avoids blindspots,
  compared side by side, with scout points and science candidates.
- **Conditions:** click the terrain for elevation, slope ± uncertainty and
  distance to ice-rich ground.

## Run it

```powershell
# Terminal 1: API on http://localhost:7071
cd api/mars-blindspots
pip install -r requirements.txt
python -m backend.dev_server

# Terminal 2: UI on http://localhost:5173
cd ui
npm install
npm run dev:live
```

`npm run dev` (without `:live`) runs the UI on built-in mock data, no Python
needed.

## Where things are

| Path | What |
|---|---|
| [`TECHNICAL_SPEC.md`](TECHNICAL_SPEC.md) | Design, data, equations, API contract, open questions |
| [`ui/`](ui/) | React + Vite + Leaflet frontend |
| [`api/mars-blindspots/`](api/mars-blindspots/) | Terrain processing, zones, routing and the API (`backend/api_service.py`) |
| [`contracts/`](contracts/) | JSON Schema + examples for the three endpoints |
| [`archive/arcadia/`](archive/arcadia/) | Earlier Arcadia Planitia work, archived and unused |

Decision support only: slope uncertainty is a modeled bound, ice-rich ground is
a draft interpretation, and nothing here is a NASA safety assessment. HiRISE
data: NASA/JPL/University of Arizona.
