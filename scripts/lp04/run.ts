import path from "node:path";

import { loadDemoEnvironment } from "./environment.js";
import { DemoScenarioRunner } from "./scenario.js";

const argument = (name: string): string => {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];
  if (value === undefined || value.startsWith("--"))
    throw new Error(`ARGUMENT_REQUIRED:${name}`);
  return value;
};

const repoRoot = path.resolve(import.meta.dirname, "../..");
const environment = loadDemoEnvironment({
  baseUrl: argument("--base-url"),
  runId: argument("--run-id"),
  skillCommitSha: argument("--skill-commit"),
});
const runner = await DemoScenarioRunner.create({
  repoRoot,
  proofRoot: path.join(repoRoot, ".lp04-demo"),
  ...environment,
});
const record = await runner.run();
console.log(
  JSON.stringify({
    runId: record.runId,
    phase: record.phase,
    result: record.result,
    resourceCount: Object.keys(record.resourceRefs).length,
    requestCount: record.requestTrace.length,
  }),
);
