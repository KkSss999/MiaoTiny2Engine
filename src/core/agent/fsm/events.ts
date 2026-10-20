import { defineEvent } from "#core/kernel/index.ts";

export type TransitionInfo = { machine: string; from: string; to: string };

/** 状态转移广播：逻辑只负责转移，表现/埋点/调试订阅它 */
export const Transitioned = defineEvent<TransitionInfo>("fsm:Transitioned");
export const Pushed = defineEvent<TransitionInfo>("fsm:Pushed");
export const Popped = defineEvent<TransitionInfo>("fsm:Popped");
