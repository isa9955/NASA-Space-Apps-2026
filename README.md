# NASA-Space-Apps-2026

Offline NASA MOLA ingestion, terrain candidate selection, scientific assessment,
and provisional route planning live under `pipeline/`. See
[`pipeline/README.md`](pipeline/README.md) and
[`docs/methodology.md`](docs/methodology.md) for reproduction and limitations.
The Azure Functions API serves precomputed sites and route records; see
[`api/README.md`](api/README.md) for local setup and contracts.

**IMPORTANT:** SWIM and site-specific radiation evidence remain unavailable.
Both original candidates now have provisional MOLA routes, with interpolation
coverage explicitly reported; no site or route is certified safe.

Phase 5.1 adds the minimal interactive frontend in [`web/`](web/README.md).

Phase 6 completes the guided Start → Candidate → Science → Route → Habitat
journey, with candidate comparison/provenance, supported-start discovery and
an explicitly illustrative habitat/greenhouse preview. Historical Mars Odyssey
THEMIS label context is documented in [`docs/data-sources.md`](docs/data-sources.md);
it is not a candidate-site temperature or scoring input.
