import { readJson } from "./http-client.js";

interface PublicVerificationInput {
  baseOrigin: string;
  resourceRefs: Record<string, string>;
  fetchImpl?: typeof fetch | undefined;
}

const dataObject = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("PUBLIC_VERIFY_DATA_INVALID");
  const data = (value as Record<string, unknown>).data;
  if (typeof data !== "object" || data === null || Array.isArray(data))
    throw new Error("PUBLIC_VERIFY_DATA_INVALID");
  return data as Record<string, unknown>;
};

const containsExact = (value: unknown, expected: string): boolean => {
  if (value === expected) return true;
  if (Array.isArray(value))
    return value.some((item) => containsExact(item, expected));
  if (typeof value !== "object" || value === null) return false;
  return Object.values(value).some((item) => containsExact(item, expected));
};

const projectFor = (name: string, refs: Record<string, string>): string => {
  const prefix = /^(active|governed)/u.exec(name)?.[1];
  if (prefix !== undefined) {
    const project = refs[`${prefix}ProjectId`];
    if (project !== undefined) return project;
  }
  if (/^(?:blocker|decision|support)/u.test(name)) {
    const project = refs.activeProjectId;
    if (project !== undefined) return project;
  }
  const projects = Object.entries(refs)
    .filter(([key]) => key.endsWith("ProjectId"))
    .map(([, value]) => value);
  const unique = [...new Set(projects)];
  if (unique.length === 1 && unique[0] !== undefined) return unique[0];
  throw new Error(`PUBLIC_VERIFY_PROJECT_BINDING:${name}`);
};

const collectionPath = (name: string, projectId: string): string | null => {
  if (name.endsWith("EvidenceId"))
    return `/api/v1/projects/${projectId}/evidence`;
  if (name.endsWith("ProgressId"))
    return `/api/v1/projects/${projectId}/progress-updates`;
  if (name.endsWith("AttentionId"))
    return `/api/v1/projects/${projectId}/attention-items`;
  if (name.endsWith("ConclusionId"))
    return `/api/v1/projects/${projectId}/conclusions`;
  if (name.endsWith("TransitionId") || name.endsWith("ConfirmationId"))
    return `/api/v1/projects/${projectId}/history`;
  return null;
};

const verifyDirect = async (
  input: PublicVerificationInput,
  path: string,
  expected: string,
): Promise<void> => {
  const response = await readJson({
    baseOrigin: input.baseOrigin,
    path,
    fetchImpl: input.fetchImpl,
  });
  if (response.status !== 200 || !containsExact(response.json, expected))
    throw new Error(`PUBLIC_VERIFY_FAILED:${path}:${expected}`);
};

const verifyCollection = async (
  input: PublicVerificationInput,
  path: string,
  expected: string,
): Promise<void> => {
  let cursor: string | undefined;
  const seen = new Set<string>();
  for (let pageNumber = 0; pageNumber < 100; pageNumber += 1) {
    const query = new URLSearchParams({ limit: "100" });
    if (cursor !== undefined) query.set("cursor", cursor);
    const response = await readJson({
      baseOrigin: input.baseOrigin,
      path: `${path}?${query.toString()}`,
      fetchImpl: input.fetchImpl,
    });
    if (response.status !== 200)
      throw new Error(`PUBLIC_VERIFY_FAILED:${path}:${expected}`);
    const data = dataObject(response.json);
    if (!Array.isArray(data.items))
      throw new Error(`PUBLIC_VERIFY_COLLECTION:${path}`);
    if (data.items.some((item) => containsExact(item, expected))) return;
    const page = data.page;
    if (typeof page !== "object" || page === null || Array.isArray(page))
      throw new Error(`PUBLIC_VERIFY_PAGE:${path}`);
    const next = (page as Record<string, unknown>).nextCursor;
    if (next === null) break;
    if (typeof next !== "string" || next.length === 0 || seen.has(next))
      throw new Error(`PUBLIC_VERIFY_CURSOR:${path}`);
    seen.add(next);
    cursor = next;
  }
  throw new Error(`PUBLIC_VERIFY_MISSING:${path}:${expected}`);
};

export const verifyPublicResources = async (
  input: PublicVerificationInput,
): Promise<{ readCount: number }> => {
  if (Object.keys(input.resourceRefs).length === 0)
    throw new Error("PUBLIC_VERIFY_REFS_EMPTY");
  let readCount = 0;
  for (const [name, id] of Object.entries(input.resourceRefs)) {
    if (name.endsWith("IdeaId")) {
      await verifyDirect(input, `/api/v1/ideas/${id}`, id);
      readCount += 1;
      continue;
    }
    if (name.endsWith("ProjectId")) {
      await verifyDirect(input, `/api/v1/projects/${id}`, id);
      readCount += 1;
      continue;
    }
    if (name.endsWith("ReportId")) {
      const projectId = projectFor(name, input.resourceRefs);
      await verifyDirect(
        input,
        `/api/v1/projects/${projectId}/reports/current`,
        id,
      );
      readCount += 1;
      continue;
    }
    const projectId = projectFor(name, input.resourceRefs);
    const path = collectionPath(name, projectId);
    if (path === null) throw new Error(`PUBLIC_VERIFY_REF_UNSUPPORTED:${name}`);
    await verifyCollection(input, path, id);
    readCount += 1;
  }
  if (
    Object.keys(input.resourceRefs).length > 0 &&
    readCount !== Object.keys(input.resourceRefs).length
  )
    throw new Error("PUBLIC_VERIFY_INCOMPLETE");
  return { readCount };
};

export const exactValuePresent = containsExact;
