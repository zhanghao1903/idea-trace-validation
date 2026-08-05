import { access, chmod, readFile, unlink } from "node:fs/promises";

import { canonicalJson, canonicalSha256 } from "./canonical-json.js";
import { parseProfile, type ClientConnectionProfileV1 } from "./contracts.js";
import { atomicWrite0600, withProfileLock } from "./safe-files.js";

const exists = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

export const profileIdentity = (
  profile: ClientConnectionProfileV1,
): unknown => ({
  baseUrl: profile.baseUrl,
  openapiUrl: profile.openapiUrl,
  releaseId: profile.releaseId,
  sourceCommit: profile.sourceCommit,
  skill: profile.skill,
  clientId: profile.clientId,
  displayName: profile.displayName,
  credential: profile.credential,
  declaredAiScopes: profile.declaredAiScopes,
});

export const deriveProfileId = (identity: unknown): string =>
  `profile_${canonicalSha256(identity).slice(0, 24)}`;

export interface StoreResult {
  profile: ClientConnectionProfileV1;
  changed: boolean;
}

export const storeProfile = async (input: {
  outputPath: string;
  candidate: ClientConnectionProfileV1;
  replace: boolean;
}): Promise<StoreResult> =>
  withProfileLock(input.outputPath, async () => {
    if (await exists(input.outputPath)) {
      let existing: ClientConnectionProfileV1;
      try {
        existing = parseProfile(
          JSON.parse(await readFile(input.outputPath, "utf8")),
        );
      } catch {
        throw new Error("PROFILE_INVALID");
      }
      if (
        canonicalSha256(profileIdentity(existing)) ===
        canonicalSha256(profileIdentity(input.candidate))
      ) {
        if (
          existing.validation.credentialUsability === "UNVERIFIED" &&
          input.candidate.validation.credentialUsability === "VERIFIED"
        ) {
          input.candidate.profileId = existing.profileId;
          input.candidate.profileRevision = existing.profileRevision;
          const upgraded = parseProfile(input.candidate);
          await atomicWrite0600(input.outputPath, canonicalJson(upgraded));
          return { profile: upgraded, changed: true };
        }
        await chmod(input.outputPath, 0o600);
        return { profile: existing, changed: false };
      }
      if (!input.replace) throw new Error("PROFILE_UPDATE_REQUIRED");
      input.candidate.profileRevision = existing.profileRevision + 1;
    }
    input.candidate.profileId = deriveProfileId(
      profileIdentity(input.candidate),
    );
    const validated = parseProfile(input.candidate);
    await atomicWrite0600(input.outputPath, canonicalJson(validated));
    return { profile: validated, changed: true };
  });

export const removeProfile = async (outputPath: string): Promise<boolean> =>
  withProfileLock(outputPath, async () => {
    if (!(await exists(outputPath))) return false;
    parseProfile(JSON.parse(await readFile(outputPath, "utf8")));
    await unlink(outputPath);
    return true;
  });
