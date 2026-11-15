# Archived: Arcadia Planitia (not used)

This folder preserves the team's earlier Arcadia Planitia work. **Nothing here
is used by the current app.** The project now focuses on one site, Deuteronilus
Mensae (see `../../TECHNICAL_SPEC.md`).

Kept for reference:

- `api/` – TypeScript Azure Functions (`/api/sites`, `/api/starts`,
  `/api/routes`, `/api/mission-context`) and their contracts.
- `pipeline/` – Python NASA ingestion, candidate selection, assessments and
  MOLA routing, with tests and generated artifacts.
- `docs/` – the Arcadia frontend handoff, methodology and data sources.
- `TECHNICAL_SPEC.md` – the Arcadia phase notes.

The original move preserved history. The subsequent integration also restored
the verified uncommitted Phase 6.2/architecture work into these archive paths.
The reference artifacts, audit records and tests remain available; no current UI
requests target this archived service. `README_PHASE6_SNAPSHOT.md` and the
archived technical/review documents retain the earlier architecture decisions.
`api/` and `pipeline/` sit side by side so their relative paths still work if
someone needs to run them again. Do not deploy from this folder.

The archived Deuteronilus audit exporter reads the unchanged primary processed
data at repository-root `api/mars-blindspots/`; its relative references were
updated for relocation. Runtime Python routing in the current app is a separate
explicit architecture choice; these archived TypeScript endpoints are not primary.
