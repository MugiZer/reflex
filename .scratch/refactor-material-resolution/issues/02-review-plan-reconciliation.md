# 02 - Versioned Review-plan reconciliation

**What to build:** Existing `needs_review` Jobs should safely adopt updated Material Library and Review-planning rules without becoming inconsistent or requiring a workspace read to mutate their state.

**Blocked by:** 01 - Canonical Material Resolution + Review lifecycle.

**Status:** ready-for-agent

- [ ] Review-plan changes are identified using an explicit plan/library version or equivalent migration marker.
- [ ] Reconciliation runs as an explicit lifecycle operation, not as a side effect of reading a workspace.
- [ ] Jobs with remaining unresolved decisions stay `needs_review` with accurate Requested Inputs.
- [ ] Jobs that become fully resolvable are completed through the normal Revision and report path.
- [ ] Reconciliation is idempotent and preserves IFC Evidence and prior Revisions.
