export interface ValidationProject {
  id: string;
  ideaId: string;
  goal: string;
  phase: "PLANNING" | "BUILDING" | "VALIDATING" | "CONCLUDING";
  status: "QUEUED" | "IN_PROGRESS" | "PAUSED" | "COMPLETED";
  currentNextStep: string | null;
  latestProgressUpdateId: string | null;
  activeConclusionId: string | null;
  completedAt: string | null;
  completionKind: "COMPLETE" | "STOP" | "TRANSFER" | null;
  sourceIdeaVersion: number;
  version: number;
}

export const createValidationProject = (
  id: string,
  ideaId: string,
  goal: string,
  sourceIdeaVersion: number,
): ValidationProject => ({
  id,
  ideaId,
  goal,
  phase: "PLANNING",
  status: "QUEUED",
  currentNextStep: null,
  latestProgressUpdateId: null,
  activeConclusionId: null,
  completedAt: null,
  completionKind: null,
  sourceIdeaVersion,
  version: 1,
});
