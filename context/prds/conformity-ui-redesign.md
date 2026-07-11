# Conformity UI Redesign PRD

## Problem Statement

The localhost prototype proves the core product loop, but the UI still reads like an internal engineering surface. It exposes words such as "Job" as primary user-facing language, keeps the old "BIM-to-Physics Compiler" title as the main brand, and presents upload, processing, review, and report states with sparse styling.

For colleague demos, architects should understand the workflow as a Conformity analysis: upload an IFC, inspect what the model proves, resolve missing calculation datapoints, and open a traceable thermal report. They should not need to understand backend lifecycle terminology to use the prototype.

The redesign must improve clarity and visual trust without turning the local prototype into a marketing dashboard, adding a frontend framework, or weakening the existing evidence, Review, Revision, and Report seams.

## Solution

Build a cleaner Conformity-branded localhost UI for the existing upload -> analysis state -> Review -> Report workflow.

The UI will:

- make "Conformity" the primary wordmark;
- keep a concise product descriptor such as "IFC evidence review" or "Local thermal review workspace";
- replace user-facing "Job" copy with "analysis" copy;
- preserve the internal Job resource pattern and backend contracts;
- keep the current no-framework app shell;
- improve layout, spacing, typography, status treatments, and action hierarchy;
- make the IFC Viewer and Review context feel like one coherent inspection workflow;
- keep raw technical ids subordinate to expandable/debug details;
- maintain current localhost-only, no-auth, no-deployment scope.

The result should feel like a quiet technical review tool: dense enough for repeated use, polished enough for demos, and specific to IFC evidence review rather than generic SaaS.

## User Stories

1. As an architect, I want the app to say Conformity clearly, so that I know which tool I am using.
2. As an architect, I want the app subtitle to explain the local IFC review purpose, so that first use is understandable.
3. As an architect, I want to start an analysis instead of starting a Job, so that the action matches my mental model.
4. As an architect, I want recent work to be called recent analyses, so that I do not see backend lifecycle language.
5. As an architect, I want the empty state to tell me to upload an IFC, so that I know the first step.
6. As an architect, I want upload controls to be clear and compact, so that starting a review is low-friction.
7. As an architect, I want upload progress copy to say the analysis is being prepared, so that processing state feels product-facing.
8. As an architect, I want processing state copy to explain IFC evidence extraction, so that waiting feels intentional.
9. As an architect, I want failed analysis states to be plain and visible, so that I can retry or inspect the error.
10. As an architect, I want report-ready state to be obvious, so that I know when I can open the Report.
11. As an architect, I want missing-input state to point me toward resolving inputs, so that I know what blocks the Report.
12. As an architect, I want Review page language to focus on resolving missing inputs, so that it does not feel like an abstract review task.
13. As an architect, I want Review questions to show the affected wall, slab, roof, layer, material, and datapoint, so that I can answer confidently.
14. As an architect, I want Override Scope choices in plain English, so that I understand how widely my input applies.
15. As an architect, I want technical ids hidden in secondary details, so that they remain available without dominating the workflow.
16. As an architect, I want the IFC Viewer to sit visually with the Review or analysis state, so that model context and input context are connected.
17. As an architect, I want highlighted STEP ids to remain a secondary viewer detail, so that IFC internals do not become the main UI language.
18. As an architect, I want analysis list items to show filename, state, and next action, so that I can resume work quickly.
19. As an architect, I want statuses to be readable at a glance, so that queued, processing, needs review, completed, and failed are visually distinct.
20. As an architect, I want the app to stay simple on smaller screens, so that a demo remains usable on a laptop or tablet-sized viewport.
21. As a developer, I want user-facing copy changes to stay in the app shell, so that domain and persistence modules remain stable.
22. As a developer, I want the Job resource to remain the backend lifecycle term, so that existing repositories, routes, storage paths, and verifiers do not churn.
23. As a developer, I want a presentation seam for user-facing labels, so that future UI copy changes do not leak into domain terminology.
24. As a developer, I want Review Context to remain the source of architect-facing Review labels, so that the frontend does not rebuild domain display rules.
25. As a developer, I want viewer library details to stay behind the existing viewer adapter shape, so that domain and application modules do not import Three.js or browser code.
26. As a developer, I want no frontend framework in this slice, so that visual polish does not expand app architecture.
27. As a developer, I want no new build pipeline in this slice, so that the localhost app remains easy to run.
28. As a developer, I want shell tests to assert important copy markers, so that product language does not regress accidentally.
29. As a developer, I want Review Context tests to keep proving raw ids are retained but not primary labels, so that submission contracts stay stable.
30. As a developer, I want e2e verification to keep passing, so that the redesign does not break upload, Review, recalculation, or Report serving.
31. As a demo reviewer, I want the interface to feel credible and restrained, so that I trust the calculation workflow more than a rough prototype shell.
32. As a demo reviewer, I want the design to avoid generic AI-style gradients and bloated cards, so that the tool feels intentionally built for this domain.
33. As a future maintainer, I want the UI structure to reveal the product workflow, so that the codebase remains navigable for humans and agents.
34. As a future maintainer, I want the redesign to be a behavior-preserving UI slice, so that later architecture work can happen separately.

## Implementation Decisions

