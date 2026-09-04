# 03 — Make library assistance visible and optional in Review

**What to build:** Architects see which layers were assumed from the Material Library, can open an optional “choose another material” control, and receive a compact confirmation request only when matching is ambiguous. The primary workflow calculates with known materials instead of presenting a blocking manual form.

**Blocked by:** 01 — Auto-resolve recognized materials before Review; 02 — Match bilingual IFC layer names conservatively.

**Status:** ready-for-agent

- [ ] Auto-resolved layers are not presented as missing required inputs.
- [ ] Review and Report explain the assumption level and support a voluntary material override.
- [ ] Ambiguous material requests are precise, compact, and scoped to affected layers.
