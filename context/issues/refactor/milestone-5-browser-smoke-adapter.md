# Refactor Plan - Milestone 5 Browser Smoke Adapter

## Status

Implemented on 2026-06-08.

## Problem Statement

Milestone 5 keeps the Verifier module simple and self-contained. Browser smoke currently uses an HTTP DOM fallback artifact so `verify:e2e` remains deterministic without adding a heavy browser dependency. That is acceptable for the current quality gate, but if real browser automation becomes required later, adding Playwright logic directly inside the main Verifier flow would widen the Verifier interface and mix two concerns: API end-to-end verification and browser-driver orchestration.

## Solution

Keep `runE2eVerifier` as the stable module interface. If real browser automation is added, introduce a small Browser Smoke adapter behind the existing verifier flow. The adapter should own driver setup, screenshot capture, and fallback behavior. The main Verifier module should keep owning step orchestration and artifact summary writing.

## Commits

1. Done - Add a Browser Smoke result type with `mode`, `artifactPaths`, and `diagnostics`.
2. Done - Move the current HTTP DOM fallback into a dedicated Browser Smoke module with the same behavior and tests.
3. Done - Add a no-op driver discovery function that reports fallback mode when no browser driver exists.
4. Done - Do not add Playwright-backed implementation until the dependency is intentionally accepted.
5. Done - Update verifier summary JSON to include `browserSmoke.mode`.
6. Done - Add one public-interface test proving fallback still writes an artifact.
7. Done - Add one public-interface test proving a fake adapter result is surfaced in summary JSON.

Each commit should leave `npm test`, `npm run typecheck`, and `npm run verify:e2e` green.

## Decision Document

- Main Verifier module remains the interface for `verify:e2e`.
- Browser driver details must not enter domain, application Job, or report modules.
- Browser smoke is reachability/usability proof, not visual regression.
- HTTP DOM fallback is acceptable until a real browser dependency is explicitly added.

## Testing Decisions

- Test the Verifier interface and the Browser Smoke adapter output, not driver internals.
- Keep API e2e verification as the hard quality gate.
- Browser screenshot artifacts are diagnostic evidence, not acceptance of visual polish.

## Out of Scope

- Adding Playwright now.
- Pixel-perfect UI assertions.
- Browser matrix testing.
- Mobile layout checks.
