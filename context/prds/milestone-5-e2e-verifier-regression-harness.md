# Milestone 5 PRD - End-to-End Verifier + Regression Harness

## Problem Statement

Milestone 4 gives the project a localhost web app and real async Job backend. After that, the biggest risk is silent breakage. The system has many trust-critical seams: IFC Evidence extraction, CalculationInputEvidence, Requested Inputs, User Inputs, Overrides, Revisions, thermal calculation, report generation, async Jobs, and UI review flow.

If later work broadens IFC coverage or hardens the product without a full-loop verifier, new changes can silently fake results, lose provenance, fail to persist review inputs, or ship a broken localhost demo.

Milestone 5 must make the prototype hard to break. It is not a feature milestone. It is a confidence machine.

## Solution

Build an End-to-End Verifier and Regression Harness.

Milestone 5 will provide:

- one command that proves the full localhost prototype loop;
- an optional local command for private IFC regression;
- API end-to-end verification for backend confidence;
- browser smoke verification for actual localhost usability;
- domain/API regression tests for critical trust behavior;
- synthetic fixtures that are commit-safe and deterministic;
- human-readable PASS/FAIL console output;
- machine-readable verifier artifacts.

Primary command:

```text
npm run verify:e2e
```

Optional private IFC command:

```text
npm run verify:e2e:local -- "<private ifc path>"
```

Full loop:

```text
start app/server
upload fixture IFC
create async Job
process extraction
reach needs_review or completed
submit one review input if needed
create Revision
recalculate
open/fetch Report
assert Report has result + provenance
```

Milestone 5 becomes the gate before Milestone 6. No broad IFC coverage or product hardening should proceed unless `verify:e2e` passes.

## User Stories

1. As a developer, I want one verifier command, so that I can prove the whole prototype still works.
2. As a developer, I want the verifier to start the local app/server, so that the test checks real app behavior.
3. As a developer, I want the verifier to upload a fixture IFC, so that upload and job creation are tested together.
4. As a developer, I want the verifier to create an async Job, so that the Job API boundary is tested.
5. As a developer, I want the verifier to wait for Job processing, so that background worker behavior is tested.
6. As a developer, I want the verifier to detect stuck Jobs, so that processing failures do not hang silently.
7. As a developer, I want the verifier to handle `needs_review`, so that missing-datapoint workflows are tested.
8. As a developer, I want the verifier to submit one review input, so that User Input and Override persistence are tested.
9. As a developer, I want the verifier to check Revision creation, so that review changes are traceable.
10. As a developer, I want the verifier to check recalculation after input, so that calculation updates are proven.
11. As a developer, I want the verifier to open or fetch the Report, so that report serving is proven.
12. As a developer, I want the verifier to assert the Report contains U-value or range, so that calculation output is visible.
13. As a developer, I want the verifier to assert the Report contains provenance, so that trust evidence is not lost.
14. As a developer, I want a synthetic fixture for automated verification, so that the verifier can run without private IFC files.
15. As a developer, I want an optional local private IFC verifier, so that messy real IFC behavior can still be checked manually.
16. As a developer, I want API end-to-end verification, so that backend behavior is tested quickly and reliably.
17. As a developer, I want browser smoke verification, so that actual localhost UI usability is tested.
18. As a developer, I want domain/API regression tests, so that trust-critical logic is protected without brittle UI tests.
19. As a developer, I want regression coverage for occurrence-over-type precedence, so that element-specific evidence is respected.
20. As a developer, I want regression coverage for occurrence/type conflicts, so that incompatible evidence is not merged.
21. As a developer, I want regression coverage for candidate evidence, so that candidates are not treated as fixed truth.
22. As a developer, I want regression coverage for unit normalization, so that calculations use SI units correctly.
23. As a developer, I want regression coverage for blocked assemblies, so that impossible calculations do not produce fake results.
24. As a developer, I want regression coverage for low-confidence ranges, so that uncertainty does not become false precision.
25. As a developer, I want the verifier to emit clear PASS/FAIL steps, so that failures can be diagnosed quickly.
26. As a developer, I want verifier artifacts, so that failed runs leave useful evidence.
27. As a developer, I want screenshots from browser smoke, so that UI failures are inspectable.
28. As a developer, I want summary JSON, so that future automation can read verifier results.
29. As a developer, I want Milestone 6 blocked until verifier passes, so that broadening happens on stable ground.
30. As a partner reviewing the project, I want a repeatable proof command, so that the prototype looks serious and controlled.

## Implementation Decisions

- Milestone 5 builds **End-to-End Verifier + Regression Harness**.
- Milestone 5 is not a product feature milestone.
- Primary verifier command:

```text
npm run verify:e2e
```

- Optional local private IFC verifier:

```text
npm run verify:e2e:local -- "<private ifc path>"
```

- Use both synthetic fixture and private real IFC:
  - synthetic fixture is automated, deterministic, commit-safe, and CI-safe later;
  - private Barclay IFC remains local/manual regression and must not be committed.
- Verifier layers:
  - API end-to-end verifier is required;
  - browser smoke verifier is required;
  - domain/API regression harness is required.
