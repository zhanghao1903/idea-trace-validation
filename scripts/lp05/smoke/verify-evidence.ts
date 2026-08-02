import { readFile } from "node:fs/promises";

import {
  verifyCrossRecordEquality,
  verifyDeploymentEvidence,
  type CandidateIdentityV1,
  type JsonRecord,
} from "../shared/contracts.js";

export interface EvidenceBundleV1 {
  finalEvidence: JsonRecord;
  candidate: CandidateIdentityV1;
  targetId: string;
  initialSmoke: JsonRecord;
  postDeployBackup: JsonRecord;
  restore: JsonRecord;
  postRestoreSmoke: JsonRecord;
}

export const verifyEvidenceBundle = (bundle: EvidenceBundleV1): void => {
  const finalEvidence = verifyDeploymentEvidence(bundle.finalEvidence);
  verifyCrossRecordEquality(bundle);
  if (
    (finalEvidence.candidate as JsonRecord).manifestSha256 !==
      bundle.candidate.manifestSha256 ||
    (finalEvidence.target as JsonRecord).targetId !== bundle.targetId ||
    (finalEvidence.initialSmoke as JsonRecord).smokeSha256 !==
      bundle.initialSmoke.smokeSha256 ||
    (finalEvidence.postDeployBackup as JsonRecord).backupManifestSha256 !==
      bundle.postDeployBackup.backupManifestSha256 ||
    (finalEvidence.restoreEvidence as JsonRecord).restoreEvidenceSha256 !==
      bundle.restore.restoreEvidenceSha256 ||
    (finalEvidence.postRestoreSmoke as JsonRecord).smokeSha256 !==
      bundle.postRestoreSmoke.smokeSha256
  )
    throw new Error("DEPLOYMENT_EVIDENCE_REFERENCE_MISMATCH");
};

const main = async (): Promise<void> => {
  const index = process.argv.indexOf("--bundle");
  const path = index >= 0 ? process.argv[index + 1] : undefined;
  if (path === undefined) throw new Error("EVIDENCE_BUNDLE_REQUIRED");
  verifyEvidenceBundle(
    JSON.parse(await readFile(path, "utf8")) as EvidenceBundleV1,
  );
  process.stdout.write("LP05_DEPLOYMENT_EVIDENCE_PASS\n");
};

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "EVIDENCE_VERIFY_FAILED"}\n`,
    );
    process.exitCode = 1;
  });
}
