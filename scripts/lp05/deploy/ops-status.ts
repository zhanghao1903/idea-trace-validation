export interface OperationsObservation {
  appHealthy: boolean;
  databaseHealthy: boolean;
  restartCount: number;
  certificateDaysRemaining: number;
  freeBytes: number;
  minimumFreeBytes: number;
  newestBackupAgeHours: number;
  backupTimerPassed: boolean;
  lastSmokePassed: boolean;
  observedAt: string;
}

export const evaluateOperations = (
  observation: OperationsObservation,
): { status: "PASS" | "FAIL"; reasonCodes: string[]; observedAt: string } => {
  const reasonCodes: string[] = [];
  if (!observation.appHealthy) reasonCodes.push("APP_UNHEALTHY");
  if (!observation.databaseHealthy) reasonCodes.push("DATABASE_UNHEALTHY");
  if (observation.restartCount > 3) reasonCodes.push("RESTART_LOOP");
  if (observation.certificateDaysRemaining < 14)
    reasonCodes.push("CERTIFICATE_EXPIRY_RISK");
  if (observation.freeBytes < observation.minimumFreeBytes)
    reasonCodes.push("DISK_SPACE_LOW");
  if (observation.newestBackupAgeHours > 36) reasonCodes.push("BACKUP_STALE");
  if (!observation.backupTimerPassed) reasonCodes.push("BACKUP_TIMER_FAILED");
  if (!observation.lastSmokePassed) reasonCodes.push("SMOKE_FAILED");
  return {
    status: reasonCodes.length === 0 ? "PASS" : "FAIL",
    reasonCodes,
    observedAt: observation.observedAt,
  };
};
