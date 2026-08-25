// @ts-check

const HARNESS_ROOT = "src/development/learning-harness";
const HARNESS_NON_ENTRYPOINT = `^${HARNESS_ROOT}/(?!(learningHarness|teaching|taskContext|session|signals)\\.ts$)`;

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "learning-harness-entrypoints-only",
      comment: "Code outside the learning harness must import its root entry points, never private implementation files.",
      severity: "error",
      from: { pathNot: `^${HARNESS_ROOT}/` },
      to: { path: HARNESS_NON_ENTRYPOINT },
    },
    {
      name: "learning-harness-no-cycles",
      comment: "The learning-harness implementation must remain acyclic.",
      severity: "error",
      from: { path: `^${HARNESS_ROOT}/` },
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      extensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
    },
  },
};
