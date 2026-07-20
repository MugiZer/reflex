# 04 — Route special construction cases without fake lambda values

**What to build:** The product distinguishes material lookup from construction cases that need different evidence or calculation treatment: metal framing/fixings, air cavities, product-sensitive membranes and lightweight panels, curtain walls, unnamed material evidence, non-layered assemblies, and uncertain slab roles. Each case has one clear next action and never receives an invented serial-layer conductivity.

**Blocked by:** 02 — Match bilingual IFC layer names conservatively; 03 — Make library assistance visible and optional in Review.

**Status:** ready-for-agent

- [ ] Special-physics patterns do not silently auto-resolve to an ordinary lambda calculation.
- [ ] Curtain walls, unnamed layers, and uncertain slabs receive evidence-specific actions instead of a generic picker.
- [ ] The action view makes remaining work represent true evidence/modeling gaps after known materials are resolved.
