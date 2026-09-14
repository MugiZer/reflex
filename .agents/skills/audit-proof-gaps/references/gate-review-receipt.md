# Artifact-bound protected gate-review receipt

Use this contract only after completing the protected-gate review. It extends the existing read-only Audit Proof Gaps decision artifact; it does not create a receipt service, registry, persistence layer, or completion authority.

## Source and scope

Read the Gate Session artifact, its sealed work-item record, sealed gate package, sealed red evidence, and calibration evidence directly. Derive all receipt identities from those sealed artifacts. Never accept a caller-supplied path, revision, hash, work-item identity, claim hash, or prior receipt as truth.

The receipt reports proof fitness only. `GATE-READY` means the reviewed gate can credibly judge its frozen claim. It does not assert that a product implementation passes, authorize terminal completion, amend the gate, or replace a later protected verifier result.

When the review is `HARNESS-BLOCKED` or `UNTRUSTED`, return readable findings and the existing decision details, but do not manufacture a gate-review receipt.

## Receipt schema

For either permitted receipt decision, return one versioned machine-readable object adjacent to the readable findings:

```json
{
  "version": 1,
  "workItemId": "<sealed immutable work-item identity>",
  "claimHash": "<SHA-256 of the sealed canonical claim>",
  "gateCommit": "<sealed gate commit>",
  "gateHash": "<sealed gate package hash>",
  "redHash": "<sealed behavioral-red hash>",
  "decision": "GATE-READY | GATE-NOT-READY",
  "auditor": { "identity": "<independent auditor identity>", "procedureVersion": "<Audit Proof Gaps procedure version>" },
  "reviewedAt": "<ISO-8601 UTC timestamp>",
  "findingsRef": "<relative reference to the adjacent readable findings>",
  "findingsHash": "<SHA-256 of the adjacent readable findings>"
}
```

`version` is the receipt-schema version, not the Gate Session or harness version. `findingsRef` identifies the readable findings artifact produced by this review, and `findingsHash` binds its exact bytes, so a human can inspect scope, evidence, decision rationale, and next owner without trusting the structured fields alone.

## Mechanical validation and freshness

The sealed work-item record is `gate-readiness-work-item` version 1. Its `claimHash` is the SHA-256 digest of UTF-8 `JSON.stringify({ claim: claim.replace(/\r\n/g, "\n") })`; the verifier recomputes it rather than trusting a stored hash.

Validate a proposed receipt with the installed verifier, which rereads the supplied session and receipt paths directly:

```text
protected-verifier validate-gate-review-receipt <prepared-session-path> <receipt-path>
```

It rejects a missing sealed work-item identity, invalid canonical claim hash, changed work-item record, a missing/replaced findings artifact, malformed review time, and any mismatch in `workItemId`, `claimHash`, `gateCommit`, `gateHash`, or `redHash`. A `GATE-READY` receipt is usable only after this command exits zero.

Do not repair, reinterpret, or partially reuse a receipt. A missing identity, changed claim hash, changed gate commit or hash, changed red hash, replaced findings artifact, unsealed session, or lost isolation makes a prior `GATE-READY` receipt stale. Resume the existing Gate Design and Gate Session path, seal the changed artifacts, then request a fresh Audit Proof Gaps review.

Gate Readiness may invoke this mechanical validation. It must not treat a receipt as an implementation result or terminal authority.
