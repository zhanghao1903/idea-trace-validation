import path from "node:path";

import { loadDemoEnvironment } from "../environment.js";
import { DemoScenarioRunner } from "../scenario.js";

const required = (name: string): string => {
  const value = process.env[name];
  if (value === undefined || value.length === 0)
    throw new Error(`${name}_REQUIRED`);
  return value;
};

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const environment = loadDemoEnvironment({
  baseUrl: required("LP04_BASE_URL"),
  runId: required("LP04_RUN_ID"),
  skillCommitSha: required("LP04_SKILL_COMMIT"),
});
const runner = await DemoScenarioRunner.create({
  repoRoot,
  proofRoot: required("LP04_PROOF_ROOT"),
  ...environment,
});
await runner.run();