- API end-to-end verifier checks backend flow:
  - server starts;
  - fixture upload succeeds;
  - Job id is returned;
  - Job reaches `needs_review` or `completed`;
  - review input can be submitted when needed;
  - Revision is created;
  - recalculation occurs;
  - Report is generated;
  - Report contains result and provenance.
- Browser smoke verifier checks actual localhost usability:
  - open `/`;
  - upload fixture;
  - wait for Job;
  - open review or report;
  - submit one input if needed;
  - assert visible result.
- Browser smoke is not a visual polish test.
- No pixel-perfect UI assertions.
- No browser matrix.
- Localhost matters; cloud/deployment does not.
- Regression harness mostly tests domain/API behavior, not UI.
- Regression modules:
  - EffectiveElementEvidence;
  - CalculationInputEvidence;
  - Requested Input planner;
  - Override/revision;
  - Material Resolution;
  - Thermal Calculation;
  - Report model;
  - Job worker flow.
- Synthetic fixture set:

```text
fixtures/
  synthetic-layered-happy-path
  synthetic-missing-lambda
  synthetic-occurrence-type-conflict
  synthetic-candidate-evidence
  synthetic-blocked-no-basis
```

- Do not build one monster IFC fixture for every case.
- The main synthetic fixture should prove:
  - one layered wall assembly;
  - missing lambda or missing thickness;
  - review input supplies the value;
  - calculation completes;
  - report shows U-value.
- Other fixture/test cases cover specific edge behavior:
  - occurrence > type precedence;
  - occurrence/type conflict;
  - candidate evidence not fixed;
  - unit normalization;
  - blocked assembly;
  - low-confidence range.
- Verifier must catch critical failures:
  - upload fails;
  - Job stuck processing;
  - Job failed without visible error;
  - review inputs not persisted;
  - Revision not created;
  - calculation missing after input;
  - Report missing;
  - Report lacks provenance;
  - candidate evidence treated as fixed;
  - blocked assembly produces fake result.
- Verifier output should be human-readable and machine-readable.
- Console output format:

```text
PASS upload job created
PASS job reached needs_review
PASS review input persisted
PASS revision created
PASS calculation snapshot created
PASS report generated
PASS report contains provenance
```

- Artifact output:

```text
outputs/verifier/{runId}/summary.json
outputs/verifier/{runId}/report.html
outputs/verifier/{runId}/screenshots/*
```

- On failure, output:
  - failed step;
  - Job id if available;
  - error message;
  - artifact path.
- Gate rule:

```text
No Milestone 6 broadening unless verify:e2e passes.
```

## Testing Decisions

- The verifier itself should be tested at the highest practical public interfaces.
- Prefer stable API/domain assertions for correctness and small browser smoke for UI reachability.
- Good tests assert behavior and artifacts:
  - state transitions;
  - persisted inputs;
  - Revision existence;
  - calculation output;
  - Report content;
  - provenance;
  - diagnostics.
- Avoid tests that assert:
  - exact pixel layout;
  - animation timing;
  - dashboard polish;
  - implementation-private helper calls.
- Required API end-to-end assertions:
  - upload creates Job;
  - Job reaches final/reviewable state within timeout;
  - review input submission updates Job/Revision state;
  - report endpoint returns HTML;
  - report contains calculation result or range;
  - report contains provenance marker.
- Required browser smoke assertions:
  - localhost page loads;
  - upload control works;
  - Job/review/report navigation works;
  - at least one visible result or review state appears.
- Required regression assertions:
  - occurrence evidence overrides type evidence;
  - conflicting occurrence/type evidence emits diagnostic and avoids unsafe grouping;
  - candidate evidence is not fixed input;
  - missing material/layer evidence produces missing/review state;
  - unit normalization uses SI values;
  - low-confidence range stays range;
  - blocked assembly has no fake result.
- Use synthetic fixtures by default.
- Use optional private IFC path only for local/manual verification.

## Out of Scope

- New product features.
- New IFC coverage beyond fixture needs.
- UI redesign.
- Pixel-perfect visual regression.
- Mobile layout testing.
- PDF verification.
- Multi-user collision testing.
- Browser matrix testing.
- Cloud deployment verification.
- Load/performance testing.
- Security/auth testing.
- Broad property alias expansion.
- Large real IFC fixture collection.

## Further Notes

Milestone 5 is a quality gate, not a feature branch. It exists because the prototype is becoming serious enough that silent breakage is dangerous.

The verifier should make demos safer:

```text
run verify:e2e
green means upload -> review -> revision -> calculation -> report still works
```

Context files to read before implementation:

- `CONTEXT.md`
- `UBIQUITOUS_LANGUAGE.md`
- `context/roadmap.md`
- `context/prds/milestone-2-calculation-input-parser.md`
- `context/prds/milestone-3-review-calculation-report-core.md`
- `context/prds/milestone-4-thin-web-app-async-job-backend.md`
- `context/specs/module-architecture.md`
- `context/specs/v1-system-design.md`

First likely implementation issue:

```text
Create verify:e2e API verifier using synthetic fixture: start server, upload fixture, wait for Job, submit one review input if needed, fetch report, assert result and provenance, and write summary.json.
```
