# Deploying to Azure

The whole app is one **Azure Static Web App** (Free plan):

- `ui/` is built by Azure and served as the website.
- The Python API runs as the app's **managed Azure Functions** at `/api/*` on the
  same domain (no CORS). Python 3.11, set in `ui/public/staticwebapp.config.json`.
- GitHub Actions (`.github/workflows/azure-static-web-apps.yml`) runs every test
  on each push to `main`, then deploys.

Why this option: managed functions are included in the Free plan, need one Azure
resource, and allow 45 s per API request (our routes take about 4–6 s). A
separately linked Function App would need the Standard plan.

## What gets deployed

| Part | Source | Notes |
|---|---|---|
| Website | `ui/` → `ui/dist` | Includes `staticwebapp.config.json` (runtime, fallback, security headers) |
| API | `api/functions/dist`, made by `python api/functions/build.py` | `function_app.py`, `host.json`, `requirements.txt`, 3 backend modules, 4 processed data files (~17 MB) |

Not deployed: `archive/`, raw rasters, offline processing scripts, unused images,
tests, mocks.

## One-time setup (needs an Azure account)

1. **Create the Static Web App** in the [Azure portal](https://portal.azure.com):
   *Create a resource* → *Static Web App*.
   - Plan type: **Free**.
   - Deployment details / Source: **Other**. Do **not** pick GitHub here: that
     makes Azure commit its own workflow file, which would duplicate ours.
   - Region: any.
2. Open the new resource → *Overview* → **Manage deployment token** → copy it.
3. In GitHub: repo → *Settings* → *Secrets and variables* → *Actions* →
   **New repository secret**: name `AZURE_STATIC_WEB_APPS_API_TOKEN`, value = the token.
4. Run the workflow: *Actions* → *Azure Static Web Apps* → *Run workflow*
   (or push to `main`).
5. The site URL is on the resource's *Overview* page
   (`https://<name>.azurestaticapps.net`). Give that URL to John for the landing
   page button.

Until step 3 is done, the workflow still runs all tests and builds, then skips
the upload.

## After each deploy: smoke test

Replace `<site>` with the site URL.

1. `https://<site>/api/region` returns JSON with `"kind": "real"`.
2. Open `https://<site>/`: header says **Real HiRISE data**; the terrain and the
   habitat, landing and ice zones appear.
3. *Try a demo traverse*: standard 5.38 km and uncertainty-aware 5.63 km.
4. Click the terrain: the Conditions card opens.
5. Browser dev tools → Console: no errors (including no Content-Security-Policy errors).

The first request after idle time is slower (cold start loads ~17 MB of data).

## Run the production setup locally

```powershell
python api/functions/build.py                 # bundle the API
python -m pytest -q api/functions              # call the Azure function from the bundle
npm --prefix ui run build                      # website + staticwebapp.config.json
```

`python -m backend.dev_server` (in `api/mars-blindspots/`) plus `npm run dev` in
`ui/` remains the normal development setup.
