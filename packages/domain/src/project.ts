export interface ValidationProject {
  id: string;
  ideaId: string;
  goal: string;
  phase: "PLANNING";
  status: "QUEUED";
  sourceIdeaVersion: number;
  version: 1;
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
  sourceIdeaVersion,
  version: 1,
});
