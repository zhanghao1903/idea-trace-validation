import {
  canonicalJson,
  canonicalSha256,
  sha256,
} from "../shared/canonical-json.js";
import {
  verifyDeploymentAuthorizationEnvelope,
  type JsonRecord,
} from "../shared/contracts.js";
import { atomicWrite } from "../shared/filesystem.js";

export const proposalSha256 = (proposal: JsonRecord): string =>
  sha256(canonicalJson(proposal));

export const finalizeAuthorizationEnvelope = (input: {
  proposal: JsonRecord;
  authorization: JsonRecord;
  createdAt: string;
}): JsonRecord => {
  const envelope: JsonRecord = {
    schemaVersion: "1.0",
    envelopeId: "auth_00000000000000000000000000000000",
    envelopeSha256: "",
    proposal: input.proposal,
    proposalSha256: proposalSha256(input.proposal),
    authorization: input.authorization,
    createdAt: input.createdAt,
  };
  envelope.envelopeSha256 = canonicalSha256(envelope, [
    "envelopeId",
    "envelopeSha256",
  ]);
  envelope.envelopeId = `auth_${String(envelope.envelopeSha256).slice(0, 32)}`;
  verifyDeploymentAuthorizationEnvelope(envelope, new Date(input.createdAt));
  return envelope;
};

export const writeAuthorizationEnvelope = async (
  path: string,
  envelope: unknown,
): Promise<void> => {
  verifyDeploymentAuthorizationEnvelope(envelope);
  await atomicWrite(path, canonicalJson(envelope), 0o600);
};
