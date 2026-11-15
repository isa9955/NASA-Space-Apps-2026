# Editorial landing integration

- Source: https://github.com/JohnThantSynHtet/conquering-mars-landing-page/tree/v0/realistic-spinning-mars
- Source commit: `9b496e6d36108cf18f8e1ced55b9d6ff83d7e1c9` (latest v0 branch when inspected).
- Project base: `88d55435efb1fed092d2994a89c89c830f76e662`, matching `origin/main`.
- Feature branch: `feature/mars-intro`.

`/` renders the editorial welcome. Its native **Enter the Explorer** link opens `/overview`, which preserves the whole-Mars globe. The globe's Deuteronilus Mensae actions open `/explorer`, the 3D Habitat Finder. All three paths support direct loads, refresh, and browser history through the existing Azure navigation fallback; unknown paths return to the welcome page.

The source globe renderer, color/relief textures, six-degree-per-second rotation, star drift, parallax and shooting stars are retained. Editorial layout is translated to scoped CSS, with locally bundled Geist fonts. No Next.js, Tailwind reset, analytics, prototype switcher, Atlas or Cinematic screen is imported. The welcome globe has a static textured fallback, reduced-motion support and resource cleanup on texture failure. The welcome, whole-planet overview, and Habitat Finder load as separate screen chunks; only the Habitat Finder makes scientific API calls.

Textures are decorative source assets, not site observations or inputs to scientific calculations. The integration adds no scientific measurements. Existing backend APIs, client caching, science code, data and deployment headers are unchanged. Imported assets receive Vite fingerprints and use the existing immutable `/assets/*` cache policy.

Validation:

- `npm --prefix ui run build`: passed (TypeScript and Vite).
- `npm --prefix ui test`: 16 tests passed.
- `npm --prefix ui run test:live`: passed against the running real Python API, including terrain, masks, conditions, routes and error responses.
- Production-preview browser checks: desktop/mobile rendering, CTA, keyboard navigation, direct `/explorer` refresh, browser back, real-data map and demo traverse, reduced-motion stars, animated globe/stars, shooting-star rendering, and texture-failure fallback.
- `npm --prefix ui audit --omit=dev`: zero production dependency vulnerabilities.

The Three.js chunk is about 530 kB (133 kB gzip), triggering Vite's 500 kB warning; it is loaded only by the landing globe. Existing Zod annotation warnings remain. No push or merge was performed.

Additional browser check: disabling WebGL entirely still renders the static fallback and permits entry into the real map. No scientific API request is made on the landing page. The initial automated shooting-star wait timed out under the browser's rendering load; a subsequent assertion confirmed the shooting-star drawing calls. Reduced-motion, rotation and star-drift checks passed independently.

The full dependency audit reports six development-tool vulnerabilities; the production-only audit is clean. Existing toolchain versions were preserved rather than upgraded as part of this visual integration.


Finalization validation on `feature/mars-intro`:

- Installed the committed dependency graph with `npm --prefix ui ci`.
- Re-ran frontend tests (16 passed) and the production build in the isolated worktree.
- `python -m pytest -q api/mars-blindspots/backend/tests api/functions`: 27 passed, one expected failure and one skipped module (`azure.functions` is not installed in this Python environment).
- Re-ran real HTTP checks through this worktree's production preview on port 4174.
- Reviewed the change scope: no changes to existing explorer components, API, contracts, scientific data, caching or deployment configuration; the separate `feature/mars-3d-ui` branch is excluded.
