export const WORKSPACE_ID = "workspace_default";

export type ActorType = "HUMAN" | "AI" | "SYSTEM";
export type ActorRole = "PROPOSER" | "EXECUTOR" | "MAINTAINER" | "SYSTEM";
export type IdeaIntakeStatus = "IDEA" | "NEEDS_CLARIFICATION";
export type StatementKind = "FACT" | "HYPOTHESIS";
export type ClarificationTarget =
  "DESIRED_OUTCOME" | "HYPOTHESIS" | "FACT" | "OTHER";

export interface DeclaredActor {
  actorType: ActorType;
  role: ActorRole;
  displayName: string;
  client: string | null;
  onBehalfOfRole: Exclude<ActorRole, "SYSTEM"> | null;
}

export interface CurrentStatement {
  id: string;
  kind: StatementKind;
  text: string;
}

export interface OpenQuestion {
  id: string;
  targetField: ClarificationTarget;
}

export interface IdeaState {
  id: string;
  desiredOutcome: string | null;
  intakeStatus: IdeaIntakeStatus;
  version: number;
  projectId: string | null;
}
