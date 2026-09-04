import { TEST_INVENTORY, VERIFICATION_PROFILES, type TestInventoryEntry, type VerificationProfileId } from "./verificationProfiles.js";

export type ReleaseDecision = "GO" | "NO-GO" | "NOT-PROVEN" | "HARNESS-BLOCKED";
export type ReleaseProfileId = Exclude<VerificationProfileId, "release">;
export type ReleaseProfileOutcome = "passed" | "failed" | "unexecuted" | "harness-blocked";

export type ReleaseProfileResult = {
  profile: ReleaseProfileId;
  command: string;
  durationMs: number;
  outcome: ReleaseProfileOutcome;
  counts: { selected: number; passed: number; failed: number; unexecuted: number };
  selectedFiles: string[];
  runtimeIdentities: { executable: string; executableSha256: string | null; runtimeHash: string; workerMode: "real-python" }[];
  fixtureIdentities: { path: string; sha256: string }[];
  cleanup: { attempted: boolean; completed: boolean; diagnostic: string | null };
};

export type ReleaseAssessment = Readonly<{
  decision: ReleaseDecision;
  counts: { selected: number; passed: number; failed: number; unexecuted: number };
  reasons: readonly string[];
}>;

export type RequiredProviderCanary = Readonly<{
  required: true;
  decision: "GO" | "NOT-PROVEN" | "NO-GO";
  reason: string;
}>;

const REQUIRED_PROFILES: readonly ReleaseProfileId[] = ["fast", "integration", "numerical"];
export const RELEASE_VERIFICATION_SCHEMA = "release-verification/v1" as const;

export function assessReleaseVerification(
  profiles: readonly ReleaseProfileResult[],
  inventory: readonly TestInventoryEntry[],
  budgets: Readonly<Record<ReleaseProfileId, number>> = { fast: 90_000, integration: 240_000, numerical: 600_000 },
  providerCanary: RequiredProviderCanary | null = null,
): ReleaseAssessment {
  const reasons: string[] = [];
  const profileCounts = new Map<ReleaseProfileId, number>();
  const selectedFiles = new Map<string, number>();
  for (const profile of profiles) {
    profileCounts.set(profile.profile, (profileCounts.get(profile.profile) ?? 0) + 1);
    if (profile.durationMs > budgets[profile.profile]) reasons.push(`${profile.profile} exceeded its declared budget`);
    if (profile.counts.passed + profile.counts.failed + profile.counts.unexecuted !== profile.counts.selected) reasons.push(`${profile.profile} counts do not reconcile`);
    for (const file of profile.selectedFiles) selectedFiles.set(file, (selectedFiles.get(file) ?? 0) + 1);
  }
  for (const required of REQUIRED_PROFILES) {
    const count = profileCounts.get(required) ?? 0;
    if (count === 0) reasons.push(`${required} profile was not executed`);
    if (count > 1) reasons.push(`${required} profile ran more than once`);
  }
  for (const entry of inventory) {
    const count = selectedFiles.get(entry.file) ?? 0;
    if (count === 0) reasons.push(`${entry.file} was not selected`);
    if (count > 1) reasons.push(`${entry.file} was selected more than once`);
  }
  for (const file of selectedFiles.keys()) if (!inventory.some((entry) => entry.file === file)) reasons.push(`${file} is not in the registered inventory`);
  const numerical = profiles.filter((profile) => profile.profile === "numerical");
  if (numerical.length === 1 && !numerical[0]!.runtimeIdentities.some((identity) => identity.workerMode === "real-python" && identity.runtimeHash && identity.executableSha256)) {
    reasons.push("numerical proof did not record a real pinned worker identity");
  }
  if (numerical.length === 1 && numerical[0]!.fixtureIdentities.length === 0) reasons.push("numerical proof did not record a fixture identity");
  const counts = profiles.reduce((total, profile) => ({
    selected: total.selected + profile.counts.selected,
    passed: total.passed + profile.counts.passed,
    failed: total.failed + profile.counts.failed,
    unexecuted: total.unexecuted + profile.counts.unexecuted,
  }), { selected: 0, passed: 0, failed: 0, unexecuted: 0 });
  const hasHarnessBlock = profiles.some((profile) => profile.outcome === "harness-blocked") || REQUIRED_PROFILES.some((profile) => !profileCounts.has(profile));
  const hasFailure = profiles.some((profile) => profile.outcome === "failed") || counts.failed > 0 || reasons.some((reason) => /more than once|exceeded|do not reconcile|not in the registered inventory/.test(reason));
  if (profiles.some((profile) => !profile.cleanup.completed)) reasons.push("a profile did not confirm child-process cleanup");
  if (providerCanary?.decision === "NOT-PROVEN") reasons.push(`required OpenRouter canary is not proven: ${providerCanary.reason}`);
  if (providerCanary?.decision === "NO-GO") reasons.push(`required OpenRouter canary failed: ${providerCanary.reason}`);
  const notProven = profiles.some((profile) => profile.outcome === "unexecuted") || counts.unexecuted > 0 || reasons.some((reason) => /not selected|real pinned worker|fixture identity|required OpenRouter canary is not proven/.test(reason));
  const decision: ReleaseDecision = hasHarnessBlock || profiles.some((profile) => !profile.cleanup.completed) ? "HARNESS-BLOCKED" : hasFailure || providerCanary?.decision === "NO-GO" ? "NO-GO" : notProven ? "NOT-PROVEN" : "GO";
  return { decision, counts, reasons };
}

