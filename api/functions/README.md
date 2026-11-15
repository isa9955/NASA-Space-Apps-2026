# Azure Functions wrapper

Deploys the Mars Site Planner API (`../mars-blindspots/backend/api_service.py`) as
the managed API of the Azure Static Web App. See `../../docs/DEPLOYMENT.md`.

| File | Purpose |
|---|---|
| `function_app.py` | One anonymous GET trigger for `/api/{*path}` → `api_service.handle()` |
| `host.json`, `requirements.txt` | Functions host config and runtime-only dependencies |
| `build.py` | Copies the above plus the backend modules and processed data into `dist/` (the folder Azure deploys) |
| `test_function_app.py` | Builds a bundle and calls the function the way the Functions host does |

```powershell
python api/functions/build.py
python -m pytest -q api/functions     # needs azure-functions, numpy, scipy, pillow, pytest
```

Edit the API in `../mars-blindspots/backend/`, not in `dist/` (it is regenerated and gitignored).
