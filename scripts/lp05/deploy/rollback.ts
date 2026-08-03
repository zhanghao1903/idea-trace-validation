import type { JsonRecord } from "../shared/contracts.js";

export interface RollbackAdapter {
  disableIngress(): Promise<void>;
  restorePreviousRelease(previous: JsonRecord): Promise<void>;
  verifyReadiness(): Promise<string>;
  verifyCoreReads(): Promise<string>;
}

export const rollbackApplication = async (input: {
  previousRelease: JsonRecord | null;
  adapter: RollbackAdapter;
  startedAt?: Date;
}): Promise<JsonRecord> => {
  const startedAt = input.startedAt ?? new Date();
  await input.adapter.disableIngress();
  if (input.previousRelease === null) {
    return {
      status: "NOT_APPLICABLE",
      reasonCode: "FRESH_INSTALL_INGRESS_DISABLED",
      previousRelease: null,
      readinessSha256: null,
      smokeSha256: null,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
    };
  }
  await input.adapter.restorePreviousRelease(input.previousRelease);
  const readinessSha256 = await input.adapter.verifyReadiness();
  const smokeSha256 = await input.adapter.verifyCoreReads();
  return {
    status: "PASS",
    reasonCode: "PREVIOUS_RELEASE_RESTORED",
    previousRelease: input.previousRelease,
    readinessSha256,
    smokeSha256,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
  };
};
