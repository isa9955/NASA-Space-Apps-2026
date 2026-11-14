# Scientific pipeline scaffold

This directory reserves the Python environment for a future scientific data
pipeline. Phase 1 adds dependency constraints only. It does not download NASA
datasets, process rasters, or calculate suitability, confidence, radiation, or
routes.

Create and activate a virtual environment, then install dependencies with:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r pipeline/requirements.txt
```

Run these commands from the repository root.
