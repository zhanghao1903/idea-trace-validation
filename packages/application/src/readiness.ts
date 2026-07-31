export type ReadinessReason =
  "DATABASE_UNREACHABLE" | "MIGRATION_MISSING" | "MIGRATION_MISMATCH";

export type ReadinessState =
  | { status: "READY"; checkedAt: number }
  | { status: "NOT_READY"; reason: ReadinessReason; checkedAt: number };

export interface Readiness {
  probe(): Promise<ReadinessState>;
  current(maxAgeMs: number): Promise<ReadinessState>;
}
