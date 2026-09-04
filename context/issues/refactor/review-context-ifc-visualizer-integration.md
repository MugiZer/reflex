# Refactor: Review Context + IFC Visualizer Integration

## Problem Statement

The Review UI exposes machine concepts directly to architects:

- `ag_element_40` is not meaningful.
- `layer_occurrence`, `assembly_group`, and `element_type` are implementation scopes, not user-facing choices.
- The question does not clearly identify which wall/slab/roof, layer, material, or IFC evidence the user is filling a value for.
- Architects may not know IFC names or STEP ids by heart.
- Without visual context, users cannot confidently answer whether a lambda/thickness/material input applies to one layer, one assembly group, or an element type.

The codebase currently renders Review UI from raw `RequestedInput` values in the HTTP shell. That keeps the app simple, but it leaks domain/internal identifiers into UX and makes future 3D highlighting likely to couple frontend viewer logic to domain review logic.

## Solution

Create a small, deep Review Context module that turns backend evidence and Requested Inputs into architect-facing Review display data. Then add an optional IFC Viewer adapter around an existing BIM viewer library.

Recommended library path:

1. Use That Open Components / Fragments first.
2. Keep xeokit as fallback if STEP-id highlighting or performance blocks us.
3. Avoid Autodesk APS, cloud viewers, and custom Three.js viewer work.

Target shape:

```text
domain/review
  -> RequestedInput remains business/request contract

application/review
  -> ReviewContextViewModel
  -> human labels
  -> scope explanations
  -> highlight STEP ids
  -> evidence summary

app/http/frontend
  -> renders Review UI from ReviewContextViewModel
  -> viewer adapter receives highlight STEP ids

viewer adapter
  -> That Open / xeokit details
  -> load IFC
  -> highlight/isolate/zoom selected IFC elements
```

The Review UI should show:

- human assembly label.
- IFC class and readable IFC name/type where available.
- layer label and material name where available.
- what value is missing and why it matters.
- what scope options mean in plain English.
- evidence summary.
- visual highlight target when viewer available.

The Review UI should stop showing raw IDs/scopes as primary labels.

Important caveat:

```text
Layer occurrence usually is not separate selectable 3D geometry.
```

So visual behavior should be:

- `layer_occurrence`: highlight the host element and focus the relevant layer row.
- `assembly_group`: highlight all source elements in the Assembly Group.
- `element_type`: highlight all source elements sharing the IFC type object.

## Commits

1. **Add failing tests for architect-facing Review labels**
   - Add tests proving Review display data does not expose `ag_element_40` as the primary label.
   - Add tests proving scope labels are plain English.
   - Add tests proving `RequestedInput` raw ids still exist for API submission.
   - Codebase remains working with current UI.

2. **Add `ReviewContextViewModel` types**
   - Define display-only review types in application/review or app presenter layer.
   - Include assembly display label, element labels, layer label, missing value label, scope option labels, evidence summary, and highlight STEP ids.
   - Do not change domain `RequestedInput` semantics.

3. **Build Review Context from existing Requested Inputs**
   - Create a module that accepts Job review state and available calculation/evidence artifacts.
   - If rich evidence is unavailable, create safe fallback labels from known values.
   - Fallback example: `Wall requiring thermal conductivity`, not `ag_element_40`.
   - Keep raw ids in hidden/subordinate fields for submission only.

4. **Expose Review Context through Job API**
   - Extend `GET /api/jobs/:id` response with review display context.
   - Preserve existing `review.requestedInputs` response for backward compatibility during refactor.
   - Do not break `POST /api/jobs/:id/review-inputs`.

5. **Update Review UI to use Review Context**
   - Replace rail labels with architect-facing assembly labels.
   - Replace scope dropdown labels with plain English:
     - "Only this layer in this element".
     - "All matching assemblies in this review group".
     - "All elements using this IFC type".
   - Show technical ids in a muted expandable/debug line only.
   - Keep current form submission flow.

6. **Add evidence/context summary panel**
   - Show IFC class, IFC element name, IFC type name, material/layer label, source element count, and evidence path summary.
   - Cap long lists.
   - Do not dump raw JSON.

7. **Add viewer integration seam**
   - Add a small frontend `IfcReviewViewer` adapter interface.
   - Interface accepts:
     - IFC file URL or Blob source.
     - selected/highlight STEP ids.
     - highlight mode: element, assembly group, element type.
   - No domain imports into viewer code.

8. **Add static IFC file endpoint for Job-scoped viewer loading**
   - Serve uploaded IFC only for current Job route in localhost mode.
   - Keep path job-scoped.
   - Do not expose arbitrary filesystem paths.
   - Add tests for 404 on unknown Job and successful response for known Job.

