import { spawnSync } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";

for (const gate of ["1", "2", "3"] as const) {
  run(["run", "verify:component-topology-foundation", "--", `--gate=${gate}`]);
}

run(["test"]);
run(["run", "typecheck"]);
console.log("Component topology foundation completion path passed.");

function run(args: string[]): void {
  const result = spawnSync(npm, args, { cwd: process.cwd(), stdio: "inherit", shell: false });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
