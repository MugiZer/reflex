# Learning harness module

The learning harness is a deep module with four root entry points:

```text
learning-harness/
├── learningHarness.ts  # capability evidence and graph interface
├── teaching.ts         # teaching-frontier interface
├── taskContext.ts      # task-relative learning-context interface
├── session.ts          # structured prediction, observation, and evidence-candidate interface
└── lib/                # private implementation
```

Import only through the root entry points. Files under `lib/` are private so callers and tests exercise the same interface. Do not create a barrel that re-exports the whole implementation; add another small root entry point only when a distinct caller-facing capability genuinely appears.

`npm run lint:boundaries` enforces the entry-point seam and rejects cycles in this module.
