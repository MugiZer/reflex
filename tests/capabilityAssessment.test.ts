import { describe, expect, it } from "vitest";
import {
  buildLearningGraph,
  reviewCapabilityAssessment,
  type CompletedConceptAssessment,
  type SourceClaim,
} from "../src/development/learning-harness/learningHarness.js";

const claim: SourceClaim = {
  conceptId: "dependency-injection",
  label: "Dependency injection",
  claim: "prior-exposure",
  source: {
    kind: "google-drive",
    documentId: "drive-1",
    documentTitle: "Learning Profile",
    documentUrl: "https://example.test/doc",
    revisionId: "revision-1",
    importedAt: "2026-08-23T00:00:00.000Z",
  },
};

const assessment = (
  overrides: Partial<CompletedConceptAssessment> = {},
): CompletedConceptAssessment => ({
  id: "assessment-1",
  recordType: "completed-concept-assessment",
  conceptId: claim.conceptId,
  capabilityBoundary: "Trace a dependency from command input to repository call.",
  demonstration: "Traced the dependency and explained why the repository is injected.",
  kind: "trace",
  outcome: "passed",
  independence: "unprompted",
  assistanceLevel: "none",
  sessionId: "session-1",
  assessedAt: "2026-08-23T01:00:00.000Z",
  rubricVersion: "1",
  delayedRetrieval: false,
  codeAnchors: ["src/application/jobs/processIfcJob.ts"],
  ...overrides,
});

const delayed = (
  overrides: Partial<CompletedConceptAssessment> = {},
): CompletedConceptAssessment => assessment({
  id: "assessment-2",
  kind: "delayed-retrieval",
  sessionId: "session-2",
  assessedAt: "2026-08-24T01:00:00.000Z",
  delayedRetrieval: true,
  ...overrides,
});

