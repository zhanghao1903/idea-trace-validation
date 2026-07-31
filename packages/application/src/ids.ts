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
  transition: () => `trn_${nextUlid()}`,
  progress: () => `prog_${nextUlid()}`,
  attention: () => `attn_${nextUlid()}`,
  attentionEvent: () => `atnevt_${nextUlid()}`,
  evidence: () => `evd_${nextUlid()}`,
  conclusion: () => `conc_${nextUlid()}`,
  confirmation: () => `confirm_${nextUlid()}`,
  request: () => `req_${nextUlid()}`,
});

export type IdFactory = ReturnType<typeof createIdFactory>;