- The primary brand in the shell is Conformity.
- The old "BIM-to-Physics Compiler" language may remain in docs and domain context, but it should not be the main UI wordmark.
- User-facing "Job" copy becomes "analysis" copy.
- Internal Job module names, Job routes, Job repository interfaces, Job status fields, and storage layout remain unchanged.
- The redesign is presentation-only unless a small markup change is required for layout or accessibility.
- The app remains a no-framework localhost UI served by the current HTTP shell.
- Do not introduce React, Vite, Tailwind, a bundler, or client-side state storage for this slice.
- Use the existing Review Context module as the deep module for Review display labels.
- Do not duplicate Review label derivation inside frontend string rendering.
- Keep raw Requested Input ids, Assembly Group ids, and scope kinds available for submission and debugging, but not as primary user-facing labels.
- Keep the IFC Viewer as an app/frontend adapter over existing viewer geometry links.
- Domain and application Review modules may expose display STEP ids and Review Context, but they must not import browser APIs, Three.js, or viewer payload types.
- Layout direction:
  - top shell: compact Conformity wordmark and concise descriptor;
  - home: upload panel plus recent analyses;
  - analysis page: viewer first, analysis summary and next actions second;
  - Review page: viewer plus missing-input form with a clean assembly rail;
  - Report remains the existing generated HTML artifact.
- Visual direction:
  - quiet technical workspace;
  - neutral light background;
  - restrained accent color;
  - clear borders and spacing;
  - status chips with distinct states;
  - compact forms and lists;
  - no hero section, marketing dashboard, purple gradients, decorative blobs, or oversized cards.
- Accessibility decisions:
  - retain semantic headings;
  - keep buttons and links visually distinct;
  - keep focusable controls obvious;
  - ensure narrow layouts stack without text overlap;
  - avoid color-only status communication where practical.
- Copy decisions:
  - "Start Job" becomes "Start analysis";
  - "Recent Jobs" becomes "Recent analyses";
  - "Creating Job..." becomes "Preparing analysis...";
  - "Job failed before report generation." becomes "Analysis failed before report generation.";
  - "No next action available for this Job state." becomes "No next action is available for this analysis.";
  - "Review missing datapoints" becomes "Resolve missing inputs";
  - "Submit Review" becomes "Save inputs";
  - "Recent Jobs" navigation becomes "All analyses".
- Keep "Review" as the domain workflow name in deeper docs and module names. In the UI, use it where it helps, but prefer action phrases such as "Resolve missing inputs" for primary commands.
- Architecture deepening opportunity:
  - The current shell string rendering is shallow for copy and layout. It is acceptable for the prototype, but this slice should avoid spreading display copy across new modules.
  - If copy or status rendering grows further, the next deepening should be a small presentation module with one interface that maps Job status plus links into user-facing labels, state messages, and actions.
  - Do not create that module until the redesign shows enough repeated copy/state logic to justify the seam.

## Testing Decisions

- Test external behavior and stable UI markers, not exact CSS implementation details.
- Existing shell tests should be updated to assert Conformity branding and key user-facing analysis copy.
- Existing product hardening tests should be updated to assert empty, failed, needs-review, and report-ready copy using "analysis" language where applicable.
- Existing Review Context tests remain the main test surface for architect-facing Review labels and raw id retention.
- Existing Job API tests remain the main test surface for backend lifecycle behavior and should continue to use Job terminology where they inspect backend contracts.
- Existing e2e verification remains the gate for upload -> processing -> Review -> user input -> recalculation -> Report.
- Browser smoke should continue to assert shell markers that prove the local UI is reachable.
- Do not add pixel-perfect visual regression tests for this slice.
- Do not test internal CSS selectors unless they are part of a stable user-facing or verifier-facing marker.
- Good tests for this redesign:
  - prove the shell contains "Conformity";
  - prove user-facing upload command says "Start analysis";
  - prove recent list copy says "Recent analyses";
  - prove Review action copy says "Resolve missing inputs" or "Save inputs";
  - prove backend Job submission and review-input submission still work unchanged;
  - prove report serving still returns the generated thermal calculation report.

## Out of Scope

- Renaming backend Job modules, routes, fields, repository interfaces, storage folders, or database concepts.
- Reworking the domain ubiquitous language table for Job terminology.
- Replacing the HTTP shell with a frontend framework.
- Adding a frontend bundler.
- Adding auth, deployment, collaboration, billing, projects, organizations, or cloud storage.
- Rebuilding the generated HTML Report design.
- Adding new calculation types.
- Changing Review, Revision, Override, Material Library, or calculation semantics.
- Changing IFC extraction, viewer geometry extraction, or Three.js rendering internals.
- Adding model tree browsing, section planes, property editing, or full BIM viewer controls.
- Adding perfect mobile product design beyond responsive stacking and no-overlap basics.
- Creating a marketing landing page.

## Further Notes

The most important architectural constraint is terminology separation:

```text
backend lifecycle term: Job
user-facing workflow term: analysis
```

This keeps the existing Job module deep enough for lifecycle behavior while letting the UI present a friendlier workflow. A broad rename would touch many modules for little product benefit and would increase regression risk.

Recommended smallest vertical PR:

1. Update shell branding and copy.
2. Adjust CSS and markup classes for the cleaner layout.
3. Update shell/product hardening tests for new copy.
4. Run typecheck, tests, and e2e verification.

If future UI work adds more states or richer actions, revisit a dedicated presentation module that turns Job status, Review Context, and links into a small user-facing view model. For this PRD, the existing app shell and Review Context module are enough.
