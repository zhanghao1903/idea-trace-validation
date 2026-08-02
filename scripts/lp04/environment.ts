import { validRunId } from "./request-identity.js";

export interface DemoEnvironment {
  baseOrigin: string;
  runId: string;
  skillCommitSha: string;
  aiToken: string;
}

export const normalizeLoopbackOrigin = (input: string): string => {
  const url = new URL(input);
  if (url.protocol !== "http:") throw new Error("DEMO_ORIGIN_PROTOCOL");
  if (url.username !== "" || url.password !== "")
    throw new Error("DEMO_ORIGIN_USERINFO");
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
    throw new Error("DEMO_ORIGIN_NOT_LOOPBACK");
  if (url.pathname !== "/" || url.search !== "" || url.hash !== "")
    throw new Error("DEMO_ORIGIN_SUFFIX");
  return url.origin;
};

export const loadDemoEnvironment = (input: {
  baseUrl: string;
  runId: string;
  skillCommitSha: string;
  env?: NodeJS.ProcessEnv;
}): DemoEnvironment => {
  if (!validRunId(input.runId)) throw new Error("RUN_ID_INVALID");
  if (!/^[a-f0-9]{40}$/u.test(input.skillCommitSha))
    throw new Error("SKILL_COMMIT_INVALID");
  const aiToken = (input.env ?? process.env).AI_API_TOKEN;
  if (aiToken === undefined || aiToken.length < 32)
    throw new Error("AI_API_TOKEN_REQUIRED");
  return {
    baseOrigin: normalizeLoopbackOrigin(input.baseUrl),
    runId: input.runId,
    skillCommitSha: input.skillCommitSha,
    aiToken,
  };
};
