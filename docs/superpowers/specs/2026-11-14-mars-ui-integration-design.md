# Mars UI Integration Design

## Intent

Deliver one browser journey for the NASA Space Apps application: an editorial
welcome page, a rotatable whole-Mars overview, and the Deuteronilus Mensae
habitat finder. The finder must continue to use the existing real scientific
backend and clearly distinguish observations and model outputs from
illustrative content.

## Goals

- `/` renders the editorial “Conquering Mars” welcome and its realistic,
  animated decorative Mars scene. “Enter the Explorer” links to `/overview`.
- `/overview` preserves the full-planet 3D globe and its site marker. Its site
  action links to `/explorer`.
- `/explorer` renders the 3D habitat finder for Deuteronilus Mensae, preserving
  the existing API contracts, six zone layers, route comparison, terrain
  inspection, scouts, science candidates, and client caching.
- Direct loads, refreshes, browser back, and browser forward work across all
  three URLs.
- Loading and API errors remain visible. No simulated result is represented as
  real science.

## Non-goals and constraints

- Do not replace either the full-planet overview or the habitat finder with the
  welcome page or with each other.
- Do not change backend logic, scientific calculations, datasets, API
  contracts, or caching behavior.
- Do not push, merge into `main`, deploy, or modify the source feature
  worktrees.
- Keep the current desktop-focused experience and avoid unrelated redesign.

## Approaches

1. **Native URL dispatch (selected):** use the existing pathname-based dynamic
   entrypoint and native anchors for `/`, `/overview`, and `/explorer`. This
   preserves refresh, history, and open-in-new-tab behavior without adding a
   routing dependency.
2. **Client-side router:** add a router and convert page navigation. This can
   manage route state centrally, but adds a dependency and changes a convention
   the landing page already uses.
3. **One in-memory page switch:** render all three screens behind component
   state. This is smaller in routing code but fails direct page URLs and native
   history behavior, so it does not meet the navigation requirements.

## Implementation decisions

- Build on a dedicated worktree from the latest `origin/main`, then integrate
  the two requested feature branches there.
- Keep `Globe` as the intermediate whole-Mars overview and `Explorer` as the
  habitat finder. Use native pathname dispatch to load each screen separately.
- Preserve the existing legacy map implementation and all unrelated files.
- Validate frontend tests, typecheck, production build, backend tests, real API
  checks, and browser navigation/rendering states where the local environment
  supports them. Record unavailable services or checks as limitations.

## Open implementation choices

- The route dispatcher will treat `/` as welcome, `/overview` as whole-Mars,
  and `/explorer` as habitat finder. Unknown paths will fall back to welcome
  unless the current hosting setup requires preserving a different fallback.
- The overview’s existing callback will be adapted to a native link so browser
  navigation remains addressable and reversible.