export function validateReleaseEvidence(value: unknown, expected: Readonly<{ revision: string; committedTree: string; workingTreeSha256: string }>): Readonly<{ valid: boolean; reasons: readonly string[] }> {
  const reasons: string[] = [];
  if (!isRecord(value)) return { valid: false, reasons: ["evidence artifact is not an object"] };
  if (value.schema !== RELEASE_VERIFICATION_SCHEMA) reasons.push("evidence schema is missing or unsupported");
  const tested = isRecord(value.tested) ? value.tested : null;
  if (!tested || tested.revision !== expected.revision || tested.committedTree !== expected.committedTree || tested.workingTreeSha256 !== expected.workingTreeSha256) reasons.push("evidence is stale for the tested revision or tree");
  if (typeof value.workingDirectory !== "string" || !value.workingDirectory) reasons.push("working directory is missing");
  if (!Array.isArray(value.profiles) || value.profiles.length !== REQUIRED_PROFILES.length || !value.profiles.every(isProfileResult)) reasons.push("evidence profiles are incomplete");
  const providerCanary = value.providerCanary === null || value.providerCanary === undefined ? null : isRequiredProviderCanary(value.providerCanary) ? value.providerCanary : null;
  if (value.providerCanary !== null && value.providerCanary !== undefined && !providerCanary) reasons.push("provider canary evidence is invalid");
  const assessment = isRecord(value.assessment) ? value.assessment : null;
  if (!assessment || !["GO", "NO-GO", "NOT-PROVEN", "HARNESS-BLOCKED"].includes(String(assessment.decision))) reasons.push("evidence decision is missing or invalid");
  if (Array.isArray(value.profiles) && value.profiles.every(isProfileResult)) {
    const calculated = assessReleaseVerification(value.profiles, TEST_INVENTORY, Object.fromEntries(REQUIRED_PROFILES.map((profile) => [profile, VERIFICATION_PROFILES[profile].budgetMs])) as Record<ReleaseProfileId, number>, providerCanary);
    if (assessment?.decision !== calculated.decision) reasons.push("evidence decision does not match the recorded profile results");
    if (assessment?.decision === "GO" && calculated.decision !== "GO") reasons.push("GO evidence contains an incomplete profile");
  }
  return { valid: reasons.length === 0, reasons };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isProfileResult(value: unknown): value is ReleaseProfileResult {
  if (!isRecord(value) || !REQUIRED_PROFILES.includes(value.profile as ReleaseProfileId) || typeof value.command !== "string" || typeof value.durationMs !== "number" || !["passed", "failed", "unexecuted", "harness-blocked"].includes(String(value.outcome))) return false;
  const counts = isRecord(value.counts) ? value.counts : null;
  return Boolean(counts && ["selected", "passed", "failed", "unexecuted"].every((field) => typeof counts[field] === "number" && Number.isInteger(counts[field]) && counts[field] >= 0) && Array.isArray(value.selectedFiles) && Array.isArray(value.runtimeIdentities) && Array.isArray(value.fixtureIdentities) && isRecord(value.cleanup) && typeof value.cleanup.attempted === "boolean" && typeof value.cleanup.completed === "boolean");
}

function isRequiredProviderCanary(value: unknown): value is RequiredProviderCanary {
  return isRecord(value) && value.required === true && ["GO", "NOT-PROVEN", "NO-GO"].includes(String(value.decision)) && typeof value.reason === "string";
}
