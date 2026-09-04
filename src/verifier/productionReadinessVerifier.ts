export type ProductionReadinessOutcome =
  | "passed"
  | "type_failure"
  | "test_failure"
  | "timeout"
  | "leaked_process"
  | "missing_fixture";

export type ProductionReadinessPhaseId =
  | "typecheck"
  | "focused-public-seam"
  | "full-regression"
  | "http-end-to-end"
  | "process-cleanup";

export type ProductionReadinessPhase = Readonly<{
  id: ProductionReadinessPhaseId;
  scope: string;
  timeoutMs: number;
}>;

export const PRODUCTION_READINESS_PHASES: readonly ProductionReadinessPhase[] = [
  { id: "typecheck", scope: "npm run typecheck", timeoutMs: 120_000 },
  { id: "focused-public-seam", scope: "non-topology public seam tests", timeoutMs: 120_000 },
  { id: "full-regression", scope: "all non-topology regression tests", timeoutMs: 300_000 },
  { id: "http-end-to-end", scope: "localhost HTTP end-to-end verifier", timeoutMs: 120_000 },
  { id: "process-cleanup", scope: "verifier child-process cleanup", timeoutMs: 30_000 },
];

export type VerificationRunnerResult = Readonly<{
  outcome: "passed" | "failed" | "timeout";
  exitCode: number | null;
  output: string;
}>;

export type VerificationRunner = (phase: ProductionReadinessPhase) => Promise<VerificationRunnerResult>;

export type ProductionReadinessPhaseResult = Readonly<{
  id: ProductionReadinessPhaseId;
  scope: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  outcome: "passed" | "failed" | "timeout" | "skipped";
  diagnostic: string | null;
}>;

export type ProductionReadinessResult = Readonly<{
  outcome: ProductionReadinessOutcome;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  phases: readonly ProductionReadinessPhaseResult[];
  failure: Readonly<{
    phaseId: ProductionReadinessPhaseId;
    outcome: Exclude<ProductionReadinessOutcome, "passed">;
    diagnostic: string;
  }> | null;
}>;

export async function runProductionReadinessVerifier(command: Readonly<{
  runner: VerificationRunner;
  fixtureAvailable: () => Promise<boolean>;
  cleanup: () => Promise<{ leakedProcesses: readonly string[] }>;
  now?: () => Date;
}>): Promise<ProductionReadinessResult> {
  const now = command.now ?? (() => new Date());
  const started = now();
  const phases: ProductionReadinessPhaseResult[] = [];
  let failure: ProductionReadinessResult["failure"] = null;

  for (const phase of PRODUCTION_READINESS_PHASES.slice(0, -1)) {
    if (failure) {
      phases.push(skippedPhase(phase, now));
      continue;
    }
    const phaseStarted = now();
    if (phase.id === "http-end-to-end" && !await command.fixtureAvailable()) {
      const phaseFinished = now();
      const diagnostic = "Required synthetic HTTP verifier fixture is unavailable.";
      phases.push(phaseResult(phase, phaseStarted, phaseFinished, "failed", diagnostic));
      failure = { phaseId: phase.id, outcome: "missing_fixture", diagnostic };
      continue;
    }
    const runnerResult = await command.runner(phase);
    const phaseFinished = now();
    if (runnerResult.outcome === "passed") {
      phases.push(phaseResult(phase, phaseStarted, phaseFinished, "passed", null));
      continue;
    }
    const diagnostic = sanitizeDiagnostic(runnerResult.output, runnerResult.outcome === "timeout" ? "Phase exceeded its maximum duration." : "Phase exited non-zero.");
    const outcome: Exclude<ProductionReadinessOutcome, "passed"> = runnerResult.outcome === "timeout"
      ? "timeout"
      : phase.id === "typecheck" ? "type_failure" : "test_failure";
    phases.push(phaseResult(phase, phaseStarted, phaseFinished, runnerResult.outcome, diagnostic));
    failure = { phaseId: phase.id, outcome, diagnostic };
  }

  const cleanupPhase = PRODUCTION_READINESS_PHASES.at(-1)!;
  const cleanupStarted = now();
  const cleanup = await command.cleanup();
  const cleanupFinished = now();
  if (cleanup.leakedProcesses.length > 0) {
    const diagnostic = `Cleanup found ${cleanup.leakedProcesses.length} leaked process(es).`;
    phases.push(phaseResult(cleanupPhase, cleanupStarted, cleanupFinished, "failed", diagnostic));
    failure ??= { phaseId: cleanupPhase.id, outcome: "leaked_process", diagnostic };
  } else {
    phases.push(phaseResult(cleanupPhase, cleanupStarted, cleanupFinished, "passed", null));
  }

  const finished = now();
  return {
    outcome: failure?.outcome ?? "passed",
    startedAt: started.toISOString(),
    finishedAt: finished.toISOString(),
    durationMs: Math.max(0, finished.getTime() - started.getTime()),
    phases,
    failure,
  };
}

function skippedPhase(phase: ProductionReadinessPhase, now: () => Date): ProductionReadinessPhaseResult {
  const started = now();
  return phaseResult(phase, started, now(), "skipped", "Skipped after an earlier phase failed.");
}

function phaseResult(phase: ProductionReadinessPhase, started: Date, finished: Date, outcome: ProductionReadinessPhaseResult["outcome"], diagnostic: string | null): ProductionReadinessPhaseResult {
  return {
    id: phase.id,
    scope: phase.scope,
    startedAt: started.toISOString(),
    finishedAt: finished.toISOString(),
    durationMs: Math.max(0, finished.getTime() - started.getTime()),
    outcome,
    diagnostic,
  };
}

export function sanitizeDiagnostic(value: string, fallback: string): string {
  const firstUsefulLine = value.split(/\r?\n/).find((line) => line.trim() && !/^\s*at\s/.test(line));
  if (!firstUsefulLine) return fallback;
  if (/\b(select|insert|update|delete|create|alter|drop)\b/i.test(firstUsefulLine)) return "Command output contained SQL and was redacted.";
  return firstUsefulLine
    .replace(/[A-Za-z]:\\[^\r\n]*/g, "<path>")
    .replace(/\/[A-Za-z0-9_.@/-]+/g, "<path>")
    .replace(/(?:password|token|secret|api[_-]?key|authorization)\s*[=:]\s*\S+/gi, "credential=<redacted>")
    .trim()
    .slice(0, 240);
}
