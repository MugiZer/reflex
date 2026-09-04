# Learning harness module

The learning harness is a deep module with five root entry points:

```text
learning-harness/
├── learningHarness.ts  # capability evidence and graph interface
├── teaching.ts         # teaching-frontier interface
├── taskContext.ts      # task-relative learning-context interface
├── session.ts          # structured prediction, observation, and evidence-candidate interface
├── signals.ts          # quiet learning signals and normalized metrics
└── lib/                # private implementation
```

Import only through the root entry points. Files under `lib/` are private so callers and tests exercise the same interface. Do not create a barrel that re-exports the whole implementation; add another small root entry point only when a distinct caller-facing capability genuinely appears.

`npm run lint:boundaries` enforces the entry-point seam and rejects cycles in this module.

## Local workflow

The harness operates through the existing local project commands. A learner records
one prediction around a real command, then the regular build assembles task context
and quiet signals from the persisted session evidence.

```text
npm run learning:observe -- <session-id> <task-id> <concept-id> <prediction> <true|false> -- <real command>
npm run learning:build
```

`learning/current-task.json` is optional task metadata supplied by the current
project task. When it omits `changedFiles`, the build reads the current Git diff.
The generated `learning/` artifacts are local and ignored; a recorded session id
cannot be overwritten.
