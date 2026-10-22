import type { EventBus } from "../../kernel/index.ts";
import { Popped, Pushed, Transitioned } from "./events.ts";

export type StateId = string;

/**
 * All FSM runtime data is plain data, suitable for JSON, ECS components and saves.
 * The state machine holds no game objects.
 */
export type MachineData<S extends StateId = StateId> = {
  state: S;
  /** Time in the current state, in seconds accumulated from dt without reading a clock. */
  time: number;
  /** Previous states stacked on interruption. */
  stack: { state: S; time: number }[];
  /** Triggers to consume in this tick. */
  triggers: string[];
};

/** Durations may be fixed or context-derived, such as different enemy windups. */
export type Duration<C> = number | ((ctx: C) => number);

const resolveDuration = <C,>(value: Duration<C> | undefined, ctx: C): number =>
  typeof value === "function" ? value(ctx) : (value ?? 0);

export type Transition<C, S extends StateId> = {
  to: S;
  /** Event condition: this trigger was fired in the current tick. */
  on?: string;
  /** Evaluated each tick; must have no side effects. */
  when?: (ctx: C) => boolean;
  /** Seconds elapsed since entering the current state. */
  after?: Duration<C>;
  /** Force the transition regardless of minTime. */
  interrupt?: boolean;
};

export type StateDef<C, S extends StateId> = {
  /** Minimum residence time; only interrupt transitions can leave earlier. */
  minTime?: Duration<C>;
  enter?: (ctx: C) => void;
  exit?: (ctx: C) => void;
  update?: (ctx: C, dt: number) => void;
  transitions?: Transition<C, S>[];
};

export type MachineDef<C, S extends StateId = StateId> = {
  id: string;
  initial: S;
  states: Record<S, StateDef<C, S>>;
};

export type StepResult<S extends StateId> = { from: S; to: S } | null;

export function createMachine<C, S extends StateId>(def: MachineDef<C, S>): MachineData<S> {
  return { state: def.initial, time: 0, stack: [], triggers: [] };
}

/** Post a trigger for this tick; cleared after step. */
export function fire<S extends StateId>(data: MachineData<S>, trigger: string): void {
  if (!data.triggers.includes(trigger)) data.triggers.push(trigger);
}

export function is<S extends StateId>(data: MachineData<S>, state: S): boolean {
  return data.state === state;
}

/**
 * Advance one frame.
 * Order: current-state update → accumulate time → first matching declared transition → execute.
 * Triggers clear at tick end; events apply only to the current frame.
 */
export function step<C, S extends StateId>(
  def: MachineDef<C, S>,
  data: MachineData<S>,
  ctx: C,
  dt: number,
  bus?: EventBus,
): StepResult<S> {
  const current = def.states[data.state];
  if (!current) throw new Error(`Machine ${def.id} has no state ${data.state}`);

  current.update?.(ctx, dt);
  data.time += dt;

  const minTime = resolveDuration(current.minTime, ctx);
  let matched: Transition<C, S> | null = null;

  for (const t of current.transitions ?? []) {
    if (data.time < minTime && !t.interrupt) continue;
    if (t.on !== undefined) {
      if (!data.triggers.includes(t.on)) continue;
    } else if (t.when !== undefined) {
      if (!t.when(ctx)) continue;
    } else if (t.after !== undefined) {
      if (data.time < resolveDuration(t.after, ctx)) continue;
    } else {
      continue;
    }
    matched = t;
    break;
  }

  const result = matched ? applyTransition(def, data, matched.to, ctx) : null;
  data.triggers.length = 0;
  if (result && bus) bus.emit(Transitioned, { machine: def.id, from: result.from, to: result.to });
  return result;
}

/** Interrupt the current state, stack it and enter a new state. */
export function push<C, S extends StateId>(
  def: MachineDef<C, S>,
  data: MachineData<S>,
  state: S,
  ctx: C,
  bus?: EventBus,
): void {
  const from = data.state;
  def.states[data.state]?.exit?.(ctx);
  data.stack.push({ state: data.state, time: data.time });
  data.state = state;
  data.time = 0;
  def.states[state]?.enter?.(ctx);
  if (bus) bus.emit(Pushed, { machine: def.id, from, to: state });
}

/** Resume the stacked state without invoking enter again. */
export function pop<C, S extends StateId>(
  def: MachineDef<C, S>,
  data: MachineData<S>,
  ctx: C,
  bus?: EventBus,
): boolean {
  const prev = data.stack.pop();
  if (!prev) return false;
  const from = data.state;
  def.states[data.state]?.exit?.(ctx);
  data.state = prev.state;
  data.time = prev.time;
  if (bus) bus.emit(Popped, { machine: def.id, from, to: prev.state });
  return true;
}

export function reset<C, S extends StateId>(def: MachineDef<C, S>, data: MachineData<S>, ctx: C): void {
  def.states[data.state]?.exit?.(ctx);
  data.state = def.initial;
  data.time = 0;
  data.stack = [];
  data.triggers = [];
  def.states[def.initial]?.enter?.(ctx);
}

function applyTransition<C, S extends StateId>(
  def: MachineDef<C, S>,
  data: MachineData<S>,
  to: S,
  ctx: C,
): StepResult<S> {
  const from = data.state;
  def.states[from]?.exit?.(ctx);
  data.state = to;
  data.time = 0;
  const next = def.states[to];
  if (!next) throw new Error(`Machine ${def.id} transitioned to undefined state ${to}`);
  next.enter?.(ctx);
  return { from, to };
}
