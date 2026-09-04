# Local IFC Viewer Strategy - 2026-06-09

## Context

The Review Context refactor added display STEP ids so the UI can point a viewer at the affected source element or assembly group. The refactor plan preferred That Open Components / Fragments first, with xeokit as fallback, and rejected cloud viewers and a custom viewer from scratch.

The localhost prototype currently has no frontend bundler. It serves a small HTML shell and browser scripts directly from the Node HTTP app.

## Decision

Use a bounded local viewer for the prototype:

```text
uploaded IFC
-> job-scoped viewer geometry endpoint
-> WebIfcViewerGeometryExtractor using existing Node web-ifc
-> compact mesh JSON
-> browser-side Three.js renderer
```

Keep this viewer as app/frontend/infrastructure behavior, not domain behavior.

Domain and application Review modules may expose STEP ids and display context, but they must not import That Open, xeokit, Three.js, browser APIs, or raw viewer mesh types.

## Rationale

That Open Components was tried through browser ESM CDN imports. It failed in this app shape:

- first with missing FragmentsManager initialization.
- then with Web-IFC WASM environment/instantiation errors.

Adding a bundler just to satisfy the viewer would have changed the app architecture more than the current slice required.

Server-side `web-ifc` already works in this repo. Extracting bounded mesh JSON in Node lets the local prototype render real IFC geometry without introducing a frontend build system yet.

Full Barclay IFC geometry conversion was too slow for page load. The viewer endpoint therefore streams target STEP ids first and falls back to a bounded preview of displayable building elements when the Review target is not display geometry.

## Alternatives Considered

### That Open Components / Fragments in Browser

Deferred. It remains a good long-term candidate after the app has a frontend bundler or locally hosted compatible worker/WASM assets.

### xeokit

Deferred. It may still be useful if the prototype needs mature BIM viewer controls, tree tools, or stronger STEP-id highlighting. It should sit behind the same viewer-facing route/client shape.

### Autodesk APS

Rejected for V1/local prototype because it adds cloud processing, auth, model derivatives, and data-handling complexity.

### Full Custom BIM Viewer

Rejected. The current Three.js renderer is a bounded display adapter over mesh JSON, not a full BIM viewer. It should not grow into model tree browsing, property editing, or IFC authoring.

## Implications

- `WebIfcViewerGeometryExtractor` lives under `src/infrastructure/ifc/web-ifc`.
- `app/http` composes routes, storage, cache, and viewer geometry extraction.
- Viewer geometry payloads are cached under the Job output tree.
- Review display ids are separated from review/evidence target ids in `ReviewContextViewModel`.
- Browser-side Three.js stays in an isolated frontend asset.

## Revisit Triggers

Revisit this decision when any of these become true:

- the app adopts a frontend bundler.
- That Open can be loaded locally with compatible worker/WASM assets.
- users need model tree navigation, properties, section planes, or robust isolate/highlight controls.
- server-side geometry extraction becomes too slow even with caching and bounded targets.
- deployment moves beyond localhost and CDN dependency or mesh payload size becomes unacceptable.
