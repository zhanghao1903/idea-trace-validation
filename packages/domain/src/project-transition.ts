import { DomainError, versionConflict } from "./errors.js";

export type ProjectPhase =
  "PLANNING" | "BUILDING" | "VALIDATING" | "CONCLUDING";
export type ProjectStatus = "QUEUED" | "IN_PROGRESS" | "PAUSED" | "COMPLETED";

export interface ProjectExecutionState {
  id: string;
  phase: ProjectPhase;
  status: ProjectStatus;
  version: number;
}

export type ExecutionTransition =
  | { transition: "START"; nextStep: string }
  | { transition: "PAUSE"; explanation: string }
  | { transition: "RESUME"; explanation: string; nextStep: string }
  | {
      transition: "CHANGE_PHASE";
      targetPhase: ProjectPhase;
      nextStep: string;
    };

const allowedTransitions = (status: ProjectStatus): string[] => {
  switch (status) {
    case "QUEUED":
      return ["START", "PAUSE"];
    case "IN_PROGRESS":
      return ["PAUSE", "CHANGE_PHASE"];
    case "PAUSED":
      return ["RESUME"];
    case "COMPLETED":
      return [];
  }
};

export const assertProjectExpectedVersion = (
  state: ProjectExecutionState,
  expectedVersion: number,
): void => {
  if (state.version !== expectedVersion) {
    throw versionConflict(state.id, expectedVersion, state.version);
  }
};

export const applyExecutionTransition = (
  state: ProjectExecutionState,
  input: ExecutionTransition,
): {
  status: ProjectStatus;
  phase: ProjectPhase;
  nextStep: string | null;
  explanation: string;
} => {
  if (!allowedTransitions(state.status).includes(input.transition)) {
    throw new DomainError(
      "PROJECT_STATE_CONFLICT",
      "The transition is not allowed from the current project status.",
      {
        projectId: state.id,
        currentStatus: state.status,
        allowedTransitions: allowedTransitions(state.status),
        recovery: "REFETCH_AND_RETRY_WITH_NEW_KEY",
      },
    );
  }
  if (
    input.transition === "CHANGE_PHASE" &&
    input.targetPhase === state.phase
  ) {
    throw new DomainError(
      "PHASE_TRANSITION_INVALID",
      "The target phase must differ from the current phase.",
      {
        projectId: state.id,
        currentPhase: state.phase,
        targetPhase: input.targetPhase,
        recovery: "CHOOSE_VALID_PHASE",
      },
    );
  }
  switch (input.transition) {
    case "START":
      return {
        status: "IN_PROGRESS",
        phase: state.phase,
        nextStep: input.nextStep,
        explanation: "Execution started.",
      };
    case "PAUSE":
      return {
        status: "PAUSED",
        phase: state.phase,
        nextStep: null,
        explanation: input.explanation,
      };
    case "RESUME":
      return {
        status: "IN_PROGRESS",
        phase: state.phase,
        nextStep: input.nextStep,
        explanation: input.explanation,
      };
    case "CHANGE_PHASE":
      return {
        status: state.status,
        phase: input.targetPhase,
        nextStep: input.nextStep,
        explanation: `Phase changed from ${state.phase} to ${input.targetPhase}.`,
      };
  }
};
