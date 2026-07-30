import { monotonicFactory } from "ulid";

const nextUlid = monotonicFactory();

export const createIdFactory = () => ({
  idea: () => `idea_${nextUlid()}`,
  project: () => `proj_${nextUlid()}`,
  statement: () => `stmt_${nextUlid()}`,
  question: () => `ques_${nextUlid()}`,
  answer: () => `ans_${nextUlid()}`,
  hypothesis: () => `hyp_${nextUlid()}`,
  event: () => `evt_${nextUlid()}`,
  request: () => `req_${nextUlid()}`,
});

export type IdFactory = ReturnType<typeof createIdFactory>;
