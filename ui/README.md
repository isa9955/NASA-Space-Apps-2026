# Mars Site Planner UI

React + Vite + Leaflet. Design and contract: `../TECHNICAL_SPEC.md` §7–8.

```powershell
cd ui
npm install
npm run dev:live   # http://localhost:5173 with real data (start the Python API first)
npm run dev        # same UI on built-in mock data
npm test           # contract + client + logic tests
npm run build
npm run contracts  # export JSON Schema + examples to ../contracts
```

## Data flow

The UI always fetches real HTTP endpoints (`/api/region`, `/api/conditions`,
`/api/route`, plus the image URLs `region` returns) and validates every
response against `src/api/schema.ts`. A response in the wrong shape shows an
error naming the bad field instead of breaking the screen.

- **Real data:** start the Python API (`python -m backend.dev_server` in
  `api/mars-blindspots/`), then `npm run dev:live`. `/api` is forwarded to
  `http://localhost:7071` (set in `.env.live`). The header shows **Real HiRISE
  data**.
- **Mock data:** `npm run dev` answers `/api` from a built-in mock backend
  (`src/mocks/`, synthetic terrain at the same site). The header shows **Mock
  data**. Mock values are never real measurements, and mocks are not in the
  production bundle.
- **API on another origin:** set `VITE_API_BASE` (the API must allow CORS).

## Layout

- `src/api/` – contract (`schema.ts`) and client
- `src/map/SiteMap.tsx` – Leaflet map (relief, zones, routes, markers)
- `src/panels/` – header, zones, route planner, conditions card, legend
- `src/mocks/` – dev-only mock backend (terrain, zones, two-route A*)
