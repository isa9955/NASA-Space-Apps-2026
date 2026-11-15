# NASA-Space-Apps-2026

The [backend architecture review](docs/BACKEND_ARCHITECTURE_REVIEW.md) records
shared infrastructure, intentionally independent scientific models, lean
production packaging, verification and remaining technical debt.

Arcadia and Deuteronilus now coexist as independent offline scientific
workstreams. See [`docs/INTEGRATION_ARCADIA_DEUTERONILUS.md`](docs/INTEGRATION_ARCADIA_DEUTERONILUS.md)
for preservation, architecture, verified results and limitations. The API adds
`GET /api/regions/deuteronilus` without changing existing Arcadia endpoints.

Offline NASA MOLA ingestion, terrain candidate selection, scientific assessment,
and provisional route planning live under `pipeline/`. See
[`pipeline/README.md`](pipeline/README.md) and
[`docs/methodology.md`](docs/methodology.md) for reproduction and limitations.
The Azure Functions API serves precomputed sites and route records; see
[`api/README.md`](api/README.md) for local setup and contracts.

**IMPORTANT:** SWIM and site-specific radiation evidence remain unavailable.
Both original candidates now have provisional MOLA routes, with interpolation
coverage explicitly reported; no site or route is certified safe.

The frontend will be implemented independently by our teammate. The temporary
Phase 6 `web/` implementation has been removed from the checkout and remains
available in Git commit `5c3e283`. No replacement UI is included.
See [`docs/FRONTEND_HANDOFF.md`](docs/FRONTEND_HANDOFF.md) for the intended
Start → Candidate → Science → Route → Habitat workflow, API contracts, Mars
map requirements, local integration and acceptance criteria.

Phase 6 backend discovery and historical Mars Odyssey THEMIS context remain
available. See [`docs/data-sources.md`](docs/data-sources.md); THEMIS context
is not a candidate-site temperature or scoring input. Azure deployment
configuration and production verification remain pending Phase 7.
