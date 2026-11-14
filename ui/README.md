# Mars Site Planner UI

React + Vite + Leaflet. Design and contract: `../docs/FRONTEND_SPEC.md` §7–8.

```powershell
cd ui
npm install
npm run dev        # http://localhost:5173 (with the built-in mock backend)
npm test           # contract + client + logic tests
npm run build
npm run contracts  # export JSON Schema + examples to ../contracts
```

## Data flow

The UI always fetches real HTTP endpoints (`/api/region`, `/api/conditions`,
`/api/route`, plus the image URLs `region` returns) and validates every
response against `src/api/schema.ts`. A response in the wrong shape shows an
error naming the bad field instead of breaking the screen.

- **Development (default):** the Vite dev server answers `/api` with a mock
  backend (`src/mocks/`). The header shows a **Mock data** badge. Mock values
  are synthetic and never real measurements. Mocks are not in the production
  bundle.
- **Against the Python API:** create `.env.local` with
  `API_PROXY_TARGET=http://localhost:7071` and restart `npm run dev`.
- **API on another origin:** set `VITE_API_BASE` (the API must allow CORS).

## Layout

- `src/api/` – contract (`schema.ts`) and client
- `src/map/SiteMap.tsx` – Leaflet map (relief, zones, routes, markers)
- `src/panels/` – header, zones, route planner, conditions card, legend
- `src/mocks/` – dev-only mock backend (terrain, zones, two-route A*)
