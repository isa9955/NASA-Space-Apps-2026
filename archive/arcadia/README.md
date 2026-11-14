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

The files were moved here unchanged (history is preserved by `git mv`).
`api/` and `pipeline/` sit side by side so their relative paths still work if
someone needs to run them again. Do not deploy from this folder.
