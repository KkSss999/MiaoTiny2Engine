import { defineEvent } from "../../kernel/index.ts";

export type TransitionInfo = { machine: string; from: string; to: string };

/** Broadcast state transitions; presentation, instrumentation and debugging subscribe separately. */
export const Transitioned = defineEvent<TransitionInfo>("fsm:Transitioned");
export const Pushed = defineEvent<TransitionInfo>("fsm:Pushed");
export const Popped = defineEvent<TransitionInfo>("fsm:Popped");
