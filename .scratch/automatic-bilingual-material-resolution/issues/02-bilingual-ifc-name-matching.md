# 02 — Match bilingual IFC layer names conservatively

**What to build:** French and English IFC layer names resolve reliably despite accents, casing, punctuation, project prefixes, dimensions, and bounded text-encoding corruption. The Material Library covers the ordinary material families visible in the supplied IFC patterns and auto-resolves only a unique eligible match.

**Blocked by:** 01 — Auto-resolve recognized materials before Review.

**Status:** ready-for-agent

- [ ] Realistic French/English aliases for gypsum, wood, plywood, insulation, concrete, concrete block, and masonry resolve without manual input.
- [ ] Naming noise does not prevent a unique match, while ambiguous names remain unresolved.
- [ ] Resolution provenance identifies the original name, canonical library entry, and match basis.
