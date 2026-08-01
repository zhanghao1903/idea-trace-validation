import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { FullConfig } from "@playwright/test";

const repoRoot = path.resolve(
  fileURLToPath(new URL("../../..", import.meta.url)),
);
const statePath = path.join(repoRoot, ".lp04-demo/browser-state.json");

export default async function globalSetup(_config: FullConfig): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const state = JSON.parse(await readFile(statePath, "utf8")) as {
        origin: string;
        resourceRefs: Record<string, string>;
      };
      const projectId = state.resourceRefs.activeProjectId;
      if (state.origin !== "http://127.0.0.1:4174" || projectId === undefined)
        throw new Error("LP04_BROWSER_STATE_INVALID");
      const response = await fetch(
        new URL(`/api/v1/projects/${projectId}`, state.origin),
      );
      if (response.status === 200) return;
    } catch {
      // The dedicated server may be listening while synthetic setup is still running.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("LP04_BROWSER_SETUP_TIMEOUT");
}