describe("capability assessment interface", () => {
  it("keeps source claims and legacy observations as non-earning context", () => {
    const graph = buildLearningGraph([claim], [{
      id: "legacy-1",
      conceptId: claim.conceptId,
      kind: "trace",
      description: "Traced a dependency from command to repository call.",
      demonstratedAt: "2026-08-23T01:00:00.000Z",
    }]);

    expect(graph.concepts[0]).toMatchObject({
      status: "seed",
      sourceClaims: [claim],
      evidence: [{ id: "legacy-1", recordType: "legacy-observation" }],
    });
  });

  it.each([
    {
      name: "an explanation introduces",
      history: [],
      next: assessment({ kind: "explanation" }),
      expected: "introduced",
    },
    {
      name: "an independent trace starts practice",
      history: [],
      next: assessment(),
      expected: "practicing",
    },
    {
      name: "later independent retrieval earns understanding",
      history: [assessment({ kind: "explanation" })],
      next: delayed(),
      expected: "understood",
    },
    {
      name: "same-session retrieval remains practice",
      history: [assessment({ kind: "explanation" })],
      next: delayed({ sessionId: "session-1" }),
      expected: "practicing",
    },
    {
      name: "prompted retrieval remains practice",
      history: [assessment({ kind: "explanation" })],
      next: delayed({ independence: "lightly-prompted", assistanceLevel: "minor" }),
      expected: "practicing",
    },
    {
      name: "a first transfer remains practice",
      history: [],
      next: assessment({ kind: "transfer", transferContext: "A different repository implementation." }),
      expected: "practicing",
    },
    {
      name: "transfer after delayed retrieval earns transferability",
      history: [assessment({ kind: "explanation" }), delayed()],
      next: assessment({
        id: "assessment-3",
        kind: "transfer",
        sessionId: "session-3",
        assessedAt: "2026-08-25T01:00:00.000Z",
        transferContext: "A different repository implementation.",
      }),
      expected: "transferable",
    },
  ])("derives the status ladder: $name", ({ history, next, expected }) => {
    const graph = buildLearningGraph([claim], history);

    const review = reviewCapabilityAssessment(graph, next);

    expect(review.decision.resultingStatus).toBe(expected);
  });

  it("requires delayed evidence to occur after the earlier assessment", () => {
    const graph = buildLearningGraph([claim], [assessment({ kind: "explanation" })]);

    const review = reviewCapabilityAssessment(graph, delayed({
      assessedAt: "2026-08-22T01:00:00.000Z",
    }));

    expect(review.decision.earnedStatus).toBe("practicing");
  });

  it("records partial evidence without automatically demoting earned capability", () => {
    const graph = buildLearningGraph([claim], [assessment({ kind: "explanation" }), delayed()]);

    const review = reviewCapabilityAssessment(graph, assessment({
      id: "assessment-3",
      outcome: "partial",
      demonstration: "The explanation missed the repository ownership rule.",
      sessionId: "session-3",
    }));

    expect(review.decision).toMatchObject({
      previousStatus: "understood",
      earnedStatus: null,
      resultingStatus: "understood",
    });
  });

  it("caps earned capability at the weakest prerequisite", () => {
    const graph = buildLearningGraph([], [
      assessment({ id: "prerequisite-assessment", conceptId: "prerequisite", kind: "explanation" }),
      assessment({ id: "concept-assessment", conceptId: "concept", kind: "trace" }),
    ], undefined, [
      { id: "prerequisite", label: "Prerequisite" },
      { id: "concept", label: "Concept", prerequisites: ["prerequisite"] },
    ]);

    const review = reviewCapabilityAssessment(graph, assessment({
      id: "transfer-assessment",
      conceptId: "concept",
      kind: "transfer",
      sessionId: "session-2",
      transferContext: "A different repository implementation.",
    }));

    expect(review.decision).toMatchObject({ earnedStatus: "introduced", resultingStatus: "introduced" });
    expect(review.decision.reasons).toContain("Prerequisites cap the earned status");
  });

  it("requires three independent consequential sessions and prior transfer for operational status", () => {
    const history = [
      assessment({ kind: "explanation" }),
      delayed(),
      assessment({
        id: "assessment-3",
        kind: "transfer",
        sessionId: "session-3",
        assessedAt: "2026-08-25T01:00:00.000Z",
        transferContext: "A different repository implementation.",
        consequentialWork: true,
      }),
      assessment({
        id: "assessment-4",
        kind: "diagnosis",
        sessionId: "session-4",
        assessedAt: "2026-08-26T01:00:00.000Z",
        consequentialWork: true,
      }),
    ];
    const graph = buildLearningGraph([claim], history);

    const review = reviewCapabilityAssessment(graph, assessment({
      id: "assessment-5",
      kind: "modification",
      sessionId: "session-5",
      assessedAt: "2026-08-27T01:00:00.000Z",
      consequentialWork: true,
    }));

    expect(review.decision.resultingStatus).toBe("operational");
  });

  it("does not count repeated explanations as operational project work", () => {
    const graph = buildLearningGraph([claim], [
      assessment({ kind: "explanation", consequentialWork: true }),
      assessment({ id: "assessment-2", kind: "explanation", sessionId: "session-2", consequentialWork: true }),
      assessment({ id: "assessment-3", kind: "explanation", sessionId: "session-3", consequentialWork: true }),
    ]);

    expect(graph.concepts[0]?.status).toBe("introduced");
  });

  it("uses an explicit later packet to correct status without rewriting history", () => {
    const graph = buildLearningGraph([claim], [assessment({ kind: "explanation" }), delayed()]);

    const review = reviewCapabilityAssessment(graph, assessment({
      id: "assessment-3",
      outcome: "partial",
      demonstration: "The earlier retrieval was incorrectly graded as independent.",
      sessionId: "review-session",
      assessedAt: "2026-08-25T01:00:00.000Z",
      supersedesPacketId: "assessment-2",
    }));

    expect(review.decision).toMatchObject({ previousStatus: "understood", resultingStatus: "introduced" });
    expect(review.graph.concepts[0]?.evidence.map((item) => item.id)).toEqual([
      "assessment-1",
      "assessment-2",
      "assessment-3",
    ]);
  });

  it("recomputes only the corrected concept while preserving unrelated capability", () => {
    const assessed = buildLearningGraph([claim], [assessment({ kind: "explanation" }), delayed()]);
    const graph = {
      ...assessed,
      concepts: [
        ...assessed.concepts,
        {
          id: "unrelated-concept",
          label: "Unrelated concept",
          aliases: [],
          status: "understood" as const,
          prerequisites: [],
          codeAnchors: [],
          sourceClaims: [],
          evidence: [],
        },
      ],
    };

    const review = reviewCapabilityAssessment(graph, assessment({
      id: "assessment-3",
      outcome: "partial",
      demonstration: "The earlier retrieval was incorrectly graded as independent.",
      sessionId: "review-session",
      assessedAt: "2026-08-25T01:00:00.000Z",
      supersedesPacketId: "assessment-2",
    }));

    expect(review.graph.concepts.find((concept) => concept.id === claim.conceptId)?.status).toBe("introduced");
    expect(review.graph.concepts.find((concept) => concept.id === "unrelated-concept")?.status).toBe("understood");
  });

  it("rejects malformed, duplicate, or chronologically invalid packets", () => {
    const incomplete = { ...assessment() } as Record<string, unknown>;
    delete incomplete.rubricVersion;
    expect(() => buildLearningGraph([claim], [incomplete as never])).toThrow(/rubricVersion/);

    expect(() => buildLearningGraph([], [
      assessment({ conceptId: "concept-a" }),
      assessment({ conceptId: "concept-b" }),
    ], undefined, [
      { id: "concept-a", label: "Concept A" },
      { id: "concept-b", label: "Concept B" },
    ])).toThrow(/Duplicate evidence packet/);

    const graph = buildLearningGraph([claim], [assessment({ kind: "explanation" })]);
    expect(() => reviewCapabilityAssessment(graph, assessment({
      id: "assessment-2",
      assessedAt: "2026-08-22T01:00:00.000Z",
      supersedesPacketId: "assessment-1",
    }))).toThrow(/must be later/);

    expect(() => reviewCapabilityAssessment(
      buildLearningGraph([claim], []),
      { ...assessment(), codeAnchors: undefined },
    )).toThrow(/codeAnchors or producedArtifact/);
  });

  it("treats the evidence ledger as authoritative while refreshing prerequisites", () => {
    const staleGenerated = buildLearningGraph([claim], [assessment({ kind: "explanation" })], undefined, [
      { id: "dependency-injection", label: "Dependency injection" },
    ]);

    const rebuilt = buildLearningGraph([claim], [], staleGenerated, [
      { id: "dependency-injection", label: "Dependency injection", prerequisites: ["typescript-object-access"] },
      { id: "typescript-object-access", label: "TypeScript object access" },
    ]);

    expect(rebuilt.concepts.find((concept) => concept.id === claim.conceptId)).toMatchObject({
      status: "seed",
      evidence: [],
      prerequisites: ["typescript-object-access"],
    });
  });
});
