# 20 — Real-format telemetry adapters (Kineto + nsys + manifest)

**What to build:** align our trace shapes with the real hardware formats per
`research/telemetry-adapters.md`: FakeGPU Kineto writer emits real
conventions (integer-us ts/dur, real cat names, External-id linkage,
pid=device/tid=stream); converters parse real shapes (us-frac ts strings,
External-id joins, camelCase nsys columns + StringIds name join) while
keeping the mirrored-subset path; manifest gains software/stats sections
(versions, dropped counts). L3 stays synthetic-only; L1 stays coarse-poll
semantics. Reuse: existing writer/converter/manifest functions, extended in
place — no parallel format code.

**Blocked by:** None — can start immediately.

**Status:** resolved

Work item: f21bfd3c-c720-4489-8293-d8a3dd54cbe9

Authority: advisory

Claim: our writer output parses as spec-valid Chrome trace with real linkage,
and our converters read real-shaped Kineto + real-shaped nsys sqlite —
proven by round-trips both directions, with the old synthetic dialect gone.

- [ ] Writer emits us ts/dur, real cats, External id, device/stream pid/tid; output opens under Perfetto-style structural rules (required fields, s/f pairing, id-set equality)
- [ ] Kineto converter reads real-shaped docs (us-frac strings, External-id linkage, missing-optional tolerance) AND our own writer output (one format now, not two)
- [ ] nsys converter reads camelCase + StringIds join path AND the mirrored path (schema-detected, real fixture for the former built from documented columns)
- [ ] Manifest carries software/stats sections; ingest preserves them; no test asserts the old ns-valued or synthetic-dialect shapes

## Verification

- **Proof:** writer round-trip tests (own output re-parses with linkage intact), real-shape fixture tests (hand-built docs/tables from documented columns, never our writer output), dialect-removal tests (old ns/cat shapes rejected or absent), full suite green
- **Affected regression:** `reflex` package suite (writer + converter + manifest paths)

## Earning gate (behavior-changing tickets)

- **Session:** not applicable — advisory authority, format-conformance seam
- **Authority:** advisory
- **Readiness:** READY_FOR_IMPLEMENTATION
- **Gate review:** not applicable for advisory authority

## Answer

Done. Writer emits real Kineto conventions, converters parse real shapes (us-frac, External-id, camelCase+StringIds) with the mirrored path kept, manifest carries software/stats, old dialect gone — audit GO on all rows. Review round: fixed for real — converter output now carries computed `coverage` (timeline present; counters/stalls/tensors absent by format construction) instead of a docstring-only firewall, plus a boundary test pushing a converted bundle through build_graph/outcome_of; time-quantization ceilings documented at both conversions. Deliberately NOT built: a require_complete gate (no caller exists to enforce it — that would be slop; coverage metadata is the machine-readable form), vocabulary unification (would invent counter/tensor fields the format cannot supply). Suite: 172 passed. Uncommitted.
