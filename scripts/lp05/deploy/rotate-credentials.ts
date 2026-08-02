import { chmod, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { assertContainedPath } from "../shared/filesystem.js";

export interface RotationAdapter {
  restartApp(): Promise<void>;
  verifyAiCredential(
    value: string,
    expected: "ACCEPT" | "REJECT",
  ): Promise<void>;
  verifyHumanCredential(
    value: string,
    expected: "ACCEPT" | "REJECT",
  ): Promise<void>;
}

export const rotateCredentials = async (input: {
  secretsRoot: string;
  nextAi: string;
  nextHuman: string;
  adapter: RotationAdapter;
}): Promise<void> => {
  if (
    input.nextAi.length < 32 ||
    !/^[A-Za-z0-9_-]{43}$/u.test(input.nextHuman) ||
    input.nextAi === input.nextHuman
  )
    throw new Error("ROTATION_SECRET_POLICY");
  const aiPath = await assertContainedPath(
    input.secretsRoot,
    join(input.secretsRoot, "ai_api_token"),
  );
  const humanPath = await assertContainedPath(
    input.secretsRoot,
    join(input.secretsRoot, "human_control_token"),
  );
  const [oldAi, oldHuman] = await Promise.all([
    readFile(aiPath, "utf8"),
    readFile(humanPath, "utf8"),
  ]);
  const aiNext = `${aiPath}.next`;
  const humanNext = `${humanPath}.next`;
  await Promise.all([
    writeFile(aiNext, input.nextAi, { mode: 0o644, flag: "wx" }),
    writeFile(humanNext, input.nextHuman, { mode: 0o644, flag: "wx" }),
  ]);
  await Promise.all([chmod(aiNext, 0o644), chmod(humanNext, 0o644)]);
  try {
    await rename(aiNext, aiPath);
    await rename(humanNext, humanPath);
    await input.adapter.restartApp();
    await input.adapter.verifyAiCredential(oldAi.trim(), "REJECT");
    await input.adapter.verifyAiCredential(input.nextAi, "ACCEPT");
    await input.adapter.verifyHumanCredential(oldHuman.trim(), "REJECT");
    await input.adapter.verifyHumanCredential(input.nextHuman, "ACCEPT");
  } catch (error) {
    await Promise.all([
      writeFile(aiPath, oldAi, { mode: 0o644 }),
      writeFile(humanPath, oldHuman, { mode: 0o644 }),
    ]);
    await input.adapter.restartApp();
    throw error;
  }
};
