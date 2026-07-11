# Conformity UI Redesign Issue 001 - Localhost UI shell and copy

## Category

feature

## State

complete

## AFK/HITL

AFK

## Problem

The localhost UI uses internal Job language and the old BIM-to-Physics Compiler title as primary user-facing copy. This makes colleague demos feel like an engineering console instead of a Conformity analysis workflow.

## Scope

- Brand the shell as Conformity.
- Replace primary user-facing Job copy with analysis copy.
- Clean up the no-framework upload, analysis, Review, and viewer layout.
- Keep backend Job routes, fields, repository interfaces, storage paths, and tests for backend contracts unchanged.

## Acceptance Criteria

- Home shell shows Conformity branding.
- Upload CTA says "Start analysis".
- Recent list says "Recent analyses".
- Empty state uses analysis language.
- Analysis state copy no longer exposes Job as primary user-facing language.
- Review primary action uses "Save inputs".
- Missing-input action uses "Resolve missing inputs".
- Review Context remains source of architect-facing labels.
- Existing upload -> Review -> Report flow still passes.
- No frontend framework or bundler is added.

## Required Commands

- `npm test`
- `npm run typecheck`
- `npm run verify:e2e`

## Verification

- `npm test` passed 19 files and 63 tests.
- `npm run typecheck` passed.
- `npm run verify:e2e` passed with artifacts under `outputs/verifier/run_20260609025924`.
- Browser check on `http://127.0.0.1:4184/` and `/jobs/job_3a5b4350d4c94b33/review` confirmed Conformity branding, analysis-language copy, Review copy, no old Submit Review copy, no horizontal overflow, and fitted controls.
- In-app screenshot capture timed out, so verification used DOM snapshot and layout metrics.

## PRD

`context/prds/conformity-ui-redesign.md`
