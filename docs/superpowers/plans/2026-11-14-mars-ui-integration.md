# Mars UI Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate both approved UI branches into a tested three-page Mars exploration journey.

**Architecture:** Start from the latest `origin/main`, preserve its real-data API and scientific assets, and add the two feature commits to this isolated branch. Keep native pathname dispatch and links for the welcome, whole-planet overview, and API-backed habitat finder.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, Three.js, Python Functions API, Playwright browser checks.

**Spec:** `docs/superpowers/specs/2026-11-14-mars-ui-integration-design.md`

## Global Constraints

- Work only on `test/mars-ui-integration`.
- The URLs are `/` → `/overview` → `/explorer`; direct loads, refresh, back, and forward must work.
- Do not change scientific datasets, calculations, API contracts, backend logic, or caching behavior.
- Do not push, merge, deploy, or alter other worktrees.
- Never label mock or illustrative content as scientific results.

## Review Focus

- Direct load or refresh on each path must choose the correct screen; test all three paths and an unknown-path fallback in the route resolver.
- Browser back and forward must traverse all three pages; verify in a real browser.
- Missing real API data must remain an explicit error; verify with the API stopped and with `npm run test:live` against the real API.
- Globe image/WebGL failure must leave an accessible path into the explorer; verify the existing fallback in a browser with WebGL disabled or texture unavailable.
- Reduced-motion preference must suppress decorative motion without blocking navigation; verify the welcome page in a browser with reduced motion enabled.

---

### Task 1: Integrate the two feature commits

**Files:**
- Add all files from `feature/mars-intro` commit `98855ce584d8d585bc1879a54f891f04b8de32e0`.
- Add all files from `feature/mars-3d-ui` commit `514debfe2b28b1fb96ed903b5c59dabfefd9f552`.
- Add: `docs/superpowers/specs/2026-11-14-mars-ui-integration-design.md`
- Add: `docs/superpowers/plans/2026-11-14-mars-ui-integration.md`
- Preserve all files already on `origin/main`, including backend, scientific data, and the existing map implementation copied as `ui/src/LegacyApp.tsx` by the 3D branch.

**Interfaces:**
- Consumes: clean `origin/main` baseline at `88d55435efb1fed092d2994a89c89c830f76e662`.
- Produces: both requested UI implementations available in the integration branch; route wiring is Task 2.

- [ ] Cherry-pick the two feature commits into this branch, resolving only overlapping UI dependency/entry files while preserving both implementations.
- [ ] Run `npm --prefix ui test` and `npm --prefix ui run build`.
- [ ] Commit the approved design and implementation plan as `docs: define Mars UI integration`.
- [ ] Commit any integration-only resolution as `merge: integrate Mars welcome and 3D explorer`.

### Task 2: Wire the three native URLs

**Files:**
- Create: `ui/src/routes.ts`
- Create: `ui/src/routes.test.ts`
- Modify: `ui/src/main.tsx`
- Modify: `ui/src/App.tsx`
- Modify: `ui/src/landing/EditorialLanding.tsx`
- Modify: `ui/src/explorer/Globe.jsx`
- Modify: `ui/src/explorer/Explorer.jsx`
- Modify: `ui/src/explorer/explorer.css`
- Modify: `ui/src/explorer/globe.css`

**Interfaces:**
- Consumes: `EditorialLanding` from the intro branch, and `Globe` / `Explorer` from the 3D branch.
- Produces: `resolveScreenPath(pathname: string): "welcome" | "overview" | "explorer"`, used by `main.tsx`; native anchors connect the three paths.

- [ ] Add `resolveScreenPath` tests for `/`, `/overview`, `/explorer`, and unknown paths; run `npm --prefix ui test -- src/routes.test.ts` and observe the missing-module failure.
- [ ] Implement the path resolver and dynamic screen imports in `main.tsx`.
- [ ] Change the Welcome CTA to `/overview`; change both Globe site actions to native links to `/explorer`; replace the obsolete state-switching App with an Explorer wrapper and add a native `/overview` link in the Habitat Finder.
- [ ] Re-run the focused test, then `npm --prefix ui test`, `npm --prefix ui run typecheck`, and `npm --prefix ui run build`.
- [x] Commit as `feat: connect welcome overview and habitat finder routes`.

### Task 3: Validate the full journey and record results

**Files:**
- Modify: `.gitignore` (ignore Playwright CLI snapshots created during browser validation).
- Modify: `README.md` (describe the three-page app accurately).
- Modify: `docs/EDITORIAL_LANDING.md` (correct its final integrated route description).
- Modify: `docs/MARS_3D_UI_INTEGRATION.md` (append the final three-page route wiring).
- Create: `docs/MARS_UI_INTEGRATION.md` (validation record and local launch commands).

**Interfaces:**
- Consumes: final three-route build and unchanged backend/API from Tasks 1–2.
- Produces: reproducible validation notes and a verified local preview URL.

- [x] Run frontend unit/contract tests, typecheck, production build, and production dependency audit.
- [x] Run backend tests for `api/mars-blindspots` and `api/functions`.
- [x] Build the Azure Functions API package into the ignored `api/functions/dist/` validation directory.
- [x] Start the real API and production preview; run `npm --prefix ui run test:live`.
- [x] Use Playwright on desktop to check the three links, direct loads, refresh, browser back/forward, globe rendering, Habitat Finder features, loading/error/retry, and console errors; also check reduced motion and a globe texture/WebGL failure.
- [x] Record exact commands/results, launch commands, local preview URL, and any environment blockers in `docs/MARS_UI_INTEGRATION.md`.
- [ ] Commit as `docs: record Mars UI integration validation`.
