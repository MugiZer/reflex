# 03 — Remove demo-default language and lock the Review mode flow

**What to build:** Remove “demo defaults” wording and controls from the Review flow. Add focused regression coverage for the setup gate, all three modes, Material Library/User Input provenance, target changes, and the existing draft source handoff.

**Blocked by:** 01 — Add the Review setup choice before the Architect Action View; 02 — Apply the selected Review mode to every Requested Input.

**Status:** ready-for-agent

- [ ] The user-facing Review flow contains no “demo defaults” language.
- [ ] Tests cover the setup gate and each mode's initialization behavior.
- [ ] Tests prove the existing draft source handoff remains intact.