9. **Spike That Open Components viewer in isolated frontend module**
   - Load IFC in browser using That Open Components / Fragments.
   - Highlight/isolate STEP ids for active question.
   - If package/bundling cost is high, do not rewrite app; record blocker and keep text-context improvements.

10. **Add fallback viewer adapter decision**
   - If That Open cannot reliably highlight by STEP id in our app shape, spike xeokit next.
   - Keep both options behind same `IfcReviewViewer` seam.
   - Do not let viewer library types leak into review/domain modules.

11. **Wire active question to viewer highlight**
   - When user selects an Assembly Group/question, update viewer highlight ids.
   - If layer-level question, highlight host element and focus layer summary.
   - If assembly-level question, highlight group elements.
   - If element-type question, highlight all matching elements.

12. **Add browser smoke coverage**
   - Verify review page shows architect-facing labels.
   - Verify raw `ag_element_40` is not primary visible label.
   - If viewer available, verify viewer container loads and active question sends highlight ids.
   - Do not pixel-test 3D rendering.

13. **Run full verification**
   - `npm test`
   - `npm run typecheck`
   - `npm run verify:e2e`
   - Optional local private IFC verifier.

## Decision Document

- This is a refactor and UX/context improvement, not a domain rewrite.
- `RequestedInput` remains the backend business contract.
- Add a display/presenter module for `ReviewContextViewModel`.
- UI consumes display context; API submission still uses stable raw ids.
- Viewer is an app/frontend adapter, not domain logic.
- Domain modules must not import That Open, xeokit, Three.js, browser APIs, or viewer-specific ids.
- Visual highlighting uses IFC STEP ids/evidence source ids already carried by evidence references.
- Layer-level review cannot assume layer geometry exists. Highlight host element and focus layer row.
- That Open Components / Fragments is first viewer candidate because it is local browser IFC viewing, based on web-ifc + Three.js, and has an MIT package.
- xeokit is fallback because it is mature and supports BIM highlighting/tree tools, but licensing/conversion concerns make it second choice.
- Autodesk APS is out because it introduces cloud/auth/model-derivative complexity and works against local-private prototype goals.
- Do not introduce full frontend framework unless viewer integration truly requires it.
- If bundling becomes necessary, add the smallest frontend build seam instead of stuffing complex module imports into `renderAppShell`.

## Testing Decisions

- Test Review Context as an application/presenter module through its public interface.
- Test that raw ids remain available for API submission but are not primary user-facing labels.
- Test scope label translation.
- Test API backward compatibility for `review.requestedInputs`.
- Test Job-scoped IFC file endpoint.
- Test browser smoke for review page semantics.
- If viewer is added, test viewer adapter inputs, not internals of That Open/xeokit.
- Keep `verify:e2e` green after each slice.

## Out of Scope

- Building a custom 3D viewer from scratch.
- Replacing the whole frontend with React/Vite unless separately justified.
- Cloud viewer services.
- Autodesk APS.
- Full model tree browser.
- Editing IFC geometry.
- Selecting material layers as independent 3D geometry.
- Perfect BIM viewer feature parity.
- Mobile 3D optimization.
- PDF/export changes.
- Auth/deployment.

## Further Notes

Research summary:

- That Open `IfcLoader` uses Web-IFC and Three.js for IFC visualization and returns Fragments for rendering.
- That Open docs describe Fragments as efficient browser geometry for BIM and note they can load faster after conversion.
- `web-ifc` provides IFC parsing/property/geometry capability in browser/node through WASM.
- `web-ifc-three` supports selection/highlighting but is deprecated in favor of newer Components.
- xeokit supports BIM viewer features such as highlight/xray/tree, but license and conversion path need care.

References:

- That Open IfcLoader API: https://thatopen.github.io/engine_past-docs/3.0.x/api/%40thatopen/components/classes/IfcLoader/
- That Open IFC loading tutorial: https://thatopen.github.io/engine_past-docs/3.0.x/Tutorials/Components/Core/IfcLoader/
- web-ifc docs: https://thatopen.github.io/engine_web-ifc/docs/
- web-ifc-three deprecation note: https://github.com/ThatOpen/web-ifc-three
- xeokit WebIFCLoaderPlugin docs: https://xeokit.github.io/xeokit-sdk/docs/file/src/plugins/WebIFCLoaderPlugin/WebIFCLoaderPlugin.js.html
- xeokit BIM viewer docs: https://xeokit.github.io/xeokit-bim-viewer/docs/
